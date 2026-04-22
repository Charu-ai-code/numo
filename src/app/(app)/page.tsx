"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import {
  Lightbulb,
  ArrowRight,
  Link as LinkIcon,
  Zap,
  TrendingUp,
  TrendingDown,
  Wallet,
  PieChart,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAccounts, useAllTransactionsLedger } from "@/lib/hooks/use-accounts";
import {
  computeRunningBalance,
  getDueDateStatus,
  dueUrgency,
  type LedgerAccountRow,
  type LedgerTransactionRow,
} from "@/lib/account-ledger";
import { useProfile } from "@/lib/hooks/use-profile";
import { useCustomCategories } from "@/lib/hooks/use-categories";
import { useAppStore } from "@/lib/stores/app-store";
import { formatCurrency, daysLeftInMonth, cn } from "@/lib/utils";
import { looksLikeSettlementDescription } from "@/lib/splitwise-settlement";
import {
  balancesFromManualLedger,
  balancesFromSimplifiedDebts,
  type SimplifiedDebtRow,
} from "@/lib/splitwise-debts";
import {
  getCategoryLabel,
  getCategoryColor,
  type Currency,
  type CustomCategory,
} from "@/lib/constants";
import {
  aggregateExpenseByCategory,
  computeBudgetProgress,
  computeDailyBudgetNumber,
  totalGoalsProgressThisMonth,
  unbudgetedSpending,
  isBudgetEligibleExpense,
  type ExpenseRow,
} from "@/lib/budget-engine";
import { nextMonthStart } from "@/lib/monthly-planner";
import {
  buildSpendingHubItems,
  upcomingWithinDays,
  type SpendingRecurringHubRow,
} from "@/lib/recurring-hub";
import { Card } from "@/components/ui/card";
import { ProgressBar } from "@/components/ui/progress-bar";
import { CurrencyToggle } from "@/components/ui/currency-toggle";
import { Button } from "@/components/ui/button";
import { ShimmerCard } from "@/components/ui/shimmer";

/** Soft palette for spending bars (distinct from each other on dark bg) */
const SPENDING_BAR_COLORS = [
  "#f8b4ab",
  "#7dd3c0",
  "#b0c6ff",
  "#e9c349",
  "#d4a5ff",
  "#67e8f9",
];

