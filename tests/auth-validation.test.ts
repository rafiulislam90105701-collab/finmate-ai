import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { clearPendingAuthValue, getInitialAuthMode, getSafeAuthErrorMessage, getSignupEmailOtpParams, isEmailConfirmed, isSignupEmailConfirmationDisabled, isValidEmailOtp, readPendingAuthValue, remainingResendSeconds, writePendingAuthValue } from "@/lib/auth-validation";

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
});
