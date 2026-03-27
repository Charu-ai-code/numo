"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import type { CustomCategory } from "@/lib/constants";

export function useCustomCategories() {
  const supabase = createClient();
  return useQuery<CustomCategory[]>({
    queryKey: ["custom-categories"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("custom_categories")
        .select("*")
        .order("created_at");
      if (error) throw error;
      return data as CustomCategory[];
    },
  });
}

export function useCreateCustomCategory() {
  const supabase = createClient();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (cat: {
      name: string;
      icon: string;
      color: string;
      type: "expense" | "income";
    }) => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const slug = cat.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_|_$/g, "");
      const { data, error } = await supabase
        .from("custom_categories")
        .insert({ ...cat, slug, user_id: user!.id })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["custom-categories"] });
    },
  });
}

export function useCategoryMappings() {
  const supabase = createClient();
  return useQuery({
    queryKey: ["category-mappings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("category_mappings")
        .select("*");
      if (error) throw error;
      return data as { id: string; keyword: string; category: string }[];
    },
  });
}

export function useUpsertCategoryMapping() {
  const supabase = createClient();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ keyword, category }: { keyword: string; category: string }) => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const normalized = keyword.toLowerCase().trim();
      if (!normalized) return;
      const { error } = await supabase
        .from("category_mappings")
        .upsert(
          { user_id: user!.id, keyword: normalized, category },
          { onConflict: "user_id,keyword" }
        );
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["category-mappings"] });
    },
  });
}
