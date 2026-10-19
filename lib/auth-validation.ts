export type AuthFlow = "sign-in" | "sign-up" | "verify" | "resend" | "reset" | "update";

export type VerifiableUser = { email_confirmed_at?: string | null } | null | undefined;

export function isEmailConfirmed(user: VerifiableUser) {
  return Boolean(user?.email_confirmed_at);
}

export function normalizeOtp(value: string) {
  return value.replace(/\D/g, "").slice(0, 6);
}

export function getSafeAuthErrorMessage(error: unknown, flow: AuthFlow) {
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  if (/rate limit|too many requests|email rate|over_email_send_rate_limit/.test(message)) {
    return "For your security, wait a little before trying again.";
  }
  if (flow === "verify") return "That code is incorrect or expired. Check it and try again, or request a new code.";
  if (flow === "resend") return "We couldn't send another code right now. Wait a moment and try again.";
  if (flow === "sign-up" && /weak password|password should/.test(message)) {
    return "Choose a stronger password that meets the security requirements.";
  }
  if (flow === "reset") return "We couldn't start the password reset. Please try again shortly.";
  if (flow === "update") return "Your password couldn't be updated. Choose a stronger password and try again.";
  if (flow === "sign-up") return "We couldn't start the account. Check the details and try again.";
  return "We couldn't verify those sign-in details. Check your email and password, or reset your password.";
}
