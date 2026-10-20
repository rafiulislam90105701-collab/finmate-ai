const SAFE_ACTION_ERRORS = new Set([
  "Invalid action request",
  "Invalid action fields",
  "Required fields are missing",
  "Current record id and update timestamp are required",
  "Category not found in your workspace",
  "Record not found in your workspace",
  "A paid bill cannot be updated",
  "A bill-linked transaction cannot be updated directly",
  "This confirmation was already used with different details",
  "This record changed since the proposal. Refresh and ask again.",
  "This record changed or is no longer available. Refresh and ask again.",
]);

function safeMessage(payload: unknown): string | null {
  if (!payload || typeof payload !== "object" || !("error" in payload)) return null;
  const value = (payload as { error?: unknown }).error;
  return typeof value === "string" && SAFE_ACTION_ERRORS.has(value) ? value : null;
}

/** Extract only known user-safe validation errors; never show raw database errors. */
export async function getFinancialActionError(error: unknown, data?: unknown): Promise<string> {
  const fromData = safeMessage(data);
  if (fromData) return fromData;

  if (error && typeof error === "object" && "context" in error) {
    const context = (error as { context?: unknown }).context;
    if (context instanceof Response) {
      try {
        const fromResponse = safeMessage(await context.clone().json());
        if (fromResponse) return fromResponse;
      } catch {
        // The response may be empty or non-JSON; keep the generic safe message.
      }
    }
  }

  return "Not saved. Check your connection and try again; no success was reported.";
}
