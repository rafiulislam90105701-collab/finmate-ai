import { describe, expect, it } from "vitest";
import { BUDGET_STATUS_TOOL_SCHEMA, buildDeterministicBudgetStatusAnswer, buildGroqFailureLog, explainFinancialRisk, filterBudgetStatus, isFinanceWriteIntent, parseFinanceToolArguments, selectFinanceToolNames, simulateBudgetScenario } from "../supabase/functions/_shared/agent-tools";
import { buildInsights } from "@/lib/insights";
import { calculateForecast } from "@/lib/finance";
import type { FinanceState } from "@/types/finance";

const categories = [{ id: "food", name: "Food" }, { id: "travel", name: "Travel" }];

describe("read-only financial assistant tools", () => {
  it("accepts a valid category-specific budget status argument", () => {
    expect(parseFinanceToolArguments("get_budget_status", '{"category_name":"Food"}')).toEqual({ category_name: "Food" });
    expect(filterBudgetStatus([{ category: "Food" }, { category: "Travel" }], " Food ")).toEqual([{ category: "Food" }]);
  });

  it("accepts an omitted category for an overall budget status request", () => {
    const args = parseFinanceToolArguments("get_budget_status", "{}");
    const budgets = [{ category: "Food" }, { category: "Travel" }];
    expect(BUDGET_STATUS_TOOL_SCHEMA.required).not.toContain("category_name");
    expect(BUDGET_STATUS_TOOL_SCHEMA.properties.category_name.type).toEqual(["string", "null"]);
    expect(args).toEqual({});
    expect(filterBudgetStatus(budgets, args?.category_name)).toEqual(budgets);
  });

  it("normalizes null or blank optional categories to an overall query", () => {
    const budgets = [{ category: "Food" }, { category: "Travel" }];
    expect(parseFinanceToolArguments("get_budget_status", '{"category_name":null}')).toEqual({});
    expect(parseFinanceToolArguments("get_budget_status", '{"category_name":""}')).toEqual({ category_name: "" });
    expect(filterBudgetStatus(budgets, null)).toEqual(budgets);
    expect(filterBudgetStatus(budgets, undefined)).toEqual(budgets);
    expect(filterBudgetStatus(budgets, "   ")).toEqual(budgets);
    expect(parseFinanceToolArguments("get_recent_transactions", '{"limit":null}')).toEqual({});
    expect(parseFinanceToolArguments("get_savings_goals", '{"goal_name":null}')).toEqual({});
  });



  it("does not intercept general travel planning just because the prompt mentions a total budget", () => {
    const question = "I have a total budget of BDT 10,000 for a tour. Help me plan an enjoyable, safe, and affordable trip. Create a practical travel budget for round-trip transportation, accommodation, food, local transport, sightseeing, an emergency reserve, and money I can save. Show a day-by-day itinerary and a clear cost breakdown.";
    expect(buildDeterministicBudgetStatusAnswer(question, "2026-10", "BDT", ["Food", "Housing", "Travel"], [])).toBeNull();
  });

  it("returns a stable no-budget answer without inventing zero-valued allocations", () => {
    const answer = buildDeterministicBudgetStatusAnswer(
      "Show me my overall budget status for this month, including all categories.",
      "2026-10",
      "USD",
      ["Food", "Travel"],
      [],
    );
    expect(answer).toContain("October 2026");
    expect(answer).toContain("No budget categories or limits are set");
    expect(answer).toContain("does not mean your income or spending is zero");
    expect(answer).not.toMatch(/0\s*(USD|BDT)/i);
  });

  it("summarizes existing budget rows consistently and reports budget pressure", () => {
    const answer = buildDeterministicBudgetStatusAnswer(
      "Show me my overall budget status for this month, including all categories.",
      "2026-10",
      "BDT",
      ["Food", "Travel"],
      [
        { category: "Food", amountMinor: 100000, spentMinor: 25000, unpaidBillsMinor: 15000, remainingMinor: 60000 },
        { category: "Travel", amountMinor: 50000, spentMinor: 40000, unpaidBillsMinor: 20000, remainingMinor: 0 },
      ],
    );
    expect(answer).toContain("Overall budget status for October 2026");
    expect(answer).toContain("Total allocated:");
    expect(answer).toContain("Recorded spending against these budgets:");
    expect(answer).toContain("Food: allocated");
    expect(answer).toContain("Travel: allocated");
    expect(answer).toContain("over limit by");
  });

  it("reports an unbudgeted named category and leaves budget-change questions to the AI", () => {
    expect(buildDeterministicBudgetStatusAnswer(
      "Show me my Travel budget status this month.",
      "2026-10",
      "BDT",
      ["Food", "Travel"],
      [{ category: "Food", amountMinor: 100000, spentMinor: 0, unpaidBillsMinor: 0, remainingMinor: 100000 }],
    )).toContain("No budget limit is set for Travel");

    expect(buildDeterministicBudgetStatusAnswer(
      "How should I change my budget?",
      "2026-10",
      "BDT",
      ["Food"],
      [],
    )).toBeNull();
  });

  it("records the Groq 400 schema error without exposing arguments or arbitrary message content", () => {
    const details = buildGroqFailureLog(400, "req_123-ab", {
      error: {
        type: "invalid_request_error",
        code: "tool_use_failed",
        param: "tools",
        message: "parameters for tool get_budget_status did not match schema: errors: [/category_name: expected string but got null]",
        failed_generation: { attempted_arguments: '{"category_name":"Private category"}' },
      },
    });
    expect(details).toMatchObject({
      event: "groq_request_failed",
      status: 400,
      model: "openai/gpt-oss-120b",
      request_id: "req_123-ab",
      provider_error: {
        type: "invalid_request_error",
        code: "tool_use_failed",
        param: "tools",
        message: "parameters for tool get_budget_status did not match schema: errors: [/category_name: expected string but got null]",
        message_redacted: false,
      },
    });
    expect(JSON.stringify(details)).not.toContain("Private category");

    const redacted = buildGroqFailureLog(400, null, { error: { message: "The prompt includes my private balance 987654" } });
    expect(redacted.provider_error).toMatchObject({ message: null, message_redacted: true });
    expect(JSON.stringify(redacted)).not.toContain("private balance");
    expect(JSON.stringify(redacted)).not.toContain("987654");
  });

  it("accepts only known, bounded tool arguments and rejects malformed or extra fields", () => {
    expect(parseFinanceToolArguments("get_recent_transactions", '{"limit":5}')).toEqual({limit:5});
    expect(parseFinanceToolArguments("get_recent_transactions", '{"limit":500}')).toBeNull();
    expect(parseFinanceToolArguments("get_category_spending", '{"category_name":"Food","user_id":"other"}')).toBeNull();
    expect(parseFinanceToolArguments("drop_table", "{}")).toBeNull();
    expect(parseFinanceToolArguments("get_savings_goals", "not-json")).toBeNull();
  });

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
  it("limits Groq tools to the financial question and keeps actions behind consent", () => {
    expect(selectFinanceToolNames("Add a monthly electricity bill of 1200 BDT")).toEqual(["get_upcoming_bills", "propose_bill"]);
    expect(selectFinanceToolNames("Create my Food budget of 5000 taka")).toEqual(["get_budget_status", "propose_budget"]);
    expect(selectFinanceToolNames("Record a 200 BDT travel expense")).toEqual(["get_recent_transactions", "propose_transaction"]);
    expect(selectFinanceToolNames("Create an emergency savings goal")).toEqual(["get_savings_goals", "propose_savings_goal"]);
    expect(selectFinanceToolNames("How much did I spend on Food?")).not.toContain("propose_transaction");
    expect(selectFinanceToolNames("How are my upcoming bills affecting the forecast?")).toContain("calculate_forecast");
    expect(isFinanceWriteIntent("Add electricity bill")).toBe(true);
    expect(isFinanceWriteIntent("Summarize my bills")).toBe(false);
  });

});
