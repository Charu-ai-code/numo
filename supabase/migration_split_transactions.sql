-- =============================================================================
-- Migration: Split-Transactions Integration
-- Run this in the Supabase SQL editor after the base schema is in place.
-- =============================================================================

-- profiles: default account for auto-created split transactions
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS default_account_id uuid REFERENCES public.accounts(id) ON DELETE SET NULL;

-- profiles: track last Splitwise sync timestamp for incremental fetching
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS splitwise_last_sync timestamptz;

-- transactions: source tracking (manual vs split)
ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS source text DEFAULT 'manual' CHECK (source IN ('manual', 'split'));

ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS split_expense_id uuid REFERENCES public.split_expenses(id) ON DELETE SET NULL;

-- split_expenses: Splitwise dedup key
ALTER TABLE public.split_expenses
  ADD COLUMN IF NOT EXISTS splitwise_expense_id text;

CREATE UNIQUE INDEX IF NOT EXISTS idx_split_expenses_sw_id
  ON public.split_expenses(splitwise_expense_id) WHERE splitwise_expense_id IS NOT NULL;

-- split_members: map to Splitwise user IDs
ALTER TABLE public.split_members
  ADD COLUMN IF NOT EXISTS splitwise_user_id text;

-- Fix pre-existing bug: recurrence check missing 'biweekly'
ALTER TABLE public.transactions DROP CONSTRAINT IF EXISTS transactions_recurrence_check;
ALTER TABLE public.transactions
  ADD CONSTRAINT transactions_recurrence_check CHECK (recurrence IN ('daily', 'weekly', 'biweekly', 'monthly'));
