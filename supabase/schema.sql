-- =============================================================================
-- Numo Finance — Supabase schema
-- Run in SQL editor or via migrations. Requires Supabase (PostgreSQL 15+).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Tables
-- -----------------------------------------------------------------------------

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  display_name text,
  primary_currency text DEFAULT 'USD' CHECK (primary_currency IN ('USD', 'INR')),
  monthly_income numeric,
  rookie_mode boolean DEFAULT true,
  onboarding_completed boolean DEFAULT false,
  splitwise_access_token text,
  splitwise_refresh_token text,
  splitwise_token_expires_at timestamptz,
  weekly_summary_day text DEFAULT 'Sunday',
  avatar_url text,
  budget_mode text DEFAULT 'active'
    CHECK (budget_mode IN ('observing', 'suggested', 'active')),
  budget_observation_started_at timestamptz,
  planned_monthly_remittance numeric,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE public.accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  name text NOT NULL,
  type text NOT NULL CHECK (type IN ('bank', 'credit_card', 'wallet', 'crypto_wallet')),
  currency text NOT NULL DEFAULT 'USD' CHECK (currency IN ('USD', 'INR')),
  initial_balance numeric NOT NULL DEFAULT 0,
  credit_limit numeric,
  payment_due_day smallint CHECK (payment_due_day IS NULL OR (payment_due_day >= 1 AND payment_due_day <= 31)),
  apr numeric,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE public.transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  account_id uuid NOT NULL REFERENCES public.accounts (id) ON DELETE CASCADE,
  amount numeric NOT NULL CHECK (amount > 0),
  currency text NOT NULL CHECK (currency IN ('USD', 'INR')),
  converted_amount numeric,
  type text NOT NULL CHECK (
    type IN ('expense', 'income', 'transfer_out', 'transfer_in')
  ),
  category text NOT NULL,
  note text,
  date date NOT NULL DEFAULT CURRENT_DATE,
  is_recurring boolean DEFAULT false,
  recurrence text CHECK (
    recurrence IS NULL OR recurrence IN ('daily', 'weekly', 'biweekly', 'monthly')
  ),
  source text DEFAULT 'manual' CHECK (source IN ('manual', 'split')),
  linked_transfer_id uuid REFERENCES public.transactions(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE public.budgets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  category text NOT NULL,
  monthly_limit numeric NOT NULL CHECK (monthly_limit > 0),
  currency text NOT NULL DEFAULT 'USD' CHECK (currency IN ('USD', 'INR')),
  created_at timestamptz DEFAULT now(),
  UNIQUE (user_id, category)
);

CREATE TABLE public.recurring_expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  category text NOT NULL,
  label text NOT NULL,
  note_fingerprint text NOT NULL,
  expected_amount numeric NOT NULL CHECK (expected_amount > 0),
  currency text NOT NULL DEFAULT 'USD' CHECK (currency IN ('USD', 'INR')),
  recurrence text NOT NULL DEFAULT 'monthly'
    CHECK (recurrence IN ('daily', 'weekly', 'biweekly', 'monthly')),
  expected_day_of_month smallint
    CHECK (expected_day_of_month IS NULL OR (expected_day_of_month >= 1 AND expected_day_of_month <= 31)),
  source text NOT NULL DEFAULT 'transaction'
    CHECK (source IN ('transaction', 'detected', 'splitwise')),
  template_transaction_id uuid REFERENCES public.transactions (id) ON DELETE SET NULL,
  last_hit_date date,
  is_active boolean NOT NULL DEFAULT true,
  is_paused boolean NOT NULL DEFAULT false,
  paused_until date,
  frequency text NOT NULL DEFAULT 'monthly'
    CHECK (frequency IN ('monthly', 'quarterly', 'yearly')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (user_id, category, note_fingerprint)
);

CREATE INDEX idx_recurring_expenses_user_category
  ON public.recurring_expenses (user_id, category);

ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS recurring_expense_id uuid REFERENCES public.recurring_expenses (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_transactions_recurring_expense_id
  ON public.transactions (recurring_expense_id)
  WHERE recurring_expense_id IS NOT NULL;

CREATE TABLE public.budget_suggestions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  category text NOT NULL,
  suggested_limit numeric NOT NULL CHECK (suggested_limit > 0),
  actual_spent numeric NOT NULL DEFAULT 0,
  split_portion numeric NOT NULL DEFAULT 0,
  personal_portion numeric NOT NULL DEFAULT 0,
  ai_reasoning text,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'accepted', 'adjusted', 'skipped')),
  currency text NOT NULL DEFAULT 'USD' CHECK (currency IN ('USD', 'INR')),
  month_observed date NOT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_budget_suggestions_user_month
  ON public.budget_suggestions (user_id, month_observed DESC);

