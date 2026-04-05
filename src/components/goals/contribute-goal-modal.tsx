"use client";

import { useState, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import type { Currency } from "@/lib/constants";
import { Modal } from "@/components/ui/modal";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export interface ContributeGoalModalProps {
  open: boolean;
  onClose: () => void;
  goalId: string;
  currency: Currency;
  currentBalance: number;
  targetAmount: number | null;
}

export function ContributeGoalModal({
  open,
  onClose,
  goalId,
  currency,
  currentBalance,
  targetAmount,
}: ContributeGoalModalProps) {
  const supabase = createClient();
  const qc = useQueryClient();
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [formError, setFormError] = useState("");

  useEffect(() => {
    if (!open) return;
    setAmount("");
    setDate(new Date().toISOString().slice(0, 10));
    setFormError("");
  }, [open, goalId]);

  const contribute = useMutation({
    mutationFn: async ({ amt, d }: { amt: number; d: string }) => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      await supabase.from("goal_contributions").insert({
        goal_id: goalId,
        user_id: user!.id,
        amount: amt,
        date: d,
      });
      const newBalance = currentBalance + amt;
      const cap = targetAmount != null && targetAmount > 0 ? targetAmount : null;
      const isCompleted = cap != null ? newBalance >= cap : false;
      await supabase
        .from("savings_goals")
        .update({ current_balance: newBalance, is_completed: isCompleted })
        .eq("id", goalId);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["goals"] });
      qc.invalidateQueries({ queryKey: ["goal", goalId] });
      qc.invalidateQueries({ queryKey: ["goal-contributions", goalId] });
      qc.invalidateQueries({ queryKey: ["goal-contributions-month"] });
      qc.invalidateQueries({ queryKey: ["remittances-month"] });
    },
  });

  function handleClose() {
    setAmount("");
    setFormError("");
    onClose();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError("");
    const num = parseFloat(amount);
    if (!num || num <= 0) {
      setFormError("Amount must be greater than 0");
      return;
    }
    try {
      await contribute.mutateAsync({ amt: num, d: date });
      handleClose();
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : "Failed");
    }
  }

  return (
    <Modal open={open} onClose={handleClose} title="Contribute">
      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          label="Amount"
          type="number"
          step="0.01"
          min="0"
          placeholder="0.00"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="font-number"
        />
        <Input
          label="Date"
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
        {formError && (
          <p className="text-sm text-accent-coral">{formError}</p>
        )}
        <Button type="submit" className="w-full" loading={contribute.isPending}>
          Add contribution
        </Button>
      </form>
    </Modal>
  );
}
