import type { SupabaseClient } from "@supabase/supabase-js";
import { defaultCategorySeeds } from "@/lib/demo-data";
import type { FinanceState } from "@/types/finance";

type DbRow = Record<string, unknown>;
const asRows = (rows: unknown) => (Array.isArray(rows) ? rows : []) as DbRow[];
const text = (row: DbRow, key: string) => String(row[key] ?? "");
const number = (row: DbRow, key: string) => Number(row[key] ?? 0);

export async function loadCloudWorkspace(client: SupabaseClient, userId: string): Promise<FinanceState | null> {
  const profileResult = await client.from("profiles").select("*").eq("id", userId).maybeSingle();
  if (profileResult.error) throw profileResult.error;
  if (!profileResult.data) {
    const { error } = await client.from("profiles").insert({ id: userId });
    if (error) throw error;
  }
  let categoryResult = await client.from("categories").select("*").eq("user_id", userId).order("name");
  if (categoryResult.error) throw categoryResult.error;
  if (!categoryResult.data?.length) {
    const { error } = await client.from("categories").insert(defaultCategorySeeds.map(([name, color]) => ({ user_id:userId,name,color,is_default:true })));
    if (error) throw error;
    categoryResult = await client.from("categories").select("*").eq("user_id", userId).order("name");
    if (categoryResult.error) throw categoryResult.error;
  }
  const [{ data: profile }, { data: transactions, error: transactionError }, { data: budgets, error: budgetError }, { data: bills, error: billError }, { data: goals, error: goalError }, { data: contributions, error: contributionError }, { data: activities, error: activityError }] = await Promise.all([
    client.from("profiles").select("*").eq("id",userId).single(), client.from("transactions").select("*").eq("user_id",userId), client.from("budgets").select("*").eq("user_id",userId), client.from("bills").select("*").eq("user_id",userId), client.from("savings_goals").select("*").eq("user_id",userId), client.from("savings_contributions").select("*").eq("user_id",userId), client.from("activity_history").select("*").eq("user_id",userId).order("created_at",{ascending:false}).limit(100)
  ]);
  const firstError = transactionError || budgetError || billError || goalError || contributionError || activityError;
  if (firstError || !profile) throw firstError ?? new Error("Profile could not be loaded.");
  return {
    profile:{currency:text(profile as DbRow,"currency") as FinanceState["profile"]["currency"],timezone:text(profile as DbRow,"timezone"),openingBalanceMinor:number(profile as DbRow,"opening_balance_minor"),expectedRemainingMinor:(profile as DbRow).expected_remaining_minor === null ? null : number(profile as DbRow,"expected_remaining_minor"),onboardingComplete:Boolean((profile as DbRow).onboarding_complete)},
    categories:asRows(categoryResult.data).map((row) => ({id:text(row,"id"),name:text(row,"name"),color:text(row,"color"),isDefault:Boolean(row.is_default)})),
    transactions:asRows(transactions).map((row) => ({id:text(row,"id"),amountMinor:number(row,"amount_minor"),type:text(row,"type") as "income" | "expense",description:text(row,"description"),categoryId:text(row,"category_id"),transactionDate:text(row,"transaction_date"),account:row.account ? text(row,"account") : undefined,notes:row.notes ? text(row,"notes") : undefined,recurring:text(row,"recurring") as "none" | "weekly" | "monthly" | "yearly",billId:row.bill_id ? text(row,"bill_id") : undefined,createdAt:text(row,"created_at")})),
    budgets:asRows(budgets).map((row) => ({id:text(row,"id"),categoryId:text(row,"category_id"),amountMinor:number(row,"amount_minor"),month:text(row,"month").slice(0,7),createdAt:text(row,"created_at")})),
    bills:asRows(bills).map((row) => ({id:text(row,"id"),name:text(row,"name"),amountMinor:number(row,"amount_minor"),dueDate:text(row,"due_date"),categoryId:text(row,"category_id"),recurring:text(row,"recurring") as "none" | "weekly" | "monthly" | "yearly",paidAt:row.paid_at ? text(row,"paid_at") : null,transactionId:row.paid_transaction_id ? text(row,"paid_transaction_id") : null})),
    goals:asRows(goals).map((row) => ({id:text(row,"id"),name:text(row,"name"),targetMinor:number(row,"target_minor"),savedMinor:number(row,"saved_minor"),targetDate:row.target_date ? text(row,"target_date") : null,color:text(row,"color")})),
    contributions:asRows(contributions).map((row) => ({id:text(row,"id"),goalId:text(row,"goal_id"),amountMinor:number(row,"amount_minor"),date:text(row,"contribution_date"),note:row.note ? text(row,"note") : undefined})),
    activities:asRows(activities).map((row) => ({id:text(row,"id"),action:text(row,"action"),detail:text(row,"detail"),createdAt:text(row,"created_at")}))
  };
}