CREATE TABLE public.savings_goals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  name text NOT NULL,
  icon text DEFAULT 'Target',
  color text DEFAULT '#4edea3',
  target_amount numeric CHECK (target_amount IS NULL OR target_amount > 0),
  current_balance numeric NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'USD' CHECK (currency IN ('USD', 'INR')),
  target_date date,
  is_completed boolean DEFAULT false,
  goal_type text DEFAULT 'custom'
    CHECK (goal_type IN ('send_home', 'emergency', 'travel', 'invest', 'education', 'custom')),
  monthly_target numeric,
  is_recurring boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  CONSTRAINT savings_goals_plan_check CHECK (
    (
      goal_type IN ('send_home', 'invest')
      AND COALESCE(is_recurring, false) = true
      AND monthly_target IS NOT NULL
      AND monthly_target > 0
    )
    OR
    (
      target_amount IS NOT NULL
      AND target_amount > 0
      AND target_date IS NOT NULL
    )
  )
);

CREATE TABLE public.goal_contributions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  goal_id uuid NOT NULL REFERENCES public.savings_goals (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  amount numeric NOT NULL CHECK (amount > 0),
  date date NOT NULL DEFAULT CURRENT_DATE,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE public.remittances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  amount_sent numeric NOT NULL CHECK (amount_sent > 0),
  from_currency text NOT NULL CHECK (from_currency IN ('USD', 'INR')),
  to_currency text NOT NULL CHECK (to_currency IN ('USD', 'INR')),
  exchange_rate numeric NOT NULL,
  amount_received numeric NOT NULL,
  method text NOT NULL,
  recipient_label text NOT NULL,
  date date NOT NULL DEFAULT CURRENT_DATE,
  goal_id uuid REFERENCES public.savings_goals (id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_remittances_goal_id ON public.remittances (goal_id);

CREATE TABLE public.split_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  name text NOT NULL,
  splitwise_group_id text,
  simplified_debts jsonb DEFAULT '[]'::jsonb,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE public.split_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES public.split_groups (id) ON DELETE CASCADE,
  name text NOT NULL,
  email text,
  user_id uuid REFERENCES auth.users (id) ON DELETE SET NULL
);

CREATE TABLE public.split_expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES public.split_groups (id) ON DELETE CASCADE,
  description text NOT NULL,
  amount numeric NOT NULL CHECK (amount > 0),
  currency text NOT NULL DEFAULT 'USD' CHECK (currency IN ('USD', 'INR')),
  paid_by uuid NOT NULL REFERENCES public.split_members (id) ON DELETE CASCADE,
  split_method text NOT NULL DEFAULT 'equal' CHECK (split_method IN ('equal', 'percentage', 'custom')),
  date date NOT NULL DEFAULT CURRENT_DATE,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE public.split_shares (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  expense_id uuid NOT NULL REFERENCES public.split_expenses (id) ON DELETE CASCADE,
  member_id uuid NOT NULL REFERENCES public.split_members (id) ON DELETE CASCADE,
  share_amount numeric NOT NULL
);

CREATE TABLE public.split_settlements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES public.split_groups (id) ON DELETE CASCADE,
  from_member uuid NOT NULL REFERENCES public.split_members (id) ON DELETE CASCADE,
  to_member uuid NOT NULL REFERENCES public.split_members (id) ON DELETE CASCADE,
  amount numeric NOT NULL CHECK (amount > 0),
  currency text NOT NULL DEFAULT 'USD' CHECK (currency IN ('USD', 'INR')),
  date date NOT NULL DEFAULT CURRENT_DATE,
  splitwise_expense_id text
);

CREATE UNIQUE INDEX idx_split_settlements_sw_expense_id ON public.split_settlements (splitwise_expense_id)
  WHERE splitwise_expense_id IS NOT NULL;

CREATE TABLE public.ai_nudges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  content text NOT NULL,
  generated_at timestamptz DEFAULT now()
);

