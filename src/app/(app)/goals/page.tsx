"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Target,
  Sparkles,
  CheckCircle2,
  Flame,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAppStore } from "@/lib/stores/app-store";
import { GOAL_TEMPLATES, type Currency } from "@/lib/constants";
import { formatCurrency, daysRemaining, cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { FAB } from "@/components/ui/fab";
import { Modal } from "@/components/ui/modal";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { CurrencyToggle } from "@/components/ui/currency-toggle";
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
  const [name, setName] = useState("");
  const [target, setTarget] = useState("");
  const [targetDate, setTargetDate] = useState("");
  const [currency, setCurrency] = useState<Currency>(profile?.primary_currency || "USD");
  const [formError, setFormError] = useState("");

  // 1% calculator state
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

  const createGoal = useMutation({
    mutationFn: async (goal: any) => {
      const { data: { user } } = await supabase.auth.getUser();
      const { data, error } = await supabase
        .from("savings_goals")
        .insert({ ...goal, user_id: user!.id })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["goals"] }),
  });

  function selectTemplate(t: typeof GOAL_TEMPLATES[number]) {
    setName(t.name);
    setTarget(String(t.target));
    setCurrency(t.currency);
    const d = new Date();
    d.setMonth(d.getMonth() + t.months);
    setTargetDate(d.toISOString().slice(0, 10));
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setFormError("");
    if (!name.trim()) { setFormError("Name is required"); return; }
    const numTarget = parseFloat(target);
    if (!numTarget || numTarget <= 0) { setFormError("Target must be > 0"); return; }
    if (!targetDate || new Date(targetDate) <= new Date()) { setFormError("Target date must be in the future"); return; }
    try {
      await createGoal.mutateAsync({
        name: name.trim(), target_amount: numTarget, currency, target_date: targetDate,
        icon: "Target", color: "#4edea3",
      });
      setShowCreate(false);
      setName(""); setTarget(""); setTargetDate("");
    } catch (err: any) { setFormError(err.message); }
  }

  // 1% calc data
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
            const pct = g.target_amount > 0 ? (g.current_balance / g.target_amount) * 100 : 0;
            const days = daysRemaining(g.target_date);
            const completed = g.is_completed || pct >= 100;
            const monthsLeft = Math.max(1, days / 30);
            const neededPerMonth = (g.target_amount - g.current_balance) / monthsLeft;
            const atRisk = !completed && pct < (100 - (days / (daysRemaining(g.target_date) || 1)) * 100) * 0.5;

            return (
              <Card
                key={g.id}
                hover
                className="flex flex-col items-center text-center cursor-pointer py-5"
                onClick={() => router.push(`/goals/${g.id}`)}
              >
                <ProgressRing pct={pct} color={completed ? "#4edea3" : atRisk ? "#e9c349" : g.color || "#4edea3"} />
                <p className="text-sm font-medium mt-3 truncate w-full px-2">
                  {completed && <CheckCircle2 className="w-3.5 h-3.5 inline text-accent-green mr-1" />}
                  {g.name}
                </p>
                <p className="font-number text-xs text-muted mt-1">
                  {formatCurrency(g.current_balance, g.currency, true)} / {formatCurrency(g.target_amount, g.currency, true)}
                </p>
                <p className="text-[10px] text-muted mt-1">
                  {completed ? "Completed" : `${days} days left`}
                </p>
              </Card>
            );
          })}
        </div>
      )}

      <FAB onClick={() => setShowCreate(true)} />

      {/* Create Goal Modal */}
      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="New Goal">
        <div className="space-y-4">
          <div>
            <p className="text-xs text-muted mb-2">Quick templates</p>
            <div className="grid grid-cols-2 gap-1.5">
              {GOAL_TEMPLATES.map((t) => (
                <button key={t.name} type="button" onClick={() => selectTemplate(t)}
                  className={cn("px-3 py-2 rounded-lg text-xs text-left border transition-all",
                    name === t.name ? "bg-accent-blue/15 text-accent-blue border-accent-blue/30" : "bg-white/[0.03] text-muted border-white/[0.04]"
                  )}>
                  {t.name}
                </button>
              ))}
            </div>
          </div>
          <form onSubmit={handleCreate} className="space-y-4">
            <Input label="Goal Name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g., Emergency Fund" />
            <div className="flex gap-3 items-end">
              <div className="flex-1">
                <Input label="Target Amount" type="number" step="0.01" value={target} onChange={(e) => setTarget(e.target.value)} className="font-number" />
              </div>
              <CurrencyToggle value={currency} onChange={setCurrency} />
            </div>
            <Input label="Target Date" type="date" value={targetDate} onChange={(e) => setTargetDate(e.target.value)} />
            {formError && <p className="text-sm text-accent-coral">{formError}</p>}
            <Button type="submit" className="w-full" loading={createGoal.isPending}>Create Goal</Button>
          </form>
        </div>
      </Modal>

      {/* 1% Magic Calculator */}
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
