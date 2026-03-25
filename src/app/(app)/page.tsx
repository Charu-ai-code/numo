"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import {
  Lightbulb,
  ArrowRight,
  Landmark,
  Plus,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAccounts } from "@/lib/hooks/use-accounts";
import { useProfile } from "@/lib/hooks/use-profile";
import { useAppStore } from "@/lib/stores/app-store";
import { formatCurrency, daysLeftInMonth, cn } from "@/lib/utils";
import { getCategoryLabel, EXPENSE_CATEGORIES } from "@/lib/constants";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ProgressBar } from "@/components/ui/progress-bar";
import { CurrencyToggle } from "@/components/ui/currency-toggle";
import { Button } from "@/components/ui/button";
import { ShimmerCard } from "@/components/ui/shimmer";

export default function DashboardPage() {
  const router = useRouter();
  const supabase = createClient();
  const { isLoading: profileLoading } = useProfile();
  const { data: accounts, isLoading: accountsLoading } = useAccounts();
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
      const { data, error } = await supabase.from("split_groups").select("*");
      if (error) throw error;
      return data;
    },
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

  const netWorth = useMemo(() => {
    if (!accounts) return 0;
    return accounts.reduce((sum: number, a: any) => sum + (a.initial_balance || 0), 0);
  }, [accounts]);

  const { monthIncome, monthExpenses } = useMemo(() => {
    if (!transactions) return { monthIncome: 0, monthExpenses: 0 };
    let income = 0;
    let expenses = 0;
    transactions.forEach((t: any) => {
      if (t.date >= monthStart) {
        if (t.type === "income") income += t.amount;
        else expenses += t.amount;
      }
    });
    return { monthIncome: income, monthExpenses: expenses };
  }, [transactions, monthStart]);

  const spendingByCategory = useMemo(() => {
    if (!transactions) return [];
    const map: Record<string, number> = {};
    transactions.forEach((t: any) => {
      if (t.type === "expense" && t.date >= monthStart) {
        map[t.category] = (map[t.category] || 0) + t.amount;
      }
    });
    return Object.entries(map)
      .map(([cat, amount]) => ({ category: getCategoryLabel(cat), amount }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 6);
  }, [transactions, monthStart]);

  const budgetProgress = useMemo(() => {
    if (!budgets || !transactions) return [];
    return budgets.map((b: any) => {
      const spent = transactions
        .filter((t: any) => t.type === "expense" && t.category === b.category && t.date >= monthStart)
        .reduce((s: number, t: any) => s + t.amount, 0);
      return { ...b, spent };
    });
  }, [budgets, transactions, monthStart]);

  const isLoading = profileLoading || accountsLoading;

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

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Dashboard</h1>
        <CurrencyToggle value={curr} onChange={setViewCurrency} />
      </div>

      {/* Net Worth */}
      <Card className="space-y-1">
        <p className="text-xs text-muted uppercase tracking-wide">Net Worth</p>
        <p className="font-number text-3xl font-bold">
          {formatCurrency(netWorth, curr)}
        </p>
      </Card>

      {/* Cash Flow */}
      <div className="grid grid-cols-2 gap-3">
        <Card className="space-y-1">
          <p className="text-xs text-muted">Income</p>
          <p className="font-number text-lg font-semibold text-accent-green">
            +{formatCurrency(monthIncome, curr)}
          </p>
        </Card>
        <Card className="space-y-1">
          <p className="text-xs text-muted">Expenses</p>
          <p className="font-number text-lg font-semibold text-accent-coral">
            -{formatCurrency(monthExpenses, curr)}
          </p>
        </Card>
      </div>

      {/* Account Chips */}
      <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
        {accounts.map((a: any) => (
          <button
            key={a.id}
            onClick={() => router.push(`/accounts/${a.id}`)}
            className="flex items-center gap-2 px-3 py-2 bg-white/[0.05] border border-white/[0.06] rounded-xl whitespace-nowrap text-sm hover:bg-white/[0.08] transition-colors shrink-0"
          >
            <span className="text-muted">{a.name}</span>
            <span className="font-number font-medium">
              {formatCurrency(a.initial_balance || 0, a.currency, true)}
            </span>
          </button>
        ))}
      </div>

      {/* Spending Chart */}
      {spendingByCategory.length > 0 && (
        <Card>
          <p className="text-xs text-muted mb-3 uppercase tracking-wide">Spending by Category</p>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={spendingByCategory} layout="vertical">
              <XAxis type="number" hide />
              <YAxis
                dataKey="category"
                type="category"
                tick={{ fontSize: 11, fill: "#888" }}
                axisLine={false}
                tickLine={false}
                width={100}
              />
              <Tooltip
                contentStyle={{ background: "#141414", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12, fontSize: 12 }}
                formatter={(v: number) => [formatCurrency(v, curr), "Spent"]}
              />
              <Bar dataKey="amount" fill="#ffb4ab" radius={[0, 6, 6, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>
      )}

      {/* Budget Progress */}
      {budgetProgress.length > 0 && (
        <Card className="space-y-3">
          <p className="text-xs text-muted uppercase tracking-wide">Budget Progress</p>
          {budgetProgress.map((b: any) => {
            const pct = b.monthly_limit > 0 ? (b.spent / b.monthly_limit) * 100 : 0;
            return (
              <div key={b.id} className="space-y-1.5">
                <div className="flex justify-between text-sm">
                  <span>{getCategoryLabel(b.category)}</span>
                  <span className="font-number text-xs text-muted">
                    {formatCurrency(b.spent, b.currency)} / {formatCurrency(b.monthly_limit, b.currency)}
                  </span>
                </div>
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

      {/* Split Summary */}
      {splitGroups && splitGroups.length > 0 && (
        <Card hover className="cursor-pointer" onClick={() => router.push("/split")}>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-muted">Splits</p>
              <p className="text-sm">{splitGroups.length} active groups</p>
            </div>
            <ArrowRight className="w-4 h-4 text-muted" />
          </div>
        </Card>
      )}

      {/* AI Nudge */}
      {nudge && (
        <Card className="flex items-start gap-3">
          <div className="w-8 h-8 rounded-lg bg-accent-amber/10 flex items-center justify-center shrink-0">
            <Lightbulb className="w-4 h-4 text-accent-amber" />
          </div>
          <p className="text-sm text-white/80 leading-relaxed">{nudge.content}</p>
        </Card>
      )}
    </div>
  );
}