async function upsert(client: SupabaseClient, table: string, rows: DbRow[]) {
  if (rows.length) { const { error } = await client.from(table).upsert(rows,{onConflict:"id"}); if (error) throw error; }
}

function rowsChanged(next: DbRow[], previous: DbRow[]) {
  const previousById = new Map(previous.map((row) => [text(row,"id"), JSON.stringify(row)]));
  return next.filter((row) => previousById.get(text(row,"id")) !== JSON.stringify(row));
}

function deletedIds(next: DbRow[], previous: DbRow[]) {
  const wanted = new Set(next.map((row) => text(row,"id")));
  return previous.map((row) => text(row,"id")).filter((id) => !wanted.has(id));
}

async function deleteRows(client: SupabaseClient, table: string, ids: string[]) {
  if (!ids.length) return;
  const { error } = await client.from(table).delete().in("id",ids);
  if (error) throw error;
}

export function cloneFinanceState(state: FinanceState): FinanceState {
  return JSON.parse(JSON.stringify(state)) as FinanceState;
}

/**
 * Sends only changes made since this browser loaded or last refreshed the cloud
 * workspace. This avoids treating a stale device snapshot as an authority that
 * can delete rows created on another device. RLS and ownership triggers remain
 * the server-side boundary; calls are serialized by the UI.
 */
