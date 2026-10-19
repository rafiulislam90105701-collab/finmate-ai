export type AuthFlow = "sign-in" | "sign-up" | "verify" | "resend" | "reset" | "update";

export const SIGNUP_RESEND_COOLDOWN_SECONDS = 60;
export const AUTH_DRAFT_MAX_AGE_MS = 24 * 60 * 60 * 1000;

export type ResumableAuthMode = "sign-in" | "sign-up" | "verify" | "verify-recovery" | "reset" | "update-password";
export type AuthDraft = {
  mode: ResumableAuthMode;
  email: string;
  name: string;
  updatedAt: number;
};

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

/** Persist non-secret verification metadata across tab replacement and reloads. */
export function readPendingAuthValue(key: string, persistent: StorageLike, legacy: StorageLike) {
  let value: string | null = null;
  try { value = persistent.getItem(key); } catch { /* Continue with legacy storage. */ }
  if (value !== null) return value;
  try { value = legacy.getItem(key); } catch { return null; }
  if (value !== null) {
    try { persistent.setItem(key, value); } catch { /* Keep the current tab working. */ }
  }
  return value;
}

export function writePendingAuthValue(key: string, value: string, persistent: StorageLike, fallback: StorageLike) {
  let stored = false;
  try { persistent.setItem(key, value); stored = true; } catch { /* Fall back to tab storage. */ }
  try { fallback.setItem(key, value); stored = true; } catch { /* Best effort when storage is restricted. */ }
  return stored;
}

export function clearPendingAuthValue(key: string, persistent: StorageLike, legacy: StorageLike) {
  try { persistent.removeItem(key); } catch { /* Continue clearing legacy storage. */ }
  try { legacy.removeItem(key); } catch { /* Storage may be disabled by the browser. */ }
}

export type InitialAuthMode = "sign-in" | "sign-up" | "verify" | "verify-recovery" | "reset" | "update-password";

export function normalizeAuthMode(value: string | null): ResumableAuthMode | null {
  if (value === "verify-email") return "verify";
  if (value === "verify-recovery") return "verify-recovery";
  if (value === "forgot-password") return "reset";
  if (value === "sign-in" || value === "sign-up" || value === "verify" || value === "reset" || value === "update-password") return value;
  return null;
}

export function authModeQueryValue(mode: ResumableAuthMode | "complete") {
  if (mode === "verify") return "verify-email";
  if (mode === "reset") return "forgot-password";
  return mode === "complete" ? "sign-in" : mode;
}

export function getInitialAuthMode(requestedMode: string | null, hasPendingVerification: boolean, savedMode?: ResumableAuthMode | null): InitialAuthMode {
  if (requestedMode === "sign-in" || requestedMode === "reset" || requestedMode === "update-password") return requestedMode;
  if (requestedMode === "forgot-password") return "reset";
  if (requestedMode === "verify-email") return "verify";
  if (requestedMode === "verify-recovery") return "verify-recovery";
  if (requestedMode === "verify") return "verify";
  if (requestedMode === "sign-up" && hasPendingVerification) return "verify";
  if (requestedMode === "sign-up") return "sign-up";
  if (savedMode) return savedMode;
  return hasPendingVerification ? "verify" : "sign-in";
}

function isResumableMode(value: unknown): value is ResumableAuthMode {
  return value === "sign-in" || value === "sign-up" || value === "verify" || value === "verify-recovery" || value === "reset" || value === "update-password";
}

/** Read only resumable, non-secret auth metadata. Drafts expire after 24 hours. */
export function readAuthDraft(key: string, persistent: StorageLike, fallback: StorageLike, now = Date.now()): AuthDraft | null {
  let raw: string | null = null;
  try { raw = persistent.getItem(key); } catch { /* Use same-tab storage when durable storage is unavailable. */ }
  if (raw === null) {
    try { raw = fallback.getItem(key); } catch { return null; }
  }
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Record<string, unknown>;
    if (!isResumableMode(value.mode) || typeof value.updatedAt !== "number" || !Number.isFinite(value.updatedAt)) return null;
    if (value.updatedAt > now || now - value.updatedAt > AUTH_DRAFT_MAX_AGE_MS) {
      clearPendingAuthValue(key, persistent, fallback);
      return null;
    }
    const draft: AuthDraft = {
      mode: value.mode,
      email: typeof value.email === "string" && value.email.length <= 320 ? value.email : "",
      name: typeof value.name === "string" && value.name.length <= 80 ? value.name : "",
      updatedAt: value.updatedAt,
    };
    return draft;
  } catch {
    clearPendingAuthValue(key, persistent, fallback);
    return null;
  }
}

