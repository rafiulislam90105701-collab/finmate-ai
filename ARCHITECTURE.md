# Production architecture

```text
Browser on any supported device
        │ HTTPS
        ▼
Vercel / Next.js application
  ├─ public landing page + installable PWA shell
  ├─ `/auth` (Supabase Auth client)
  ├─ `/app` (middleware-protected when Supabase is configured)
  └─ server-only optional assistant fallback (`OPENAI_API_KEY`)
        │ authenticated Supabase session
        ▼
Supabase Auth + PostgreSQL
  ├─ profiles, categories, transactions, budgets, bills
  ├─ savings goals/contributions and activity history
  ├─ Row Level Security for every user-owned table
  └─ atomic paid-bill and budget-proposal RPCs
        │
        └─ optional `finance-assistant` Edge Function
             verifies JWT → reads RLS-authorized data → calls AI provider server-side
```

## Operating modes

| Mode | Where data lives | Authentication | Cross-device sync |
| --- | --- | --- | --- |
| Local development | Browser-local, fictional demo when not signed in | Optional | No |
| Production demo | Browser-local, fictional demo | None | No |
| Production cloud workspace | Supabase PostgreSQL per authenticated user | Supabase Auth | Yes: the latest signed-in data is loaded from and written to the same cloud account on every device/session |

Cloud mode is activated only after `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` are configured and the visitor signs in. The browser receives only the public anon key; RLS supplies the per-user access boundary. No service-role or AI provider secret reaches the client.

## Data integrity decisions

- Currency values use PostgreSQL `bigint` and TypeScript integer minor units.
- Bills marked paid are linked to exactly one expense ledger row. Forecasts ignore the linked bill as an unpaid liability.
- Cloud writes are queued in the UI and reconciled only against the signed-in user’s RLS-visible rows. Database triggers also reject cross-user category, bill, payment, and savings-goal references.
- An assistant response is explanatory. A budget mutation requires a visible proposal followed by an explicit approval action and activity record.
