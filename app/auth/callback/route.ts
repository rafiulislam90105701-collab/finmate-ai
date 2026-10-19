import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";

const callbackTargets = new Set(["/app", "/auth?mode=update-password"]);
const allowedOtpTypes = new Set(["signup", "email", "recovery", "invite", "magiclink", "email_change"]);

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const tokenHash = request.nextUrl.searchParams.get("token_hash");
  const rawType = request.nextUrl.searchParams.get("type");
  const otpType = rawType && allowedOtpTypes.has(rawType) ? rawType as
    "signup" | "email" | "recovery" | "invite" | "magiclink" | "email_change" : null;
  const requestedNext = request.nextUrl.searchParams.get("next") ?? "/app";
  const next = callbackTargets.has(requestedNext) ? requestedNext : "/app";
  const target = new URL(next, request.url);
  let response = NextResponse.redirect(target);

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if ((!code && !(tokenHash && otpType)) || !url || !key || url.includes("your-project")) {
    const errorTarget = new URL("/auth?error=callback", request.url);
    return NextResponse.redirect(errorTarget);
  }

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (cookies: { name: string; value: string; options: CookieOptions }[]) => {
        cookies.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.redirect(target);
        cookies.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  const { error } = code
    ? await supabase.auth.exchangeCodeForSession(code)
    : await supabase.auth.verifyOtp({ token_hash: tokenHash!, type: otpType! });
  if (error) return NextResponse.redirect(new URL("/auth?error=callback", request.url));
  return response;
}
