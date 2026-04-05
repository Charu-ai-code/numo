/**
 * Shared budget math: split vs personal, daily number, planned vs income.
 * MVP: amounts in each row's currency; summaries use primaryCurrency for display when mixed (caller passes consistent currency when possible).
 */

import type { Currency } from "@/lib/constants";
import { INTERNAL_TRANSFER_CATEGORY } from "@/lib/account-ledger";

export type BudgetMode = "observing" | "suggested" | "active";

export type TxSource = "manual" | "split" | null;

export interface ExpenseRow {
  amount: number;
  category: string;
  currency: Currency;
  type: "expense" | "income";
  source?: TxSource;
}

export interface BudgetRow {
  id: string;
  category: string;
  monthly_limit: number;
  currency: Currency;
}

export interface SavingsGoalRow {
  id: string;
  goal_type?: string | null;
  monthly_target?: number | null;
  is_recurring?: boolean | null;
  current_balance?: number | null;
  target_amount?: number | null;
  currency?: Currency | null;
}

export interface GoalContributionRow {
  goal_id: string;
  amount: number;
  date: string;
}

export interface RemittanceRow {
  goal_id?: string | null;
  amount_sent: number;
  date: string;
  from_currency: Currency;
}

/** Categories that should not count toward spending budgets (remittances use Goals). */
export const BUDGET_EXCLUDED_CATEGORIES = new Set(["family_remittance"]);

export function isBudgetEligibleExpense(category: string): boolean {
  return !BUDGET_EXCLUDED_CATEGORIES.has(category);
}

export interface CategorySpend {
  category: string;
  spentTotal: number;
  spentSplit: number;
  spentPersonal: number;
}

export function aggregateExpenseByCategory(
  expenses: ExpenseRow[]
): Map<string, CategorySpend> {
  const map = new Map<string, CategorySpend>();
  for (const t of expenses) {
    if (t.type !== "expense") continue;
    if (t.category === INTERNAL_TRANSFER_CATEGORY) continue;
    if (!isBudgetEligibleExpense(t.category)) continue;
    const src = t.source || "manual";
    const split = src === "split" ? t.amount : 0;
    const personal = src === "split" ? 0 : t.amount;
    const prev = map.get(t.category) || {
      category: t.category,
      spentTotal: 0,
      spentSplit: 0,
      spentPersonal: 0,
    };
    prev.spentTotal += t.amount;
    prev.spentSplit += split;
    prev.spentPersonal += personal;
    map.set(t.category, prev);
  }
  return map;
}

export function spendForBudgetCategory(
  byCat: Map<string, CategorySpend>,
  category: string
): { spent: number; split: number; personal: number } {
  const row = byCat.get(category);
  if (!row) return { spent: 0, split: 0, personal: 0 };
  return {
    spent: row.spentTotal,
    split: row.spentSplit,
    personal: row.spentPersonal,
  };
}

export interface BudgetProgressRow extends BudgetRow {
  spent: number;
  spentSplit: number;
  spentPersonal: number;
  pct: number;
}

export function computeBudgetProgress(
  budgets: BudgetRow[],
  byCat: Map<string, CategorySpend>
): BudgetProgressRow[] {
  return budgets.map((b) => {
    const { spent, split, personal } = spendForBudgetCategory(byCat, b.category);
    const pct = b.monthly_limit > 0 ? (spent / b.monthly_limit) * 100 : 0;
    return {
      ...b,
      spent,
      spentSplit: split,
      spentPersonal: personal,
      pct,
    };
  });
}

/** Sum of expenses in categories that have no budget row this month. */
export function unbudgetedSpending(
  byCat: Map<string, CategorySpend>,
  budgetedCategories: Set<string>
): { total: number; byCategory: { category: string; amount: number }[] } {
  const byCategory: { category: string; amount: number }[] = [];
  let total = 0;
  for (const [cat, row] of Array.from(byCat.entries())) {
    if (budgetedCategories.has(cat)) continue;
    total += row.spentTotal;
    byCategory.push({ category: cat, amount: row.spentTotal });
  }
  byCategory.sort((a, b) => b.amount - a.amount);
  return { total, byCategory };
}

export function daysLeftInMonth(now: Date = new Date()): number {
  const y = now.getFullYear();
  const m = now.getMonth();
  const last = new Date(y, m + 1, 0).getDate();
  return Math.max(1, last - now.getDate() + 1);
}

export function observationDayCount(
  startedAt: Date | null,
  now: Date = new Date()
): number {
  if (!startedAt) return 0;
  const ms = now.getTime() - startedAt.getTime();
  return Math.max(0, Math.floor(ms / (24 * 60 * 60 * 1000)) + 1);
}

export function observationComplete(
  startedAt: Date | null,
  minDays = 30,
  now: Date = new Date()
): boolean {
  if (!startedAt) return false;
  return observationDayCount(startedAt, now) >= minDays;
}

/**
 * Daily spend allowance: (sum of monthly limits - sum of spend in those categories) / days left.
 * Only counts expenses toward categories that have a budget.
 */
export function computeDailyBudgetNumber(
  budgets: BudgetRow[],
  byCat: Map<string, CategorySpend>,
  now: Date = new Date()
): {
  totalLimits: number;
  spentInBudgetCategories: number;
  remaining: number;
  daysLeft: number;
  perDay: number;
} {
  let totalLimits = 0;
  let spentInBudgetCategories = 0;
  for (const b of budgets) {
    totalLimits += b.monthly_limit;
    spentInBudgetCategories += spendForBudgetCategory(byCat, b.category).spent;
  }
  const remaining = totalLimits - spentInBudgetCategories;
  const daysLeft = daysLeftInMonth(now);
  const perDay = daysLeft > 0 ? remaining / daysLeft : 0;
  return {
    totalLimits,
    spentInBudgetCategories,
    remaining,
    daysLeft,
    perDay,
  };
}

