"use client";

import Link from "next/link";
import { ArrowLeft, Eye, EyeOff, LockKeyhole, Mail, ShieldCheck } from "lucide-react";
import { type FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { AUTH_DRAFT_MAX_AGE_MS, authModeQueryValue, clearPendingAuthValue, getInitialAuthMode, getRecoveryEmailOtpParams, getSafeAuthErrorMessage, getSignupEmailOtpParams, isEmailConfirmed, isSignupEmailConfirmationDisabled, isValidEmailOtp, persistVerificationDraft, readAuthDraft, readPendingAuthValue, remainingResendSeconds, SIGNUP_RESEND_COOLDOWN_SECONDS, writeAuthDraft, writePendingAuthValue } from "@/lib/auth-validation";
import { getSupabaseBrowserClient, hasSupabaseConfig } from "@/lib/supabase";

type Mode = "sign-in" | "sign-up" | "verify" | "verify-recovery" | "complete" | "reset" | "update-password";
const PENDING_EMAIL = "finmate.pending-verification-email";
const RESEND_SENT_AT = "finmate.signup-otp-last-sent-at";
const PENDING_SINCE = "finmate.pending-verification-since";
const AUTH_DRAFT = "finmate.auth-draft.v1";
// Access the storage properties lazily: some mobile/private contexts throw even
// when reading window.localStorage/sessionStorage, not just on setItem().
const localStorage = {
  getItem: (key: string) => { try { return window.localStorage.getItem(key); } catch { return null; } },
  setItem: (key: string, value: string) => { try { window.localStorage.setItem(key, value); } catch { /* URL mode remains available. */ } },
  removeItem: (key: string) => { try { window.localStorage.removeItem(key); } catch { /* Storage may be unavailable. */ } },
};
const sessionStorage = {
  getItem: (key: string) => { try { return window.sessionStorage.getItem(key); } catch { return null; } },
  setItem: (key: string, value: string) => { try { window.sessionStorage.setItem(key, value); } catch { /* Best effort only. */ } },
  removeItem: (key: string) => { try { window.sessionStorage.removeItem(key); } catch { /* Storage may be unavailable. */ } },
};

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
  const [restored, setRestored] = useState(false);
  const busyRef = useRef(false);

  const tell = useCallback((text: string, kind: "error" | "success" | "info" = "info") => {
    setMessage(text);
    setMessageKind(kind);
  }, []);

  useEffect(() => {
    const restoreFromBrowser = () => {
      const params = new URLSearchParams(window.location.search);
      const draft = readAuthDraft(AUTH_DRAFT, localStorage, sessionStorage);
      let pendingEmail = readPendingAuthValue(PENDING_EMAIL, localStorage, sessionStorage);
      const pendingSince = Number(readPendingAuthValue(PENDING_SINCE, localStorage, sessionStorage));
      if (pendingEmail && pendingSince > 0 && Date.now() - pendingSince > AUTH_DRAFT_MAX_AGE_MS) {
        clearPendingAuthValue(PENDING_EMAIL, localStorage, sessionStorage);
        clearPendingAuthValue(PENDING_SINCE, localStorage, sessionStorage);
        clearPendingAuthValue(RESEND_SENT_AT, localStorage, sessionStorage);
        pendingEmail = null;
      } else if (pendingEmail && !pendingSince) {
        writePendingAuthValue(PENDING_SINCE, String(Date.now()), localStorage, sessionStorage);
      }
      const savedEmail = pendingEmail || draft?.email || "";
      const initialMode = getInitialAuthMode(params.get("error") === "callback" ? "sign-in" : params.get("mode"), Boolean(pendingEmail), draft?.mode);
      const restoredUrl = new URL(window.location.href);
      restoredUrl.searchParams.set("mode", authModeQueryValue(initialMode));
      window.history.replaceState(window.history.state, "", restoredUrl);
      setMode(initialMode);
      setEmail(savedEmail);
      setName(draft?.name ?? "");
      setRestored(true);
      if (params.get("error") === "callback") tell("That confirmation or recovery link is invalid or expired. Request a fresh email and try again.", "error");
    };
    restoreFromBrowser();
    const onPageShow = () => restoreFromBrowser();
    const onPopState = () => restoreFromBrowser();
    const onVisibilityChange = () => { if (document.visibilityState === "visible") restoreFromBrowser(); };
    window.addEventListener("pageshow", onPageShow);
    window.addEventListener("popstate", onPopState);
    window.addEventListener("storage", onPageShow);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.removeEventListener("pageshow", onPageShow);
      window.removeEventListener("popstate", onPopState);
      window.removeEventListener("storage", onPageShow);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [tell]);

  useEffect(() => {
    if (!restored) return;
    if (mode === "complete") {
      clearPendingAuthValue(AUTH_DRAFT, localStorage, sessionStorage);
      return;
    }
    writeAuthDraft(AUTH_DRAFT, { mode, email, name, updatedAt: Date.now() }, localStorage, sessionStorage);
  }, [email, mode, name, restored]);

  useEffect(() => {
    const tick = () => {
      const sentAt = Number(readPendingAuthValue(RESEND_SENT_AT, localStorage, sessionStorage));
      setResendIn(remainingResendSeconds(Number.isFinite(sentAt) && sentAt > 0 ? sentAt : null));
    };
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, []);

  function setModeInUrl(next: Mode, replace = true) {
    const url = new URL(window.location.href);
    url.searchParams.set("mode", authModeQueryValue(next));
    url.searchParams.delete("error");
    window.history[replace ? "replaceState" : "pushState"](window.history.state, "", url);
  }

  function switchMode(next: Mode) {
    if (next !== "complete") writeAuthDraft(AUTH_DRAFT, { mode: next, email, name, updatedAt: Date.now() }, localStorage, sessionStorage);
    setModeInUrl(next, false);
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
        writePendingAuthValue(PENDING_EMAIL, email.trim(), localStorage, sessionStorage);
        writePendingAuthValue(PENDING_SINCE, String(Date.now()), localStorage, sessionStorage);
        writePendingAuthValue(RESEND_SENT_AT, String(Date.now()), localStorage, sessionStorage);
        setModeInUrl("verify-recovery");
        setMode("verify-recovery");
        setOtp("");
        setResendIn(SIGNUP_RESEND_COOLDOWN_SECONDS);
        tell("If an account exists and email delivery succeeds, follow the recovery instructions sent. Check your inbox and spam folder; you can enter a code here or open a secure reset link.", "success");
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
        const verifiedAt = Date.now();
        persistVerificationDraft({ pendingEmail: PENDING_EMAIL, pendingSince: PENDING_SINCE, resendSentAt: RESEND_SENT_AT, draft: AUTH_DRAFT }, email, name, verifiedAt, localStorage, sessionStorage);
        setModeInUrl("verify");
        setResendIn(SIGNUP_RESEND_COOLDOWN_SECONDS);
        setMode("verify");
        setOtp("");
        tell("A verification code was requested. Enter the code exactly as shown in your email to finish creating your account.", "success");
      } else {
        const { data, error } = await client.auth.signInWithPassword({ email: email.trim(), password });
        if (error) throw error;
        if (!isEmailConfirmed(data.user)) {
          writePendingAuthValue(PENDING_EMAIL, email.trim(), localStorage, sessionStorage);
          writePendingAuthValue(PENDING_SINCE, String(Date.now()), localStorage, sessionStorage);
          writePendingAuthValue(RESEND_SENT_AT, "0", localStorage, sessionStorage);
          setModeInUrl("verify");
          setMode("verify");
          setResendIn(0);
          tell("Enter the verification code sent to your email. You can request another code below.", "info");
          return;
        }
        location.replace("/app");
      }
    } catch (error) {
      if (mode === "sign-in" && error instanceof Error && /email not confirmed|email_not_confirmed/i.test(error.message)) {
        writePendingAuthValue(PENDING_EMAIL, email.trim(), localStorage, sessionStorage);
        writePendingAuthValue(PENDING_SINCE, String(Date.now()), localStorage, sessionStorage);
        setOtp("");
        setModeInUrl("verify");
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
    if (busyRef.current) return;
    if (!validEmail(email)) { tell("Enter the email address used to create your account.", "error"); return; }
    if (!isValidEmailOtp(otp)) { tell("Enter the complete verification code from your email (6–10 digits).", "error"); return; }
    const client = getSupabaseBrowserClient();
    if (!client) { tell("Cloud verification is not configured in this preview.", "error"); return; }
    busyRef.current = true;
    setBusy(true);
    tell("");
    try {
      const { data, error } = await client.auth.verifyOtp(getSignupEmailOtpParams(email, otp));
      if (error) throw error;
      if (!data.session || !isEmailConfirmed(data.user)) throw new Error("Verification did not create a confirmed session");
      clearPendingAuthValue(PENDING_EMAIL, localStorage, sessionStorage);
      clearPendingAuthValue(PENDING_SINCE, localStorage, sessionStorage);
      clearPendingAuthValue(RESEND_SENT_AT, localStorage, sessionStorage);
      setOtp("");
      setModeInUrl("complete");
      setMode("complete");
      tell("Your email is verified and your account is ready.", "success");
    } catch (error) {
      tell(getSafeAuthErrorMessage(error, "verify"), "error");
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  async function verifyRecoveryCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busyRef.current) return;
    if (!validEmail(email)) { tell("Enter the email address used for your account.", "error"); return; }
    if (!isValidEmailOtp(otp)) { tell("Enter the complete recovery code from your email (6–10 digits).", "error"); return; }
    const client = getSupabaseBrowserClient();
    if (!client) { tell("Cloud password recovery is not configured in this preview.", "error"); return; }
    busyRef.current = true;
    setBusy(true);
    tell("");
    try {
      const { data, error } = await client.auth.verifyOtp(getRecoveryEmailOtpParams(email, otp));
      if (error) throw error;
      if (!data.session || !isEmailConfirmed(data.user)) throw new Error("Recovery did not create a confirmed session");
      setOtp("");
      setModeInUrl("update-password");
      setMode("update-password");
      setPassword("");
      setConfirmPassword("");
      tell("Recovery verified. Choose a new password to continue.", "success");
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
    if (busyRef.current || resendIn > 0) return;
    if (!validEmail(email)) { tell("Enter the email address used to create your account first.", "error"); return; }
    const client = getSupabaseBrowserClient();
    if (!client) { tell("Cloud verification is not configured in this preview.", "error"); return; }
    writePendingAuthValue(PENDING_EMAIL, email.trim(), localStorage, sessionStorage);
    busyRef.current = true;
    setBusy(true);
    tell("");
    try {
      const { error } = mode === "verify-recovery"
        ? await client.auth.resetPasswordForEmail(email.trim(), { redirectTo: callbackUrl("/auth?mode=update-password") })
        : await client.auth.resend({ email: email.trim(), type: "signup" });
      if (error) throw error;
      writePendingAuthValue(RESEND_SENT_AT, String(Date.now()), localStorage, sessionStorage);
      setResendIn(SIGNUP_RESEND_COOLDOWN_SECONDS);
      tell(mode === "verify-recovery" ? "If an account exists and delivery succeeds, recovery instructions will arrive by email. Check your inbox or spam folder." : "If this address can receive a message, a verification code has been requested. Check your inbox or spam folder.", "success");
    } catch (error) {
      writePendingAuthValue(RESEND_SENT_AT, String(Date.now()), localStorage, sessionStorage);
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
    "verify-recovery": "Enter your recovery code.",
    complete: "Your account is ready.",
    reset: "Reset your password.",
    "update-password": "Choose a new password.",
  };

  if (!restored) return <main className="auth-page"><section className="auth-panel" aria-busy="true" aria-live="polite"><div className="brand"><span className="brand-mark">F</span>FinMate AI</div><p className="auth-heading">Restoring your sign-in step…</p></section></main>;

  return <main className="auth-page">
    <section className="auth-panel" aria-labelledby="auth-title">
      <Link href="/" className="back-link"><ArrowLeft size={16}/> Back to home</Link>
      <div className="brand"><span className="brand-mark">F</span>FinMate AI</div>
      <div className="auth-heading"><span className="eyebrow">Private finance workspace</span><h1 id="auth-title">{titles[mode]}</h1><p>{mode === "verify" ? <>We requested a verification code for <strong>{email || "your email address"}</strong>. Enter the complete code to finish signing up and securely open your workspace.</> : mode === "verify-recovery" ? <>If an account exists for <strong>{email || "your email address"}</strong>, check for recovery instructions. Enter the emailed code here, or use the secure reset link.</> : mode === "complete" ? "Your email address is confirmed. Your account is ready to use." : hasSupabaseConfig ? "Your financial data is protected by your account." : "Cloud authentication needs Supabase configuration. Demo data is fictional and local."}</p></div>

      {mode === "complete" ? <div className="auth-form">
        <button className="button primary full" type="button" onClick={() => location.assign("/app")}>Go to dashboard</button>
        <button className="button secondary full" type="button" disabled={busy} onClick={() => void signOutToSignIn()}>{busy ? "Signing out…" : "Sign out and go to sign in"}</button>
      </div> : mode === "verify" || mode === "verify-recovery" ? <form className="auth-form" onSubmit={mode === "verify-recovery" ? verifyRecoveryCode : verifyCode}>
        <label>Email address<input autoComplete="email" required type="email" value={email} readOnly={Boolean(email)} onChange={(event) => { const nextEmail = event.target.value; setEmail(nextEmail); writeAuthDraft(AUTH_DRAFT, { mode, email: nextEmail, name, updatedAt: Date.now() }, localStorage, sessionStorage); if (validEmail(nextEmail)) { writePendingAuthValue(PENDING_EMAIL, nextEmail.trim(), localStorage, sessionStorage); writePendingAuthValue(PENDING_SINCE, String(Date.now()), localStorage, sessionStorage); } }} aria-describedby="verification-email-hint" placeholder="you@example.com" /></label>
        <span id="verification-email-hint" className="password-hint">{email ? "To use a different address, choose “Change email”." : "Enter the account email to continue; this works even if the app was reopened in another browser context."}</span>
        <label>{mode === "verify-recovery" ? "Recovery code" : "Verification code"}<input autoComplete="one-time-code" inputMode="numeric" pattern="[0-9]{6,10}" maxLength={10} minLength={6} required value={otp} onChange={(event) => setOtp(event.target.value.replace(/\D/g, "").slice(0, 10))} placeholder="Enter email code" aria-label={mode === "verify-recovery" ? "Email recovery code" : "Email verification code"} /></label>
        <p className="password-hint">Enter all digits exactly as shown in the email. Codes expire; request a new one if needed.</p>
        <button className="button primary full" disabled={busy || !isValidEmailOtp(otp)}>{busy ? "Verifying…" : mode === "verify-recovery" ? "Verify recovery code" : "Verify email"}</button>
        <div className="verify-actions"><button type="button" disabled={busy || resendIn > 0} onClick={() => void resendConfirmation()}>{resendIn ? "Resend code in " + resendIn + "s" : mode === "verify-recovery" ? "Resend recovery email" : "Resend verification code"}</button><button type="button" disabled={busy} onClick={() => { clearPendingAuthValue(PENDING_EMAIL, localStorage, sessionStorage); clearPendingAuthValue(PENDING_SINCE, localStorage, sessionStorage); clearPendingAuthValue(RESEND_SENT_AT, localStorage, sessionStorage); setEmail(""); setOtp(""); switchMode(mode === "verify-recovery" ? "reset" : "sign-up"); }}>Change email</button></div>
      </form> : <form className="auth-form" onSubmit={submit}>
        {mode === "sign-up" && <label>Full name <span className="optional-label">(optional)</span><input autoComplete="name" maxLength={80} value={name} onChange={(e) => { const nextName = e.target.value; setName(nextName); writeAuthDraft(AUTH_DRAFT, { mode, email, name: nextName, updatedAt: Date.now() }, localStorage, sessionStorage); }} placeholder="Your name" /></label>}
        {mode !== "update-password" && <label>Email address<input autoComplete="email" required type="email" value={email} onChange={(e) => { const nextEmail = e.target.value; setEmail(nextEmail); writeAuthDraft(AUTH_DRAFT, { mode, email: nextEmail, name, updatedAt: Date.now() }, localStorage, sessionStorage); }} placeholder="you@example.com" /></label>}
        {mode !== "reset" && <label>{mode === "update-password" ? "New password" : "Password"}<div className="password-wrap"><input autoComplete={mode === "sign-up" || mode === "update-password" ? "new-password" : "current-password"} minLength={8} required type={showPassword ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 8 characters"/><button type="button" aria-label={showPassword ? "Hide password" : "Show password"} onClick={() => setShowPassword(!showPassword)}>{showPassword ? <EyeOff size={17}/> : <Eye size={17}/>}</button></div>{(mode === "sign-up" || mode === "update-password") && <span className="password-hint">Use at least 8 characters; a unique passphrase is best.</span>}{mode === "sign-in" && <span className="password-hint">An emailed recovery code is not a password. Choose “Have a recovery code?” below to set a new password.</span>}</label>}
        {(mode === "sign-up" || mode === "update-password") && <label>Confirm password<input autoComplete="new-password" minLength={8} required type={showPassword ? "text" : "password"} value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="Enter it again" /></label>}
        <button className="button primary full" disabled={busy}>{busy ? <><span className="auth-spinner"/> Working…</> : mode === "sign-up" ? "Create account" : mode === "reset" ? "Send recovery code or link" : mode === "update-password" ? "Save new password" : "Sign in"}</button>
      </form>}

      {message && <p className={`form-message ${messageKind}`} role={messageKind === "error" ? "alert" : "status"}>{message}</p>}
      {mode !== "verify" && mode !== "verify-recovery" && mode !== "complete" && <div className="auth-switch">{mode === "sign-in" && <><button type="button" onClick={() => switchMode("reset")}>Forgot password?</button><span>·</span><button type="button" onClick={() => switchMode("sign-up")}>Create an account</button><button className="verify-entry" type="button" onClick={() => { switchMode("verify"); tell("Enter your email and request a verification code. We won't reveal account status.", "info"); }}>Need a verification code?</button><button className="verify-entry" type="button" onClick={() => { switchMode("verify-recovery"); tell("Enter the recovery code from your password-reset email here. It is NOT your sign-in password.", "info"); }}>Have a recovery code?</button></>}{mode === "sign-up" && <button type="button" onClick={() => switchMode("sign-in")}>Already have an account? Sign in</button>}{(mode === "reset" || mode === "update-password") && <button type="button" onClick={() => switchMode("sign-in")}>Back to sign in</button>}{mode === "reset" && <button className="verify-entry" type="button" onClick={() => { switchMode("verify-recovery"); tell("Enter the code from your password-reset email here, not in the sign-in password field.", "info"); }}>Already received a recovery code?</button>}</div>}
      {mode === "sign-in" && <div className="demo-box"><LockKeyhole size={18}/><div><strong>Just looking around?</strong><p>Explore fictional figures in a separate local demo—no real financial data or account sync.</p><Link className="button secondary" href="/app?demo=1">Open demo</Link></div></div>}
      <div className="auth-trust"><ShieldCheck size={15}/><span>Private by design · Your account data stays yours</span></div>
      <div className="auth-signup-note"><Mail size={14}/> Email verification and recovery codes accept 6–10 digits. Account verification is handled securely by your account provider.</div>
    </section>
  </main>;
}
