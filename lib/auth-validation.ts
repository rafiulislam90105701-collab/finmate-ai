export type AuthFlow = "sign-in" | "sign-up" | "verify" | "resend" | "reset" | "update";

export function isValidEmailOtp(value: string) {
  return /^\d{6}$/.test(value);
}

export type VerifiableUser = { email_confirmed_at?: string | null } | null | undefined;

export function isEmailConfirmed(user: VerifiableUser) {
  return Boolean(user?.email_confirmed_at);
}

export function getSignupNextStep(sessionAvailable: boolean, user: VerifiableUser): "workspace" | "confirm-email" {
  return sessionAvailable && isEmailConfirmed(user) ? "workspace" : "confirm-email";
}

export function getSafeAuthErrorMessage(error: unknown, flow: AuthFlow) {
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  if (/rate limit|too many requests|email rate|over_email_send_rate_limit/.test(message)) {
    return "For your security, wait a little before trying again.";
  }
  if (flow === "verify") return "That code is invalid or expired. Request a new code and try again.";
  if (flow === "resend") return "We couldn't request another verification code right now. Wait a moment and try again.";
  if (flow === "sign-up" && /weak password|password should/.test(message)) {
    return "Choose a stronger password that meets the security requirements.";
  }
  if (flow === "sign-in" && /email not confirmed|email_not_confirmed/.test(message)) return "Please verify your email with the six-digit code. You can request another code if needed.";
  if (flow === "reset") return "We couldn't start the password reset. Please try again shortly.";
  if (flow === "update") return "Your password couldn't be updated. Choose a stronger password and try again.";
  if (flow === "sign-up") return "We couldn't start the account. Check the details and try again.";
  return "We couldn't verify those sign-in details. Check your email and password, or reset your password.";
}
