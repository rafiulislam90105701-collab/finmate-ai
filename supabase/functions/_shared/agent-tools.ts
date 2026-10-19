export type AgentCategory = { id: string; name: string };
export type AgentBudget = { id: string; category_id: string; amount_minor: number };
export type AgentBill = { name: string; amount_minor: number; due_date: string; paid_at: string | null };
export type AgentGoal = { name: string; target_minor: number; saved_minor: number; target_date: string | null };

function safeMinor(value: number) {
  return Number.isSafeInteger(value) && value >= 0 ? value : 0;
}

const TOOL_ARGUMENT_KEYS: Record<string, string[]> = {
  get_financial_summary: [],
  get_category_spending: ["category_name"],
  get_recent_transactions: ["limit"],
  get_upcoming_bills: ["limit"],
  calculate_forecast: [],
  get_budget_status: ["category_name"],
  get_savings_goals: ["goal_name"],
  simulate_budget_scenario: [],
  propose_budget_change: [],
  explain_financial_risk: [],
};

// Every currently exposed argument is optional. Groq sometimes serializes an
// absent optional string as null; normalize it to omission before validation.
const OPTIONAL_TOOL_ARGUMENT_KEYS: Record<string, string[]> = {
  get_category_spending: ["category_name"],
  get_recent_transactions: ["limit"],
  get_upcoming_bills: ["limit"],
  get_budget_status: ["category_name"],
  get_savings_goals: ["goal_name"],
};

export const BUDGET_STATUS_TOOL_SCHEMA: {
  name: string;
  description: string;
  properties: { category_name: { type: ["string", "null"] } };
  required: string[];
} = {
  name: "get_budget_status",
  description: "Read budget status. If the user asks about budgets overall, omit category_name entirely (do not use null). Include category_name only when the user names one category.",
  // GPT-OSS can emit null for an optional argument. Accept it at provider
  // validation, then parseFinanceToolArguments normalizes it to omission.
  properties: { category_name: { type: ["string", "null"] } },
  required: [],
};

function safeProviderField(value: unknown, maxLength = 100): string | null {
  return typeof value === "string" && value.length <= maxLength && /^[A-Za-z0-9_./:-]+$/.test(value)
    ? value
    : null;
}

/** Build a privacy-limited log record; never include prompts, args, or response bodies. */
export function buildGroqFailureLog(status: number, requestId: string | null, payload: unknown) {
  const root = payload && typeof payload === "object" ? payload as Record<string, unknown> : {};
  const error = root.error && typeof root.error === "object" ? root.error as Record<string, unknown> : {};
  const rawMessage = typeof error.message === "string" ? error.message.trim() : "";
  const schemaError = rawMessage.match(/^parameters for tool ([a-z][a-z0-9_]{0,63}) did not match schema:\s*errors:\s*\[([a-z0-9_./:,\s-]{1,240})\]$/i);
  const genericToolError = /^invalid tool call generated$/i.test(rawMessage)
    ? "Invalid tool call generated"
    : /^failed to call a function\./i.test(rawMessage)
      ? "Failed to call a function"
      : null;
  const safeMessage = schemaError
    ? `parameters for tool ${schemaError[1]} did not match schema: errors: [${schemaError[2].trim()}]`
    : genericToolError;

  return {
    event: "groq_request_failed",
    status: Number.isInteger(status) ? status : null,
    model: "openai/gpt-oss-120b",
    request_id: safeProviderField(requestId, 120),
    provider_error: {
      type: safeProviderField(error.type),
      code: safeProviderField(error.code),
      param: safeProviderField(error.param),
      message: safeMessage,
      message_redacted: Boolean(rawMessage && !safeMessage),
    },
  };
}

