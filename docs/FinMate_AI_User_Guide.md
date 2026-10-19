# FinMate AI User Guide

## Welcome

FinMate AI is a personal-finance workspace for recording income and spending, planning bills and category budgets, tracking savings goals, and viewing a transparent month-end estimate. It is an organisation and education tool, not financial advice.

**Live website:** https://finmate-ai-78a4.vercel.app/

Two modes are intentionally available:

| Mode | How to open it | Where data lives | Syncs between devices? |
| --- | --- | --- | --- |
| **Fictional demo** | Choose **Explore fictional demo** or visit `/app?demo=1` | Only in the current browser | No |
| **Private cloud workspace** | Create an account or sign in, then open `/app` | Your signed-in Supabase account | Yes |

The demo has a visible **FICTIONAL DEMO** label. Its BDT figures are examples, not real accounts or real financial records.

## Quick start

### Explore safely without an account

1. Open the live website.
2. Select **Explore fictional demo**.
3. The **Overview** dashboard opens with sample income, spending, upcoming bills, budgets, and goals.
4. Use the left navigation on desktop, or the fixed bottom navigation on small screens. On mobile, choose **More** for Savings goals, FinMate AI, Activity, Settings, and Sign out.
5. In **Settings**, select **Export JSON** to download the fictional workspace, or **Reset demo** to restore the original sample data.

Demo data is deliberately browser-local. Clearing browser storage, changing browser profiles, or using another device will not move it to that device.

### Use a private cloud workspace

1. On the landing page, select **Create an account** or **Sign in**.
2. Enter an email address and a password of at least eight characters.
3. For a new account, check your email and confirm it if Supabase email confirmation is enabled.
4. Sign in. Your first visit shows onboarding to choose currency, timezone, opening available balance, and an optional expected remaining-spending estimate.
5. Use **Add transaction** to begin your ledger.

The private workspace is designed to load and save the signed-in account's data through Supabase. Do not share an account with another person if you need separated financial records.

## Navigation map

| Place | What it does |
| --- | --- |
| **Overview** | Displays available balance, monthly income and expenses, unpaid bills, cash flow, forecast, budget pulse, and health signals. |
| **Transactions** | Your ledger. Search, filter, sort, add, edit, or delete ordinary income and expense entries. |
| **Budgets** | Sets monthly category limits and shows paid spending, remaining amount, and percentage used. |
| **Bills** | Holds future obligations. Marking a bill paid creates one linked expense entry. |
| **Savings goals** | Creates goals and records each contribution separately from the expense ledger. |
| **FinMate AI** | Explains the currently loaded workspace and can prepare a budget proposal for review. |
| **Activity** | Lists meaningful saved actions, including changes, bill payments, and approved budget proposals. |
| **Settings** | Controls display preferences, forecast inputs, categories, JSON export, and demo reset. |

On desktop, **Settings** and **Sign out** sit at the bottom of the sidebar. On mobile, the fixed navigation shows Overview, Transactions, Budgets, Bills, and **More**. The **More** menu contains Savings goals, FinMate AI, Activity, Settings, and Sign out.

## Understand the dashboard

The **Overview** page starts with four cards:

- **Available balance**: opening available balance plus recorded income minus paid expenses.
- **Monthly income**: income ledger entries dated in the current month.
- **Monthly expenses**: paid expense ledger entries dated in the current month.
- **Unpaid bills**: scheduled bills that are not yet marked paid.

The forecast is deliberately labelled **Estimate, not a guarantee**. It uses this calculation:

```text
available now - unpaid bills - expected remaining spending = estimated month-end balance
```

If no custom expected-spending amount is entered, FinMate uses unspent category budgets as the remaining-spending assumption. Paid bills are linked to a ledger expense so that the same bill is not counted twice as both paid spending and unpaid money.

## Record transactions

1. Select **Add transaction** from the header, or open **Transactions**.
2. Choose income or expense, description, amount, date, category, account, and recurrence where available.
3. Save the form. Totals and forecast update immediately.
4. On **Transactions**, use **Search transactions**, **Filter type**, **Filter category**, and **Sort transactions** to find entries.
5. Use the pencil button to edit a normal entry and the bin button to delete it.

Entries created by **Mark paid** in Bills are managed through **Bills**, not through the normal transaction editing controls. This protects the bill-payment link.

## Create and review budgets

1. Open **Budgets**.
2. Under **Add a category budget**, select a category, enter a monthly amount, and choose the month.
3. Select **Add budget**.
4. Read the progress line: it shows spending, budget amount, amount left (or over), and percentage used.
5. Use **Edit** to change a budget or **Delete** to remove it.

A budget is a planning tool. It does not transfer money or create a transaction.

## Plan bills without double counting

