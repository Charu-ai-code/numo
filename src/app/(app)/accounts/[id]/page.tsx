"use client";

import { useState, useMemo, useEffect } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  ArrowDown,
  Trash2,
  Landmark,
  CreditCard,
  Wallet,
  Bitcoin,
  Receipt,
  ArrowLeftRight,
} from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { createClient } from "@/lib/supabase/client";
import { createPairedTransfer } from "@/lib/create-transfer";
import { useAccounts, useDeleteAccount } from "@/lib/hooks/use-accounts";
import { ACCOUNT_TYPES } from "@/lib/constants";
import { formatCurrency, formatDateShort, cn } from "@/lib/utils";
import {
  applyTransactionDelta,
  computeRunningBalance,
  getDueDateStatus,
  dueUrgency,
  utilizationPercent,
  utilizationColorBucket,
  UTILIZATION_HEX,
  isTransferType,
  type LedgerAccountRow,
  type LedgerTransactionRow,
} from "@/lib/account-ledger";
import { getCategoryLabel } from "@/lib/constants";
import { useCustomCategories } from "@/lib/hooks/use-categories";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/empty-state";
import { ShimmerCard } from "@/components/ui/shimmer";
import { ProgressBar } from "@/components/ui/progress-bar";

const ICON_MAP: Record<string, React.ElementType> = {
  Landmark,
  CreditCard,
  Wallet,
  Bitcoin,
};

