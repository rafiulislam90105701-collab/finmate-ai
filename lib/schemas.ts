import { z } from "zod";

const moneyString = z.string().trim().regex(/^\d+(\.\d{1,2})?$/, "Enter a valid non-negative amount.");
export const transactionSchema = z.object({
  amount: moneyString.refine((value) => Number(value) > 0, "Amount must be greater than zero."),
  type: z.enum(["income", "expense"]), description: z.string().trim().min(1, "Description is required.").max(120),
  categoryId: z.string().min(1, "Choose a category."), transactionDate: z.string().date(), account: z.string().max(80).optional(),
  notes: z.string().max(500).optional(), recurring: z.enum(["none", "weekly", "monthly", "yearly"])
});
export const billSchema = z.object({ name: z.string().trim().min(1).max(120), amount: moneyString.refine((value) => Number(value) > 0), dueDate: z.string().date(), categoryId: z.string().min(1), recurring: z.enum(["none", "weekly", "monthly", "yearly"]) });
export const budgetSchema = z.object({ categoryId: z.string().min(1), amount: moneyString.refine((value) => Number(value) >= 0), month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/) });
const assistantHistoryItemSchema = z.object({ role: z.enum(["user", "assistant"]), content: z.string().trim().min(1).max(1_000) });
const assistantContextSchema = z.object({
  categorySpending: z.array(z.object({ name: z.string().trim().min(1).max(60), amountMinor: z.number().int().nonnegative() })).max(30).default([]),
  upcomingBills: z.array(z.object({ name: z.string().trim().min(1).max(120), amountMinor: z.number().int().nonnegative(), dueDate: z.string().date() })).max(20).default([]),
  budgets: z.array(z.object({ category: z.string().trim().min(1).max(60), amountMinor: z.number().int().nonnegative(), spentMinor: z.number().int().nonnegative() })).max(30).default([]),
  goals: z.array(z.object({ name: z.string().trim().min(1).max(120), targetMinor: z.number().int().nonnegative(), savedMinor: z.number().int().nonnegative(), targetDate: z.string().date().nullable() })).max(20).default([])
}).default({});
export const assistantRequestSchema = z.object({
  question: z.string().trim().min(1).max(700),
  summary: z.object({ availableBalanceMinor: z.number().int(), projectedBalanceMinor: z.number().int(), unpaidBillsMinor: z.number().int().nonnegative(), expectedRemainingMinor: z.number().int().nonnegative(), shortfall: z.boolean() }),
  currency: z.enum(["BDT", "USD", "EUR", "GBP", "INR"]),
  context: assistantContextSchema,
  history: z.array(assistantHistoryItemSchema).max(10).default([])
});
