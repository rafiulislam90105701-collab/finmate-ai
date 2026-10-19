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

/** Strictly parse only the small, read-only tool arguments the agent supports. */
export function parseFinanceToolArguments(name: string, raw: string): Record<string, unknown> | null {
  const allowed = TOOL_ARGUMENT_KEYS[name];
  if (!allowed) return null;
  let value: unknown;
  try { value = JSON.parse(raw); } catch { return null; }
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const args = value as Record<string, unknown>;
  if (Object.keys(args).some((key) => !allowed.includes(key))) return null;
  if ("category_name" in args && (typeof args.category_name !== "string" || args.category_name.trim().length > 60)) return null;
  if ("goal_name" in args && (typeof args.goal_name !== "string" || args.goal_name.trim().length > 120)) return null;
  if ("limit" in args && (!Number.isInteger(args.limit) || (args.limit as number) < 1 || (args.limit as number) > 10)) return null;
  return args;
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
