"use client";

import { useState, useMemo, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { Send, ArrowRight } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAppStore } from "@/lib/stores/app-store";
import { REMITTANCE_METHODS, type Currency } from "@/lib/constants";
import { formatCurrency, formatDateShort, cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { FAB } from "@/components/ui/fab";
import { Modal } from "@/components/ui/modal";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CurrencyToggle } from "@/components/ui/currency-toggle";
import { EmptyState } from "@/components/ui/empty-state";
import { ShimmerCard } from "@/components/ui/shimmer";

function RemittancesPageInner() {
  const supabase = createClient();
  const qc = useQueryClient();
  const profile = useAppStore((s) => s.profile);
  const searchParams = useSearchParams();

  const [showAdd, setShowAdd] = useState(false);
  const [amountSent, setAmountSent] = useState("");
  const [fromCurrency, setFromCurrency] = useState<Currency>("USD");
  const [toCurrency, setToCurrency] = useState<Currency>("INR");
  const [exchangeRate, setExchangeRate] = useState("83.5");
  const [method, setMethod] = useState(REMITTANCE_METHODS[0]);
  const [recipientLabel, setRecipientLabel] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [formError, setFormError] = useState("");

  useEffect(() => {
    const raw = searchParams.get("amount");
    if (raw == null || raw === "") return;
    const n = parseFloat(raw);
    if (!Number.isFinite(n) || n <= 0) return;
    setAmountSent(String(n));
    setShowAdd(true);
  }, [searchParams]);

  const { data: remittances, isLoading } = useQuery({
    queryKey: ["remittances"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("remittances")
        .select("*")
        .order("date", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const addRemittance = useMutation({
    mutationFn: async (rem: {
      amount_sent: number;
      from_currency: Currency;
      to_currency: Currency;
      exchange_rate: number;
      amount_received: number;
      method: string;
      recipient_label: string;
      date: string;
    }) => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not signed in");

      const { data: homeGoal } = await supabase
        .from("savings_goals")
        .select("id, current_balance")
        .eq("user_id", user.id)
        .eq("goal_type", "send_home")
        .maybeSingle();

      const insertPayload: Record<string, unknown> = {
        ...rem,
        user_id: user.id,
      };
      if (homeGoal?.id) {
        insertPayload.goal_id = homeGoal.id;
      }

      const { data, error } = await supabase
        .from("remittances")
        .insert(insertPayload)
        .select()
        .single();
      if (error) throw error;

      if (homeGoal?.id) {
        const nextBal =
          Number(homeGoal.current_balance || 0) + rem.amount_sent;
        await supabase
          .from("savings_goals")
          .update({ current_balance: nextBal })
          .eq("id", homeGoal.id);
        await supabase.from("goal_contributions").insert({
          goal_id: homeGoal.id,
          user_id: user.id,
          amount: rem.amount_sent,
          date: rem.date,
        });
      }

      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["remittances"] });
      qc.invalidateQueries({ queryKey: ["goals"] });
      qc.invalidateQueries({ queryKey: ["goal-contributions"] });
      qc.invalidateQueries({ queryKey: ["goal-contributions-month-dash"] });
      qc.invalidateQueries({ queryKey: ["goal-contributions-month"] });
      qc.invalidateQueries({ queryKey: ["goal-remittances"] });
      qc.invalidateQueries({ queryKey: ["goal"] });
    },
  });

  const now = new Date();
  const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
  const yearStart = `${now.getFullYear()}-01-01`;

  const { totalMonth, totalYear, rateHistory, byRecipient } = useMemo(() => {
    if (!remittances) return { totalMonth: 0, totalYear: 0, rateHistory: [], byRecipient: [] };

    let totalMonth = 0;
    let totalYear = 0;
    const recipientMap: Record<string, number> = {};
    const rates: { date: string; rate: number }[] = [];

    remittances.forEach((r: any) => {
      if (r.date >= monthStart) totalMonth += r.amount_sent;
      if (r.date >= yearStart) totalYear += r.amount_sent;
      recipientMap[r.recipient_label] = (recipientMap[r.recipient_label] || 0) + r.amount_sent;
      rates.push({ date: r.date, rate: r.exchange_rate });
    });

    const byRecipient = Object.entries(recipientMap)
      .map(([label, amount]) => ({ label, amount }))
      .sort((a, b) => b.amount - a.amount);

    return { totalMonth, totalYear, rateHistory: rates.reverse(), byRecipient };
  }, [remittances, monthStart, yearStart]);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setFormError("");
    const sent = parseFloat(amountSent);
    const rate = parseFloat(exchangeRate);
    if (!sent || sent <= 0) { setFormError("Amount must be > 0"); return; }
    if (!rate || rate <= 0) { setFormError("Exchange rate must be > 0"); return; }
    if (!recipientLabel.trim()) { setFormError("Recipient label is required"); return; }

    const received = sent * rate;
    try {
      await addRemittance.mutateAsync({
        amount_sent: sent, from_currency: fromCurrency, to_currency: toCurrency,
        exchange_rate: rate, amount_received: received, method, recipient_label: recipientLabel.trim(), date,
      });
      setShowAdd(false);
      setAmountSent(""); setRecipientLabel("");
    } catch (err: any) { setFormError(err.message); }
  }

  if (isLoading) {
    return (
      <div className="space-y-4 animate-fade-in">
        <h1 className="text-xl font-semibold">Remittances</h1>
        <ShimmerCard /><ShimmerCard />
      </div>
    );
  }

  return (
    <div className="space-y-4 animate-fade-in">
      <h1 className="text-xl font-semibold">Remittances</h1>

      {!remittances || remittances.length === 0 ? (
        <EmptyState
          icon={<Send className="w-12 h-12" />}
          title="No remittances yet"
          description="Track money sent between countries"
          actionLabel="Log a Transfer"
          onAction={() => setShowAdd(true)}
        />
      ) : (
        <>
          {/* Summary */}
          <div className="grid grid-cols-2 gap-3">
            <Card>
              <p className="text-xs text-muted">This Month</p>
              <p className="font-number text-lg font-semibold">{formatCurrency(totalMonth, fromCurrency)}</p>
            </Card>
            <Card>
              <p className="text-xs text-muted">This Year</p>
              <p className="font-number text-lg font-semibold">{formatCurrency(totalYear, fromCurrency)}</p>
            </Card>
          </div>

          {/* Exchange Rate Chart */}
          {rateHistory.length > 1 && (
            <Card>
              <p className="text-xs text-muted mb-3">Exchange Rate History</p>
              <ResponsiveContainer width="100%" height={140}>
                <LineChart data={rateHistory}>
                  <XAxis dataKey="date" tickFormatter={(v) => formatDateShort(v)} tick={{ fontSize: 10, fill: "#888" }} axisLine={false} tickLine={false} />
                  <YAxis hide domain={["dataMin - 1", "dataMax + 1"]} />
                  <Tooltip contentStyle={{ background: "#141414", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12, fontSize: 12 }}
                    formatter={(v: number) => [v.toFixed(2), "Rate"]} labelFormatter={(v) => formatDateShort(v)} />
                  <Line type="monotone" dataKey="rate" stroke="#b0c6ff" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </Card>
          )}

          {/* By Recipient */}
          {byRecipient.length > 0 && (
            <Card className="space-y-2">
              <p className="text-xs text-muted uppercase tracking-wide">By Recipient</p>
              {byRecipient.map((r) => (
                <div key={r.label} className="flex items-center justify-between">
                  <span className="text-sm">{r.label}</span>
                  <span className="font-number text-sm text-muted">{formatCurrency(r.amount, fromCurrency)}</span>
                </div>
              ))}
            </Card>
          )}

          {/* List */}
          <div className="space-y-2">
            {remittances.map((r: any) => (
              <Card key={r.id} className="flex items-center justify-between py-3">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm">{r.recipient_label}</p>
                    {r.goal_id && (
                      <Badge variant="green" className="text-[10px]">
                        Send Home goal
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted">{r.method} &middot; {formatDateShort(r.date)}</p>
                </div>
                <div className="text-right">
                  <p className="font-number text-sm font-semibold">
                    {formatCurrency(r.amount_sent, r.from_currency)}
                  </p>
                  <p className="font-number text-xs text-muted">
                    <ArrowRight className="w-3 h-3 inline" /> {formatCurrency(r.amount_received, r.to_currency)}
                  </p>
                </div>
              </Card>
            ))}
          </div>
        </>
      )}

      <FAB onClick={() => setShowAdd(true)} />

      <Modal open={showAdd} onClose={() => setShowAdd(false)} title="Log Remittance">
        <form onSubmit={handleAdd} className="space-y-4">
          <div className="flex gap-3 items-end">
            <div className="flex-1">
              <Input label="Amount Sent" type="number" step="0.01" placeholder="0.00" value={amountSent} onChange={(e) => setAmountSent(e.target.value)} className="font-number" />
            </div>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <CurrencyToggle value={fromCurrency} onChange={setFromCurrency} />
            <ArrowRight className="w-4 h-4 text-muted" />
            <CurrencyToggle value={toCurrency} onChange={setToCurrency} />
          </div>
          <Input label="Exchange Rate" type="number" step="0.01" value={exchangeRate} onChange={(e) => setExchangeRate(e.target.value)} className="font-number" />
          {amountSent && exchangeRate && (
            <p className="text-xs text-muted">
              Recipient gets: <span className="font-number text-white">{formatCurrency(parseFloat(amountSent) * parseFloat(exchangeRate), toCurrency)}</span>
            </p>
          )}
          <div className="space-y-1.5">
            <label className="block text-sm text-muted">Method</label>
            <select value={method} onChange={(e) => setMethod(e.target.value)} className="w-full px-4 py-2.5 bg-white/[0.05] border border-white/[0.08] rounded-xl text-sm text-white outline-none">
              {REMITTANCE_METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
          <Input label="Recipient Label" placeholder="e.g., Family, Rent" value={recipientLabel} onChange={(e) => setRecipientLabel(e.target.value)} />
          <Input label="Date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          {formError && <p className="text-sm text-accent-coral">{formError}</p>}
          <Button type="submit" className="w-full" loading={addRemittance.isPending}>Log Transfer</Button>
        </form>
      </Modal>
    </div>
  );
}

export default function RemittancesPage() {
  return (
    <Suspense
      fallback={
        <div className="space-y-4 animate-fade-in p-1">
          <ShimmerCard />
          <ShimmerCard />
        </div>
      }
    >
      <RemittancesPageInner />
    </Suspense>
  );
}
