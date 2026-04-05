import { formatDateShort } from "@/lib/utils";

export type RecurringExpenseRow = {
  id: string;
  category: string;
  label: string;
  expected_amount: number;
  currency: string;
  recurrence: string;
  expected_day_of_month: number | null;
  last_hit_date: string | null;
};

export type TxHitRow = {
  recurring_expense_id: string | null;
  date: string;
  amount: number;
  note: string | null;
  source?: string | null;
};

/** YYYY-MM-DD */
function todayStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function monthHitForRecurring(
  reId: string,
  monthStart: string,
  monthEndExclusive: string,
  txs: TxHitRow[]
): { hit: boolean; hitDate: string | null; amount: number | null } {
  const inMonth = txs.filter(
    (t) =>
      t.recurring_expense_id === reId &&
      t.date >= monthStart &&
      t.date < monthEndExclusive
  );
  if (inMonth.length === 0) return { hit: false, hitDate: null, amount: null };
  const latest = inMonth.sort((a, b) => b.date.localeCompare(a.date))[0]!;
  return {
    hit: true,
    hitDate: latest.date,
    amount: Number(latest.amount),
  };
}

/**
 * Monthly recurring: past expected day + grace (5) in the viewed month with no hit → "late" for UI / nudges.
 */
export function recurringIsPastDueThisMonth(
  re: RecurringExpenseRow,
  monthStart: string,
  monthEndExclusive: string,
  txs: TxHitRow[],
  now: Date = new Date(),
  isViewingCurrentMonth: boolean
): boolean {
  if (!isViewingCurrentMonth) return false;
  if (re.recurrence !== "monthly" || re.expected_day_of_month == null) return false;
  const { hit } = monthHitForRecurring(re.id, monthStart, monthEndExclusive, txs);
  if (hit) return false;

  const nowStr = todayStr(now);
  if (nowStr < monthStart || nowStr >= monthEndExclusive) return false;

  const y = parseInt(monthStart.slice(0, 4), 10);
  const m = parseInt(monthStart.slice(5, 7), 10) - 1;
  const lastDay = new Date(y, m + 1, 0).getDate();
  const dom = Math.min(re.expected_day_of_month, lastDay);
  const due = new Date(y, m, dom);
  const graceEnd = new Date(due);
  graceEnd.setDate(graceEnd.getDate() + 5);

  return now > graceEnd;
}

export function formatRecurringHitLine(
  re: RecurringExpenseRow,
  monthStart: string,
  monthEndExclusive: string,
  txs: TxHitRow[],
  now: Date = new Date(),
  isViewingCurrentMonth: boolean
): { icon: "hit" | "due"; line: string } {
  const { hit, hitDate } = monthHitForRecurring(re.id, monthStart, monthEndExclusive, txs);
  if (hit && hitDate) {
    return {
      icon: "hit",
      line: `Hit ${formatDateShort(hitDate)}`,
    };
  }
  const y = parseInt(monthStart.slice(0, 4), 10);
  const mo = parseInt(monthStart.slice(5, 7), 10);
  const lastDay = new Date(y, mo, 0).getDate();
  const dom =
    re.expected_day_of_month != null
      ? Math.min(re.expected_day_of_month, lastDay)
      : null;
  const monthName = new Date(y, mo - 1, 1).toLocaleDateString(undefined, {
    month: "short",
  });
  const duePhrase =
    dom != null ? `Due ~${monthName} ${dom}` : "Due this month";
  if (!isViewingCurrentMonth) {
    return { icon: "due", line: "No payment logged" };
  }
  const late = recurringIsPastDueThisMonth(
    re,
    monthStart,
    monthEndExclusive,
    txs,
    now,
    true
  );
  return {
    icon: "due",
    line: late ? `${duePhrase} (overdue)` : `${duePhrase} (hasn't hit yet)`,
  };
}

export function overdueRecurringForNudge(
  recurring: RecurringExpenseRow[],
  monthStart: string,
  monthEndExclusive: string,
  txs: TxHitRow[],
  now: Date = new Date()
): { label: string; category: string; expected_day: number }[] {
  const out: { label: string; category: string; expected_day: number }[] = [];
  for (const re of recurring) {
    if (re.recurrence !== "monthly" || re.expected_day_of_month == null) continue;
    if (
      !recurringIsPastDueThisMonth(
        re,
        monthStart,
        monthEndExclusive,
        txs,
        now,
        true
      )
    )
      continue;
    out.push({
      label: re.label,
      category: re.category,
      expected_day: re.expected_day_of_month,
    });
  }
  return out;
}
