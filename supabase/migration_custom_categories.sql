-- =============================================================================
-- Migration: Custom Categories & Category Mappings
-- Run this in the Supabase SQL editor.
-- =============================================================================

-- Custom categories created by the user
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

-- Category mappings: keyword → category (learning from user overrides)
CREATE TABLE IF NOT EXISTS public.category_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  keyword text NOT NULL,
  category text NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE (user_id, keyword)
);

CREATE INDEX IF NOT EXISTS idx_category_mappings_user_id ON public.category_mappings (user_id);

-- RLS
ALTER TABLE public.custom_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.category_mappings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "custom_categories_select_own"
  ON public.custom_categories FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "custom_categories_insert_own"
  ON public.custom_categories FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "custom_categories_update_own"
  ON public.custom_categories FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "custom_categories_delete_own"
  ON public.custom_categories FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "category_mappings_select_own"
  ON public.category_mappings FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "category_mappings_insert_own"
  ON public.category_mappings FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "category_mappings_update_own"
  ON public.category_mappings FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "category_mappings_delete_own"
  ON public.category_mappings FOR DELETE TO authenticated
  USING (auth.uid() = user_id);
