-- Allow transfer_out / transfer_in (credit card payments, account transfers, create_transfer RPC).
-- Requires dropping the old check constraint (names only; no data loss).

ALTER TABLE public.transactions DROP CONSTRAINT IF EXISTS transactions_type_check;

ALTER TABLE public.transactions
  ADD CONSTRAINT transactions_type_check CHECK (
    type IN ('expense', 'income', 'transfer_out', 'transfer_in')
  );

NOTIFY pgrst, 'reload schema';
