# Feature: Smart Budgets — AI Observes First, Suggests Later

## The Problem with Current Budget System

Right now the budget page asks the user to manually set a monthly limit per category. This is broken because:
- A first-time budgeter has NO idea what to set
- They don't know how much they actually spend on food, transport, or utilities
- Split expenses (rent, utilities, subscriptions) aren't factored in
- Users either set unrealistic budgets and feel bad, or skip budgets entirely
- The AI coach can't give useful advice without real spending history

## The Fix: Observation Mode → AI Suggestions → Smart Budgets

### Phase 1: Observation Mode (First 30 days)

**User Story:**
As a new user, I don't want to be asked to set budgets on day one because I have no idea what my spending looks like. I want the app to quietly observe my spending for the first month and then suggest realistic budgets based on my actual behavior.

**How it works:**

**Day 1–7: Gentle onboarding**
- Budget page does NOT show empty budget cards with "set a limit" CTAs
- Instead shows an "observation mode" state:

```
┌─────────────────────────────────────────────────────┐
│  🔭  Numo is learning your spending patterns        │
│                                                      │
│  Keep logging transactions for a few weeks.          │
│  I'll suggest budgets that actually make sense       │
│  for YOUR life — not some generic template.          │
│                                                      │
│  ████████░░░░░░░░░░░░  Day 5 of 30                  │
│                                                      │
│  So far I'm seeing:                                  │
│  🍕 Food & Dining     ₹3,200 (5 transactions)       │
│  🚗 Transport         ₹800 (3 transactions)          │
│  ⚡ Utilities          ₹2,000 (1 split expense)      │
│                                                      │
│  Keep going — more data = smarter suggestions!       │
└─────────────────────────────────────────────────────┘
```

**Day 8–29: Building patterns**
- The card updates with running category totals
- AI nudge on dashboard starts giving early observations:
  - "You've spent on food 8 times this week — that's your biggest category so far"
  - "Your apartment split added ₹8,500 in utilities this month"
- User CAN still manually set a budget if they want (small "Set budget manually" link at the bottom) — don't block power users

**Day 30+: AI Budget Suggestion**
- Trigger: user has ≥15 transactions AND ≥25 days since first transaction
- The budget page transforms:

```
┌─────────────────────────────────────────────────────┐
│  🎯  Your first month is in! Here's what I found:   │
│                                                      │
│  Based on your spending in March, here are budgets   │
│  I'd suggest. Tap to accept, adjust, or skip any.   │
│                                                      │
│  ┌───────────────────────────────────────────────┐  │
│  │ 🍕 Food & Dining                              │  │
│  │ You spent: ₹12,400                            │  │
│  │ Suggested budget: ₹12,000/month               │  │
│  │ "Slightly under what you spent — a gentle     │  │
│  │  target to start with"                        │  │
│  │                    [Accept] [Adjust] [Skip]   │  │
│  └───────────────────────────────────────────────┘  │
│                                                      │
│  ┌───────────────────────────────────────────────┐  │
│  │ 🚗 Transport                                  │  │
│  │ You spent: ₹3,500                             │  │
│  │ Suggested budget: ₹3,500/month                │  │
│  │ "Right on track — let's keep it here"         │  │
│  │                    [Accept] [Adjust] [Skip]   │  │
│  └───────────────────────────────────────────────┘  │
│                                                      │
│  ┌───────────────────────────────────────────────┐  │
│  │ ⚡ Utilities (includes splits)                 │  │
│  │ You spent: ₹8,500 (₹6,000 from splits)       │  │
│  │ Suggested budget: ₹9,000/month                │  │
│  │ "Most of this comes from your Apartment       │  │
│  │  split — I've included those automatically"   │  │
│  │                    [Accept] [Adjust] [Skip]   │  │
│  └───────────────────────────────────────────────┘  │
│                                                      │
│             [Accept All Suggestions]                 │
└─────────────────────────────────────────────────────┘
```

### Phase 2: Smart Budget Features (Ongoing)

**User Story:**
As a user with AI-suggested budgets, I want the AI to continuously learn and adapt its recommendations based on my evolving spending, split expenses, and remittances, so my budgets stay realistic over time.

**Monthly Budget Review (AI-initiated):**
- On the 1st of each month, AI generates a "Monthly Review" card on the dashboard:

```
┌─────────────────────────────────────────────────────┐
│  📊  March Budget Review                             │
│                                                      │
│  3 categories on track ✅                            │
│  1 category over budget ⚠️ (Food: ₹14,200 / ₹12,000)│
│  1 category way under 💰 (Entertainment: ₹800 / ₹5,000)│
│                                                      │
│  AI suggestion: "Food has been over budget 2 months  │
│  in a row. Want me to adjust it to ₹13,000? That's   │
│  more realistic for your pattern."                   │
│                                                      │
│  [Adjust Food to ₹13,000]  [Keep Current Budgets]   │
│                                                      │
│  "Also, you're barely using your Entertainment       │
│  budget. Want to move ₹2,000 from Entertainment      │
│  to your Emergency Fund goal?"                       │
│                                                      │
│  [Move ₹2,000 to Goal]  [No Thanks]                 │
└─────────────────────────────────────────────────────┘
```

**Split-Aware Budgeting:**
- When utility bills, rent, or subscriptions come in as split expenses, the AI includes them in the relevant budget category automatically
- The budget card shows a breakdown:

```
┌───────────────────────────────────────────────────┐
│ ⚡ Utilities                    ₹8,500 / ₹9,000   │
│ ████████████████████░░░  94%                       │
│                                                    │
│ Breakdown:                                         │
│   Split: Apartment — Electric    ₹3,000            │
│   Split: Apartment — Internet    ₹1,500            │
│   Split: Apartment — Water       ₹1,500            │
│   Personal: Phone plan           ₹2,500            │
└───────────────────────────────────────────────────┘
```

**Remittance-Aware Budgeting:**
- Remittances are BIG expenses that distort budgets if ignored
- AI treats remittances separately:
  - "You sent ₹20,000 home this month. I've excluded this from your spending categories so your food/transport budgets aren't thrown off."
  - But on the dashboard: "After your ₹20,000 transfer, your remaining budget across all categories is ₹35,000 for the rest of the month."

---

## Implementation Details

### New Database Fields

```sql
-- Track observation mode status
ALTER TABLE profiles ADD COLUMN budget_mode TEXT DEFAULT 'observing' 
  CHECK (budget_mode IN ('observing', 'suggested', 'active'));
ALTER TABLE profiles ADD COLUMN first_transaction_date DATE;
ALTER TABLE profiles ADD COLUMN budget_suggestions_generated BOOLEAN DEFAULT false;

-- Store AI budget suggestions before user accepts
CREATE TABLE budget_suggestions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  category_id     UUID NOT NULL REFERENCES categories(id),
  suggested_limit DECIMAL(12,2) NOT NULL,
  actual_spent    DECIMAL(12,2) NOT NULL,        -- what they spent in observation period
  split_portion   DECIMAL(12,2) DEFAULT 0,       -- how much came from splits
  ai_reasoning    TEXT,                           -- "Slightly under what you spent..."
  status          TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'adjusted', 'skipped')),
  currency        TEXT NOT NULL CHECK (currency IN ('USD', 'INR')),
  month_observed  DATE NOT NULL,                  -- which month was observed
  created_at      TIMESTAMPTZ DEFAULT now()
);

-- RLS
ALTER TABLE budget_suggestions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Own data" ON budget_suggestions FOR ALL USING (user_id = auth.uid());
```

### New API Route: `/api/budget-suggestions/route.ts`

**Trigger conditions (check on budget page load):**
```ts
// Generate suggestions when ALL of these are true:
const shouldSuggest = (
  profile.budget_mode === 'observing' &&
  profile.first_transaction_date !== null &&
  daysSinceFirstTransaction >= 25 &&
  totalTransactionCount >= 15 &&
  !profile.budget_suggestions_generated
);
```

**Suggestion algorithm:**
```ts
async function generateBudgetSuggestions(userId: string) {
  // 1. Get all transactions from the observation period (first month)
  // 2. Group by category, sum amounts
  // 3. INCLUDE split-sourced transactions (source = 'split') in their categories
  // 4. EXCLUDE remittances from category budgets
  
  // 5. For each category with spending:
  const suggestions = categories.map(cat => {
    const spent = totalSpentInCategory;
    const splitPortion = splitSourcedAmount;
    
    // Suggest slightly below actual for categories where they overspend
    // Suggest at actual for stable categories
    // Round to nearest 500 (₹) or 50 ($) for clean numbers
    let suggestedLimit;
    if (spent > medianMonthlySpend * 0.3) {
      // Major category — suggest 95% of actual (gentle reduction target)
      suggestedLimit = roundToNearest(spent * 0.95, currency);
    } else {
      // Minor category — suggest at actual
      suggestedLimit = roundToNearest(spent, currency);
    }
    
    return { category, suggestedLimit, spent, splitPortion };
  });
  
  // 6. Call Groq to generate friendly reasoning for each suggestion
  // 7. Store in budget_suggestions table
  // 8. Update profile: budget_suggestions_generated = true
}
```

