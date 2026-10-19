"use client";
import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
// supabase-js 2.117 currently declares SupabaseAuthClient through its new
// base AuthClient type, which omits public GoTrue methods despite their runtime
// presence. Keep that compatibility cast isolated at the SDK boundary.
type AuthCompatibility = {
  getUser: () => Promise<{ data: { user: AuthUser | null }; error: unknown }>;
  getSession: () => Promise<{ data: { session: { user: AuthUser } | null }; error: unknown }>;
  onAuthStateChange: (callback: (event: string, session: { user: AuthUser } | null) => void) => { data: { subscription: { unsubscribe: () => void } } };
  signOut: (options?: { scope?: "global" | "local" | "others" }) => Promise<{ error: Error | null }>;
  signInWithPassword: (credentials: { email: string; password: string }) => Promise<{ data: { user: AuthUser | null; session: { user: AuthUser } | null }; error: AuthError | null }>;
  signUp: (credentials: { email: string; password: string; options?: { emailRedirectTo?: string; data?: Record<string, unknown> } }) => Promise<{ data: { user: AuthUser | null; session: { user: AuthUser } | null }; error: AuthError | null }>;
  verifyOtp: (credentials: { email: string; token: string; type: "signup" | "email" | "recovery" }) => Promise<{ data: { user: AuthUser | null; session: { user: AuthUser } | null }; error: AuthError | null }>;
  resend: (credentials: { email: string; type: "signup"; options?: { emailRedirectTo?: string } }) => Promise<{ error: AuthError | null }>;
  resetPasswordForEmail: (email: string, options?: { redirectTo?: string }) => Promise<{ error: Error | null }>;
  updateUser: (attributes: { password: string }) => Promise<{ error: Error | null }>;
};
type AuthUser = { id: string; email?: string; email_confirmed_at?: string | null; identities?: unknown[] | null; user_metadata?: Record<string, unknown> };
type AuthError = Error & { code?: string; status?: number };
export type FinMateSupabaseClient = SupabaseClient & { auth: AuthCompatibility };
let browserClient: FinMateSupabaseClient | null = null;

export const hasSupabaseConfig = Boolean(url && anonKey && !url.includes("your-project"));
export function getSupabaseBrowserClient() {
  if (!hasSupabaseConfig || !url || !anonKey) return null;
  browserClient ??= createBrowserClient(url, anonKey) as unknown as FinMateSupabaseClient;
  return browserClient;
}
