-- Run in Supabase SQL Editor if you want the atomic `create_transfer` RPC
-- (optional — the app uses client-side paired inserts when RPC is unavailable).
-- Requires: transactions.type allows transfer_out / transfer_in, linked_transfer_id column.
-- After run, PostgREST reloads from NOTIFY below.

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

NOTIFY pgrst, 'reload schema';
