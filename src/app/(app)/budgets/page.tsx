"use client";

import { useState, useMemo, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  PiggyBank,
  Trash2,
  Plus,
  Pencil,
  Sparkles,
  Telescope,
  AlertTriangle,
  ChevronRight,
  ChevronLeft,
  CalendarRange,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAppStore } from "@/lib/stores/app-store";
import { useAccounts, useAllTransactionsLedger } from "@/lib/hooks/use-accounts";
import {
  computeRunningBalance,
  type LedgerAccountRow,
  type LedgerTransactionRow,
} from "@/lib/account-ledger";
import { useCustomCategories, useCreateCustomCategory } from "@/lib/hooks/use-categories";
import { useProfile } from "@/lib/hooks/use-profile";
import { getCategoryLabel, type Currency } from "@/lib/constants";
import { formatCurrency, formatDateShort, daysLeftInMonth, cn } from "@/lib/utils";
import { formatRecurringHitLine } from "@/lib/recurring-expense-status";
import {
  aggregateExpenseByCategory,
  computeBudgetProgress,
  computeDailyBudgetNumber,
  unbudgetedSpending,
  plannedVersusIncome,
  totalMonthlyGoalTargets,
  monthlyGoalProgress,
  totalGoalsProgressThisMonth,
  remainingPlanHeadroom,
  observationDayCount,
  observationComplete,
  type ExpenseRow,
  type SavingsGoalRow,
  type GoalContributionRow,
  type RemittanceRow,
} from "@/lib/budget-engine";
import {
  currentMonthStart,
  shiftMonthStart,
  nextMonthStart,
  formatPlannerMonthTitle,
  bufferTone,
  bufferHint,
  sumIncomeInMonth,
} from "@/lib/monthly-planner";
import { MonthlyPlannerModal } from "@/components/budgets/monthly-planner-modal";
import type { BudgetMode } from "@/lib/stores/app-store";
import { Card } from "@/components/ui/card";
import { FAB } from "@/components/ui/fab";
import { Modal } from "@/components/ui/modal";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { CurrencyToggle } from "@/components/ui/currency-toggle";
import { ProgressBar } from "@/components/ui/progress-bar";
import { EmptyState } from "@/components/ui/empty-state";
import { ShimmerCard } from "@/components/ui/shimmer";
import { CategoryPicker } from "@/components/ui/category-picker";
import { CreateCategoryModal } from "@/components/ui/create-category-modal";
import { CreateGoalModal } from "@/components/goals/create-goal-modal";
import { ContributeGoalModal } from "@/components/goals/contribute-goal-modal";

const GOAL_EMOJI: Record<string, string> = {
  send_home: "🇮🇳",
  emergency: "🛡️",
  invest: "📈",
  travel: "✈️",
  education: "🎓",
  custom: "✏️",
};

const OVER_BUDGET_MESSAGES = [
  "No stress — awareness is the first step. Let's see what we can trim next week.",
  "Happens to the best of us. Tomorrow's a fresh start.",
  "A little over is okay. Just keep an eye on it the next few days.",
];

