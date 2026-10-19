Warning: truncated output (original token count: 17579)
Total output lines: 325

"use client";

import { FormEvent, ReactNode, Suspense, useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  Bot, CalendarClock, Check, ChevronRight, CircleDollarSign, ClipboardList,
  Download, Edit3, Goal, LayoutDashboard, LogOut, Menu, Moon, Plus,
  ReceiptText, RotateCcw, Search, Settings, Sparkles, Sun, Target, Trash2, TrendingDown, TrendingUp, Wallet, X
} from "lucide-react";
import { Bar, BarChart, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { makeDemoState, monthKey } from "@/lib/demo-data";
import { cloneFinanceState, loadCloudWorkspace, syncCloudWorkspace } from "@/lib/cloud-store";
import { budgetProgress, calculateForecast, categoryName, formatMoney, parseMoney, spendingByCategory } from "@/lib/finance";
import { buildInsights } from "@/lib/insights";
import { answerRulesBasedAssistant } from "@/lib/assistant-fallback";
import { billSchema, budgetSchema, transactionSchema } from "@/lib/schemas";
import { getSupabaseBrowserClient } from "@/lib/supabase";
import type { Activity, Bill, Budget, Category, Currency, FinanceState, RecurringFrequency, SavingsGoal, Transaction } from "@/types/finance";

type Section = "overview" | "transactions" | "budgets" | "bills" | "goals" | "assistant" | "activity" | "settings";
type ModalState = { kind: "transaction"; record?: Transaction } | { kind: "confirm-delete"; type: "transaction"; id: string; label: string } | null;
type WorkspaceMode = "demo" | "cloud";
type ChatMessage = { id: string; role: "assistant" | "user"; text: string; source?: string };
const storageKey = "finmate-fictional-demo-v1";
const navigation: { id: Section; label: string; icon: typeof LayoutDashboard }[] = [
  { id: "overview", label: "Overview", icon: LayoutDashboard }, { id: "transactions", label: "Transactions", icon: ReceiptText }, { id: "budgets", label: "Budgets", icon: Target }, { id: "bills", label: "Bills", icon: CalendarClock }, { id: "goals", label: "Savings goals", icon: Goal }, { id: "assistant", label: "FinMate AI", icon: Sparkles }, { id: "activity", label: "Activity", icon: ClipboardList }
];
const recurringValues: RecurringFrequency[] = ["none", "weekly", "monthly", "yearly"];
const uid = () => globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const today = () => new Date().toISOString().slice(0, 10);
const dateLabel = (date: string) => new Intl.DateTimeFormat("en-BD", { day: "numeric", month: "short", year: "numeric" }).format(new Date(`${date}T12:00:00`));
const compactDate = (date: string) => new Intl.DateTimeFormat("en-BD", { day: "2-digit", month: "short" }).format(new Date(`${date}T12:00:00`));

function activity(action: string, detail: string): Activity { return { id: uid(), action, detail, createdAt: new Date().toISOString() }; }
function withActivity(state: FinanceState, entry: Activity): FinanceState { return { ...state, activities: [entry, ...state.activities].slice(0, 100) }; }
function moneyFromMinor(minor: number) { return (minor / 100).toFixed(2); }
function isSection(value: string | null): value is Section { return navigation.some((item) => item.id === value) || value === "settings"; }
function assistantWelcome(mode: WorkspaceMode): ChatMessage { return { id: "welcome", role: "assistant", text: mode === "demo" ? "I can explain the fictional figures in this demo: forecast, bills, category spending, budgets, and savings goals. I do not make changes unless you confirm a proposal." : "I can explain the figures in your private workspace: forecast, bills, category spending, budgets, and savings goals. I do not make changes unless you confirm a proposal.", source: "Rules-based welcome" }; }

export function Dashboard() {
  return <Suspense fallback={<main className="loading-page"><span className="brand-mark">F</span><p>Opening your workspace…</p></main>}><DashboardContent /></Suspense>;
}

function DashboardContent() {
  const router = useRouter();
  const pathname = usePathname() ?? "/app";
  const searchParams = useSearchParams();
  const demoRequested = searchParams.get("demo") === "1";
  const requestedSection = searchParams.get("view");
  const section: Section = isSection(requestedSection) ? requestedSection : "overview";
  const [state, setState] = useState<FinanceState>(() => makeDemoState());
  const [mode, setMode] = useState<WorkspaceMode>("demo");
  const [cloudUserId, setCloudUserId] = useState<string | null>(null);
  const [modal, setModal] = useState<ModalState>(null);
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [toast, setToast] = useState("");
  const [workspaceStatus, setWorkspaceStatus] = useState<"loading" | "ready" | "error">("loading");
  const [retry, setRetry] = useState(0);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [assistantMessages, setAssistantMessages] = useState<ChatMessage[]>(() => [assistantWelcome("demo")]);
  const cloudSync = useRef<Promise<void>>(Promise.resolve());
  const cloudBaseline = useRef<FinanceState | null>(null);
  const cloudUserRef = useRef<string | null>(null);
  const month = monthKey();

  const navigateTo = (next: Section) => {
    if (next === section) { setMobileMenuOpen(false); return; }
    const params = new URLSearchParams(searchParams.toString());
    if (next === "overview") params.delete("view"); else params.set("view", next);
    const query = params.toString();
    setMobileMenuOpen(false);
    router.push(query ? `${pathname}?${query}` : pathname, { scroll: false });
  };

  useEffect(() => {
    let active = true;
    const client = getSupabaseBrowserClient();
    const restoreDemo = () => {
      let demo = makeDemoState();
      try { const saved = localStorage.getItem(storageKey); demo = saved ? JSON.parse(saved) as FinanceState : demo; } catch { /* Use a fresh labelled demo when storage is unavailable. */ }
      if (!active) return;
      cloudBaseline.current = null; cloudUserRef.current = null;
      setMode("demo"); setCloudUserId(null); setState(demo); setWorkspaceStatus("ready");
    };
    const openCloudWorkspace = async (userId: string) => {
      setWorkspaceStatus("loading");
      try {
        if (!client) throw new Error("Cloud client unavailable.");
        const cloud = await loadCloudWorkspace(client, userId);
        if (!active || !cloud) return;
        cloudBaseline.current = cloneFinanceState(cloud); cloudUserRef.current = userId;
        setMode("cloud"); setCloudUserId(userId); setState(cloud); setWorkspaceStatus("ready");
      } catch {
        if (active) { setWorkspaceStatus("error"); setToast("Your session is still protected, but the cloud workspace could not load. Retry after checking the connection."); }
      }
    };
    async function openWorkspace() {
      if (demoRequested || !client) { restoreDemo(); return; }
      const { data: { session }, error } = await client.auth.getSession();
      if (!active) return;
      if (error) { setWorkspaceStatus("error"); setToast("We could not verify the saved session. Retry instead of signing in again."); return; }
      if (!session?.user) { router.replace(`/auth?next=${encodeURIComponent(pathname)}`); return; }
      await openCloudWorkspace(session.user.id);
    }
    const subscription = client?.auth.onAuthStateChange((event, session) => {
      if (!active) return;
      if (event === "SIGNED_OUT") { if (demoRequested) restoreDemo(); else router.replace(`/auth?next=${encodeURIComponent(pathname)}`); }
      if (event === "SIGNED_IN" && session?.user && !demoRequested) void openCloudWorkspace(session.user.id);
    });
    void openWorkspace();
    return () => { active = false; subscription?.data.subscription.unsubscribe(); };
  }, [demoRequested, pathname, retry, router]);
  useEffect(() => { if (state && mode === "demo") localStorage.setItem(storageKey, JSON.stringify(state)); }, [state, mode]);
  useEffect(() => {
    if (!state || mode !== "cloud" || !cloudUserId) return;
    const client = getSupabaseBrowserClient(); if (!client) return;
    cloudSync.current = cloudSync.current.then(async () => {
      await syncCloudWorkspace(client,cloudUserId,state,cloudBaseline.current);
      cloudBaseline.current = cloneFinanceState(state);
    }).catch(() => setToast("A cloud save did not complete. Your workspace remains open; retry after checking the connection."));
  }, [state, mode, cloudUserId]);
  useEffect(() => { document.documentElement.dataset.theme = theme; }, [theme]);
  useEffect(() => { if (!toast) return; const timer = window.setTimeout(() => setToast(""), 3200); return () => clearTimeout(timer); }, [toast]);
  useEffect(() => { setAssistantMessages([assistantWelcome(mode)]); }, [mode, cloudUserId]);

  const forecast = useMemo(() => state ? calculateForecast({ month, transactions: state.transactions, bills: state.bills, budgets: state.budgets, profile: state.profile }) : null, [state, month]);
  const progress = useMemo(() => state ? budgetProgress(state.budgets, state.transactions, month) : [], [state, month]);
  const mutate = (recipe: (current: FinanceState) => FinanceState, success?: string) => { setState((current) => current ? recipe(current) : current); if (success) setToast(success); };
  const saveTransaction = (form: FormData, existing?: Transaction) => {
    if (!state) return;
    if (existing?.billId || state.bills.some((bill) => bill.transactionId === existing?.id)) throw new Error("This payment was created from a bill. Use Bills to undo the payment before changing it.");
    const raw = Object.fromEntries(form.entries()); const parsed = transactionSchema.safeParse(raw);
    if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "Check the transaction details.");
    const value = parsed.data;
    const record: Transaction = { id: existing?.id ?? uid(), amountMinor: parseMoney(value.amount, state.profile.currency), type: value.type, description: value.description, categoryId: value.categoryId, transactionDate: value.transactionDate, account: value.account || undefined, notes: value.notes || undefined, recurring: value.recurring, billId: existing?.billId, createdAt: existing?.createdAt ?? new Date().toISOString() };
    mutate((current) => withActivity({ ...current, transactions: existing ? current.transactions.map((item) => item.id === existing.id ? record : item) : [record, ...current.transactions] }, activity(existing ? "Transaction updated" : "Transaction recorded", `${record.description} · ${formatMoney(record.amountMinor, current.profile.currency)}`)), existing ? "Transaction updated" : "Transaction added");
  };
  const deleteTransaction = (id: string) => {
    const linkedBill = state?.bills.find((bill) => bill.transactionId === id);
    if (linkedBill) { setToast(`Use Bills to undo the ${linkedBill.name} payment before deleting it.`); return; }
    mutate((current) => withActivity({ ...current, transactions: current.transactions.filter((item) => item.id !== id) }, activity("Transaction deleted", "A ledger entry was removed.")), "Transaction deleted");
  };
  const refreshCloudWorkspace = async () => {
    const client = getSupabaseBrowserClient();
    if (!client || !cloudUserId) throw new Error("Your cloud session is unavailable.");
    await cloudSync.current;
    const cloud = await loadCloudWorkspace(client, cloudUserId);
    if (!cloud) throw new Error("Your cloud workspace could not be refreshed.");
    cloudBaseline.current = cloneFinanceState(cloud);
    setState(cloud);
  };
  const markBillPaid = async (bill: Bill) => {
    if (!state || bill.paidAt) return;
    if (mode === "cloud") {
      try {
        const client = getSupabaseBrowserClient();
        if (!client) throw new Error("Cloud connection unavailable.");
        const { error } = await client.rpc("mark_bill_paid", { p_bill_id: bill.id, p_paid_date: today() });
        if (error) throw error;
        await refreshCloudWorkspace(); setToast("Bill paid and added to ledger once"); return;
      } catch { setToast("The bill payment could not be saved. Check your connection and try again."); return; }
    }
    const txn: Transaction = { id: uid(), amountMinor: bill.amountMinor, type: "expense", description: `Bill: ${bill.name}`, categoryId: bill.categoryId, transactionDate: today(), account: "", notes: "Created when this bill was marked paid.", recurring: bill.recurring, billId: bill.id, createdAt: new Date().toISOString() };
    mutate((current) => withActivity({ ...current, transactions: [txn, ...current.transactions], bills: current.bills.map((item) => item.id === bill.id ? { ...item, paidAt: new Date().toISOString(), transactionId: txn.id } : item) }, activity("Bill marked paid", `${bill.name} was recorded once in the ledger.`)), "Bill paid and added to ledger once");
  };
  const undoBillPayment = async (bill: Bill) => {
    if (mode === "cloud") {
      try {
        const client = getSupabaseBrowserClient();
        if (!client) throw new Error("Cloud connection unavailable.");
        const { error } = await client.rpc("undo_bill_payment", { p_bill_id: bill.id });
        if (error) throw error;
        await refreshCloudWorkspace(); setToast("Bill set back to unpaid"); return;
      } catch { setToast("The bill payment could not be undone. Check your connection and try again."); return; }
    }
    mutate((current) => withActivity({ ...current, transactions: current.transactions.filter((item) => item.id !== bill.transactionId), bills: current.bills.map((item) => item.id === bill.id ? { ...item, paidAt: null, transactionId: null } : item) }, activity("Bill payment undone", `${bill.name} is again reserved as unpaid.`)), "Bill set back to unpaid");
  };
  const resetDemo = () => { if (mode !== "demo" || !window.confirm("Reset all fictional demo data stored in this browser?")) return; setState(makeDemoState()); navigateTo("overview"); setToast("Fictional demo data reset"); };
  const exportData = () => { if (!state) return; const blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), fictionalDemo: mode === "demo", ...state }, null, 2)], { type: "application/json" }); const href = URL.createObjectURL(blob); const link = document.createElement("a"); link.href = href; link.download = `finmate-${mode}-${today()}.json`; link.click(); URL.revokeObjectURL(href); setToast("Local export downloaded"); };
  const signOut = async () => { await getSupabaseBrowserClient()?.auth.signOut(); location.assign("/"); };

  if (workspaceStatus === "loading" || !forecast) return <main className="loading-page"><span className="brand-mark">F</span><p>Opening your workspace…</p></main>;
  if (workspaceStatus === "error") return <main className="loading-page"><span className="brand-mark">F</span><p>We could not open the protected cloud workspace.</p><p className="muted">Your session was not treated as a sign-out. Check the connection, then retry.</p><div className="modal-actions"><button className="button primary" onClick={() => setRetry((value) => value + 1)}>Retry</button><Link className="button secondary" href="/app?demo=1">Open fictional demo</Link></div></main>;
  const selected = navigation.find((item) => item.id === section)?.label ?? "Settings";
  const navButtons = navigation.map((item) => { const Icon = item.icon; return <button key={item.id} aria-current={section === item.id ? "page" : undefined} aria-label={item.label} className={section === item.id ? "active" : ""} onClick={() => navigateTo(item.id)}><Icon size={18}/><span>{item.label}</span></button>; });
  return <div className="workspace">
    <aside className="sidebar"><Link className="brand" href="/"><span className="brand-mark">F</span><span>FinMate AI</span></Link><div className="demo-pill"><Sparkles size={13}/><span>{mode === "demo" ? "FICTIONAL DEMO" : "PRIVATE WORKSPACE"}</span></div><nav className="side-nav" aria-label="Finance navigation">{navButtons}</nav><div className="sidebar-bottom"><button aria-label="Settings" aria-current={section === "settings" ? "page" : undefined} onClick={() => navigateTo("settings")}><Settings size={17}/><span>Settings</span></button><button aria-label="Sign out" onClick={signOut}><LogOut size={17}/><span>Sign out</span></button></div></aside>
    <main className="workspace-main"><header className="topbar"><div><p className="eyebrow">{section === "overview" ? `${month} money check-in` : mode === "demo" ? "Fictional demo workspace" : "Private cloud workspace"}</p><h1>{selected}</h1>{section === "overview" && <p>Here’s a transparent view of your month so far.</p>}</div><div className="top-actions"><button className="icon-button" aria-label="Toggle theme" onClick={() => setTheme(theme === "light" ? "dark" : "light")}>{theme === "light" ? <Moon size={17}/> : <Sun size={17}/>}</button><button className="button primary" onClick={() => { navigateTo("transactions"); setModal({ kind: "transaction" }); }}><Plus size={16}/><span>Add transaction</span></button></div></header>
      {section === "overview" && <Overview state={state} forecast={forecast} progress={progress} onSection={navigateTo} />}
      {section === "transactions" && <Transactions state={state} onEdit={(record) => setModal({ kind: "transaction", record })} onDelete={(record) => setModal({ kind: "confirm-delete", type: "transaction", id: record.id, label: record.description })} />}
      {section === "budgets" && <Budgets state={state} progress={progress} month={month} onMutate={mutate} />}
      {section === "bills" && <Bills state={state} onMutate={mutate} onPay={markBillPaid} onUndo={undoBillPayment} />}
      {section === "goals" && <Goals state={state} onMutate={mutate} />}
      {section === "assistant" && <Assistant state={state} mode={mode} forecast={forecast} progress={progress} messages={assistantMessages} onMessagesChange={setAssistantMessages} onMutate={mutate} onRefreshCloud={refreshCloudWorkspace} />}
      {section === "activity" && <ActivityLog state={state} />}
      {section === "settings" && <SettingsPage state={state} mode={mode} onMutate={mutate} onReset={resetDemo} onExport={exportData} />}
    </main>
    <nav className="mobile-nav" aria-label="Mobile finance navigation">{navigation.slice(0, 4).map((item) => { const Icon = item.icon; return <button key={item.id} aria-current={section === item.id ? "page" : undefined} aria-label={item.label} className={section === item.id ? "active" : ""} onClick={() => navigateTo(item.id)}><Icon size={18}/><span>{item.label.split(" ")[0]}</span></button>; })}<div className="mobile-more"><button aria-label="More navigation options" aria-expanded={mobileMenuOpen} className={["more-trigger", ["goals", "assistant", "activity", "settings"].includes(section) ? "active" : ""].filter(Boolean).join(" ")} onClick={() => setMobileMenuOpen((open) => !open)}><Menu size={18}/><span>More</span></button>{mobileMenuOpen && <div className="mobile-more-menu">{navigation.slice(4).map((item) => { const Icon = item.icon; return <button key={item.id} aria-current={section === item.id ? "page" : undefined} className={section === item.id ? "active" : ""} onClick={() => navigateTo(item.id)}><Icon size={17}/>{item.label}</button>; })}<button aria-current={section === "settings" ? "page" : undefined} className={section === "settings" ? "active" : ""} onClick={() => navigateTo("settings")}><Settings size={17}/>Settings</button><button onClick={signOut}><LogOut size={17}/>Sign out</button></div>}</div></nav>
    {modal?.kind === "transaction" && <Dialog title={modal.record ? "Edit transaction" : "Add transaction"} description="A ledger entry immediately updates your totals and forecast." onClose={() => setModal(null)}><TransactionForm record={modal.record} state={state} onCancel={() => setModal(null)} onSubmit={(form) => { saveTransaction(form, modal.record); setModal(null); }} /></Dialog>}
    {modal?.kind === "confirm-delete" && <Dialog title="Delete transaction?" description={`“${modal.label}” will be removed from the ledger and your totals will update.`} onClose={() => setModal(null)}><div className="modal-actions"><button className="button secondary" onClick={() => setModal(null)}>Cancel</button><button className="button danger" onClick={() => { deleteTransaction(modal.id); setModal(null); }}>Delete transaction</button></div></Dialog>}
    {!state.profile.onboardingComplete && <Onboarding state={state} onComplete={(profile) => mutate((current) => withActivity({...current,profile:{...current.profile,...profile,onboardingComplete:true}},activity("Onboarding completed","Initial currency, timezone, and balance preferences saved.")),"Workspace is ready")} />}
    {toast && <div className="toast" role="status">{toast}</div>}
  </div>;
}

