# Deploying FinMate AI

Prerequisites: Node.js 22+ and pnpm 11.25.0. Vercel reads the Node requirement and pinned package-manager version from `package.json`.

## 1. Create the GitHub repository

Create an **empty** GitHub repository named `finmate-ai` in the intended account or organisation. Do not ask GitHub to add a README, licence, or `.gitignore`, because this project already has them. From this directory, make the first commit and push it:

```powershell
git config user.name "YOUR NAME"
git config user.email "YOUR_EMAIL@example.com"
git commit -m "Initial FinMate AI PWA"
git remote add origin https://github.com/YOUR_ACCOUNT/finmate-ai.git
git push -u origin main
```

If Vercel's import screen says **No Git Repositories Found**, use its GitHub connection settings to adjust the Vercel GitHub App permissions, grant access to this `finmate-ai` repository (or its organisation), return to Import, and refresh the list. Never paste an access token into this repository or an environment file.

## 2. Prepare Supabase

1. Use the existing Supabase project `ahgbbmefuagafjxandqa` for the connected FinMate deployment.
2. The migration files in `supabase/migrations/` are the schema and security source of truth. Apply any unapplied files in filename order through the SQL editor or Supabase CLI:

   ```powershell
   supabase login
   supabase link --project-ref YOUR_PROJECT_REF
   supabase db push
   ```

3. Configure Auth in Supabase Dashboard → Authentication:
   - Under URL Configuration, set Site URL to the actual production HTTPS domain after deployment.
   - Add redirect URLs `https://YOUR_PRODUCTION_DOMAIN/auth/callback` and `http://localhost:3000/auth/callback`.
   - Under Email provider settings, enable **Confirm email**. FinMate refuses to create a signed-in session for an unverified account; the database policies also deny financial rows until Supabase records `email_confirmed_at`.
   - Follow [the email OTP and SMTP setup guide](docs/auth-otp-setup.md). The app expects the Confirm signup email to include `{{ .Token }}` and verifies with `verifyOtp({ email, token, type: 'email' })`. Hosted email templates and SMTP settings are dashboard-managed; verify delivery using a real inbox before claiming OTP works.
   - The Supabase security advisor previously reported leaked-password protection disabled. Enable it in the Auth password-security settings if available for the project plan, then re-run the advisor. Never put SMTP or service-role credentials in the app.
4. Verify RLS is enabled and test with two normal users. Do not use a shared demo user for financial information.

Optional assistant Edge Function:

```powershell
supabase functions deploy finance-assistant
supabase functions deploy finance-action
```

The assistant uses the already-configured `GROQ_API_KEY` secret in Supabase and `openai/gpt-oss-120b`. Never put the key in Vercel or browser code. Stay on Groq's Free tier; the function uses bounded requests and falls back on rate limits. The `finance-action` function validates proposals again on the server and uses the signed-in caller's JWT and existing RLS; it does not use a service-role key or require a new migration. Deploy both functions before enabling confirmed AI actions. The demo endpoint is rules-only and does not send fictional data to Groq.

## 3. Deploy to Vercel

1. Put the `FinMate-AI` directory in a private or public Git repository; do not commit `.env.local`.
2. Import the repository into Vercel. Framework preset: **Next.js**. Build command: `pnpm build`.
3. Add these Production/Preview environment variables:

   ```text
   NEXT_PUBLIC_SUPABASE_URL
   NEXT_PUBLIC_SUPABASE_ANON_KEY
   ```

4. Deploy. Copy the final HTTPS URL into Supabase Auth Site URL and Redirect URLs, then redeploy if Vercel asks you to.

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
