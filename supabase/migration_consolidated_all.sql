-- =============================================================================
-- Numo — ALL additive schema changes (consolidated, idempotent where possible)
-- Run in Supabase → SQL Editor on an existing database that already has base
-- tables from schema.sql (or equivalent). Safe to re-run: IF NOT EXISTS / IF NOT EXISTS.
--
-- Individual migration files (same content, split by feature):
--   migration_custom_categories.sql
--   migration_split_transactions.sql
--   migration_splitwise_settlements.sql   (schema part only; data cleanup below)
--   migration_split_groups_simplified_debts.sql
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) Custom categories & keyword → category mappings
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.custom_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  name text NOT NULL,
  slug text NOT NULL,
  icon text NOT NULL DEFAULT 'Tag',
  color text NOT NULL DEFAULT '#b0c6ff',
  type text NOT NULL DEFAULT 'expense' CHECK (type IN ('expense', 'income')),
  created_at timestamptz DEFAULT now(),
  UNIQUE (user_id, slug)
);

CREATE INDEX IF NOT EXISTS idx_custom_categories_user_id ON public.custom_categories (user_id);

CREATE TABLE IF NOT EXISTS public.category_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  keyword text NOT NULL,
  category text NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE (user_id, keyword)
);

CREATE INDEX IF NOT EXISTS idx_category_mappings_user_id ON public.category_mappings (user_id);

ALTER TABLE public.custom_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.category_mappings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "custom_categories_select_own" ON public.custom_categories;
CREATE POLICY "custom_categories_select_own"
  ON public.custom_categories FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "custom_categories_insert_own" ON public.custom_categories;
CREATE POLICY "custom_categories_insert_own"
  ON public.custom_categories FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "custom_categories_update_own" ON public.custom_categories;
CREATE POLICY "custom_categories_update_own"
  ON public.custom_categories FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "custom_categories_delete_own" ON public.custom_categories;
CREATE POLICY "custom_categories_delete_own"
  ON public.custom_categories FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "category_mappings_select_own" ON public.category_mappings;
CREATE POLICY "category_mappings_select_own"
  ON public.category_mappings FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "category_mappings_insert_own" ON public.category_mappings;
CREATE POLICY "category_mappings_insert_own"
  ON public.category_mappings FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "category_mappings_update_own" ON public.category_mappings;
CREATE POLICY "category_mappings_update_own"
  ON public.category_mappings FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "category_mappings_delete_own" ON public.category_mappings;
CREATE POLICY "category_mappings_delete_own"
  ON public.category_mappings FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

-- -----------------------------------------------------------------------------
-- 2) Split ↔ transactions, Splitwise sync keys, profiles
-- -----------------------------------------------------------------------------
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS default_account_id uuid REFERENCES public.accounts(id) ON DELETE SET NULL;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS splitwise_last_sync timestamptz;

ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS source text DEFAULT 'manual' CHECK (source IN ('manual', 'split'));

ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS split_expense_id uuid REFERENCES public.split_expenses(id) ON DELETE SET NULL;

ALTER TABLE public.split_expenses
  ADD COLUMN IF NOT EXISTS splitwise_expense_id text;

CREATE UNIQUE INDEX IF NOT EXISTS idx_split_expenses_sw_id
  ON public.split_expenses(splitwise_expense_id) WHERE splitwise_expense_id IS NOT NULL;

ALTER TABLE public.split_members
  ADD COLUMN IF NOT EXISTS splitwise_user_id text;

ALTER TABLE public.transactions DROP CONSTRAINT IF EXISTS transactions_recurrence_check;
ALTER TABLE public.transactions
  ADD CONSTRAINT transactions_recurrence_check CHECK (recurrence IN ('daily', 'weekly', 'biweekly', 'monthly'));

-- -----------------------------------------------------------------------------
-- 3) Settlements: Splitwise expense id for synced payment rows
-- -----------------------------------------------------------------------------
ALTER TABLE public.split_settlements
  ADD COLUMN IF NOT EXISTS splitwise_expense_id text;

CREATE UNIQUE INDEX IF NOT EXISTS idx_split_settlements_sw_expense_id
  ON public.split_settlements (splitwise_expense_id)
  WHERE splitwise_expense_id IS NOT NULL;

-- -----------------------------------------------------------------------------
-- 4) Split groups: canonical Splitwise simplified_debts snapshot
-- -----------------------------------------------------------------------------
ALTER TABLE public.split_groups
  ADD COLUMN IF NOT EXISTS simplified_debts jsonb DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.split_groups.simplified_debts IS
  'Snapshot from Splitwise get_groups.simplified_debts; authoritative for debt UI.';

-- =============================================================================
-- OPTIONAL: one-time data cleanup (Splitwise payments wrongly stored as expenses)
-- Run only if you had legacy bad rows; skip on fresh DBs.
-- =============================================================================
/*
DELETE FROM public.transactions
WHERE source = 'split'
  AND (
    note ILIKE 'Payment (Split:%'
    OR note ILIKE '%Settle all balances (Split:%'
  );

DELETE FROM public.transactions AS t
USING public.split_expenses AS se
WHERE t.split_expense_id = se.id
  AND se.splitwise_expense_id IS NOT NULL
  AND (
    se.description ILIKE 'Payment%'
    OR se.description ILIKE '%Settle all balances%'
  );

DELETE FROM public.split_expenses
WHERE splitwise_expense_id IS NOT NULL
  AND (
    description ILIKE 'Payment%'
    OR description ILIKE '%Settle all balances%'
  );
*/
