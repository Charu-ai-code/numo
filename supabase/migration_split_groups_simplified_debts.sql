-- Supabase SQL Editor: canonical Splitwise balances from GET /get_groups → simplified_debts
ALTER TABLE public.split_groups
  ADD COLUMN IF NOT EXISTS simplified_debts jsonb DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.split_groups.simplified_debts IS
  'Snapshot from Splitwise get_groups.simplified_debts; authoritative for debt UI.';