/** Strictly parse only the small, read-only tool arguments the agent supports. */
export function parseFinanceToolArguments(name: string, raw: string): Record<string, unknown> | null {
  const allowed = TOOL_ARGUMENT_KEYS[name];
  if (!allowed) return null;
  let value: unknown;
  try { value = JSON.parse(raw); } catch { return null; }
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const args = { ...(value as Record<string, unknown>) };
  if (Object.keys(args).some((key) => !allowed.includes(key))) return null;
  for (const key of OPTIONAL_TOOL_ARGUMENT_KEYS[name] ?? []) {
    if (args[key] === null) delete args[key];
  }
  if ("category_name" in args && (typeof args.category_name !== "string" || args.category_name.trim().length > 60)) return null;
  if ("goal_name" in args && (typeof args.goal_name !== "string" || args.goal_name.trim().length > 120)) return null;
  if ("limit" in args && (!Number.isInteger(args.limit) || (args.limit as number) < 1 || (args.limit as number) > 10)) return null;
  return args;
}

/** Missing, null, or blank category means the caller requested all budgets. */
export function filterBudgetStatus<T extends { category: string }>(items: T[], categoryName: unknown): T[] {
  const category = typeof categoryName === "string" ? categoryName.trim().toLocaleLowerCase("en-US") : "";
  return category ? items.filter((item) => item.category.toLocaleLowerCase("en-US") === category) : items;
}



export type AgentBudgetStatusRow = {
  category: string;
  amountMinor: number;
  spentMinor: number;
  unpaidBillsMinor: number;
  remainingMinor: number;
};

/**
 * Return a deterministic answer for budget-status questions from recorded data.
 * Return null for other questions so advice/scenario requests can still use the AI.
 */