/** Store only mode/email/name/timestamp; never pass password or OTP values here. */
export function writeAuthDraft(key: string, draft: AuthDraft, persistent: StorageLike, fallback: StorageLike) {
  const safeDraft: AuthDraft = {
    mode: draft.mode,
    email: draft.email.trim().slice(0, 320),
    name: draft.name.trim().slice(0, 80),
    updatedAt: draft.updatedAt,
  };
  const raw = JSON.stringify(safeDraft);
  return writePendingAuthValue(key, raw, persistent, fallback);
}

export function isValidEmailOtp(value: string) {
  return /^\d{6,10}$/.test(value);
}

export function getSignupEmailOtpParams(email: string, token: string) {
  return { email: email.trim(), token, type: "email" } as const;
}

export function getRecoveryEmailOtpParams(email: string, token: string) {
  return { email: email.trim(), token, type: "recovery" } as const;
}

export function remainingResendSeconds(lastSentAt: number | null, now = Date.now(), cooldownSeconds = SIGNUP_RESEND_COOLDOWN_SECONDS) {
  if (lastSentAt === null || !Number.isFinite(lastSentAt)) return 0;
  return Math.max(0, Math.ceil((lastSentAt + cooldownSeconds * 1000 - now) / 1000));
}

export type VerifiableUser = { email_confirmed_at?: string | null } | null | undefined;

export function isEmailConfirmed(user: VerifiableUser) {
  return Boolean(user?.email_confirmed_at);
}

export function isSignupEmailConfirmationDisabled(sessionAvailable: boolean, user: VerifiableUser) {
  return sessionAvailable || isEmailConfirmed(user);
}

export function getSafeAuthErrorMessage(error: unknown, flow: AuthFlow) {
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  const code = typeof error === "object" && error !== null && "code" in error
    ? String((error as { code?: unknown }).code ?? "").toLowerCase()
    : "";
  const providerError = `${code} ${message}`;
  if (/over_email_send_rate_limit|over_request_rate_limit|over_email_rate_limit|too_many_requests/.test(providerError) || /rate limit|too many requests|email rate/.test(message)) {
    return "Email requests are temporarily rate limited. Wait at least a minute before trying again. If this keeps happening, the project owner should review the Supabase email provider limits.";
  }
  if (/email_address_not_authorized/.test(providerError)) {
    return "The project email provider did not accept this address. Please try again later; the project owner may need to verify the email provider and sender settings.";
  }
  if (/network|fetch failed|failed to fetch|load failed/.test(message)) {
    return "A network problem interrupted this request. Check your connection and try again.";
  }
  if (flow === "verify") return "That verification code is invalid or expired. Request a new code and try again.";
  if (flow === "resend") return "We couldn't request another verification code right now. Wait a moment and try again.";
  if (flow === "sign-up" && /weak password|password should/.test(message)) {
    return "Choose a stronger password that meets the security requirements.";
  }
  if (flow === "sign-in" && /email not confirmed|email_not_confirmed/.test(message)) return "Please verify your email with the code we sent. You can request another code if needed.";
  if (flow === "reset") return "We couldn't start the password reset. Please try again shortly.";
  if (flow === "update") return "Your password couldn't be updated. Choose a stronger password and try again.";
  if (flow === "sign-up") return "We couldn't complete signup. If you may already have an account, sign in or use Forgot password; otherwise check your details and try again.";
  return "We couldn't verify those sign-in details. Check your email and password, or reset your password.";
}
