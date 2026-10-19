import { describe, expect, it } from "vitest";
import { executeConfirmedAction, parseActionProposal, type ActionStore } from "../supabase/functions/_shared/financial-actions";

const userId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const otherUserId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const categoryId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const requestId = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const recordId = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";

function memoryStore(seed: Record<string, unknown>[] = [], shouldFailInsert = false): ActionStore {
  const rows = new Map(seed.map((row) => [String(row.id), row]));
  return {
    async getOwnedRecord(_table, id, owner) {
      const row = rows.get(id);
      return row?.user_id === owner ? row : null;
    },
    async findOwnedCategory(name, owner) {
      return owner === userId && name.toLowerCase() === "food" ? categoryId : null;
    },
    async insert(_table, row) {
      if (shouldFailInsert) throw new Error("database unavailable");
      if (rows.has(String(row.id))) throw new Error("duplicate key");
      rows.set(String(row.id), row);
      return { id: row.id };
    },
    async update(_table, id, owner, expectedUpdatedAt, patch) {
      const row = rows.get(id);
      if (!row || row.user_id !== owner || row.updated_at !== expectedUpdatedAt) return null;
      rows.set(id, { ...row, ...patch });
      return { id };
    },
  };
}

describe("confirmed financial actions", () => {
  it("validates a complete transaction proposal and rejects missing required details", () => {
    expect(parseActionProposal("propose_transaction", JSON.stringify({
      operation: "create", type: "expense", amount_minor: 1200, description: "Lunch", category_name: "Food", transaction_date: "2026-10-19",
    }))).toMatchObject({ entity: "transaction", operation: "create", fields: { amount_minor: 1200 } });
    expect(parseActionProposal("propose_transaction", '{"operation":"create","amount_minor":100}')).toBeNull();
    expect(parseActionProposal("propose_transaction", '{"operation":"create","type":"expense","amount_minor":-1,"description":"x","category_name":"Food","transaction_date":"2026-10-19"}')).toBeNull();
  });

  it("validates bill, zero-valued budget, and savings-goal proposals", () => {
    expect(parseActionProposal("propose_bill", JSON.stringify({ operation:"create", name:"Internet", amount_minor:1000, due_date:"2026-10-25", category_name:"Food" }))).toMatchObject({ entity:"bill" });
    expect(parseActionProposal("propose_budget", JSON.stringify({ operation:"create", amount_minor:0, category_name:"Food", month:"2026-10" }))).toMatchObject({ entity:"budget" });
    expect(parseActionProposal("propose_savings_goal", JSON.stringify({ operation:"create", name:"Emergency", target_minor:10000 }))).toMatchObject({ entity:"savings_goal" });
    expect(parseActionProposal("propose_bill", '{"operation":"create","name":"Internet","amount_minor":0,"due_date":"not-a-date","category_name":"Food"}')).toBeNull();
    expect(parseActionProposal("propose_savings_goal", '{"operation":"update","record_id":null,"target_date":null,"color":null}')).toBeNull();
    expect(parseActionProposal("propose_savings_goal", '{"operation":"update","record_id":"eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee","expected_updated_at":"2026-10-19T00:00:00Z","target_date":null,"color":null}')).toMatchObject({ operation:"update", fields:{target_date:null} });
  });

  it("creates a confirmed expense in the authenticated user's category and is idempotent", async () => {
    const request = {
      request_id: requestId, entity: "transaction" as const, operation: "create" as const,
      fields: { type: "expense", amount_minor: 1200, description: "Lunch", category_name: "Food", transaction_date: "2026-10-19" },
    };
    const store = memoryStore();
    expect(await executeConfirmedAction(store, userId, request)).toMatchObject({ success: true, duplicate: false, id: requestId });
    expect(await executeConfirmedAction(store, userId, request)).toMatchObject({ success: true, duplicate: true, id: requestId });
  });

  it("does not resolve another user's category or update another user's row", async () => {
    const proposal = {
      request_id: requestId, entity: "transaction" as const, operation: "create" as const,
      fields: { type: "expense", amount_minor: 1200, description: "Lunch", category_name: "Food", transaction_date: "2026-10-19" },
    };
    await expect(executeConfirmedAction(memoryStore(), otherUserId, proposal)).rejects.toThrow("Category not found in your workspace");
    const update = { request_id: requestId, entity: "bill" as const, operation: "update" as const, record_id: recordId, expected_updated_at:"2026-10-19T00:00:00Z", fields: { name: "Changed bill" } };
    const store = memoryStore([{ id: recordId, user_id: userId, name: "Private bill", paid_at: null, updated_at:"2026-10-19T00:00:00Z" }]);
    await expect(executeConfirmedAction(store, otherUserId, update)).rejects.toThrow("Record not found in your workspace");
  });

  it("supports updates only to owned, unpaid records and reports failed database writes", async () => {
    const store = memoryStore([{ id: recordId, user_id: userId, name: "Internet", amount_minor: 1000, paid_at: null, updated_at:"2026-10-19T00:00:00Z" }]);
    const update = { request_id: requestId, entity: "bill" as const, operation: "update" as const, record_id: recordId, expected_updated_at:"2026-10-19T00:00:00Z", fields: { amount_minor: 1500 } };
    expect(await executeConfirmedAction(store, userId, update)).toMatchObject({ success: true, id: recordId });
    const paidStore = memoryStore([{ id: recordId, user_id: userId, paid_at: "2026-10-01T00:00:00Z", updated_at:"2026-10-19T00:00:00Z" }]);
    await expect(executeConfirmedAction(paidStore, userId, update)).rejects.toThrow("paid bill cannot be updated");
    await expect(executeConfirmedAction(memoryStore([{ id: recordId, user_id: userId, paid_at:null, updated_at:"2026-10-20T00:00:00Z" }]), userId, update)).rejects.toThrow("changed since the proposal");
    await expect(executeConfirmedAction(memoryStore([{ id: recordId, user_id: userId, paid_at:null, updated_at:"2026-10-19T00:00:00Z" }]), userId, { ...update, fields:{} })).rejects.toThrow("Invalid action request");
    const linkedTransaction = { request_id:requestId, entity:"transaction" as const, operation:"update" as const, record_id:recordId, expected_updated_at:"2026-10-19T00:00:00Z", fields:{description:"Changed"} };
    await expect(executeConfirmedAction(memoryStore([{ id:recordId,user_id:userId,bill_id:"linked-bill",updated_at:"2026-10-19T00:00:00Z" }]),userId,linkedTransaction)).rejects.toThrow("bill-linked transaction cannot be updated");
    await expect(executeConfirmedAction(memoryStore([], true), userId, {
      request_id: requestId, entity: "savings_goal", operation: "create", fields: { name: "Emergency", target_minor: 10000 },
    })).rejects.toThrow("database unavailable");
  });

  it("creates bills, budgets, and savings goals only after the confirmed executor is called", async () => {
    const store = memoryStore();
    const requests = [
      { request_id:requestId, entity:"bill" as const, operation:"create" as const, fields:{name:"Internet",amount_minor:1000,due_date:"2026-10-25",category_name:"Food"} },
      { request_id:"ffffffff-ffff-4fff-8fff-ffffffffffff", entity:"budget" as const, operation:"create" as const, fields:{amount_minor:0,category_name:"Food",month:"2026-10"} },
      { request_id:"11111111-1111-4111-8111-111111111111", entity:"savings_goal" as const, operation:"create" as const, fields:{name:"Emergency",target_minor:10000} },
    ];
    for (const request of requests) expect(await executeConfirmedAction(store, userId, request)).toMatchObject({ success:true, duplicate:false });
  });
});
