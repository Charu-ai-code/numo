"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  ArrowDown,
  Pencil,
  Trash2,
  Landmark,
  CreditCard,
  Wallet,
  Bitcoin,
  Receipt,
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
import { useDeleteAccount } from "@/lib/hooks/use-accounts";
import { ACCOUNT_TYPES } from "@/lib/constants";
import { formatCurrency, formatDateShort, cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { EmptyState } from "@/components/ui/empty-state";
import { ShimmerCard } from "@/components/ui/shimmer";

const ICON_MAP: Record<string, React.ElementType> = {
  Landmark,
  CreditCard,
  Wallet,
  Bitcoin,
};

export default function AccountDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const supabase = createClient();
  const qc = useQueryClient();
  const deleteAccount = useDeleteAccount();
  const [showDelete, setShowDelete] = useState(false);

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
        .order("date", { ascending: false })
        .limit(20);
      if (error) throw error;
      return data;
    },
  });

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

  let balance = account.initial_balance || 0;
  const chartData: { date: string; balance: number }[] = [];
  const sorted = [...(transactions || [])].sort(
    (a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime()
  );
  let runningBalance = account.initial_balance || 0;
  sorted.forEach((t: any) => {
    runningBalance += t.type === "income" ? t.amount : -t.amount;
    chartData.push({ date: t.date, balance: runningBalance });
  });
  balance = sorted.length > 0 ? chartData[chartData.length - 1].balance : account.initial_balance;
  const isNeg = balance < 0;

  async function handleDelete() {
    await deleteAccount.mutateAsync(id);
    router.push("/accounts");
  }

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
              {typeInfo?.label} &middot; {account.currency}
            </Badge>
          </div>
        </div>
        <p
          className={cn(
            "font-number text-3xl font-bold",
            isNeg ? "text-accent-coral" : "text-white"
          )}
        >
          {isNeg && <ArrowDown className="w-5 h-5 inline mr-1" />}
          {formatCurrency(balance, account.currency)}
        </p>
      </Card>

      {chartData.length > 1 && (
        <Card>
          <p className="text-xs text-muted mb-3">Balance History</p>
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
                  "Balance",
                ]}
              />
              <Line
                type="monotone"
                dataKey="balance"
                stroke="#4edea3"
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </Card>
      )}

      <div>
        <p className="text-sm text-muted mb-3">Recent Transactions</p>
        {!transactions || transactions.length === 0 ? (
          <EmptyState
            icon={<Receipt className="w-10 h-10" />}
            title="No transactions yet"
          />
        ) : (
          <div className="space-y-2">
            {transactions.map((t: any) => (
              <Card key={t.id} className="flex items-center justify-between py-3">
                <div>
                  <p className="text-sm">{t.note || t.category}</p>
                  <p className="text-xs text-muted">{formatDateShort(t.date)}</p>
                </div>
                <p
                  className={cn(
                    "font-number text-sm font-semibold",
                    t.type === "income" ? "text-accent-green" : "text-accent-coral"
                  )}
                >
                  {t.type === "income" ? "+" : "-"}
                  {formatCurrency(t.amount, t.currency)}
                </p>
              </Card>
            ))}
          </div>
        )}
      </div>

      <div className="flex gap-3">
        <Button
          variant="danger"
          className="flex-1"
          onClick={() => setShowDelete(true)}
        >
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
    </div>
  );
}
