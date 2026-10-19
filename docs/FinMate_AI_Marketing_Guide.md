# FinMate AI Marketing Guide

## Product overview

**FinMate AI helps people turn a busy month of income, spending, bills, budgets, and savings goals into a clear, reviewable plan.** It is a responsive personal-finance PWA built for everyday organisation, with BDT-ready display and a transparent forecast rather than vague promises.

**Public website:** Add a URL only after a current production deployment has been verified.

FinMate is for people who want one calm place to:

- record income and expenses;
- see what is available now;
- reserve upcoming bills without double counting;
- set simple monthly budget guardrails;
- track savings contributions; and
- ask for an explanation of the current plan before making a change.

It is an educational and organisational product, not a bank, payment platform, investment adviser, or guarantee of financial outcomes.

## Verified value proposition

### Clear numbers, not hidden assumptions

The Overview dashboard separates available balance, current-month income, paid expenses, and unpaid bills. Its forecast shows the inputs used: available balance, unpaid bills, and expected future spending. Every forecast is visibly described as an estimate.

### A ledger people can actually review

Users can add, edit, filter, search, and sort ordinary income and expense records. The application supports categories, accounts, dates, and recurrence labels.

### Bills that are treated carefully

When a user marks a bill as paid, FinMate creates a linked expense ledger entry. Undoing the payment reverses that link. This prevents the paid bill from being counted again as an unpaid future obligation.

### Budget and goal planning

Category budgets show spending, remaining amount, and percentage used. Savings goals keep contributions separate from normal expense records so progress remains visible.

### Helpful explanations, with user control

FinMate AI explains the loaded financial summary and can draft a budget change. It does not make a data change until the user explicitly reviews and approves the proposal.

### Privacy-aware by design

The fictional demo is visibly labelled and stays in the local browser. Signed-in cloud workspaces are designed around Supabase authentication and account-scoped database rules. The PWA caches public shell assets but avoids caching authenticated financial API responses.

## How it works in plain language

1. **Record:** Add the income, expenses, bills, budgets, and savings goals you know about.
2. **Understand:** FinMate adds your opening balance and recorded income, subtracts paid expenses, then reserves unpaid bills and future spending to produce an estimate.
3. **Review:** Use budget progress, upcoming-bill list, goal progress, activity history, and assistant explanations to understand the plan.
4. **Decide:** You choose whether to add, edit, pay, undo, or approve anything. FinMate does not move money and does not create automatic payments.

## Feature summary for the public

| Feature | Benefit |
| --- | --- |
| Overview dashboard | See income, expenses, bills, budget status, and forecast in one place. |
| Transactions | Maintain a searchable ledger of income and spending. |
| Budgets | Set monthly category guardrails and notice pressure early. |
| Bills | Reserve obligations and avoid counting a paid bill twice. |
| Savings goals | Track intentional contributions toward a target. |
| FinMate AI | Receive a clear explanation and review any proposed budget change before approval. |
| Settings and export | Adjust display/forecast preferences and export the currently loaded workspace as JSON. |
| PWA | Install the HTTPS site on compatible phones and desktops. |

## Shareable public description

> FinMate AI is a calm personal-finance workspace for tracking income, expenses, bills, budgets, and savings goals. It shows a transparent month-end estimate, keeps bill payments from being double counted, and gives reviewable explanations without making financial decisions for you. Try the fictional demo at YOUR_VERIFIED_PRODUCTION_URL.

## Short social-media post

> Want a clearer picture of your month? FinMate AI brings your transactions, bills, budgets, savings goals, and an honest forecast into one simple workspace. Explore the clearly labelled fictional demo here: YOUR_VERIFIED_PRODUCTION_URL #PersonalFinance #Budgeting #FinMateAI

## Shareable introduction in Bangla

> FinMate AI হলো আয়-ব্যয়, বিল, বাজেট ও সেভিংস লক্ষ্য এক জায়গায় গুছিয়ে দেখার একটি personal-finance workspace। এটি আপনার তথ্যের ভিত্তিতে স্বচ্ছ month-end estimate দেখায়, কিন্তু কোনো টাকা সরায় না বা স্বয়ংক্রিয় সিদ্ধান্ত নেয় না। নিরাপদে দেখার জন্য fictional demo খুলুন: YOUR_VERIFIED_PRODUCTION_URL

## How to share the app

1. Replace YOUR_VERIFIED_PRODUCTION_URL only after a current production deployment has been verified.
2. Tell recipients that **Explore fictional demo** uses sample figures stored only in their browser.
3. Tell people who need their own synchronized data to choose **Create an account**, then sign in on each device with the same account.
4. Do not share one user account between different people when separate financial records are needed.

## Honest boundaries and setup needs

- The demo is fictional, local to one browser, and does not sync.
- The cloud workspace needs a user account and the existing Supabase configuration. An end-to-end new-user test should still be performed with test accounts before relying on a fresh configuration.
- The optional generative AI provider is not necessary for FinMate to work. Without a configured provider key, the assistant gives a labelled rules-based response.
- FinMate has no bank connection, card connection, payment processing, or automatic bill payment.
- Forecasts are estimates based on entered figures, unpaid bills, and an expected-spending assumption. They are not promises, credit decisions, investment advice, tax advice, or regulated financial advice.
- PWA installation is supported through compatible browsers over HTTPS. It is not a native-store app.

## Messaging guidelines

Use these statements:

- “Helps organise your financial plan.”
- “Shows a transparent estimate based on the numbers you record.”
- “Lets you review a budget proposal before approving it.”
- “Includes a clearly labelled fictional demo.”

Avoid these statements:

- “Automatically saves money.”
- “Connects to your bank.”
- “Guarantees your month-end balance.”
- “Provides financial advice.”
- “The demo syncs across devices.”
