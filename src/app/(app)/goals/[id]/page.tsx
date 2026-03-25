"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, CheckCircle2, Flame } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { formatCurrency, formatDateShort, daysRemaining, cn } from "@/lib/utils";
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
  const [amount, setAmount] = useState("");
  const [formError, setFormError] = useState("");

  const { data: goal, isLoading } = useQuery({
    queryKey: ["goal", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("savings_goals").select("*").eq("id", id).single();
      if (error) throw error;
      return data;
    },
  });

  const { data: contributions } = useQuery({
    queryKey: ["goal-contributions", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("goal_contributions")
        .select("*").eq("goal_id", id).order("date", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const contribute = useMutation({
    mutationFn: async (amt: number) => {
      const { data: { user } } = await supabase.auth.getUser();
      await supabase.from("goal_contributions").insert({
        goal_id: id, user_id: user!.id, amount: amt, date: new Date().toISOString().slice(0, 10),
      });
      const newBalance = (goal?.current_balance || 0) + amt;
      const isCompleted = newBalance >= (goal?.target_amount || 0);
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

  const pct = goal.target_amount > 0 ? (goal.current_balance / goal.target_amount) * 100 : 0;
  const completed = goal.is_completed || pct >= 100;
  const days = daysRemaining(goal.target_date);
  const monthsLeft = Math.max(1, days / 30);
  const neededPerMonth = Math.max(0, (goal.target_amount - goal.current_balance) / monthsLeft);

  return (
    <div className="space-y-6 animate-fade-in">
      <button onClick={() => router.push("/goals")} className="flex items-center gap-2 text-sm text-muted hover:text-white transition-colors">
        <ArrowLeft className="w-4 h-4" /> Goals
      </button>

      <Card className="flex flex-col items-center text-center py-8">
        <ProgressRing pct={pct} color={completed ? "#4edea3" : pct < 30 && days < 60 ? "#e9c349" : goal.color || "#4edea3"} />
        <h2 className="text-lg font-semibold mt-4">
          {completed && <CheckCircle2 className="w-5 h-5 inline text-accent-green mr-1" />}
          {goal.name}
        </h2>
        <p className="font-number text-muted mt-1">
          {formatCurrency(goal.current_balance, goal.currency)} / {formatCurrency(goal.target_amount, goal.currency)}
        </p>
        {!completed && (
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

      {!completed && (
        <Button className="w-full" onClick={() => setShowContribute(true)}>
          Contribute Now
        </Button>
      )}

      <div>
        <p className="text-sm text-muted mb-3">Contributions</p>
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
    </div>
  );
}