/** Sum of monthly_target for recurring goals (send_home, invest, etc.). */
export function totalMonthlyGoalTargets(goals: SavingsGoalRow[]): number {
  let sum = 0;
  for (const g of goals) {
    if (g.is_recurring && g.monthly_target && g.monthly_target > 0) {
      sum += g.monthly_target;
    }
  }
  return sum;
}

export function goalContributionsThisMonth(
  contributions: GoalContributionRow[],
  monthStart: string
): Map<string, number> {
  const map = new Map<string, number>();
  for (const c of contributions) {
    if (c.date < monthStart) continue;
    map.set(c.goal_id, (map.get(c.goal_id) || 0) + c.amount);
  }
  return map;
}

export function remittancesThisMonthForGoals(
  remittances: RemittanceRow[],
  monthStart: string
): Map<string, number> {
  const map = new Map<string, number>();
  for (const r of remittances) {
    if (!r.goal_id || r.date < monthStart) continue;
    map.set(r.goal_id, (map.get(r.goal_id) || 0) + r.amount_sent);
  }
  return map;
}

/** Monthly progress: send_home uses remittances only; others use goal_contributions only (avoid double count). */
export function monthlyGoalProgress(
  goal: SavingsGoalRow,
  contributions: GoalContributionRow[],
  remittances: RemittanceRow[],
  monthStart: string
): number {
  const gid = goal.id;
  if (goal.goal_type === "send_home") {
    let n = 0;
    for (const r of remittances) {
      if (r.goal_id === gid && r.date >= monthStart) n += r.amount_sent;
    }
    return n;
  }
  let n = 0;
  for (const c of contributions) {
    if (c.goal_id === gid && c.date >= monthStart) n += c.amount;
  }
  return n;
}

export function totalGoalsProgressThisMonth(
  goals: SavingsGoalRow[],
  contributions: GoalContributionRow[],
  remittances: RemittanceRow[],
  monthStart: string
): { contributed: number; target: number } {
  let contributed = 0;
  let target = 0;
  for (const g of goals) {
    if (!g.is_recurring || !g.monthly_target) continue;
    target += g.monthly_target;
    contributed += monthlyGoalProgress(g, contributions, remittances, monthStart);
  }
  return { contributed, target };
}

export function plannedVersusIncome(
  totalBudgetLimits: number,
  totalGoalMonthlyTargets: number,
  statedMonthlyIncome: number | null | undefined
): {
  totalPlanned: number;
  income: number;
  overBy: number;
  isOver: boolean;
} {
  const income = statedMonthlyIncome ?? 0;
  const totalPlanned = totalBudgetLimits + totalGoalMonthlyTargets;
  const overBy = totalPlanned - income;
  return {
    totalPlanned,
    income,
    overBy,
    isOver: income > 0 && totalPlanned > income,
  };
}

/** Headroom for new budget lines: income (or account fallback) minus budgets and recurring goal targets. */
export function remainingPlanHeadroom(
  statedMonthlyIncome: number | null | undefined,
  accountBalanceFallback: number,
  totalBudgetLimits: number,
  totalGoalMonthlyTargets: number
): number {
  const income = Number(statedMonthlyIncome) || 0;
  const base = income > 0 ? income : accountBalanceFallback;
  return base - totalBudgetLimits - totalGoalMonthlyTargets;
}

export interface GoalNamedRow extends SavingsGoalRow {
  id: string;
  name: string;
}

/** One-line per recurring goal for coach/nudge (monthly progress + overall). */
export function formatGoalsMonthlyForCoach(
  goals: GoalNamedRow[],
  contributions: GoalContributionRow[],
  remittances: RemittanceRow[],
  monthStart: string
): string {
  const parts: string[] = [];
  for (const g of goals) {
    if (!g.is_recurring || !g.monthly_target || g.monthly_target <= 0) continue;
    const c = monthlyGoalProgress(g, contributions, remittances, monthStart);
    const t = g.monthly_target;
    const met = c >= t;
    const cap =
      g.target_amount != null && g.target_amount > 0
        ? `${Number(g.current_balance ?? 0).toFixed(0)}/${Number(g.target_amount).toFixed(0)} total`
        : "no fixed cap";
    parts.push(
      `${g.name}: ${c.toFixed(0)}/${t.toFixed(0)} mo ${met ? "done" : "in progress"} (${cap}, type ${g.goal_type ?? "custom"})`
    );
  }
  return parts.length ? parts.join(" | ") : "No recurring monthly goals";
}

export function formatMonthlyPlanCoachLine(
  income: number,
  totalBudgetLimits: number,
  totalGoalMonthlyTargets: number,
  budgetCategoryCount: number,
  recurringGoalCount: number
): string {
  const planned = totalBudgetLimits + totalGoalMonthlyTargets;
  const buffer = income - planned;
  return `Income ${income.toFixed(0)} · Budgets ${totalBudgetLimits.toFixed(0)} (${budgetCategoryCount} categories) · Goal targets ${totalGoalMonthlyTargets.toFixed(0)} (${recurringGoalCount} goals) · Total planned ${planned.toFixed(0)} · Buffer ${buffer.toFixed(0)}`;
}
