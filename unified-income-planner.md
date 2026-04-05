# Unified Income Planner — User Story for Cursor

## This replaces ALL previous budget planning documents. One system, one flow.

---

## THE IDEA

Income is one number. Everything comes from it — groceries, rent, fuel, sending money home, emergency fund, investing. Today budgets and goals are separate systems. That's wrong. They should be ONE plan flowing from ONE income.

```
$1,669 income
  │
  ├── SPENDING ─── Groceries $180
  │                Dining $120
  │                Car & Fuel $185
  │                Utilities $300
  │                Housing $500
  │                Shopping $80
  │                Entertainment $60
  │
  ├── GOALS ────── Send Home $200
  │                Emergency Fund $275
  │                Invest $100
  │
  └── BUFFER ───── $169 (what's left)
```

The user sets up this ENTIRE plan from one screen. Not budgets on one page, goals on another. One plan. One income. Everything allocated.

---

## User Story 1: Plan my entire month from my income

As a user, I want to start with my income and allocate EVERY dollar — some to spending categories, some to goals, some as buffer. One flow, one screen, one plan.

### The Monthly Planner Flow:

**Entry point:** Budget page → "Plan this month" (for new month) or "Adjust plan" (for existing)

**Step 1: Income**

```
┌─────────────────────────────────────────────────────┐
│ 📅 April 2026 — Monthly Plan                        │
│                                                      │
│ Monthly Income                                       │
│ [$1,669.00                    ]  [$ ▼]              │
│                                                      │
│ (Pre-filled from last month's income transactions.   │
│  Edit if it changed.)                                │
│                                                      │
│                              [Next: Allocate →]      │
└─────────────────────────────────────────────────────┘
```

**Step 2: Allocate — The One Screen**

This is the core screen. Income at the top. Every allocation below. Remaining updates live as user adjusts.

```
┌─────────────────────────────────────────────────────┐
│ April 2026                    Income: $1,669.00      │
│                                                      │
│ ════════════════════════════════════════════════════ │
│ SPENDING                              Total: $1,125  │
│ ════════════════════════════════════════════════════ │
│                                                      │
│ 🥗 Groceries        [$180 ]  Mar actual: $190       │
│    ██████████████░░░░░  Split $150 · Personal $40   │
│                                                      │
│ 🍕 Dining Out       [$120 ]  Mar actual: $155  ↓    │
│    ████████████░░░░░░░  "Trimmed — March was high"  │
│                                                      │
│ 🚗 Car & Fuel       [$185 ]  Mar actual: $185  =    │
│    █████████████████░░                               │
│                                                      │
│ ⚡ Utilities        [$300 ]  Mar actual: $280  ↑    │
│    ██████████████████████░  "Buffer for bill swings" │
│                                                      │
│ 🏠 Housing          [$500 ]  Mar actual: $500  =    │
│    ██████████████████████████████████████████████    │
│                                                      │
│ 🛒 Shopping         [$80  ]  Mar actual: $95   ↓    │
│    ████████░░░░░░░░░░                                │
│                                                      │
│ 🎬 Entertainment    [$60  ]  Mar actual: $31   ↑    │
│    ██████░░░░░░░░░░░  "Room for a normal month"     │
│                                                      │
│               [+ Add spending category]              │
│                                                      │
│ ════════════════════════════════════════════════════ │
│ GOALS                                 Total: $675    │
│ ════════════════════════════════════════════════════ │
│                                                      │
│ 🇮🇳 Send Home        [$200 ]  Monthly · via Wise     │
│ 🛡️ Emergency Fund   [$275 ]  $6,975 of $10,000     │
│ 📈 Invest           [$100 ]  Monthly target          │
│ ✈️ Travel Home      [$100 ]  ₹70K of ₹2L            │
│                                                      │
│               [+ Add goal]                           │
│                                                      │
│ ════════════════════════════════════════════════════ │
│ SUMMARY                                              │
│ ════════════════════════════════════════════════════ │
│                                                      │
│ Income:          $1,669.00                           │
│ Spending:       -$1,125.00                           │
│ Goals:            -$675.00                           │
│ ───────────────────────────                          │
│ Buffer:          -$131.00  ⚠️                        │
│                                                      │
│ ⚠️ You're $131 over your income.                     │
│                                                      │
│ Quick fixes:                                         │
│ • Trim Dining $120 → $100 (saves $20)               │
│ • Trim Shopping $80 → $60 (saves $20)               │
│ • Skip Travel this month (saves $100)               │
│                   [Apply suggestions] [I'll adjust]  │
│                                                      │
│ ════════════════════════════════════════════════════ │
│                                                      │
│              [Save Plan for April]                   │
└─────────────────────────────────────────────────────┘
```

