export type FinancialActionEntity = "transaction" | "bill" | "budget" | "savings_goal";
export type FinancialActionRequest = {
  request_id: string;
  entity: FinancialActionEntity;
  operation: "create" | "update";
  record_id?: string;
  expected_updated_at?: string;
  fields: Record<string, unknown>;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const FREQUENCIES = ["none", "weekly", "monthly", "yearly"];
const TOOL_FIELDS: Record<string, { entity: FinancialActionEntity; required: string[]; allowed: string[] }> = {
  propose_transaction: { entity: "transaction", required: ["type", "amount_minor", "description", "category_name", "transaction_date"], allowed: ["type", "amount_minor", "description", "category_name", "transaction_date", "account", "notes", "recurring"] },
  propose_bill: { entity: "bill", required: ["name", "amount_minor", "due_date", "category_name"], allowed: ["name", "amount_minor", "due_date", "category_name", "recurring"] },
  propose_budget: { entity: "budget", required: ["amount_minor", "category_name", "month"], allowed: ["amount_minor", "category_name", "month"] },
  propose_savings_goal: { entity: "savings_goal", required: ["name", "target_minor"], allowed: ["name", "target_minor", "target_date", "color"] },
};

function validDate(value: unknown) {
  if (typeof value !== "string" || !DATE.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
}

function validField(key: string, value: unknown, entity?: FinancialActionEntity) {
  if (key === "amount_minor") return Number.isSafeInteger(value) && (value as number) >= (entity === "budget" ? 0 : 1);
  if (key === "target_minor") return Number.isSafeInteger(value) && (value as number) > 0;
  if (key === "saved_minor") return Number.isSafeInteger(value) && (value as number) >= 0;
  if (key === "type") return value === "income" || value === "expense";
  if (key === "recurring") return typeof value === "string" && FREQUENCIES.includes(value);
  if (key === "transaction_date" || key === "due_date" || key === "target_date") return value === null && key === "target_date" || validDate(value);
  if (key === "month") return typeof value === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
  if (key === "color") return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value);
  if (["description", "name", "category_name"].includes(key)) {
    const limit = key === "description" ? 120 : key === "category_name" ? 50 : key === "name" ? 120 : 100;
    return typeof value === "string" && value.trim().length > 0 && value.trim().length <= limit;
  }
  if (key === "account") return value === null || typeof value === "string" && value.length <= 80;
  if (key === "notes") return value === null || typeof value === "string" && value.length <= 500;
  return false;
}

export function parseActionProposal(toolName: string, raw: string): Omit<FinancialActionRequest, "request_id"> | null {
  const definition = TOOL_FIELDS[toolName];
  if (!definition) return null;
  let input: unknown;
  try { input = JSON.parse(raw); } catch { return null; }
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const args = input as Record<string, unknown>;
  const operation = args.operation;
  if (operation !== "create" && operation !== "update") return null;
  if (Object.keys(args).some((key) => !["operation", "record_id", "expected_updated_at", ...definition.allowed].includes(key))) return null;
  const recordId = args.record_id === null ? undefined : args.record_id;
  if (operation === "update" && (typeof recordId !== "string" || !UUID.test(recordId))) return null;
  if (operation === "create" && recordId !== undefined) return null;
  const expectedUpdatedAt = args.expected_updated_at === null ? undefined : args.expected_updated_at;
  if (operation === "update" && (typeof expectedUpdatedAt !== "string" || !Number.isFinite(Date.parse(expectedUpdatedAt)))) return null;
  if (operation === "create" && expectedUpdatedAt !== undefined) return null;
  const fields = Object.fromEntries(definition.allowed.filter((key) => key in args && (args[key] !== null || key === "target_date" || key === "account" || key === "notes")).map((key) => [key, args[key]]));
  if (!Object.keys(fields).length || Object.entries(fields).some(([key, value]) => !validField(key, value, definition.entity))) return null;
  if (operation === "create" && definition.required.some((key) => !(key in fields))) return null;
  return { entity: definition.entity, operation, ...(typeof recordId === "string" ? { record_id: recordId } : {}), ...(typeof expectedUpdatedAt === "string" ? { expected_updated_at: expectedUpdatedAt } : {}), fields };
}

export function actionSchema(toolName: string) {
  const definition = TOOL_FIELDS[toolName];
  if (!definition) return null;
  const fields: Record<string, unknown> = {
    operation: { type: "string", enum: ["create", "update"] },
    record_id: { type: ["string", "null"], description: "Required for update; use an id returned by a read-only tool. Omit for create." },
    expected_updated_at: { type: ["string", "null"], description: "Required for update; copy updated_at from the same read-only tool result." },
  };
  for (const key of definition.allowed) {
    fields[key] = key === "type" ? { type: ["string", "null"], enum: ["income", "expense", null] }
      : key === "recurring" ? { type: ["string", "null"], enum: [...FREQUENCIES, null] }
        : ["amount_minor", "target_minor"].includes(key) ? { type: ["integer", "null"], minimum: key === "amount_minor" && definition.entity === "budget" ? 0 : 1 }
          : key === "target_date" ? { type: ["string", "null"] }
            : key === "month" ? { type: ["string", "null"], pattern: "^\\d{4}-(0[1-9]|1[0-2])$" }
              : { type: ["string", "null"] };
  }
  return { properties: fields, required: ["operation"] };
}

export type ActionStore = {
  getOwnedRecord: (table: string, id: string, userId: string) => Promise<Record<string, unknown> | null>;
  findOwnedCategory: (name: string, userId: string) => Promise<string | null>;
  insert: (table: string, row: Record<string, unknown>) => Promise<Record<string, unknown>>;
  update: (table: string, id: string, userId: string, expectedUpdatedAt: string, patch: Record<string, unknown>) => Promise<Record<string, unknown> | null>;
};

const TABLES: Record<FinancialActionEntity, string> = { transaction: "transactions", bill: "bills", budget: "budgets", savings_goal: "savings_goals" };
const COLUMNS: Record<FinancialActionEntity, Record<string, string>> = {
  transaction: { type: "type", amount_minor: "amount_minor", description: "description", category_name: "category_id", transaction_date: "transaction_date", account: "account", notes: "notes", recurring: "recurring" },
  bill: { name: "name", amount_minor: "amount_minor", due_date: "due_date", category_name: "category_id", recurring: "recurring" },
  budget: { amount_minor: "amount_minor", category_name: "category_id", month: "month" },
  savings_goal: { name: "name", target_minor: "target_minor", saved_minor: "saved_minor", target_date: "target_date", color: "color" },
};

export async function executeConfirmedAction(store: ActionStore, userId: string, request: FinancialActionRequest) {
  if (!request || typeof request !== "object" || !request.fields || typeof request.fields !== "object" || Array.isArray(request.fields)
    || !UUID.test(userId) || !UUID.test(request.request_id) || !TABLES[request.entity]
    || (request.operation !== "create" && request.operation !== "update") || Object.keys(request.fields).length === 0) throw new Error("Invalid action request");
  const table = TABLES[request.entity];
  const source = request.fields;
  const row: Record<string, unknown> = { user_id: userId };
  for (const [key, value] of Object.entries(source)) {
    if (!validField(key, value, request.entity) || !(key in COLUMNS[request.entity])) throw new Error("Invalid action fields");
    row[COLUMNS[request.entity][key]] = key === "category_name" ? await store.findOwnedCategory(value as string, userId) : value;
    if (key === "category_name" && !row.category_id) throw new Error("Category not found in your workspace");
    if (key === "month") row.month = `${value}-01`;
  }
  const definition = Object.values(TOOL_FIELDS).find((item) => item.entity === request.entity)!;
  if (request.operation === "create") {
    if (definition.required.some((key) => !(key in source))) throw new Error("Required fields are missing");
    row.id = request.request_id;
    if (request.entity === "transaction") Object.assign(row, { account: null, notes: null, recurring: "none" });
    if (request.entity === "bill") Object.assign(row, { recurring: "none" });
    if (request.entity === "savings_goal") Object.assign(row, { target_date: null, color: "#4978d6" });
    const existing = await store.getOwnedRecord(table, request.request_id, userId);
    if (existing) {
      const equivalent = Object.entries(row).every(([key, value]) => key in existing && (typeof value === "number" ? Number(existing[key]) === value : existing[key] === value));
      if (equivalent) return { success: true, duplicate: true, id: request.request_id };
      throw new Error("This confirmation was already used with different details");
    }
    const saved = await store.insert(table, row);
    if (typeof saved.id !== "string" || saved.id !== request.request_id) throw new Error("The database did not confirm the inserted record");
    return { success: true, duplicate: false, id: saved.id };
  }
  if (!request.record_id || !UUID.test(request.record_id) || !request.expected_updated_at || !Number.isFinite(Date.parse(request.expected_updated_at))) throw new Error("Current record id and update timestamp are required");
  const current = await store.getOwnedRecord(table, request.record_id, userId);
  if (!current) throw new Error("Record not found in your workspace");
  if (request.entity === "bill" && current.paid_at) throw new Error("A paid bill cannot be updated");
  if (request.entity === "transaction" && current.bill_id) throw new Error("A bill-linked transaction cannot be updated directly");
  if (current.updated_at !== request.expected_updated_at) throw new Error("This record changed since the proposal. Refresh and ask again.");
  const patch = { ...row };
  delete patch.user_id;
  delete patch.id;
  const updated = await store.update(table, request.record_id, userId, request.expected_updated_at, patch);
  if (!updated || updated.id !== request.record_id) throw new Error("This record changed or is no longer available. Refresh and ask again.");
  return { success: true, duplicate: false, id: request.record_id };
}
