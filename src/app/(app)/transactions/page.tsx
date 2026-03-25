"use client";

import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Search,
  Receipt,
  Plus,
  UtensilsCrossed,
  Car,
  Home,
  Zap,
  Heart,
  Film,
  ShoppingBag,
  GraduationCap,
  Users,
  MoreHorizontal,
  Briefcase,
  Laptop,
  TrendingUp,
  RotateCcw,
  Circle,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAccounts } from "@/lib/hooks/use-accounts";
import { useAppStore } from "@/lib/stores/app-store";
import {
  EXPENSE_CATEGORIES,
  INCOME_CATEGORIES,
  type Currency,
  type TransactionType,
} from "@/lib/constants";
import { formatCurrency, formatDateShort, cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { FAB } from "@/components/ui/fab";
import { Modal } from "@/components/ui/modal";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CurrencyToggle } from "@/components/ui/currency-toggle";
import { EmptyState } from "@/components/ui/empty-state";
import { ShimmerCard } from "@/components/ui/shimmer";
import { ErrorOverlay } from "@/components/ui/error-overlay";

const ICON_MAP: Record<string, React.ElementType> = {
  UtensilsCrossed, Car, Home, Zap, Heart, Film, ShoppingBag, GraduationCap,
  Users, MoreHorizontal, Briefcase, Laptop, TrendingUp, RotateCcw, Circle,
};

function CategoryIcon({ name }: { name: string }) {
  const Icon = ICON_MAP[name] || Circle;
  return <Icon className="w-4 h-4" />;
}

