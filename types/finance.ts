export type Currency = "BDT" | "USD" | "EUR" | "GBP" | "INR";
export type TransactionType = "income" | "expense";
export type RecurringFrequency = "none" | "weekly" | "monthly" | "yearly";

export interface Profile {
  currency: Currency;
  timezone: string;
  openingBalanceMinor: number;
  expectedRemainingMinor: number | null;
  onboardingComplete: boolean;
}

export interface Category { id: string; name: string; color: string; isDefault?: boolean; }

export interface Transaction {
  id: string;
  amountMinor: number;
  type: TransactionType;
  description: string;
  categoryId: string;
  transactionDate: string;
  account?: string;
  notes?: string;
  recurring: RecurringFrequency;
  billId?: string;
  createdAt: string;
}

export interface Budget { id: string; categoryId: string; amountMinor: number; month: string; createdAt: string; }

export interface Bill {
  id: string;
  name: string;
  amountMinor: number;
  dueDate: string;
  categoryId: string;
  recurring: RecurringFrequency;
  paidAt: string | null;
  transactionId: string | null;
}

export interface SavingsGoal { id: string; name: string; targetMinor: number; savedMinor: number; targetDate: string | null; color: string; }
export interface SavingsContribution { id: string; goalId: string; amountMinor: number; date: string; note?: string; }
export interface Activity { id: string; action: string; detail: string; createdAt: string; }

export interface FinanceState {
  profile: Profile;
  categories: Category[];
  transactions: Transaction[];
  budgets: Budget[];
  bills: Bill[];
  goals: SavingsGoal[];
  contributions: SavingsContribution[];
  activities: Activity[];
}

export interface Forecast {
  month: string;
  openingBalanceMinor: number;
  incomeMinor: number;
  paidExpenseMinor: number;
  availableBalanceMinor: number;
  unpaidBillsMinor: number;
  expectedRemainingMinor: number;
  budgetRemainingMinor: number;
  projectedBalanceMinor: number;
  shortfall: boolean;
  expectedSpendingSource: string;
  assumptions: string[];
}
