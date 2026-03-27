"use client";

import { useState, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Plus, Handshake } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAccounts } from "@/lib/hooks/use-accounts";
import { useAppStore } from "@/lib/stores/app-store";
import { type Currency, type SplitMethod } from "@/lib/constants";
import { formatCurrency, formatDateShort, getInitials, cn, resolveDefaultAccount } from "@/lib/utils";
import { looksLikeSettlementDescription } from "@/lib/splitwise-settlement";
import {
  balancesFromManualLedger,
  balancesFromSimplifiedDebts,
  type SimplifiedDebtRow,
} from "@/lib/splitwise-debts";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { CurrencyToggle } from "@/components/ui/currency-toggle";
import { ShimmerCard } from "@/components/ui/shimmer";

export default function SplitGroupDetailPage() {
  const { groupId } = useParams<{ groupId: string }>();
  const router = useRouter();
  const supabase = createClient();
  const qc = useQueryClient();
  const profile = useAppStore((s) => s.profile);
  const { data: accounts } = useAccounts();

  const [showAddExpense, setShowAddExpense] = useState(false);
  const [showSettle, setShowSettle] = useState(false);
  const [desc, setDesc] = useState("");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState<Currency>(profile?.primary_currency || "USD");
  const [paidBy, setPaidBy] = useState("");
  const [splitMethod, setSplitMethod] = useState<SplitMethod>("equal");
  const [formError, setFormError] = useState("");
  const [settleTo, setSettleTo] = useState("");
  const [settleAmount, setSettleAmount] = useState("");
  /** After add: Splitwise push result (Numo always saves locally first) */
  const [splitwiseNotice, setSplitwiseNotice] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  const { data: group, isLoading } = useQuery({
    queryKey: ["split-group", groupId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("split_groups")
        .select("*, split_members(*)")
        .eq("id", groupId)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const { data: expenses } = useQuery({
    queryKey: ["split-expenses", groupId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("split_expenses")
        .select("*, split_shares(*), paid_by_member:split_members!paid_by(name)")
        .eq("group_id", groupId)
        .order("date", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: settlements } = useQuery({
    queryKey: ["split-settlements", groupId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("split_settlements")
        .select("*, from:split_members!from_member(name), to:split_members!to_member(name)")
        .eq("group_id", groupId)
        .order("date", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const members = useMemo(() => group?.split_members || [], [group]);

  const sharedExpenses = useMemo(
    () =>
      (expenses || []).filter(
        (e: any) => !looksLikeSettlementDescription(e.description)
      ),
    [expenses]
  );

  const balances = useMemo(() => {
    const cur = (profile?.primary_currency || currency) as string;
    let raw: Record<string, number>;
    if (group?.splitwise_group_id) {
      raw = balancesFromSimplifiedDebts(
        group.simplified_debts as SimplifiedDebtRow[] | null,
        members,
        cur
      );
    } else {
      raw = balancesFromManualLedger(
        String(groupId),
        sharedExpenses,
        settlements || []
      );
    }
    const bal: Record<string, number> = {};
    members.forEach((m: any) => {
      bal[m.id] = raw[m.id] ?? 0;
    });
    return bal;
  }, [
    group?.splitwise_group_id,
    group?.simplified_debts,
    groupId,
    members,
    sharedExpenses,
    settlements,
    profile?.primary_currency,
    currency,
  ]);

  const addExpense = useMutation({
    mutationFn: async (data: any) => {
      const { data: { user } } = await supabase.auth.getUser();
      const expDate = new Date().toISOString().slice(0, 10);

      const { data: expense, error } = await supabase
        .from("split_expenses")
        .insert({
          group_id: groupId, description: data.desc, amount: data.amount,
          currency: data.currency, paid_by: data.paidBy, split_method: data.splitMethod, date: expDate,
        })
        .select()
        .single();
      if (error) throw error;

      const shareAmount = data.amount / members.length;
      const shares = members.map((m: any) => ({
        expense_id: expense.id, member_id: m.id, share_amount: shareAmount,
      }));
      await supabase.from("split_shares").insert(shares);

      // Auto-create transaction for current user's share
      const accountId = resolveDefaultAccount(profile, accounts);
      if (accountId && user) {
        const groupName = group?.name || "Split";
        await supabase.from("transactions").insert({
          user_id: user.id,
          account_id: accountId,
          amount: shareAmount,
          currency: data.currency,
          type: "expense",
          category: "family_remittance",
          note: `${data.desc} (Split: ${groupName})`,
          date: expDate,
          source: "split",
          split_expense_id: expense.id,
        });
      }

      return expense;
    },
    onSuccess: async (expense) => {
      qc.invalidateQueries({ queryKey: ["split-expenses", groupId] });
      qc.invalidateQueries({ queryKey: ["transactions"] });
      qc.invalidateQueries({ queryKey: ["accounts"] });
      setShowAddExpense(false);
      setDesc("");
      setAmount("");
      setSplitwiseNotice(null);

      if (!group?.splitwise_group_id) return;

      try {
        const res = await fetch("/api/splitwise/push-expense", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ expenseId: expense.id }),
        });
        const j = await res.json().catch(() => ({}));
        if (!res.ok) {
          setSplitwiseNotice({
            type: "error",
            message: j.error || "Saved in Numo; failed to add to Splitwise.",
          });
          return;
        }
        if (j.skipped) return;
        setSplitwiseNotice({
          type: "success",
          message: "Also added to your Splitwise group.",
        });
        qc.invalidateQueries({ queryKey: ["split-expenses", groupId] });
      } catch {
        setSplitwiseNotice({
          type: "error",
          message: "Saved in Numo; could not reach Splitwise.",
        });
      }
    },
  });

  const settle = useMutation({
    mutationFn: async ({ from, to, amt }: { from: string; to: string; amt: number }) => {
      const { error } = await supabase.from("split_settlements").insert({
        group_id: groupId, from_member: from, to_member: to, amount: amt, currency,
        date: new Date().toISOString().slice(0, 10),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["split-settlements", groupId] });
      setShowSettle(false); setSettleAmount("");
    },
  });

  async function handleAddExpense(e: React.FormEvent) {
    e.preventDefault();
    setFormError("");
    const num = parseFloat(amount);
    if (!desc.trim()) { setFormError("Description is required"); return; }
    if (!num || num <= 0) { setFormError("Amount must be > 0"); return; }
    if (!paidBy) { setFormError("Select who paid"); return; }
    await addExpense.mutateAsync({ desc: desc.trim(), amount: num, currency, paidBy, splitMethod });
  }

  const currentUserId = profile?.id;
  const myMember = members.find((m: any) => m.user_id === currentUserId);

  if (isLoading || !group) {
    return <div className="space-y-4"><div className="shimmer h-6 w-32 rounded-lg" /><ShimmerCard /><ShimmerCard /></div>;
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <button onClick={() => router.push("/split")} className="flex items-center gap-2 text-sm text-muted hover:text-white transition-colors">
        <ArrowLeft className="w-4 h-4" /> Splits
      </button>

      <h1 className="text-xl font-semibold">{group.name}</h1>

      {splitwiseNotice && (
        <div
          role="status"
          className={
            splitwiseNotice.type === "success"
              ? "rounded-xl border border-accent-green/25 bg-accent-green/10 px-3 py-2.5 text-sm text-accent-green"
              : "rounded-xl border border-accent-coral/25 bg-accent-coral/10 px-3 py-2.5 text-sm text-accent-coral"
          }
        >
          <div className="flex justify-between gap-2 items-start">
            <span>{splitwiseNotice.message}</span>
            <button
              type="button"
              onClick={() => setSplitwiseNotice(null)}
              className="text-xs text-white/50 hover:text-white shrink-0"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* Member Balances — Splitwise groups use API simplified_debts only */}
      <Card className="space-y-3">
        <div className="space-y-1">
          <p className="text-xs text-muted uppercase tracking-wide">Balances</p>
          {group.splitwise_group_id && (
            <p className="text-[11px] text-white/40 leading-snug">
              From Splitwise (simplified debts). Run Sync on the Split page to refresh.
            </p>
          )}
        </div>
        {members.map((m: any) => {
          const bal = balances[m.id] || 0;
          return (
            <div key={m.id} className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-full bg-accent-blue/20 flex items-center justify-center text-[10px] font-semibold text-accent-blue">
                  {getInitials(m.name)}
                </div>
                <span className="text-sm">{m.name}</span>
              </div>
              <span className={cn("font-number text-sm font-semibold",
                bal > 0 ? "text-accent-green" : bal < 0 ? "text-accent-coral" : "text-muted"
              )}>
                {bal > 0 ? "+" : ""}{formatCurrency(bal, currency)}
              </span>
            </div>
          );
        })}
      </Card>

      <div className="flex gap-3">
        <Button
          className="flex-1"
          onClick={() => {
            setSplitwiseNotice(null);
            setShowAddExpense(true);
            if (members.length) setPaidBy(members[0].id);
          }}
        >
          <Plus className="w-4 h-4" /> Add Expense
        </Button>
        <Button variant="secondary" className="flex-1" onClick={() => setShowSettle(true)}>
          <Handshake className="w-4 h-4" /> Settle Up
        </Button>
      </div>

      {/* Expenses List — shared bills only; settlements are under Settlement History */}
      <div>
        <p className="text-sm text-muted mb-3">Shared expenses</p>
        {!sharedExpenses || sharedExpenses.length === 0 ? (
          <p className="text-xs text-muted text-center py-4">No shared expenses yet</p>
        ) : (
          <div className="space-y-2">
            {sharedExpenses.map((exp: any) => (
              <Card key={exp.id} className="flex items-center justify-between py-3">
                <div>
                  <p className="text-sm">{exp.description}</p>
                  <p className="text-xs text-muted">
                    Paid by {(exp as any).paid_by_member?.name || "—"} &middot; {formatDateShort(exp.date)}
                  </p>
                </div>
                <p className="font-number text-sm font-semibold">{formatCurrency(exp.amount, exp.currency)}</p>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Settlement history — debt transfers only (not spending); includes Splitwise sync */}
      <div>
        <div className="mb-3">
          <p className="text-sm text-muted">Settlement history</p>
          <p className="text-[11px] text-white/35 mt-0.5">
            Payments between members that reduce balances — not shown on Transactions
          </p>
        </div>
        {!settlements || settlements.length === 0 ? (
          <p className="text-xs text-muted text-center py-4 border border-white/[0.06] rounded-xl">
            No settlements yet. Splitwise payment/settle rows sync here after you run Sync.
          </p>
        ) : (
          <div className="space-y-2">
            {settlements.map((s: any) => (
              <Card key={s.id} className="flex items-center justify-between py-3">
                <div>
                  <p className="text-sm">
                    {(s as any).from?.name}{" "}
                    <span className="text-muted">paid</span> {(s as any).to?.name}
                  </p>
                  <p className="text-[11px] text-muted mt-0.5">{formatDateShort(s.date)}</p>
                </div>
                <p className="font-number text-sm text-accent-green">{formatCurrency(s.amount, s.currency)}</p>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Add Expense Modal */}
      <Modal open={showAddExpense} onClose={() => setShowAddExpense(false)} title="Add Split Expense">
        <form onSubmit={handleAddExpense} className="space-y-4">
          {group.splitwise_group_id ? (
            <p className="text-xs text-muted leading-relaxed">
              This group is linked to Splitwise. After you save, we&apos;ll add the same expense there
              too (split matches your shares below).
            </p>
          ) : (
            <p className="text-xs text-muted leading-relaxed">
              This group exists only in Numo. To mirror expenses in Splitwise, use a group synced
              from Splitwise (run Sync on the Split page) or connect Splitwise in Settings.
            </p>
          )}
          <Input label="Description" placeholder="e.g., Dinner" value={desc} onChange={(e) => setDesc(e.target.value)} />
          <div className="flex gap-3 items-end">
            <div className="flex-1">
              <Input label="Amount" type="number" step="0.01" placeholder="0.00" value={amount} onChange={(e) => setAmount(e.target.value)} className="font-number" />
            </div>
            <CurrencyToggle value={currency} onChange={setCurrency} />
          </div>
          <div className="space-y-1.5">
            <label className="block text-sm text-muted">Paid by</label>
            <select value={paidBy} onChange={(e) => setPaidBy(e.target.value)} className="w-full px-4 py-2.5 bg-white/[0.05] border border-white/[0.08] rounded-xl text-sm text-white outline-none">
              {members.map((m: any) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="block text-sm text-muted">Split method</label>
            <div className="flex gap-2">
              {(["equal", "percentage", "custom"] as SplitMethod[]).map((m) => (
                <button key={m} type="button" onClick={() => setSplitMethod(m)}
                  className={cn("flex-1 py-2 rounded-lg text-xs border transition-all capitalize",
                    splitMethod === m ? "bg-accent-blue/15 border-accent-blue/30 text-accent-blue" : "border-white/[0.06] text-muted"
                  )}>{m}</button>
              ))}
            </div>
          </div>
          {formError && <p className="text-sm text-accent-coral">{formError}</p>}
          <Button type="submit" className="w-full" loading={addExpense.isPending}>Add Expense</Button>
        </form>
      </Modal>

      {/* Settle Up Modal */}
      <Modal open={showSettle} onClose={() => setShowSettle(false)} title="Settle Up">
        <form onSubmit={(e) => { e.preventDefault(); const num = parseFloat(settleAmount); if (myMember && settleTo && num > 0) settle.mutate({ from: myMember.id, to: settleTo, amt: num }); }} className="space-y-4">
          <div className="space-y-1.5">
            <label className="block text-sm text-muted">Pay to</label>
            <select value={settleTo} onChange={(e) => setSettleTo(e.target.value)} className="w-full px-4 py-2.5 bg-white/[0.05] border border-white/[0.08] rounded-xl text-sm text-white outline-none">
              <option value="">Select member</option>
              {members.filter((m: any) => m.id !== myMember?.id).map((m: any) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </div>
          <Input label="Amount" type="number" step="0.01" placeholder="0.00" value={settleAmount} onChange={(e) => setSettleAmount(e.target.value)} className="font-number" />
          <Button type="submit" className="w-full" loading={settle.isPending}>Settle</Button>
        </form>
      </Modal>
    </div>
  );
}
