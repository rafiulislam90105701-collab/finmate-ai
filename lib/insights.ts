import { formatMoney } from "@/lib/finance";
import type { Currency, FinanceState, Forecast } from "@/types/finance";
import { isInMonth, spendingByCategory } from "@/lib/finance";

export interface Insight { title: string; body: string; tone: "good" | "warning" | "danger" | "neutral"; }

export function buildInsights(forecast: Forecast, currency: Currency, state?: FinanceState): Insight[] {
  const money = (amount: number) => formatMoney(amount, currency);
  const insights: Insight[] = [];
  const risks: Insight[] = [];
  if (forecast.shortfall) insights.push({ title: "Your forecast needs attention", body: `You are projected to be ${money(Math.abs(forecast.projectedBalanceMinor))} below zero after bills and planned spending. Reduce discretionary spending or add income before month-end.`, tone: "danger" });
  else insights.push({ title: "You are on track", body: `Your estimated month-end balance is ${money(forecast.projectedBalanceMinor)}. This is an estimate, not a guarantee.`, tone: "good" });
  if (forecast.unpaidBillsMinor > 0) insights.push({ title: "Bills are reserved", body: `${money(forecast.unpaidBillsMinor)} in unpaid bills is already included in the forecast so it is not double-counted.`, tone: "warning" });
  if (forecast.expectedRemainingMinor > 0) insights.push({ title: "Spending assumption", body: `${money(forecast.expectedRemainingMinor)} is reserved for further spending from ${forecast.expectedSpendingSource}.`, tone: "neutral" });
  if (state) {
    const spending = spendingByCategory(state.transactions, forecast.month);
    const linkedBillIds = new Set(state.transactions.map((row) => row.billId).filter((id): id is string => Boolean(id)));
    const unpaidBills = state.bills.filter((bill) => !bill.paidAt && isInMonth(bill.dueDate, forecast.month) && !linkedBillIds.has(bill.id));
    const unpaidByCategory = unpaidBills.reduce<Record<string, number>>((total, bill) => {
      total[bill.categoryId] = (total[bill.categoryId] ?? 0) + bill.amountMinor;
      return total;
    }, {});
    for (const budget of state.budgets.filter((item) => item.month === forecast.month)) {
      const paid = spending[budget.categoryId] ?? 0;
      const reserved = unpaidByCategory[budget.categoryId] ?? 0;
      if (paid + reserved > budget.amountMinor) {
        risks.push({
          title: `${categoryNameForRisk(state, budget.categoryId)} budget pressure`,
          body: `${money(paid)} paid spending plus ${money(reserved)} in unpaid bills is above the ${money(budget.amountMinor)} monthly budget.`,
          tone: "warning",
        });
      }
    }
    const dateParts = new Intl.DateTimeFormat("en-CA", { timeZone: state.profile.timezone || "UTC", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
    const today = dateParts.filter((part) => part.type !== "literal").map((part) => part.value);
    const todayKey = today.join("-");
    const todayUtc = Date.parse(`${todayKey}T12:00:00Z`);
    const dueSoon = state.bills.filter((bill) => !bill.paidAt && !linkedBillIds.has(bill.id)).filter((bill) => {
      const days = Math.floor((Date.parse(`${bill.dueDate}T12:00:00Z`) - todayUtc) / 86_400_000);
      return days >= 0 && days <= 7;
    });
    if (dueSoon.length) {
      const amount = dueSoon.reduce((total, bill) => total + bill.amountMinor, 0);
      risks.push({ title: "Bills due within seven days", body: `${dueSoon.length} unpaid bill(s) totaling ${money(amount)} are due soon.`, tone: "warning" });
    }
    for (const goal of state.goals) {
      if (!goal.targetDate || goal.savedMinor >= goal.targetMinor) continue;
      const days = Math.ceil((Date.parse(`${goal.targetDate}T12:00:00Z`) - todayUtc) / 86_400_000);
      if (days >= 0 && days <= 30) {
        risks.push({
          title: `${goal.name} is nearing its target date`,
          body: `${money(goal.targetMinor - goal.savedMinor)} remains with ${days} day(s) to go. This is a reminder to review progress, not a prediction.`,
          tone: "warning",
        });
      }
    }
  }
  return [...risks, ...insights];
}

function categoryNameForRisk(state: FinanceState, categoryId: string) {
  return state.categories.find((item) => item.id === categoryId)?.name ?? "Category";
}
