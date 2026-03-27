# numo.

**Your money, both worlds, one app.**

Numo is a dual-currency budgeting web app for young professionals managing finances across INR and USD. Built for the 22-30 year old immigrant who sends money home, splits rent with roommates, and wants an AI coach that talks like a friend — not a banker.

## Features

- **Dual-Currency Native** — Track, categorize, and report in INR and USD simultaneously
- **Multi-Account Management** — Bank accounts, credit cards, digital wallets, crypto — all in one place
- **Transaction Tracking** — Log expenses and income with categories, search, filters (including category filters), and recurring support
- **Custom Categories** — Create your own expense/income categories with colors and icons; keyword mappings learn from your edits
- **Budgets** — Set monthly spending limits per category with visual progress (green → amber → coral)
- **Savings Goals** — Visual progress rings, preset templates, contribution tracking, goal-at-risk alerts
- **Remittance Tracker** — Track money sent between countries with exchange rate history
- **Bill Splitting** — Create groups, split expenses, settle up, **Splitwise OAuth sync**, and push new expenses to Splitwise for linked groups
- **AI Coach** — Conversational budgeting assistant powered by Groq (llama-3.3-70b-versatile)
- **AI Nudges** — Daily proactive insights on your dashboard, specific to your numbers
- **1% Magic Calculator** — See how small savings compound over time
- **CSV Export** — Download your transaction history anytime

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 14 (App Router) |
| Language | TypeScript |
| Styling | Tailwind CSS (dark obsidian theme, glass-morphism) |
| Client State | Zustand |
| Server State | TanStack React Query |
| Database | Supabase (Postgres + Row Level Security) |
| Auth | Supabase Auth (email/password + Google OAuth) |
| AI | Groq API (llama-3.3-70b-versatile) |
| Charts | Recharts |
| Icons | Lucide React |
| Integrations | Splitwise OAuth 2.0, Exchange Rate API |

## Getting Started

### Prerequisites

- Node.js 18+
- A [Supabase](https://supabase.com) project
- A [Groq](https://console.groq.com) API key (free tier)
- (Optional) A [Splitwise](https://secure.splitwise.com/apps) developer app

### 1. Install dependencies

```bash
npm install
```

### 2. Set up environment variables

Copy the example file and fill in your keys:

```bash
cp .env.local.example .env.local
```

Required variables:

```
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
GROQ_API_KEY=your_groq_api_key
SPLITWISE_CLIENT_ID=your_splitwise_consumer_key
SPLITWISE_CLIENT_SECRET=your_splitwise_consumer_secret
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

Optional:

- `SPLITWISE_API_KEY` — Splitwise API key (used if no user OAuth token); omit for OAuth-only.

### 3. Create database tables

1. Go to your Supabase project dashboard
2. Open the **SQL Editor**
3. Paste the contents of `supabase/schema.sql`
4. Click **Run**

This creates the core tables, indexes, RLS policies, and the auto-profile trigger.

### 4. Apply incremental migrations

After the base schema, run these in the SQL Editor **in order** (each file is idempotent where noted):

| File | Purpose |
|------|---------|
| `supabase/migration_custom_categories.sql` | `custom_categories` and `category_mappings` tables + RLS |
| `supabase/migration_split_transactions.sql` | Split ↔ transactions, Splitwise IDs, `profiles.default_account_id`, sync timestamp |
| `supabase/migration_splitwise_settlements.sql` | `split_settlements.splitwise_expense_id` + optional cleanup of old bad rows |
| `supabase/migration_split_groups_simplified_debts.sql` | `split_groups.simplified_debts` (canonical Splitwise balances) |

Alternatively, run the single consolidated script **`supabase/migration_consolidated_all.sql`** once (additive schema only; optional data cleanup is commented at the bottom).

### 5. Configure Splitwise (optional)

1. Go to https://secure.splitwise.com/apps
2. Create or edit your app
3. Set the callback URL to `http://localhost:3000/api/splitwise/callback` (or your deployed URL + `/api/splitwise/callback`)

**Behavior summary:** Debts for Splitwise-linked groups use **`simplified_debts`** from Splitwise (`GET /get_groups`), not a sum of local history. Regular shared expenses still sync into Numo and can create **your-share** transactions. Payment / “settle all balances” rows are stored as **settlements**, not as spending transactions. Adding an expense in Numo for a linked group can **push** to Splitwise via the API.

### 6. Run the dev server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Project Structure

```
src/
  app/
    (auth)/           # Login, signup, forgot-password, onboarding
    (app)/            # Main app (dashboard, accounts, transactions, budgets, split, etc.)
    api/              # coach, nudge, exchange-rate, splitwise (auth, callback, sync, push-expense), transactions (smart-categorize)
    auth/callback/    # OAuth callback handler
  components/
    ui/               # Reusable primitives (Button, Card, Modal, CategoryPicker, …)
    providers/        # React Query provider
  lib/
    supabase/         # Client, server, and service role clients
    hooks/            # Custom React hooks (accounts, categories, …)
    stores/           # Zustand stores
    constants.ts      # Categories, templates, enums
    splitwise-debts.ts
    splitwise-settlement.ts
    smart-categorize.ts
    utils.ts          # Formatters, currency helpers
  middleware.ts       # Auth route protection
supabase/
  schema.sql                    # Full baseline schema
  migration_*.sql               # Incremental migrations
  migration_consolidated_all.sql
```

## Database Schema

Core tables (with Row Level Security) include:

`profiles` · `accounts` · `transactions` · `budgets` · `savings_goals` · `goal_contributions` · `remittances` · `split_groups` · `split_members` · `split_expenses` · `split_shares` · `split_settlements` · `custom_categories` · `category_mappings` · `ai_nudges` · `exchange_rates`

## License

MIT
