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
  created_at timestamptz DEFAULT now()
);

CREATE TABLE public.accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  name text NOT NULL,
  type text NOT NULL CHECK (type IN ('bank', 'credit_card', 'wallet', 'crypto_wallet')),
  currency text NOT NULL DEFAULT 'USD' CHECK (currency IN ('USD', 'INR')),
  initial_balance numeric NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE public.transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  account_id uuid NOT NULL REFERENCES public.accounts (id) ON DELETE CASCADE,
  amount numeric NOT NULL CHECK (amount > 0),
  currency text NOT NULL CHECK (currency IN ('USD', 'INR')),
  converted_amount numeric,
  type text NOT NULL CHECK (type IN ('expense', 'income')),
  category text NOT NULL,
  note text,
  date date NOT NULL DEFAULT CURRENT_DATE,
  is_recurring boolean DEFAULT false,
  recurrence text CHECK (recurrence IN ('daily', 'weekly', 'monthly')),
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

CREATE TABLE public.savings_goals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  name text NOT NULL,
  icon text DEFAULT 'Target',
  color text DEFAULT '#4edea3',
  target_amount numeric NOT NULL CHECK (target_amount > 0),
  current_balance numeric NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'USD' CHECK (currency IN ('USD', 'INR')),
  target_date date NOT NULL,
  is_completed boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
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
  created_at timestamptz DEFAULT now()
);

CREATE TABLE public.split_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  name text NOT NULL,
  splitwise_group_id text,
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
  date date NOT NULL DEFAULT CURRENT_DATE
);

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