function Overview({ state, forecast, progress, onSection }: { state: FinanceState; forecast: ReturnType<typeof calculateForecast>; progress: ReturnType<typeof budgetProgress>; onSection: (section: Section) => void }) {
  const currency = state.profile.currency;
  const monthlyIncome = forecast.incomeMinor; const monthlyExpenses = forecast.paidExpenseMinor;
  const spend = spendingByCategory(state.transactions, forecast.month);
  const chartData = state.categories.map((category) => ({ name: category.name, value: spend[category.id] || 0, color: category.color })).filter((item) => item.value > 0).sort((a, b) => b.value - a.value);
  const days = Object.entries(state.transactions.filter((item) => item.transactionDate.startsWith(forecast.month)).reduce<Record<string, { date: string; income: number; expense: number }>>((all, item) => { const value = all[item.transactionDate] ?? { date: item.transactionDate.slice(-2), income: 0, expense: 0 }; value[item.type] += item.amountMinor; all[item.transactionDate] = value; return all; }, {})).map(([, value]) => value).sort((a, b) => a.date.localeCompare(b.date));
  const upcoming = state.bills.filter((bill) => !bill.paidAt).sort((a, b) => a.dueDate.localeCompare(b.dueDate)).slice(0, 3);
  const insights = buildInsights(forecast, currency).slice(0, 2);
  return <section className="section-page"><div className="overview-grid"><Stat icon={<Wallet size={16}/>} label="Available balance" value={formatMoney(forecast.availableBalanceMinor, currency)} detail="Opening balance + income − paid expenses" featured/><Stat icon={<TrendingUp size={16}/>} label="Monthly income" value={formatMoney(monthlyIncome, currency)} detail="Ledger income this month"/><Stat icon={<TrendingDown size={16}/>} label="Monthly expenses" value={formatMoney(monthlyExpenses, currency)} detail="Paid ledger expenses"/><Stat icon={<CalendarClock size={16}/>} label="Unpaid bills" value={formatMoney(forecast.unpaidBillsMinor, currency)} detail={`${state.bills.filter((bill) => !bill.paidAt).length} awaiting payment`}/></div>
    <div className="dashboard-columns"><div><article className="card"><div className="card-head"><div><h2>Cash flow</h2><p>Recorded income and expenses this month</p></div><button className="button ghost" onClick={() => onSection("transactions")}>View ledger <ChevronRight size={15}/></button></div><div className="chart-wrap">{days.length ? <ResponsiveContainer width="100%" height="100%"><BarChart data={days} barGap={4}><XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "#64716d" }}/><YAxis tickFormatter={(value) => `৳${Math.round(value / 100)}`} axisLine={false} tickLine={false} width={54} tick={{ fontSize: 11, fill: "#64716d" }}/><Tooltip content={<MoneyTooltip currency={currency}/>}/><Bar dataKey="income" fill="#4e967f" radius={[4,4,0,0]}/><Bar dataKey="expense" fill="#e77b6a" radius={[4,4,0,0]}/></BarChart></ResponsiveContainer> : <Empty text="Your cash flow will appear as you add transactions."/>}</div></article><ForecastCard forecast={forecast} currency={currency}/></div>
      <div><article className="card"><div className="card-head"><div><h2>Spending by category</h2><p>Paid expenses only</p></div><button className="button ghost" onClick={() => onSection("budgets")}>Budgets <ChevronRight size={15}/></button></div>{chartData.length ? <><div className="chart-wrap"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={chartData} dataKey="value" nameKey="name" innerRadius="59%" outerRadius="82%" paddingAngle={3}>{chartData.map((item) => <Cell key={item.name} fill={item.color}/>)}</Pie><Tooltip content={<MoneyTooltip currency={currency}/>}/></PieChart></ResponsiveContainer></div><div className="category-legend">{chartData.slice(0, 4).map((item) => <div className="legend-row" key={item.name}><span className="legend-left"><i className="dot" style={{background:item.color}}/><span className="legend-name">{item.name}</span></span><span className="legend-value">{formatMoney(item.value,currency)}</span></div>)}</div></> : <Empty text="No expenses recorded in this month."/>}</article>
      <article className="card" style={{marginTop:17}}><div className="card-head"><div><h2>Upcoming bills</h2><p>Not yet in your ledger</p></div><button className="button ghost" onClick={() => onSection("bills")}>All bills <ChevronRight size={15}/></button></div>{upcoming.length ? upcoming.map((bill) => <div className="mini-bill" key={bill.id}><div className="mini-bill-date">{compactDate(bill.dueDate)}</div><div><p>{bill.name}</p><small>{categoryName(state.categories, bill.categoryId)} · {formatMoney(bill.amountMinor,currency)}</small></div></div>) : <Empty text="Nothing is due right now."/>}</article></div></div>
    <article className="card" style={{marginTop:17}}><div className="card-head"><div><h2>Budget pulse</h2><p>How category budgets are holding up</p></div></div>{progress.length ? <div className="budget-list">{progress.slice(0,4).map((item) => <BudgetRow key={item.id} item={item} name={categoryName(state.categories,item.categoryId)} currency={currency}/>)}</div> : <Empty text="Set a budget to keep an eye on spending."/>}</article>
    <div className="dashboard-columns"><article className="card"><div className="card-head"><div><h2>Financial health summary</h2><p>Useful signals based on your current plan</p></div></div><div className="insight-list">{insights.map((insight) => <div className={`insight ${insight.tone}`} key={insight.title}><strong>{insight.title}</strong><p>{insight.body}</p></div>)}</div></article><article className="card"><div className="card-head"><div><h2>Quick actions</h2><p>Keep your plan current</p></div></div><div className="quick-list"><button className="quick-button" onClick={() => onSection("transactions")}><span><CircleDollarSign size={17}/>Record income or expense</span><ChevronRight size={16}/></button><button className="quick-button" onClick={() => onSection("bills")}><span><CalendarClock size={17}/>Manage upcoming bills</span><ChevronRight size={16}/></button><button className="quick-button" onClick={() => onSection("assistant")}><span><Sparkles size={17}/>Ask FinMate AI</span><ChevronRight size={16}/></button></div></article></div>
  </section>;
}