CREATE TABLE public.exchange_rates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_currency text NOT NULL,
  to_currency text NOT NULL,
  rate numeric NOT NULL,
  date date NOT NULL DEFAULT CURRENT_DATE,
  UNIQUE (from_currency, to_currency, date)
);

-- -----------------------------------------------------------------------------
-- Indexes (frequent filters and joins)
-- -----------------------------------------------------------------------------

CREATE INDEX idx_accounts_user_id ON public.accounts (user_id);

CREATE INDEX idx_transactions_user_id_date ON public.transactions (user_id, date DESC);
CREATE INDEX idx_transactions_account_id ON public.transactions (account_id);
CREATE INDEX idx_transactions_user_id ON public.transactions (user_id);

CREATE INDEX idx_transactions_linked_transfer_id ON public.transactions (linked_transfer_id)
  WHERE linked_transfer_id IS NOT NULL;

CREATE INDEX idx_budgets_user_id ON public.budgets (user_id);

CREATE INDEX idx_savings_goals_user_id ON public.savings_goals (user_id);

CREATE INDEX idx_goal_contributions_goal_id ON public.goal_contributions (goal_id);
CREATE INDEX idx_goal_contributions_user_id ON public.goal_contributions (user_id);

CREATE INDEX idx_remittances_user_id ON public.remittances (user_id);
CREATE INDEX idx_remittances_user_id_date ON public.remittances (user_id, date DESC);

CREATE INDEX idx_split_groups_user_id ON public.split_groups (user_id);

CREATE INDEX idx_split_members_group_id ON public.split_members (group_id);

CREATE INDEX idx_split_expenses_group_id ON public.split_expenses (group_id);
CREATE INDEX idx_split_expenses_paid_by ON public.split_expenses (paid_by);

CREATE INDEX idx_split_shares_expense_id ON public.split_shares (expense_id);
CREATE INDEX idx_split_shares_member_id ON public.split_shares (member_id);

CREATE INDEX idx_split_settlements_group_id ON public.split_settlements (group_id);

CREATE INDEX idx_ai_nudges_user_id ON public.ai_nudges (user_id);
CREATE INDEX idx_ai_nudges_user_id_generated_at ON public.ai_nudges (user_id, generated_at DESC);

-- UNIQUE (from_currency, to_currency, date) on exchange_rates supplies an index.

-- -----------------------------------------------------------------------------
-- Row Level Security — enable on all tables
-- -----------------------------------------------------------------------------

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.budgets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recurring_expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.budget_suggestions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.savings_goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.goal_contributions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.remittances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.split_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.split_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.split_expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.split_shares ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.split_settlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_nudges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exchange_rates ENABLE ROW LEVEL SECURITY;

-- -----------------------------------------------------------------------------
-- RLS policies — profiles (ownership via id = auth.uid())
-- -----------------------------------------------------------------------------

CREATE POLICY "profiles_select_own"
  ON public.profiles FOR SELECT TO authenticated
  USING (auth.uid() = id);

CREATE POLICY "profiles_insert_own"
  ON public.profiles FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = id);

CREATE POLICY "profiles_update_own"
  ON public.profiles FOR UPDATE TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

CREATE POLICY "profiles_delete_own"
  ON public.profiles FOR DELETE TO authenticated
  USING (auth.uid() = id);

-- -----------------------------------------------------------------------------
-- RLS policies — tables with user_id
-- -----------------------------------------------------------------------------

