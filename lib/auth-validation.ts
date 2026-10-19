export type AuthFlow = "sign-in" | "sign-up" | "verify" | "resend" | "reset" | "update";

export const SIGNUP_RESEND_COOLDOWN_SECONDS = 60;

export type InitialAuthMode = "sign-in" | "sign-up" | "verify" | "reset" | "update-password";

export function getInitialAuthMode(requestedMode: string | null, hasPendingVerification: boolean): InitialAuthMode {
  if (requestedMode === "sign-in" || requestedMode === "sign-up" || requestedMode === "reset" || requestedMode === "update-password") return requestedMode;
  if (requestedMode === "verify-email") return "verify";
  return hasPendingVerification ? "verify" : "sign-in";
}

export function isValidEmailOtp(value: string) {
  return /^\d{6}$/.test(value);
}

export function remainingResendSeconds(lastSentAt: number | null, now = Date.now(), cooldownSeconds = SIGNUP_RESEND_COOLDOWN_SECONDS) {
  if (lastSentAt === null || !Number.isFinite(lastSentAt)) return 0;
  return Math.max(0, Math.ceil((lastSentAt + cooldownSeconds * 1000 - now) / 1000));
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
  if (flow === "verify") return "That six-digit code is invalid or expired. Request a new code and try again.";
  if (flow === "resend") return "We couldn't request another verification code right now. Wait a moment and try again.";
  if (flow === "sign-up" && /weak password|password should/.test(message)) {
    return "Choose a stronger password that meets the security requirements.";
  }
  if (flow === "sign-in" && /email not confirmed|email_not_confirmed/.test(message)) return "Please verify your email with the six-digit code we sent. You can request another code if needed.";
  if (flow === "reset") return "We couldn't start the password reset. Please try again shortly.";
  if (flow === "update") return "Your password couldn't be updated. Choose a stronger password and try again.";
  if (flow === "sign-up") return "We couldn't start the account. Check the details and try again.";
  return "We couldn't verify those sign-in details. Check your email and password, or reset your password.";
}