### How Every Number Works:

**Spending amounts** — Pre-filled from AI prediction (last 3 months average). Each row is editable. Each shows last month's actual for comparison. Arrows show ↑ increase ↓ decrease = same from last month.

**Goal amounts** — Pre-filled from existing goal monthly targets. Editable here too. Changing the amount here updates the goal's monthly target.

**Buffer** — Auto-calculated: Income − Spending − Goals. This is NOT a category the user sets. It's what's left over.
- Positive buffer (green): "You have $169 cushion. Nice."
- Zero buffer (amber): "Every dollar is allocated. No room for surprises."
- Negative buffer (coral): "You're $131 over income." + AI quick fix suggestions.

**The progress bars** — Show proportional allocation. Each bar represents that category's share of total income. Visual way to see where the money goes.

**Live updating** — When user changes any number, the summary recalculates instantly. Change Groceries from $180 to $150 → Buffer goes from -$131 to -$101 → still over, but less.

---

## User Story 2: Smart split — I just want to set a total for spending

As a user, instead of setting each category one by one, I want to say "I want to spend $600 on living expenses" and have the AI divide it across categories based on my actual patterns.

### "Smart Split" Option:

At the top of the SPENDING section, add a toggle:

```
SPENDING          [Set each category]  [Smart split a total]
```

When "Smart split" is selected:

```
┌─────────────────────────────────────────────────────┐
│ How much total for spending this month?              │
│ [$600                         ]                      │
│                                                      │
│ Based on your March spending patterns:               │
│                                                      │
│ 🥗 Groceries         $180  (30%)   [edit]           │
│    You spent $190 in March                           │
│ 🍕 Dining Out        $108  (18%)   [edit]           │
│    You spent $155 — I've trimmed this               │
│ 🚗 Car & Fuel        $102  (17%)   [edit]           │
│    You spent $185 — trimmed proportionally           │
│ ⚡ Utilities          $84   (14%)   [edit]           │
│ 🛒 Shopping          $66   (11%)   [edit]           │
│ 🎬 Entertainment     $60   (10%)   [edit]           │
│                                                      │
│ Total: $600.00 ✅                                    │
│                                                      │
│ ⚠️ This is $535 less than March spending ($1,135).   │
│ Biggest cuts: Housing not included, Utilities halved.│
│ "Is housing covered by someone else this month, or   │
│  should I add it back?"                              │
│                                                      │
│ [Apply split]  [Add more categories]                 │
└─────────────────────────────────────────────────────┘
```

**Smart split logic:**
```ts
function smartSplit(totalBudget: number, spendingHistory: CategorySpend[]) {
  // 1. Get last 3 months spending per category
  // 2. Calculate each category's % of total spending
  // 3. Apply percentages to the user's desired total
  // 4. Round to nearest $5 or ₹50
  // 5. Adjust last category so sum = exact total
  // 6. If any category gets < $10, merge into "Other"
  
  return categories.map(cat => ({
    category: cat.name,
    amount: Math.round((cat.percent * totalBudget) / 5) * 5,
    lastMonth: cat.lastMonthActual,
    difference: amount - cat.lastMonthActual
  }));
}
```

