"use client";

import Link from "next/link";
import { ArrowLeft, Eye, EyeOff, LockKeyhole, Mail, ShieldCheck } from "lucide-react";
import { type FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { getSafeAuthErrorMessage, getSignupNextStep, isEmailConfirmed, isValidEmailOtp } from "@/lib/auth-validation";
import { getSupabaseBrowserClient, hasSupabaseConfig } from "@/lib/supabase";

type Mode = "sign-in" | "sign-up" | "verify" | "reset" | "update-password";
const PENDING_EMAIL = "finmate.pending-verification-email";
const RESEND_SECONDS = 30;

function callbackUrl(next: string) {
  return `${location.origin}/auth/callback?next=${encodeURIComponent(next)}`;
}

export default function AuthPage() {
  const [mode, setMode] = useState<Mode>("sign-in");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [message, setMessage] = useState("");
  const [messageKind, setMessageKind] = useState<"error" | "success" | "info">("info");
  const [busy, setBusy] = useState(false);
  const [resendIn, setResendIn] = useState(0);
  const busyRef = useRef(false);

  const tell = useCallback((text: string, kind: "error" | "success" | "info" = "info") => {
    setMessage(text);
    setMessageKind(kind);
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("mode") === "update-password") setMode("update-password");
    if (params.get("mode") === "sign-up") setMode("sign-up");
    if (params.get("mode") === "verify-email") setMode("verify");
    if (params.get("error") === "callback") tell("That confirmation or recovery link is invalid or expired. Request a fresh email and try again.", "error");
    const savedEmail = sessionStorage.getItem(PENDING_EMAIL);
    if (savedEmail) {
      setEmail(savedEmail);
      if (params.get("mode") !== "update-password") setMode("verify");
    }
  }, [tell]);

  useEffect(() => {
    if (!resendIn) return;
    const timer = window.setTimeout(() => setResendIn((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearTimeout(timer);
  }, [resendIn]);

  function switchMode(next: Mode) {
    setMode(next);
    setOtp("");
    tell("");
    if (next !== "sign-up") { setPassword(""); setConfirmPassword(""); }
  }

  function validEmail(value: string) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busyRef.current) return;
    tell("");
    const client = getSupabaseBrowserClient();
    if (!client) { tell("Cloud sign-in is not configured in this preview. You can still explore the clearly labelled fictional demo.", "error"); return; }
    if (!validEmail(email)) { tell("Enter a valid email address.", "error"); return; }
    if ((mode === "sign-up" || mode === "update-password") && password.length < 8) { tell("Use a password with at least 8 characters.", "error"); return; }
    if ((mode === "sign-up" || mode === "update-password") && password !== confirmPassword) { tell("The passwords do not match.", "error"); return; }
    busyRef.current = true;
    setBusy(true);
    try {
      if (mode === "reset") {
        const { error } = await client.auth.resetPasswordForEmail(email.trim(), { redirectTo: callbackUrl("/auth?mode=update-password") });
        if (error) throw error;
        tell("If an account exists for this address, a password reset link has been sent.", "success");
      } else if (mode === "update-password") {
        const { error } = await client.auth.updateUser({ password });
        if (error) throw error;
        tell("Your password has been updated. Taking you to your workspace…", "success");
        location.replace("/app");
      } else if (mode === "sign-up") {
        const { data, error } = await client.auth.signUp({
          email: email.trim(),
          password,
          options: { data: { full_name: name.trim() } },
        });
        if (error) throw error;
        if (getSignupNextStep(Boolean(data.session), data.user) === "workspace") {
          sessionStorage.removeItem(PENDING_EMAIL);
          location.replace("/app");
          return;
        }
        sessionStorage.setItem(PENDING_EMAIL, email.trim());
        setResendIn(RESEND_SECONDS);
        setMode("verify");
        tell("If this address can receive a signup code, check your inbox and spam folder. Enter the six-digit code below. If you already have an account, sign in instead.", "success");
      } else {
        const { data, error } = await client.auth.signInWithPassword({ email: email.trim(), password });
        if (error) throw error;
        if (!isEmailConfirmed(data.user)) {
          sessionStorage.setItem(PENDING_EMAIL, email.trim());
          setMode("verify");
          setResendIn(0);
          tell("Enter the six-digit code sent to your email. You can request another code below.", "info");
          return;
        }
        location.replace("/app");
      }
    } catch (error) {
      tell(getSafeAuthErrorMessage(error, mode === "update-password" ? "update" : mode === "sign-up" ? "sign-up" : mode === "reset" ? "reset" : "sign-in"), "error");
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  async function verifyCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busyRef.current || !isValidEmailOtp(otp)) {
      if (!isValidEmailOtp(otp)) tell("Enter the six-digit code from your email.", "error");
      return;
    }
    const client = getSupabaseBrowserClient();
    if (!client) { tell("Cloud verification is not configured in this preview.", "error"); return; }
    busyRef.current = true;
    setBusy(true);
    tell("");
    try {
      const { data, error } = await client.auth.verifyOtp({ email: email.trim(), token: otp, type: "signup" });
      if (error) throw error;
      if (!data.session || !data.user) {
        tell("The code was accepted, but a sign-in session was not created. Please sign in and try again.", "error");
        return;
      }
      sessionStorage.removeItem(PENDING_EMAIL);
      setOtp("");
      location.replace("/app");
    } catch (error) {
      tell(getSafeAuthErrorMessage(error, "verify"), "error");
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  async function resendConfirmation() {
    if (busyRef.current || resendIn > 0 || !validEmail(email)) return;
    const client = getSupabaseBrowserClient();
    if (!client) { tell("Cloud verification is not configured in this preview.", "error"); return; }
    busyRef.current = true;
    setBusy(true);
    tell("");
    try {
      const { error } = await client.auth.resend({ email: email.trim(), type: "signup" });
      if (error) throw error;
      setResendIn(RESEND_SECONDS);
      tell("If this address can receive a code, a new verification email has been requested. Check your inbox or spam folder.", "success");
    } catch (error) {
      setResendIn(RESEND_SECONDS);
      tell(getSafeAuthErrorMessage(error, "resend"), "error");
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  const titles: Record<Mode, string> = {
    "sign-in": "Welcome back.",
    "sign-up": "A clearer view starts here.",
    verify: "Enter your verification code.",
    reset: "Reset your password.",
    "update-password": "Choose a new password.",
  };

  return <main className="auth-page">
    <section className="auth-panel" aria-labelledby="auth-title">
      <Link href="/" className="back-link"><ArrowLeft size={16}/> Back to home</Link>
      <div className="brand"><span className="brand-mark">F</span>FinMate AI</div>
      <div className="auth-heading"><span className="eyebrow">Private finance workspace</span><h1 id="auth-title">{titles[mode]}</h1><p>{mode === "verify" ? <>We requested a confirmation email for <strong>{email || "your email address"}</strong>. Open its link to finish signing up and securely open your workspace.</> : hasSupabaseConfig ? "Your financial data is protected by your account." : "Cloud authentication needs Supabase configuration. Demo data is fictional and local."}</p></div>

      {mode === "verify" ? <form className="auth-form" onSubmit={verifyCode}>
        <label>Email address<input autoComplete="email" required type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" /></label>
        <label>Six-digit verification code<input autoComplete="one-time-code" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} minLength={6} required value={otp} onChange={(event) => setOtp(event.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="123456" /></label>
        <p className="password-hint">Enter the code from your email. If it does not arrive, check spam and try again later.</p>
        <button className="button primary full" disabled={busy || !isValidEmailOtp(otp)}>{busy ? <><span className="auth-spinner"/> Verifying…</> : "Verify code"}</button>
        <div className="verify-actions"><button type="button" disabled={busy || resendIn > 0} onClick={() => void resendConfirmation()}>{resendIn ? "Resend code in " + resendIn + "s" : "Resend code"}</button><button type="button" disabled={busy} onClick={() => { sessionStorage.removeItem(PENDING_EMAIL); setEmail(""); setOtp(""); switchMode("sign-up"); }}>Change email</button></div>
      </form> : <form className="auth-form" onSubmit={submit}>
        {mode === "sign-up" && <label>Full name <span className="optional-label">(optional)</span><input autoComplete="name" maxLength={80} value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" /></label>}
        {mode !== "update-password" && <label>Email address<input autoComplete="email" required type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" /></label>}
        {mode !== "reset" && <label>{mode === "update-password" ? "New password" : "Password"}<div className="password-wrap"><input autoComplete={mode === "sign-up" || mode === "update-password" ? "new-password" : "current-password"} minLength={8} required type={showPassword ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 8 characters"/><button type="button" aria-label={showPassword ? "Hide password" : "Show password"} onClick={() => setShowPassword(!showPassword)}>{showPassword ? <EyeOff size={17}/> : <Eye size={17}/>}</button></div>{(mode === "sign-up" || mode === "update-password") && <span className="password-hint">Use at least 8 characters; a unique passphrase is best.</span>}</label>}
        {(mode === "sign-up" || mode === "update-password") && <label>Confirm password<input autoComplete="new-password" minLength={8} required type={showPassword ? "text" : "password"} value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="Enter it again" /></label>}
        <button className="button primary full" disabled={busy}>{busy ? <><span className="auth-spinner"/> Working…</> : mode === "sign-up" ? "Create account" : mode === "reset" ? "Send reset link" : mode === "update-password" ? "Save new password" : "Sign in"}</button>
      </form>}

      {message && <p className={`form-message ${messageKind}`} role={messageKind === "error" ? "alert" : "status"}>{message}</p>}
      {mode !== "verify" && <div className="auth-switch">{mode === "sign-in" && <><button type="button" onClick={() => switchMode("reset")}>Forgot password?</button><span>·</span><button type="button" onClick={() => switchMode("sign-up")}>Create an account</button><button className="verify-entry" type="button" onClick={() => { switchMode("verify"); tell("Enter your email and request a verification code. We won't reveal account status.", "info"); }}>Need a confirmation email?</button></>}{mode === "sign-up" && <button type="button" onClick={() => switchMode("sign-in")}>Already have an account? Sign in</button>}{(mode === "reset" || mode === "update-password") && <button type="button" onClick={() => switchMode("sign-in")}>Back to sign in</button>}</div>}
      {mode === "sign-in" && <div className="demo-box"><LockKeyhole size={18}/><div><strong>Just looking around?</strong><p>Explore fictional figures in a separate local demo—no real financial data or account sync.</p><Link className="button secondary" href="/app?demo=1">Open demo</Link></div></div>}
      <div className="auth-trust"><ShieldCheck size={15}/><span>Private by design · Your account data stays yours</span></div>
      <div className="auth-signup-note"><Mail size={14}/> Verification is handled securely by your account provider.</div>
    </section>
  </main>;
}
