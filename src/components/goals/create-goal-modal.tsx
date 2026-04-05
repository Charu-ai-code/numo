"use client";

import { useState, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { useAppStore } from "@/lib/stores/app-store";
import {
  GOAL_TEMPLATES,
  GOAL_TYPES,
  type Currency,
  type GoalTypeSlug,
} from "@/lib/constants";
import { formatCurrency, cn } from "@/lib/utils";
import { Modal } from "@/components/ui/modal";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { CurrencyToggle } from "@/components/ui/currency-toggle";

function monthsToReachTarget(total: number, monthly: number): number {
  if (!monthly || monthly <= 0 || !total || total <= 0) return 12;
  return Math.max(1, Math.ceil(total / monthly));
}

function dateAfterMonths(months: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() + months);
  return d.toISOString().slice(0, 10);
}

export interface CreateGoalModalProps {
  open: boolean;
  onClose: () => void;
  /** Income − budgets − goal targets (same currency caveat as budget page). */
  planHeadroom: number;
  primaryCurrency: Currency;
}

export function CreateGoalModal({
  open,
  onClose,
  planHeadroom,
  primaryCurrency,
}: CreateGoalModalProps) {
  const supabase = createClient();
  const qc = useQueryClient();
  const profile = useAppStore((s) => s.profile);

  const [name, setName] = useState("");
  const [target, setTarget] = useState("");
  const [targetDate, setTargetDate] = useState("");
  const [currency, setCurrency] = useState<Currency>(
    profile?.primary_currency || "USD"
  );
  const [goalType, setGoalType] = useState<GoalTypeSlug>("custom");
  const [monthlyTarget, setMonthlyTarget] = useState("");
  const [isRecurring, setIsRecurring] = useState(false);
  const [icon, setIcon] = useState("Target");
  const [color, setColor] = useState("#4edea3");
  const [formError, setFormError] = useState("");

  useEffect(() => {
    if (!open) return;
    setCurrency(profile?.primary_currency || "USD");
  }, [open, profile?.primary_currency]);

  const createGoal = useMutation({
    mutationFn: async (goal: Record<string, unknown>) => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const { data, error } = await supabase
        .from("savings_goals")
        .insert({ ...goal, user_id: user!.id })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["goals"] });
    },
  });

  function resetForm() {
    setName("");
    setTarget("");
    setTargetDate("");
    setGoalType("custom");
    setMonthlyTarget("");
    setIsRecurring(false);
    setIcon("Target");
    setColor("#4edea3");
    setFormError("");
  }

  function handleClose() {
    resetForm();
    onClose();
  }

  function selectTemplate(t: (typeof GOAL_TEMPLATES)[number]) {
    setName(t.name);
    setTarget(String(t.target));
    setCurrency(t.currency);
    setGoalType(t.goal_type);
    setIcon(t.icon);
    setColor(t.color);
    const rec =
      !!t.is_recurring ||
      t.goal_type === "send_home" ||
      t.goal_type === "invest";
    setIsRecurring(rec);
    setMonthlyTarget(
      t.monthly_target != null
        ? String(t.monthly_target)
        : profile?.planned_monthly_remittance != null
          ? String(profile.planned_monthly_remittance)
          : ""
    );
    const months = monthsToReachTarget(t.target, t.monthly_target || t.target / 12);
    setTargetDate(dateAfterMonths(Number.isFinite(months) ? months : t.months));
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setFormError("");
    if (!name.trim()) {
      setFormError("Name is required");
      return;
    }

    const mtParsed = isRecurring ? parseFloat(monthlyTarget) : NaN;
    const targetParsed = parseFloat(target);

    const monthlyOnlyAllowed =
      (goalType === "send_home" || goalType === "invest") &&
      isRecurring &&
      !isNaN(mtParsed) &&
      mtParsed > 0 &&
      (isNaN(targetParsed) || targetParsed <= 0);

    if (monthlyOnlyAllowed) {
      try {
        await createGoal.mutateAsync({
          name: name.trim(),
          target_amount: null,
          target_date: null,
          currency,
          icon,
          color,
          goal_type: goalType,
          is_recurring: true,
          monthly_target: mtParsed,
          is_completed: false,
        });
        handleClose();
      } catch (err: unknown) {
        setFormError(err instanceof Error ? err.message : "Failed to create goal");
      }
      return;
    }

    if (!targetParsed || targetParsed <= 0) {
      setFormError("Target amount must be greater than 0 (or use monthly-only for Send Home / Invest)");
      return;
    }

    let finalDate = targetDate;
    if (isRecurring && mtParsed > 0 && targetParsed > 0) {
      const m = monthsToReachTarget(targetParsed, mtParsed);
      const suggested = dateAfterMonths(m);
      if (!finalDate || new Date(finalDate) <= new Date()) {
        finalDate = suggested;
        setTargetDate(suggested);
      }
    }

    if (!finalDate || new Date(finalDate) <= new Date()) {
      setFormError("Target date must be in the future");
      return;
    }

    if (isRecurring) {
      if (isNaN(mtParsed) || mtParsed <= 0) {
        setFormError("Monthly target is required for recurring goals");
        return;
      }
    }

    try {
      await createGoal.mutateAsync({
        name: name.trim(),
        target_amount: targetParsed,
        currency,
        target_date: finalDate,
        icon,
        color,
        goal_type: goalType,
        is_recurring: isRecurring,
        monthly_target: isRecurring ? mtParsed : null,
        is_completed: false,
      });
      handleClose();
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : "Failed to create goal");
    }
  }

  const headroomWarning = planHeadroom < 0;

  return (
    <Modal open={open} onClose={handleClose} title="Create a Goal">
      <div className="space-y-4">
        {headroomWarning && (
          <div className="p-3 rounded-xl border border-accent-amber/30 bg-accent-amber/[0.08]">
            <p className="text-xs text-accent-amber">
              Your budgets and goal targets already exceed your stated income by{" "}
              {formatCurrency(Math.abs(planHeadroom), primaryCurrency)}. You can
              still add this goal — consider adjusting elsewhere.
            </p>
          </div>
        )}
        {planHeadroom >= 0 && profile?.monthly_income != null && profile.monthly_income > 0 && (
          <div className="p-3 rounded-xl bg-white/[0.04] border border-white/[0.08]">
            <p className="text-xs text-muted">
              Unassigned this month:{" "}
              <span className="text-accent-green font-number">
                {formatCurrency(planHeadroom, primaryCurrency)}
              </span>{" "}
              (income − budgets − goal targets; approximate if mixed currency)
            </p>
          </div>
        )}

        <div>
          <p className="text-xs text-muted mb-2">Quick templates</p>
          <div className="grid grid-cols-2 gap-1.5">
            {GOAL_TEMPLATES.map((t) => (
              <button
                key={t.name}
                type="button"
                onClick={() => selectTemplate(t)}
                className={cn(
                  "px-3 py-2 rounded-lg text-xs text-left border transition-all",
                  name === t.name
                    ? "bg-accent-blue/15 text-accent-blue border-accent-blue/30"
                    : "bg-white/[0.03] text-muted border-white/[0.04]"
                )}
              >
                {t.name}
              </button>
            ))}
          </div>
        </div>

        <form onSubmit={handleCreate} className="space-y-4">
          <Input
            label="Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g., Emergency Fund"
          />
          <div className="space-y-1.5">
            <label className="block text-sm text-muted">Goal type</label>
            <select
              value={goalType}
              onChange={(e) => {
                const v = e.target.value as GoalTypeSlug;
                setGoalType(v);
                setIsRecurring(v === "send_home" || v === "invest");
              }}
              className="w-full px-4 py-2.5 bg-surface border border-white/[0.08] rounded-xl text-sm text-white outline-none [&>option]:bg-surface [&>option]:text-white"
            >
              {GOAL_TYPES.map((g) => (
                <option key={g.value} value={g.value}>
                  {g.label}
                </option>
              ))}
            </select>
          </div>
          <label className="flex items-center gap-2 text-sm text-muted cursor-pointer">
            <input
              type="checkbox"
              checked={isRecurring}
              onChange={(e) => setIsRecurring(e.target.checked)}
              className="accent-accent-green"
            />
            Monthly contribution target (remittances count for Send Home)
          </label>
          {isRecurring && (
            <Input
              label="Monthly target"
              type="number"
              step="0.01"
              min="0"
              value={monthlyTarget}
              onChange={(e) => setMonthlyTarget(e.target.value)}
              className="font-number"
            />
          )}
          <p className="text-[11px] text-muted -mt-2">
            Send Home / Invest: leave total target empty for monthly-only commitment.
          </p>
          <div className="flex gap-3 items-end">
            <div className="flex-1">
              <Input
                label="Total target (optional for Send Home / Invest)"
                type="number"
                step="0.01"
                value={target}
                onChange={(e) => setTarget(e.target.value)}
                className="font-number"
              />
            </div>
            <CurrencyToggle value={currency} onChange={setCurrency} />
          </div>
          <Input
            label="Target date (auto-filled from monthly + total when possible)"
            type="date"
            value={targetDate}
            onChange={(e) => setTargetDate(e.target.value)}
          />
          {formError && (
            <p className="text-sm text-accent-coral">{formError}</p>
          )}
          <Button type="submit" className="w-full" loading={createGoal.isPending}>
            Create Goal
          </Button>
        </form>
      </div>
    </Modal>
  );
}
