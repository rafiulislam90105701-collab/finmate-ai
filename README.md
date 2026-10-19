# FinMate AI

FinMate AI is a responsive, installable personal-finance workspace. It helps people record income and expenses, plan category budgets, reserve upcoming bills, track savings goals, and understand an estimated end-of-month balance.

It is designed to remain useful with no credentials: open `/app?demo=1` for a clearly labelled, fictional browser-local demo. When Supabase is configured, `/app` itself is protected for signed-in cloud workspaces. The demo is not cloud-synced and must never be used as a substitute for a backup.

## What is included

- Original landing page, BDT-first interface, responsive layout, light/dark theme, PWA manifest, icons, and an offline shell that never caches authenticated API responses.
- Protected Supabase app route when configuration is present; sign-up, sign-in, sign-out, reset password, first-use onboarding, currency, and timezone preferences.
- Transaction ledger with validation, create/edit/delete, date/category/type filters, search, and sorting.
- Default and custom categories; monthly budgets and progress warnings; savings goals with contribution history.
- Bills with overdue/upcoming/paid states. Marking a bill paid adds one linked ledger entry, and undoing it removes the linked entry—so forecasts do not double-count it.
- Deterministic forecast with integer-minor-unit arithmetic, transparent inputs, custom expected-spending adjustment, and shortfall warnings.
- Assistant UI with a server-side Groq agent, RLS-scoped read-only finance tools, and a question-specific rules fallback. Budget changes require a separate explicit review and approval.
- Activity history, JSON export, Supabase migrations, RLS policies, same-owner reference guards, non-destructive cross-device sync, and atomic database RPCs for paid bills and approved budget proposals.

## Technology

Next.js 15 App Router, TypeScript (strict), React 19, Tailwind CSS, Recharts, Lucide, Zod, Supabase SSR/JS, Vitest, and Vercel-compatible configuration.

## Run locally

Prerequisites: Node.js 22+ and pnpm 11.25.0 (Corepack is recommended). The locked Supabase client requires Node.js 22+.

```powershell
cd path\to\FinMate-AI
pnpm install
pnpm dev
```

The development command prints the actual URL (normally `http://localhost:3000`). Open `/` for the landing page, `/app?demo=1` for the fictional demo, or `/app` after signing in to a configured cloud workspace.

```powershell
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm start
```

## Demo mode

The explicit `/app?demo=1` route shows the **FICTIONAL DEMO** workspace. Its records are saved in this browser under a local-storage key, can be exported as JSON, and can be reset from Settings. It does not sync to other devices and it never claims to be private cloud storage.

The sample plan uses BDT values and demonstrates the calculation:

```text
available now − unpaid bills − expected remaining spending = month-end estimate
৳42,750 − ৳16,000 − ৳2,500 = ৳24,250
```

## Supabase setup

1. Use the intended Supabase project and set its Site URL to the actual production HTTPS origin after deployment. Add `https://YOUR_PRODUCTION_DOMAIN/auth/callback` and `http://localhost:3000/auth/callback` to Auth Redirect URLs. Signup confirmation uses a six-digit email code; password recovery and previously issued callback links continue through the callback route. See [email OTP setup](docs/auth-otp-setup.md).
2. In the SQL editor, apply the migrations in filename order—[001_finmate_schema.sql](supabase/migrations/001_finmate_schema.sql), [002_security_hardening.sql](supabase/migrations/002_security_hardening.sql), [20261015180542_data_api_security_and_indexes.sql](supabase/migrations/20261015180542_data_api_security_and_indexes.sql), [20261016090000_bill_payment_integrity.sql](supabase/migrations/20261016090000_bill_payment_integrity.sql), and [20261018185426_revoke_untrusted_rls_auto_enable.sql](supabase/migrations/20261018185426_revoke_untrusted_rls_auto_enable.sql)—or use `supabase db push` after linking a project.
3. Copy `.env.example` to `.env.local` and set only the project URL and **anon** key:

   ```env
   NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
   ```

4. Restart the Next.js server. Users who are signed in load only their own rows under RLS. New auth users receive a profile and the default categories through the migration trigger.

Never place a Supabase `service_role` key in this repository, browser code, or Vercel `NEXT_PUBLIC_*` environment variables.

