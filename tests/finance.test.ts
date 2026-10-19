import { describe, expect, it } from "vitest";
import { budgetProgress, calculateForecast, isInMonth, parseMoney } from "@/lib/finance";
import type { Bill, Budget, Profile, Transaction } from "@/types/finance";

const profile = (overrides: Partial<Profile> = {}): Profile => ({ currency:"BDT", timezone:"Asia/Dhaka", openingBalanceMinor:1_200_000, expectedRemainingMinor:250_000, onboardingComplete:true, ...overrides });
const expense = (amountMinor:number, date = "2026-10-14", billId?:string): Transaction => ({ id:`tx-${amountMinor}-${date}`,amountMinor,type:"expense",description:"Expense",categoryId:"food",transactionDate:date,recurring:"none",createdAt:"2026-10-14T00:00:00Z",billId });
const bill = (overrides: Partial<Bill> = {}): Bill => ({ id:"internet",name:"Internet",amountMinor:100_000,dueDate:"2026-10-20",categoryId:"utilities",recurring:"monthly",paidAt:null,transactionId:null,...overrides });

describe("deterministic forecast", () => {
  it("matches the documented example without mixing income and available balance", () => {
    const result = calculateForecast({ month:"2026-10",profile:profile(),transactions:[expense(725_000)],bills:[bill()],budgets:[] });
    expect(result.availableBalanceMinor).toBe(475_000);
    expect(result.unpaidBillsMinor).toBe(100_000);
    expect(result.expectedRemainingMinor).toBe(250_000);
    expect(result.projectedBalanceMinor).toBe(125_000); // ৳1,250
  });
  it("does not count a paid linked bill as both a bill and a ledger expense", () => {
    const result = calculateForecast({ month:"2026-10",profile:profile({expectedRemainingMinor:0}),transactions:[expense(100_000,"2026-10-10","internet")],bills:[bill({paidAt:"2026-10-10T09:00:00Z",transactionId:"tx-100000-2026-10-10"})],budgets:[] });
    expect(result.paidExpenseMinor).toBe(100_000);
    expect(result.unpaidBillsMinor).toBe(0);
    expect(result.projectedBalanceMinor).toBe(1_100_000);
  });
  it("reserves an unpaid bill only once when its category budget is the remaining-spending estimate", () => {
    const budgets: Budget[] = [{id:"utilities",categoryId:"utilities",month:"2026-10",amountMinor:300_000,createdAt:""}];
    const result = calculateForecast({month:"2026-10",profile:profile({expectedRemainingMinor:null}),transactions:[],bills:[bill({amountMinor:100_000})],budgets});
    expect(result.unpaidBillsMinor).toBe(100_000);
    expect(result.expectedRemainingMinor).toBe(200_000);
    expect(result.projectedBalanceMinor).toBe(900_000);
  });
  it("flags a negative forecast and handles zero-data without inventing income", () => {
    const zero = calculateForecast({month:"2026-10",profile:profile({openingBalanceMinor:0,expectedRemainingMinor:null}),transactions:[],bills:[],budgets:[]});
    expect(zero.incomeMinor).toBe(0); expect(zero.projectedBalanceMinor).toBe(0); expect(zero.shortfall).toBe(false);
    const negative = calculateForecast({month:"2026-10",profile:profile({openingBalanceMinor:5_000,expectedRemainingMinor:0}),transactions:[],bills:[bill({amountMinor:5_001})],budgets:[]});
    expect(negative.shortfall).toBe(true); expect(negative.projectedBalanceMinor).toBe(-1);
  });
  it("uses inclusive calendar month boundaries", () => {
    expect(isInMonth("2026-10-01","2026-10")).toBe(true); expect(isInMonth("2026-10-31","2026-10")).toBe(true); expect(isInMonth("2026-11-01","2026-10")).toBe(false);
  });
});

describe("money and budgets", () => {
  it("parses money precisely and rejects invalid fractional precision", () => { expect(parseMoney("1,250.50","BDT")).toBe(125_050); expect(() => parseMoney("12.345","BDT")).toThrow(); expect(() => parseMoney("-5","BDT")).toThrow(); });
  it("calculates budget progress including overspend", () => { const budget: Budget = {id:"food",categoryId:"food",month:"2026-10",amountMinor:1_000,createdAt:""}; const data = budgetProgress([budget],[expense(1_250)],"2026-10")[0]; expect(data.spentMinor).toBe(1_250); expect(data.remainingMinor).toBe(-250); expect(data.percent).toBe(125); });
});
