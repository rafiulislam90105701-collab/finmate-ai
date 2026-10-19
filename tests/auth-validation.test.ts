import { describe, expect, it } from "vitest";
import { getSafeAuthErrorMessage, getSignupNextStep, isEmailConfirmed, isValidEmailOtp } from "@/lib/auth-validation";

describe("authentication validation", () => {
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
      .toContain("invalid or expired");
    expect(getSafeAuthErrorMessage(new Error("over_email_send_rate_limit"), "resend"))
      .toContain("wait a little");
  });
});
