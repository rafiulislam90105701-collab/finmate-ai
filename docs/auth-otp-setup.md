# FinMate email verification and Supabase Auth setup

FinMate's sign-up screen now expects a six-digit email OTP. It calls `signUp`, then verifies with `verifyOtp({ email, token, type: "signup" })`. Resend uses `resend({ email, type: "signup" })`. The browser Supabase client persists the resulting session using the existing `@supabase/ssr` browser storage/cookie integration. Password reset continues to use the recovery callback and `updateUser` flow.

## Required dashboard setup

Do this only for the intended FinMate Supabase project, `ahgbbmefuagafjxandqa`. This repository change does not alter hosted settings.

1. In Authentication → URL Configuration, set **Site URL** to the actual production HTTPS domain after the app is deployed. Add exact redirect URLs for `https://YOUR_PRODUCTION_DOMAIN/auth/callback` and local development `http://localhost:3000/auth/callback` (adjust the port if different). Keep other existing application redirects that are still in use.
2. In Authentication → Providers → Email, keep email sign-up enabled and **Confirm email** enabled.
3. In Authentication → Email Templates → Confirm signup, use the supplied `supabase/templates/confirmation.html`. The template must render `{{ .Token }}` (the six-digit code); a link-only template is incompatible with the code entry screen. Save and send a real test sign-up email to verify rendering and delivery.
4. Configure a production SMTP provider in Authentication → SMTP Settings if the project's hosted default sender cannot use a custom template, cannot reliably deliver to the test inbox, or its rate limit is insufficient. Enter SMTP credentials only in Supabase's secure dashboard fields, never in this app, Git, or chat. Set an appropriate sender name/address and test deliverability.
5. If enabled for the project plan, turn on leaked-password protection under the Auth password-security settings. The Supabase security advisor previously reported this protection disabled; this local code change cannot enable it. Re-run the advisor after changing it.

Supabase currently documents [custom SMTP setup](https://supabase.com/docs/guides/auth/auth-smtp), [Auth email templates](https://supabase.com/docs/guides/auth/auth-email-templates), and the [verifyOtp API](https://supabase.com/docs/reference/javascript/auth-verifyotp). The hosted default SMTP is intended for limited testing; do not treat this local implementation as proof that a real production inbox receives mail.

## Behavior and limitations

- The UI accepts exactly six numeric digits, handles expired/invalid codes with safe feedback, and uses a 60-second resend cooldown persisted in the current browser session. Supabase remains the authority for OTP expiry, rate limits, and verification.
- A rate-limit response is shown without exposing provider details. The UI avoids confirming whether an address is registered.
- A duplicate signup response is intentionally generic. The user can sign in or use password recovery instead.
- PKCE and token-hash callback handling remains available for password recovery and previously issued links. New signup confirmation should use the code template.
- Real delivery has not been verified by this change. Do not edit the production template or SMTP settings until the app version is released and a real inbox test is approved.