function Stat({ icon, label, value, detail, featured = false }: { icon: ReactNode; label: string; value: string; detail: string; featured?: boolean }) { return <article className={`stat-card ${featured ? "featured" : ""}`}><span className="stat-label">{icon}{label}</span><div className="stat-value">{value}</div><span className="stat-sub">{detail}</span></article>; }
function MoneyTooltip({ active, payload, label, currency }: { active?: boolean; payload?: Array<{ value?: number; name?: string; color?: string }>; label?: string; currency: Currency }) { return active && payload?.length ? <div className="chart-tooltip"><strong>{label}</strong>{payload.map((row) => <div key={row.name} style={{ color: row.color }}>{row.name}: {formatMoney(row.value || 0, currency)}</div>)}</div> : null; }
function Empty({ text }: { text: string }) { return <p className="empty">{text}</p>; }
function ForecastCard({ forecast, currency }: { forecast: ReturnType<typeof calculateForecast>; currency: Currency }) { return <article className="forecast-card"><div className="forecast-main"><div><span className="eyebrow">Estimate, not a guarantee</span><h2>Forecasted end-of-month balance</h2><p className="muted" style={{margin:0,fontSize:13}}>Based on your current ledger, unpaid bills, and remaining-spending assumption.</p></div><strong className="forecast-total" style={{color:forecast.shortfall?"#bb3852":"#123b38"}}>{formatMoney(forecast.projectedBalanceMinor,currency)}</strong></div><div className="forecast-breakdown"><div><span>Available now</span><strong>{formatMoney(forecast.availableBalanceMinor,currency)}</strong></div><div><span>Unpaid bills</span><strong>−{formatMoney(forecast.unpaidBillsMinor,currency)}</strong></div><div><span>Expected spending</span><strong>−{formatMoney(forecast.expectedRemainingMinor,currency)}</strong></div><div><span>Month-end estimate</span><strong>{formatMoney(forecast.projectedBalanceMinor,currency)}</strong></div></div>{forecast.shortfall && <div className="callout" style={{marginTop:15}}>This plan may go negative. Review your expected remaining spending before the month ends.</div>}</article>; }
function BudgetRow({ item, name, currency }: { item: ReturnType<typeof budgetProgress>[number]; name: string; currency: Currency }) { const style = item.percent > 100 ? "danger" : item.percent >= 80 ? "warning" : ""; return <div><div className="budget-item-head"><div><h3>{name}</h3><p>{formatMoney(item.spentMinor,currency)} spent of {formatMoney(item.amountMinor,currency)}</p></div><span className={`tag ${style}`}>{item.percent}%</span></div><div className="progress-row"><span>{item.remainingMinor >= 0 ? `${formatMoney(item.remainingMinor,currency)} left` : `${formatMoney(Math.abs(item.remainingMinor),currency)} over`}</span><span>{item.percent}%</span><div className="progress-track"><div className={`progress-fill ${style}`} style={{width:`${Math.min(100,item.percent)}%`}}/></…2579 tokens truncated…tMinor,state.profile.currency)}</strong></div><div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginTop:13,gap:10}}><span className={`bill-status ${className}`}>{bill.paidAt ? <Check size={14}/> : <CalendarClock size={14}/>} {label}</span><div className="table-actions">{bill.paidAt ? <><button className="button ghost" onClick={() => onUndo(bill)}>Undo payment</button><span className="tag" title="Undo payment before editing this bill.">Locked while paid</span></> : <><button className="button primary" onClick={() => onPay(bill)}><Check size={15}/>Mark paid</button><button className="small-button" aria-label={`Edit ${bill.name}`} onClick={() => setEditing(bill)}><Edit3 size={16}/></button></>}<button className="small-button" aria-label={`Delete ${bill.name}`} onClick={() => { if (window.confirm(`Delete ${bill.name}?${bill.paidAt ? " Its linked ledger entry will remain as a regular expense." : ""}`)) onMutate((current) => withActivity({ ...current, bills: current.bills.filter((item) => item.id !== bill.id), transactions:current.transactions.map((item) => item.billId === bill.id ? {...item,billId:undefined} : item) }, activity("Bill deleted", `${bill.name} was removed.${bill.paidAt ? " Its ledger expense was retained." : ""}`)),"Bill deleted"); }}><Trash2 size={16}/></button></div></div></div>; })}</div> : <Empty text="Add a bill to see it here."/>}</article><aside className="card side-form"><h2>{editing ? "Edit bill" : "Add a bill"}</h2><p>Recurring bills stay as scheduled reminders; they never auto-create payments.</p><form className="form-grid" onSubmit={submit} key={editing?.id ?? "new"}><label>Bill name<input name="name" defaultValue={editing?.name ?? ""} maxLength={120} required placeholder="e.g. Electricity"/></label><div className="form-two"><label>Amount<input name="amount" inputMode="decimal" defaultValue={editing ? moneyFromMinor(editing.amountMinor) : ""} required/></label><label>Due date<input name="dueDate" type="date" defaultValue={editing?.dueDate ?? today()} required/></label></div><label>Category<select name="categoryId" defaultValue={editing?.categoryId ?? "utilities"} required>{state.categories.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label>Frequency<select name="recurring" defaultValue={editing?.recurring ?? "none"}>{recurringValues.map((item) => <option key={item} value={item}>{item === "none" ? "One-time" : item[0].toUpperCase()+item.slice(1)}</option>)}</select></label>{error && <p className="form-error">{error}</p>}<div className="modal-actions"><button type="button" className="button ghost" onClick={() => setEditing(null)}>Clear</button><button className="button primary">{editing ? "Save changes" : "Add bill"}</button></div></form></aside></div></section>;
}

