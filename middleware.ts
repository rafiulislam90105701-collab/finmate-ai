import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key || url.includes("your-project")) return NextResponse.next();
  let response = NextResponse.next({ request });
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (cookies: { name: string; value: string; options: CookieOptions }[]) => {
        // Keep the refreshed cookies on both sides of the middleware boundary:
        // downstream server components need the new request cookies, while the
        // browser needs the response cookies for the next navigation.
        cookies.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookies.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });
  const auth = supabase.auth as unknown as { getUser: () => Promise<{ data: { user: { id: string; email_confirmed_at?: string | null } | null }; error: unknown }> };
  const { data: { user }, error } = await auth.getUser();
  // The explicitly labelled fictional demo is deliberately available without
  // an account; all other cloud workspace visits require authentication.
  const demoRequested = request.nextUrl.searchParams.get("demo") === "1";
  // A transient Auth/network error is not proof that the session is invalid.
  // Let the client retry; RLS still protects all cloud data.
  if (!error && !user && request.nextUrl.pathname.startsWith("/app") && !demoRequested) {
    const redirect = request.nextUrl.clone(); redirect.pathname = "/auth"; redirect.searchParams.set("next", request.nextUrl.pathname);
    const redirectResponse = NextResponse.redirect(redirect);
    response.cookies.getAll().forEach((cookie) => redirectResponse.cookies.set(cookie));
    response = redirectResponse;
  }
  if (!error && user && !user.email_confirmed_at && request.nextUrl.pathname.startsWith("/app") && !demoRequested) {
    const redirect = request.nextUrl.clone();
    redirect.pathname = "/auth";
    redirect.search = "?mode=verify-email";
    const redirectResponse = NextResponse.redirect(redirect);
    response.cookies.getAll().forEach((cookie) => redirectResponse.cookies.set(cookie));
    response = redirectResponse;
  }
  return response;
}
export const config = { matcher: ["/app/:path*"] };