function SpendingBars({
  rows,
  currency,
  customCategories,
}: {
  rows: { slug: string; label: string; amount: number; isCustom: boolean }[];
  currency: Currency;
  customCategories?: CustomCategory[] | null;
}) {
  const max = Math.max(...rows.map((r) => r.amount), 1);
  let fallbackIdx = 0;
  return (
    <div className="space-y-3.5">
      {rows.map((row, i) => {
        const pct = Math.max(4, (row.amount / max) * 100);
        const fromUser = getCategoryColor(row.slug, customCategories || undefined);
        const color =
          fromUser ||
          SPENDING_BAR_COLORS[
            (fallbackIdx++) % SPENDING_BAR_COLORS.length
          ];
        return (
          <div key={`${row.slug}-${i}`}>
            <div className="flex justify-between items-baseline gap-2 mb-1.5">
              <span
                className="text-sm truncate pr-2 flex items-center gap-1.5 min-w-0"
                title={row.label}
              >
                {row.isCustom && (
                  <span
                    className="shrink-0 text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded-md bg-accent-blue/15 text-accent-blue font-semibold"
                    aria-hidden
                  >
                    Yours
                  </span>
                )}
                <span className="text-white/90">{row.label}</span>
              </span>
              <span className="font-number text-sm font-medium text-white/85 tabular-nums shrink-0">
                {formatCurrency(row.amount, currency)}
              </span>
            </div>
            <div className="h-2.5 rounded-full bg-white/[0.06] overflow-hidden ring-1 ring-white/[0.05]">
              <div
                className="h-full rounded-full min-w-[4px] transition-all duration-500 ease-out"
                style={{
                  width: `${pct}%`,
                  background: `linear-gradient(90deg, ${color}cc, ${color})`,
                  boxShadow: `0 0 14px ${color}40`,
                }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function DashboardPage() {
  const router = useRouter();
  const supabase = createClient();
  const { isLoading: profileLoading } = useProfile();
  const { data: accounts, isLoading: accountsLoading } = useAccounts();
  const { data: ledgerTxs, isLoading: ledgerLoading } = useAllTransactionsLedger();
  const { data: customCategories } = useCustomCategories();
  const profile = useAppStore((s) => s.profile);
  const viewCurrency = useAppStore((s) => s.viewCurrency);
  const setViewCurrency = useAppStore((s) => s.setViewCurrency);

  const now = new Date();
  const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;

  const { data: transactions } = useQuery({
    queryKey: ["dashboard-transactions"],
    queryFn: async () => {
      const threeMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 2, 1);
      const { data, error } = await supabase
        .from("transactions")
        .select("*")
        .gte("date", threeMonthsAgo.toISOString().slice(0, 10))
        .order("date", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: budgets } = useQuery({
    queryKey: ["budgets"],
    queryFn: async () => {
      const { data, error } = await supabase.from("budgets").select("*");
      if (error) throw error;
      return data;
    },
  });

  const { data: splitGroups } = useQuery({
    queryKey: ["split-groups"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("split_groups")
        .select("*, split_members(*)");
      if (error) throw error;
      return data;
    },
  });

  const { data: splitExpenses } = useQuery({
    queryKey: ["dashboard-split-expenses"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("split_expenses")
        .select("*, split_shares(*)");
      if (error) throw error;
      return data;
    },
    enabled: !!splitGroups && splitGroups.length > 0,
  });

  const { data: splitSettlements } = useQuery({
    queryKey: ["dashboard-split-settlements"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("split_settlements")
        .select("*");
      if (error) throw error;
      return data;
    },
    enabled: !!splitGroups && splitGroups.length > 0,
  });

  const { data: nudge } = useQuery({
    queryKey: ["nudge"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ai_nudges")
        .select("*")
        .order("generated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const { data: goals } = useQuery({
    queryKey: ["goals"],
    queryFn: async () => {
      const { data, error } = await supabase.from("savings_goals").select("*");
      if (error) throw error;
      return data;
    },
  });

  const { data: goalContributionsMonth } = useQuery({
    queryKey: ["goal-contributions-month-dash", monthStart],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("goal_contributions")
        .select("goal_id, amount, date")
        .gte("date", monthStart);
      if (error) throw error;
      return data;
    },
  });

  const { data: remittancesMonth } = useQuery({
    queryKey: ["remittances-month-dash", monthStart],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("remittances")
        .select("*")
        .gte("date", monthStart);
      if (error) throw error;
      return data;
    },
  });

  const monthEndDash = nextMonthStart(monthStart);

  const { data: recurringDash } = useQuery({
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

  const { data: monthTxRecurringDash } = useQuery({
    queryKey: ["dashboard-recurring-month-txs", monthStart],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("transactions")
        .select("*")
        .eq("type", "expense")
        .gte("date", monthStart)
        .lt("date", monthEndDash);
      if (error) throw error;
      return data ?? [];
    },
  });

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

  const { monthIncome, monthExpenses } = useMemo(() => {
    if (!transactions) return { monthIncome: 0, monthExpenses: 0 };
    let income = 0;
    let expenses = 0;
    transactions.forEach((t: any) => {
      if (t.date < monthStart) return;
      if (t.type === "income") income += t.amount;
      else if (t.type === "expense") expenses += t.amount;
    });
    return { monthIncome: income, monthExpenses: expenses };
  }, [transactions, monthStart]);

  const creditCardDueAlerts = useMemo(() => {
    if (!accounts) return [];
    const list: {
      id: string;
      name: string;
      currency: Currency;
      owed: number;
      status: NonNullable<ReturnType<typeof getDueDateStatus>>;
      urgency: ReturnType<typeof dueUrgency>;
    }[] = [];
    for (const a of accounts as any[]) {
      if (a.type !== "credit_card" || !a.payment_due_day) continue;
      const txs = txsByAccountId.get(a.id) || [];
      const owed = computeRunningBalance(a as LedgerAccountRow, txs);
      const st = getDueDateStatus(a.payment_due_day, now);
      if (!st) continue;
      const urg = dueUrgency(st);
      if (st.overdue || st.daysUntil <= 7) {
        list.push({
          id: a.id,
          name: a.name,
          currency: a.currency,
          owed,
          status: st,
          urgency: urg,
        });
      }
    }
    return list;
  }, [accounts, txsByAccountId, now]);

  const customExpenseSlugs = useMemo(
    () =>
      new Set(
        (customCategories || [])
          .filter((c: CustomCategory) => c.type === "expense")
          .map((c) => c.slug)
      ),
    [customCategories]
  );

  const spendingByCategory = useMemo(() => {
    if (!transactions) return [];
    const map: Record<string, number> = {};
    transactions.forEach((t: any) => {
      if (t.type === "expense" && t.date >= monthStart) {
        map[t.category] = (map[t.category] || 0) + t.amount;
      }
    });
    const rows = Object.entries(map).map(([slug, amount]) => ({
      slug,
      label: getCategoryLabel(slug, customCategories),
      amount,
      isCustom: customExpenseSlugs.has(slug),
    }));
    rows.sort((a, b) => b.amount - a.amount);
    return rows.slice(0, 14);
  }, [transactions, monthStart, customCategories, customExpenseSlugs]);

  /** Share of this month’s expenses that use user-created category slugs */
  const customCategoryInsight = useMemo(() => {
    if (!transactions || !customCategories?.length) return null;
    let customTotal = 0;
    const perSlug: Record<string, number> = {};
    transactions.forEach((t: any) => {
      if (t.type !== "expense" || t.date < monthStart) return;
      if (!customExpenseSlugs.has(t.category)) return;
      customTotal += t.amount;
      perSlug[t.category] = (perSlug[t.category] || 0) + t.amount;
    });
    if (customTotal <= 0) return null;
    const expenseMonthTotal = transactions
      .filter((t: any) => t.type === "expense" && t.date >= monthStart)
      .reduce((s: number, t: any) => s + t.amount, 0);
    const breakdown = Object.entries(perSlug)
      .map(([slug, amount]) => ({
        name: getCategoryLabel(slug, customCategories),
        amount,
      }))
      .sort((a, b) => b.amount - a.amount);
    return {
      customTotal,
      pctOfExpenses:
        expenseMonthTotal > 0 ? (customTotal / expenseMonthTotal) * 100 : 0,
      breakdown,
    };
  }, [transactions, monthStart, customCategories, customExpenseSlugs]);

  const budgetSnapshot = useMemo(() => {
    if (!transactions || !budgets) {
      return {
        progress: [] as { id: string; category: string; monthly_limit: number; currency: string; spent: number; spentSplit: number; spentPersonal: number; pct: number }[],
        dailyPerDay: 0,
        totalLimits: 0,
        spentInBudgetCats: 0,
        goalContrib: { contributed: 0, target: 0 },
        unbudgeted: { total: 0, byCategory: [] as { category: string; amount: number }[] },
      };
    }
    const expenseRows: ExpenseRow[] = transactions
      .filter(
        (t: any) =>
          t.type === "expense" &&
          t.date >= monthStart &&
          isBudgetEligibleExpense(t.category)
      )
      .map((t: any) => ({
        amount: Number(t.amount),
        category: t.category,
        currency: t.currency,
        type: "expense" as const,
        source: (t.source as "manual" | "split") || "manual",
      }));
    const byCat = aggregateExpenseByCategory(expenseRows);
    const budgetRows = budgets.map((b: any) => ({
      id: b.id,
      category: b.category,
      monthly_limit: Number(b.monthly_limit),
      currency: b.currency as Currency,
    }));
    const progress = computeBudgetProgress(budgetRows, byCat);
    const daily = computeDailyBudgetNumber(budgetRows, byCat);
    const goalContrib = totalGoalsProgressThisMonth(
      goals || [],
      goalContributionsMonth || [],
      remittancesMonth || [],
      monthStart
    );
    const budgetedCategories = new Set(budgetRows.map((b) => b.category));
    const unbudgeted = unbudgetedSpending(byCat, budgetedCategories);
    return {
      progress,
      dailyPerDay: daily.perDay,
      totalLimits: daily.totalLimits,
      spentInBudgetCats: daily.spentInBudgetCategories,
      goalContrib,
      unbudgeted,
    };
  }, [
    transactions,
    budgets,
    monthStart,
    goals,
    goalContributionsMonth,
    remittancesMonth,
  ]);

  const budgetProgress = budgetSnapshot.progress;

  const splitSummary = useMemo(() => {
    if (!splitGroups || !splitExpenses || !profile) return null;

    const myMemberIds = new Set<string>();
    for (const g of splitGroups) {
      for (const m of (g as any).split_members || []) {
        if (m.user_id === profile.id) myMemberIds.add(m.id);
      }
    }
    if (myMemberIds.size === 0) return null;

    // Monthly share: sum of user's owed_share from split expenses this month
    let monthlyShare = 0;
    for (const exp of splitExpenses) {
      if (looksLikeSettlementDescription(exp.description)) continue;
      if (exp.date && exp.date >= monthStart) {
        for (const s of exp.split_shares || []) {
          if (myMemberIds.has(s.member_id)) {
            monthlyShare += s.share_amount;
          }
        }
      }
    }

    const bal: Record<string, number> = {};
    const cur = (profile.primary_currency as string) || "USD";
    for (const g of splitGroups as any[]) {
      if (g.splitwise_group_id) {
        const part = balancesFromSimplifiedDebts(
          g.simplified_debts as SimplifiedDebtRow[] | null,
          g.split_members || [],
          cur
        );
        for (const [id, v] of Object.entries(part)) {
          bal[id] = (bal[id] || 0) + v;
        }
      } else {
        const part = balancesFromManualLedger(
          g.id,
          splitExpenses,
          splitSettlements || []
        );
        for (const [id, v] of Object.entries(part)) {
          bal[id] = (bal[id] || 0) + v;
        }
      }
    }

    let youOwe = 0;
    let owedToYou = 0;
    let peopleOweYou = 0;
    let youOwePeople = 0;

    for (const [memberId, balance] of Object.entries(bal)) {
      if (myMemberIds.has(memberId)) continue;
      if (balance > 0.01) {
        youOwe += balance;
        youOwePeople++;
      } else if (balance < -0.01) {
        owedToYou += Math.abs(balance);
        peopleOweYou++;
      }
    }

    return { monthlyShare, youOwe, owedToYou, peopleOweYou, youOwePeople };
  }, [splitGroups, splitExpenses, splitSettlements, profile, monthStart]);

  const recurringDueSoon = useMemo(() => {
    const refNow = new Date();
    const items = buildSpendingHubItems(
      (recurringDash || []) as SpendingRecurringHubRow[],
      monthStart,
      monthEndDash,
      (monthTxRecurringDash || []).map((t: any) => ({
        recurring_expense_id: t.recurring_expense_id,
        date: t.date,
        amount: Number(t.amount),
        note: t.note,
        source: t.source,
      })),
      new Map(),
      refNow
    );
    return upcomingWithinDays(items, 3, refNow);
  }, [recurringDash, monthStart, monthEndDash, monthTxRecurringDash]);

  const isLoading = profileLoading || accountsLoading || ledgerLoading;

  if (isLoading) {
    return (
      <div className="space-y-4 animate-fade-in">
        <ShimmerCard />
        <div className="grid grid-cols-2 gap-3"><ShimmerCard /><ShimmerCard /></div>
        <ShimmerCard />
        <ShimmerCard />
      </div>
    );
  }

  if (!accounts || accounts.length === 0) {
    return (
      <div className="space-y-6 animate-fade-in">
        <Card className="text-center py-12 space-y-4">
          <h2 className="text-2xl font-bold">
            Welcome to numo<span className="text-accent-green">.</span>
          </h2>
          <p className="text-sm text-muted max-w-xs mx-auto">
            Your money, both worlds, one app. Add your first account to get started.
          </p>
          <Button onClick={() => router.push("/accounts")}>
            Get Started <ArrowRight className="w-4 h-4" />
          </Button>
        </Card>
      </div>
    );
  }

  const curr = viewCurrency;

  const monthLabel = now.toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Dashboard</h1>
          <p className="text-xs text-muted mt-0.5">{monthLabel}</p>
        </div>
        <CurrencyToggle value={curr} onChange={setViewCurrency} />
      </div>

      {recurringDueSoon.length > 0 && (
        <Card className="border border-accent-blue/25 bg-accent-blue/[0.06] space-y-2">
          <p className="text-sm font-medium text-white/90 flex items-center gap-2">
            <span aria-hidden>🔄</span> Upcoming recurring
          </p>
          <ul className="text-sm text-muted space-y-1">
            {recurringDueSoon.map((it) => (
              <li key={it.re.id}>
                {it.re.label}{" "}
                <span className="font-number text-white/80">
                  {formatCurrency(Number(it.re.expected_amount), it.re.currency as Currency)}
                </span>
                {it.daysUntil === 0
                  ? " · due today"
                  : it.daysUntil != null
                    ? ` · due in ${it.daysUntil} day(s)`
                    : null}
              </li>
            ))}
          </ul>
          <Link
            href="/recurring"
            className="text-xs text-accent-blue font-medium inline-block"
          >
            View all recurring →
          </Link>
        </Card>
      )}

      {/* Month snapshot — hero: budgets, goals, daily, radar */}
      {(budgetSnapshot.totalLimits > 0 ||
        budgetSnapshot.goalContrib.target > 0) && (
        <Card className="relative overflow-hidden border border-white/[0.1] bg-gradient-to-br from-accent-green/[0.07] via-white/[0.04] to-transparent p-5 shadow-[0_0_0_1px_rgba(255,255,255,0.04)_inset]">
          <p className="text-[11px] text-muted uppercase tracking-[0.12em] font-medium">
            This month
          </p>
          <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-4">
            {budgetSnapshot.totalLimits > 0 && (
              <div className="space-y-2">
                <p className="text-xs text-muted">Spending vs budgeted</p>
                <p className="font-number text-xl font-semibold tabular-nums">
                  {formatCurrency(budgetSnapshot.spentInBudgetCats, curr)}{" "}
                  <span className="text-white/35 font-normal">of</span>{" "}
                  {formatCurrency(budgetSnapshot.totalLimits, curr)}
                </p>
                <ProgressBar
                  value={budgetSnapshot.spentInBudgetCats}
                  max={Math.max(budgetSnapshot.totalLimits, 1)}
                />
              </div>
            )}
            {budgetSnapshot.goalContrib.target > 0 && (
              <div className="space-y-2">
                <p className="text-xs text-muted">Goals (recurring)</p>
                <p className="font-number text-xl font-semibold tabular-nums">
                  {formatCurrency(budgetSnapshot.goalContrib.contributed, curr)}{" "}
                  <span className="text-white/35 font-normal">of</span>{" "}
                  {formatCurrency(budgetSnapshot.goalContrib.target, curr)}
                </p>
                <ProgressBar
                  value={budgetSnapshot.goalContrib.contributed}
                  max={Math.max(budgetSnapshot.goalContrib.target, 1)}
                />
              </div>
            )}
          </div>
          {budgetSnapshot.totalLimits > 0 && budgetSnapshot.dailyPerDay > 0 && (
            <div className="mt-5 pt-4 border-t border-white/[0.06]">
              <p className="text-[11px] text-muted uppercase tracking-wide mb-1">
                Daily allowance (budget categories)
              </p>
              <p className="font-number text-2xl sm:text-3xl font-bold text-accent-green tabular-nums">
                {formatCurrency(budgetSnapshot.dailyPerDay, curr)}
                <span className="text-sm font-normal text-muted"> / day</span>
              </p>
              <p className="text-[11px] text-muted mt-1">
                {daysLeftInMonth()} days left ·{" "}
                {budgetSnapshot.unbudgeted.total > 0
                  ? `${formatCurrency(budgetSnapshot.unbudgeted.total, curr)} unbudgeted`
                  : "No unbudgeted category spend"}
              </p>
            </div>
          )}
          {budgetProgress.length > 0 && (
            <div className="mt-5 pt-4 border-t border-white/[0.06]">
              <p className="text-[11px] text-muted uppercase tracking-wide mb-3">
                Budget radar
              </p>
              <div className="flex flex-wrap gap-x-3 gap-y-2">
                {budgetProgress.slice(0, 10).map((b: any) => {
                  const pct =
                    b.pct ??
                    (b.monthly_limit > 0
                      ? (b.spent / b.monthly_limit) * 100
                      : 0);
                  const radarBg =
                    pct >= 100
                      ? "bg-accent-coral"
                      : pct >= 80
                        ? "bg-accent-amber"
                        : "bg-accent-green";
                  return (
                    <div
                      key={b.id}
                      className="flex items-center gap-1.5 min-w-0 max-w-[140px]"
                    >
                      <span
                        className={cn("w-2 h-2 rounded-full shrink-0", radarBg)}
                      />
                      <span className="text-[11px] text-white/80 truncate">
                        {getCategoryLabel(b.category, customCategories)}
                      </span>
                      <span className="text-[10px] text-muted font-number shrink-0">
                        {Math.round(pct)}%
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          <div className="absolute -right-8 -bottom-12 w-36 h-36 rounded-full bg-accent-green/5 blur-3xl pointer-events-none" />
        </Card>
      )}

      {creditCardDueAlerts.length > 0 && (
        <div className="space-y-2">
          {creditCardDueAlerts.map((c) => (
            <Card
              key={c.id}
              className={cn(
                "flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border",
                c.urgency === "overdue" || c.urgency === "critical"
                  ? "border-accent-coral/40 bg-accent-coral/[0.06]"
                  : "border-accent-amber/25 bg-accent-amber/[0.05]"
              )}
            >
              <div>
                <p className="text-sm font-medium flex items-center gap-2">
                  <span>💳</span> {c.name}
                  {c.urgency === "overdue" && (
                    <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-accent-coral/20 text-accent-coral font-semibold">
                      Overdue
                    </span>
                  )}
                </p>
                <p className="text-xs text-muted mt-0.5">
                  Owed {formatCurrency(c.owed, c.currency)}
                  {c.status.overdue
                    ? ` · was due ${c.status.nextDue.toLocaleDateString(undefined, { month: "short", day: "numeric" })}`
                    : c.status.daysUntil === 0
                      ? " · due today"
                      : ` · due in ${c.status.daysUntil} day${c.status.daysUntil === 1 ? "" : "s"}`}
                </p>
              </div>
              <Button
                size="sm"
                variant="secondary"
                className="shrink-0"
                onClick={() => router.push(`/accounts/${c.id}?pay=1`)}
              >
                Pay card
              </Button>
            </Card>
          ))}
        </div>
      )}

      {/* Cash Flow — single card */}
      <Card className="p-0 overflow-hidden border border-white/[0.08]">
        <div className="grid grid-cols-2 divide-x divide-white/[0.06]">
          <div className="p-4 space-y-2 bg-gradient-to-br from-accent-green/[0.08] to-transparent">
            <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-muted">
              <TrendingUp className="w-3.5 h-3.5 text-accent-green" />
              Income
            </div>
            <p className="font-number text-xl font-semibold text-accent-green tabular-nums">
              +{formatCurrency(monthIncome, curr)}
            </p>
          </div>
          <div className="p-4 space-y-2 bg-gradient-to-br from-accent-coral/[0.08] to-transparent">
            <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-muted">
              <TrendingDown className="w-3.5 h-3.5 text-accent-coral" />
              Expenses
            </div>
            <p className="font-number text-xl font-semibold text-accent-coral tabular-nums">
              −{formatCurrency(monthExpenses, curr)}
            </p>
          </div>
        </div>
      </Card>

      {/* My Splitwise */}
      {splitGroups && splitGroups.length > 0 && splitSummary && (
        <Card className="space-y-3 border-l-[3px] border-l-accent-blue/80 bg-gradient-to-r from-accent-blue/[0.06] to-transparent">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-accent-blue/15 flex items-center justify-center">
                <LinkIcon className="w-4 h-4 text-accent-blue" />
              </div>
              <p className="text-sm font-medium">My Splitwise</p>
            </div>
            <button
              onClick={() => router.push("/split")}
              className="text-xs text-accent-blue hover:underline flex items-center gap-1"
            >
              View Splits <ArrowRight className="w-3 h-3" />
            </button>
          </div>

          <div>
            <p className="text-xs text-muted">Your share this month</p>
            <p className="font-number text-lg font-semibold">
              {formatCurrency(splitSummary.monthlyShare, curr)}
            </p>
          </div>

          <div className="flex items-center gap-3 text-sm">
            <span className="font-number text-accent-coral">
              You owe: {formatCurrency(splitSummary.youOwe, curr)}
            </span>
            <span className="text-white/20">·</span>
            <span className="font-number text-accent-green">
              Owed to you: {formatCurrency(splitSummary.owedToYou, curr)}
            </span>
          </div>

          <div className="flex items-center gap-1.5 text-xs text-muted">
            <Zap className="w-3 h-3" />
            {splitSummary.youOwe === 0 && splitSummary.owedToYou === 0 ? (
              <span>All settled up</span>
            ) : splitSummary.owedToYou > splitSummary.youOwe ? (
              <span>{splitSummary.peopleOweYou} {splitSummary.peopleOweYou === 1 ? "person owes" : "people owe"} you money</span>
            ) : (
              <span>You owe {splitSummary.youOwePeople} {splitSummary.youOwePeople === 1 ? "person" : "people"}</span>
            )}
          </div>
        </Card>
      )}

      {/* Account pills */}
      <div>
        <p className="text-[11px] text-muted uppercase tracking-[0.12em] font-medium mb-2">
          Accounts
        </p>
        <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
          {accounts.map((a: any) => {
            const bal = computeRunningBalance(
              a as LedgerAccountRow,
              txsByAccountId.get(a.id) || []
            );
            const isCC = a.type === "credit_card";
            return (
              <button
                key={a.id}
                type="button"
                onClick={() => router.push(`/accounts/${a.id}`)}
                className="group flex flex-col items-stretch gap-1 px-4 py-2.5 min-w-[120px] rounded-2xl border border-white/[0.08] bg-gradient-to-b from-white/[0.07] to-white/[0.02] hover:border-white/[0.14] hover:from-white/[0.09] transition-all shrink-0 text-left shadow-sm"
              >
                <span className="flex items-center gap-1.5 text-[11px] text-muted group-hover:text-white/70">
                  <Wallet className="w-3 h-3 opacity-70" />
                  <span className="truncate max-w-[7rem]">{a.name}</span>
                </span>
                <span
                  className={cn(
                    "font-number text-sm font-semibold tabular-nums",
                    isCC ? "text-accent-coral" : "text-white"
                  )}
                >
                  {isCC && <span className="text-[10px] text-muted font-normal mr-1">Owed</span>}
                  {formatCurrency(bal, a.currency, true)}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Spending by category — custom bars */}
      {spendingByCategory.length > 0 && (
        <Card className="space-y-4 border border-white/[0.08]">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-accent-coral/10 flex items-center justify-center">
              <PieChart className="w-4 h-4 text-accent-coral" />
            </div>
            <div>
              <p className="text-[11px] text-muted uppercase tracking-[0.12em] font-medium">
                Spending by category
              </p>
              <p className="text-xs text-white/40 mt-0.5">
                This month — built-in &amp; your categories
              </p>
            </div>
          </div>

          {customCategoryInsight && (
            <div className="rounded-xl border border-accent-blue/20 bg-accent-blue/[0.06] px-3 py-2.5 space-y-1">
              <p className="text-xs text-white/90 leading-snug">
                <span className="font-medium text-accent-blue">Your categories</span>{" "}
                {formatCurrency(customCategoryInsight.customTotal, curr)} (
                {customCategoryInsight.pctOfExpenses.toFixed(0)}% of spending
                this month)
              </p>
              <p className="text-[11px] text-muted leading-relaxed">
                {customCategoryInsight.breakdown
                  .map((b) => `${b.name} ${formatCurrency(b.amount, curr)}`)
                  .join(" · ")}
              </p>
            </div>
          )}

          <SpendingBars
            rows={spendingByCategory}
            currency={curr}
            customCategories={customCategories}
          />
        </Card>
      )}

      {/* Budget Progress */}
      {budgetProgress.length > 0 && (
        <Card className="space-y-3 border border-white/[0.08]">
          <p className="text-[11px] text-muted uppercase tracking-[0.12em] font-medium">
            Budget progress
          </p>
          {budgetProgress.map((b: any) => {
            const pct = b.pct ?? (b.monthly_limit > 0 ? (b.spent / b.monthly_limit) * 100 : 0);
            const radarBg =
              pct >= 100 ? "bg-accent-coral" : pct >= 80 ? "bg-accent-amber" : "bg-accent-green";
            return (
              <div key={b.id} className="space-y-1.5">
                <div className="flex justify-between text-sm items-center gap-2">
                  <span className="flex items-center gap-2">
                    <span className={cn("w-2 h-2 rounded-full shrink-0", radarBg)} />
                    {getCategoryLabel(b.category, customCategories)}
                  </span>
                  <span className="font-number text-xs text-muted">
                    {formatCurrency(b.spent, b.currency)} / {formatCurrency(b.monthly_limit, b.currency)}
                  </span>
                </div>
                {(b.spentSplit > 0 || b.spentPersonal > 0) && (
                  <p className="text-[10px] text-muted pl-4">
                    Split {formatCurrency(b.spentSplit, b.currency)} · Personal{" "}
                    {formatCurrency(b.spentPersonal, b.currency)}
                  </p>
                )}
                <ProgressBar value={b.spent} max={b.monthly_limit} />
                {pct >= 100 && (
                  <p className="text-xs text-accent-coral">Exceeded — maybe cut back next week?</p>
                )}
              </div>
            );
          })}
          <p className="text-xs text-muted">{daysLeftInMonth()} days left this month</p>
        </Card>
      )}

      {/* AI Nudge */}
      {nudge && (
        <Card className="flex items-start gap-3 border border-accent-amber/15 bg-gradient-to-br from-accent-amber/[0.07] to-transparent">
          <div className="w-9 h-9 rounded-xl bg-accent-amber/15 flex items-center justify-center shrink-0 ring-1 ring-accent-amber/20">
            <Lightbulb className="w-4 h-4 text-accent-amber" />
          </div>
          <p className="text-sm text-white/85 leading-relaxed pt-0.5">{nudge.content}</p>
        </Card>
      )}
    </div>
  );
}