function Goals({ state, onMutate }: { state: FinanceState; onMutate: (recipe: (current: FinanceState) => FinanceState, success?: string) => void }) {
  const [error, setError] = useState("");
  function createGoal(event: FormEvent<HTMLFormElement>) { event.preventDefault(); setError(""); const form = new FormData(event.currentTarget); const name = String(form.get("name") || "").trim(); const target = String(form.get("target") || ""); if (!name || !target) { setError("Give this goal a name and target."); return; } try { const goal: SavingsGoal = { id: uid(), name, targetMinor:parseMoney(target,state.profile.currency), savedMinor:0, targetDate:String(form.get("targetDate") || "") || null, color:"#4978d6" }; if (goal.targetMinor <= 0) throw new Error("Target must be greater than zero."); onMutate((current) => withActivity({ ...current, goals:[...current.goals,goal] },activity("Savings goal created",`${goal.name} has a target of ${formatMoney(goal.targetMinor,current.profile.currency)}.`)), "Savings goal created"); event.currentTarget.reset(); } catch (issue) { setError(issue instanceof Error ? issue.message : "Could not create this goal."); } }
  return <section className="section-page"><div className="page-head"><div><h1>Savings goals</h1><p>Make every contribution visible—and keep a record of it.</p></div></div><div className="two-column"><article className="card"><div className="card-head"><div><h2>Your goals</h2><p>Contributions are tracked separately from your expense ledger.</p></div></div>{state.goals.length ? <div className="goal-list">{state.goals.map((goal) => <GoalCard key={goal.id} goal={goal} state={state} onMutate={onMutate}/>)}</div> : <Empty text="Create a savings goal to get started."/>}</article><aside className="card side-form"><h2>Add a savings goal</h2><p>This does not transfer money. Record a contribution when you actually set funds aside.</p><form className="form-grid" onSubmit={createGoal}><label>Goal name<input name="name" maxLength={100} required placeholder="e.g. Emergency fund"/></label><label>Target amount<input name="target" required inputMode="decimal" placeholder="e.g. 100000"/></label><label>Target date <span className="muted">(optional)</span><input name="targetDate" type="date"/></label>{error && <p className="form-error">{error}</p>}<button className="button primary">Create goal</button></form></aside></div></section>;
}

