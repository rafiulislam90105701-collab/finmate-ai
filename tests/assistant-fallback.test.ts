import { describe, expect, it } from "vitest";
import { answerRulesBasedAssistant } from "@/lib/assistant-fallback";

const input = (question: string) => ({
  question,
  currency: "BDT" as const,
  summary: { availableBalanceMinor: 12_000_00, projectedBalanceMinor: -3_000_00, unpaidBillsMinor: 1_000_00, expectedRemainingMinor: 2_000_00, shortfall: true },
  context: {
    categorySpending: [{ name:"Food",amountMinor:4_500_00 },{ name:"Transport",amountMinor:1_500_00 },{ name:"Entertainment",amountMinor:0 }],
    upcomingBills: [{ name:"Internet",amountMinor:1_000_00,dueDate:"2026-10-21" }],
    budgets: [{ category:"Food",amountMinor:5_000_00,spentMinor:4_500_00 }],
    goals: [{ name:"Emergency fund",targetMinor:20_000_00,savedMinor:5_000_00,targetDate:"2027-01-01" }]
  }
});

describe("rules-based assistant", () => {
  it("returns different grounded answers for distinct questions when no model is configured", () => {
    const answers = [
      answerRulesBasedAssistant(input("Hi")),
      answerRulesBasedAssistant(input("Where is most of my money going?")),
      answerRulesBasedAssistant(input("How can I reduce my spending?")),
      answerRulesBasedAssistant(input("How do my upcoming bills affect my forecast?")),
      answerRulesBasedAssistant(input("Am I likely to run out of money this month?")),
      answerRulesBasedAssistant(input("Help me plan a savings goal.")),
      answerRulesBasedAssistant(input("What did I spend on Entertainment?")),
      answerRulesBasedAssistant(input("What is the weather tomorrow?"))
    ];
    expect(answers[0]).not.toBe(answers[1]);
    expect(answers[1]).not.toBe(answers[2]);
    expect(answers[2]).not.toBe(answers[3]);
    expect(answers[3]).not.toBe(answers[4]);
    expect(answers[4]).not.toBe(answers[5]);
    expect(answers[5]).not.toBe(answers[6]);
    expect(answers[6]).not.toBe(answers[7]);
    expect(answers[0]).toMatch(/Hello/i);
    expect(answers[1]).toMatch(/Food/);
    expect(answers[2]).toMatch(/10%/);
    expect(answers[3]).toMatch(/Internet/);
    expect(answers[4]).toMatch(/below zero/i);
    expect(answers[5]).toMatch(/Emergency fund/);
    expect(answers[6]).toMatch(/no recorded expenses/i);
    expect(answers[7]).toMatch(/I can help/i);
  });
});
