"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Target,
  Sparkles,
  CheckCircle2,
  Trash2,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAppStore } from "@/lib/stores/app-store";
import {
  GOAL_TYPES,
  type Currency,
} from "@/lib/constants";
import {
  remainingPlanHeadroom,
  totalMonthlyGoalTargets,
} from "@/lib/budget-engine";
import { formatCurrency, daysRemaining } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { FAB } from "@/components/ui/fab";
import { Modal } from "@/components/ui/modal";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ShimmerCard } from "@/components/ui/shimmer";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { CreateGoalModal } from "@/components/goals/create-goal-modal";

function goalTypeLabel(t: string | null | undefined): string {
  if (!t) return "Custom";
  return GOAL_TYPES.find((g) => g.value === t)?.label ?? t;
}

function ProgressRing({ pct, size = 64, color = "#4edea3" }: { pct: number; size?: number; color?: string }) {
  const radius = (size - 8) / 2;
  const circ = 2 * Math.PI * radius;
  const offset = circ - (Math.min(pct, 100) / 100) * circ;

  return (
    <svg width={size} height={size} className="shrink-0">
      <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={4} />
      <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={color} strokeWidth={4}
        strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round"
        transform={`rotate(-90 ${size / 2} ${size / 2})`} className="transition-all duration-700"
      />
      <text x="50%" y="50%" textAnchor="middle" dy="0.35em" className="fill-white text-xs font-number font-semibold">
        {Math.round(pct)}%
      </text>
    </svg>
  );
}