function GoalCard({ goal, state, onMutate }: { goal: SavingsGoal; state: FinanceState; onMutate: (recipe: (current: FinanceState) => FinanceState, success?: string) => void }) {
  const [amount, setAmount] = useState(""); const [error, setError] = useState(""); const percent = goal.targetMinor ? Math.min(100, Math.round(goal.savedMinor / goal.targetMinor * 100)) : 0;
  const records = state.contributions.filter((item) => item.goalId === goal.id).sort((a,b) => b.date.localeCompare(a.date));
  function addContribution(event: FormEvent) { event.preventDefault(); setError(""); try { const amountMinor = parseMoney(amount,state.profile.currency); if (amountMinor <= 0) throw new Error("Contribution must be greater than zero."); onMutate((current) => withActivity({ ...current, goals: current.goals.map((item) => item.id === goal.id ? { ...item, savedMinor:item.savedMinor + amountMinor } : item), contributions:[{id:uid(),goalId:goal.id,amountMinor,date:today()},...current.contributions] },activity("Savings contribution added",`${formatMoney(amountMinor,current.profile.currency)} added to ${goal.name}.`)), "Contribution recorded"); setAmount(""); } catch (issue) { setError(issue instanceof Error ? issue.message : "Could not record the contribution."); } }
  function removeContribution(id: string) { const record = state.contributions.find((item) => item.id === id); if (!record || !window.confirm("Remove this savings contribution?")) return; onMutate((current) => withActivity({ ...current, goals:current.goals.map((item) => item.id === goal.id ? { ...item, savedMinor:Math.max(0,item.savedMinor-record.amountMinor) } : item), contributions:current.contributions.filter((item) => item.id !== id) },activity("Savings contribution removed",`${formatMoney(record.amountMinor,current.profile.currency)} removed from ${goal.name}.`)),"Contribution removed"); }
  return <div className="goal-item"><div className="goal-item-head"><div><h3>{goal.name}</h3><p>{goal.targetDate ? `Target: ${dateLabel(goal.targetDate)}` : "No target date"}</p></div><div className="goal-actions"><strong>{percent}%</strong><button className="small-button" aria-label={`Delete ${goal.name}`} onClick={() => { if (window.confirm(`Delete ${goal.name}?`)) onMutate((current) => withActivity({ ...current, goals:current.goals.filter((item) => item.id !== goal.id), contributions:current.contributions.filter((item) => item.goalId !== goal.id) },activity("Savings goal deleted",`${goal.name} was removed.`)),"Goal deleted"); }}><Trash2 size={16}/></button></div></div><div className="progress-row"><span>{formatMoney(goal.savedMinor,state.profile.currency)} saved</span><span>of {formatMoney(goal.targetMinor,state.profile.currency)}</span><div className="progress-track"><div className="progress-fill" style={{width:`${percent}%`,background:goal.color}}/></div></div><form className="contribution-form" onSubmit={addContribution}><input aria-label={`Contribution to ${goal.name}`} value={amount} onChange={(event) => setAmount(event.target.value)} inputMode="decimal" placeholder="Amount to add"/><button className="button secondary">Add</button></form>{error && <p className="form-error" style={{marginTop:7}}>{error}</p>}{records.length > 0 && <div className="contribution-history"><p className="muted" style={{fontSize:12,margin:"14px 0 5px"}}>Contribution record</p>{records.map((record) => <div className="contribution-record" key={record.id}><span>{dateLabel(record.date)}</span><strong>+{formatMoney(record.amountMinor,state.profile.currency)}</strong><button className="small-button" aria-label="Remove contribution" onClick={() => removeContribution(record.id)}><X size={14}/></button></div>)}</div>}</div>;
}