export default function BudgetsPage() {
  const router = useRouter();
  const supabase = createClient();
  const qc = useQueryClient();
  const setProfile = useAppStore((s) => s.setProfile);
  const profile = useAppStore((s) => s.profile);
  const { data: accounts } = useAccounts();
  const { data: ledgerTxs } = useAllTransactionsLedger();

  const txsByAccountId = useMemo(() => {
    const m = new Map<string, LedgerTransactionRow[]>();
    if (!ledgerTxs) return m;
    for (const row of ledgerTxs as any[]) {
      const aid = row.account_id as string;
      const t: LedgerTransactionRow = {
        amount: row.amount,
        type: row.type,
        date: row.date,
        created_at: row.created_at,
      };
      if (!m.has(aid)) m.set(aid, []);
      m.get(aid)!.push(t);
    }
    return m;
  }, [ledgerTxs]);
  const { data: customCategories } = useCustomCategories();
  const createCustomCategory = useCreateCustomCategory();
  const { refetch: refetchProfile } = useProfile();

  const [showAdd, setShowAdd] = useState(false);
  const [showCreateCategory, setShowCreateCategory] = useState(false);
  const [category, setCategory] = useState("");
  const [limit, setLimit] = useState("");
  const [currency, setCurrency] = useState<Currency>(profile?.primary_currency || "USD");
  const [formError, setFormError] = useState("");

  const [editingBudget, setEditingBudget] = useState<any>(null);
  const [editLimit, setEditLimit] = useState("");
  const [editError, setEditError] = useState("");

  const [adjustSuggestion, setAdjustSuggestion] = useState<any>(null);
  const [adjustAmount, setAdjustAmount] = useState("");
  const [genLoading, setGenLoading] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviewText, setReviewText] = useState("");
  const [reviewLoading, setReviewLoading] = useState(false);
  const [showCreateGoal, setShowCreateGoal] = useState(false);
  const [contributeFor, setContributeFor] = useState<{
    id: string;
    currency: Currency;
    current_balance: number;
    target_amount: number | null;
  } | null>(null);

  const [viewMonth, setViewMonth] = useState(() => currentMonthStart());
  const [showPlanner, setShowPlanner] = useState(false);
  const [plannerSnapshotNote, setPlannerSnapshotNote] = useState<string | null>(null);

  const budgetMode: BudgetMode = profile?.budget_mode ?? "active";
  const obsStart = profile?.budget_observation_started_at
    ? new Date(profile.budget_observation_started_at)
    : null;

  useEffect(() => {
    if (!profile?.id) return;
    if (budgetMode === "observing" && !profile.budget_observation_started_at) {
      supabase
        .from("profiles")
        .update({ budget_observation_started_at: new Date().toISOString() })
        .eq("id", profile.id)
        .then(() => {
          refetchProfile();
        });
    }
  }, [profile?.id, budgetMode, profile?.budget_observation_started_at, supabase, refetchProfile]);

  const monthStart = viewMonth;
  const monthEndExclusive = nextMonthStart(monthStart);
  const todayMonthStart = currentMonthStart();
  /** Next calendar month — allowed for “plan ahead” while still in the current month. */
  const nextPlanningMonth = shiftMonthStart(todayMonthStart, 1);
  const isViewingCurrentMonth = monthStart === todayMonthStart;
  const isViewingNextMonthForPlanning = monthStart === nextPlanningMonth;
  const canOpenMonthlyPlanner =
    budgetMode === "active" &&
    (isViewingCurrentMonth || isViewingNextMonthForPlanning);

  const { data: budgets, isLoading: loadingBudgets } = useQuery({
    queryKey: ["budgets"],
    queryFn: async () => {
      const { data, error } = await supabase.from("budgets").select("*");
      if (error) throw error;
      return data;
    },
  });

  const { data: transactions, error: monthTxError } = useQuery({
    queryKey: ["month-transactions-budget", monthStart],
    queryFn: async () => {
      // Use * so the query still works if optional columns (e.g. recurring_expense_id)
      // are missing before migrations are applied.
      const { data, error } = await supabase
        .from("transactions")
        .select("*")
        .eq("type", "expense")
        .gte("date", monthStart)
        .lt("date", monthEndExclusive);
      if (error) throw error;
      return data;
    },
  });

  const { data: recurringExpenseRows } = useQuery({
    queryKey: ["recurring-expenses"],
    queryFn: async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return [];
      const { data, error } = await supabase
        .from("recurring_expenses")
        .select("*")
        .eq("user_id", user.id)
        .eq("is_active", true)
        .order("label");
      if (error) throw error;
      return data ?? [];
    },
  });

  const prevMonthStart = shiftMonthStart(monthStart, -1);

  const { data: prevMonthExpenses } = useQuery({
    queryKey: ["month-transactions-prev-budget", prevMonthStart],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("transactions")
        .select("amount, category, type, currency, source")
        .eq("type", "expense")
        .gte("date", prevMonthStart)
        .lt("date", monthStart);
      if (error) throw error;
      return data;
    },
  });

  const { data: prevMonthIncomeTxs } = useQuery({
    queryKey: ["month-income-prev-budget", prevMonthStart],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("transactions")
        .select("amount, type, date")
        .eq("type", "income")
        .gte("date", prevMonthStart)
        .lt("date", monthStart);
      if (error) throw error;
      return data;
    },
  });

  const { data: plannerExpenseHistory } = useQuery({
    queryKey: ["planner-expense-history", monthStart],
    queryFn: async () => {
      const from = shiftMonthStart(monthStart, -3);
      const { data, error } = await supabase
        .from("transactions")
        .select("amount, category, type, currency, source")
        .eq("type", "expense")
        .gte("date", from)
        .lt("date", monthEndExclusive);
      if (error) throw error;
      return data;
    },
  });

  const { data: savedMonthlyPlan } = useQuery({
    queryKey: ["monthly-plan", monthStart],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("monthly_plans")
        .select("*")
        .eq("month", monthStart)
        .maybeSingle();
      if (error) return null;
      return data;
    },
  });

  const { data: suggestions } = useQuery({
    queryKey: ["budget-suggestions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("budget_suggestions")
        .select("*")
        .eq("status", "pending")
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data;
    },
    enabled: budgetMode === "suggested",
  });

  const { data: goals } = useQuery({
    queryKey: ["goals"],
    queryFn: async () => {
      const { data, error } = await supabase.from("savings_goals").select("*");
      if (error) throw error;
      return data;
    },
  });

  const { data: goalContributions } = useQuery({
    queryKey: ["goal-contributions-month", monthStart],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("goal_contributions")
        .select("goal_id, amount, date")
        .gte("date", monthStart)
        .lt("date", monthEndExclusive);
      if (error) throw error;
      return data;
    },
  });

  const { data: remittances } = useQuery({
    queryKey: ["remittances-month", monthStart],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("remittances")
        .select("*")
        .gte("date", monthStart)
        .lt("date", monthEndExclusive);
      if (error) throw error;
      return data;
    },
  });

  const expenses: ExpenseRow[] = useMemo(() => {
    return (transactions || []).map((t: any) => ({
      amount: Number(t.amount),
      category: t.category,
      currency: t.currency,
      type: "expense" as const,
      source: (t.source as "manual" | "split") || "manual",
    }));
  }, [transactions]);

  const prevMonthSpendByCategory = useMemo(() => {
    const rows: ExpenseRow[] = (prevMonthExpenses || []).map((t: any) => ({
      amount: Number(t.amount),
      category: t.category,
      currency: t.currency,
      type: "expense" as const,
      source: (t.source as "manual" | "split") || "manual",
    }));
    const agg = aggregateExpenseByCategory(rows);
    const map = new Map<string, number>();
    Array.from(agg.entries()).forEach(([cat, row]) => {
      map.set(cat, row.spentTotal);
    });
    return map;
  }, [prevMonthExpenses]);

  const plannerExpenseRows: ExpenseRow[] = useMemo(() => {
    return (plannerExpenseHistory || []).map((t: any) => ({
      amount: Number(t.amount),
      category: t.category,
      currency: t.currency,
      type: "expense" as const,
      source: (t.source as "manual" | "split") || "manual",
    }));
  }, [plannerExpenseHistory]);

  const lastMonthIncomeHint = useMemo(
    () =>
      sumIncomeInMonth(
        (prevMonthIncomeTxs || []).map((t: any) => ({
          amount: Number(t.amount),
          type: t.type,
          date: t.date,
        })),
        prevMonthStart,
        monthStart
      ),
    [prevMonthIncomeTxs, prevMonthStart, monthStart]
  );

  const byCat = useMemo(() => aggregateExpenseByCategory(expenses), [expenses]);
  const budgetRows = useMemo(
    () =>
      (budgets || []).map((b: any) => ({
        id: b.id,
        category: b.category,
        monthly_limit: Number(b.monthly_limit),
        currency: b.currency as Currency,
      })),
    [budgets]
  );

  const budgetProgress = useMemo(
    () => computeBudgetProgress(budgetRows, byCat),
    [budgetRows, byCat]
  );

  const budgetedCats = useMemo(
    () => new Set((budgets || []).map((b: any) => b.category)),
    [budgets]
  );

  const unbudgeted = useMemo(
    () => unbudgetedSpending(byCat, budgetedCats),
    [byCat, budgetedCats]
  );

  const daily = useMemo(
    () => computeDailyBudgetNumber(budgetRows, byCat),
    [budgetRows, byCat]
  );

  const totalBudgetLimits = budgetRows.reduce((s, b) => s + b.monthly_limit, 0);
  const goalTargets = totalMonthlyGoalTargets(goals || []);
  const planned = plannedVersusIncome(
    totalBudgetLimits,
    goalTargets,
    profile?.monthly_income
  );

  const monthSpendTotal = useMemo(() => {
    return Array.from(byCat.values()).reduce((s, v) => s + v.spentTotal, 0);
  }, [byCat]);

  const obsDay = observationDayCount(obsStart);
  const obsDone = observationComplete(obsStart);

  const observationRows = useMemo(() => {
    return Array.from(byCat.values()).sort((a, b) => b.spentTotal - a.spentTotal);
  }, [byCat]);

  const updateProfileMode = useMutation({
    mutationFn: async (updates: Record<string, unknown>) => {
      const { error } = await supabase
        .from("profiles")
        .update(updates)
        .eq("id", profile!.id);
      if (error) throw error;
    },
    onSuccess: async () => {
      await refetchProfile();
      const { data: p } = await supabase.from("profiles").select("*").eq("id", profile!.id).single();
      if (p) setProfile(p as any);
    },
  });

  const addBudget = useMutation({
    mutationFn: async (budget: {
      category: string;
      monthly_limit: number;
      currency: string;
    }) => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const { data, error } = await supabase
        .from("budgets")
        .insert({ ...budget, user_id: user!.id })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["budgets"] }),
  });

  const deleteBudget = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("budgets").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["budgets"] }),
  });

  const updateBudget = useMutation({
    mutationFn: async ({
      id,
      monthly_limit,
    }: {
      id: string;
      monthly_limit: number;
    }) => {
      const { error } = await supabase
        .from("budgets")
        .update({ monthly_limit })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["budgets"] }),
  });

  const acceptSuggestion = useMutation({
    mutationFn: async ({
      row,
      limitAmt,
    }: {
      row: any;
      limitAmt: number;
    }) => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const { error: upErr } = await supabase.from("budgets").upsert(
        {
          user_id: user!.id,
          category: row.category,
          monthly_limit: limitAmt,
          currency: row.currency,
        },
        { onConflict: "user_id,category" }
      );
      if (upErr) throw upErr;
      await supabase
        .from("budget_suggestions")
        .update({ status: "accepted" })
        .eq("id", row.id);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["budgets"] });
      qc.invalidateQueries({ queryKey: ["budget-suggestions"] });
    },
  });

  const skipSuggestion = useMutation({
    mutationFn: async (id: string) => {
      await supabase
        .from("budget_suggestions")
        .update({ status: "skipped" })
        .eq("id", id);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["budget-suggestions"] }),
  });

  const existingCategories = new Set(budgets?.map((b: any) => b.category) || []);

  const totalAccountBalance =
    accounts?.reduce((s: number, a: any) => {
      if (a.type === "credit_card") return s;
      const bal = computeRunningBalance(
        a as LedgerAccountRow,
        txsByAccountId.get(a.id) || []
      );
      return s + bal;
    }, 0) || 0;
  const monthlyIncome = profile?.monthly_income || 0;
  const bufferAmount =
    monthlyIncome > 0 ? monthlyIncome - planned.totalPlanned : 0;
  const planBufferTone = bufferTone(bufferAmount, monthlyIncome);
  const planHeadroom = remainingPlanHeadroom(
    profile?.monthly_income,
    totalAccountBalance,
    totalBudgetLimits,
    goalTargets
  );
  const remainingToBudget = planHeadroom;

  const goalContribRows: GoalContributionRow[] = useMemo(
    () =>
      (goalContributions || []).map((c: any) => ({
        goal_id: c.goal_id,
        amount: Number(c.amount),
        date: c.date,
      })),
    [goalContributions]
  );

  const goalRemittanceRows: RemittanceRow[] = useMemo(
    () =>
      (remittances || []).map((r: any) => ({
        goal_id: r.goal_id ?? null,
        amount_sent: Number(r.amount_sent),
        date: r.date,
        from_currency: r.from_currency as Currency,
      })),
    [remittances]
  );

  const goalsMonthProgress = useMemo(() => {
    const gRows: SavingsGoalRow[] = (goals || []).map((g: any) => ({
      id: g.id,
      goal_type: g.goal_type,
      monthly_target: g.monthly_target,
      is_recurring: g.is_recurring,
      current_balance: g.current_balance,
      target_amount: g.target_amount,
      currency: g.currency,
    }));
    return totalGoalsProgressThisMonth(
      gRows,
      goalContribRows,
      goalRemittanceRows,
      monthStart
    );
  }, [goals, goalContribRows, goalRemittanceRows, monthStart]);

  const recurringGoalsForCount = useMemo(
    () =>
      (goals || []).filter(
        (g: any) => g.is_recurring && g.monthly_target && Number(g.monthly_target) > 0
      ),
    [goals]
  );

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setFormError("");
    if (!category) {
      setFormError("Pick a category");
      return;
    }
    const num = parseFloat(limit);
    if (!num || num <= 0) {
      setFormError("Limit must be greater than 0");
      return;
    }
    try {
      await addBudget.mutateAsync({ category, monthly_limit: num, currency });
      setShowAdd(false);
      setCategory("");
      setLimit("");
    } catch (err: any) {
      setFormError(err.message);
    }
  }

  async function handleEditSave(e: React.FormEvent) {
    e.preventDefault();
    setEditError("");
    const num = parseFloat(editLimit);
    if (!num || num <= 0) {
      setEditError("Limit must be greater than 0");
      return;
    }
    try {
      await updateBudget.mutateAsync({
        id: editingBudget.id,
        monthly_limit: num,
      });
      setEditingBudget(null);
      setEditLimit("");
    } catch (err: any) {
      setEditError(err.message);
    }
  }

  async function runGenerateSuggestions() {
    setGenLoading(true);
    try {
      const res = await fetch("/api/budget/suggestions", { method: "POST" });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "Failed");
      await refetchProfile();
      const { data: p } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", profile!.id)
        .single();
      if (p) setProfile(p as any);
      qc.invalidateQueries({ queryKey: ["budget-suggestions"] });
    } catch (e: any) {
      alert(e.message);
    } finally {
      setGenLoading(false);
    }
  }

  async function loadMonthReview() {
    setReviewLoading(true);
    setReviewText("");
    try {
      const res = await fetch("/api/month-review");
      const j = await res.json();
      if (!res.ok) throw new Error(j.error);
      setReviewText(j.review);
      setReviewOpen(true);
    } catch (e: any) {
      alert(e.message);
    } finally {
      setReviewLoading(false);
    }
  }

  const showFab = budgetMode === "active";

  if (loadingBudgets) {
    return (
      <div className="space-y-4 animate-fade-in">
        <h1 className="text-xl font-semibold">Budgets</h1>
        <ShimmerCard />
        <ShimmerCard />
        <ShimmerCard />
      </div>
    );
  }

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold">Budgets</h1>
          <p className="text-xs text-muted">
            {isViewingCurrentMonth
              ? `${daysLeftInMonth()} days left in month`
              : isViewingNextMonthForPlanning
                ? `Planning ahead · ${formatPlannerMonthTitle(monthStart)}`
                : `Viewing ${formatPlannerMonthTitle(monthStart)}`}{" "}
            · Mode: <span className="text-white/80 capitalize">{budgetMode}</span>
          </p>
          <Link
            href="/recurring"
            className="text-xs text-accent-blue hover:underline mt-1 inline-block"
          >
            View all recurring →
          </Link>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center rounded-xl border border-white/[0.1] bg-white/[0.02]">
            <button
              type="button"
              aria-label="Previous month"
              className="p-2 rounded-l-xl hover:bg-white/[0.06] text-muted hover:text-white"
              onClick={() => setViewMonth(shiftMonthStart(monthStart, -1))}
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-xs font-medium px-2 min-w-[7.5rem] text-center tabular-nums">
              {formatPlannerMonthTitle(monthStart)}
            </span>
            <button
              type="button"
              aria-label="Next month"
              disabled={shiftMonthStart(monthStart, 1) > nextPlanningMonth}
              className="p-2 rounded-r-xl hover:bg-white/[0.06] text-muted hover:text-white disabled:opacity-30 disabled:pointer-events-none"
              onClick={() => setViewMonth(shiftMonthStart(monthStart, 1))}
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
          {canOpenMonthlyPlanner && (
            <Button size="sm" variant="secondary" onClick={() => setShowPlanner(true)}>
              <CalendarRange className="w-4 h-4 mr-1.5" />
              {savedMonthlyPlan
                ? "Adjust plan"
                : isViewingNextMonthForPlanning
                  ? `Plan ${formatPlannerMonthTitle(monthStart).split(" ")[0] ?? "month"}`
                  : "Plan month"}
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={loadMonthReview}
            loading={reviewLoading}
          >
            Month review
          </Button>
        </div>
      </div>

      {plannerSnapshotNote && (
        <Card className="border border-accent-amber/30 bg-accent-amber/[0.06] space-y-2">
          <p className="text-sm text-accent-amber leading-relaxed">{plannerSnapshotNote}</p>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="text-xs"
            onClick={() => setPlannerSnapshotNote(null)}
          >
            Dismiss
          </Button>
        </Card>
      )}

      {isViewingCurrentMonth &&
        budgetMode === "active" &&
        daysLeftInMonth() <= 2 && (
          <Card className="border border-accent-blue/20 bg-accent-blue/[0.05] space-y-1">
            <p className="text-sm font-medium text-accent-blue flex items-center gap-2">
              <CalendarRange className="w-4 h-4 shrink-0" />
              Next month is almost here
            </p>
            <p className="text-xs text-muted leading-relaxed">
              Open <strong className="text-white/80">Plan month</strong> to draft{" "}
              {formatPlannerMonthTitle(shiftMonthStart(monthStart, 1))} from this month’s
              budgets and goals.
            </p>
          </Card>
        )}

      {budgetMode === "active" && budgetRows.length > 0 && isViewingCurrentMonth && (
        <Card className="space-y-2 border border-accent-green/20 bg-accent-green/[0.06]">
          <p className="text-[11px] text-muted uppercase tracking-wide">
            Today you can spend (daily)
          </p>
          <p className="font-number text-2xl font-semibold text-accent-green">
            {formatCurrency(daily.perDay, profile?.primary_currency || "USD")}
            <span className="text-sm font-normal text-muted"> / day</span>
          </p>
          <p className="text-xs text-muted">
            {formatCurrency(daily.remaining, profile?.primary_currency || "USD")}{" "}
            left across budget categories · {daily.daysLeft} days left
          </p>
        </Card>
      )}

      {budgetMode === "observing" && (
        <Card className="space-y-4 border border-accent-blue/20">
          <div className="flex items-center gap-2">
            <Telescope className="w-5 h-5 text-accent-blue" />
            <div>
              <p className="text-sm font-medium">Learning your spending</p>
              <p className="text-xs text-muted">
                Day {Math.min(obsDay, 30)}/30
                {!obsDone && " — then you can generate AI budget suggestions"}
              </p>
            </div>
          </div>
          {monthlyIncome > 0 && monthSpendTotal > monthlyIncome && (
            <p className="text-xs text-accent-coral">
              You&apos;re spending more than your stated income this month in tracked
              categories.
            </p>
          )}
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {observationRows.length === 0 ? (
              <p className="text-sm text-muted">No spending yet this month.</p>
            ) : (
              observationRows.map((row) => (
                <div
                  key={row.category}
                  className="flex justify-between text-sm border-b border-white/[0.06] pb-2"
                >
                  <span>
                    {getCategoryLabel(row.category, customCategories)}
                  </span>
                  <span className="font-number text-right">
                    {formatCurrency(row.spentTotal, profile?.primary_currency || "USD")}
                    <span className="block text-[10px] text-muted font-sans font-normal">
                      Split {formatCurrency(row.spentSplit, profile?.primary_currency || "USD")} · Personal{" "}
                      {formatCurrency(row.spentPersonal, profile?.primary_currency || "USD")}
                    </span>
                  </span>
                </div>
              ))
            )}
          </div>
          <Button
            className="w-full"
            disabled={!obsDone || genLoading}
            loading={genLoading}
            onClick={runGenerateSuggestions}
          >
            <Sparkles className="w-4 h-4 mr-2" />
            {obsDone ? "Generate AI budget suggestions" : `Keep logging (${30 - obsDay} days left)`}
          </Button>
        </Card>
      )}

      {budgetMode === "suggested" && (
        <div className="space-y-3">
          <p className="text-sm text-muted">
            Review suggestions below. Accept to add a budget, adjust the amount, or skip.
          </p>
          {(suggestions || []).map((s: any) => (
            <Card key={s.id} className="space-y-3">
              <div>
                <p className="text-sm font-medium">
                  {getCategoryLabel(s.category, customCategories)}
                </p>
                <p className="text-xs text-muted">
                  Spent {formatCurrency(s.actual_spent, s.currency)} (split{" "}
                  {formatCurrency(s.split_portion, s.currency)} · personal{" "}
                  {formatCurrency(s.personal_portion, s.currency)})
                </p>
                <p className="text-sm mt-2">
                  Suggested:{" "}
                  <span className="font-number font-semibold">
                    {formatCurrency(s.suggested_limit, s.currency)}/mo
                  </span>
                </p>
                {s.ai_reasoning && (
                  <p className="text-xs text-muted mt-2 leading-relaxed">{s.ai_reasoning}</p>
                )}
              </div>
              <div className="flex gap-2 flex-wrap">
                <Button
                  size="sm"
                  onClick={() =>
                    acceptSuggestion.mutate({
                      row: s,
                      limitAmt: s.suggested_limit,
                    })
                  }
                  loading={acceptSuggestion.isPending}
                >
                  Accept
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    setAdjustSuggestion(s);
                    setAdjustAmount(String(s.suggested_limit));
                  }}
                >
                  Adjust
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => skipSuggestion.mutate(s.id)}
                >
                  Skip
                </Button>
              </div>
            </Card>
          ))}
          {(suggestions || []).length === 0 && (
            <p className="text-sm text-muted">No pending suggestions.</p>
          )}
          <Button
            variant="secondary"
            className="w-full"
            onClick={() => updateProfileMode.mutate({ budget_mode: "active" })}
            loading={updateProfileMode.isPending}
          >
            Continue to tracking
          </Button>
        </div>
      )}

      {budgetMode === "active" && (
        <>
          {monthTxError && (
            <Card className="border border-accent-coral/30 bg-accent-coral/[0.06]">
              <p className="text-sm text-accent-coral leading-relaxed">
                Couldn&apos;t load this month&apos;s spending for budget progress.{" "}
                {(monthTxError as Error).message || "Check your connection and try again."}
              </p>
            </Card>
          )}
          <div className="flex justify-between items-center gap-2 py-1 border-b border-white/[0.06]">
            <span className="text-[11px] font-medium text-muted uppercase tracking-wide">
              Income
            </span>
            <span className="font-number text-base font-semibold">
              {monthlyIncome > 0
                ? formatCurrency(monthlyIncome, profile?.primary_currency || "USD")
                : "— set in Settings"}
            </span>
          </div>

          {unbudgeted.total > 0 && (
            <Card className="border border-white/[0.08]">
              <p className="text-xs text-muted mb-2">Unbudgeted spending this month</p>
              <p className="font-number text-lg">
                {formatCurrency(unbudgeted.total, profile?.primary_currency || "USD")}
              </p>
            </Card>
          )}

          {budgetProgress.length === 0 ? (
            <EmptyState
              icon={<PiggyBank className="w-12 h-12" />}
              title="No budgets yet"
              description="Set limits per category. Your Splitwise share counts toward the same categories as personal spending."
              actionLabel="Set a Budget"
              onAction={() => setShowAdd(true)}
            />
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2 pt-1">
                <p className="text-[11px] uppercase tracking-wide text-muted">
                  Spending
                  <span className="text-white font-number normal-case ml-1.5">
                    ({formatCurrency(totalBudgetLimits, profile?.primary_currency || "USD")}{" "}
                    planned)
                  </span>
                </p>
              </div>
              {budgetProgress.map((b: any) => {
                const exceeded = b.pct >= 100;
                const warning = b.pct >= 80 && !exceeded;
                const recForCat = (recurringExpenseRows || []).filter(
                  (r: any) => r.category === b.category
                );
                const catTxs = (transactions || []).filter(
                  (t: any) => t.category === b.category
                );
                const fixedSpent = catTxs
                  .filter((t: any) => t.recurring_expense_id)
                  .reduce((s: number, t: any) => s + Number(t.amount), 0);
                const variableSpent = catTxs
                  .filter((t: any) => !t.recurring_expense_id)
                  .reduce((s: number, t: any) => s + Number(t.amount), 0);
                const txHits = catTxs.map((t: any) => ({
                  recurring_expense_id: t.recurring_expense_id,
                  date: t.date,
                  amount: Number(t.amount),
                  note: t.note,
                  source: t.source,
                }));
                const variableLines = catTxs
                  .filter((t: any) => !t.recurring_expense_id)
                  .sort((a: any, b: any) => b.date.localeCompare(a.date))
                  .slice(0, 5);
                return (
                  <Card
                    key={b.id}
                    className={cn(exceeded && "animate-pulse_glow")}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div>
                        <p className="text-sm font-medium">
                          {getCategoryLabel(b.category, customCategories)}
                        </p>
                        <p className="font-number text-xs text-muted">
                          {formatCurrency(b.spent, b.currency)} /{" "}
                          {formatCurrency(b.monthly_limit, b.currency)}
                        </p>
                        <p className="text-[10px] text-muted mt-1">
                          Split {formatCurrency(b.spentSplit, b.currency)} · Personal{" "}
                          {formatCurrency(b.spentPersonal, b.currency)}
                        </p>
                        {(recForCat.length > 0 || fixedSpent > 0 || variableSpent > 0) && (
                          <p className="text-[10px] text-white/55 mt-1 font-number">
                            Fixed spent {formatCurrency(fixedSpent, b.currency)} · Variable{" "}
                            {formatCurrency(variableSpent, b.currency)}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        {exceeded && (
                          <span className="text-xs text-accent-coral font-medium">
                            Exceeded
                          </span>
                        )}
                        {warning && (
                          <span className="text-xs text-accent-amber font-medium">
                            Heads up
                          </span>
                        )}
                        <button
                          type="button"
                          onClick={() => {
                            setEditingBudget(b);
                            setEditLimit(String(b.monthly_limit));
                          }}
                          className="p-1 rounded-lg hover:bg-white/[0.05] text-muted"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteBudget.mutate(b.id)}
                          className="p-1 rounded-lg hover:bg-white/[0.05] text-muted"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                    <ProgressBar value={b.spent} max={b.monthly_limit} />
                    {recForCat.length > 0 && (
                      <div className="mt-3 pt-2 border-t border-white/[0.06] space-y-1.5">
                        <p className="text-[10px] uppercase tracking-wide text-muted">
                          Fixed expenses
                        </p>
                        {recForCat.map((re: any) => {
                          const { icon, line } = formatRecurringHitLine(
                            {
                              id: re.id,
                              category: re.category,
                              label: re.label,
                              expected_amount: Number(re.expected_amount),
                              currency: re.currency,
                              recurrence: re.recurrence,
                              expected_day_of_month: re.expected_day_of_month,
                              last_hit_date: re.last_hit_date,
                            },
                            monthStart,
                            monthEndExclusive,
                            txHits,
                            new Date(),
                            isViewingCurrentMonth
                          );
                          return (
                            <div
                              key={re.id}
                              className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-[11px]"
                            >
                              <span className="shrink-0">
                                {icon === "hit" ? "✅" : "⏳"}{" "}
                                <span className="text-white/90">{re.label}</span>
                              </span>
                              <span className="font-number text-white/80">
                                {formatCurrency(
                                  Number(re.expected_amount),
                                  re.currency
                                )}
                              </span>
                              <span className="text-muted text-[10px]">{line}</span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                    {variableLines.length > 0 && (
                      <div className="mt-2 space-y-1">
                        <p className="text-[10px] uppercase tracking-wide text-muted">
                          Variable this month
                        </p>
                        {variableLines.map((t: any) => (
                          <div
                            key={t.id}
                            className="flex justify-between gap-2 text-[11px] text-white/75"
                          >
                            <span className="truncate min-w-0">
                              {(t.note || "Expense").slice(0, 48)}
                              {t.source === "split" ? " (Split)" : ""}
                            </span>
                            <span className="font-number shrink-0 text-muted">
                              {formatDateShort(t.date)}
                            </span>
                            <span className="font-number shrink-0">
                              {formatCurrency(Number(t.amount), t.currency)}
                            </span>
                          </div>
                        ))}
                        <p className="text-[10px] text-muted font-number pt-0.5">
                          Variable total: {formatCurrency(variableSpent, b.currency)}
                        </p>
                      </div>
                    )}
                    {exceeded && (
                      <p className="text-xs text-accent-coral/70 mt-2">
                        {
                          OVER_BUDGET_MESSAGES[
                            b.category.length % OVER_BUDGET_MESSAGES.length
                          ]
                        }
                      </p>
                    )}
                  </Card>
                );
              })}
            </div>
          )}

          {showFab && (
            <FAB onClick={() => setShowAdd(true)} />
          )}

          <Card className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-semibold">
                Goals
                <span className="text-xs font-normal text-muted font-number ml-1.5">
                  ({formatCurrency(goalTargets, profile?.primary_currency || "USD")} planned)
                </span>
              </p>
              <div className="flex items-center gap-2 flex-wrap justify-end">
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={() => setShowCreateGoal(true)}
                  className="shrink-0"
                >
                  <Plus className="w-4 h-4 mr-1" /> Add Goal
                </Button>
                <Link
                  href="/goals"
                  className="text-xs text-accent-blue whitespace-nowrap"
                >
                  View all goals →
                </Link>
              </div>
            </div>
            {!goals?.length ? (
              <p className="text-xs text-muted">
                No goals yet. Add one to track monthly contributions alongside your budgets.
              </p>
            ) : (
              <div className="space-y-3">
                {(goals as any[]).map((g) => {
                  const emoji = GOAL_EMOJI[g.goal_type || "custom"] || "🎯";
                  const hasMonthly =
                    g.is_recurring &&
                    g.monthly_target != null &&
                    Number(g.monthly_target) > 0;
                  const gLedger: SavingsGoalRow = {
                    id: g.id,
                    goal_type: g.goal_type,
                    monthly_target: g.monthly_target,
                    is_recurring: g.is_recurring,
                    current_balance: g.current_balance,
                    target_amount: g.target_amount,
                    currency: g.currency,
                  };
                  const contributed = hasMonthly
                    ? monthlyGoalProgress(
                        gLedger,
                        goalContribRows,
                        goalRemittanceRows,
                        monthStart
                      )
                    : 0;
                  const mt = hasMonthly ? Number(g.monthly_target) : 0;
                  const met = hasMonthly && contributed >= mt;
                  const hasCap =
                    g.target_amount != null && Number(g.target_amount) > 0;
                  const overallPct = hasCap
                    ? (Number(g.current_balance) / Number(g.target_amount)) * 100
                    : null;

                  return (
                    <Card
                      key={g.id}
                      hover
                      className="space-y-2 cursor-pointer"
                      onClick={() => router.push(`/goals/${g.id}`)}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">
                            <span className="mr-1.5" aria-hidden>
                              {emoji}
                            </span>
                            {g.name}
                          </p>
                          {hasMonthly ? (
                            <p className="font-number text-xs text-muted mt-0.5">
                              {formatCurrency(contributed, g.currency)} /{" "}
                              {formatCurrency(mt, g.currency)} this month
                              {met && (
                                <span className="text-accent-green ml-1.5">✓ Done</span>
                              )}
                            </p>
                          ) : (
                            <p className="text-xs text-muted mt-0.5">
                              Set a monthly target on the goal detail page to track progress here.
                            </p>
                          )}
                          {hasCap ? (
                            <p className="text-[11px] text-muted mt-1">
                              {formatCurrency(g.current_balance, g.currency)} of{" "}
                              {formatCurrency(g.target_amount, g.currency)} total (
                              {Math.round(overallPct ?? 0)}%)
                            </p>
                          ) : hasMonthly ? (
                            <p className="text-[11px] text-muted mt-1">
                              Monthly target · no fixed savings cap
                            </p>
                          ) : null}
                        </div>
                      </div>
                      {hasMonthly && (
                        <ProgressBar
                          value={Math.min(contributed, mt)}
                          max={mt}
                        />
                      )}
                      <div
                        className="flex gap-2 pt-1"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {g.goal_type === "send_home" && hasMonthly ? (
                          <Button
                            type="button"
                            size="sm"
                            variant="secondary"
                            className="flex-1"
                            onClick={(e) => {
                              e.stopPropagation();
                              router.push(
                                `/remittances?amount=${encodeURIComponent(
                                  String(Math.max(0, mt - contributed))
                                )}`
                              );
                            }}
                          >
                            Send Now →
                          </Button>
                        ) : g.goal_type !== "send_home" && hasMonthly ? (
                          <Button
                            type="button"
                            size="sm"
                            variant="secondary"
                            className="flex-1"
                            onClick={() =>
                              setContributeFor({
                                id: g.id,
                                currency: g.currency,
                                current_balance: Number(g.current_balance) || 0,
                                target_amount:
                                  g.target_amount != null
                                    ? Number(g.target_amount)
                                    : null,
                              })
                            }
                          >
                            Contribute
                          </Button>
                        ) : null}
                      </div>
                    </Card>
                  );
                })}
              </div>
            )}
          </Card>

          <Card
            className={cn(
              "space-y-3",
              planBufferTone === "amber" &&
                monthlyIncome > 0 &&
                bufferAmount === 0 &&
                "border border-accent-amber/25 bg-accent-amber/[0.04]",
              planBufferTone === "coral" &&
                monthlyIncome > 0 &&
                "border border-accent-coral/25 bg-accent-coral/[0.04]",
              planBufferTone === "green" &&
                monthlyIncome > 0 &&
                bufferAmount > 0 &&
                "border border-accent-green/20 bg-accent-green/[0.04]"
            )}
          >
            <p className="text-[11px] text-muted uppercase tracking-wide">
              Summary — unified plan
            </p>
            <p className="text-[11px] text-muted leading-relaxed">
              Totals assume one currency when you mix USD/INR — use as a directional check.
            </p>
            <div className="space-y-1.5 text-sm">
              <div className="flex justify-between gap-2">
                <span className="text-muted">Income (stated)</span>
                <span className="font-number">
                  {monthlyIncome > 0
                    ? formatCurrency(monthlyIncome, profile?.primary_currency || "USD")
                    : "Not set — add in Settings"}
                </span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-muted">Spending budgets</span>
                <span className="font-number">
                  {formatCurrency(totalBudgetLimits, profile?.primary_currency || "USD")}
                  <span className="text-xs text-muted font-sans ml-1">
                    ({budgetRows.length} categories)
                  </span>
                </span>
              </div>
              <div className="flex justify-between gap-2 text-xs">
                <span className="text-muted">Spent this month (budget categories)</span>
                <span className="font-number">
                  {formatCurrency(daily.spentInBudgetCategories, profile?.primary_currency || "USD")}{" "}
                  <span className="text-muted">of {formatCurrency(totalBudgetLimits, profile?.primary_currency || "USD")}</span>
                </span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-muted">Goal targets</span>
                <span className="font-number">
                  {formatCurrency(goalTargets, profile?.primary_currency || "USD")}
                  <span className="text-xs text-muted font-sans ml-1">
                    ({recurringGoalsForCount.length} goals)
                  </span>
                </span>
              </div>
              <div className="flex justify-between gap-2 text-xs">
                <span className="text-muted">Goals progress (month)</span>
                <span className="font-number">
                  {formatCurrency(goalsMonthProgress.contributed, profile?.primary_currency || "USD")}{" "}
                  <span className="text-muted">
                    of {formatCurrency(goalsMonthProgress.target, profile?.primary_currency || "USD")}
                  </span>
                </span>
              </div>
              <div className="flex justify-between gap-2 font-medium pt-1 border-t border-white/[0.06]">
                <span className="text-muted">Total planned</span>
                <span className="font-number">
                  {formatCurrency(planned.totalPlanned, profile?.primary_currency || "USD")}
                </span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-muted">Buffer</span>
                <span
                  className={cn(
                    "font-number",
                    planBufferTone === "green" && monthlyIncome > 0 && "text-accent-green",
                    planBufferTone === "amber" && monthlyIncome > 0 && "text-accent-amber",
                    planBufferTone === "coral" && monthlyIncome > 0 && "text-accent-coral"
                  )}
                >
                  {monthlyIncome > 0
                    ? formatCurrency(bufferAmount, profile?.primary_currency || "USD")
                    : "—"}
                </span>
              </div>
            </div>
            {monthlyIncome > 0 && (
              <p className="text-xs text-muted leading-relaxed">{bufferHint(bufferAmount, monthlyIncome)}</p>
            )}
            {monthlyIncome > 0 && planned.isOver && (
              <div className="rounded-xl border border-accent-amber/30 bg-accent-amber/[0.06] p-3 space-y-2">
                <p className="text-sm font-medium text-accent-amber flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  Over by{" "}
                  {formatCurrency(planned.overBy, profile?.primary_currency || "USD")}
                </p>
                <p className="text-xs text-muted">
                  You&apos;re planning more than your stated income. Trim a budget, lower a goal target, or raise income in Settings.
                </p>
                <Link
                  href="/coach?adjust=1"
                  className="inline-flex items-center gap-1 text-xs text-accent-blue font-medium"
                >
                  Show me where to adjust <ChevronRight className="w-3 h-3" />
                </Link>
              </div>
            )}
            {monthlyIncome > 0 && !planned.isOver && (
              <p className="text-xs text-accent-green flex items-center gap-1.5">
                <span aria-hidden>✓</span> Your plan fits within your stated income.
              </p>
            )}
          </Card>
        </>
      )}

      <Modal open={showAdd} onClose={() => setShowAdd(false)} title="Set a Budget">
        <form onSubmit={handleAdd} className="space-y-4">
          {remainingToBudget > 0 && (
            <div className="p-3 rounded-xl bg-accent-green/10 border border-accent-green/20">
              <p className="text-xs text-accent-green">
                {formatCurrency(remainingToBudget, currency)} remaining to assign
                {monthlyIncome > 0
                  ? " (income − budgets − goal targets)"
                  : " (account total − budgets − goal targets)"}
              </p>
            </div>
          )}
          {remainingToBudget <= 0 && (monthlyIncome > 0 || totalAccountBalance > 0) && (
            <div className="p-3 rounded-xl border border-accent-amber/30 bg-accent-amber/[0.06]">
              <p className="text-xs text-accent-amber">
                Budgets and goal targets already use your available monthly number. You can still add this budget — consider adjusting elsewhere.
              </p>
            </div>
          )}
          <div className="space-y-1.5">
            <label className="block text-sm text-muted">Category</label>
            <CategoryPicker
              value={category}
              type="expense"
              customCategories={customCategories}
              onChange={setCategory}
              onCreateNew={() => setShowCreateCategory(true)}
              exclude={existingCategories}
            />
          </div>
          <div className="flex gap-3 items-end">
            <div className="flex-1">
              <Input
                label="Monthly Limit"
                type="number"
                step="0.01"
                min="0"
                placeholder="0.00"
                value={limit}
                onChange={(e) => setLimit(e.target.value)}
                className="font-number"
              />
            </div>
            <CurrencyToggle value={currency} onChange={setCurrency} />
          </div>
          {formError && (
            <p className="text-sm text-accent-coral">{formError}</p>
          )}
          <Button type="submit" className="w-full" loading={addBudget.isPending}>
            Set Budget
          </Button>
        </form>
      </Modal>

      <Modal
        open={!!editingBudget}
        onClose={() => setEditingBudget(null)}
        title={`Edit: ${editingBudget ? getCategoryLabel(editingBudget.category, customCategories) : ""}`}
      >
        <form onSubmit={handleEditSave} className="space-y-4">
          <Input
            label="Monthly Limit"
            type="number"
            step="0.01"
            min="0"
            placeholder="0.00"
            value={editLimit}
            onChange={(e) => setEditLimit(e.target.value)}
            className="font-number"
          />
          {editError && (
            <p className="text-sm text-accent-coral">{editError}</p>
          )}
          <Button type="submit" className="w-full" loading={updateBudget.isPending}>
            Save Changes
          </Button>
        </form>
      </Modal>

      <Modal
        open={!!adjustSuggestion}
        onClose={() => setAdjustSuggestion(null)}
        title="Adjust limit"
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const n = parseFloat(adjustAmount);
            if (!n || n <= 0) return;
            acceptSuggestion.mutate(
              { row: adjustSuggestion, limitAmt: n },
              {
                onSuccess: () => {
                  setAdjustSuggestion(null);
                },
              }
            );
          }}
          className="space-y-4"
        >
          <Input
            label="Monthly limit"
            type="number"
            step="0.01"
            value={adjustAmount}
            onChange={(e) => setAdjustAmount(e.target.value)}
            className="font-number"
          />
          <Button type="submit" className="w-full" loading={acceptSuggestion.isPending}>
            Save budget
          </Button>
        </form>
      </Modal>

      <Modal open={reviewOpen} onClose={() => setReviewOpen(false)} title="Month review">
        <div className="text-sm text-white/85 whitespace-pre-wrap max-h-[60vh] overflow-y-auto">
          {reviewText}
        </div>
      </Modal>

      {profile?.id && (
        <MonthlyPlannerModal
          open={showPlanner}
          onClose={() => setShowPlanner(false)}
          monthStart={monthStart}
          profileId={profile.id}
          primaryCurrency={(profile.primary_currency as Currency) || "USD"}
          statedIncome={monthlyIncome}
          lastMonthIncomeHint={lastMonthIncomeHint}
          budgets={budgetRows}
          goals={(goals || []).map((g: any) => ({
            id: g.id,
            name: g.name,
            goal_type: g.goal_type,
            is_recurring: g.is_recurring,
            monthly_target: g.monthly_target,
            currency: g.currency as Currency,
            target_amount: g.target_amount,
            current_balance: g.current_balance,
          }))}
          customCategories={customCategories}
          prevMonthSpendByCategory={prevMonthSpendByCategory}
          threeMonthExpenses={plannerExpenseRows}
          onSaved={async (info) => {
            await qc.invalidateQueries({ queryKey: ["budgets"] });
            await qc.invalidateQueries({ queryKey: ["goals"] });
            await qc.invalidateQueries({ queryKey: ["monthly-plan", monthStart] });
            await refetchProfile();
            const { data } = await supabase
              .from("profiles")
              .select("*")
              .eq("id", profile.id)
              .single();
            if (data) setProfile(data as any);
            if (info?.skippedMonthlyPlanSnapshot) {
              setPlannerSnapshotNote(
                "Budgets and income were saved. The monthly plan snapshot table is not in your database yet — run the SQL file supabase/migrations/20260327120000_monthly_plans.sql in the Supabase SQL editor, then reload the app."
              );
            } else {
              setPlannerSnapshotNote(null);
            }
          }}
        />
      )}

      <CreateCategoryModal
        open={showCreateCategory}
        onClose={() => setShowCreateCategory(false)}
        onSave={(data) => {
          createCustomCategory.mutate(data, {
            onSuccess: (created: any) => {
              setShowCreateCategory(false);
              setCategory(created.slug);
            },
          });
        }}
        loading={createCustomCategory.isPending}
        type="expense"
      />

      <CreateGoalModal
        open={showCreateGoal}
        onClose={() => setShowCreateGoal(false)}
        planHeadroom={planHeadroom}
        primaryCurrency={(profile?.primary_currency as Currency) || "USD"}
      />

      {contributeFor && (
        <ContributeGoalModal
          open
          onClose={() => setContributeFor(null)}
          goalId={contributeFor.id}
          currency={contributeFor.currency}
          currentBalance={contributeFor.current_balance}
          targetAmount={contributeFor.target_amount}
        />
      )}
    </div>
  );
}
