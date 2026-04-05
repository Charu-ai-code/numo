-- Recurring expenses: fixed amounts per budget category, linked from transactions (no double entry).

CREATE TABLE IF NOT EXISTS public.recurring_expenses (
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
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (user_id, category, note_fingerprint)
);

CREATE INDEX IF NOT EXISTS idx_recurring_expenses_user_category
  ON public.recurring_expenses (user_id, category);

CREATE INDEX IF NOT EXISTS idx_recurring_expenses_user_active
  ON public.recurring_expenses (user_id, is_active)
  WHERE is_active = true;

ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS recurring_expense_id uuid REFERENCES public.recurring_expenses (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_transactions_recurring_expense_id
  ON public.transactions (recurring_expense_id)
  WHERE recurring_expense_id IS NOT NULL;

ALTER TABLE public.recurring_expenses ENABLE ROW LEVEL SECURITY;

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

NOTIFY pgrst, 'reload schema';
