"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, CheckCircle2, Flame, Pencil, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { formatCurrency, formatDateShort, daysRemaining } from "@/lib/utils";
import { monthlyGoalProgress, type SavingsGoalRow } from "@/lib/budget-engine";
import { GOAL_TYPES, type GoalTypeSlug } from "@/lib/constants";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Input } from "@/components/ui/input";
import { ShimmerCard } from "@/components/ui/shimmer";

function ProgressRing({ pct, size = 120, color = "#4edea3" }: { pct: number; size?: number; color?: string }) {
  const radius = (size - 12) / 2;
  const circ = 2 * Math.PI * radius;
  const offset = circ - (Math.min(pct, 100) / 100) * circ;
  return (
    <svg width={size} height={size}>
      <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={6} />
      <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={color} strokeWidth={6}
        strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round"
        transform={`rotate(-90 ${size / 2} ${size / 2})`} className="transition-all duration-700" />
      <text x="50%" y="50%" textAnchor="middle" dy="0.35em" className="fill-white text-lg font-number font-bold">
        {Math.round(pct)}%
      </text>
    </svg>
  );
}

export default function GoalDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const supabase = createClient();
  const qc = useQueryClient();
  const [showContribute, setShowContribute] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [amount, setAmount] = useState("");
  const [formError, setFormError] = useState("");
  const [editName, setEditName] = useState("");
  const [editTarget, setEditTarget] = useState("");
  const [editTargetDate, setEditTargetDate] = useState("");
  const [editGoalType, setEditGoalType] = useState<GoalTypeSlug>("custom");
  const [editMonthlyTarget, setEditMonthlyTarget] = useState("");
  const [editRecurring, setEditRecurring] = useState(false);
  const [editError, setEditError] = useState("");

  const { data: goal, isLoading } = useQuery({
    queryKey: ["goal", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("savings_goals").select("*").eq("id", id).single();
      if (error) throw error;
      return data;
    },
  });

  const monthStart = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}-01`;

  const { data: contributions } = useQuery({
    queryKey: ["goal-contributions", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("goal_contributions")
        .select("*").eq("goal_id", id).order("date", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: remittancesForGoal } = useQuery({
    queryKey: ["goal-remittances", id, monthStart],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("remittances")
        .select("*")
        .eq("goal_id", id)
        .gte("date", monthStart);
      if (error) throw error;
      return data;
    },
    enabled: !!goal && goal.goal_type === "send_home",
  });

  const contribute = useMutation({
    mutationFn: async (amt: number) => {
      const { data: { user } } = await supabase.auth.getUser();
      await supabase.from("goal_contributions").insert({
        goal_id: id, user_id: user!.id, amount: amt, date: new Date().toISOString().slice(0, 10),
      });
      const newBalance = (goal?.current_balance || 0) + amt;
      const cap =
        goal?.target_amount != null && goal.target_amount > 0
          ? goal.target_amount
          : null;
      const isCompleted = cap != null ? newBalance >= cap : false;
      await supabase.from("savings_goals").update({
        current_balance: newBalance, is_completed: isCompleted,
      }).eq("id", id);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["goal", id] });
      qc.invalidateQueries({ queryKey: ["goal-contributions", id] });
      qc.invalidateQueries({ queryKey: ["goals"] });
    },
  });

  const deleteGoal = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("savings_goals").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["goals"] });
      qc.removeQueries({ queryKey: ["goal", id] });
      qc.removeQueries({ queryKey: ["goal-contributions", id] });
      router.replace("/goals");
    },
  });

  const updateGoal = useMutation({
    mutationFn: async (payload: {
      name: string;
      target_amount: number | null;
      target_date: string | null;
      goal_type: GoalTypeSlug;
      is_recurring: boolean;
      monthly_target: number | null;
    }) => {
      const { error } = await supabase.from("savings_goals").update(payload).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["goal", id] });
      qc.invalidateQueries({ queryKey: ["goals"] });
    },
  });

  function openEdit() {
    if (!goal) return;
    setEditName(goal.name);
    setEditTarget(
      goal.target_amount != null && goal.target_amount > 0
        ? String(goal.target_amount)
        : ""
    );
    setEditTargetDate(goal.target_date || "");
    setEditGoalType((goal.goal_type as GoalTypeSlug) || "custom");
    setEditRecurring(!!goal.is_recurring);
    setEditMonthlyTarget(
      goal.monthly_target != null ? String(goal.monthly_target) : ""
    );
    setEditError("");
    setShowEdit(true);
  }

  async function handleEditSave(e: React.FormEvent) {
    e.preventDefault();
    setEditError("");
    if (!editName.trim()) {
      setEditError("Name is required");
      return;
    }
    const mtParsed = editRecurring ? parseFloat(editMonthlyTarget) : NaN;
    const numTarget = parseFloat(editTarget);
    const monthlyOnlyAllowed =
      (editGoalType === "send_home" || editGoalType === "invest") &&
      editRecurring &&
      !isNaN(mtParsed) &&
      mtParsed > 0 &&
      (isNaN(numTarget) || numTarget <= 0);

    if (monthlyOnlyAllowed) {
      try {
        await updateGoal.mutateAsync({
          name: editName.trim(),
          target_amount: null,
          target_date: null,
          goal_type: editGoalType,
          is_recurring: true,
          monthly_target: mtParsed,
        });
        setShowEdit(false);
      } catch (err: any) {
        setEditError(err.message);
      }
      return;
    }

    if (!numTarget || numTarget <= 0) {
      setEditError("Target must be > 0 (or use monthly-only for Send Home / Invest)");
      return;
    }
    if (!editTargetDate || new Date(editTargetDate) <= new Date()) {
      setEditError("Target date must be in the future");
      return;
    }
    let mt: number | null = null;
    if (editRecurring) {
      const parsed = parseFloat(editMonthlyTarget);
      if (!parsed || parsed <= 0) {
        setEditError("Monthly target is required for recurring goals");
        return;
      }
      mt = parsed;
    }
    try {
      await updateGoal.mutateAsync({
        name: editName.trim(),
        target_amount: numTarget,
        target_date: editTargetDate,
        goal_type: editGoalType,
        is_recurring: editRecurring,
        monthly_target: mt,
      });
      setShowEdit(false);
    } catch (err: any) {
      setEditError(err.message);
    }
  }

  async function handleContribute(e: React.FormEvent) {
    e.preventDefault();
    setFormError("");
    const num = parseFloat(amount);
    if (!num || num <= 0) { setFormError("Amount must be > 0"); return; }
    try {
      await contribute.mutateAsync(num);
      setShowContribute(false);
      setAmount("");
    } catch (err: any) { setFormError(err.message); }
  }

  if (isLoading || !goal) {
    return <div className="space-y-4"><div className="shimmer h-6 w-32 rounded-lg" /><ShimmerCard /></div>;
  }

  const hasCap = goal.target_amount != null && goal.target_amount > 0;
  const pct = hasCap ? (goal.current_balance / goal.target_amount) * 100 : 0;
  const completed = goal.is_completed || (hasCap && pct >= 100);
  const days = goal.target_date ? daysRemaining(goal.target_date) : 0;
  const monthsLeft = Math.max(1, days / 30);
  const neededPerMonth = hasCap
    ? Math.max(0, (goal.target_amount - goal.current_balance) / monthsLeft)
    : 0;

  const gRow = goal as SavingsGoalRow;
  const monthlyProgress =
    goal.is_recurring && goal.monthly_target
      ? monthlyGoalProgress(
          { ...gRow, id: String(id) },
          (contributions || []).map((c: any) => ({
            goal_id: c.goal_id,
            amount: c.amount,
            date: c.date,
          })),
          (remittancesForGoal || []).map((r: any) => ({
            goal_id: r.goal_id,
            amount_sent: r.amount_sent,
            date: r.date,
            from_currency: r.from_currency,
          })),
          monthStart
        )
      : 0;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between gap-2">
        <button type="button" onClick={() => router.push("/goals")} className="flex items-center gap-2 text-sm text-muted hover:text-white transition-colors">
          <ArrowLeft className="w-4 h-4" /> Goals
        </button>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" onClick={openEdit} className="text-muted">
            <Pencil className="w-4 h-4 mr-1" /> Edit
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="text-accent-coral"
            loading={deleteGoal.isPending}
            onClick={() => {
              if (
                !confirm(
                  "Delete this goal? Contribution history will be removed. Remittances stay in your log but will no longer be linked to this goal."
                )
              ) {
                return;
              }
              deleteGoal.mutate();
            }}
          >
            <Trash2 className="w-4 h-4 mr-1" /> Delete
          </Button>
        </div>
      </div>

      <Card className="flex flex-col items-center text-center py-8">
        <ProgressRing pct={pct} color={completed ? "#4edea3" : pct < 30 && days < 60 ? "#e9c349" : goal.color || "#4edea3"} />
        <p className="text-[11px] text-muted uppercase tracking-wide mt-2">
          {GOAL_TYPES.find((x) => x.value === goal.goal_type)?.label ?? "Goal"}
        </p>
        <h2 className="text-lg font-semibold mt-1">
          {completed && <CheckCircle2 className="w-5 h-5 inline text-accent-green mr-1" />}
          {goal.name}
        </h2>
        <p className="font-number text-muted mt-1">
          {hasCap
            ? `${formatCurrency(goal.current_balance, goal.currency)} / ${formatCurrency(goal.target_amount, goal.currency)}`
            : goal.is_recurring && goal.monthly_target
              ? `${formatCurrency(goal.monthly_target, goal.currency)}/mo target`
              : "—"}
        </p>
        {goal.is_recurring && goal.monthly_target && (
          <p className="text-sm font-number mt-3">
            This month: {formatCurrency(monthlyProgress, goal.currency)} /{" "}
            {formatCurrency(goal.monthly_target, goal.currency)}
          </p>
        )}
        {!completed && hasCap && (
          <p className="text-xs text-muted mt-2">
            {days} days left &middot; Need {formatCurrency(neededPerMonth, goal.currency)}/month
          </p>
        )}
        {completed && <p className="text-xs text-accent-green mt-2 font-medium">Goal completed!</p>}
        {!completed && pct < 30 && days < 60 && (
          <p className="text-xs text-accent-amber mt-2 flex items-center gap-1">
            <Flame className="w-3 h-3" /> At risk — increase contributions to stay on track
          </p>
        )}
      </Card>

      {goal.goal_type === "send_home" && (
        <p className="text-xs text-muted text-center">
          Log transfers on the Remittances page — they count toward this goal automatically.
        </p>
      )}
      {!completed && goal.goal_type !== "send_home" && (
        <Button className="w-full" onClick={() => setShowContribute(true)}>
          Contribute Now
        </Button>
      )}

      <div>
        <p className="text-sm text-muted mb-1">Contributions</p>
        <p className="text-[11px] text-muted leading-relaxed mb-3">
          Contribute adds a goal-only record (it does not post to an account or the Transactions
          list). Send Home goals also count{" "}
          <span className="text-white/70">Remittances</span> you assign to this goal.
        </p>
        {!contributions || contributions.length === 0 ? (
          <p className="text-xs text-muted text-center py-4">No contributions yet</p>
        ) : (
          <div className="space-y-2">
            {contributions.map((c: any) => (
              <Card key={c.id} className="flex items-center justify-between py-3">
                <p className="text-xs text-muted">{formatDateShort(c.date)}</p>
                <p className="font-number text-sm text-accent-green font-semibold">
                  +{formatCurrency(c.amount, goal.currency)}
                </p>
              </Card>
            ))}
          </div>
        )}
      </div>

      <Modal open={showContribute} onClose={() => setShowContribute(false)} title="Contribute">
        <form onSubmit={handleContribute} className="space-y-4">
          <Input label="Amount" type="number" step="0.01" min="0" placeholder="0.00" value={amount}
            onChange={(e) => setAmount(e.target.value)} className="font-number" />
          {formError && <p className="text-sm text-accent-coral">{formError}</p>}
          <Button type="submit" className="w-full" loading={contribute.isPending}>Add Contribution</Button>
        </form>
      </Modal>

      <Modal open={showEdit} onClose={() => setShowEdit(false)} title="Edit goal">
        <form onSubmit={handleEditSave} className="space-y-4">
          <Input label="Goal name" value={editName} onChange={(e) => setEditName(e.target.value)} />
          <div className="space-y-1.5">
            <label className="block text-sm text-muted">Goal type</label>
            <select
              value={editGoalType}
              onChange={(e) => {
                const v = e.target.value as GoalTypeSlug;
                setEditGoalType(v);
                if (v === "send_home" || v === "invest") setEditRecurring(true);
              }}
              className="w-full px-4 py-2.5 bg-surface border border-white/[0.08] rounded-xl text-sm text-white outline-none [&>option]:bg-surface [&>option]:text-white"
            >
              {GOAL_TYPES.map((g) => (
                <option key={g.value} value={g.value}>{g.label}</option>
              ))}
            </select>
          </div>
          <label className="flex items-center gap-2 text-sm text-muted cursor-pointer">
            <input
              type="checkbox"
              checked={editRecurring}
              onChange={(e) => setEditRecurring(e.target.checked)}
              className="accent-accent-green"
            />
            Monthly contribution target
          </label>
          {editRecurring && (
            <Input
              label="Monthly target"
              type="number"
              step="0.01"
              min="0"
              value={editMonthlyTarget}
              onChange={(e) => setEditMonthlyTarget(e.target.value)}
              className="font-number"
            />
          )}
          <p className="text-[11px] text-muted">Send Home / Invest: clear total target for monthly-only.</p>
          <Input label="Target amount (optional for Send Home / Invest)" type="number" step="0.01" value={editTarget} onChange={(e) => setEditTarget(e.target.value)} className="font-number" />
          <Input label="Target date" type="date" value={editTargetDate} onChange={(e) => setEditTargetDate(e.target.value)} />
          {editError && <p className="text-sm text-accent-coral">{editError}</p>}
          <Button type="submit" className="w-full" loading={updateGoal.isPending}>Save</Button>
        </form>
      </Modal>
    </div>
  );
}
