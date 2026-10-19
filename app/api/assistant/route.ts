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

  const { question, summary, currency, context, history } = parsed.data;
  const fallback = answerRulesBasedAssistant({ question, summary, currency, context });
  const key = process.env.OPENAI_API_KEY;
  if (!key) return json({ mode: "rules", providerStatus: "not-configured", answer: fallback });

  const workspaceContext = JSON.stringify({ summary, currency, context });
  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL ?? "gpt-4.1-mini",
        input: [
          { role: "system", content: "You are FinMate AI. Use only the supplied fictional-demo financial context. Explain records, deterministic estimates, and optional trade-offs concisely. Do not invent transactions, claim to have changed data, guarantee outcomes, or provide regulated financial advice." },
          ...history.map((message) => ({ role: message.role, content: message.content })),
          { role: "user", content: `Question: ${question}\n\nAuthorized workspace context: ${workspaceContext}` }
        ],
        max_output_tokens: 260
      }),
      signal: AbortSignal.timeout(12_000)
    });
    if (!response.ok) throw new Error("Provider unavailable");
    const body = await response.json() as { output_text?: string };
    const answer = typeof body.output_text === "string" ? body.output_text.trim() : "";
    return json({ mode: answer ? "ai" : "rules", providerStatus: answer ? "available" : "empty-response", answer: answer || fallback });
  } catch {
    return json({ mode: "rules", providerStatus: "unavailable", answer: fallback });
  }
}
