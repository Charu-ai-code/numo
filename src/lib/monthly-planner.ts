/**
 * Unified monthly planner: smart split, month math, buffer, cut suggestions.
 */

import { aggregateExpenseByCategory, type ExpenseRow } from "@/lib/budget-engine";

/** `YYYY-MM-01` */
export function currentMonthStart(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = now.getMonth() + 1;
  return `${y}-${String(m).padStart(2, "0")}-01`;
}

/** First day of month, `delta` months from `monthStart` (e.g. -1 = previous). */
export function shiftMonthStart(monthStart: string, delta: number): string {
  const [ys, ms] = monthStart.slice(0, 10).split("-");
  const y = Number(ys);
  const m = Number(ms);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

/** Exclusive upper bound for date queries (`monthStart` of next month). */
export function nextMonthStart(monthStart: string): string {
  return shiftMonthStart(monthStart, 1);
}

export function formatPlannerMonthTitle(monthStart: string): string {
  const [ys, ms] = monthStart.slice(0, 10).split("-");
  const d = new Date(Number(ys), Number(ms) - 1, 1);
  return d.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

export function roundToStep(amount: number, step: number): number {
  if (step <= 0) return Math.round(amount);
  return Math.round(amount / step) * step;
}

export type SmartSplitRow = { key: string; weight: number; lastMonthActual: number };

/**
 * Split `totalBudget` across keys by historical weights; round to `step`, fix sum on last key.
 */
export function smartSplitAllocate(
  totalBudget: number,
  rows: SmartSplitRow[],
  step: number
): Record<string, number> {
  const out: Record<string, number> = {};
  if (totalBudget <= 0 || rows.length === 0) return out;

  const weights = rows.map((r) => Math.max(0, r.weight));
  const sumW = weights.reduce((a, b) => a + b, 0);
  if (sumW <= 0) {
    let left = totalBudget;
    for (let i = 0; i < rows.length; i++) {
      const isLast = i === rows.length - 1;
      const v = isLast
        ? Math.max(0, left)
        : Math.max(0, roundToStep(left / (rows.length - i), step));
      out[rows[i].key] = v;
      left -= v;
    }
    return out;
  }

  let allocated = 0;
  for (let i = 0; i < rows.length; i++) {
    const isLast = i === rows.length - 1;
    const share = (weights[i]! / sumW) * totalBudget;
    const v = isLast
      ? Math.max(0, totalBudget - allocated)
      : Math.max(0, roundToStep(share, step));
    out[rows[i].key] = v;
    allocated += v;
  }
  return out;
}

/** Build category → total spend (for smart-split weights) from expense rows. */
export function spendTotalsByCategory(expenses: ExpenseRow[]): Map<string, number> {
  const byCat = aggregateExpenseByCategory(expenses);
  const map = new Map<string, number>();
  Array.from(byCat.entries()).forEach(([cat, row]) => {
    map.set(cat, row.spentTotal);
  });
  return map;
}

export function compareToPrevMonth(
  draft: number,
  prevActual: number
): "up" | "down" | "same" {
  if (prevActual <= 0) return draft > 0 ? "up" : "same";
  const tol = Math.max(5, prevActual * 0.02);
  if (draft > prevActual + tol) return "up";
  if (draft < prevActual - tol) return "down";
  return "same";
}

export function bufferTone(buffer: number, income: number): "green" | "amber" | "coral" {
  if (income <= 0) return buffer >= 0 ? "amber" : "coral";
  if (buffer > 0) return "green";
  if (buffer === 0) return "amber";
  return "coral";
}

export function bufferHint(buffer: number, income: number): string {
  const t = bufferTone(buffer, income);
  if (t === "green")
    return `You have ${buffer.toFixed(0)} cushion after this plan.`;
  if (t === "amber")
    return income > 0
      ? "Every dollar is allocated. Little room for surprises."
      : "Set income in Settings for a clearer buffer readout.";
  return `You're ${Math.abs(buffer).toFixed(0)} over income with this plan.`;
}

export interface CutSuggestion {
  label: string;
  category?: string;
  goalId?: string;
  newAmount: number;
  saves: number;
}

/** Deterministic trim suggestions when plan exceeds income. */
export function suggestCutsToBalance(
  overBy: number,
  spending: { category: string; amount: number; label: string }[],
  goals: { id: string; amount: number; name: string }[]
): CutSuggestion[] {
  if (overBy <= 0) return [];
  const suggestions: CutSuggestion[] = [];
  let need = overBy;

  const spendSorted = [...spending].sort((a, b) => b.amount - a.amount);
  for (const row of spendSorted) {
    if (need <= 0) break;
    if (row.amount < 20) continue;
    const trim = Math.min(need, Math.max(10, Math.floor(row.amount * 0.15)));
    const newAmount = Math.max(10, row.amount - trim);
    const saves = row.amount - newAmount;
    if (saves > 0) {
      suggestions.push({
        label: `Trim ${row.label} ${row.amount.toFixed(0)} → ${newAmount.toFixed(0)}`,
        category: row.category,
        newAmount,
        saves,
      });
      need -= saves;
    }
  }

  const goalsSorted = [...goals].sort((a, b) => b.amount - a.amount);
  for (const g of goalsSorted) {
    if (need <= 0) break;
    if (g.amount < 25) continue;
    const trim = Math.min(need, Math.max(15, Math.floor(g.amount * 0.2)));
    const newAmount = Math.max(0, g.amount - trim);
    const saves = g.amount - newAmount;
    if (saves > 0) {
      suggestions.push({
        label: `Lower “${g.name}” ${g.amount.toFixed(0)} → ${newAmount.toFixed(0)}/mo`,
        goalId: g.id,
        newAmount,
        saves,
      });
      need -= saves;
    }
  }

  return suggestions.slice(0, 6);
}

/** Sum income transactions in the month starting at `monthStart`. */
export function sumIncomeInMonth(
  rows: { amount: number; type: string; date: string }[],
  monthStart: string,
  monthEndExclusive: string
): number {
  let s = 0;
  for (const r of rows) {
    if (r.type !== "income") continue;
    if (r.date < monthStart || r.date >= monthEndExclusive) continue;
    s += Number(r.amount);
  }
  return s;
}