export default function TransactionsPage() {
  const supabase = createClient();
  const qc = useQueryClient();
  const { data: accounts } = useAccounts();
  const profile = useAppStore((s) => s.profile);

  const [showAdd, setShowAdd] = useState(false);
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState<"all" | TransactionType>("all");

  // Add form state
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState<Currency>(profile?.primary_currency || "USD");
  const [txType, setTxType] = useState<TransactionType>("expense");
  const [accountId, setAccountId] = useState("");
  const [category, setCategory] = useState("");
  const [note, setNote] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [isRecurring, setIsRecurring] = useState(false);
  const [recurrence, setRecurrence] = useState<string>("monthly");
  const [formError, setFormError] = useState("");

  const { data: transactions, isLoading, error, refetch } = useQuery({
    queryKey: ["transactions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("transactions")
        .select("*, accounts(name)")
        .order("date", { ascending: false })
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const addTx = useMutation({
    mutationFn: async (tx: any) => {
      const { data: { user } } = await supabase.auth.getUser();
      const { data, error } = await supabase
        .from("transactions")
        .insert({ ...tx, user_id: user!.id })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["transactions"] });
      qc.invalidateQueries({ queryKey: ["accounts"] });
      qc.invalidateQueries({ queryKey: ["account-balance"] });
    },
  });

  const categories = txType === "expense" ? EXPENSE_CATEGORIES : INCOME_CATEGORIES;

  const filtered = useMemo(() => {
    if (!transactions) return [];
    return transactions.filter((t: any) => {
      if (filterType !== "all" && t.type !== filterType) return false;
      if (search && !(t.note || "").toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [transactions, filterType, search]);

  const grouped = useMemo(() => {
    const groups: Record<string, any[]> = {};
    filtered.forEach((t: any) => {
      const d = t.date;
      if (!groups[d]) groups[d] = [];
      groups[d].push(t);
    });
    return Object.entries(groups).sort(([a], [b]) => b.localeCompare(a));
  }, [filtered]);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setFormError("");
    const numAmount = parseFloat(amount);
    if (!numAmount || numAmount <= 0) { setFormError("Amount must be greater than 0"); return; }
    if (!category) { setFormError("Category is required"); return; }
    if (!accountId) { setFormError("Account is required"); return; }
    try {
      await addTx.mutateAsync({
        amount: numAmount,
        currency,
        type: txType,
        account_id: accountId,
        category,
        note: note || null,
        date,
        is_recurring: isRecurring,
        recurrence: isRecurring ? recurrence : null,
      });
      setShowAdd(false);
      setAmount(""); setNote(""); setCategory("");
    } catch (err: any) {
      setFormError(err.message);
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-4 animate-fade-in">
        <h1 className="text-xl font-semibold">Transactions</h1>
        <div className="shimmer h-10 w-full rounded-xl" />
        <div className="flex gap-2"><div className="shimmer h-8 w-16 rounded-full" /><div className="shimmer h-8 w-20 rounded-full" /><div className="shimmer h-8 w-16 rounded-full" /></div>
        <ShimmerCard /><ShimmerCard /><ShimmerCard /><ShimmerCard /><ShimmerCard />
      </div>
    );
  }

  if (error) return <ErrorOverlay message="Couldn't load transactions" onRetry={() => refetch()} />;

  return (
    <div className="space-y-4 animate-fade-in">
      <h1 className="text-xl font-semibold">Transactions</h1>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
        <input
          className="w-full pl-9 pr-4 py-2.5 bg-white/[0.05] border border-white/[0.08] rounded-xl text-sm text-white placeholder:text-white/30 outline-none focus:border-accent-blue/50"
          placeholder="Search by note..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1">
        <Chip active={filterType === "all"} onClick={() => setFilterType("all")}>All</Chip>
        <Chip active={filterType === "expense"} onClick={() => setFilterType("expense")}>Expenses</Chip>
        <Chip active={filterType === "income"} onClick={() => setFilterType("income")}>Income</Chip>
      </div>

      {grouped.length === 0 ? (
        <EmptyState
          icon={<Receipt className="w-12 h-12" />}
          title={search ? `No results for "${search}"` : "No transactions"}
          description={search ? undefined : "Tap + to log your first transaction"}
          actionLabel={search ? "Clear filters" : undefined}
          onAction={search ? () => { setSearch(""); setFilterType("all"); } : undefined}
        />
      ) : (
        <div className="space-y-6">
          {grouped.map(([date, txns]) => (
            <div key={date}>
              <p className="text-xs text-muted mb-2 uppercase tracking-wide">
                {formatDateShort(date)}
              </p>
              <div className="space-y-2">
                {txns.map((t: any) => {
                  const catInfo = [...EXPENSE_CATEGORIES, ...INCOME_CATEGORIES].find(
                    (c) => c.value === t.category
                  );
                  return (
                    <Card key={t.id} className="flex items-center gap-3 py-3">
                      <div className={cn(
                        "w-8 h-8 rounded-lg flex items-center justify-center",
                        t.type === "income" ? "bg-accent-green/10 text-accent-green" : "bg-accent-coral/10 text-accent-coral"
                      )}>
                        <CategoryIcon name={catInfo?.icon || "Circle"} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm truncate">{t.note || catInfo?.label || t.category}</p>
                        <Badge>{(t as any).accounts?.name || "—"}</Badge>
                      </div>
                      <p className={cn(
                        "font-number text-sm font-semibold whitespace-nowrap",
                        t.type === "income" ? "text-accent-green" : "text-accent-coral"
                      )}>
                        {t.type === "income" ? "+" : "-"}{formatCurrency(t.amount, t.currency)}
                      </p>
                    </Card>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      <FAB onClick={() => { setShowAdd(true); if (accounts?.length) setAccountId(accounts[0].id); }} />

      <Modal open={showAdd} onClose={() => setShowAdd(false)} title="Add Transaction">
        <form onSubmit={handleAdd} className="space-y-4">
          <div className="flex gap-2">
            <button type="button" onClick={() => setTxType("expense")} className={cn("flex-1 py-2 rounded-xl text-sm font-medium transition-all border", txType === "expense" ? "bg-accent-coral/15 border-accent-coral/30 text-accent-coral" : "border-white/[0.06] text-muted")}>Expense</button>
            <button type="button" onClick={() => setTxType("income")} className={cn("flex-1 py-2 rounded-xl text-sm font-medium transition-all border", txType === "income" ? "bg-accent-green/15 border-accent-green/30 text-accent-green" : "border-white/[0.06] text-muted")}>Income</button>
          </div>

          <div className="flex gap-3 items-end">
            <div className="flex-1">
              <Input label="Amount" type="number" step="0.01" min="0" placeholder="0.00" value={amount} onChange={(e) => setAmount(e.target.value)} className="font-number text-lg" />
            </div>
            <CurrencyToggle value={currency} onChange={setCurrency} />
          </div>

          <div className="space-y-1.5">
            <label className="block text-sm text-muted">Account</label>
            <select value={accountId} onChange={(e) => setAccountId(e.target.value)} className="w-full px-4 py-2.5 bg-white/[0.05] border border-white/[0.08] rounded-xl text-sm text-white outline-none">
              <option value="">Select account</option>
              {accounts?.map((a: any) => <option key={a.id} value={a.id}>{a.name} ({a.currency})</option>)}
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="block text-sm text-muted">Category</label>
            <div className="grid grid-cols-2 gap-1.5 max-h-40 overflow-y-auto">
              {categories.map((c) => (
                <button key={c.value} type="button" onClick={() => setCategory(c.value)} className={cn("flex items-center gap-2 px-3 py-2 rounded-lg text-xs transition-all", category === c.value ? "bg-accent-blue/15 text-accent-blue border border-accent-blue/30" : "bg-white/[0.03] text-muted border border-white/[0.04] hover:bg-white/[0.06]")}>
                  <CategoryIcon name={c.icon} /> {c.label}
                </button>
              ))}
            </div>
          </div>

          <Input label="Note (optional)" placeholder="What was this for?" value={note} onChange={(e) => setNote(e.target.value)} />

          <Input label="Date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />

          <div className="flex items-center gap-3">
            <input type="checkbox" id="recurring" checked={isRecurring} onChange={(e) => setIsRecurring(e.target.checked)} className="accent-accent-green" />
            <label htmlFor="recurring" className="text-sm text-muted">Recurring</label>
            {isRecurring && (
              <select value={recurrence} onChange={(e) => setRecurrence(e.target.value)} className="ml-auto px-3 py-1.5 bg-white/[0.05] border border-white/[0.08] rounded-lg text-xs text-white outline-none">
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
              </select>
            )}
          </div>

          {formError && <p className="text-sm text-accent-coral">{formError}</p>}
          <Button type="submit" className="w-full" loading={addTx.isPending}>Add Transaction</Button>
        </form>
      </Modal>
    </div>
  );
}