export default function AccountDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createClient();
  const qc = useQueryClient();
  const deleteAccount = useDeleteAccount();
  const { data: allAccounts } = useAccounts();
  const { data: customCategories } = useCustomCategories();
  const [showDelete, setShowDelete] = useState(false);
  const [showPay, setShowPay] = useState(false);
  const [payFromId, setPayFromId] = useState("");
  const [payAmount, setPayAmount] = useState("");
  const [payDate, setPayDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [payNote, setPayNote] = useState("");
  const [payError, setPayError] = useState("");
  const [payLoading, setPayLoading] = useState(false);

  const { data: account, isLoading } = useQuery({
    queryKey: ["account", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("accounts")
        .select("*")
        .eq("id", id)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const { data: transactions } = useQuery({
    queryKey: ["account-transactions", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("transactions")
        .select("*")
        .eq("account_id", id)
        .order("date", { ascending: true })
        .order("created_at", { ascending: true })
        .limit(500);
      if (error) throw error;
      return data;
    },
  });

  const linkedIds = useMemo(() => {
    const s = new Set<string>();
    (transactions || []).forEach((t: any) => {
      if (t.linked_transfer_id) s.add(t.linked_transfer_id);
    });
    return Array.from(s);
  }, [transactions]);

  const { data: linkedRows } = useQuery({
    queryKey: ["transaction-links", [...linkedIds].sort().join(",")],
    enabled: linkedIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("transactions")
        .select("id, account_id")
        .in("id", linkedIds);
      if (error) throw error;
      return data as { id: string; account_id: string }[];
    },
  });

  const partnerAccountId = useMemo(() => {
    const m = new Map<string, string>();
    (linkedRows || []).forEach((r) => m.set(r.id, r.account_id));
    return m;
  }, [linkedRows]);

  const accountNameById = useMemo(() => {
    const m = new Map<string, string>();
    (allAccounts || []).forEach((a: any) => m.set(a.id, a.name));
    return m;
  }, [allAccounts]);

  useEffect(() => {
    if (searchParams.get("pay") === "1" && account?.type === "credit_card") {
      setShowPay(true);
    }
  }, [searchParams, account?.type]);

  useEffect(() => {
    if (!account || account.type !== "credit_card") return;
    const txs = (transactions || []) as LedgerTransactionRow[];
    const owed = computeRunningBalance(account as LedgerAccountRow, txs);
    setPayAmount(owed > 0 ? String(Math.round(owed * 100) / 100) : "");
  }, [account, transactions]);

  const monthStart = useMemo(() => {
    const n = new Date();
    return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-01`;
  }, []);

  const ccCategorySpend = useMemo(() => {
    if (!account || account.type !== "credit_card" || !transactions) return [];
    const m: Record<string, number> = {};
    for (const t of transactions as any[]) {
      if (t.type !== "expense" || t.date < monthStart) continue;
      m[t.category] = (m[t.category] || 0) + Number(t.amount);
    }
    return Object.entries(m)
      .map(([slug, amount]) => ({
        slug,
        label: getCategoryLabel(slug, customCategories),
        amount,
      }))
      .sort((a, b) => b.amount - a.amount);
  }, [account, transactions, monthStart, customCategories]);

  if (isLoading || !account) {
    return (
      <div className="space-y-4">
        <div className="shimmer h-6 w-32 rounded-lg" />
        <ShimmerCard />
        <ShimmerCard />
      </div>
    );
  }

  const typeInfo = ACCOUNT_TYPES.find((t) => t.value === account.type);
  const Icon = ICON_MAP[typeInfo?.icon || "Landmark"];
  const isCC = account.type === "credit_card";

  const ledgerTxs = (transactions || []).map((t: any) => ({
    amount: t.amount,
    type: t.type,
    date: t.date,
    created_at: t.created_at,
  })) as LedgerTransactionRow[];

  const balance = computeRunningBalance(account as LedgerAccountRow, ledgerTxs);

  const chartData: { date: string; balance: number }[] = [];
  let running = Number(account.initial_balance) || 0;
  for (const t of transactions || []) {
    const row = t as any;
    running += applyTransactionDelta(account.type, row.type, row.amount);
    chartData.push({ date: row.date, balance: running });
  }

  const limit = account.credit_limit != null ? Number(account.credit_limit) : null;
  const util = utilizationPercent(balance, limit);
  const bucket = utilizationColorBucket(util);
  const utilColor = UTILIZATION_HEX[bucket];
  const dueMeta =
    isCC && account.payment_due_day ? getDueDateStatus(account.payment_due_day) : null;
  const urg = dueUrgency(dueMeta);

  async function handleDelete() {
    await deleteAccount.mutateAsync(id);
    router.push("/accounts");
  }

  async function handlePaySubmit(e: React.FormEvent) {
    e.preventDefault();
    setPayError("");
    if (!payFromId) {
      setPayError("Choose an account to pay from");
      return;
    }
    const amt = parseFloat(payAmount);
    if (!amt || amt <= 0) {
      setPayError("Enter a valid amount");
      return;
    }
    const fromAcc = (allAccounts || []).find((a: any) => a.id === payFromId);
    if (!fromAcc || fromAcc.currency !== account.currency) {
      setPayError("Accounts must use the same currency");
      return;
    }
    setPayLoading(true);
    try {
      const { error } = await createPairedTransfer(supabase, {
        fromAccountId: payFromId,
        toAccountId: id,
        amount: amt,
        currency: account.currency,
        transferDate: payDate,
        note: payNote.trim() || "Credit card payment",
      });
      if (error) throw error;
      qc.invalidateQueries({ queryKey: ["transactions"] });
      qc.invalidateQueries({ queryKey: ["account-transactions", id] });
      qc.invalidateQueries({ queryKey: ["transactions-ledger"] });
      qc.invalidateQueries({ queryKey: ["account-balance"] });
      qc.invalidateQueries({ queryKey: ["accounts"] });
      setShowPay(false);
      router.replace(`/accounts/${id}`);
    } catch (err: any) {
      setPayError(err.message || "Transfer failed");
    } finally {
      setPayLoading(false);
    }
  }

  const payFromOptions = (allAccounts || []).filter(
    (a: any) => a.id !== id && a.type !== "credit_card" && a.currency === account.currency
  );

  return (
    <div className="space-y-6 animate-fade-in">
      <button
        onClick={() => router.push("/accounts")}
        className="flex items-center gap-2 text-sm text-muted hover:text-white transition-colors"
      >
        <ArrowLeft className="w-4 h-4" /> Accounts
      </button>

      <Card className="space-y-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-white/[0.06] flex items-center justify-center">
            <Icon className="w-5 h-5 text-muted" />
          </div>
          <div className="flex-1">
            <p className="font-medium">{account.name}</p>
            <Badge variant={account.currency === "INR" ? "amber" : "blue"}>
              {typeInfo?.label} · {account.currency}
            </Badge>
          </div>
        </div>
        <p
          className={cn(
            "font-number text-3xl font-bold",
            isCC ? "text-accent-coral" : balance < 0 ? "text-accent-coral" : "text-white"
          )}
        >
          {!isCC && balance < 0 && <ArrowDown className="w-5 h-5 inline mr-1" />}
          {isCC ? "Owed: " : ""}
          {formatCurrency(balance, account.currency)}
        </p>
        {isCC && limit != null && limit > 0 && (
          <div className="space-y-2 pt-2">
            <div className="flex justify-between text-xs text-muted">
              <span style={{ color: utilColor }}>
                {util != null ? `${Math.round(util)}% of ${formatCurrency(limit, account.currency)}` : "—"}
              </span>
              <span>
                Available {formatCurrency(Math.max(0, limit - Math.max(0, balance)), account.currency)}
              </span>
            </div>
            <ProgressBar value={Math.min(Math.max(0, balance), limit)} max={limit} />
          </div>
        )}
        {isCC && dueMeta && (
          <p
            className={cn(
              "text-sm",
              urg === "overdue" || urg === "critical"
                ? "text-accent-coral font-medium"
                : urg === "soon"
                  ? "text-accent-amber"
                  : "text-muted"
            )}
          >
            Due {dueMeta.nextDue.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
            {dueMeta.overdue
              ? " · overdue"
              : dueMeta.daysUntil === 0
                ? " · today"
                : ` · ${dueMeta.daysUntil} day${dueMeta.daysUntil === 1 ? "" : "s"} away`}
          </p>
        )}
        {isCC && (
          <Button className="w-full" onClick={() => setShowPay(true)}>
            Pay card
          </Button>
        )}
      </Card>

      {isCC && ccCategorySpend.length > 0 && (
        <Card className="space-y-2">
          <p className="text-xs text-muted uppercase tracking-wide">This month on card</p>
          {ccCategorySpend.map((row) => (
            <div key={row.slug} className="flex justify-between text-sm">
              <span className="text-muted">{row.label}</span>
              <span className="font-number">{formatCurrency(row.amount, account.currency)}</span>
            </div>
          ))}
        </Card>
      )}

      {chartData.length > 1 && (
        <Card>
          <p className="text-xs text-muted mb-3">{isCC ? "Balance owed history" : "Balance history"}</p>
          <ResponsiveContainer width="100%" height={160}>
            <LineChart data={chartData}>
              <XAxis
                dataKey="date"
                tickFormatter={(v) => formatDateShort(v)}
                tick={{ fontSize: 10, fill: "#888" }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis hide />
              <Tooltip
                contentStyle={{
                  background: "#141414",
                  border: "1px solid rgba(255,255,255,0.08)",
                  borderRadius: 12,
                  fontSize: 12,
                }}
                labelFormatter={(v) => formatDateShort(v)}
                formatter={(v: number) => [
                  formatCurrency(v, account.currency),
                  isCC ? "Owed" : "Balance",
                ]}
              />
              <Line
                type="monotone"
                dataKey="balance"
                stroke={isCC ? "#ffb4ab" : "#4edea3"}
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </Card>
      )}

      <div>
        <p className="text-sm text-muted mb-3">Recent transactions</p>
        {!transactions || transactions.length === 0 ? (
          <EmptyState icon={<Receipt className="w-10 h-10" />} title="No transactions yet" />
        ) : (
          <div className="space-y-2">
            {[...(transactions as any[])].reverse().slice(0, 30).map((t: any) => {
              const transfer = isTransferType(t.type);
              const partnerAid = t.linked_transfer_id
                ? partnerAccountId.get(t.linked_transfer_id)
                : null;
              const partnerName = partnerAid ? accountNameById.get(partnerAid) : null;
              let subtitle = formatDateShort(t.date);
              if (transfer) {
                if (t.type === "transfer_out" && partnerName) {
                  subtitle = `${account.name} → ${partnerName} · ${subtitle}`;
                } else if (t.type === "transfer_in" && partnerName) {
                  subtitle = `${partnerName} → ${account.name} · ${subtitle}`;
                } else {
                  subtitle = `Transfer · ${subtitle}`;
                }
              }

              return (
                <Card key={t.id} className="flex items-center justify-between py-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      {transfer && <ArrowLeftRight className="w-4 h-4 text-accent-blue shrink-0" />}
                      <p className="text-sm truncate">{t.note || (transfer ? "Transfer" : t.category)}</p>
                      {transfer && (
                        <Badge variant="blue" className="text-[10px] shrink-0">
                          Transfer
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted truncate">{subtitle}</p>
                  </div>
                  <p
                    className={cn(
                      "font-number text-sm font-semibold whitespace-nowrap ml-2",
                      transfer
                        ? "text-white/90"
                        : t.type === "income"
                          ? "text-accent-green"
                          : "text-accent-coral"
                    )}
                  >
                    {transfer
                      ? t.type === "transfer_out"
                        ? `−${formatCurrency(t.amount, t.currency)}`
                        : `+${formatCurrency(t.amount, t.currency)}`
                      : t.type === "income"
                        ? `+${formatCurrency(t.amount, t.currency)}`
                        : `−${formatCurrency(t.amount, t.currency)}`}
                  </p>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      <div className="flex gap-3">
        <Button variant="danger" className="flex-1" onClick={() => setShowDelete(true)}>
          <Trash2 className="w-4 h-4" /> Delete Account
        </Button>
      </div>

      <Modal open={showDelete} onClose={() => setShowDelete(false)} title="Delete Account?">
        <p className="text-sm text-muted mb-4">
          This will remove the account and all its transactions. This can&apos;t be undone.
        </p>
        <div className="flex gap-3">
          <Button variant="secondary" className="flex-1" onClick={() => setShowDelete(false)}>
            Cancel
          </Button>
          <Button
            variant="danger"
            className="flex-1"
            loading={deleteAccount.isPending}
            onClick={handleDelete}
          >
            Delete
          </Button>
        </div>
      </Modal>

      <Modal open={showPay} onClose={() => { setShowPay(false); router.replace(`/accounts/${id}`); }} title="Pay card">
        <form onSubmit={handlePaySubmit} className="space-y-4">
          <p className="text-sm text-muted">
            Pay from a bank or wallet account ({account.currency}) into <span className="text-white">{account.name}</span>.
          </p>
          <div className="space-y-1.5">
            <label className="block text-sm text-muted">From</label>
            <select
              value={payFromId}
              onChange={(e) => setPayFromId(e.target.value)}
              className="w-full px-4 py-2.5 bg-surface border border-white/[0.08] rounded-xl text-sm text-white outline-none [&>option]:bg-surface"
            >
              <option value="">Select account</option>
              {payFromOptions.map((a: any) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>
          <Input
            label="Amount"
            type="number"
            step="0.01"
            min="0"
            value={payAmount}
            onChange={(e) => setPayAmount(e.target.value)}
            className="font-number"
          />
          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => {
                const owed = balance > 0 ? balance : 0;
                setPayAmount(String(Math.round(owed * 100) / 100));
              }}
            >
              Pay full
            </Button>
          </div>
          <Input label="Date" type="date" value={payDate} onChange={(e) => setPayDate(e.target.value)} />
          <Input label="Note (optional)" value={payNote} onChange={(e) => setPayNote(e.target.value)} />
          {payError && <p className="text-sm text-accent-coral">{payError}</p>}
          <Button type="submit" className="w-full" loading={payLoading}>
            Confirm payment
          </Button>
        </form>
      </Modal>
    </div>
  );
}
