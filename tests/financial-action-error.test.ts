import { describe, expect, it } from "vitest";
import { getFinancialActionError } from "../lib/financial-action-error";

describe("safe financial action errors", () => {
  it("shows a known category validation error from the Edge Function", async () => {
    const error = Object.assign(new Error("Edge Function returned a non-2xx status code"), {
      context: new Response(JSON.stringify({ error: "Category not found in your workspace" }), { status: 400 }),
    });
    await expect(getFinancialActionError(error)).resolves.toBe("Category not found in your workspace");
  });

  it("never exposes raw database errors or connection internals", async () => {
    const error = Object.assign(new Error("Edge Function failed"), {
      context: new Response(JSON.stringify({ error: "duplicate key value violates secret constraint finance_private" }), { status: 500 }),
    });
    await expect(getFinancialActionError(error)).resolves.toBe("Not saved. Check your connection and try again; no success was reported.");
    await expect(getFinancialActionError(new Error("JWT expired"))).resolves.toBe("Not saved. Check your connection and try again; no success was reported.");
  });

  it("accepts only allowlisted user-safe response data", async () => {
    await expect(getFinancialActionError(null, { error: "Record not found in your workspace" })).resolves.toBe("Record not found in your workspace");
    await expect(getFinancialActionError(null, { error: "Postgres error: RLS policy name" })).resolves.toBe("Not saved. Check your connection and try again; no success was reported.");
  });
});
