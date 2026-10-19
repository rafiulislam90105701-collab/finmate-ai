import { NextResponse } from "next/server";
import { answerRulesBasedAssistant } from "@/lib/assistant-fallback";
import { assistantRequestSchema } from "@/lib/schemas";

export const runtime = "nodejs";

const WINDOW_MS = 5 * 60 * 1_000;
const MAX_REQUESTS_PER_WINDOW = 12;
const requestWindows = new Map<string, { count: number; resetAt: number }>();

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

function isRateLimited(clientKey: string) {
  const now = Date.now();
  const active = requestWindows.get(clientKey);
  if (!active || active.resetAt <= now) {
    requestWindows.set(clientKey, { count: 1, resetAt: now + WINDOW_MS });
    return false;
  }
  active.count += 1;
  return active.count > MAX_REQUESTS_PER_WINDOW;
}

export async function POST(request: Request) {
  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(contentLength) && contentLength > 20_000) return json({ error: "Assistant request is too large." }, 413);
  const clientKey = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (isRateLimited(clientKey)) return json({ error: "Too many assistant requests. Please try again shortly." }, 429);
  const parsed = assistantRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return json({ error: "Invalid assistant request." }, 400);

  const { question, summary, currency, context } = parsed.data;
  const fallback = answerRulesBasedAssistant({ question, summary, currency, context });
  // Fictional demo conversations never leave this server. Real AI inference is
  // available only through the authenticated Supabase Edge Function.
  return json({ mode: "rules", providerStatus: "demo-rules-only", answer: fallback });
}
