-- Unified income planner: one saved plan per user per calendar month.
-- spending_by_category / goal_monthly_by_id are snapshots for review & rollover.

CREATE TABLE IF NOT EXISTS public.monthly_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  month date NOT NULL,
  income numeric NOT NULL,
  total_spending numeric NOT NULL DEFAULT 0,
  total_goals numeric NOT NULL DEFAULT 0,
  buffer numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'active', 'reviewed')),
  spending_by_category jsonb NOT NULL DEFAULT '{}'::jsonb,
  goal_monthly_by_id jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (user_id, month)
);

CREATE INDEX IF NOT EXISTS idx_monthly_plans_user_month
  ON public.monthly_plans (user_id, month DESC);

ALTER TABLE public.monthly_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "monthly_plans_select_own"
  ON public.monthly_plans FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "monthly_plans_insert_own"
  ON public.monthly_plans FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "monthly_plans_update_own"
  ON public.monthly_plans FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "monthly_plans_delete_own"
  ON public.monthly_plans FOR DELETE TO authenticated
  USING (auth.uid() = user_id);
