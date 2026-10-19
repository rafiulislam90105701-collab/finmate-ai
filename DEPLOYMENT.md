# Deploying FinMate AI

Prerequisites: Node.js 22+ and pnpm 11.25.0. Vercel reads the Node requirement and pinned package-manager version from `package.json`.

## 1. Existing GitHub target

The private repository already exists at [rafiulislam90105701-collab/finmate-ai](https://github.com/rafiulislam90105701-collab/finmate-ai). Its default branch is `main`; the current production source is merge commit `123a4a251777d3f0340673c8fe4ade8d55adae75`. Do not create another repository or change the verified `origin` remote. Use a feature branch and pull request for future changes; never force-push or commit environment files.

## 2. Prepare Supabase

1. Use the existing Supabase project `ahgbbmefuagafjxandqa` for FinMate.
2. The migrations through `20261019010910_auth_email_guard_authenticated_role` are already recorded as applied in that project. Do not rerun them. For future migrations, compare local files with the project's migration history and review each migration before applying it:

   ```powershell
   supabase login
   supabase link --project-ref ahgbbmefuagafjxandqa
   supabase db push
   ```

3. Configure Auth in Supabase Dashboard → Authentication:
   - The production origin is `https://finmate-ai-one.vercel.app`; set it as the Site URL and allow `https://finmate-ai-one.vercel.app/auth/callback` plus local development `http://localhost:3000/auth/callback`. Preserve other still-used redirects.
   - Under Email provider settings, enable **Confirm email**. FinMate refuses to create a signed-in session for an unverified account; the database policies also deny financial rows until Supabase records `email_confirmed_at`.
   - Follow [the email OTP and SMTP setup guide](docs/auth-otp-setup.md). The app expects the Confirm signup email to include `{{ .Token }}` and verifies signup codes with `verifyOtp({ email, token, type: 'signup' })`. Hosted email templates and SMTP settings are dashboard-managed; verify delivery using a real inbox before claiming OTP works.
   - The Supabase security advisor previously reported leaked-password protection disabled. Enable it in the Auth password-security settings if available for the project plan, then re-run the advisor. Never put SMTP or service-role credentials in the app.
4. Verify RLS is enabled and test with two normal users. Do not use a shared demo user for financial information.

Optional assistant Edge Function:

```powershell
supabase functions deploy finance-assistant
supabase functions deploy finance-action
```

The assistant uses the already-configured `GROQ_API_KEY` secret in Supabase and `openai/gpt-oss-120b`. Never put the key in Vercel or browser code. Stay on Groq's Free tier; the function uses bounded requests and falls back on rate limits. The `finance-action` function validates proposals again on the server and uses the signed-in caller's JWT and existing RLS; it does not use a service-role key or require a new migration. Deploy both functions before enabling confirmed AI actions. The demo endpoint is rules-only and does not send fictional data to Groq.

## 3. Existing Vercel deployment

The public URL `https://finmate-ai-one.vercel.app` loads the FinMate landing page and fictional demo. GitHub reports the `main` deployment completed for commit `123a4a251777d3f0340673c8fe4ade8d55adae75`. The deployment check points to Vercel team slug `finmate3`, project `finmate-ai`. A second project named `finmate-ai-78a4` also receives deployments from the same repository; do not delete or disconnect either project until the Rafiul team dashboard confirms ownership and which is the intended project. Because the active browser session cannot access that team, treat the production ownership as unverified; do not promote or redeploy there until verified.

For future deployment setup, connect the existing private GitHub repository, production branch `main`, framework **Next.js**, Node.js 22+, package manager pnpm 11.25.0, and build command `pnpm build`. The production environment requires these browser-safe Supabase variables:

   ```text
   NEXT_PUBLIC_SUPABASE_URL
   NEXT_PUBLIC_SUPABASE_ANON_KEY
   ```

Keep values in Vercel's encrypted environment settings; use Production scope for production and Preview only with a deliberately isolated Supabase project. Never copy service-role, SMTP, or Groq secrets to Vercel or client variables.

## 4. Production verification checklist

- `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm build` pass from a clean checkout.
- A signed-out visitor can see the landing page but cannot reach a configured `/app` route.
- A newly signed-up user has a profile and default categories.
- A row cannot reference another user's category, bill, payment transaction, or savings goal (verify with two ordinary users).
- Confirm Data API access is denied to an anonymous caller and allowed only to the signed-in owner's rows.
- A transaction, budget, bill, and savings contribution persist after refresh for their owner only.
- Marking a bill paid creates exactly one linked expense; undo reverses it.
- Forecast shows unpaid bills and remaining spending separately, with no double count.
- Unconfigured AI shows the labelled rules-based fallback.
- Manifest loads over HTTPS and browser PWA installation works. Confirm authenticated API responses do not appear in Cache Storage.
- Security headers are present and no client bundle contains `service_role` or provider secrets.

## 5. Rollback and support

Use Vercel’s previous deployment promotion for an application rollback. Database migrations are additive and should be reviewed before running in production; take a Supabase backup before schema changes. For a data deletion request, use a deliberate, authenticated owner-only workflow—do not use browser caches as a source of truth.
