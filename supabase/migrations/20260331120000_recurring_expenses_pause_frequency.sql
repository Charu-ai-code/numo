-- Pause/skip month + billing frequency for recurring hub

ALTER TABLE public.recurring_expenses
  ADD COLUMN IF NOT EXISTS is_paused boolean NOT NULL DEFAULT false;

ALTER TABLE public.recurring_expenses
  ADD COLUMN IF NOT EXISTS paused_until date;

ALTER TABLE public.recurring_expenses
  ADD COLUMN IF NOT EXISTS frequency text NOT NULL DEFAULT 'monthly'
    CHECK (frequency IN ('monthly', 'quarterly', 'yearly'));

NOTIFY pgrst, 'reload schema';