CREATE POLICY "accounts_select_own"
  ON public.accounts FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "accounts_insert_own"
  ON public.accounts FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "accounts_update_own"
  ON public.accounts FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "accounts_delete_own"
  ON public.accounts FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "transactions_select_own"
  ON public.transactions FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "transactions_insert_own"
  ON public.transactions FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "transactions_update_own"
  ON public.transactions FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "transactions_delete_own"
  ON public.transactions FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "budgets_select_own"
  ON public.budgets FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "budgets_insert_own"
  ON public.budgets FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "budgets_update_own"
  ON public.budgets FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "budgets_delete_own"
  ON public.budgets FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "recurring_expenses_select_own"
  ON public.recurring_expenses FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "recurring_expenses_insert_own"
  ON public.recurring_expenses FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "recurring_expenses_update_own"
  ON public.recurring_expenses FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "recurring_expenses_delete_own"
  ON public.recurring_expenses FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "budget_suggestions_select_own"
  ON public.budget_suggestions FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "budget_suggestions_insert_own"
  ON public.budget_suggestions FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "budget_suggestions_update_own"
  ON public.budget_suggestions FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "budget_suggestions_delete_own"
  ON public.budget_suggestions FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "savings_goals_select_own"
  ON public.savings_goals FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "savings_goals_insert_own"
  ON public.savings_goals FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "savings_goals_update_own"
  ON public.savings_goals FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "savings_goals_delete_own"
  ON public.savings_goals FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "goal_contributions_select_own"
  ON public.goal_contributions FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "goal_contributions_insert_own"
  ON public.goal_contributions FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "goal_contributions_update_own"
  ON public.goal_contributions FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "goal_contributions_delete_own"
  ON public.goal_contributions FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "remittances_select_own"
  ON public.remittances FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "remittances_insert_own"
  ON public.remittances FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "remittances_update_own"
  ON public.remittances FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "remittances_delete_own"
  ON public.remittances FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "split_groups_select_own"
  ON public.split_groups FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "split_groups_insert_own"
  ON public.split_groups FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "split_groups_update_own"
  ON public.split_groups FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "split_groups_delete_own"
  ON public.split_groups FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "ai_nudges_select_own"
  ON public.ai_nudges FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "ai_nudges_insert_own"
  ON public.ai_nudges FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "ai_nudges_update_own"
  ON public.ai_nudges FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "ai_nudges_delete_own"
  ON public.ai_nudges FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

-- -----------------------------------------------------------------------------
-- RLS policies — split_* (ownership via parent split_groups.user_id)
-- -----------------------------------------------------------------------------

CREATE POLICY "split_members_select_group_owner"
  ON public.split_members FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.split_groups sg
      WHERE sg.id = split_members.group_id
        AND sg.user_id = auth.uid()
    )
  );

CREATE POLICY "split_members_insert_group_owner"
  ON public.split_members FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.split_groups sg
      WHERE sg.id = split_members.group_id
        AND sg.user_id = auth.uid()
    )
  );

CREATE POLICY "split_members_update_group_owner"
  ON public.split_members FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.split_groups sg
      WHERE sg.id = split_members.group_id
        AND sg.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.split_groups sg
      WHERE sg.id = split_members.group_id
        AND sg.user_id = auth.uid()
    )
  );

CREATE POLICY "split_members_delete_group_owner"
  ON public.split_members FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.split_groups sg
      WHERE sg.id = split_members.group_id
        AND sg.user_id = auth.uid()
    )
  );

CREATE POLICY "split_expenses_select_group_owner"
  ON public.split_expenses FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.split_groups sg
      WHERE sg.id = split_expenses.group_id
        AND sg.user_id = auth.uid()
    )
  );

CREATE POLICY "split_expenses_insert_group_owner"
  ON public.split_expenses FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.split_groups sg
      WHERE sg.id = split_expenses.group_id
        AND sg.user_id = auth.uid()
    )
  );

CREATE POLICY "split_expenses_update_group_owner"
  ON public.split_expenses FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.split_groups sg
      WHERE sg.id = split_expenses.group_id
        AND sg.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.split_groups sg
      WHERE sg.id = split_expenses.group_id
        AND sg.user_id = auth.uid()
    )
  );

CREATE POLICY "split_expenses_delete_group_owner"
  ON public.split_expenses FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.split_groups sg
      WHERE sg.id = split_expenses.group_id
        AND sg.user_id = auth.uid()
    )
  );

CREATE POLICY "split_shares_select_group_owner"
  ON public.split_shares FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.split_expenses se
      JOIN public.split_groups sg ON sg.id = se.group_id
      WHERE se.id = split_shares.expense_id
        AND sg.user_id = auth.uid()
    )
  );

CREATE POLICY "split_shares_insert_group_owner"
  ON public.split_shares FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.split_expenses se
      JOIN public.split_groups sg ON sg.id = se.group_id
      WHERE se.id = split_shares.expense_id
        AND sg.user_id = auth.uid()
    )
  );

CREATE POLICY "split_shares_update_group_owner"
  ON public.split_shares FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.split_expenses se
      JOIN public.split_groups sg ON sg.id = se.group_id
      WHERE se.id = split_shares.expense_id
        AND sg.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.split_expenses se
      JOIN public.split_groups sg ON sg.id = se.group_id
      WHERE se.id = split_shares.expense_id
        AND sg.user_id = auth.uid()
    )
  );

