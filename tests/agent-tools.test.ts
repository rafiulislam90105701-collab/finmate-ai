import { describe, expect, it } from "vitest";
import { explainFinancialRisk, simulateBudgetScenario } from "../supabase/functions/_shared/agent-tools";
import { buildInsights } from "@/lib/insights";
import { calculateForecast } from "@/lib/finance";
import type { FinanceState } from "@/types/finance";

const categories = [{ id: "food", name: "Food" }, { id: "travel", name: "Travel" }];

describe("read-only financial assistant tools", () => {
  it("simulates a requested reduction using recorded category spending without changing records", () => {
    const result = simulateBudgetScenario({
      question: "What if I reduce Food by ৳1,000?",
      currency: "BDT",
      currentProjectedMinor: -15_000,
      categories,
      spendingByCategory: { food: 50_000, travel: 20_000 },
    });
    expect(result).toMatchObject({
      available: true,
      category: "Food",
      adjustmentMinor: 100_000,
      currentProjectedMinor: -15_000,
      simulatedProjectedMinor: 85_000,
      recordsChanged: false,
    });
  });

  it("uses an explicit recorded-spend assumption when only a percentage is requested", () => {
    const result = simulateBudgetScenario({
      question: "What if I cut Food by 10%?",
      currency: "BDT",
      currentProjectedMinor: 40_000,
      categories,
      spendingByCategory: { food: 50_000, travel: 20_000 },
    });
    expect(result).toMatchObject({ available: true, adjustmentMinor: 5_000, simulatedProjectedMinor: 45_000 });
  });

  it("does not estimate a savings goal as a spending reduction", () => {
    expect(simulateBudgetScenario({
      question: "How can I save ৳5,000 in 3 months?",
      currency: "BDT",
      currentProjectedMinor: 40_000,
      categories,
      spendingByCategory: { food: 50_000 },
    })).toMatchObject({ available: false, recordsChanged: false });
  });

  it("reports risks with evidence and states that historical anomaly checks were not assessed", () => {
    const result = explainFinancialRisk({
      today: "2026-10-19",
      currency: "BDT",
      projectedMinor: -2_500,
      categories,
      budgets: [{ id: "food-budget", category_id: "food", amount_minor: 30_000 }],
      spendingByCategory: { food: 25_000 },
      unpaidByCategory: { food: 10_000 },
      bills: [{ name: "Internet", amount_minor: 7_500, due_date: "2026-10-22", paid_at: null }],
      goals: [{ name: "Emergency fund", target_minor: 50_000, saved_minor: 20_000, target_date: "2026-10-25" }],
    });
    expect(result.risks.map((risk) => risk.title)).toEqual(expect.arrayContaining([
      "Projected shortfall", "Food budget pressure", "Bills due within seven days", "Emergency fund is approaching its target date",
    ]));
    expect(result.notAssessed).toContain("historical months");
  });

  it("shows category budget pressure in the assistant signal panel", () => {
    const state: FinanceState = {
      profile: { currency: "BDT", timezone: "Asia/Dhaka", openingBalanceMinor: 100_000, expectedRemainingMinor: null, onboardingComplete: true },
      categories: [{ id: "food", name: "Food", color: "#4a8" }],
      transactions: [{ id: "expense", amountMinor: 50_000, type: "expense", description: "Groceries", categoryId: "food", transactionDate: "2026-10-10", recurring: "none", createdAt: "2026-10-10T12:00:00Z" }],
      budgets: [{ id: "food-budget", categoryId: "food", amountMinor: 30_000, month: "2026-10", createdAt: "2026-10-01T00:00:00Z" }],
      bills: [],
      goals: [],
      contributions: [],
      activities: [],
    };
    const forecast = calculateForecast({ month: "2026-10", transactions: state.transactions, bills: state.bills, budgets: state.budgets, profile: state.profile });
    const insights = buildInsights(forecast, "BDT", state);
    expect(insights[0]).toMatchObject({ title: "Food budget pressure", tone: "warning" });
    expect(insights[0].body).toContain("above the");
  });
});
