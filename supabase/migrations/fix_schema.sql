-- fix_schema.sql — additive-only alignment with app expectations (Numo).
-- Run manually in Supabase SQL Editor after review.
--
-- This file follows: CREATE/ALTER ADD IF NOT EXISTS, CREATE INDEX IF NOT EXISTS,
-- CREATE OR REPLACE FUNCTION, no DROP/DELETE/TRUNCATE, no ALTER COLUMN TYPE,
-- no removal of existing columns.
--
-- LIMITATIONS (cannot be fixed under those rules alone):
-- 1) public.transactions.type must allow 'transfer_out' and 'transfer_in'. That
--    requires replacing check constraint transactions_type_check (needs
--    DROP CONSTRAINT). After this file, run the type-check block from
--    supabase/migration_accounts_credit_transfers.sql (lines 38–42) or
--    equivalent, or transfers / create_transfer inserts will still fail.
-- 2) Monthly-only savings goals need nullable target_amount/target_date and
--    updated plan check — see supabase/migration_goal_optional_target.sql
--    (uses ALTER COLUMN … DROP NOT NULL and DROP CONSTRAINT — not included here).

-- -----------------------------------------------------------------------------
-- accounts: credit card fields
-- -----------------------------------------------------------------------------
ALTER TABLE public.accounts
  ADD COLUMN IF NOT EXISTS credit_limit numeric;

ALTER TABLE public.accounts
  ADD COLUMN IF NOT EXISTS payment_due_day smallint;

ALTER TABLE public.accounts
  ADD COLUMN IF NOT EXISTS apr numeric;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'accounts_payment_due_day_check'
  ) THEN
    ALTER TABLE public.accounts
      ADD CONSTRAINT accounts_payment_due_day_check
      CHECK (payment_due_day IS NULL OR (payment_due_day >= 1 AND payment_due_day <= 31));
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- transactions: link paired transfer rows (column + partial index)
-- -----------------------------------------------------------------------------
ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS linked_transfer_id uuid REFERENCES public.transactions(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_transactions_linked_transfer_id
  ON public.transactions (linked_transfer_id)
  WHERE linked_transfer_id IS NOT NULL;

-- -----------------------------------------------------------------------------
-- RPC: atomic paired transfer (SECURITY INVOKER — RLS applies)
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

-- PostgREST caches the API schema; without this, .rpc("create_transfer", …) can fail until the next reload.
NOTIFY pgrst, 'reload schema';
