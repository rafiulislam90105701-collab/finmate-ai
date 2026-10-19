# FinMate AI Security Notes

## Scope and non-secret summary

This note describes the security mechanisms present in the reviewed FinMate AI code and migrations. It deliberately excludes all secret values, passwords, tokens, database passwords, provider keys, and user financial data.

FinMate is not a bank, payment processor, or substitute for a formal security assessment. Production operators should still maintain access control, backups, account recovery, monitoring, and dependency updates.

## Authentication and workspace access

- The app uses Supabase Auth for sign-up, password sign-in, sign-out, and password-reset flows.
- When public Supabase URL and anon-key configuration are present, middleware checks the current server-side Supabase session before allowing the private `/app` route.
- The special `/app?demo=1` route is intentionally public and visibly marked **FICTIONAL DEMO**. It uses browser-local sample data rather than a cloud workspace.
- A browser-only public anon key is expected in `NEXT_PUBLIC_SUPABASE_ANON_KEY`. It is not a service-role key; database Row Level Security supplies the authorization boundary.

## Database protections present in migrations

- User-owned tables include profiles, categories, transactions, budgets, bills, savings goals, savings contributions, and activity history.
- Row Level Security is enabled on the user-owned tables.
- Own-row policies compare `auth.uid()` with the row owner identifier.
- Database triggers validate that a category, linked bill payment, and savings-goal contribution reference belongs to the same owner.
- Atomic RPCs handle bill payment, bill-payment undo, and approved budget proposals.
- Additional integrity triggers protect paid-bill schedule fields and linked bill-payment transaction fields from unsafe changes.
- Data API table privileges are revoked from anonymous access and granted to authenticated users only, with RLS still applying.
- Indexes support user/date and related query patterns without changing data semantics.

## Assistant data handling

- In demo mode, the browser sends a compact pre-calculated summary to the Next.js assistant route. That route validates request shape and size, sends `Cache-Control: no-store`, uses a basic per-instance request limit, and falls back safely if the optional provider is unavailable.
- In the signed-in cloud mode, the intended Supabase Edge Function verifies the caller JWT, reads the caller's RLS-authorized data, and supplies a read-only summary to an optional provider.
- Assistant responses cannot directly modify the database. A budget change is drafted for visible review, then requires an explicit **Approve change** action.
- The optional AI provider key belongs only in a server-side secret environment variable. It must never be prefixed `NEXT_PUBLIC_`, committed to Git, pasted into client code, or recorded in documentation.

## PWA and browser storage

- The service worker caches public shell assets and displays an offline page after a navigation failure.
- It bypasses `/api/` calls and is written not to cache authenticated financial API responses.
- Fictional demo state uses browser-local storage on purpose. It is not cloud backup and should not be treated as encrypted account storage.
- A JSON export is a local convenience download. Users should protect downloaded files and avoid using a demo export as their only backup.

## Secure configuration checklist

1. Keep `.env.local`, real `.env` files, provider keys, service-role keys, database passwords, and credentials out of Git. The repository ignores `.env*` except `.env.example`.
2. Configure only these browser-safe public values in the web app: `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
3. Configure `OPENAI_API_KEY` and `OPENAI_MODEL` only in a server-side environment or Supabase Edge Function secret store, if the optional generative provider is used.
4. Set Supabase Auth Site URL and redirect URLs to the exact public HTTPS deployment and local development auth URL. Keep email confirmation enabled if verified sign-up is required.
5. Keep Supabase RLS enabled. Do not add broad anonymous policies just to make a feature appear to work.
6. Use unique accounts for different people; do not share account credentials when data must remain private.
7. Before relying on a new deployment, run a two-user test using ordinary test accounts. Confirm cross-user reads, updates, deletes, and foreign-key-like references are refused.
8. Review Vercel and Supabase access permissions periodically, use multi-factor authentication where available, and avoid putting secrets in build logs or screenshots.

## Remaining security considerations

- This documentation pass reviewed source and recorded deployment evidence but did not perform penetration testing or a live two-user database attack simulation.
- The demo is deliberately accessible to everyone because it contains only fictional data. Do not confuse it with a protected workspace.
- The lightweight in-memory rate limit in the demo assistant route is best-effort per running instance; it is not a distributed abuse-prevention system.
- Optional external AI processing introduces a third-party data-processing decision. Enable it only after deciding what information may be sent to that provider and after setting a suitable server-side secret.
- Financial plans and forecasts are sensitive. Encourage users to sign out on shared devices and protect exported JSON files.

## Safe response to a potential issue

If you suspect cross-account data exposure, a leaked key, unexpected database policy, or unauthorised sign-in:

1. Do not disable RLS or paste secrets into chat.
2. Revoke or rotate the affected secret in its provider dashboard.
3. Review Supabase Auth sessions, database policies, and Vercel environment variables using the account owner.
4. Preserve relevant logs privately and seek a qualified security review before changing production policies.