**When user edits one category:**
- Other categories adjust proportionally to keep the total at $600
- Or freed amount goes to an "Unallocated" row that the user can assign
- Total always equals what the user entered

---

## User Story 3: Goals and spending planned together from income

As a user, when I set goals, they should subtract from the same income as spending. If I set $675 in goals and $1,125 in spending against $1,669 income, I need to see that math LIVE on the same screen.

### This is already handled in the one-screen planner above. But the key behaviors:

**Goals affect spending room:**
When user increases Emergency Fund from $275 → $400:
- Goals total: $675 → $800
- Buffer: -$131 → -$256
- AI: "That's an extra $125 to Emergency Fund. To make this work, trim Dining to $80 and skip Travel this month?"

**Spending affects goal room:**
When user increases Dining from $120 → $200:
- Spending total: $1,125 → $1,205
- Buffer: -$131 → -$211
- AI: "Extra $80 on dining. Your Travel goal would need to pause this month to balance."

**The AI is the mediator.** It sees both sides and suggests trades:
- "You can have $200 dining OR $100 travel this month. Not both. Which matters more in April?"
- "If you trim 3 categories by $15 each ($45 total), you can keep both dining AND travel."

---

## User Story 4: The plan rolls forward every month

As a user, I don't want to build a plan from scratch every month. Last month's plan should roll forward with smart adjustments.

### Auto-Generated Next Month Plan:

**On the last 2 days of the month (or first visit of new month):**

Dashboard shows:

```
┌─────────────────────────────────────────────────────┐
│ 📅 Your April plan is ready                          │
│                                                      │
│ Based on March, I've drafted your April budget.      │
│ 2 changes from last month:                           │
│                                                      │
│ 🍕 Dining $120 → $100  (March was a spike)          │
│ ⚡ Utilities $300 → $320 (trending up for summer)    │
│                                                      │
│ Everything else: same as March ✅                     │
│                                                      │
│ [Review Full Plan] [Accept & Go]                     │
└─────────────────────────────────────────────────────┘
```

**"Accept & Go"** — applies the plan immediately. For users who trust the system.

**"Review Full Plan"** — opens the full planner screen for tweaking.

**If not reviewed by the 3rd of the month:**
- Auto-apply last month's plan with AI adjustments
- Notify: "I've set your April budget based on March. Tap to adjust anytime."

### Month-Over-Month Learning:

```
Month 1: User plans everything manually
Month 2: AI pre-fills from Month 1, user adjusts a few things
Month 3: AI only highlights 2-3 changes, user taps "Accept"
Month 4+: "Accept & Go" becomes the default — takes 5 seconds
```

The goal: budgeting should take 5 seconds by month 4, not 15 minutes.

---

## User Story 5: Past month review shows the full picture

As a user, when I look at a past month, I want to see my ENTIRE plan — spending AND goals — and how reality compared.

### Past Month Review:

```
┌─────────────────────────────────────────────────────┐
│ 📋 March 2026 Review                                 │
│                                                      │
│ Income: $1,669                                       │
│                                                      │
│ SPENDING                    Planned    Actual         │
│ 🥗 Groceries                $180      $190    🟡 +$10│
│ 🍕 Dining Out               $120      $155    🔴 +$35│
│ 🚗 Car & Fuel               $185      $185    🟢  $0 │
│ ⚡ Utilities                $300      $280    🟢 -$20│
│ 🏠 Housing                  $500      $500    🟢  $0 │
│ 🛒 Shopping                 $80       $95     🟡 +$15│
│ 🎬 Entertainment            $60       $31     🟢 -$29│
│ ────────────────────────────────────────────────     │
│ Spending total:             $1,425    $1,436   +$11  │
│                                                      │
│ GOALS                       Planned    Actual         │
│ 🇮🇳 Send Home               $200      $200    🟢 ✅  │
│ 🛡️ Emergency Fund          $275      $275    🟢 ✅  │
│ 📈 Invest                   $100      $0      🔴 ❌  │
│ ✈️ Travel Home              $100      $0      🔴 ❌  │
│ ────────────────────────────────────────────────     │
│ Goals total:                $675      $475     -$200 │
│                                                      │
│ RESULT                                               │
│ Income:                     $1,669                   │
│ Spent:                      $1,436                   │
│ Saved (goals):              $475                     │
│ Unaccounted:                -$242                    │
│                                                      │
│ 💡 "You skipped Invest and Travel goals but           │
│     overspent on Dining by $35. The $242 gap is      │
│     money that left your account without a plan.      │
│     April's plan accounts for this."                  │
│                                                      │
│ Budget accuracy: 5/7 spending on track, 2/4 goals hit│
│ Score: 64% → improving from 57% in February          │
└─────────────────────────────────────────────────────┘
```