function Assistant({ state, mode, forecast, progress, messages, onMessagesChange, onMutate, onRefreshCloud }: { state: FinanceState; mode: WorkspaceMode; forecast: ReturnType<typeof calculateForecast>; progress: ReturnType<typeof budgetProgress>; messages: ChatMessage[]; onMessagesChange: Dispatch<SetStateAction<ChatMessage[]>>; onMutate: (recipe: (current: FinanceState) => FinanceState, success?: string) => void; onRefreshCloud: () => Promise<void> }) {
  const [question, setQuestion] = useState(""); const [busy, setBusy] = useState(false); const [proposal, setProposal] = useState<{ budgetId: string; currentMinor: number; proposedMinor: number; category: string } | null>(null); const inFlight = useRef(false);
  const appendMessage = (message: ChatMessage) => onMessagesChange((rows) => [...rows, message].slice(-24));
  const assistantContext = useMemo(() => { const spending = spendingByCategory(state.transactions,forecast.month); return { categorySpending: state.categories.map((category) => ({ name:category.name,amountMinor:spending[category.id] ?? 0 })), upcomingBills:state.bills.filter((bill) => !bill.paidAt).sort((a,b) => a.dueDate.localeCompare(b.dueDate)).slice(0,10).map((bill) => ({ name:bill.name,amountMinor:bill.amountMinor,dueDate:bill.dueDate })), budgets:progress.map((budget) => ({ category:categoryName(state.categories,budget.categoryId),amountMinor:budget.amountMinor,spentMinor:budget.spentMinor })), goals:state.goals.map((goal) => ({ name:goal.name,targetMinor:goal.targetMinor,savedMinor:goal.savedMinor,targetDate:goal.targetDate })) }; },[forecast.month,progress,state.bills,state.categories,state.goals,state.transactions]);
  async function ask(event: FormEvent) {
    event.preventDefault(); const text = question.trim(); if (!text || busy || inFlight.current) return;
    const history = messages.slice(-10).map((message) => ({ role:message.role,content:message.text }));
    inFlight.current = true; setQuestion(""); appendMessage({id:uid(),role:"user",text}); setBusy(true);
    try {
      let result: { answer?: string; mode?: string; providerStatus?: string } | null = null;
      // For a signed-in cloud workspace, the Edge Function verifies the caller JWT
      // and queries only RLS-authorized rows. The browser never supplies a ledger.
      if (mode === "cloud") {
        const client = getSupabaseBrowserClient();
        if (client) {
          const edge = await client.functions.invoke("finance-assistant", { body: { question: text, month: forecast.month, history } });
          if (!edge.error && edge.data && typeof edge.data === "object") result = edge.data as { answer?: string; mode?: string; providerStatus?: string };
        }
      }
      // Demo can use the app route with fictional figures. A signed-in cloud
      // workspace never falls back to posting its financial summary elsewhere.
      if (!result && mode === "demo") {
        const response = await fetch("/api/assistant", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({question:text,summary:{availableBalanceMinor:forecast.availableBalanceMinor,projectedBalanceMinor:forecast.projectedBalanceMinor,unpaidBillsMinor:forecast.unpaidBillsMinor,expectedRemainingMinor:forecast.expectedRemainingMinor,shortfall:forecast.shortfall},currency:state.profile.currency,context:assistantContext,history}) });
        if (!response.ok) throw new Error("Demo assistant request failed.");
        result = await response.json() as { answer?: string; mode?: string; providerStatus?: string };
      }
      const localFallback = answerRulesBasedAssistant({ question:text,summary:{availableBalanceMinor:forecast.availableBalanceMinor,projectedBalanceMinor:forecast.projectedBalanceMinor,unpaidBillsMinor:forecast.unpaidBillsMinor,expectedRemainingMinor:forecast.expectedRemainingMinor,shortfall:forecast.shortfall},currency:state.profile.currency,context:assistantContext });
      const source = result?.mode === "ai" ? "Groq AI" : result?.providerStatus === "demo-rules-only" ? "Fictional demo · rules-based, no external AI" : result?.providerStatus === "rate-limited" ? "Rules-based fallback — provider rate limit" : result?.providerStatus === "not-configured" ? "Rules-based fallback — AI provider not configured" : result?.providerStatus === "unavailable" ? "Rules-based fallback — provider unavailable" : "Rules-based fallback";
      appendMessage({id:uid(),role:"assistant",text:result?.answer || localFallback,source});
    } catch { appendMessage({id:uid(),role:"assistant",text:answerRulesBasedAssistant({ question:text,summary:{availableBalanceMinor:forecast.availableBalanceMinor,projectedBalanceMinor:forecast.projectedBalanceMinor,unpaidBillsMinor:forecast.unpaidBillsMinor,expectedRemainingMinor:forecast.expectedRemainingMinor,shortfall:forecast.shortfall},currency:state.profile.currency,context:assistantContext }),source:"Rules-based fallback — assistant connection unavailable"}); }
    finally { inFlight.current = false; setBusy(false); }
  }
  const insights = buildInsights(forecast,state.profile.currency,state);
  function draftProposal() { const candidate = [...progress].sort((a,b) => b.percent - a.percent)[0]; if (!candidate) { appendMessage({id:uid(),role:"assistant",text:"Create a category budget first; then I can prepare a change for your review.",source:"Rules-based fallback"}); return; } const current = candidate.amountMinor; setProposal({budgetId:candidate.id,currentMinor:current,proposedMinor:Math.max(0,Math.round(current * .9)),category:categoryName(state.categories,candidate.categoryId)}); }
  async function approveProposal() { if (!proposal) return; const approved = proposal; try { if (mode === "cloud") { const client = getSupabaseBrowserClient(); if (!client) throw new Error("Cloud connection unavailable."); const { error } = await client.rpc("approve_budget_proposal", { p_budget_id: approved.budgetId, p_proposed_minor: approved.proposedMinor, p_reason: `${approved.category} budget changed after explicit review.` }); if (error) throw error; await onRefreshCloud(); } else { onMutate((current) => withActivity({ ...current, budgets:current.budgets.map((item) => item.id === approved.budgetId ? {...item,amountMinor:approved.proposedMinor} : item) },activity("AI budget proposal approved",`${approved.category} budget changed from ${formatMoney(approved.currentMinor,current.profile.currency)} to ${formatMoney(approved.proposedMinor,current.profile.currency)} after review.`)), "Budget proposal applied"); } appendMessage({id:uid(),role:"assistant",text:`You approved the ${approved.category} budget change. The dashboard has been recalculated.`,source:"Confirmed action"}); setProposal(null); } catch { appendMessage({id:uid(),role:"assistant",text:"The budget change was not saved. Review your connection and try again; no local change was applied.",source:"Safe failure"}); } }
  return <section className="section-page"><div className="page-head"><div><h1>FinMate AI</h1><p>Clear explanations and reviewable suggestions—not financial advice.</p></div></div><div className="assistant-layout"><article className="card chat"><div className="card-head"><div><h2>Money conversation</h2><p>Uses the current workspace summary. It never changes data by itself.</p></div><Bot size={21} color="#477d71"/></div>{messages.map((message) => <div className={`message ${message.role === "user" ? "user" : ""}`} key={message.id}>{message.text}{message.source && <small>{message.source}</small>}</div>)}{busy && <div className="message">Thinking through the figures…</div>}<form className="ask-form" onSubmit={ask}><input value={question} onChange={(event) => setQuestion(event.target.value)} maxLength={700} placeholder="How do upcoming bills affect me?" aria-label="Ask FinMate AI"/><button className="button primary" disabled={busy}>Ask</button></form></article><aside className="card"><div className="card-head"><div><h2>Signals</h2><p>Based on your recorded data</p></div></div><div className="insight-list">{insights.map((insight) => <div key={insight.title} className={`insight ${insight.tone}`}><strong>{insight.title}</strong><p>{insight.body}</p></div>)}</div><button className="button secondary full" style={{marginTop:14}} onClick={draftProposal}><Sparkles size={15}/>Draft a budget change</button>{proposal && <div className="proposal" style={{marginTop:13}}><strong>Review proposed change</strong><p>Reduce the {proposal.category} budget from {formatMoney(proposal.currentMinor,state.profile.currency)} to {formatMoney(proposal.proposedMinor,state.profile.currency)}. This changes your budget plan only; it does not change past spending.</p><div className="proposal-actions"><button className="button primary" onClick={approveProposal}>Approve change</button><button className="button secondary" onClick={() => setProposal(null)}>Reject</button></div></div>}</aside></div></section>;
}