**AI reasoning prompt (for Groq):**
```
Given these spending observations for a user's first month, generate a 
short, friendly one-line reason for each budget suggestion. Max 15 words each.

Category: Food & Dining, Spent: ₹12,400, Suggested: ₹12,000
Category: Transport, Spent: ₹3,500, Suggested: ₹3,500
Category: Utilities, Spent: ₹8,500 (₹6,000 from splits), Suggested: ₹9,000

Rules:
- Be specific with numbers
- Mention splits if they're a big portion
- Tone: encouraging, not judgmental
- If suggesting below actual: frame as "gentle target" not "cut back"
- If at actual: "right on track"
- If above actual (giving buffer): explain why (e.g., splits can vary)
```

### Budget Page State Machine

```
┌──────────────┐     25+ days &      ┌──────────────┐     User accepts     ┌──────────────┐
│  OBSERVING   │────15+ txns────────→│  SUGGESTED   │────suggestions──────→│   ACTIVE     │
│              │                      │              │                      │              │
│ Show running │                      │ Show AI      │                      │ Show normal  │
│ category     │                      │ suggestion   │                      │ budget cards │
│ totals with  │                      │ cards with   │                      │ with progress│
│ progress bar │                      │ Accept/Skip  │                      │ bars         │
│ to day 30    │                      │ per category │                      │              │
└──────────────┘                      └──────────────┘                      └──────────────┘
       │                                                                          │
       │  User manually sets                                              Monthly AI review
       │  a budget at any time                                            suggests adjustments
       │         │                                                                │
       └─────────┴──→ Jump straight to ACTIVE for that category ←─────────────────┘
```

### Dashboard AI Nudge — Budget-Mode Aware

The AI nudge prompt should behave differently based on budget mode:

**Observing mode nudges:**
```
"I've tracked 12 transactions so far — keep logging! In about 2 weeks 
I'll have enough data to suggest realistic budgets for you."

"Food is your biggest category so far at ₹6,200 — interesting! 
Let's see how the full month plays out."

"Your apartment split added ₹8,500 to your expenses. Good news: 
I'm tracking this separately so your budgets will be accurate."
```

**Suggested mode nudges:**
```
"Your first month data is ready! Head to Budgets to see what I'd 
recommend based on your actual spending."
```

**Active mode nudges (existing behavior):**
```
"Heads up: you're at 85% of your food budget with 12 days left."
"Your utilities split was ₹500 more than usual this month."
```

---

## Acceptance Criteria

### Observation Mode
- [ ] New users see "Observation Mode" state on the budget page, not empty budget cards
- [ ] Running category totals update as transactions are logged
- [ ] Split-sourced transactions (source='split') are included in category totals
- [ ] Progress indicator shows "Day X of 30"
- [ ] User CAN manually set a budget for any category at any time (small link at bottom)
- [ ] Manually setting a budget for a category switches that category to 'active' immediately
- [ ] `profiles.first_transaction_date` is set when user logs their first transaction
- [ ] AI nudges during observation mode are encouraging and progress-focused

### AI Budget Suggestions
- [ ] Suggestions trigger when: ≥25 days since first transaction AND ≥15 transactions
- [ ] Each suggestion includes: category, actual spent, suggested limit, split portion, AI reasoning
- [ ] Suggested limits are rounded to nearest ₹500 or $50
- [ ] Split-heavy categories (utilities, rent) get a small buffer above actual (5-10%)
- [ ] Remittances are excluded from category suggestions
- [ ] User can Accept, Adjust (edit the number), or Skip each suggestion
- [ ] "Accept All" button sets all suggested budgets at once
- [ ] Accepting a suggestion creates a record in the `budgets` table
- [ ] `profiles.budget_mode` transitions: 'observing' → 'suggested' → 'active'

### Monthly Review
- [ ] On the 1st of each month, AI generates a review card on the dashboard
- [ ] Review shows: categories on track, over budget, under budget
- [ ] If a category has been over budget 2+ months in a row, AI suggests increasing the limit
- [ ] If a category is significantly under budget, AI suggests reallocating to a savings goal
- [ ] User can accept or dismiss each suggestion with one tap

### Split-Aware Budget Display
- [ ] Budget cards show a breakdown: personal vs split-sourced amounts
- [ ] If a split expense matches a budget category, it counts toward that budget
- [ ] AI nudges mention when a split expense impacts a budget ("Your apartment electric bill used 33% of your utilities budget")

### Remittance-Aware
- [ ] Remittances do NOT count toward any category budget
- [ ] Dashboard shows remaining budget AFTER remittances: "After your ₹20K transfer, you have ₹35K left across all budgets"
- [ ] AI coach factors remittances into overall cash flow advice but not category budgets