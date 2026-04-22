-- Ensure accounts.apr exists (credit APR); fixes PostgREST "apr column not in schema cache" on older projects.

ALTER TABLE public.accounts
  ADD COLUMN IF NOT EXISTS apr numeric;

NOTIFY pgrst, 'reload schema';
