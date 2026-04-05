-- Numo Budget System v2 — run after migration_consolidated_all.sql
-- Idempotent where possible.

-- -----------------------------------------------------------------------------
-- profiles: budget mode + observation + planned remittance
-- -----------------------------------------------------------------------------
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS budget_mode text DEFAULT 'active'
    CHECK (budget_mode IN ('observing', 'suggested', 'active'));

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS budget_observation_started_at timestamptz;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS planned_monthly_remittance numeric;

COMMENT ON COLUMN public.profiles.budget_mode IS
  'observing: learn spending; suggested: AI suggestions pending; active: normal budgets';
COMMENT ON COLUMN public.profiles.budget_observation_started_at IS
  'Start of 30-day observation window for budget learning';

-- Default existing users to active (already budgeting)
UPDATE public.profiles SET budget_mode = 'active' WHERE budget_mode IS NULL;

-- -----------------------------------------------------------------------------
-- budget_suggestions (category = slug matching budgets.category)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.budget_suggestions (
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

CREATE INDEX IF NOT EXISTS idx_budget_suggestions_user_month
  ON public.budget_suggestions (user_id, month_observed DESC);

ALTER TABLE public.budget_suggestions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "budget_suggestions_select_own" ON public.budget_suggestions;
CREATE POLICY "budget_suggestions_select_own"
  ON public.budget_suggestions FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "budget_suggestions_insert_own" ON public.budget_suggestions;
CREATE POLICY "budget_suggestions_insert_own"
  ON public.budget_suggestions FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "budget_suggestions_update_own" ON public.budget_suggestions;
CREATE POLICY "budget_suggestions_update_own"
  ON public.budget_suggestions FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "budget_suggestions_delete_own" ON public.budget_suggestions;
CREATE POLICY "budget_suggestions_delete_own"
  ON public.budget_suggestions FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

-- -----------------------------------------------------------------------------
-- savings_goals: goal types + monthly targets
-- -----------------------------------------------------------------------------
ALTER TABLE public.savings_goals
  ADD COLUMN IF NOT EXISTS goal_type text DEFAULT 'custom'
    CHECK (goal_type IN ('send_home', 'emergency', 'travel', 'invest', 'education', 'custom'));

ALTER TABLE public.savings_goals
  ADD COLUMN IF NOT EXISTS monthly_target numeric;

ALTER TABLE public.savings_goals
  ADD COLUMN IF NOT EXISTS is_recurring boolean DEFAULT false;

-- -----------------------------------------------------------------------------
-- remittances → goal (Send Home)
-- -----------------------------------------------------------------------------
ALTER TABLE public.remittances
  ADD COLUMN IF NOT EXISTS goal_id uuid REFERENCES public.savings_goals (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_remittances_goal_id ON public.remittances (goal_id);
