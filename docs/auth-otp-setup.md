# FinMate email verification and Supabase Auth setup

FinMate's sign-up screen now expects a six-digit email OTP. It calls `signUp`, then verifies with `verifyOtp({ email, token, type: "signup" })`. Resend uses `resend({ email, type: "signup" })`. The browser Supabase client persists the resulting session using the existing `@supabase/ssr` browser storage/cookie integration. Password reset continues to use the recovery callback and `updateUser` flow.

## Required dashboard setup

Do this only for the intended FinMate Supabase project, `ahgbbmefuagafjxandqa`. This repository change does not alter hosted settings.

1. In Authentication → URL Configuration, set **Site URL** to the verified Rafiul-owned production HTTPS domain. The currently observed `https://finmate-ai-one.vercel.app` is usable only if its Vercel owner is confirmed as Rafiul; otherwise wait for the replacement project's URL. Add the exact `<production-origin>/auth/callback` redirect and local development `http://localhost:3000/auth/callback`. Keep other still-used application redirects.
2. In Authentication → Providers → Email, keep email sign-up enabled and **Confirm email** enabled.
3. For a public multi-user app, configure a custom SMTP provider in Authentication → SMTP Settings. Supabase's default SMTP only sends to pre-authorized project-team addresses and is rate-limited, so it cannot reliably serve arbitrary new FinMate users. This is also required to customize auth templates on a new Free project. Use provider credentials and a sender address that the provider verifies; enter credentials only in Supabase's secure settings, never in this app, Git, or chat.
4. In Authentication → Email Templates → Confirm signup, use the supplied `supabase/templates/confirmation.html`. The template must render `{{ .Token }}` (the six-digit code); a link-only template is incompatible with the code entry screen. Save and send a real test sign-up email to verify rendering and delivery.
5. If enabled for the project plan, turn on leaked-password protection under the Auth password-security settings. The Supabase security advisor previously reported this protection disabled; this local code change cannot enable it. Re-run the advisor after changing it.

## Delivery limitation that must be checked before launch

The client flow and repository template agree on six-digit signup OTP. That alone does not ensure that new users can receive email. Supabase's default SMTP is for limited testing: messages are restricted to pre-authorized project-team addresses and the documented limit is currently two messages per hour. Supabase also notes that new Free projects created after 3 June 2026 cannot customize auth email templates while using default SMTP. This project is on the Free plan and was created after that date, so confirm that a custom SMTP provider is enabled; otherwise arbitrary public signups and the custom `{{ .Token }}` template may not work as intended. See [Supabase SMTP limitations and setup](https://supabase.com/docs/guides/auth/auth-smtp) and the [template customization change](https://supabase.com/changelog?types=breaking-change).

The hosted SMTP setting could not be read in the current dashboard session, and no real inbox test was performed. Configure the provider and sender in Supabase Authentication → SMTP Settings using the provider's secure dashboard fields. Use `rafiulislam90105701@gmail.com` as the From address only if the provider verifies and permits that sender. Never put an SMTP password or app password in this repository or chat. After saving, send a test signup to a controlled inbox, check spam and provider delivery logs, enter the code at the app's verification screen, then verify that the same email/password can sign in. Do not claim delivery or signup success until this completes.

Supabase currently documents [custom SMTP setup](https://supabase.com/docs/guides/auth/auth-smtp), [Auth email templates](https://supabase.com/docs/guides/auth/auth-email-templates), and the [verifyOtp API](https://supabase.com/docs/reference/javascript/auth-verifyotp). The hosted default SMTP is intended for limited testing; do not treat this local implementation as proof that a real production inbox receives mail.

## Behavior and limitations

- The UI accepts exactly six numeric digits, handles expired/invalid codes with safe feedback, and uses a 60-second resend cooldown persisted in the current browser session. Supabase remains the authority for OTP expiry, rate limits, and verification.
- A rate-limit response is shown without exposing provider details. The UI avoids confirming whether an address is registered.
- A duplicate signup response is intentionally generic. The user can sign in or use password recovery instead.
- PKCE and token-hash callback handling remains available for password recovery and previously issued links. New signup confirmation should use the code template.
- Real delivery has not been verified by this change. Do not edit the production template or SMTP settings until the app version is released and a real inbox test is approved.
