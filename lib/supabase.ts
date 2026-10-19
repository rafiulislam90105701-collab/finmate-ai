"use client";
import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
// supabase-js 2.117 currently declares SupabaseAuthClient through its new
// base AuthClient type, which omits public GoTrue methods despite their runtime
// presence. Keep that compatibility cast isolated at the SDK boundary.
type AuthCompatibility = {
  getUser: () => Promise<{ data: { user: { id: string } | null }; error: unknown }>;
  getSession: () => Promise<{ data: { session: { user: { id: string } } | null }; error: unknown }>;
  onAuthStateChange: (callback: (event: string, session: { user: { id: string } } | null) => void) => { data: { subscription: { unsubscribe: () => void } } };
  signOut: () => Promise<{ error: unknown }>;
  signInWithPassword: (credentials: { email: string; password: string }) => Promise<{ error: Error | null }>;
  signUp: (credentials: { email: string; password: string; options?: { emailRedirectTo?: string } }) => Promise<{ error: Error | null }>;
  resetPasswordForEmail: (email: string, options?: { redirectTo?: string }) => Promise<{ error: Error | null }>;
  updateUser: (attributes: { password: string }) => Promise<{ error: Error | null }>;
};
export type FinMateSupabaseClient = SupabaseClient & { auth: AuthCompatibility };
let browserClient: FinMateSupabaseClient | null = null;

export const hasSupabaseConfig = Boolean(url && anonKey && !url.includes("your-project"));
export function getSupabaseBrowserClient() {
  if (!hasSupabaseConfig || !url || !anonKey) return null;
  browserClient ??= createBrowserClient(url, anonKey) as unknown as FinMateSupabaseClient;
  return browserClient;
}
