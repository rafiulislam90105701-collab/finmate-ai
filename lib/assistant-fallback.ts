import { formatMoney } from "@/lib/finance";
import type { Currency } from "@/types/finance";

export type AssistantSummary = {
  availableBalanceMinor: number;
  projectedBalanceMinor: number;
  unpaidBillsMinor: number;
  expectedRemainingMinor: number;
  shortfall: boolean;
};

export type AssistantFallbackContext = {
  categorySpending: { name: string; amountMinor: number }[];
  upcomingBills: { name: string; amountMinor: number; dueDate: string }[];
  budgets: { category: string; amountMinor: number; spentMinor: number }[];
  goals: { name: string; targetMinor: number; savedMinor: number; targetDate: string | null }[];
};

type AssistantFallbackInput = {
  question: string;
  summary: AssistantSummary;
  currency: Currency;
  context?: Partial<AssistantFallbackContext>;
};

const emptyContext: AssistantFallbackContext = { categorySpending: [], upcomingBills: [], budgets: [], goals: [] };
const date = (value: string) => new Intl.DateTimeFormat("en-BD", { day: "numeric", month: "short" }).format(new Date(`${value}T12:00:00`));

/**
 * A transparent no-key assistant. It never invents records: every amount comes
 * from the current workspace snapshot and all arithmetic stays deterministic.
 */
export function answerRulesBasedAssistant({ question, summary, currency, context: suppliedContext }: AssistantFallbackInput) {
  const context = { ...emptyContext, ...suppliedContext };
  const text = question.trim().toLocaleLowerCase("en-US");
  const money = (amount: number) => formatMoney(amount, currency);
  const category = context.categorySpending.find((item) => text.includes(item.name.toLocaleLowerCase("en-US")));
  const topCategories = [...context.categorySpending].filter((item) => item.amountMinor > 0).sort((a, b) => b.amountMinor - a.amountMinor);
  const unpaidBills = [...context.upcomingBills].filter((item) => item.amountMinor > 0).sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const activeGoal = context.goals.find((goal) => goal.savedMinor < goal.targetMinor);

  if (!text || !/[a-z0-9]/i.test(text)) return "Please ask a short question about your spending, bills, forecast, budget, or savings goal.";
  if (/^(hi|hello|hey|assalamu\s*alaikum|salam)[!.\s]*$/i.test(question.trim())) {
    return "Hello. I can use the figures in this workspace to explain spending, upcoming bills, your month-end forecast, budgets, or savings goals. What would you like to check?";
  }
  if (category) {
    if (category.amountMinor === 0) return `There are no recorded expenses in ${category.name} for this month. Add a transaction in that category if you want it included in your forecast.`;
    return `You have recorded ${money(category.amountMinor)} in ${category.name} this month. That is based on paid ledger expenses only; unpaid bills remain reserved separately.`;
  }
  if (/\b(where|what).{0,35}\b(money|spend|spent|spending)|\b(spend|spending|category|categories)\b/.test(text) && !/\b(reduce|cut|lower|save money|spend less|trim)\b/.test(text)) {
    if (!topCategories.length) return "There are no paid expense transactions in the current month yet, so I cannot identify a largest spending category. Add transactions first.";
    const [first, second] = topCategories;
    return `${first.name} is your largest recorded spending category at ${money(first.amountMinor)}.${second ? ` Next is ${second.name} at ${money(second.amountMinor)}.` : ""} These totals exclude unpaid bills until they are marked paid.`;
  }
  if (/\b(reduce|cut|lower|save money|spend less|trim)\b/.test(text)) {
    if (!topCategories.length) return "I need at least one paid expense before I can suggest a data-grounded reduction. Record recent spending first.";
    const [first, second] = topCategories;
    const firstTrim = Math.round(first.amountMinor * 0.1);
    return `Start with ${first.name}, your largest recorded category at ${money(first.amountMinor)}. A 10% reduction there is about ${money(firstTrim)};${second ? ` then review ${second.name} at ${money(second.amountMinor)}.` : ""} Treat this as a planning option, not an automatic change.`;
  }
  if (/\b(bill|bills|due|upcoming)\b/.test(text)) {
    if (!unpaidBills.length) return "There are no unpaid bills recorded for this month, so none are currently reserved in the forecast.";
    const preview = unpaidBills.slice(0, 3).map((bill) => `${bill.name} (${money(bill.amountMinor)} due ${date(bill.dueDate)})`).join(", ");
    return `You have ${money(summary.unpaidBillsMinor)} reserved for unpaid bills. The next items are ${preview}. The forecast subtracts this reserve once, before expected future spending.`;
  }
  if (/\b(forecast|run out|running out|last|balance|month|month-end|end of month)\b/.test(text)) {
    const calculation = `${money(summary.availableBalanceMinor)} available − ${money(summary.unpaidBillsMinor)} unpaid bills − ${money(summary.expectedRemainingMinor)} expected remaining spending`;
    if (summary.shortfall) return `${calculation} gives an estimated month-end balance of ${money(summary.projectedBalanceMinor)}. That is below zero, so reduce planned spending or add confirmed income before relying on this plan.`;
    return `${calculation} gives an estimated month-end balance of ${money(summary.projectedBalanceMinor)}. It is an estimate based only on the records and assumptions currently shown.`;
  }
  if (/\b(save|saving|savings|goal|goals|target)\b/.test(text)) {
    if (!activeGoal) return "There is no unfinished savings goal yet. Create one with a target amount and optional date, then I can show the remaining amount from your recorded progress.";
    const remaining = Math.max(0, activeGoal.targetMinor - activeGoal.savedMinor);
    return `For ${activeGoal.name}, you have saved ${money(activeGoal.savedMinor)} of ${money(activeGoal.targetMinor)}. The remaining amount is ${money(remaining)}${activeGoal.targetDate ? ` by ${date(activeGoal.targetDate)}` : ""}. Add a contribution only when you decide to record it.`;
  }
  return "I can help with recorded spending, category totals, unpaid bills, the month-end forecast, budget trade-offs, or savings goals. Try asking, “Where is most of my money going?” or “How do my upcoming bills affect my forecast?”";
}
