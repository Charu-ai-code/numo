-- Align recurrence check with app UI (biweekly option on Transactions).
ALTER TABLE public.transactions DROP CONSTRAINT IF EXISTS transactions_recurrence_check;

ALTER TABLE public.transactions
  ADD CONSTRAINT transactions_recurrence_check CHECK (
    recurrence IS NULL OR recurrence IN ('daily', 'weekly', 'biweekly', 'monthly')
  );

NOTIFY pgrst, 'reload schema';
