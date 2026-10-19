import type { Bill, Budget, Category, Currency, Forecast, Profile, Transaction } from "@/types/finance";

const currencyDigits: Record<string, number> = { BDT: 2, USD: 2, EUR: 2, GBP: 2, INR: 2, JPY: 0, KRW: 0 };

export function digitsFor(currency: string = "BDT") { return currencyDigits[currency.toUpperCase()] ?? 2; }

export function parseMoney(value: string | number, currency: string = "BDT") {
  const input = String(value ?? "").trim().replaceAll(",", "");
  if (!/^\d+(\.\d+)?$/.test(input)) throw new Error("Enter a positive amount using digits and an optional decimal point.");
  const decimals = digitsFor(currency);
  const [whole, fraction = ""] = input.split(".");
  if (fraction.length > decimals) throw new Error(`${currency} supports at most ${decimals} decimal places.`);
  const factor = 10 ** decimals;
  const minor = BigInt(whole) * BigInt(factor) + BigInt((fraction + "0".repeat(decimals)).slice(0, decimals) || "0");
  if (minor > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("Amount is too large.");
  return Number(minor);
}

export function formatMoney(minor: number, currency: Currency = "BDT", locale = "en-BD") {
  const decimals = digitsFor(currency);
  return new Intl.NumberFormat(locale, { style: "currency", currency, minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format((Number(minor) || 0) / 10 ** decimals);
}

export function assertMonth(month: string) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Error("Month must use YYYY-MM.");
  return month;
}

export function monthBounds(month: string) {
  assertMonth(month);
  const [year, numericMonth] = month.split("-").map(Number);
  const last = new Date(Date.UTC(year, numericMonth, 0)).getUTCDate();
  return { start: `${month}-01`, end: `${month}-${String(last).padStart(2, "0")}` };
}

export function isInMonth(date: string, month: string) {
  const { start, end } = monthBounds(month);
  return typeof date === "string" && date >= start && date <= end;
}

function sum<T>(items: T[], predicate: (item: T) => boolean, getAmount: (item: T) => number) {
  return items.reduce((total, item) => total + (predicate(item) ? Number(getAmount(item) || 0) : 0), 0);
}

export function spendingByCategory(transactions: Transaction[], month: string) {
  const result: Record<string, number> = {};
  for (const transaction of transactions) {
    if (transaction.type === "expense" && isInMonth(transaction.transactionDate, month)) {
      result[transaction.categoryId] = (result[transaction.categoryId] ?? 0) + transaction.amountMinor;
    }
  }
  return result;
}

export function budgetProgress(budgets: Budget[], transactions: Transaction[], month: string) {
  const spending = spendingByCategory(transactions, month);
  return budgets.filter((budget) => budget.month === month).map((budget) => {
    const spentMinor = spending[budget.categoryId] ?? 0;
    return { ...budget, spentMinor, remainingMinor: budget.amountMinor - spentMinor, percent: budget.amountMinor ? Math.round((spentMinor / budget.amountMinor) * 100) : 0 };
  });
}

/**
 * Forecasts only this month's dated ledger rows. A paid bill must have its linked
 * expense transaction recorded in the ledger; linked bills are never deducted again.
 * When no manual estimate exists, unspent budgets form the estimate after deducting
 * unpaid bills in matching categories, so a future bill cannot be counted twice.
 */
export function calculateForecast(input: { month: string; transactions: Transaction[]; bills: Bill[]; budgets: Budget[]; profile: Profile }): Forecast {
  const { month, transactions, bills, budgets, profile } = input;
  assertMonth(month);
  const incomeMinor = sum(transactions, (row) => row.type === "income" && isInMonth(row.transactionDate, month), (row) => row.amountMinor);
  const paidExpenseMinor = sum(transactions, (row) => row.type === "expense" && isInMonth(row.transactionDate, month), (row) => row.amountMinor);
  const ledgerBillIds = new Set(transactions.map((row) => row.billId).filter((id): id is string => Boolean(id)));
  const unpaidBills = bills.filter((bill) => !bill.paidAt && isInMonth(bill.dueDate, month) && !ledgerBillIds.has(bill.id));
  const unpaidBillsMinor = unpaidBills.reduce((total, bill) => total + bill.amountMinor, 0);
  const spending = spendingByCategory(transactions, month);
  const unpaidByCategory = unpaidBills.reduce<Record<string, number>>((total, bill) => {
    total[bill.categoryId] = (total[bill.categoryId] ?? 0) + bill.amountMinor;
    return total;
  }, {});
  const budgetRows = budgets.filter((row) => row.month === month);
  const budgetRemainingMinor = budgetRows.reduce((total, budget) => total + Math.max(0, budget.amountMinor - (spending[budget.categoryId] ?? 0)), 0);
  const defaultAdditionalMinor = budgetRows.reduce((total, budget) => total + Math.max(0, budget.amountMinor - (spending[budget.categoryId] ?? 0) - (unpaidByCategory[budget.categoryId] ?? 0)), 0);
  const manualEstimate = profile.expectedRemainingMinor;
  const hasManualEstimate = Number.isInteger(manualEstimate) && (manualEstimate as number) >= 0;
  const expectedRemainingMinor = hasManualEstimate ? manualEstimate as number : defaultAdditionalMinor;
  const openingBalanceMinor = profile.openingBalanceMinor;
  const availableBalanceMinor = openingBalanceMinor + incomeMinor - paidExpenseMinor;
  const projectedBalanceMinor = availableBalanceMinor - unpaidBillsMinor - expectedRemainingMinor;
  return {
    month, openingBalanceMinor, incomeMinor, paidExpenseMinor, availableBalanceMinor, unpaidBillsMinor, expectedRemainingMinor,
    budgetRemainingMinor, projectedBalanceMinor, shortfall: projectedBalanceMinor < 0,
    expectedSpendingSource: hasManualEstimate ? "your manual estimate (in addition to unpaid bills)" : budgetRows.length ? "unspent budgets, excluding upcoming bills already counted" : "no estimate provided",
    assumptions: [
      `Only ledger items dated ${monthBounds(month).start} through ${monthBounds(month).end} are included.`,
      `${unpaidBills.length} unpaid bill${unpaidBills.length === 1 ? "" : "s"} due this month ${unpaidBills.length === 1 ? "is" : "are"} reserved once.`,
      hasManualEstimate ? "Your estimate is treated as spending in addition to unpaid bills." : "Budget-based remaining spending subtracts bills that are already reserved above."
    ]
  };
}

export function categoryName(categories: Category[], categoryId: string) { return categories.find((category) => category.id === categoryId)?.name ?? "Uncategorized"; }
