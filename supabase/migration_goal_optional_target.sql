-- Optional overall target for send_home / invest monthly-only goals (idempotent).
-- Run after migration_budget_system_v2.sql

ALTER TABLE public.savings_goals
  ALTER COLUMN target_amount DROP NOT NULL,
  ALTER COLUMN target_date DROP NOT NULL;

ALTER TABLE public.savings_goals
  DROP CONSTRAINT IF EXISTS savings_goals_target_amount_check;

ALTER TABLE public.savings_goals
  ADD CONSTRAINT savings_goals_target_amount_positive
  CHECK (target_amount IS NULL OR target_amount > 0);

ALTER TABLE public.savings_goals
  DROP CONSTRAINT IF EXISTS savings_goals_plan_check;

ALTER TABLE public.savings_goals
  ADD CONSTRAINT savings_goals_plan_check
  CHECK (
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
  );

COMMENT ON CONSTRAINT savings_goals_plan_check ON public.savings_goals IS
  'Either recurring send_home/invest with monthly_target, or any type with positive target_amount + target_date';