1. Open **Bills**.
2. Under **Add a bill**, enter the bill name, amount, due date, category, and frequency.
3. Choose **Add bill**.
4. When it is genuinely paid, select **Mark paid** beside that bill.
5. FinMate creates one linked expense in the ledger and updates the forecast.
6. If necessary, use **Undo payment** from the bill. Do not edit the linked expense directly.

Recurring bills remain scheduled reminders. They do not automatically create charges or payments.

## Track savings goals

1. Open **Savings goals**.
2. Under **Add a savings goal**, enter a goal name, target amount, and optional target date.
3. Select **Create goal**.
4. For an existing goal, enter an amount under **Contribution to [goal name]** and select **Add**.
5. Review the goal percentage and contribution record below it.

Saving-goal contributions are separate records. They do not silently alter the income/expense ledger.

## Use FinMate AI carefully

1. Open **FinMate AI**.
2. Read the **Signals** based on your current workspace.
3. Ask a short question in **Ask FinMate AI**, for example: “How do upcoming bills affect my estimate?”
4. Read the labelled response. It is explanatory and does not change data by itself.
5. To consider a change, select **Draft a budget change**. Read the proposed amount.
6. Select **Approve change** only if you agree, or **Reject** to discard it.

Without an optional AI provider key, FinMate uses a clearly labelled rules-based explanation that distinguishes greetings, category spending, bills, forecasts, savings goals, and unsupported questions. Forecast calculations remain deterministic either way. Do not treat any assistant response as regulated financial, legal, tax, or investment advice.

## Settings, export, and privacy

In **Settings** you can:

- Change **Currency** for display.
- Change **Timezone** for date interpretation.
- Set **Opening available balance** and optional **Expected remaining spending**, then choose **Save forecast settings**.
- Add a **New category**. A custom category cannot be removed while a transaction, budget, or bill still uses it.
- Choose **Export JSON** for a device-local copy of the workspace currently loaded.
- In demo mode only, choose **Reset demo** to clear that browser's fictional sample workspace and restore samples.

An export is a convenience file, not an encrypted backup service. Store it carefully. The app never caches authenticated financial API responses in its offline service-worker cache.

## Access from another device

1. On the other phone, tablet, or computer, open https://finmate-ai-78a4.vercel.app/ in a modern browser.
2. Sign in with the **same account** to use the private cloud workspace.
3. Wait for the workspace to load before adding or editing records.

The same signed-in account is intended to load its Supabase-backed data across supported devices. The fictional demo is different: it is only stored in the browser where it was opened.

## Install FinMate as a PWA

FinMate includes a web-app manifest, icons, service-worker registration, and an offline navigation page. Installation availability depends on the browser and operating system.

### Android (Chrome or Edge)

1. Open the HTTPS live website.
2. Open the browser menu.
3. Choose **Install app** or **Add to Home screen**.
4. Confirm. FinMate opens like an app from the home screen.

### iPhone and iPad (Safari)

1. Open the live website in Safari.
2. Tap **Share**.
3. Select **Add to Home Screen**.
4. Give it a name if desired, then select **Add**.

### Windows, macOS, Linux, Chromebook

1. Open the HTTPS live website in a compatible Chromium browser such as Chrome or Edge.
2. Use the install icon in the address bar, or open the menu and choose **Install FinMate AI** / **Install app**.

PWA installation does not turn FinMate into an App Store or Play Store app. Offline mode is intentionally limited to the public app shell and offline page; it is not a way to access cloud financial data without a connection.

## FAQ and troubleshooting

### Why am I seeing “FICTIONAL DEMO”?

You opened demo mode, which is intentionally available without an account. It is safe for exploring. To use private cloud data, sign in and open `/app` without `?demo=1`.

### Why does `/app` send me to sign in?

When cloud configuration is active, `/app` protects the private workspace. Sign in, or use **Explore fictional demo** for the labelled demo.

### A cloud save did not complete. What should I do?

Check the internet connection, remain signed in, refresh after the connection returns, and retry the change. The interface shows a message if a queued cloud save fails.

### Why does the assistant say “Rules-based fallback”?

That is expected when no optional provider key is configured, the provider is unavailable, or a request is rate-limited. Your finance dashboard continues to work.

### Is my demo data private cloud data?

No. Demo data is fictional and browser-local. Do not put real sensitive financial records into the demo if you need cloud backup, cross-device access, or account protection.

### Can FinMate give financial advice?

No. It provides calculations, planning views, and explanations based on recorded data. The forecast is an estimate, not a guarantee.

## Known limitations

- A complete end-to-end sign-up and two-user RLS test should be performed with ordinary test accounts before relying on a new production configuration.
- Optional generative AI requires a separately configured server-side `OPENAI_API_KEY`; it is not required for the rules-based assistant.
- The app does not connect to banks, cards, or payment processors. All records are entered by the user.
- No custom domain is configured in this guide; the verified Vercel HTTPS URL is used.
