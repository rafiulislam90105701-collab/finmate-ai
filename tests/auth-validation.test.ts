import { describe, expect, it } from "vitest";
import { getSafeAuthErrorMessage, isEmailConfirmed, normalizeOtp } from "@/lib/auth-validation";

describe("authentication validation", () => {
  it("normalizes numeric one-time codes and limits them to six digits", () => {
    expect(normalizeOtp("12 a-34 567890")).toBe("123456");
    expect(normalizeOtp("abc")).toBe("");
  });

  it("uses only the server-provided confirmation timestamp", () => {
    expect(isEmailConfirmed({ email_confirmed_at: "2026-10-19T00:00:00Z" })).toBe(true);
    expect(isEmailConfirmed({ email_confirmed_at: null })).toBe(false);
    expect(isEmailConfirmed({})).toBe(false);
    expect(isEmailConfirmed(null)).toBe(false);
  });

  it("does not expose provider errors or account existence through reset feedback", () => {
    expect(getSafeAuthErrorMessage(new Error("User not found: private@example.com"), "reset"))
      .not.toContain("private@example.com");
    expect(getSafeAuthErrorMessage(new Error("User not found"), "reset"))
      .toBe("We couldn't start the password reset. Please try again shortly.");
  });

  it("gives verification-safe feedback for invalid codes and rate limits", () => {
    expect(getSafeAuthErrorMessage(new Error("token expired"), "verify"))
      .toContain("incorrect or expired");
    expect(getSafeAuthErrorMessage(new Error("over_email_send_rate_limit"), "resend"))
      .toContain("wait a little");
  });
});