### Cross-user isolation check

Create two ordinary test accounts, add a transaction as each, then sign in separately and query each table using the application. Every `select`, update, and delete should return only the signed-in user's rows. The migrations enable RLS on every user-owned table, grant Data API access only to authenticated users, and database triggers reject a category, bill, payment, or savings-goal reference that belongs to another user.

## AI assistant

Fictional demo conversations use deterministic rules only and never send demo figures to an AI provider. In a signed-in cloud workspace, the UI invokes the Supabase Edge Function. It verifies the session, reads only RLS-authorized data, and calls Groq server-side using `GROQ_API_KEY`; the browser never receives the key. The preferred model is `openai/gpt-oss-120b`. Model usage is subject to the Groq Free tier limits; do not upgrade to a paid tier for this project. If the key is absent, invalid, or rate-limited, the function returns a grounded rules-based fallback.

To deploy the Edge Function (after installing and authenticating the Supabase CLI):

```powershell
supabase functions deploy finance-assistant
```

`GROQ_API_KEY` is stored only in Supabase Edge Function Secrets. It is already configured for the current project; never put it in `.env.local`, Vercel, or `NEXT_PUBLIC_*` values. To rotate it, use the Supabase dashboard's Edge Function Secrets or the CLI's secure secret command in a private terminal—never paste it in chat or commit it.

The assistant cannot directly apply a recommendation. It can only explain data or prepare a proposal; the person must approve the proposal, which creates an activity-history entry. The demo endpoint returns `no-store` responses, caps request payloads, prevents duplicate in-flight submissions, applies a best-effort per-instance rate limit, and falls back after a 12-second provider timeout.

## Deployment to Vercel

See [DEPLOYMENT.md](DEPLOYMENT.md) for the precise sequence. The short version is: push this directory to a Git repository, import it into Vercel, set the environment variables above, set Supabase Auth URLs, deploy the migration/functions, and run the production checklist.

## PWA installation

Open the deployed HTTPS site in a compatible browser, then choose the browser’s **Install app** / **Add to Home Screen** option. The service worker caches public application-shell assets and provides an offline page for navigation failures. It intentionally does **not** cache Supabase API responses or financial data. An installed PWA is not automatically an Android or iOS store app.

## Security notes and limitations

- FinMate is an organisational aid and educational tool, not a licensed financial adviser. Forecasts are estimates, not guarantees.
- Money is stored as integer minor units both in the client domain model and PostgreSQL schema; client validation is duplicated by database constraints.
- The local demo is browser-local, fictional, and not encrypted backup storage.
- The optional AI model is allowed to explain supplied results only. Deterministic calculations remain the financial source of truth.
- Live sign-in, RLS execution, Edge Function deployment, and a public HTTPS install flow require your Supabase/Vercel accounts and credentials; they are not fabricated by this project.

## Project map

| Path | Purpose |
| --- | --- |
| `app/` | Next App Router pages, API route, metadata, manifest, offline page |
| `components/dashboard.tsx` | Demo/cloud workspace interface and CRUD interactions |
| `lib/finance.ts` | Deterministic financial calculations and money formatting |
| `lib/cloud-store.ts` | Authenticated RLS-scoped Supabase read/sync adapter |
| `supabase/migrations/` | Versioned PostgreSQL schema, explicit Data API grants, RLS, triggers, indexes, and RPCs |
| `supabase/functions/finance-assistant/` | RLS-scoped controlled assistant Edge Function |
| `tests/finance.test.ts`, `tests/assistant-fallback.test.ts` | Forecast, validation, budget, date-boundary, double-counting, and question-specific fallback tests |

## Troubleshooting

- **`/app` redirects to `/auth`**: Supabase credentials are configured but there is no session. Sign in or remove the placeholder variables to use the demo.
- **Auth email does not return to the app**: add the exact local and deployed `/auth` redirect URLs in Supabase Auth settings.
- **A build cannot find dependencies**: delete only this project’s `node_modules` directory, then run `pnpm install` again.
- **Cloud data does not save**: confirm the migration completed, RLS policies exist, and the browser is signed in with the intended Supabase project.
- **AI responds with rules-based fallback**: this is expected with no valid `GROQ_API_KEY`, during provider downtime, or when Groq's free quota is rate-limited.