export async function syncCloudWorkspace(client: SupabaseClient, userId: string, state: FinanceState, baseline: FinanceState | null) {
  const previous = baseline ?? { ...state, categories:[], transactions:[], budgets:[], bills:[], goals:[], contributions:[], activities:[] };
  const profile = { id:userId,currency:state.profile.currency,timezone:state.profile.timezone,opening_balance_minor:state.profile.openingBalanceMinor,expected_remaining_minor:state.profile.expectedRemainingMinor,onboarding_complete:state.profile.onboardingComplete };
  const previousProfile = { id:userId,currency:previous.profile.currency,timezone:previous.profile.timezone,opening_balance_minor:previous.profile.openingBalanceMinor,expected_remaining_minor:previous.profile.expectedRemainingMinor,onboarding_complete:previous.profile.onboardingComplete };
  if (JSON.stringify(profile) !== JSON.stringify(previousProfile)) {
    const { error } = await client.from("profiles").upsert(profile);
    if (error) throw error;
  }
  const categories = state.categories.map((row) => ({id:row.id,user_id:userId,name:row.name,color:row.color,is_default:Boolean(row.isDefault)}));
  const previousCategories = previous.categories.map((row) => ({id:row.id,user_id:userId,name:row.name,color:row.color,is_default:Boolean(row.isDefault)}));
  const bills = state.bills.map((row) => ({id:row.id,user_id:userId,name:row.name,amount_minor:row.amountMinor,due_date:row.dueDate,category_id:row.categoryId,recurring:row.recurring,paid_at:row.paidAt,paid_transaction_id:row.transactionId}));
  const previousBills = previous.bills.map((row) => ({id:row.id,user_id:userId,name:row.name,amount_minor:row.amountMinor,due_date:row.dueDate,category_id:row.categoryId,recurring:row.recurring,paid_at:row.paidAt,paid_transaction_id:row.transactionId}));
  const transactions = state.transactions.map((row) => ({id:row.id,user_id:userId,amount_minor:row.amountMinor,type:row.type,description:row.description,category_id:row.categoryId,transaction_date:row.transactionDate,account:row.account ?? null,notes:row.notes ?? null,recurring:row.recurring,bill_id:row.billId ?? null}));
  const previousTransactions = previous.transactions.map((row) => ({id:row.id,user_id:userId,amount_minor:row.amountMinor,type:row.type,description:row.description,category_id:row.categoryId,transaction_date:row.transactionDate,account:row.account ?? null,notes:row.notes ?? null,recurring:row.recurring,bill_id:row.billId ?? null}));
  const budgets = state.budgets.map((row) => ({id:row.id,user_id:userId,category_id:row.categoryId,amount_minor:row.amountMinor,month:`${row.month}-01`}));
  const previousBudgets = previous.budgets.map((row) => ({id:row.id,user_id:userId,category_id:row.categoryId,amount_minor:row.amountMinor,month:`${row.month}-01`}));
  const goals = state.goals.map((row) => ({id:row.id,user_id:userId,name:row.name,target_minor:row.targetMinor,saved_minor:row.savedMinor,target_date:row.targetDate,color:row.color}));
  const previousGoals = previous.goals.map((row) => ({id:row.id,user_id:userId,name:row.name,target_minor:row.targetMinor,saved_minor:row.savedMinor,target_date:row.targetDate,color:row.color}));
  const contributions = state.contributions.map((row) => ({id:row.id,user_id:userId,goal_id:row.goalId,amount_minor:row.amountMinor,contribution_date:row.date,note:row.note ?? null}));
  const previousContributions = previous.contributions.map((row) => ({id:row.id,user_id:userId,goal_id:row.goalId,amount_minor:row.amountMinor,contribution_date:row.date,note:row.note ?? null}));
  const activities = state.activities.map((row) => ({id:row.id,user_id:userId,action:row.action,detail:row.detail,created_at:row.createdAt}));
  const previousActivities = previous.activities.map((row) => ({id:row.id,user_id:userId,action:row.action,detail:row.detail,created_at:row.createdAt}));

  // Parents first. New bills are seeded without a payment reference so a new
  // linked transaction can be inserted before the final bill reference is set.
  await upsert(client,"categories",rowsChanged(categories,previousCategories));
  const previousBillIds = new Set(previousBills.map((row) => text(row,"id")));
  await upsert(client,"bills",bills.filter((row) => !previousBillIds.has(text(row,"id"))).map((row) => ({ ...row, paid_transaction_id:null })));
  await upsert(client,"transactions",rowsChanged(transactions,previousTransactions));
  await upsert(client,"budgets",rowsChanged(budgets,previousBudgets));
  await upsert(client,"savings_goals",rowsChanged(goals,previousGoals));
  await upsert(client,"savings_contributions",rowsChanged(contributions,previousContributions));
  await upsert(client,"bills",rowsChanged(bills,previousBills));
  // Activity history is append-only from the client: a 100-item local display
  // limit must not erase older audit entries or another device's activity.
  await upsert(client,"activity_history",rowsChanged(activities,previousActivities));

  // Intentional deletes are limited to rows this device had already loaded;
  // rows created elsewhere after that load are never considered stale here.
  await deleteRows(client,"savings_contributions",deletedIds(contributions,previousContributions));
  await deleteRows(client,"transactions",deletedIds(transactions,previousTransactions));
  await deleteRows(client,"budgets",deletedIds(budgets,previousBudgets));
  await deleteRows(client,"bills",deletedIds(bills,previousBills));
  await deleteRows(client,"savings_goals",deletedIds(goals,previousGoals));
  await deleteRows(client,"categories",deletedIds(categories,previousCategories));
}
