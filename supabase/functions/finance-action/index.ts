// Deploy with: supabase functions deploy finance-action
// Writes use the authenticated caller JWT and existing RLS policies; no service-role key.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.117.3";
import { executeConfirmedAction, type ActionStore, type FinancialActionRequest } from "../_shared/financial-actions.ts";

const corsHeaders = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...corsHeaders } });
const ENTITIES = new Set(["transaction", "bill", "budget", "savings_goal"]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const authorization = request.headers.get("Authorization");
  if (!authorization) return json({ error: "Sign in required" }, 401);
  const url = Deno.env.get("SUPABASE_URL");
  const anon = Deno.env.get("SUPABASE_ANON_KEY");
  if (!url || !anon) return json({ error: "Action service unavailable" }, 503);
  const client = createClient(url, anon, { global: { headers: { Authorization: authorization } } });
  const { data: { user }, error: authError } = await client.auth.getUser();
  if (authError || !user) return json({ error: "Invalid session" }, 401);
  const input: unknown = await request.json().catch(() => null);
  if (!input || typeof input !== "object" || Array.isArray(input)) return json({ error: "Invalid confirmed action" }, 400);
  const body = input as Record<string, unknown>;
  if (typeof body.confirmed !== "boolean" || !body.confirmed) return json({ error: "Explicit confirmation is required" }, 400);
  const value = body.action;
  if (!value || typeof value !== "object" || Array.isArray(value)) return json({ error: "Invalid confirmed action" }, 400);
  const action = value as Record<string, unknown>;
  if (typeof action.request_id !== "string" || !UUID.test(action.request_id)
    || typeof action.entity !== "string" || !ENTITIES.has(action.entity)
    || (action.operation !== "create" && action.operation !== "update")
    || (action.record_id !== undefined && (typeof action.record_id !== "string" || !UUID.test(action.record_id)))
    || !action.fields || typeof action.fields !== "object" || Array.isArray(action.fields)) {
    return json({ error: "Invalid confirmed action" }, 400);
  }
  const store: ActionStore = {
    async getOwnedRecord(table, id, userId) {
      const { data, error } = await client.from(table).select("*").eq("id", id).eq("user_id", userId).maybeSingle();
      if (error) throw error;
      return data as Record<string, unknown> | null;
    },
    async findOwnedCategory(name, userId) {
      const { data, error } = await client.from("categories").select("id,name").eq("user_id", userId);
      if (error) throw error;
      return data?.find((item: { id: string; name: string }) => item.name.toLocaleLowerCase("en-US") === name.trim().toLocaleLowerCase("en-US"))?.id ?? null;
    },
    async insert(table, row) {
      const { data, error } = await client.from(table).insert(row).select("id").single();
      if (error) throw error;
      return data as Record<string, unknown>;
    },
    async update(table, id, userId, expectedUpdatedAt, patch) {
      const { data, error } = await client.from(table).update(patch).eq("id", id).eq("user_id", userId).eq("updated_at", expectedUpdatedAt).select("id").maybeSingle();
      if (error) throw error;
      return data as Record<string, unknown> | null;
    },
  };
  try {
    const result = await executeConfirmedAction(store, user.id, action as unknown as FinancialActionRequest);
    return json(result);
  } catch (error) {
    // Supabase/PostgREST errors are structured objects and are not always instanceof Error.
    // Classify only allowlisted error codes and messages; never log raw SQL or user data.
    const details = error && typeof error === "object" ? error as Record<string, unknown> : {};
    const message = typeof details.message === "string" ? details.message : "";
    const code = typeof details.code === "string" ? details.code : "";
    const safeKnown = ["Invalid action request", "Invalid action fields", "Required fields are missing", "Current record id and update timestamp are required", "Category not found in your workspace", "Record not found in your workspace", "A paid bill cannot be updated", "A bill-linked transaction cannot be updated directly", "This confirmation was already used with different details", "This record changed since the proposal. Refresh and ask again.", "This record changed or is no longer available. Refresh and ask again."];
    const constraint = ["23505", "23503", "23514", "23502"].includes(code);
    const conflict = code === "23505" || message.includes("already used") || /duplicate key|unique constraint/i.test(message);
    const validation = safeKnown.includes(message);
    const reason = code === "23505" ? "duplicate_record"
      : code === "23503" ? "invalid_reference"
      : code === "23514" || code === "23502" ? "constraint_violation"
      : code === "42501" ? "permission_denied"
      : validation ? "validation" : "unexpected_error";
    console.error(JSON.stringify({ event: "finance_action_failed", entity: action.entity, operation: action.operation, request_id: action.request_id, reason, ...(constraint || code === "42501" ? { db_code: code } : {}) }));
    const publicError = validation ? message
      : conflict && action.entity === "budget" ? "A budget already exists for that category and month. Refresh and propose an update instead."
      : conflict ? "A matching financial record already exists. Refresh and review your workspace."
      : code === "23503" ? "The selected category or related record is not available in your workspace. Refresh and choose an existing category."
      : code === "23514" || code === "23502" ? "The proposed values were rejected. Review the amount, date, and category."
      : code === "42501" ? "Your account does not have permission to save this change. Sign in again and check your email verification."
      : "The change was not saved. Refresh your workspace and try again.";
    return json({ error: publicError }, conflict || /record changed/i.test(message) ? 409 : validation || constraint ? 400 : code === "42501" ? 403 : 500);
  }
});
