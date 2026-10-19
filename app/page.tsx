import Link from "next/link";
import { ArrowRight, BadgeDollarSign, BrainCircuit, CalendarClock, ChartNoAxesCombined, LockKeyhole, PiggyBank, ReceiptText } from "lucide-react";

const features = [
  { icon: ChartNoAxesCombined, title: "See the full picture", text: "Balances, cash flow, budgets, and forecasts in one calm daily view." },
  { icon: CalendarClock, title: "Plan for bills", text: "Reserve upcoming bills once—clearly, without double-counting them." },
  { icon: BrainCircuit, title: "Thoughtful guidance", text: "Get transparent, rules-based insights without needing an AI key." },
  { icon: ReceiptText, title: "A real ledger", text: "Add, edit, filter, and search every income and expense with confidence." },
  { icon: PiggyBank, title: "Make goals tangible", text: "Track savings progress and record every contribution deliberately." },
  { icon: LockKeyhole, title: "Privacy by design", text: "Demo data stays in this browser. Connected accounts use database ownership rules." }
];

export default function HomePage() {
  return <main className="app-shell">
    <nav className="landing-nav" aria-label="Primary navigation">
      <Link href="/" className="brand"><span className="brand-mark">F</span>FinMate AI</Link>
      <div className="nav-links"><a href="#features">Features</a><a href="#how-it-works">How it works</a><Link href="/auth">Sign in</Link><Link className="button primary" href="/app?demo=1">Explore demo <ArrowRight size={16}/></Link></div>
    </nav>
    <section className="landing-hero">
      <div><span className="eyebrow">Clearer money decisions</span><h1>Know where your money can take you.</h1><p>FinMate AI turns a busy financial month into a clear plan—without pretending estimates are promises.</p><div className="hero-actions"><Link className="button primary" href="/app?demo=1">Explore fictional demo <ArrowRight size={16}/></Link><Link className="button secondary" href="/auth">Create an account</Link></div><p className="fineprint"><BadgeDollarSign size={14} style={{verticalAlign:"-2px"}}/> BDT-ready · No account required to explore</p></div>
      <div className="hero-card" aria-label="Illustrative cash flow preview"><small>Estimated month-end balance</small><div className="hero-value">৳ 38,650</div><div className="hero-chart" aria-hidden="true"><span style={{height:"35%"}}/><span style={{height:"53%"}}/><span style={{height:"46%"}}/><span style={{height:"72%"}}/><span style={{height:"62%"}}/><span style={{height:"88%"}}/></div><div className="hero-card-row"><span>Upcoming bills</span><strong>৳ 1,600</strong></div></div>
    </section>
    <section id="features" className="feature-section"><div className="section-heading"><span className="eyebrow">Built for everyday decisions</span><h2>Simple enough to use. Serious enough to trust.</h2><p>Every number is traceable to your ledger, a bill, or a plainly stated estimate.</p></div><div className="feature-grid">{features.map(({ icon: Icon, title, text }) => <article className="feature" key={title}><span className="feature-icon"><Icon size={21}/></span><h3>{title}</h3><p>{text}</p></article>)}</div></section>
    <section id="how-it-works" className="feature-section"><div className="section-heading"><span className="eyebrow">How it works</span><h2>Start with what you know.</h2></div><div className="steps"><div className="step"><span className="step-num">01 / RECORD</span><h3>Add income, expenses, and bills</h3><p>Use your own figures—or begin with a clearly fictional sample workspace.</p></div><div className="step"><span className="step-num">02 / UNDERSTAND</span><h3>Review your plan</h3><p>FinMate separates paid spending, reserved bills, and expected spending.</p></div><div className="step"><span className="step-num">03 / ACT</span><h3>Choose your next move</h3><p>Suggestions are always reviewable. Nothing changes until you approve it.</p></div></div></section>
    <footer className="landing-footer"><span>© {new Date().getFullYear()} FinMate AI</span><span>Financial education and organisation—not financial advice.</span></footer>
  </main>;
}
