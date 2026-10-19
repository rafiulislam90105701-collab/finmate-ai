import { describe, expect, it } from "vitest";
import { getInitialAuthMode, getSafeAuthErrorMessage, getSignupNextStep, isEmailConfirmed, isValidEmailOtp, remainingResendSeconds } from "@/lib/auth-validation";

describe("authentication validation", () => {
  it("gives explicit sign-in and signup navigation priority over stale verification state", () => {
    expect(getInitialAuthMode("sign-in", true)).toBe("sign-in");
    expect(getInitialAuthMode("sign-up", true)).toBe("sign-up");
    expect(getInitialAuthMode(null, true)).toBe("verify");
    expect(getInitialAuthMode("verify-email", false)).toBe("verify");
    expect(getInitialAuthMode("reset", true)).toBe("reset");
  });

  it("uses only the server-provided confirmation timestamp", () => {
    expect(isEmailConfirmed({ email_confirmed_at: "2026-10-19T00:00:00Z" })).toBe(true);
    expect(isEmailConfirmed({ email_confirmed_at: null })).toBe(false);
    expect(isEmailConfirmed({})).toBe(false);
    expect(isEmailConfirmed(null)).toBe(false);
  });

  it("routes confirmed sessions to the workspace and pending signups to email confirmation", () => {
    const confirmed = { email_confirmed_at: "2026-10-19T00:00:00Z" };
    expect(getSignupNextStep(true, confirmed)).toBe("workspace");
    expect(getSignupNextStep(false, confirmed)).toBe("confirm-email");
    expect(getSignupNextStep(true, { email_confirmed_at: null })).toBe("confirm-email");
  });

  it("does not expose provider errors or account existence through reset feedback", () => {
    expect(getSafeAuthErrorMessage(new Error("User not found: private@example.com"), "reset"))
      .not.toContain("private@example.com");
    expect(getSafeAuthErrorMessage(new Error("User not found"), "reset"))
      .toBe("We couldn't start the password reset. Please try again shortly.");
  });

  it("validates six-digit email codes and gives safe feedback for invalid codes and rate limits", () => {
    expect(isValidEmailOtp("123456")).toBe(true);
    expect(isValidEmailOtp("12345")).toBe(false);
    expect(isValidEmailOtp("12345x")).toBe(false);
    expect(getSafeAuthErrorMessage(new Error("token expired"), "verify"))
      .toContain("code is invalid or expired");
    expect(getSafeAuthErrorMessage(new Error("over_email_send_rate_limit"), "resend"))
      .toContain("wait a little");
  });

  it("keeps resend cooldown across refresh without going negative", () => {
    expect(remainingResendSeconds(100_000, 100_001, 60)).toBe(60);
    expect(remainingResendSeconds(100_000, 159_500, 60)).toBe(1);
    expect(remainingResendSeconds(100_000, 160_000, 60)).toBe(0);
    expect(remainingResendSeconds(null, 160_000, 60)).toBe(0);
  });
});
