"use client";
import Link from "next/link";
import { ArrowLeft, Eye, EyeOff, LockKeyhole } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import { getSupabaseBrowserClient, hasSupabaseConfig } from "@/lib/supabase";

export default function AuthPage() {
  const [mode, setMode] = useState<"sign-in" | "sign-up" | "reset" | "update-password">("sign-in");
  const [email, setEmail] = useState(""); const [password, setPassword] = useState(""); const [showPassword, setShowPassword] = useState(false); const [message, setMessage] = useState(""); const [busy, setBusy] = useState(false);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("mode") === "update-password") setMode("update-password");
    if (params.get("error") === "callback") setMessage("That sign-in link is invalid or expired. Request a new one and try again.");
  }, []);
  async function submit(event: FormEvent) {
    event.preventDefault(); setMessage(""); const client = getSupabaseBrowserClient();
    if (!client) { setMessage("Cloud sign-in is not configured in this preview. You can still explore the fictional local demo."); return; }
    setBusy(true);
    try {
      if (mode === "reset") { const { error } = await client.auth.resetPasswordForEmail(email, { redirectTo: `${location.origin}/auth/callback?next=${encodeURIComponent("/auth?mode=update-password")}` }); if (error) throw error; setMessage("If an account exists, a reset link has been sent."); }
      else if (mode === "update-password") { const { error } = await client.auth.updateUser({ password }); if (error) throw error; location.assign("/app"); }
      else if (mode === "sign-up") { const { error } = await client.auth.signUp({ email, password, options: { emailRedirectTo: `${location.origin}/auth/callback?next=%2Fapp` } }); if (error) throw error; setMessage("Check your inbox to confirm your account, then sign in."); }
      else { const { error } = await client.auth.signInWithPassword({ email, password }); if (error) throw error; location.assign("/app"); }
    } catch (error) { setMessage(error instanceof Error ? error.message : "We could not complete that request."); } finally { setBusy(false); }
  }
  const title = mode === "sign-up" ? "Start with a clearer picture." : mode === "reset" ? "Reset your password." : mode === "update-password" ? "Choose a new password." : "Welcome back.";
  return <main className="auth-page"><section className="auth-panel"><Link href="/" className="back-link"><ArrowLeft size={16}/> Back to home</Link><div className="brand"><span className="brand-mark">F</span>FinMate AI</div><div className="auth-heading"><span className="eyebrow">Private finance workspace</span><h1>{title}</h1><p>{hasSupabaseConfig ? "Your financial data is protected by your account." : "Cloud authentication needs Supabase configuration. Demo data is fictional and local."}</p></div><form className="auth-form" onSubmit={submit}>{mode !== "update-password" && <label>Email<input autoComplete="email" required type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com"/></label>}{mode !== "reset" && <label>Password<div className="password-wrap"><input autoComplete={mode === "sign-up" || mode === "update-password" ? "new-password" : "current-password"} minLength={8} required type={showPassword ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 8 characters"/><button type="button" aria-label={showPassword ? "Hide password" : "Show password"} onClick={() => setShowPassword(!showPassword)}>{showPassword ? <EyeOff size={17}/> : <Eye size={17}/>}</button></div></label>}<button className="button primary full" disabled={busy}>{busy ? "Working…" : mode === "sign-up" ? "Create account" : mode === "reset" ? "Send reset link" : mode === "update-password" ? "Save new password" : "Sign in"}</button></form>{message && <p className="form-message" role="status">{message}</p>}<div className="auth-switch">{mode === "sign-in" && <><button onClick={() => setMode("reset")}>Forgot password?</button><span>·</span><button onClick={() => setMode("sign-up")}>Create an account</button></>}{mode === "sign-up" && <button onClick={() => setMode("sign-in")}>Already have an account? Sign in</button>}{(mode === "reset" || mode === "update-password") && <button onClick={() => setMode("sign-in")}>Back to sign in</button>}</div><div className="demo-box"><LockKeyhole size={18}/><div><strong>Just looking around?</strong><p>Explore a local workspace with fictional figures—no account or sync.</p><Link className="button secondary" href="/app?demo=1">Open demo</Link></div></div></section></main>;
}
