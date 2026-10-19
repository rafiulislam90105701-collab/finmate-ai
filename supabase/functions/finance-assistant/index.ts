// Deploy with: supabase functions deploy finance-assistant
// This function deliberately uses the caller JWT and RLS—not the service role—to scope all data.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { explainFinancialRisk, simulateBudgetScenario } from "../_shared/agent-tools.ts";

const corsHeaders = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...corsHeaders } });
const textFromResponse = (response: unknown) => {
  if (!response || typeof response !== "object") return "";
  const output = (response as { output?: unknown }).output;
  if (!Array.isArray(output)) return "";
  return output.flatMap((item) => {
    if (!item || typeof item !== "object" || (item as { type?: unknown }).type !== "message") return [];
    const content = (item as { content?: unknown }).content;
    if (!Array.isArray(content)) return [];
    return content.flatMap((part) => part && typeof part === "object" && (part as { type?: unknown }).type === "output_text" && typeof (part as { text?: unknown }).text === "string" ? [(part as { text: string }).text] : []);
  }).join("\n").trim();
};
const currentMonth = () => new Date().toISOString().slice(0,7);
const nextMonthStart = (month: string) => {
  const [year, currentMonthNumber] = month.split("-").map(Number);
  const nextYear = currentMonthNumber === 12 ? year + 1 : year;
  const nextMonthNumber = currentMonthNumber === 12 ? 1 : currentMonthNumber + 1;
  return `${nextYear}-${String(nextMonthNumber).padStart(2,"0")}-01`;
};
const money = (amountMinor: number, currency: string) => new Intl.NumberFormat("en-BD", { style:"currency", currency, maximumFractionDigits:2 }).format(amountMinor / 100);
const date = (value: string) => new Intl.DateTimeFormat("en-BD", { day:"numeric", month:"short" }).format(new Date(`${value}T12:00:00`));
const rulesAnswer = (question: string, currency: string, data: { available:number; projected:number; unpaidMinor:number; expected:number; categories:{ category:string; spentMinor:number }[]; bills:{ name:string; amountMinor:number; dueDate:string }[]; goals:{ name:string; targetMinor:number; savedMinor:number; targetDate:string | null }[] }) => {
  const text = question.toLocaleLowerCase("en-US");
  const category = data.categories.find((item) => text.includes(item.category.toLocaleLowerCase("en-US")));
  const top = [...data.categories].filter((item) => item.spentMinor > 0).sort((a,b) => b.spentMinor - a.spentMinor);
  if (/^(hi|hello|hey|assalamu\s*alaikum|salam)[!.\s]*$/i.test(question)) return "Hello. I can explain your recorded spending, unpaid bills, forecast, budgets, or savings goals. What would you like to check?";
  if (category) return category.spentMinor ? `You have recorded ${money(category.spentMinor,currency)} in ${category.category} this month. This is paid ledger spending only.` : `There are no recorded expenses in ${category.category} this month.`;
  if (/\b(where|what).{0,35}\b(money|spend|spent|spending)|\b(spend|spending|category|categories)\b/.test(text) && !/\b(reduce|cut|lower|save money|spend less|trim)\b/.test(text)) return top.length ? `${top[0].category} is your largest recorded category at ${money(top[0].spentMinor,currency)}.${top[1] ? ` Next is ${top[1].category} at ${money(top[1].spentMinor,currency)}.` : ""}` : "There are no paid expense transactions this month yet, so I cannot identify a largest category.";
  if (/\b(reduce|cut|lower|save money|spend less|trim)\b/.test(text)) return top.length ? `Start with ${top[0].category}, your largest recorded category at ${money(top[0].spentMinor,currency)}. A 10% reduction is about ${money(Math.round(top[0].spentMinor * 0.1),currency)}; this is a planning suggestion, not an automatic change.` : "Add paid expenses first so I can make a data-grounded reduction suggestion.";
  if (/\b(bill|bills|due|upcoming)\b/.test(text)) return data.bills.length ? `You have ${money(data.unpaidMinor,currency)} reserved for unpaid bills. Next: ${data.bills.slice(0,3).map((bill) => `${bill.name} (${money(bill.amountMinor,currency)} due ${date(bill.dueDate)})`).join(", ")}.` : "There are no unpaid bills recorded for this month.";
  if (/\b(forecast|run out|running out|last|balance|month|month-end|end of month)\b/.test(text)) return `${money(data.available,currency)} available − ${money(data.unpaidMinor,currency)} unpaid bills − ${money(data.expected,currency)} expected remaining spending = ${money(data.projected,currency)} estimated at month end.${data.projected < 0 ? " This is below zero, so review planned spending or confirmed income." : " This is an estimate, not a guarantee."}`;
  if (/\b(save|saving|savings|goal|goals|target)\b/.test(text)) { const goal = data.goals.find((item) => item.savedMinor < item.targetMinor); return goal ? `For ${goal.name}, you have saved ${money(goal.savedMinor,currency)} of ${money(goal.targetMinor,currency)}. ${money(Math.max(0,goal.targetMinor-goal.savedMinor),currency)} remains${goal.targetDate ? ` by ${date(goal.targetDate)}` : ""}.` : "There is no unfinished savings goal yet. Create one to receive a data-grounded progress explanation."; }
  return "I can help with recorded spending, unpaid bills, the month-end forecast, budget trade-offs, and savings goals. Try asking where your money is going or how upcoming bills affect the forecast.";
};

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (request.method !== "POST") return json({ error:"Method not allowed" },405);
  const authorization = request.headers.get("Authorization");
  if (!authorization) return json({ error:"Sign in required" },401);
  const url = Deno.env.get("SUPABASE_URL")!; const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
  const supabase = createClient(url, anon, { global:{ headers:{ Authorization:authorization } } });
  const { data:{ user }, error:userError } = await supabase.auth.getUser();
  if (userError || !user) return json({ error:"Invalid session" },401);
  const body = await request.json().catch(() => ({}));
  const question = typeof body.question === "string" ? body.question.slice(0,700).trim() : "Explain my financial summary.";
  if (!question) return json({ error:"Question is required" },400);
  const month = typeof body.month === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(body.month) ? body.month : currentMonth();
  const monthEnd = nextMonthStart(month);
  const [profileResult, transactionResult, billResult, budgetResult, categoryResult, goalResult] = await Promise.all([
    supabase.from("profiles").select("currency,timezone,opening_balance_minor,expected_remaining_minor").single(),
    supabase.from("transactions").select("id,amount_minor,type,category_id,transaction_date,bill_id").gte("transaction_date",`${month}-01`).lt("transaction_date",monthEnd),
    supabase.from("bills").select("id,name,amount_minor,category_id,due_date,paid_at").gte("due_date",`${month}-01`).lt("due_date",monthEnd),
    supabase.from("budgets").select("id,amount_minor,category_id").eq("month",`${month}-01`),
    supabase.from("categories").select("id,name"),
    supabase.from("savings_goals").select("name,target_minor,saved_minor,target_date")
  ]);
  if ([profileResult, transactionResult, billResult, budgetResult, categoryResult, goalResult].some((result) => result.error)) {
    return json({ error:"Could not load the signed-in financial workspace", code:"workspace_unavailable" },503);
  }
  const profile = profileResult.data;
  const transactions = transactionResult.data;
  const bills = billResult.data;
  const budgets = budgetResult.data;
  const categories = categoryResult.data;
  const goals = goalResult.data;
  if (!profile) return json({ error:"Profile unavailable" },404);
  const rows = transactions ?? []; const linkedBillIds = new Set(rows.map((row) => row.bill_id).filter(Boolean));
  const income = rows.filter((row) => row.type === "income").reduce((total,row) => total + row.amount_minor,0);
  const paid = rows.filter((row) => row.type === "expense").reduce((total,row) => total + row.amount_minor,0);
  const unpaid = (bills ?? []).filter((bill) => !bill.paid_at && !linkedBillIds.has(bill.id));
  const unpaidMinor = unpaid.reduce((total,bill) => total + bill.amount_minor,0);
  const spent = rows.filter((row) => row.type === "expense").reduce<Record<string,number>>((total,row) => ({...total,[row.category_id]:(total[row.category_id] ?? 0)+row.amount_minor}),{});
  const unpaidByCategory = unpaid.reduce<Record<string,number>>((total,row) => ({...total,[row.category_id]:(total[row.category_id] ?? 0)+row.amount_minor}),{});
  const budgetRemaining = (budgets ?? []).reduce((total,row) => total + Math.max(0,row.amount_minor-(spent[row.category_id] ?? 0)-(unpaidByCategory[row.category_id] ?? 0)),0);
  const expected = profile.expected_remaining_minor ?? budgetRemaining;
  const available = profile.opening_balance_minor + income - paid; const projected = available - unpaidMinor - expected;
  // Controlled, read-only tools. The model receives their output; it cannot execute mutations.
  const categorySpending = (categories ?? []).map((category) => ({ category:category.name,spentMinor:spent[category.id] ?? 0 }));
  const tools = {
    get_financial_summary: { availableMinor:available,incomeMinor:income,paidExpenseMinor:paid,currency:profile.currency },
    get_recent_transactions: rows.sort((a,b) => b.transaction_date.localeCompare(a.transaction_date)).slice(0,10).map((row) => ({ amountMinor:row.amount_minor,type:row.type,categoryId:row.category_id,date:row.transaction_date })),
    calculate_forecast: { projectedMinor:projected,unpaidBillsMinor:unpaidMinor,expectedRemainingMinor:expected,shortfall:projected<0,method:profile.expected_remaining_minor === null ? "unspent budgets excluding unpaid bills" : "user-provided estimate plus unpaid bills" },
    get_category_spending: categorySpending,
    get_upcoming_bills: unpaid.map((bill) => ({ name:bill.name,amountMinor:bill.amount_minor,dueDate:bill.due_date })),
    get_budget_status: (budgets ?? []).map((budget) => ({ categoryId:budget.category_id,amountMinor:budget.amount_minor,spentMinor:spent[budget.category_id] ?? 0,remainingMinor:Math.max(0,budget.amount_minor-(spent[budget.category_id] ?? 0)-(unpaidByCategory[budget.category_id] ?? 0)) })),
    get_savings_goals: (goals ?? []).map((goal) => ({ name:goal.name,targetMinor:goal.target_minor,savedMinor:goal.saved_minor,targetDate:goal.target_date })),
    propose_budget_change: "Read-only: a proposal can be described, but the client must show it for explicit review and call approve_budget_proposal only after confirmation.",
    simulate_budget_scenario: simulateBudgetScenario({ question,currency:profile.currency,currentProjectedMinor:projected,categories:categories ?? [],spendingByCategory:spent }),
    explain_financial_risk: explainFinancialRisk({ today:new Intl.DateTimeFormat("en-CA",{timeZone:profile.timezone ?? "UTC",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date()),currency:profile.currency,projectedMinor:projected,budgets:budgets ?? [],categories:categories ?? [],spendingByCategory:spent,unpaidByCategory,bills:unpaid,goals:goals ?? [] })
  };
  const fallback = rulesAnswer(question,profile.currency,{ available,projected,unpaidMinor,expected,categories:tools.get_category_spending,bills:tools.get_upcoming_bills,goals:tools.get_savings_goals });
  const key = Deno.env.get("OPENAI_API_KEY");
  if (!key) return json({ mode:"rules",providerStatus:"not-configured",answer:fallback,tools });
  const history = Array.isArray(body.history) ? body.history.slice(-10).flatMap((item) => item && (item.role === "user" || item.role === "assistant") && typeof item.content === "string" && item.content.trim() ? [{ role:item.role,content:item.content.trim().slice(0,1000) }] : []) : [];
  try {
    const response = await fetch("https://api.openai.com/v1/responses",{method:"POST",headers:{"Content-Type":"application/json","Authorization":`Bearer ${key}`},body:JSON.stringify({model:Deno.env.get("OPENAI_MODEL") ?? "gpt-4.1-mini",input:[{role:"system",content:"You are FinMate AI. Use only the supplied authorized tool results. Do not invent values, perform actions, promise outcomes, or provide regulated financial advice. Keep the answer concise."},...history,{role:"user",content:`Question: ${question}\nAuthorized tools: ${JSON.stringify(tools)}`}],max_output_tokens:260}),signal:AbortSignal.timeout(12_000)});
    if (!response.ok) throw new Error("Provider error"); const output = await response.json(); const answer = textFromResponse(output); return json({mode:answer ? "ai" : "rules",providerStatus:answer ? "available" : "empty-response",answer:answer || fallback,tools});
  } catch { return json({mode:"rules",providerStatus:"unavailable",answer:fallback,tools}); }
});
