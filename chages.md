Splitwise connection is successful not retirving the groups the user have 
split wise documentation 

Home
 
 Ai charu 
 
API keys and OAuth details for “Numo Finance”
Consumer Key
umjoeq3cF8vrwXqfqPHMgQFSVe2h5UZQkye0c59w

Consumer Secret
VVEmary1Vbm4mtTJ2CiD1esaHBbqu2Uu3q3Kk8db

API keys

Your API key: glsjTbA6nIKXoEi1fjCNrK37ORTRVdEuJF62bmfz
To use this key, provide it as a Bearer token in the Authorization header when making requests to the Splitwise API.



OAuth 1.0

Request Token URL
https://secure.splitwise.com/oauth/request_token

Access Token URL
https://secure.splitwise.com/oauth/access_token

Authorize URL
https://secure.splitwise.com/oauth/authorize


OAuth 2.0

Token URL
https://secure.splitwise.com/oauth/token

Authorize URL
https://secure.splitwise.com/oauth/authorize


Please use hmac-sha1 to sign your OAuth requests.
If you have any questions, check out our API docs, or send us an email at support@splitwise.com!


Edit application | Back

 
Made with ☻ in Providence, RI, USA
Copyright © 2026 Splitwise, Inc. All rights reserved.
About | Jobs | Calculators | Blog | Terms | Press | API | Contact us


-- recurring make it daily,weekly, biweekly, monthly and its white so hard to see the drop down


--> while adding budget user should be able to put custom labels, same with transaction too

--> nice to have if user can see their money in bank and suggest this much is remaing to set budget of help the person while setting budget 

there was no onbarding it was just useremail,password and confirm password

rest looks clean and simple 
ebility to edit the budget 


new changes
# Feature: Split Expenses ↔ Transactions Integration

## User Story 1: My share of split expenses should appear as transactions

As a user, when a split expense is added to a group (either manually or synced from Splitwise), I want my NET share to automatically appear as a transaction on my Transactions page, so that my budget tracking and spending reports are accurate and include shared expenses.

### Why this matters
If I go to dinner for ₹3,000 split 3 ways, my real spend is ₹1,000. If this doesn't show in Transactions, my monthly spending report is wrong — it's missing real money I spent. But I don't want to see all 3 people's shares cluttering my transaction list. Just mine.

### Expected Behavior

**When a split expense is created (manual or Splitwise sync):**
1. Calculate the current user's share based on the split method
2. Auto-create ONE transaction in the `transactions` table with:
   - `amount`: user's share only (NOT the total expense)
   - `type`: 'expense'
   - `currency`: same as the split expense currency
   - `category_id`: use the "Family/Remittance" category by default, or let user pick
   - `note`: `"{description} (Split: {group_name})"`
   - `account_id`: user's default account (or let them pick)
   - `transaction_date`: same as the split expense date
   - `source`: 'split' (NEW FIELD — to distinguish from manual transactions)
   - `split_expense_id`: reference to the split expense (NEW FIELD — for linking)

**Example:**
```
Split expense: "Dinner at Bombay Grill" — ₹3,000 total, 3-way equal split
  ↓
Auto-created transaction on user's Transactions page:
  Amount: ₹1,000
  Note: "Dinner at Bombay Grill (Split: Apartment)"
  Category: Food & Dining
  Source badge: "Split" pill in a distinct color
```

**When a split expense is deleted:**
- Delete the corresponding auto-created transaction too

**When a split expense amount is updated:**
- Update the corresponding transaction amount to reflect the new share

### What NOT to do
- Do NOT create transactions for other members' shares — only the logged-in user's share
- Do NOT double-count: if a Splitwise expense syncs and a transaction already exists (matched by `split_expense_id`), update it instead of creating a duplicate
- Do NOT auto-create a transaction if the user PAID the full amount — in that case, the user already has a real expense. Only create for the share they OWE, not what they paid.

### Transaction Logic Matrix

| Scenario | Transaction created? | Amount |
|---|---|---|
| I paid ₹3,000, split 3 ways | YES — but only ₹1,000 (my share) | ₹1,000 |
| Rahul paid ₹3,000, split 3 ways | YES — ₹1,000 (my share, I owe this) | ₹1,000 |
| I paid ₹3,000, NOT split (100% mine) | YES — ₹3,000 (full amount is my expense) | ₹3,000 |

**Important clarification:** The transaction represents "how much this cost ME" regardless of who paid. This is the budget-tracking view. Who owes whom is handled by the debts system on the Split page.

---

## User Story 2: I need to clearly see WHO I owe and WHO owes me

