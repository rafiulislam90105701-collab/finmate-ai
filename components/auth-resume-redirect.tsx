"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AUTH_DRAFT_MAX_AGE_MS, readAuthDraft, readPendingAuthValue, shouldResumeVerificationAtRoot } from "@/lib/auth-validation";

const AUTH_DRAFT = "finmate.auth-draft.v1";
const PENDING_EMAIL = "finmate.pending-verification-email";
const PENDING_SINCE = "finmate.pending-verification-since";

const persistentStorage = {
  getItem: (key: string) => { try { return window.localStorage.getItem(key); } catch { return null; } },
  setItem: (key: string, value: string) => { try { window.localStorage.setItem(key, value); } catch { /* Root stays available if storage is restricted. */ } },
  removeItem: (key: string) => { try { window.localStorage.removeItem(key); } catch { /* Best effort. */ } },
};
const tabStorage = {
  getItem: (key: string) => { try { return window.sessionStorage.getItem(key); } catch { return null; } },
  setItem: (key: string, value: string) => { try { window.sessionStorage.setItem(key, value); } catch { /* Best effort. */ } },
  removeItem: (key: string) => { try { window.sessionStorage.removeItem(key); } catch { /* Best effort. */ } },
};

/** Resume pending signup verification when an installed PWA is launched at /. */
export function AuthResumeRedirect() {
  const [storageUnavailable, setStorageUnavailable] = useState(false);
  const [canResume, setCanResume] = useState(false);

  useEffect(() => {
    try {
      window.localStorage.setItem("finmate.storage-check", "1");
      window.localStorage.removeItem("finmate.storage-check");
    } catch {
      setStorageUnavailable(true);
    }
    const draft = readAuthDraft(AUTH_DRAFT, persistentStorage, tabStorage);
    const pendingEmail = readPendingAuthValue(PENDING_EMAIL, persistentStorage, tabStorage);
    const pendingSince = Number(readPendingAuthValue(PENDING_SINCE, persistentStorage, tabStorage));
    const pendingIsFresh = Boolean(pendingEmail && pendingSince > 0 && Date.now() - pendingSince <= AUTH_DRAFT_MAX_AGE_MS);
    // Do not hijack the landing page or the sign-in path. A saved
    // verification draft is only an offer to resume, not a navigation command.
    setCanResume(shouldResumeVerificationAtRoot(draft, pendingIsFresh ? pendingEmail : null));
  }, []);

  if (!canResume && !storageUnavailable) return null;
  return <div role="status" className="auth-resume-link">
    {canResume ? "You have an unfinished signup. " : "Already waiting for an email code? "}
    <Link href="/auth?mode=verify-email">Resume verification</Link>
    {" · "}
    <Link href="/auth?mode=sign-in">Sign in instead</Link>
  </div>;
}