CREATE POLICY "split_shares_delete_group_owner"
  ON public.split_shares FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.split_expenses se
      JOIN public.split_groups sg ON sg.id = se.group_id
      WHERE se.id = split_shares.expense_id
        AND sg.user_id = auth.uid()
    )
  );

CREATE POLICY "split_settlements_select_group_owner"
  ON public.split_settlements FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.split_groups sg
      WHERE sg.id = split_settlements.group_id
        AND sg.user_id = auth.uid()
    )
  );

CREATE POLICY "split_settlements_insert_group_owner"
  ON public.split_settlements FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.split_groups sg
      WHERE sg.id = split_settlements.group_id
        AND sg.user_id = auth.uid()
    )
  );

CREATE POLICY "split_settlements_update_group_owner"
  ON public.split_settlements FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.split_groups sg
      WHERE sg.id = split_settlements.group_id
        AND sg.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.split_groups sg
      WHERE sg.id = split_settlements.group_id
        AND sg.user_id = auth.uid()
    )
  );

CREATE POLICY "split_settlements_delete_group_owner"
  ON public.split_settlements FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.split_groups sg
      WHERE sg.id = split_settlements.group_id
        AND sg.user_id = auth.uid()
    )
  );

-- -----------------------------------------------------------------------------
-- RLS policies — exchange_rates (no user_id: shared reference data)
-- Authenticated users can read; writes use service role or add policies later.
-- -----------------------------------------------------------------------------

CREATE POLICY "exchange_rates_select_authenticated"
  ON public.exchange_rates FOR SELECT TO authenticated
  USING (true);

-- -----------------------------------------------------------------------------
-- Transfers: paired rows (client or RPC)
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.create_transfer(
  p_from_account_id uuid,
  p_to_account_id uuid,
  p_amount numeric,
  p_currency text,
  p_transfer_date date,
  p_note text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  acc_from RECORD;
  acc_to RECORD;
  id_out uuid;
  id_in uuid;
  note_out text;
  note_in text;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF p_from_account_id = p_to_account_id THEN
    RAISE EXCEPTION 'From and to accounts must differ';
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Amount must be positive';
  END IF;
  IF p_currency IS NULL OR p_currency NOT IN ('USD', 'INR') THEN
    RAISE EXCEPTION 'Invalid currency';
  END IF;

  SELECT id, user_id, currency, name INTO acc_from
  FROM public.accounts WHERE id = p_from_account_id;
  SELECT id, user_id, currency, name INTO acc_to
  FROM public.accounts WHERE id = p_to_account_id;

  IF acc_from.id IS NULL OR acc_to.id IS NULL THEN
    RAISE EXCEPTION 'Account not found';
  END IF;
  IF acc_from.user_id <> v_user OR acc_to.user_id <> v_user THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;
  IF acc_from.currency <> acc_to.currency OR acc_from.currency <> p_currency THEN
    RAISE EXCEPTION 'Accounts must use the same currency as the transfer';
  END IF;

  note_out := COALESCE(NULLIF(trim(p_note), ''), 'Transfer');
  note_in := note_out;

  INSERT INTO public.transactions (
    user_id, account_id, amount, currency, type, category, note, date, source
  ) VALUES (
    v_user, p_from_account_id, p_amount, p_currency, 'transfer_out',
    'internal_transfer', note_out, p_transfer_date, 'manual'
  )
  RETURNING id INTO id_out;

  INSERT INTO public.transactions (
    user_id, account_id, amount, currency, type, category, note, date, source, linked_transfer_id
  ) VALUES (
    v_user, p_to_account_id, p_amount, p_currency, 'transfer_in',
    'internal_transfer', note_in, p_transfer_date, 'manual', id_out
  )
  RETURNING id INTO id_in;

  UPDATE public.transactions SET linked_transfer_id = id_in WHERE id = id_out;

  RETURN jsonb_build_object('transfer_out_id', id_out, 'transfer_in_id', id_in);
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_transfer(uuid, uuid, numeric, text, date, text) TO authenticated;

-- -----------------------------------------------------------------------------
-- Trigger: auto-create profile on auth signup
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id)
  VALUES (NEW.id);
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();