function ActivityLog({ state }: { state: FinanceState }) { return <section className="section-page"><div className="page-head"><div><h1>Activity history</h1><p>A concise record of meaningful actions in this demo workspace.</p></div></div><article className="card"><div className="activity-list">{state.activities.length ? state.activities.map((item) => <div className="activity" key={item.id}><i className="activity-dot"/><div><h3>{item.action}</h3><p>{item.detail}</p></div><time dateTime={item.createdAt}>{new Intl.DateTimeFormat("en-BD",{dateStyle:"medium",timeStyle:"short"}).format(new Date(item.createdAt))}</time></div>) : <Empty text="Actions such as edits, payments, and approved proposals appear here."/>}</div></article></section>; }

function SettingsPage({ state, mode, onMutate, onReset, onExport }: { state: FinanceState; mode: WorkspaceMode; onMutate: (recipe: (current: FinanceState) => FinanceState, success?: string) => void; onReset: () => void; onExport: () => void }) {
  const [balance, setBalance] = useState(moneyFromMinor(state.profile.openingBalanceMinor)); const [estimate, setEstimate] = useState(state.profile.expectedRemainingMinor === null ? "" : moneyFromMinor(state.profile.expectedRemainingMinor)); const [category, setCategory] = useState(""); const [error, setError] = useState("");
  function saveProfile() { setError(""); try { const openingBalanceMinor = parseMoney(balance || "0",state.profile.currency); const expectedRemainingMinor = estimate.trim() === "" ? null : parseMoney(estimate,state.profile.currency); onMutate((current) => withActivity({ ...current, profile:{...current.profile,openingBalanceMinor,expectedRemainingMinor} },activity("Forecast settings updated","Opening balance or expected remaining spending was updated.")),"Forecast settings saved"); } catch (issue) { setError(issue instanceof Error ? issue.message : "Check the amount."); } }
  function addCategory(event: FormEvent) { event.preventDefault(); const name = category.trim(); if (!name) return; if (state.categories.some((item) => item.name.toLowerCase() === name.toLowerCase())) { setError("That category already exists."); return; } const colors = ["#397eac","#aa6a9f","#bc7c36","#628251"]; const entry: Category = { id:uid(),name,color:colors[state.categories.length%colors.length],isDefault:false }; onMutate((current) => withActivity({...current,categories:[...current.categories,entry]},activity("Custom category created",`${entry.name} is ready to use.`)),"Category added"); setCategory(""); }
  const isDemo = mode === "demo";
  return <section className="section-page"><div className="page-head"><div><h1>Settings</h1><p>{isDemo ? "Demo controls and preferences for this device." : "Private workspace preferences that sync to your account."}</p></div></div><article className="card"><div className="settings-list"><div className="setting"><div><h3>Currency</h3><p>Used for display; money is stored as integer minor units.</p></div><select value={state.profile.currency} onChange={(event) => onMutate((current) => ({...current,profile:{...current.profile,currency:event.target.value as Currency}}),"Currency preference updated")} aria-label="Currency"><option value="BDT">BDT — Bangladeshi taka</option><option value="USD">USD — US dollar</option><option value="EUR">EUR — Euro</option><option value="GBP">GBP — Pound sterling</option><option value="INR">INR — Indian rupee</option></select></div><div className="setting"><div><h3>Timezone</h3><p>Dates are interpreted using your selected timezone. Asia/Dhaka is the default.</p></div><select value={state.profile.timezone} onChange={(event) => onMutate((current) => ({...current,profile:{...current.profile,timezone:event.target.value}}),"Timezone preference updated")} aria-label="Timezone"><option>Asia/Dhaka</option><option>Asia/Kolkata</option><option>Asia/Singapore</option><option>Europe/London</option><option>America/New_York</option></select></div></div></article><div className="two-column" style={{marginTop:17}}><article className="card"><div className="card-head"><div><h2>Forecast assumptions</h2><p>Change these figures whenever your plan changes.</p></div></div><div className="form-grid"><label>Opening available balance<input inputMode="decimal" value={balance} onChange={(event) => setBalance(event.target.value)}/></label><label>Expected remaining spending <span className="muted">(optional)</span><input inputMode="decimal" value={estimate} onChange={(event) => setEstimate(event.target.value)} placeholder="Leave blank to use budgets"/></label>{error && <p className="form-error">{error}</p>}<button className="button primary" onClick={saveProfile}>Save forecast settings</button></div></article><article className="card"><div className="card-head"><div><h2>Custom categories</h2><p>Default categories are kept for consistent reporting.</p></div></div><form className="contribution-form" onSubmit={addCategory}><input value={category} onChange={(event) => setCategory(event.target.value)} maxLength={50} placeholder="New category" aria-label="New category"/><button className="button secondary">Add</button></form><div className="category-chips">{state.categories.map((item) => <span className="tag" key={item.id}><i className="dot" style={{background:item.color}}/>{item.name}{!item.isDefault && <button aria-label={`Remove ${item.name}`} onClick={() => { const inUse = state.transactions.some((row) => row.categoryId === item.id) || state.budgets.some((row) => row.categoryId === item.id) || state.bills.some((row) => row.categoryId === item.id); if (inUse) { setError("A category can only be removed after its related records are reassigned or deleted."); return; } onMutate((current) => withActivity({...current,categories:current.categories.filter((row) => row.id !== item.id)},activity("Custom category removed",`${item.name} was removed.`)),"Category removed"); }}>×</button>}</span>)}</div></article></div><article className="card" style={{marginTop:17}}><div className="card-head"><div><h2>{isDemo ? "Demo data & privacy" : "Data & privacy"}</h2><p>{isDemo ? "All figures in this workspace are fictional and stored only in this browser." : "Your signed-in workspace is protected by account-scoped database policies."}</p></div></div><div className="setting"><div><h3>{isDemo ? "Export fictional demo" : "Export workspace"}</h3><p>{isDemo ? "Download a local JSON copy for inspection. It is not cloud backup or multi-device sync." : "Download a local JSON export of the workspace currently loaded on this device."}</p></div><button className="button secondary" onClick={onExport}><Download size={15}/>Export JSON</button></div>{isDemo && <div className="setting"><div><h3>Reset fictional demo</h3><p>Clear the browser’s local FinMate demo workspace and restore sample data.</p></div><button className="button danger" onClick={onReset}><RotateCcw size={15}/>Reset demo</button></div>}</article></section>;
}