export function buildDeterministicBudgetStatusAnswer(
  question: string,
  month: string,
  currency: string,
  categories: string[],
  budgets: AgentBudgetStatusRow[],
): string | null {
  const lower = question.trim().toLocaleLowerCase("en-US");
  const mentionsBudget = /\bbudgets?\b/.test(lower);
  const asksStatus = /\b(status|overall|all categories|categories|category|limit|allocation|allocated|remaining|left|spent|spending|show|check|list|how much|what|this month|current month)\b/.test(lower);
  const asksForChange = /\b(change|adjust|increase|decrease|reduce|cut|lower|create|update|propose|proposal|recommend|suggest|should i|how can i|what if|scenario|set up|set a budget)\b/.test(lower);
  // Travel planning can mention a budget without asking about saved allocations.
  const asksForPlanning = /\b(plan|planning|trip|tour|travel|traveling|travelling|itinerary|destination|accommodation|hotel|sightseeing|transportation|transport|vacation|holiday|traveler|travelers|traveller|travellers|day-by-day|emergency reserve|return home)\b/.test(lower);
  if (!mentionsBudget || !asksStatus || asksForChange || asksForPlanning) return null;

  const parsedMonth = /^\d{4}-(0[1-9]|1[0-2])$/.test(month) ? new Date(month + "-01T12:00:00Z") : null;
  const monthLabel = parsedMonth && !Number.isNaN(parsedMonth.getTime())
    ? new Intl.DateTimeFormat("en", { month: "long", year: "numeric", timeZone: "UTC" }).format(parsedMonth)
    : "the selected month";
  const mentionedCategory = categories.find((category) =>
    category.trim() && lower.includes(category.toLocaleLowerCase("en-US"))
  );
  const categoryBudget = mentionedCategory
    ? budgets.find((item) => item.category.toLocaleLowerCase("en-US") === mentionedCategory.toLocaleLowerCase("en-US"))
    : undefined;

  if (mentionedCategory && !categoryBudget) {
    return "No budget limit is set for " + mentionedCategory + " in " + monthLabel +
      ". No budget allocation is recorded for that category; this does not mean your income or spending is zero.";
  }

  const rows = mentionedCategory && categoryBudget ? [categoryBudget] : budgets;
  if (!rows.length) {
    return "No budget categories or limits are set for " + monthLabel +
      ". No budget allocations are recorded; this does not mean your income or spending is zero. " +
      "Set a budget for each category you want to track.";
  }

  const formatMoney = (minor: number) => new Intl.NumberFormat("en-BD", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(safeMinor(minor) / 100);
  const lineFor = (row: AgentBudgetStatusRow) => {
    const amount = safeMinor(row.amountMinor);
    const spent = safeMinor(row.spentMinor);
    const unpaid = safeMinor(row.unpaidBillsMinor);
    const over = Math.max(0, spent + unpaid - amount);
    return row.category + ": allocated " + formatMoney(amount) +
      "; recorded spending " + formatMoney(spent) +
      "; unpaid bills " + formatMoney(unpaid) +
      "; remaining " + formatMoney(row.remainingMinor) +
      (over > 0 ? "; over limit by " + formatMoney(over) : "") + ".";
  };

  if (mentionedCategory && categoryBudget) {
    return "Budget status for " + mentionedCategory + " in " + monthLabel + ": " + lineFor(categoryBudget);
  }

  const total = (field: "amountMinor" | "spentMinor" | "unpaidBillsMinor" | "remainingMinor") =>
    rows.reduce((sum, row) => sum + safeMinor(row[field]), 0);
  const lines = [
    "Overall budget status for " + monthLabel + ":",
    "Total allocated: " + formatMoney(total("amountMinor")) + ".",
    "Recorded spending against these budgets: " + formatMoney(total("spentMinor")) + ".",
    "Unpaid bills in these budgeted categories: " + formatMoney(total("unpaidBillsMinor")) + ".",
    "Remaining within the recorded limits: " + formatMoney(total("remainingMinor")) + ".",
    "By category:",
    ...rows.slice(0, 8).map(lineFor),
  ];
  if (rows.length > 8) lines.push("Plus " + (rows.length - 8) + " more budgeted categories.");
  return lines.join("\n");
}

/** A read-only scenario estimate for hypothetical future discretionary spending. */
export function simulateBudgetScenario(input: {
  question: string;
  currency: string;
  currentProjectedMinor: number;
  categories: AgentCategory[];
  spendingByCategory: Record<string, number>;
}) {
  const lower = input.question.trim().toLocaleLowerCase("en-US");
  const intent = /\b(what.?if|scenario|reduce|cut|lower|trim|spend less|save on)\b/.test(lower);
  const goalQuestion = /\b(goal|target|in \d+ months?)\b/.test(lower);
  if (!intent || goalQuestion) return { available: false, reason: "No future-spending reduction scenario was requested.", recordsChanged: false };

  const category = input.categories.find((item) => lower.includes(item.name.toLocaleLowerCase("en-US")));
  const candidates = input.categories
    .map((item) => ({ ...item, spendingMinor: safeMinor(input.spendingByCategory[item.id] ?? 0) }))
    .sort((a, b) => b.spendingMinor - a.spendingMinor);
  const selected = category ? candidates.find((item) => item.id === category.id) : candidates.find((item) => item.spendingMinor > 0);
  if (!selected) return { available: false, reason: "No recorded spending is available to ground this scenario.", recordsChanged: false };

  const percent = lower.match(/(\d{1,2}(?:\.\d{1,2})?)\s*%/);
  const amountMatch = lower.match(/(?:৳|\bbdt\s*|\btaka\s*|\bby\s+)([\d,]+(?:\.\d{1,2})?)/i);
  let adjustmentMinor: number;
  let assumption: string;
  if (percent) {
    const rate = Number(percent[1]);
    if (!Number.isFinite(rate) || rate <= 0 || rate > 100) return { available: false, reason: "Choose a reduction between 0% and 100%.", recordsChanged: false };
    adjustmentMinor = Math.round(selected.spendingMinor * rate / 100);
    assumption = rate + "% of recorded " + selected.name + " spending";
  } else if (amountMatch) {
    const major = Number(amountMatch[1].replaceAll(",", ""));
    if (!Number.isFinite(major) || major <= 0 || major > Number.MAX_SAFE_INTEGER / 100) return { available: false, reason: "Enter a positive, valid scenario amount.", recordsChanged: false };
    adjustmentMinor = Math.round(major * 100);
    assumption = "a hypothetical future " + selected.name + " spending reduction";
  } else {
    adjustmentMinor = Math.round(selected.spendingMinor * 0.1);
    assumption = "an illustrative 10% reduction based on recorded spending";
  }
  if (adjustmentMinor <= 0) return { available: false, reason: "There is not enough recorded " + selected.name + " spending to estimate that reduction.", recordsChanged: false };

  const currentProjectedMinor = Number.isSafeInteger(input.currentProjectedMinor) ? input.currentProjectedMinor : 0;
  return {
    available: true,
    category: selected.name,
    adjustmentMinor,
    currency: input.currency,
    currentProjectedMinor,
    simulatedProjectedMinor: currentProjectedMinor + adjustmentMinor,
    estimatedImprovementMinor: adjustmentMinor,
    assumption,
    note: "This is a hypothetical future-spending estimate, not a forecast guarantee. No financial records were changed.",
    recordsChanged: false,
  };
}

export function explainFinancialRisk(input: {
  today: string;
  currency: string;
  projectedMinor: number;
  budgets: AgentBudget[];
  categories: AgentCategory[];
  spendingByCategory: Record<string, number>;
  unpaidByCategory: Record<string, number>;
  bills: AgentBill[];
  goals: AgentGoal[];
}) {
  const categoryNames = new Map(input.categories.map((item) => [item.id, item.name]));
  const risks: { level: "warning" | "danger"; title: string; evidence: string }[] = [];
  if (input.projectedMinor < 0) risks.push({ level: "danger", title: "Projected shortfall", evidence: "Recorded forecast is " + input.projectedMinor + " minor units below zero." });
  for (const budget of input.budgets) {
    const spent = safeMinor(input.spendingByCategory[budget.category_id] ?? 0);
    const unpaid = safeMinor(input.unpaidByCategory[budget.category_id] ?? 0);
    const amount = safeMinor(budget.amount_minor);
    if (spent + unpaid > amount) {
      risks.push({ level: "warning", title: (categoryNames.get(budget.category_id) ?? "Category") + " budget pressure", evidence: "Paid spending plus unpaid bills is " + (spent + unpaid) + " minor units against a " + amount + "-minor-unit budget." });
    }
  }
  const today = Date.parse(input.today + "T12:00:00Z");
  const soon = input.bills.filter((bill) => {
    if (bill.paid_at) return false;
    const days = Math.floor((Date.parse(bill.due_date + "T12:00:00Z") - today) / 86_400_000);
    return days >= 0 && days <= 7;
  });
  if (soon.length) {
    const total = soon.reduce((sum, bill) => sum + safeMinor(bill.amount_minor), 0);
    risks.push({ level: "warning", title: "Bills due within seven days", evidence: soon.length + " unpaid bill(s) totaling " + total + " minor units are due soon." });
  }
  for (const goal of input.goals) {
    if (!goal.target_date || goal.saved_minor >= goal.target_minor) continue;
    const days = Math.ceil((Date.parse(goal.target_date + "T12:00:00Z") - today) / 86_400_000);
    const remaining = safeMinor(goal.target_minor - goal.saved_minor);
    if (days >= 0 && days <= 30) {
      risks.push({ level: "warning", title: goal.name + " is approaching its target date", evidence: remaining + " minor units remain with " + days + " day(s) to the target." });
    }
  }
  return {
    risks,
    assessment: risks.length ? "Signals are based only on recorded values; review the evidence before acting." : "No configured risk trigger was found in the available records.",
    notAssessed: "Unusual-spending detection needs comparable historical months and is not inferred from a single-month snapshot.",
    currency: input.currency,
  };
}