As a user, when I have outstanding debts from split expenses, I want to see clear, actionable cards showing exactly who I need to pay and who needs to pay me, so I can settle up without confusion.

### Expected Behavior on the Split Page (`/split`)

**Debt Summary Banner (top of page):**
```
┌─────────────────────────────────────────────┐
│  You owe          │  You're owed            │
│  ₹3,200    🔴     │  ₹1,500    🟢           │
│                   │                         │
│  Net: You owe ₹1,700                        │
└─────────────────────────────────────────────┘
```

**Per-Person Debt Cards (below summary):**
Show individual debt cards OUTSIDE of groups — a flattened "who do I owe" view:

```
┌─────────────────────────────────────────────┐
│  👤 Rahul                                    │
│  You owe ₹2,200                    [Pay →]  │
│  From: Apartment, Goa Trip                   │
│  ─────────────────────────────────────────── │
│  👤 Priya                                    │
│  Owes you ₹1,500                  [Remind]  │
│  From: Office Lunch                          │
│  ─────────────────────────────────────────── │
│  👤 Jake                                     │
│  You owe ₹1,000                    [Pay →]  │
│  From: Apartment                             │
└─────────────────────────────────────────────┘
```

**Each person card shows:**
- Person's name + avatar/initials
- Net amount (aggregated across ALL groups involving this person)
- Direction: "You owe" in `#ffb4ab` (coral) or "Owes you" in `#4edea3` (green)
- Which group(s) the debt comes from
- Action button: **[Pay →]** if you owe them, **[Remind]** if they owe you

**"Pay" action:**
- Opens a modal: "Record payment to {name}"
- Amount field (pre-filled with total owed)
- Creates a settlement record in `settlements` table
- Reduces the debt in `debts` table
- Shows confirmation: "Settled ₹2,200 with Rahul ✓"

**"Remind" action (v1 = simple):**
- Copies a pre-written message to clipboard: "Hey {name}! You owe me ₹{amount} from {group_name} on Numo. Can you settle up?"
- Toast: "Message copied — paste it in WhatsApp/iMessage"
- (v2: send via email or push notification)

---

## User Story 3: Split-sourced transactions should be visually distinct

As a user, when I view my Transactions page, I want split-sourced transactions to be visually different from manual transactions, so I can tell at a glance which expenses came from shared bills vs personal spending.

### Expected Behavior on Transactions Page

**Split-sourced transaction row:**
```
┌─────────────────────────────────────────────┐
│  🍕 Dinner at Bombay Grill       - ₹1,000  │
│  Food & Dining · Chase Checking             │
│  [Split: Apartment]  ← distinct pill badge  │
└─────────────────────────────────────────────┘
```

**Visual treatment:**
- Small pill badge: "Split: {group_name}" in `#b0c6ff` at 20% opacity with `#b0c6ff` text
- Clicking the pill navigates to that split group's detail page
- The transaction is editable (user can change category, account) but the amount is locked to their share — editing the amount requires editing the split expense itself
- In transaction filters, add a new filter chip: "Source" → "All" / "Manual" / "Split"

---


## Acceptance Criteria

### Transactions Integration
- [ ] When a split expense is created, a transaction is auto-created for the user's share only
- [ ] Transaction note includes expense description + group name
- [ ] Split-sourced transactions have a `source = 'split'` field
- [ ] Split-sourced transactions show a "Split: {group}" pill badge on the Transactions page
- [ ] Clicking the pill navigates to the split group detail page
- [ ] Deleting a split expense deletes the corresponding transaction
- [ ] Splitwise synced expenses also create transactions (no duplicates on re-sync)
- [ ] Filter chip on Transactions page: "Source" → All / Manual / Split
- [ ] Split transactions count toward budget tracking and monthly spending reports
- [ ] Amount on split transactions is locked — editing requires editing the split expense

### Person-Level Debts
- [ ] Split page shows per-person debt cards aggregated across all groups
- [ ] "You owe" amounts shown in `#ffb4ab`, "Owes you" in `#4edea3`
- [ ] Each card shows which group(s) the debt comes from
- [ ] [Pay →] button opens settlement modal with pre-filled amount
- [ ] Settlement reduces debt and shows confirmation
- [ ] [Remind] button copies a pre-written settlement request message to clipboard
- [ ] Debt summary banner shows total owed, total owed to user, and net balance

### Edge Cases
- [ ] If user paid the full amount AND it's split, transaction = their share only (not full amount)
- [ ] If split expense currency differs from user's primary currency, convert the share amount
- [ ] If a person appears in multiple groups, debts are aggregated into one card
- [ ] If all debts with a person are settled (net = 0), hide their card


new changes requiredd
so the user and group member need to be differentiated 
so the math is wrong 