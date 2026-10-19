"use client";

import Link from "next/link";
import { ArrowLeft, Eye, EyeOff, LockKeyhole, Mail, ShieldCheck } from "lucide-react";
import { type FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { getInitialAuthMode, getSafeAuthErrorMessage, getSignupEmailOtpParams, isEmailConfirmed, isSignupEmailConfirmationDisabled, isValidEmailOtp, remainingResendSeconds, SIGNUP_RESEND_COOLDOWN_SECONDS } from "@/lib/auth-validation";
import { getSupabaseBrowserClient, hasSupabaseConfig } from "@/lib/supabase";

type Mode = "sign-in" | "sign-up" | "verify" | "complete" | "reset" | "update-password";
const PENDING_EMAIL = "finmate.pending-verification-email";
const RESEND_SENT_AT = "finmate.signup-otp-last-sent-at";

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
    const requestedMode = params.get("mode");
    const savedEmail = sessionStorage.getItem(PENDING_EMAIL);
    const initialMode = getInitialAuthMode(requestedMode, Boolean(savedEmail));
    setMode(initialMode);
    if (savedEmail && initialMode === "verify") setEmail(savedEmail);
    if (params.get("error") === "callback") tell("That confirmation or recovery link is invalid or expired. Request a fresh email and try again.", "error");
  }, [tell]);

  useEffect(() => {
    const tick = () => {
      const sentAt = Number(sessionStorage.getItem(RESEND_SENT_AT));
      setResendIn(remainingResendSeconds(Number.isFinite(sentAt) && sentAt > 0 ? sentAt : null));
    };
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, []);

  function switchMode(next: Mode) {
    if (next === "sign-up") {
      sessionStorage.removeItem(PENDING_EMAIL);
      sessionStorage.removeItem(RESEND_SENT_AT);
    }
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
        if (data.user?.identities?.length === 0) {
          setEmail(email.trim());
          setMode("sign-in");
          tell("We couldn't start a new signup. Try signing in or use Forgot password. If you still need to verify an account, choose “Need a verification code?”.", "info");
          return;
        }
        if (isSignupEmailConfirmationDisabled(Boolean(data.session), data.user)) {
          const { error: signOutError } = await client.auth.signOut({ scope: "local" });
          if (signOutError) throw signOutError;
          tell("Email confirmation is not enabled for this Supabase project. Ask the project owner to enable Confirm Email before creating accounts.", "error");
          return;
        }
        sessionStorage.setItem(PENDING_EMAIL, email.trim());
        sessionStorage.setItem(RESEND_SENT_AT, String(Date.now()));
        const verifyUrl = new URL(window.location.href);
        verifyUrl.searchParams.set("mode", "verify-email");
        window.history.replaceState(window.history.state, "", verifyUrl);
        setResendIn(SIGNUP_RESEND_COOLDOWN_SECONDS);
        setMode("verify");
        setOtp("");
        tell("A verification code was requested. Enter the code exactly as shown in your email to finish creating your account.", "success");
      } else {
        const { data, error } = await client.auth.signInWithPassword({ email: email.trim(), password });
        if (error) throw error;
        if (!isEmailConfirmed(data.user)) {
          sessionStorage.setItem(PENDING_EMAIL, email.trim());
          setMode("verify");
          setResendIn(0);
          tell("Enter the verification code sent to your email. You can request another code below.", "info");
          return;
        }
        location.replace("/app");
      }
    } catch (error) {
      if (mode === "sign-in" && error instanceof Error && /email not confirmed|email_not_confirmed/i.test(error.message)) {
        sessionStorage.setItem(PENDING_EMAIL, email.trim());
        setOtp("");
        setMode("verify");
      }
      tell(getSafeAuthErrorMessage(error, mode === "update-password" ? "update" : mode === "sign-up" ? "sign-up" : mode === "reset" ? "reset" : "sign-in"), "error");
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  async function verifyCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busyRef.current || !isValidEmailOtp(otp)) {
      if (!isValidEmailOtp(otp)) tell("Enter the complete verification code from your email (6–10 digits).", "error");
      return;
    }
    const client = getSupabaseBrowserClient();
    if (!client) { tell("Cloud verification is not configured in this preview.", "error"); return; }
    busyRef.current = true;
    setBusy(true);
    tell("");
    try {
      const { data, error } = await client.auth.verifyOtp(getSignupEmailOtpParams(email, otp));
      if (error) throw error;
      if (!data.session || !isEmailConfirmed(data.user)) throw new Error("Verification did not create a confirmed session");
      sessionStorage.removeItem(PENDING_EMAIL);
      sessionStorage.removeItem(RESEND_SENT_AT);
      setOtp("");
      setMode("complete");
      tell("Your email is verified and your account is ready.", "success");
    } catch (error) {
      tell(getSafeAuthErrorMessage(error, "verify"), "error");
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  async function signOutToSignIn() {
    const client = getSupabaseBrowserClient();
    if (!client || busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    tell("");
    try {
      const { error } = await client.auth.signOut({ scope: "local" });
      if (error) throw error;
      setPassword("");
      setConfirmPassword("");
      setMode("sign-in");
      tell("Email verified. Sign in with the same email and password whenever you're ready.", "success");
    } catch {
      tell("Your account is verified, but we couldn't sign you out automatically. You can continue to your dashboard.", "error");
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
      sessionStorage.setItem(RESEND_SENT_AT, String(Date.now()));
      setResendIn(SIGNUP_RESEND_COOLDOWN_SECONDS);
      tell("If this address can receive a message, a verification code has been requested. Check your inbox or spam folder.", "success");
    } catch (error) {
      sessionStorage.setItem(RESEND_SENT_AT, String(Date.now()));
      setResendIn(SIGNUP_RESEND_COOLDOWN_SECONDS);
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
    complete: "Your account is ready.",
    reset: "Reset your password.",
    "update-password": "Choose a new password.",
  };

  return <main className="auth-page">
    <section className="auth-panel" aria-labelledby="auth-title">
      <Link href="/" className="back-link"><ArrowLeft size={16}/> Back to home</Link>
      <div className="brand"><span className="brand-mark">F</span>FinMate AI</div>
      <div className="auth-heading"><span className="eyebrow">Private finance workspace</span><h1 id="auth-title">{titles[mode]}</h1><p>{mode === "verify" ? <>We requested a verification code for <strong>{email || "your email address"}</strong>. Enter the complete code to finish signing up and securely open your workspace.</> : mode === "complete" ? "Your email address is confirmed. Your account is ready to use." : hasSupabaseConfig ? "Your financial data is protected by your account." : "Cloud authentication needs Supabase configuration. Demo data is fictional and local."}</p></div>

      {mode === "complete" ? <div className="auth-form">
        <button className="button primary full" type="button" onClick={() => location.assign("/app")}>Go to dashboard</button>
        <button className="button secondary full" type="button" disabled={busy} onClick={() => void signOutToSignIn()}>{busy ? "Signing out…" : "Sign out and go to sign in"}</button>
      </div> : mode === "verify" ? <form className="auth-form" onSubmit={verifyCode}>
        <label>Email address<input autoComplete="email" required type="email" value={email} readOnly aria-describedby="verification-email-hint" placeholder="you@example.com" /></label>
        <span id="verification-email-hint" className="password-hint">To use a different address, choose “Change email” and restart signup.</span>
        <label>Verification code<input autoComplete="one-time-code" inputMode="numeric" pattern="[0-9]{6,10}" maxLength={10} minLength={6} required value={otp} onChange={(event) => setOtp(event.target.value.replace(/\D/g, "").slice(0, 10))} placeholder="Enter email code" aria-label="Email verification code" /></label>
        <p className="password-hint">Enter all digits exactly as shown in the email. Codes expire; request a new one if needed.</p>
        <button className="button primary full" disabled={busy || !isValidEmailOtp(otp)}>{busy ? "Verifying…" : "Verify email"}</button>
        <div className="verify-actions"><button type="button" disabled={busy || resendIn > 0} onClick={() => void resendConfirmation()}>{resendIn ? "Resend code in " + resendIn + "s" : "Resend verification code"}</button><button type="button" disabled={busy} onClick={() => { sessionStorage.removeItem(PENDING_EMAIL); sessionStorage.removeItem(RESEND_SENT_AT); setEmail(""); setOtp(""); switchMode("sign-up"); }}>Change email</button></div>
      </form> : <form className="auth-form" onSubmit={submit}>
        {mode === "sign-up" && <label>Full name <span className="optional-label">(optional)</span><input autoComplete="name" maxLength={80} value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" /></label>}
        {mode !== "update-password" && <label>Email address<input autoComplete="email" required type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" /></label>}
        {mode !== "reset" && <label>{mode === "update-password" ? "New password" : "Password"}<div className="password-wrap"><input autoComplete={mode === "sign-up" || mode === "update-password" ? "new-password" : "current-password"} minLength={8} required type={showPassword ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 8 characters"/><button type="button" aria-label={showPassword ? "Hide password" : "Show password"} onClick={() => setShowPassword(!showPassword)}>{showPassword ? <EyeOff size={17}/> : <Eye size={17}/>}</button></div>{(mode === "sign-up" || mode === "update-password") && <span className="password-hint">Use at least 8 characters; a unique passphrase is best.</span>}</label>}
        {(mode === "sign-up" || mode === "update-password") && <label>Confirm password<input autoComplete="new-password" minLength={8} required type={showPassword ? "text" : "password"} value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="Enter it again" /></label>}
        <button className="button primary full" disabled={busy}>{busy ? <><span className="auth-spinner"/> Working…</> : mode === "sign-up" ? "Create account" : mode === "reset" ? "Send reset link" : mode === "update-password" ? "Save new password" : "Sign in"}</button>
      </form>}

      {message && <p className={`form-message ${messageKind}`} role={messageKind === "error" ? "alert" : "status"}>{message}</p>}
      {mode !== "verify" && mode !== "complete" && <div className="auth-switch">{mode === "sign-in" && <><button type="button" onClick={() => switchMode("reset")}>Forgot password?</button><span>·</span><button type="button" onClick={() => switchMode("sign-up")}>Create an account</button><button className="verify-entry" type="button" onClick={() => { switchMode("verify"); tell("Enter your email and request a verification code. We won't reveal account status.", "info"); }}>Need a verification code?</button></>}{mode === "sign-up" && <button type="button" onClick={() => switchMode("sign-in")}>Already have an account? Sign in</button>}{(mode === "reset" || mode === "update-password") && <button type="button" onClick={() => switchMode("sign-in")}>Back to sign in</button>}</div>}
      {mode === "sign-in" && <div className="demo-box"><LockKeyhole size={18}/><div><strong>Just looking around?</strong><p>Explore fictional figures in a separate local demo—no real financial data or account sync.</p><Link className="button secondary" href="/app?demo=1">Open demo</Link></div></div>}
      <div className="auth-trust"><ShieldCheck size={15}/><span>Private by design · Your account data stays yours</span></div>
      <div className="auth-signup-note"><Mail size={14}/> Verification is handled securely by your account provider.</div>
    </section>
  </main>;
}
