-- Splitwise settlement sync: idempotent upserts from synced payment expenses
ALTER TABLE public.split_settlements
  ADD COLUMN IF NOT EXISTS splitwise_expense_id text;

CREATE UNIQUE INDEX IF NOT EXISTS idx_split_settlements_sw_expense_id
  ON public.split_settlements (splitwise_expense_id)
  WHERE splitwise_expense_id IS NOT NULL;

-- =============================================================================
-- One-time cleanup: settlements were wrongly stored as transactions + split_expenses
-- =============================================================================

-- Remove auto-created transactions for Splitwise payment / settle-up rows
DELETE FROM public.transactions
WHERE source = 'split'
  AND (
    note ILIKE 'Payment (Split:%'
    OR note ILIKE '%Settle all balances (Split:%'
  );

-- Same expenses linked via split_expense_id (note may differ)
DELETE FROM public.transactions t
USING public.split_expenses se
WHERE t.split_expense_id = se.id
  AND se.splitwise_expense_id IS NOT NULL
  AND (
    se.description ILIKE 'Payment%'
    OR se.description ILIKE '%Settle all balances%'
  );

-- Drop mistaken split_expense rows for those Splitwise settlements (shares cascade)
DELETE FROM public.split_expenses
WHERE splitwise_expense_id IS NOT NULL
  AND (
    description ILIKE 'Payment%'
    OR description ILIKE '%Settle all balances%'
  );
