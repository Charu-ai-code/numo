/**
 * Recurring transactions are stored with is_recurring + recurrence but are NOT auto-posted.
 * This module finds monthly (or unset) patterns missing a row in the current calendar month.
 */

import { isTransferType } from "@/lib/account-ledger";

export interface RecurringTxLike {
  id: string;
  type: string;
  category: string;
  account_id: string;
  amount: number;
  currency: string;
  date: string;
  note?: string | null;
  is_recurring?: boolean | null;
  recurrence?: string | null;
}

function nextMonthStart(monthStart: string): string {
  const [ys, ms] = monthStart.slice(0, 10).split("-");
  const y = Number(ys);
  const m = Number(ms);
  const d = new Date(y, m - 1 + 1, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

function isMonthlyLikeRecurrence(recurrence: string | null | undefined): boolean {
  const k = (recurrence || "monthly").toLowerCase();
  return k === "monthly";
}

/**
 * Latest monthly recurring template per (type, category, account) that has no matching
 * expense/income row in `monthStart`'s calendar month yet.
 */
export function monthlyRecurringReminderTemplates(
  transactions: RecurringTxLike[],
  monthStart: string
): RecurringTxLike[] {
  const monthEndEx = nextMonthStart(monthStart);
  const inMonth = (d: string) => d.slice(0, 10) >= monthStart && d.slice(0, 10) < monthEndEx;

  const eligible = transactions.filter(
    (t) =>
      t.is_recurring &&
      (t.type === "expense" || t.type === "income") &&
      !isTransferType(t.type) &&
      isMonthlyLikeRecurrence(t.recurrence)
  );

  const byKey = new Map<string, RecurringTxLike>();
  for (const t of eligible) {
    const key = `${t.type}|${t.category}|${t.account_id}`;
    const prev = byKey.get(key);
    if (!prev || t.date > prev.date) byKey.set(key, t);
  }

  const thisMonthTxs = transactions.filter(
    (t) =>
      inMonth(t.date) &&
      (t.type === "expense" || t.type === "income") &&
      !isTransferType(t.type)
  );

  const hasMatch = (tpl: RecurringTxLike) =>
    thisMonthTxs.some(
      (x) =>
        x.type === tpl.type &&
        x.category === tpl.category &&
        x.account_id === tpl.account_id
    );

  const out: RecurringTxLike[] = [];
  Array.from(byKey.values()).forEach((tpl) => {
    if (!hasMatch(tpl)) out.push(tpl);
  });
  out.sort((a, b) => a.category.localeCompare(b.category));
  return out;
}

export function recurrenceLabel(recurrence: string | null | undefined): string {
  const k = (recurrence || "monthly").toLowerCase();
  const map: Record<string, string> = {
    daily: "Daily",
    weekly: "Weekly",
    biweekly: "Biweekly",
    monthly: "Monthly",
  };
  return map[k] || "Monthly";
}
