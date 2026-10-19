import type { FinanceState } from "@/types/finance";

export const defaultCategorySeeds = [
  ["Food", "#ef7d57"], ["Transport", "#4978d6"], ["Shopping", "#b573c5"], ["Education", "#1f9d84"], ["Housing", "#d39a36"],
  ["Utilities", "#7964ca"], ["Healthcare", "#d4546f"], ["Entertainment", "#42a8a0"], ["Savings", "#6b8d3e"], ["Other", "#7a8795"]
] as const;

function isoDate(offsetDays = 0) {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() + offsetDays);
  return date.toISOString().slice(0, 10);
}
function isoTime(offsetMinutes = 0) { return new Date(Date.now() + offsetMinutes * 60_000).toISOString(); }
export const monthKey = () => isoDate().slice(0, 7);

export function makeDemoState(): FinanceState {
  const month = monthKey();
  const categories = [
    ["food", "Food", "#ef7d57"], ["transport", "Transport", "#4978d6"], ["shopping", "Shopping", "#b573c5"],
    ["education", "Education", "#1f9d84"], ["housing", "Housing", "#d39a36"], ["utilities", "Utilities", "#7964ca"],
    ["healthcare", "Healthcare", "#d4546f"], ["entertainment", "Entertainment", "#42a8a0"], ["savings", "Savings", "#6b8d3e"], ["other", "Other", "#7a8795"]
  ].map(([id, name, color]) => ({ id, name, color, isDefault: true }));
  return {
    profile: { currency: "BDT", timezone: "Asia/Dhaka", openingBalanceMinor: 1_200_000, expectedRemainingMinor: 250_000, onboardingComplete: true },
    categories,
    transactions: [
      { id: "income-oct", amountMinor: 3_800_000, type: "income", description: "Monthly salary", categoryId: "other", transactionDate: isoDate(-12), account: "Bank", recurring: "monthly", createdAt: isoTime(-1800) },
      { id: "groceries", amountMinor: 248_000, type: "expense", description: "Weekly groceries", categoryId: "food", transactionDate: isoDate(-7), account: "Card", recurring: "none", createdAt: isoTime(-900) },
      { id: "ride-share", amountMinor: 72_500, type: "expense", description: "Rides & commute", categoryId: "transport", transactionDate: isoDate(-5), account: "Mobile wallet", recurring: "none", createdAt: isoTime(-600) },
      { id: "course", amountMinor: 350_000, type: "expense", description: "Online course", categoryId: "education", transactionDate: isoDate(-3), account: "Card", recurring: "none", createdAt: isoTime(-300) },
      { id: "lunches", amountMinor: 54_500, type: "expense", description: "Lunches with friends", categoryId: "food", transactionDate: isoDate(-1), account: "Cash", recurring: "none", createdAt: isoTime(-120) }
    ],
    budgets: [
      { id: "budget-food", categoryId: "food", amountMinor: 800_000, month, createdAt: isoTime(-1600) },
      { id: "budget-transport", categoryId: "transport", amountMinor: 300_000, month, createdAt: isoTime(-1600) },
      { id: "budget-shopping", categoryId: "shopping", amountMinor: 500_000, month, createdAt: isoTime(-1600) },
      { id: "budget-entertainment", categoryId: "entertainment", amountMinor: 250_000, month, createdAt: isoTime(-1600) }
    ],
    bills: [
      { id: "bill-internet", name: "Home internet", amountMinor: 1_000_000, dueDate: isoDate(4), categoryId: "utilities", recurring: "monthly", paidAt: null, transactionId: null },
      { id: "bill-mobile", name: "Mobile plan", amountMinor: 600_000, dueDate: isoDate(9), categoryId: "utilities", recurring: "monthly", paidAt: null, transactionId: null },
      { id: "bill-streaming", name: "Streaming", amountMinor: 199_00, dueDate: isoDate(-4), categoryId: "entertainment", recurring: "monthly", paidAt: isoTime(-550), transactionId: null }
    ],
    goals: [
      { id: "goal-emergency", name: "Emergency fund", targetMinor: 100_000_00, savedMinor: 3_750_000, targetDate: "2027-03-31", color: "#1f9d84" },
      { id: "goal-trip", name: "Cox's Bazar trip", targetMinor: 30_000_00, savedMinor: 11_400_00, targetDate: "2026-12-15", color: "#4978d6" }
    ],
    contributions: [],
    activities: [
      { id: "activity-demo", action: "Demo workspace loaded", detail: "All figures are fictional and saved only in this browser.", createdAt: isoTime(-1) },
      { id: "activity-income", action: "Income recorded", detail: "Monthly salary added to the ledger.", createdAt: isoTime(-1800) }
    ]
  };
}