**"Unaccounted"** is the money that wasn't budgeted or planned for goals but still got spent. This is the leakage the AI helps fix over time.

---

## User Story 6: The budget page layout

As a user, the budget page should show my ACTIVE plan for the current month — spending AND goals unified — with easy access to plan, review past months, and plan future months.

### Budget Page Layout:

```
┌─────────────────────────────────────────────────────┐
│ [← Mar]    APRIL 2026    [May →]     [Plan Month]  │
│            Mode: Active                              │
│                                                      │
│ ┌─────────────────────────────────────────────────┐ │
│ │ TODAY: $52.30 / day                              │ │
│ │ $523 remaining · 10 days left                    │ │
│ └─────────────────────────────────────────────────┘ │
│                                                      │
│ INCOME: $1,669                                       │
│                                                      │
│ ═══ SPENDING ($1,125 planned) ═══════════════════   │
│                                                      │
│ 🥗 Groceries        $120/$180  ██████████░░░░  67%  │
│    Split $90 · Personal $30                          │
│ 🍕 Dining Out       $85/$120   ███████████░░░  71%  │
│ 🚗 Car & Fuel       $100/$185  ████████░░░░░░  54%  │
│ ⚡ Utilities        $0/$300    ░░░░░░░░░░░░░░  0%   │
│    "Cwlp bill usually hits around the 18th"          │
│ 🏠 Housing          $500/$500  ██████████████  100% ✅│
│ 🛒 Shopping         $22/$80   ████░░░░░░░░░░  28%  │
│ 🎬 Entertainment    $15/$60   ███░░░░░░░░░░░  25%  │
│                                                      │
│ ═══ GOALS ($675 planned) ═══════════════════════    │
│                                                      │
│ 🇮🇳 Send Home        $200/$200  ██████████████  ✅   │
│    Sent Mar 15 via Wise                              │
│ 🛡️ Emergency Fund   $275/$275  ██████████████  ✅   │
│ 📈 Invest           $0/$100    ░░░░░░░░░░░░░░  0%  │
│                                      [Contribute]    │
│ ✈️ Travel Home      $0/$100    ░░░░░░░░░░░░░░  0%  │
│                                      [Contribute]    │
│                                                      │
│ ═══ SUMMARY ════════════════════════════════════    │
│                                                      │
│ Spent:    $842 of $1,125                             │
│ Goals:    $475 of $675                               │
│ Buffer:   $169 remaining                             │
│                                                      │
│ [Month Review] [View Trends]                         │
└─────────────────────────────────────────────────────┘
```

---

## Schema Changes