function Onboarding({ state, onComplete }: { state: FinanceState; onComplete: (values: Pick<FinanceState["profile"], "currency" | "timezone" | "openingBalanceMinor" | "expectedRemainingMinor">) => void }) {
  const [currency, setCurrency] = useState<Currency>(state.profile.currency); const [timezone, setTimezone] = useState(state.profile.timezone); const [opening, setOpening] = useState(moneyFromMinor(state.profile.openingBalanceMinor)); const [error, setError] = useState("");
  function submit(event: FormEvent) { event.preventDefault(); try { const openingBalanceMinor = parseMoney(opening || "0",currency); onComplete({currency,timezone,openingBalanceMinor,expectedRemainingMinor:null}); } catch (issue) { setError(issue instanceof Error ? issue.message : "Check your opening balance."); } }
  return <Dialog title="Set up your workspace" description="Start with the basics. You can change these preferences later."><form className="form-grid" onSubmit={submit}><label>Preferred currency<select value={currency} onChange={(event) => setCurrency(event.target.value as Currency)}><option value="BDT">BDT — Bangladeshi taka</option><option value="USD">USD — US dollar</option><option value="EUR">EUR — Euro</option><option value="GBP">GBP — Pound sterling</option><option value="INR">INR — Indian rupee</option></select></label><label>Timezone<select value={timezone} onChange={(event) => setTimezone(event.target.value)}><option>Asia/Dhaka</option><option>Asia/Kolkata</option><option>Asia/Singapore</option><option>Europe/London</option><option>America/New_York</option></select></label><label>Opening available balance<input value={opening} onChange={(event) => setOpening(event.target.value)} inputMode="decimal" placeholder="0"/></label><p className="muted" style={{fontSize:12,margin:0}}>This is your starting available money, not monthly income. Add income and expenses to your ledger next.</p>{error && <p className="form-error">{error}</p>}<button className="button primary">Finish setup</button></form></Dialog>;
}

function Dialog({ title, description, children, onClose }: { title: string; description: string; children: ReactNode; onClose?: () => void }) { useEffect(() => { if (!onClose) return; const escape = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); }; document.addEventListener("keydown",escape); return () => document.removeEventListener("keydown",escape); },[onClose]); return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (onClose && event.target === event.currentTarget) onClose(); }}><section className="modal" role="dialog" aria-modal="true" aria-labelledby="dialog-title"><div className="modal-header"><div><h2 id="dialog-title">{title}</h2><p>{description}</p></div>{onClose && <button className="modal-close" onClick={onClose} aria-label="Close dialog"><X size={20}/></button>}</div>{children}</section></div>; }

function TransactionForm({ record, state, onSubmit, onCancel }: { record?: Transaction; state: FinanceState; onSubmit: (form: FormData) => void; onCancel: () => void }) {
  const [error, setError] = useState("");
  function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); try { onSubmit(new FormData(event.currentTarget)); } catch (issue) { setError(issue instanceof Error ? issue.message : "Could not save the transaction."); } }
  return <form className="form-grid" onSubmit={submit}><div className="form-two"><label>Type<select name="type" defaultValue={record?.type ?? "expense"}><option value="expense">Expense</option><option value="income">Income</option></select></label><label>Amount<input name="amount" inputMode="decimal" required defaultValue={record ? moneyFromMinor(record.amountMinor) : ""} placeholder="e.g. 1250"/></label></div><label>Description<input name="description" maxLength={120} required defaultValue={record?.description ?? ""} placeholder="e.g. Weekly groceries"/></label><div className="form-two"><label>Category<select name="categoryId" defaultValue={record?.categoryId ?? ""} required><option value="" disabled>Choose category</option>{state.categories.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label>Date<input name="transactionDate" type="date" defaultValue={record?.transactionDate ?? today()} required/></label></div><div className="form-two"><label>Account / method <span className="muted">(optional)</span><input name="account" defaultValue={record?.account ?? ""} maxLength={80} placeholder="Bank, cash, card…"/></label><label>Recurring<select name="recurring" defaultValue={record?.recurring ?? "none"}>{recurringValues.map((item) => <option key={item} value={item}>{item === "none" ? "One-time" : item[0].toUpperCase()+item.slice(1)}</option>)}</select></label></div><label>Notes <span className="muted">(optional)</span><textarea name="notes" defaultValue={record?.notes ?? ""} maxLength={500} placeholder="Anything useful to remember"/></label>{error && <p className="form-error">{error}</p>}<div className="modal-actions"><button type="button" className="button secondary" onClick={onCancel}>Cancel</button><button className="button primary">{record ? "Save changes" : "Add transaction"}</button></div></form>;
}
