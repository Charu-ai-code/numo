import type { SupabaseClient } from "@supabase/supabase-js";
import {
  noteFingerprint,
  type DetectedRecurringPattern,
} from "@/lib/detect-recurring";
import { isPauseActive, todayStr } from "@/lib/recurring-hub";

export function dayFromDate(dateStr: string): number {
  const d = parseInt(dateStr.slice(8, 10), 10);
  return Number.isFinite(d) ? Math.min(31, Math.max(1, d)) : 15;
}

/**
 * User marked recurring: upsert recurring_expenses row and link transaction.
 */
export async function upsertRecurringExpenseFromTransaction(
  supabase: SupabaseClient,
  userId: string,
  tx: {
    id: string;
    category: string;
    amount: number;
    currency: string;
    date: string;
    note: string | null;
    recurrence: string | null;
    type: string;
    recurring_expense_id?: string | null;
  }
): Promise<{ id: string | null; error?: string }> {
  if (tx.type !== "expense") return { id: null };

  const prevRid = tx.recurring_expense_id ?? null;
  const fp = noteFingerprint(tx.note);
  const label = (tx.note || "").trim() || tx.category;
  const day = dayFromDate(tx.date);
  const recurrence =
    tx.recurrence && ["daily", "weekly", "biweekly", "monthly"].includes(tx.recurrence)
      ? tx.recurrence
      : "monthly";

  const row = {
    user_id: userId,
    category: tx.category,
    label: label.slice(0, 200),
    note_fingerprint: fp,
    expected_amount: tx.amount,
    currency: tx.currency,
    recurrence,
    expected_day_of_month: recurrence === "monthly" ? day : null,
    source: "transaction",
    template_transaction_id: tx.id,
    last_hit_date: tx.date,
    is_active: true,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from("recurring_expenses")
    .upsert(row, { onConflict: "user_id,category,note_fingerprint" })
    .select("id")
    .single();

  if (error || !data) {
    return { id: null, error: error?.message || "Could not save recurring expense" };
  }

  const rid = data.id as string;
  const { error: linkErr } = await supabase
    .from("transactions")
    .update({ recurring_expense_id: rid })
    .eq("id", tx.id)
    .eq("user_id", userId);

  if (linkErr) {
    return { id: null, error: linkErr.message };
  }

  if (prevRid && prevRid !== rid) {
    await supabase
      .from("recurring_expenses")
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq("id", prevRid)
      .eq("user_id", userId);
  }

  return { id: rid };
}

/**
 * Try to attach a non-flagged expense to an existing recurring_expense (same category, similar note/amount/day).
 */
export async function tryAutoLinkExpenseToRecurring(
  supabase: SupabaseClient,
  userId: string,
  tx: {
    id: string;
    category: string;
    amount: number;
    currency: string;
    date: string;
    note: string | null;
    type: string;
    recurring_expense_id?: string | null;
    is_recurring?: boolean | null;
  }
): Promise<boolean> {
  if (tx.type !== "expense" || tx.is_recurring || tx.recurring_expense_id) return false;

  const { data: candidates } = await supabase
    .from("recurring_expenses")
    .select("*")
    .eq("user_id", userId)
    .eq("category", tx.category)
    .eq("is_active", true);

  if (!candidates?.length) return false;

  const txFp = noteFingerprint(tx.note);
  const txDay = dayFromDate(tx.date);
  const amt = Number(tx.amount);

  let best: { id: string; score: number } | null = null;

  const nowD = todayStr();
  for (const re of candidates as any[]) {
    if (isPauseActive(re, nowD)) continue;
    if (re.currency !== tx.currency) continue;
    const expected = Number(re.expected_amount);
    if (expected <= 0) continue;
    const amtRatio = Math.max(amt, expected) / Math.min(amt, expected);
    if (amtRatio > 1.12) continue;

    const fpMatch =
      re.note_fingerprint === txFp
        ? 1
        : re.note_fingerprint.includes(txFp) || txFp.includes(re.note_fingerprint)
          ? 0.6
          : txFp.length >= 8 &&
              (re.note_fingerprint.startsWith(txFp.slice(0, 8)) ||
                txFp.startsWith((re.note_fingerprint as string).slice(0, 8)))
            ? 0.5
            : 0;
    if (fpMatch === 0) continue;

    const expDay = re.expected_day_of_month as number | null;
    if (expDay != null && re.recurrence === "monthly") {
      if (Math.abs(txDay - expDay) > 5) continue;
    }

    const score = fpMatch * 100 - amtRatio;
    if (!best || score > best.score) best = { id: re.id, score };
  }

  if (!best) return false;

  await supabase
    .from("transactions")
    .update({ recurring_expense_id: best.id })
    .eq("id", tx.id)
    .eq("user_id", userId);

  await supabase
    .from("recurring_expenses")
    .update({
      last_hit_date: tx.date,
      updated_at: new Date().toISOString(),
    })
    .eq("id", best.id);

  return true;
}

export async function updateRecurringExpenseFromTransaction(
  supabase: SupabaseClient,
  userId: string,
  recurringExpenseId: string,
  tx: {
    amount: number;
    currency: string;
    date: string;
    note: string | null;
    recurrence: string | null;
  }
): Promise<void> {
  const day = dayFromDate(tx.date);
  const recurrence =
    tx.recurrence && ["daily", "weekly", "biweekly", "monthly"].includes(tx.recurrence)
      ? tx.recurrence
      : "monthly";

  await supabase
    .from("recurring_expenses")
    .update({
      expected_amount: tx.amount,
      currency: tx.currency,
      label: ((tx.note || "").trim() || "Recurring").slice(0, 200),
      recurrence,
      expected_day_of_month: recurrence === "monthly" ? day : null,
      last_hit_date: tx.date,
      updated_at: new Date().toISOString(),
    })
    .eq("id", recurringExpenseId)
    .eq("user_id", userId);
}

export async function deactivateRecurringExpense(
  supabase: SupabaseClient,
  userId: string,
  recurringExpenseId: string
): Promise<void> {
  await supabase
    .from("recurring_expenses")
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq("id", recurringExpenseId)
    .eq("user_id", userId);
}

/**
 * After insert/update: sync recurring_expenses row and auto-link expenses to active series.
 */
export async function syncTransactionRecurring(
  supabase: SupabaseClient,
  userId: string,
  transactionId: string
): Promise<{ ok: boolean; error?: string }> {
  const { data: tx, error: fetchErr } = await supabase
    .from("transactions")
    .select("*")
    .eq("id", transactionId)
    .eq("user_id", userId)
    .single();

  if (fetchErr || !tx) {
    return { ok: false, error: fetchErr?.message || "Transaction not found" };
  }

  if (tx.type !== "expense") return { ok: true };

  if (tx.is_recurring) {
    const { id: rid, error: upsertErr } = await upsertRecurringExpenseFromTransaction(
      supabase,
      userId,
      {
        id: tx.id,
        category: tx.category,
        amount: Number(tx.amount),
        currency: tx.currency,
        date: tx.date,
        note: tx.note,
        recurrence: tx.recurrence,
        type: tx.type,
        recurring_expense_id: tx.recurring_expense_id,
      }
    );
    if (!rid) {
      return { ok: false, error: upsertErr || "Failed to link recurring expense" };
    }
    return { ok: true };
  }

  if (tx.recurring_expense_id) {
    await supabase
      .from("transactions")
      .update({ recurring_expense_id: null })
      .eq("id", tx.id)
      .eq("user_id", userId);
    return { ok: true };
  }

  await tryAutoLinkExpenseToRecurring(supabase, userId, tx);
  return { ok: true };
}

export async function upsertDetectedRecurringRows(
  supabase: SupabaseClient,
  userId: string,
  patterns: DetectedRecurringPattern[]
): Promise<number> {
  let applied = 0;
  for (const p of patterns) {
    const row = {
      user_id: userId,
      category: p.category,
      label: p.label.slice(0, 200),
      note_fingerprint: p.note_fingerprint,
      expected_amount: p.suggested_amount,
      currency: p.currency,
      recurrence: "monthly" as const,
      frequency: "monthly" as const,
      expected_day_of_month: p.suggested_day_of_month,
      source: p.source === "splitwise" ? "splitwise" : "detected",
      is_active: true,
      updated_at: new Date().toISOString(),
    };
    const { error } = await supabase
      .from("recurring_expenses")
      .upsert(row, { onConflict: "user_id,category,note_fingerprint" });
    if (!error) applied += 1;
  }
  return applied;
}
