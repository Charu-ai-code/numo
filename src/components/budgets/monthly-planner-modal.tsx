"use client";

import { useState, useEffect, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { getCategoryLabel, type Currency, type CustomCategory } from "@/lib/constants";
import { formatCurrency, cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import type { ExpenseRow } from "@/lib/budget-engine";
import {
  bufferHint,
  bufferTone,
  compareToPrevMonth,
  formatPlannerMonthTitle,
  shiftMonthStart,
  smartSplitAllocate,
  spendTotalsByCategory,
  suggestCutsToBalance,
  type SmartSplitRow,
} from "@/lib/monthly-planner";

export interface PlannerBudgetRow {
  id?: string;
  category: string;
  monthly_limit: number;
  currency: Currency;
}

export interface PlannerGoalRow {
  id: string;
  name: string;
  goal_type?: string | null;
  is_recurring?: boolean | null;
  monthly_target?: number | null;
  currency: Currency;
  target_amount?: number | null;
  current_balance?: number | null;
}

export interface MonthlyPlannerModalProps {
  open: boolean;
  onClose: () => void;
  monthStart: string;
  profileId: string;
  primaryCurrency: Currency;
  statedIncome: number;
  lastMonthIncomeHint: number;
  budgets: PlannerBudgetRow[];
  goals: PlannerGoalRow[];
  customCategories: CustomCategory[] | undefined;
  prevMonthSpendByCategory: Map<string, number>;
  threeMonthExpenses: ExpenseRow[];
  /** `skippedMonthlyPlanSnapshot` is true when DB has no `monthly_plans` table yet (migration not applied). */
  onSaved: (info?: { skippedMonthlyPlanSnapshot?: boolean }) => void;
}

const GOAL_EMOJI: Record<string, string> = {
  send_home: "🇮🇳",
  emergency: "🛡️",
  invest: "📈",
  travel: "✈️",
  education: "🎓",
  custom: "✏️",
};

/** PostgREST errors are usually `Error`, but always merge details/hint/code for the UI. */
function formatSupabaseErr(e: unknown): string {
  if (e == null) return "Save failed";
  if (typeof e === "string") return e;
  if (e instanceof Error && e.message) return e.message;
  const o = e as { message?: string; details?: string; hint?: string; code?: string };
  const parts = [o.message, o.details, o.hint, o.code].filter(
    (x): x is string => typeof x === "string" && x.length > 0
  );
  return parts.length ? parts.join(" — ") : "Save failed";
}

/** Table not created yet or not exposed to PostgREST (common before running migration). */
function isMonthlyPlansTableUnavailable(e: unknown): boolean {
  const code = (e as { code?: string })?.code;
  const msg = formatSupabaseErr(e).toLowerCase();
  if (
    (code === "PGRST205" || code === "42P01") &&
    msg.includes("monthly_plans")
  ) {
    return true;
  }
  const t = msg;
  return (
    (t.includes("monthly_plans") || t.includes("schema cache")) &&
    (t.includes("does not exist") ||
      t.includes("could not find") ||
      t.includes("undefined table") ||
      /relation\s+["']?public\.monthly_plans["']?\s+does not exist/i.test(t))
  );
}

export function MonthlyPlannerModal({
  open,
  onClose,
  monthStart,
  profileId,
  primaryCurrency,
  statedIncome,
  lastMonthIncomeHint,
  budgets,
  goals,
  customCategories,
  prevMonthSpendByCategory,
  threeMonthExpenses,
  onSaved,
}: MonthlyPlannerModalProps) {
  const supabase = createClient();
  const [step, setStep] = useState<"income" | "allocate">("income");
  const [incomeStr, setIncomeStr] = useState("");
  const [spending, setSpending] = useState<Record<string, number>>({});
  const [goalsDraft, setGoalsDraft] = useState<Record<string, number>>({});
  const [smartSplitMode, setSmartSplitMode] = useState(false);
  const [smartTotalStr, setSmartTotalStr] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const monthTitle = formatPlannerMonthTitle(monthStart);
  const priorMonthWord =
    formatPlannerMonthTitle(shiftMonthStart(monthStart, -1)).split(" ")[0] ?? "Prior";
  const stepCurrency = primaryCurrency;
  const roundStep = stepCurrency === "INR" ? 50 : 5;

  useEffect(() => {
    if (!open) return;
    setStep("income");
    const inc =
      statedIncome > 0
        ? statedIncome
        : lastMonthIncomeHint > 0
          ? lastMonthIncomeHint
          : "";
    setIncomeStr(inc === "" ? "" : String(inc));
    const sp: Record<string, number> = {};
    for (const b of budgets) {
      sp[b.category] = b.monthly_limit;
    }
    setSpending(sp);
    const gd: Record<string, number> = {};
    for (const g of goals) {
      if (g.is_recurring && g.monthly_target != null && Number(g.monthly_target) > 0) {
        gd[g.id] = Number(g.monthly_target);
      } else {
        gd[g.id] = 0;
      }
    }
    setGoalsDraft(gd);
    setSmartSplitMode(false);
    setSmartTotalStr("");
    setError("");
  }, [open, monthStart, statedIncome, lastMonthIncomeHint, budgets, goals]);

  const incomeNum = parseFloat(incomeStr) || 0;
  const totalSpending = useMemo(
    () => Object.values(spending).reduce((s, v) => s + Math.max(0, v), 0),
    [spending]
  );
  const totalGoalsPlan = useMemo(
    () => Object.values(goalsDraft).reduce((s, v) => s + Math.max(0, v), 0),
    [goalsDraft]
  );
  const buffer = incomeNum - totalSpending - totalGoalsPlan;
  const tone = bufferTone(buffer, incomeNum);
  const cuts = useMemo(() => {
    if (buffer >= 0 || incomeNum <= 0) return [];
    const spendRows = Object.entries(spending).map(([category, amount]) => ({
      category,
      amount: Math.max(0, amount),
      label: getCategoryLabel(category, customCategories),
    }));
    const goalRows = goals.map((g) => ({
      id: g.id,
      amount: Math.max(0, goalsDraft[g.id] ?? 0),
      name: g.name,
    }));
    return suggestCutsToBalance(Math.abs(buffer), spendRows, goalRows);
  }, [buffer, incomeNum, spending, goals, goalsDraft, customCategories]);

  function applySmartSplit() {
    const total = parseFloat(smartTotalStr);
    if (!total || total <= 0) return;
    const cats = Object.keys(spending);
    if (cats.length === 0) return;
    const weightsMap = spendTotalsByCategory(threeMonthExpenses);
    const rows: SmartSplitRow[] = cats.map((key) => ({
      key,
      weight: weightsMap.get(key) ?? 0,
      lastMonthActual: prevMonthSpendByCategory.get(key) ?? 0,
    }));
    const alloc = smartSplitAllocate(total, rows, roundStep);
    setSpending((prev) => {
      const next = { ...prev };
      for (const k of cats) {
        next[k] = alloc[k] ?? 0;
      }
      return next;
    });
  }

  function applyCutSuggestions() {
    if (cuts.length === 0) return;
    setSpending((prev) => {
      const next = { ...prev };
      for (const c of cuts) {
        if (c.category && c.newAmount >= 0) {
          next[c.category] = c.newAmount;
        }
      }
      return next;
    });
    setGoalsDraft((prev) => {
      const next = { ...prev };
      for (const c of cuts) {
        if (c.goalId && c.newAmount >= 0) {
          next[c.goalId] = c.newAmount;
        }
      }
      return next;
    });
  }

  async function savePlan() {
    setError("");
    if (incomeNum <= 0) {
      setError("Enter a positive monthly income.");
      return;
    }
    setSaving(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not signed in");

      const spending_by_category: Record<string, number> = {};
      for (const [k, v] of Object.entries(spending)) {
        spending_by_category[k] = Math.max(0, v);
      }
      const goal_monthly_by_id: Record<string, number> = {};
      for (const [k, v] of Object.entries(goalsDraft)) {
        goal_monthly_by_id[k] = Math.max(0, v);
      }

      let skippedMonthlyPlanSnapshot = false;
      const { error: planErr } = await supabase.from("monthly_plans").upsert(
        {
          user_id: user.id,
          month: monthStart,
          income: incomeNum,
          total_spending: totalSpending,
          total_goals: totalGoalsPlan,
          buffer,
          status: "active",
          spending_by_category,
          goal_monthly_by_id,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id,month" }
      );
      if (planErr) {
        if (isMonthlyPlansTableUnavailable(planErr)) {
          skippedMonthlyPlanSnapshot = true;
        } else {
          throw planErr;
        }
      }

      for (const [category, monthly_limit] of Object.entries(spending_by_category)) {
        if (monthly_limit <= 0) continue;
        const existing = budgets.find((b) => b.category === category);
        const cur = existing?.currency ?? primaryCurrency;
        const { error: uErr } = await supabase.from("budgets").upsert(
          {
            user_id: user.id,
            category,
            monthly_limit,
            currency: cur,
          },
          { onConflict: "user_id,category" }
        );
        if (uErr) throw uErr;
      }

      for (const g of goals) {
        const amt = goal_monthly_by_id[g.id] ?? 0;
        if (amt <= 0) continue;
        const { error: gErr } = await supabase
          .from("savings_goals")
          .update({
            monthly_target: amt,
            is_recurring: true,
          })
          .eq("id", g.id)
          .eq("user_id", user.id);
        if (gErr) throw gErr;
      }

      const { error: pErr } = await supabase
        .from("profiles")
        .update({ monthly_income: incomeNum })
        .eq("id", profileId);
      if (pErr) throw pErr;

      onSaved(
        skippedMonthlyPlanSnapshot
          ? { skippedMonthlyPlanSnapshot: true }
          : undefined
      );
      onClose();
    } catch (e: unknown) {
      setError(formatSupabaseErr(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={step === "income" ? `${monthTitle} — Income` : `${monthTitle} — Full plan`}
    >
      {step === "income" ? (
        <div className="space-y-4">
          <p className="text-xs text-muted leading-relaxed">
            Start from one income number. Everything you allocate (spending + goals) will flow from it.
          </p>
          <Input
            label="Monthly income"
            type="number"
            step="0.01"
            min="0"
            value={incomeStr}
            onChange={(e) => setIncomeStr(e.target.value)}
            className="font-number"
          />
          <p className="text-[11px] text-muted">
            {lastMonthIncomeHint > 0
              ? `Suggested from last month’s income transactions: ${formatCurrency(lastMonthIncomeHint, stepCurrency)}. Edit if it changed.`
              : "Pre-filled from your profile when set. You can fine-tune in Settings anytime."}
          </p>
          <Button className="w-full" onClick={() => setStep("allocate")}>
            Next: Allocate →
          </Button>
        </div>
      ) : (
        <div className="space-y-4 max-h-[min(78vh,640px)] overflow-y-auto pr-1">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <p className="text-sm text-white/90">
              Income:{" "}
              <span className="font-number font-semibold">
                {formatCurrency(incomeNum, stepCurrency)}
              </span>
            </p>
            <Button variant="ghost" size="sm" onClick={() => setStep("income")}>
              ← Income
            </Button>
          </div>

          <div className="rounded-xl border border-white/[0.08] p-3 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-[11px] uppercase tracking-wide text-muted">
                Spending · Total{" "}
                <span className="font-number text-white">{formatCurrency(totalSpending, stepCurrency)}</span>
              </p>
              <div className="flex rounded-lg border border-white/[0.1] p-0.5 text-[10px]">
                <button
                  type="button"
                  className={cn(
                    "px-2 py-1 rounded-md",
                    !smartSplitMode && "bg-white/10 text-white"
                  )}
                  onClick={() => setSmartSplitMode(false)}
                >
                  Per category
                </button>
                <button
                  type="button"
                  className={cn(
                    "px-2 py-1 rounded-md",
                    smartSplitMode && "bg-white/10 text-white"
                  )}
                  onClick={() => setSmartSplitMode(true)}
                >
                  Smart split total
                </button>
              </div>
            </div>

            {smartSplitMode && (
              <div className="flex flex-wrap gap-2 items-end py-2 border-b border-white/[0.06]">
                <div className="flex-1 min-w-[140px]">
                  <Input
                    label="Total for spending this month"
                    type="number"
                    step="0.01"
                    min="0"
                    value={smartTotalStr}
                    onChange={(e) => setSmartTotalStr(e.target.value)}
                    className="font-number"
                  />
                </div>
                <Button type="button" size="sm" variant="secondary" onClick={applySmartSplit}>
                  Apply split
                </Button>
              </div>
            )}
            <p className="text-[10px] text-muted">
              Bars show each category as a share of income. “{priorMonthWord} actual” is spend in that category last month.
            </p>

            {Object.keys(spending).length === 0 ? (
              <p className="text-xs text-muted py-2">
                Add budgets on the main Budgets page first, then open the planner again.
              </p>
            ) : (
              <div className="space-y-3">
                {Object.entries(spending).map(([category, amt]) => {
                  const prev = prevMonthSpendByCategory.get(category) ?? 0;
                  const cmp = compareToPrevMonth(amt, prev);
                  const arrow =
                    cmp === "up" ? "↑" : cmp === "down" ? "↓" : "=";
                  const barPct =
                    incomeNum > 0 ? Math.min(100, (Math.max(0, amt) / incomeNum) * 100) : 0;
                  return (
                    <div key={category} className="space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm">
                          {getCategoryLabel(category, customCategories)}
                        </span>
                        <span className="text-[10px] text-muted font-number whitespace-nowrap">
                          {priorMonthWord} actual: {formatCurrency(prev, stepCurrency)} {arrow}
                        </span>
                      </div>
                      <div className="flex gap-2 items-center">
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          value={amt === 0 ? "" : String(amt)}
                          onChange={(e) => {
                            const v = parseFloat(e.target.value);
                            setSpending((s) => ({
                              ...s,
                              [category]: Number.isFinite(v) ? Math.max(0, v) : 0,
                            }));
                          }}
                          className="font-number w-28 shrink-0"
                        />
                        <div className="flex-1 h-2 rounded-full bg-white/[0.06] overflow-hidden">
                          <div
                            className="h-full rounded-full bg-accent-blue/80"
                            style={{ width: `${barPct}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="rounded-xl border border-white/[0.08] p-3 space-y-3">
            <p className="text-[11px] uppercase tracking-wide text-muted">
              Goals · Total{" "}
              <span className="font-number text-white">{formatCurrency(totalGoalsPlan, stepCurrency)}</span>
            </p>
            {goals.length === 0 ? (
              <p className="text-xs text-muted">No goals yet — add one from the Budgets page.</p>
            ) : (
              goals.map((g) => {
                const emoji = GOAL_EMOJI[g.goal_type || "custom"] || "🎯";
                const v = goalsDraft[g.id] ?? 0;
                const cap =
                  g.target_amount != null && Number(g.target_amount) > 0
                    ? `${formatCurrency(Number(g.current_balance) || 0, g.currency)} of ${formatCurrency(Number(g.target_amount), g.currency)}`
                    : g.is_recurring
                      ? "Monthly target"
                      : "Optional monthly plan";
                return (
                  <div key={g.id} className="flex flex-wrap items-center gap-2 justify-between">
                    <div className="min-w-0">
                      <p className="text-sm truncate">
                        <span className="mr-1" aria-hidden>
                          {emoji}
                        </span>
                        {g.name}
                      </p>
                      <p className="text-[10px] text-muted">{cap}</p>
                    </div>
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      value={v === 0 ? "" : String(v)}
                      onChange={(e) => {
                        const n = parseFloat(e.target.value);
                        setGoalsDraft((d) => ({
                          ...d,
                          [g.id]: Number.isFinite(n) ? Math.max(0, n) : 0,
                        }));
                      }}
                      className="font-number w-28"
                    />
                  </div>
                );
              })
            )}
          </div>

          <div
            className={cn(
              "rounded-xl border p-3 space-y-2",
              tone === "green" && "border-accent-green/25 bg-accent-green/[0.06]",
              tone === "amber" && "border-accent-amber/25 bg-accent-amber/[0.06]",
              tone === "coral" && "border-accent-coral/25 bg-accent-coral/[0.06]"
            )}
          >
            <p className="text-[11px] uppercase tracking-wide text-muted">Summary</p>
            <div className="text-sm space-y-1 font-number">
              <div className="flex justify-between">
                <span className="text-muted font-sans">Income</span>
                <span>{formatCurrency(incomeNum, stepCurrency)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted font-sans">Spending</span>
                <span>−{formatCurrency(totalSpending, stepCurrency)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted font-sans">Goals</span>
                <span>−{formatCurrency(totalGoalsPlan, stepCurrency)}</span>
              </div>
              <div className="flex justify-between pt-1 border-t border-white/[0.08] font-medium">
                <span className="text-muted font-sans">Buffer</span>
                <span
                  className={cn(
                    tone === "green" && "text-accent-green",
                    tone === "amber" && "text-accent-amber",
                    tone === "coral" && "text-accent-coral"
                  )}
                >
                  {formatCurrency(buffer, stepCurrency)}
                </span>
              </div>
            </div>
            <p className="text-xs text-muted leading-relaxed">{bufferHint(buffer, incomeNum)}</p>

            {tone === "coral" && cuts.length > 0 && (
              <div className="space-y-2 pt-1">
                <p className="text-xs font-medium text-accent-coral">Quick fixes</p>
                <ul className="text-[11px] text-muted list-disc pl-4 space-y-1">
                  {cuts.map((c, i) => (
                    <li key={i}>{c.label}</li>
                  ))}
                </ul>
                <Button type="button" size="sm" variant="secondary" onClick={applyCutSuggestions}>
                  Apply suggestions
                </Button>
              </div>
            )}
          </div>

          {error && <p className="text-sm text-accent-coral">{error}</p>}

          <Button className="w-full" loading={saving} onClick={savePlan}>
            Save plan for {monthTitle.split(" ")[0] ?? "month"}
          </Button>
        </div>
      )}
    </Modal>
  );
}
