/**
 * Heuristic recurring detection from expense history (same category + note pattern,
 * similar amount, similar calendar day across months).
 */

export interface TxDetectInput {
  id: string;
  date: string;
  amount: number;
  note: string | null;
  category: string;
  currency?: string;
  source?: string | null;
}

export interface DetectedRecurringPattern {
  category: string;
  label: string;
  note_fingerprint: string;
  suggested_amount: number;
  suggested_day_of_month: number;
  sample_transaction_ids: string[];
  months_spanned: number;
  source: "detected" | "splitwise";
  currency: string;
}

export function noteFingerprint(note: string | null | undefined): string {
  const s = (note || "").trim().toLowerCase().replace(/\s+/g, " ").slice(0, 200);
  return s || "_empty_";
}

function dayOfMonth(dateStr: string): number {
  const d = parseInt(dateStr.slice(8, 10), 10);
  return Number.isFinite(d) ? d : 15;
}

function monthKey(dateStr: string): string {
  return dateStr.slice(0, 7);
}

/** Median of positive numbers */
function median(nums: number[]): number {
  if (nums.length === 0) return 0;
  const s = [...nums].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

export interface DetectRecurringOptions {
  /** Only expenses on/after this date (YYYY-MM-DD) */
  sinceDate: string;
  amountVarianceRatio?: number;
  daySpreadMax?: number;
  minDistinctMonths?: number;
  minSamples?: number;
}

/**
 * Group by category + note fingerprint; keep groups with enough months, tight amount & day spread.
 */
export function detectRecurringPatterns(
  transactions: TxDetectInput[],
  opts: DetectRecurringOptions
): DetectedRecurringPattern[] {
  const amountTol = opts.amountVarianceRatio ?? 0.12;
  const daySpreadMax = opts.daySpreadMax ?? 6;
  const minMonths = opts.minDistinctMonths ?? 2;
  const minSamples = opts.minSamples ?? 2;

  const expenses = transactions.filter(
    (t) =>
      t.date >= opts.sinceDate &&
      t.amount > 0
  );

  const groups = new Map<string, TxDetectInput[]>();
  for (const t of expenses) {
    const fp = noteFingerprint(t.note);
    const key = `${t.category}::${fp}`;
    const arr = groups.get(key) || [];
    arr.push(t);
    groups.set(key, arr);
  }

  const out: DetectedRecurringPattern[] = [];

  Array.from(groups.entries()).forEach(([key, group]) => {
    if (group.length < minSamples) return;
    const months = new Set(group.map((t) => monthKey(t.date)));
    if (months.size < minMonths) return;

    const amounts = group.map((t) => t.amount);
    const med = median(amounts);
    if (med <= 0) return;
    const ratio = Math.max(...amounts) / Math.min(...amounts);
    if (ratio > 1 + amountTol) return;

    const days = group.map((t) => dayOfMonth(t.date));
    const dMin = Math.min(...days);
    const dMax = Math.max(...days);
    if (dMax - dMin > daySpreadMax) return;

    const [category] = key.split("::");
    const label =
      group[0]?.note?.trim() ||
      group[0]?.category ||
      "Recurring";
    const suggestedDay = Math.round(
      days.reduce((a, b) => a + b, 0) / days.length
    );

    const cur = (group[0]?.currency || "USD") as string;
    out.push({
      category: category!,
      label: label.slice(0, 120),
      note_fingerprint: noteFingerprint(group[0]?.note),
      suggested_amount: Math.round(med * 100) / 100,
      suggested_day_of_month: Math.min(31, Math.max(1, suggestedDay)),
      sample_transaction_ids: Array.from(
        new Set(group.map((g) => g.id))
      ).slice(0, 8),
      months_spanned: months.size,
      source: group.some((g) => g.source === "split") ? "splitwise" : "detected",
      currency: cur === "INR" ? "INR" : "USD",
    });
  });

  out.sort((a, b) => b.months_spanned - a.months_spanned);
  return out;
}
