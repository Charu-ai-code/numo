import type { SupabaseClient } from "@supabase/supabase-js";

/** Strip Split suffix so "Usps (Split: Jeevana 2.0)" maps like "Usps" */
export function normalizeNoteForKeyword(note: string | null | undefined): string {
  if (!note) return "";
  const s = note.trim();
  const splitIdx = s.toLowerCase().indexOf("(split:");
  if (splitIdx !== -1) return s.slice(0, splitIdx).trim();
  return s;
}

export function keywordFromNote(note: string | null | undefined): string {
  return normalizeNoteForKeyword(note).toLowerCase().trim();
}

export const DEFAULT_EXPENSE_CATEGORIES = new Set(["other_expense"]);
export const DEFAULT_INCOME_CATEGORIES = new Set(["other_income"]);

export function isUnmappedCategory(
  type: string,
  category: string,
  customSlugs: Set<string>
): boolean {
  if (type === "expense") {
    if (DEFAULT_EXPENSE_CATEGORIES.has(category)) return true;
    return false;
  }
  if (type === "income") {
    if (DEFAULT_INCOME_CATEGORIES.has(category)) return true;
    return false;
  }
  return false;
}

/**
 * Apply saved category_mappings to transactions still on default categories.
 * Used after Splitwise sync so new expenses pick up user rules silently.
 */
export async function applyUserMappingsToTransactions(
  supabase: SupabaseClient,
  userId: string
): Promise<number> {
  const { data: mappings } = await supabase
    .from("category_mappings")
    .select("keyword, category")
    .eq("user_id", userId);

  if (!mappings?.length) return 0;

  const map = new Map<string, string>();
  for (const m of mappings) {
    map.set((m as any).keyword.toLowerCase().trim(), (m as any).category);
  }

  const { data: txs } = await supabase
    .from("transactions")
    .select("id, type, category, note")
    .eq("user_id", userId);

  let updated = 0;
  for (const t of txs || []) {
    const tx = t as any;
    if (!isUnmappedCategory(tx.type, tx.category, new Set())) continue;
    const kw = keywordFromNote(tx.note);
    const full = (tx.note || "").toLowerCase().trim();
    const next = (kw && map.get(kw)) || (full && map.get(full)) || null;
    if (!next || next === tx.category) continue;

    const { error } = await supabase
      .from("transactions")
      .update({ category: next })
      .eq("id", tx.id);
    if (!error) updated++;
  }
  return updated;
}