export default function GoalsPage() {
  const router = useRouter();
  const supabase = createClient();
  const qc = useQueryClient();
  const profile = useAppStore((s) => s.profile);

  const [showCreate, setShowCreate] = useState(false);
  const [showCalc, setShowCalc] = useState(false);

  const [calcIncome, setCalcIncome] = useState(String(profile?.monthly_income || 5000));
  const [calcPct, setCalcPct] = useState(3);

  const { data: goals, isLoading } = useQuery({
    queryKey: ["goals"],
    queryFn: async () => {
      const { data, error } = await supabase.from("savings_goals").select("*").order("created_at");
      if (error) throw error;
      return data;
    },
  });

  const deleteGoal = useMutation({
    mutationFn: async (goalId: string) => {
      const { error } = await supabase.from("savings_goals").delete().eq("id", goalId);
      if (error) throw error;
    },
    onSuccess: (_void, goalId) => {
      qc.invalidateQueries({ queryKey: ["goals"] });
      qc.removeQueries({ queryKey: ["goal", goalId] });
      qc.removeQueries({ queryKey: ["goal-contributions", goalId] });
    },
  });

  const { data: budgets } = useQuery({
    queryKey: ["budgets"],
    queryFn: async () => {
      const { data, error } = await supabase.from("budgets").select("monthly_limit");
      if (error) throw error;
      return data;
    },
  });

  const totalBudgetLimits =
    budgets?.reduce((s: number, b: { monthly_limit: number }) => s + Number(b.monthly_limit), 0) ?? 0;
  const goalTargets = totalMonthlyGoalTargets((goals || []) as any);
  const planHeadroom = remainingPlanHeadroom(
    profile?.monthly_income,
    0,
    totalBudgetLimits,
    goalTargets
  );

  const monthly = (parseFloat(calcIncome) || 0) * (calcPct / 100);
  const calcData = Array.from({ length: 11 }, (_, i) => {
    const years = i;
    const months = years * 12;
    const rate = 0.07 / 12;
    const fv = monthly * ((Math.pow(1 + rate, months) - 1) / rate);
    return { year: `Y${years}`, value: Math.round(fv) };
  });

  if (isLoading) {
    return (
      <div className="space-y-4 animate-fade-in">
        <h1 className="text-xl font-semibold">Savings Goals</h1>
        <div className="grid grid-cols-2 gap-3"><ShimmerCard /><ShimmerCard /><ShimmerCard /><ShimmerCard /></div>
      </div>
    );
  }

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Savings Goals</h1>
        <Button variant="ghost" size="sm" onClick={() => setShowCalc(true)}>
          <Sparkles className="w-4 h-4" /> 1% Magic
        </Button>
      </div>

      {!goals || goals.length === 0 ? (
        <EmptyState
          icon={<Target className="w-12 h-12" />}
          title="No goals yet"
          description="Pick a template or create your own"
          actionLabel="Create a Goal"
          onAction={() => setShowCreate(true)}
        />
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {goals.map((g: any) => {
            const hasCap = g.target_amount != null && g.target_amount > 0;
            const pct = hasCap ? (g.current_balance / g.target_amount) * 100 : 0;
            const days = g.target_date ? daysRemaining(g.target_date) : 9999;
            const completed = g.is_completed || (hasCap && pct >= 100);
            const atRisk = hasCap && !completed && pct < 30 && days < 60;

            return (
              <Card
                key={g.id}
                hover
                className="relative flex flex-col items-center text-center cursor-pointer py-5"
                onClick={() => router.push(`/goals/${g.id}`)}
              >
                <button
                  type="button"
                  className="absolute top-2 right-2 z-10 p-1.5 rounded-lg text-muted hover:text-accent-coral hover:bg-white/[0.06] transition-colors"
                  aria-label={`Delete ${g.name}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (
                      !confirm(
                        "Delete this goal? Contribution history will be removed. Remittances stay in your log but will no longer be linked to this goal."
                      )
                    ) {
                      return;
                    }
                    deleteGoal.mutate(g.id);
                  }}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
                <ProgressRing pct={hasCap ? pct : 0} color={completed ? "#4edea3" : atRisk ? "#e9c349" : g.color || "#4edea3"} />
                <p className="text-[10px] text-muted uppercase tracking-wide mt-2">
                  {goalTypeLabel(g.goal_type)}
                </p>
                <p className="text-sm font-medium mt-1 truncate w-full px-2">
                  {completed && <CheckCircle2 className="w-3.5 h-3.5 inline text-accent-green mr-1" />}
                  {g.name}
                </p>
                <p className="font-number text-xs text-muted mt-1">
                  {hasCap
                    ? `${formatCurrency(g.current_balance, g.currency, true)} / ${formatCurrency(g.target_amount, g.currency, true)}`
                    : g.is_recurring && g.monthly_target
                      ? `${formatCurrency(g.monthly_target, g.currency, true)}/mo`
                      : "—"}
                </p>
                <p className="text-[10px] text-muted mt-1">
                  {completed ? "Completed" : hasCap ? `${days} days left` : "Monthly commitment"}
                </p>
              </Card>
            );
          })}
        </div>
      )}

      <FAB onClick={() => setShowCreate(true)} />

      <CreateGoalModal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        planHeadroom={planHeadroom}
        primaryCurrency={(profile?.primary_currency as Currency) || "USD"}
      />

      <Modal open={showCalc} onClose={() => setShowCalc(false)} title="1% Magic Calculator">
        <div className="space-y-4">
          <Input label="Monthly Income" type="number" value={calcIncome} onChange={(e) => setCalcIncome(e.target.value)} className="font-number" />
          <div className="space-y-1.5">
            <label className="text-sm text-muted">Save {calcPct}% more ({formatCurrency(monthly, profile?.primary_currency || "USD")}/mo)</label>
            <input type="range" min={1} max={10} value={calcPct} onChange={(e) => setCalcPct(Number(e.target.value))}
              className="w-full accent-accent-green" />
          </div>
          <div className="grid grid-cols-3 gap-3 text-center">
            <Card><p className="text-xs text-muted">1 Year</p><p className="font-number text-sm font-semibold">{formatCurrency(calcData[1]?.value || 0, profile?.primary_currency || "USD", true)}</p></Card>
            <Card><p className="text-xs text-muted">5 Years</p><p className="font-number text-sm font-semibold">{formatCurrency(calcData[5]?.value || 0, profile?.primary_currency || "USD", true)}</p></Card>
            <Card><p className="text-xs text-muted">10 Years</p><p className="font-number text-sm font-semibold">{formatCurrency(calcData[10]?.value || 0, profile?.primary_currency || "USD", true)}</p></Card>
          </div>
          <ResponsiveContainer width="100%" height={160}>
            <LineChart data={calcData}>
              <XAxis dataKey="year" tick={{ fontSize: 10, fill: "#888" }} axisLine={false} tickLine={false} />
              <YAxis hide />
              <Tooltip contentStyle={{ background: "#141414", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12, fontSize: 12 }}
                formatter={(v: number) => [formatCurrency(v, profile?.primary_currency || "USD", true), "Saved"]} />
              <Line type="monotone" dataKey="value" stroke="#4edea3" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </Modal>
    </div>
  );
}