```sql
-- Monthly plans (one per user per month, stores the full allocation)
CREATE TABLE monthly_plans (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  month           DATE NOT NULL,              -- first day of month
  income          DECIMAL(12,2) NOT NULL,
  total_spending  DECIMAL(12,2) DEFAULT 0,    -- sum of all budget allocations
  total_goals     DECIMAL(12,2) DEFAULT 0,    -- sum of all goal allocations
  buffer          DECIMAL(12,2) DEFAULT 0,    -- income - spending - goals
  status          TEXT DEFAULT 'draft' 
    CHECK (status IN ('draft', 'active', 'reviewed')),
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, month)
);

-- Monthly budget snapshots (end-of-month actual vs planned)
CREATE TABLE monthly_snapshots (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  month           DATE NOT NULL,
  category_id     UUID REFERENCES categories(id),
  goal_id         UUID REFERENCES savings_goals(id),
  type            TEXT NOT NULL CHECK (type IN ('spending', 'goal')),
  planned         DECIMAL(12,2) DEFAULT 0,
  actual          DECIMAL(12,2) DEFAULT 0,
  split_portion   DECIMAL(12,2) DEFAULT 0,
  personal_portion DECIMAL(12,2) DEFAULT 0,
  status          TEXT CHECK (status IN ('on_track', 'over', 'under', 'missed')),
  created_at      TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, month, category_id, goal_id)
);

-- Planned known expenses (insurance renewal, annual subs, trips)
CREATE TABLE planned_expenses (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  amount      DECIMAL(12,2) NOT NULL,
  currency    TEXT NOT NULL CHECK (currency IN ('USD', 'INR')),
  category_id UUID REFERENCES categories(id),
  planned_date DATE NOT NULL,
  recurrence  TEXT CHECK (recurrence IN ('monthly', 'quarterly', 'yearly', NULL)),
  is_completed BOOLEAN DEFAULT false,
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- RLS for all new tables
ALTER TABLE monthly_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE monthly_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE planned_expenses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Own data" ON monthly_plans FOR ALL USING (user_id = auth.uid());
CREATE POLICY "Own data" ON monthly_snapshots FOR ALL USING (user_id = auth.uid());
CREATE POLICY "Own data" ON planned_expenses FOR ALL USING (user_id = auth.uid());
```

---

## Acceptance Criteria

### Unified Planner
- [ ] One screen shows income, all spending categories, all goals, and buffer
- [ ] Income pre-filled from last month (editable)
- [ ] Spending categories pre-filled from AI prediction (editable)
- [ ] Goals pre-filled from existing goal monthly targets (editable)
- [ ] Buffer auto-calculates: income − spending − goals
- [ ] Buffer shows green (positive), amber (zero), coral (negative)
- [ ] When negative: AI suggests specific cuts to balance the plan
- [ ] Changing any number recalculates buffer live
- [ ] "Save Plan" creates/updates `monthly_plans` + individual `budgets` records

### Smart Split
- [ ] "Smart split a total" option: user enters one number, AI divides across categories
- [ ] Split uses last 3 months spending proportions
- [ ] Each row editable — adjusting one proportionally adjusts others
- [ ] Total always equals user's entered amount
- [ ] If no history: equal split with manual adjust

### Goals in the Plan
- [ ] Goal amounts are part of the same planner screen as spending
- [ ] Changing a goal amount updates the buffer instantly
- [ ] AI mediates when goals + spending exceed income
- [ ] Goal monthly targets update when changed in the planner
- [ ] Send Home goal links to remittances
- [ ] Other goals have "Contribute" quick action

### Monthly Rollover
- [ ] Last 2 days of month: auto-generate next month draft plan
- [ ] Draft pre-fills from last month with AI adjustments
- [ ] After 3+ months: planning card only shows changes, not full plan
- [ ] "Accept & Go" applies instantly for trusting users
- [ ] Auto-apply by 3rd of month if not reviewed
- [ ] Dashboard card notifies user when draft is ready

### Past Month Review
- [ ] Month navigator: swipe to past months
- [ ] Review shows planned vs actual for EVERY spending category AND goal
- [ ] "Unaccounted" money calculated and shown
- [ ] Budget accuracy score (% of categories + goals on track)
- [ ] Score trend visible across months

### AI Integration
- [ ] AI coach context includes: current plan, buffer status, goal progress, past trends
- [ ] AI suggests cuts when plan exceeds income
- [ ] AI suggests trades: "Skip travel OR trim dining — which matters more?"
- [ ] AI references past months: "Dining has been over 3 months — increase budget?"
- [ ] Monthly review AI summary explains what happened and what to change
