import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { authModeQueryValue, clearPendingAuthValue, getInitialAuthMode, getRecoveryEmailOtpParams, getSafeAuthErrorMessage, getSignupEmailOtpParams, isEmailConfirmed, isSignupEmailConfirmationDisabled, isValidEmailOtp, persistVerificationDraft, readAuthDraft, readPendingAuthValue, remainingResendSeconds, shouldResumeVerificationAtRoot, writeAuthDraft, writePendingAuthValue } from "@/lib/auth-validation";

function memoryStorage(seed: Record<string, string> = {}) {
  const values = new Map(Object.entries(seed));
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); },
  };
}

describe("authentication validation", () => {
  it("resumes pending signup verification after the browser reloads", () => {
    expect(getInitialAuthMode("sign-in", true)).toBe("sign-in");
    expect(getInitialAuthMode("sign-up", true)).toBe("verify");
    expect(getInitialAuthMode("sign-up", false, "verify")).toBe("verify");
    expect(getInitialAuthMode("sign-up", false)).toBe("sign-up");
    expect(getInitialAuthMode(null, true)).toBe("verify");
    expect(getInitialAuthMode("verify-email", false)).toBe("verify");
    expect(getInitialAuthMode("reset", true)).toBe("reset");
  });

  it("restores pending verification from persistent storage in a fresh tab", () => {
    const persistent = memoryStorage();
    const oldTab = memoryStorage();
    writePendingAuthValue("pending-email", "person@example.com", persistent, oldTab);
    const freshTab = memoryStorage();
    const savedEmail = readPendingAuthValue("pending-email", persistent, freshTab);
    expect(savedEmail).toBe("person@example.com");
    expect(getInitialAuthMode("verify-email", Boolean(savedEmail))).toBe("verify");
  });

  it("keeps the verification recovery route available when pending email storage is empty", () => {
    const persistent = memoryStorage();
    const freshTab = memoryStorage();
    const savedEmail = readPendingAuthValue("pending-email", persistent, freshTab);
    expect(savedEmail).toBeNull();
    expect(getInitialAuthMode("verify-email", Boolean(savedEmail))).toBe("verify");
  });

  it("restores a non-secret signup draft after an app background/reload", () => {
    const persistent = memoryStorage();
    const oldTab = memoryStorage();
    writeAuthDraft("auth-draft", { mode: "sign-up", email: "person@example.com", name: "Fin User", updatedAt: 1000 }, persistent, oldTab);
    const relaunchedTab = memoryStorage();
    const draft = readAuthDraft("auth-draft", persistent, relaunchedTab, 2000);
    expect(draft).toEqual({ mode: "sign-up", email: "person@example.com", name: "Fin User", updatedAt: 1000 });
    expect(getInitialAuthMode("sign-up", false, draft?.mode)).toBe("sign-up");
    expect(getInitialAuthMode(null, false, draft?.mode)).toBe("sign-up");
  });

  it("persists verification state synchronously before UI navigation and restores it in a fresh page", () => {
    const persistent = memoryStorage();
    const oldTab = memoryStorage();
    persistVerificationDraft({ pendingEmail: "pending-email", pendingSince: "pending-since", resendSentAt: "sent-at", draft: "auth-draft" }, " person@example.com ", "Fin User", 2000, persistent, oldTab);

    expect(persistent.getItem("pending-email")).toBe("person@example.com");
    expect(persistent.getItem("pending-since")).toBe("2000");
    expect(persistent.getItem("sent-at")).toBe("2000");
    expect(JSON.parse(persistent.getItem("auth-draft")!)).toEqual({ mode: "verify", email: "person@example.com", name: "Fin User", updatedAt: 2000 });

    const relaunchedTab = memoryStorage();
    const draft = readAuthDraft("auth-draft", persistent, relaunchedTab, 3000);
    const pendingEmail = readPendingAuthValue("pending-email", persistent, relaunchedTab);
    expect(getInitialAuthMode("sign-up", Boolean(pendingEmail), draft?.mode)).toBe("verify");
    expect(pendingEmail).toBe("person@example.com");
  });

  it("resumes a PWA root launch only when pending verification metadata is valid", () => {
    const draft = { mode: "verify" as const, email: "person@example.com", name: "", updatedAt: 2000 };
    expect(shouldResumeVerificationAtRoot(draft, null)).toBe(true);
    expect(shouldResumeVerificationAtRoot(null, "person@example.com")).toBe(true);
    expect(shouldResumeVerificationAtRoot({ ...draft, mode: "sign-up" }, null)).toBe(false);
    expect(shouldResumeVerificationAtRoot(null, null)).toBe(false);
  });

  it("lets explicit change-email navigation replace the verification draft", () => {
    const persistent = memoryStorage();
    const tab = memoryStorage();
    persistVerificationDraft({ pendingEmail: "pending-email", pendingSince: "pending-since", resendSentAt: "sent-at", draft: "auth-draft" }, "person@example.com", "", 2000, persistent, tab);
    clearPendingAuthValue("pending-email", persistent, tab);
    clearPendingAuthValue("pending-since", persistent, tab);
    clearPendingAuthValue("sent-at", persistent, tab);
    writeAuthDraft("auth-draft", { mode: "sign-up", email: "", name: "", updatedAt: 3000 }, persistent, tab);
    const draft = readAuthDraft("auth-draft", persistent, tab, 3000);
    expect(getInitialAuthMode("sign-up", false, draft?.mode)).toBe("sign-up");
  });

  it("resumes verification with a blank email when app storage is unavailable", () => {
    expect(getInitialAuthMode("verify-email", false)).toBe("verify");
  });

  it("uses stable URL modes and preserves explicit navigation over an older draft", () => {
    expect(authModeQueryValue("verify")).toBe("verify-email");
    expect(authModeQueryValue("reset")).toBe("forgot-password");
    expect(getInitialAuthMode("sign-in", true, "sign-up")).toBe("sign-in");
    expect(getInitialAuthMode("forgot-password", false, "sign-up")).toBe("reset");
  });

  it("expires auth drafts and serializes only non-secret fields", () => {
    const persistent = memoryStorage();
    const sameTab = memoryStorage();
    writeAuthDraft("auth-draft", { mode: "sign-in", email: "person@example.com", name: "Fin User", updatedAt: 1000, password: "never-store", otp: "12345678" } as never, persistent, sameTab);
    expect(persistent.getItem("auth-draft")).not.toContain("never-store");
    expect(persistent.getItem("auth-draft")).not.toContain("12345678");
    expect(readAuthDraft("auth-draft", persistent, sameTab, 1000 + 24 * 60 * 60 * 1000 + 1)).toBeNull();
  });

  it("migrates legacy session metadata and clears both storage scopes", () => {
    const persistent = memoryStorage();
    const legacy = memoryStorage({ "pending-email": "person@example.com" });
    expect(readPendingAuthValue("pending-email", persistent, legacy)).toBe("person@example.com");
    expect(persistent.getItem("pending-email")).toBe("person@example.com");
    clearPendingAuthValue("pending-email", persistent, legacy);
    expect(persistent.getItem("pending-email")).toBeNull();
    expect(legacy.getItem("pending-email")).toBeNull();
  });

  it("uses only the server-provided confirmation timestamp", () => {
    expect(isEmailConfirmed({ email_confirmed_at: "2026-10-19T00:00:00Z" })).toBe(true);
    expect(isEmailConfirmed({ email_confirmed_at: null })).toBe(false);
    expect(isEmailConfirmed({})).toBe(false);
    expect(isEmailConfirmed(null)).toBe(false);
  });

  it("fails closed if signup returns a session before the requested email verification", () => {
    expect(isSignupEmailConfirmationDisabled(false, { email_confirmed_at: null })).toBe(false);
    expect(isSignupEmailConfirmationDisabled(true, { email_confirmed_at: null })).toBe(true);
    expect(isSignupEmailConfirmationDisabled(false, { email_confirmed_at: "2026-10-19T00:00:00Z" })).toBe(true);
  });

  it("does not expose provider errors or account existence through reset feedback", () => {
    expect(getSafeAuthErrorMessage(new Error("User not found: private@example.com"), "reset"))
      .not.toContain("private@example.com");
    expect(getSafeAuthErrorMessage(new Error("User not found"), "reset"))
      .toBe("We couldn't start the password reset. Please try again shortly.");
  });

  it("keeps wrong-password sign-in feedback generic", () => {
    expect(getSafeAuthErrorMessage(new Error("Invalid login credentials for private@example.com"), "sign-in"))
      .toBe("We couldn't verify those sign-in details. Check your email and password, or reset your password.");
  });

  it("accepts configured Supabase email OTP lengths and gives safe feedback", () => {
    expect(isValidEmailOtp("123456")).toBe(true);
    expect(isValidEmailOtp("12345678")).toBe(true);
    expect(isValidEmailOtp("1234567890")).toBe(true);
    expect(isValidEmailOtp("12345")).toBe(false);
    expect(isValidEmailOtp("12345678901")).toBe(false);
    expect(isValidEmailOtp("12345x")).toBe(false);
    expect(getSafeAuthErrorMessage(new Error("token expired"), "verify"))
      .toContain("code is invalid or expired");
    expect(getSafeAuthErrorMessage(new Error("over_email_send_rate_limit"), "resend"))
      .toContain("at least a minute");
  });

  it("uses Supabase's email verification type for six-digit signup OTPs", () => {
    expect(getSignupEmailOtpParams("  person@example.com  ", "123456"))
      .toEqual({ email: "person@example.com", token: "123456", type: "email" });
  });

  it("verifies password-recovery codes with Supabase's recovery OTP type", () => {
    expect(getRecoveryEmailOtpParams(" person@example.com ", "12345678"))
      .toEqual({ email: "person@example.com", token: "12345678", type: "recovery" });
  });

  it("keeps a code-based recovery template and server callback aligned", () => {
    const template = readFileSync(new URL("../supabase/templates/recovery.html", import.meta.url), "utf8");
    const callback = readFileSync(new URL("../app/auth/callback/route.ts", import.meta.url), "utf8");
    expect(template).toContain("{{ .Token }}");
    expect(template).toContain("{{ .ConfirmationURL }}");
    expect(callback).toContain('"recovery"');
    expect(callback).toContain("token_hash");
  });

  it("keeps auth navigation pages network-only so the service worker cannot replay stale forms", () => {
    const serviceWorker = readFileSync(new URL("../public/sw.js", import.meta.url), "utf8");
    expect(serviceWorker).toContain('request.mode === "navigate"');
    expect(serviceWorker).toContain("fetch(request).catch(() => caches.match(\"/offline\"))");
    expect(serviceWorker).not.toMatch(/caches\.match\(request\).*navigate/);
    expect(serviceWorker).toContain('const CACHE = "finmate-shell-v3"');
    expect(serviceWorker).toContain("self.skipWaiting()");
    expect(serviceWorker).toContain("caches.open(CACHE).then((cache) => cache.match(request)");
    const registration = readFileSync(new URL("../components/service-worker-register.tsx", import.meta.url), "utf8");
    expect(registration).toContain('{ updateViaCache: "none" }');
    expect(registration).toContain("registration.update()");
  });

  it("keeps the local signup confirmation template on the six-digit token path", () => {
    const template = readFileSync(new URL("../supabase/templates/confirmation.html", import.meta.url), "utf8");
    expect(template).toContain("{{ .Token }}");
    expect(template).not.toContain("{{ .ConfirmationURL }}");
  });

  it("explains rate limits, provider rejection and network failures without exposing raw errors", () => {
    const limited = Object.assign(new Error("request throttled"), { code: "over_request_rate_limit" });
    expect(getSafeAuthErrorMessage(limited, "sign-up")).toContain("rate limited");
    expect(getSafeAuthErrorMessage(new Error("email_address_not_authorized"), "resend"))
      .toContain("verify the email provider and sender settings");
    expect(getSafeAuthErrorMessage(new TypeError("Failed to fetch"), "sign-up"))
      .toContain("network problem");
  });

  it("does not reveal whether a signup email is already registered", () => {
    expect(getSafeAuthErrorMessage(new Error("user_already_exists: private@example.com"), "sign-up"))
      .toContain("If you may already have an account");
    expect(getSafeAuthErrorMessage(new Error("user_already_exists: private@example.com"), "sign-up"))
      .not.toContain("private@example.com");
  });

  it("keeps resend cooldown across refresh without going negative", () => {
    expect(remainingResendSeconds(100_000, 100_001, 60)).toBe(60);
    expect(remainingResendSeconds(100_000, 159_500, 60)).toBe(1);
    expect(remainingResendSeconds(100_000, 160_000, 60)).toBe(0);
    expect(remainingResendSeconds(null, 160_000, 60)).toBe(0);
  });
  it("resumes the recovery form rather than sign-in after Gmail backgrounding", () => {
    expect(getInitialAuthMode("verify-recovery", false, "sign-in")).toBe("verify-recovery");
    expect(getInitialAuthMode("verify-recovery", true, "verify")).toBe("verify-recovery");
    expect(getInitialAuthMode("forgot-password", false, "sign-in")).toBe("reset");
    expect(authModeQueryValue("verify-recovery")).toBe("verify-recovery");
  });

});
