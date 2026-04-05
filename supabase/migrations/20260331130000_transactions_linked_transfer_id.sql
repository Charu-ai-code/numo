-- Paired transfer rows (Pay card, account transfers via create_transfer / create-transfer.ts).
-- Fixes: "Could not find the 'linked_transfer_id' column of 'transactions' in the schema cache"

ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS linked_transfer_id uuid REFERENCES public.transactions(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_transactions_linked_transfer_id
  ON public.transactions (linked_transfer_id)
  WHERE linked_transfer_id IS NOT NULL;

NOTIFY pgrst, 'reload schema';
