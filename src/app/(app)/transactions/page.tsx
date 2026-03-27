"use client";

import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Search, Receipt, Plus, Check, Trash2, Sparkles, Undo2, Calendar, Tag,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useAccounts } from "@/lib/hooks/use-accounts";
import { useCustomCategories, useCreateCustomCategory, useUpsertCategoryMapping } from "@/lib/hooks/use-categories";
import { useAppStore } from "@/lib/stores/app-store";
import {
  EXPENSE_CATEGORIES,
  INCOME_CATEGORIES,
  getCategoryLabel,
  getCategoryIcon,
  getCategoryColor,
  type Currency,
  type TransactionType,
  type CustomCategory,
} from "@/lib/constants";
import { formatCurrency, formatDateShort, cn } from "@/lib/utils";
import { isUnmappedCategory } from "@/lib/smart-categorize";
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
import { CategoryPicker, CategoryIcon } from "@/components/ui/category-picker";
import { CreateCategoryModal } from "@/components/ui/create-category-modal";

type SourceFilter = "all" | "manual" | "split";

function monthKeyFromDate(dateStr: string): string {
  return dateStr.slice(0, 7);
}

function formatMonthOption(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  if (!y || !m) return ym;
  return new Date(y, m - 1, 1).toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });
}

export default function TransactionsPage() {
  const router = useRouter();
  const supabase = createClient();
  const qc = useQueryClient();
  const { data: accounts } = useAccounts();
  const { data: customCategories } = useCustomCategories();
  const createCustomCategory = useCreateCustomCategory();
  const upsertMapping = useUpsertCategoryMapping();
  const profile = useAppStore((s) => s.profile);

  const [showAdd, setShowAdd] = useState(false);
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState<"all" | TransactionType>("all");
  const [filterSource, setFilterSource] = useState<SourceFilter>("all");
  /** `"all"` or `YYYY-MM` */
  const [filterMonth, setFilterMonth] = useState<string>("all");
  /** Empty = all categories; otherwise show txs whose category is in the set (OR) */
  const [categoryFilters, setCategoryFilters] = useState<string[]>([]);

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

  // Edit state
  const [editingTx, setEditingTx] = useState<any>(null);
  const [editAmount, setEditAmount] = useState("");
  const [editCurrency, setEditCurrency] = useState<Currency>("USD");
  const [editType, setEditType] = useState<TransactionType>("expense");
  const [editAccountId, setEditAccountId] = useState("");
  const [editCategory, setEditCategory] = useState("");
  const [editNote, setEditNote] = useState("");
  const [editDate, setEditDate] = useState("");
  const [editRecurring, setEditRecurring] = useState(false);
  const [editRecurrence, setEditRecurrence] = useState("monthly");
  const [editError, setEditError] = useState("");

  // Category override modal state
  const [overrideTx, setOverrideTx] = useState<any>(null);

  // Create category modal
  const [showCreateCategory, setShowCreateCategory] = useState(false);
  const [createCategoryContext, setCreateCategoryContext] = useState<"add" | "edit" | "override">("add");

  // Smart Categorize
  const [smartLoading, setSmartLoading] = useState(false);
  const [smartResult, setSmartResult] = useState<{
    updated: number;
    changes: { id: string; note: string; from: string; to: string }[];
    undo: { id: string; category: string }[];
    message: string;
  } | null>(null);
  const [smartError, setSmartError] = useState("");

  const { data: transactions, isLoading, error, refetch } = useQuery({
    queryKey: ["transactions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("transactions")
        .select("*, accounts(name), split_expenses(id, group_id, split_groups(id, name))")
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

  const updateTx = useMutation({
    mutationFn: async ({ id, ...updates }: any) => {
      const { error } = await supabase
        .from("transactions")
        .update(updates)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["transactions"] });
      qc.invalidateQueries({ queryKey: ["accounts"] });
      qc.invalidateQueries({ queryKey: ["account-balance"] });
    },
  });

  const deleteTx = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("transactions").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["transactions"] });
      qc.invalidateQueries({ queryKey: ["accounts"] });
      qc.invalidateQueries({ queryKey: ["account-balance"] });
    },
  });

  const monthOptions = useMemo(() => {
    if (!transactions?.length) return [] as string[];
    const set = new Set<string>();
    transactions.forEach((t: any) => {
      if (t.date) set.add(monthKeyFromDate(t.date));
    });
    return Array.from(set).sort((a, b) => b.localeCompare(a));
  }, [transactions]);

  const monthSelectOptions = useMemo(() => {
    const opts = [...monthOptions];
    if (filterMonth !== "all" && !opts.includes(filterMonth)) opts.push(filterMonth);
    return opts.sort((a, b) => b.localeCompare(a));
  }, [monthOptions, filterMonth]);

  useEffect(() => {
    setCategoryFilters([]);
  }, [filterType]);

  const categoryOptions = useMemo(() => {
    const slugs = new Set<string>();
    if (filterType === "expense" || filterType === "all") {
      EXPENSE_CATEGORIES.forEach((c) => slugs.add(c.value));
      (customCategories || [])
        .filter((c: CustomCategory) => c.type === "expense")
        .forEach((c) => slugs.add(c.slug));
    }
    if (filterType === "income" || filterType === "all") {
      INCOME_CATEGORIES.forEach((c) => slugs.add(c.value));
      (customCategories || [])
        .filter((c: CustomCategory) => c.type === "income")
        .forEach((c) => slugs.add(c.slug));
    }
    transactions?.forEach((t: any) => {
      if (t?.category) slugs.add(t.category);
    });
    return Array.from(slugs)
      .map((slug) => ({
        slug,
        label: getCategoryLabel(slug, customCategories),
      }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [transactions, customCategories, filterType]);

  const filtered = useMemo(() => {
    if (!transactions) return [];
    return transactions.filter((t: any) => {
      if (filterMonth !== "all" && t.date && monthKeyFromDate(t.date) !== filterMonth) {
        return false;
      }
      if (filterType !== "all" && t.type !== filterType) return false;
      if (filterSource !== "all" && (t.source || "manual") !== filterSource) return false;
      if (categoryFilters.length > 0 && !categoryFilters.includes(t.category)) return false;
      if (search && !(t.note || "").toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [transactions, filterMonth, filterType, filterSource, categoryFilters, search]);

  const grouped = useMemo(() => {
    const groups: Record<string, any[]> = {};
    filtered.forEach((t: any) => {
      const d = t.date;
      if (!groups[d]) groups[d] = [];
      groups[d].push(t);
    });
    return Object.entries(groups).sort(([a], [b]) => b.localeCompare(a));
  }, [filtered]);

  const customSlugSet = useMemo(
    () => new Set((customCategories || []).map((c) => c.slug)),
    [customCategories]
  );

  const unmappedRemaining = useMemo(() => {
    if (!transactions) return 0;
    return transactions.filter((t: any) => {
      if (!isUnmappedCategory(t.type, t.category, customSlugSet)) return false;
      return !!(t.note || "").trim();
    }).length;
  }, [transactions, customSlugSet]);

  async function handleSmartCategorize() {
    setSmartError("");
    setSmartLoading(true);
    try {
      const res = await fetch("/api/transactions/smart-categorize", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setSmartError(data.error || "Smart categorize failed");
        return;
      }
      setSmartResult({
        updated: data.updated,
        changes: data.changes || [],
        undo: data.undo || [],
        message: data.message || "",
      });
      qc.invalidateQueries({ queryKey: ["transactions"] });
      qc.invalidateQueries({ queryKey: ["category-mappings"] });
    } catch {
      setSmartError("Network error");
    } finally {
      setSmartLoading(false);
    }
  }

  async function handleSmartUndo() {
    if (!smartResult?.undo?.length) return;
    await Promise.all(
      smartResult.undo.map((u) =>
        supabase.from("transactions").update({ category: u.category }).eq("id", u.id)
      )
    );
    qc.invalidateQueries({ queryKey: ["transactions"] });
    qc.invalidateQueries({ queryKey: ["category-mappings"] });
    setSmartResult(null);
  }

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

  function openEdit(t: any) {
    setEditingTx(t);
    setEditAmount(String(t.amount));
    setEditCurrency(t.currency);
    setEditType(t.type);
    setEditAccountId(t.account_id);
    setEditCategory(t.category);
    setEditNote(t.note || "");
    setEditDate(t.date);
    setEditRecurring(t.is_recurring || false);
    setEditRecurrence(t.recurrence || "monthly");
    setEditError("");
  }

  async function handleEditSave(e: React.FormEvent) {
    e.preventDefault();
    setEditError("");
    const numAmount = parseFloat(editAmount);
    if (!numAmount || numAmount <= 0) { setEditError("Amount must be greater than 0"); return; }
    if (!editCategory) { setEditError("Category is required"); return; }
    if (!editAccountId) { setEditError("Account is required"); return; }

    const isSplit = editingTx.source === "split";
    try {
      await updateTx.mutateAsync({
        id: editingTx.id,
        ...(isSplit ? {} : { amount: numAmount }),
        currency: editCurrency,
        type: editType,
        account_id: editAccountId,
        category: editCategory,
        note: editNote || null,
        date: editDate,
        is_recurring: editRecurring,
        recurrence: editRecurring ? editRecurrence : null,
      });
      if (editingTx.note && editingTx.category !== editCategory) {
        upsertMapping.mutate({ keyword: editingTx.note, category: editCategory });
      }
      setEditingTx(null);
    } catch (err: any) {
      setEditError(err.message);
    }
  }

  async function handleInlineCategory(tx: any, newCategory: string) {
    setOverrideTx(null);
    if (newCategory === tx.category) return;
    await updateTx.mutateAsync({ id: tx.id, category: newCategory });
    if (tx.note) {
      upsertMapping.mutate({ keyword: tx.note, category: newCategory });
    }
  }

  function handleCreateCategoryDone(data: { name: string; icon: string; color: string; type: "expense" | "income" }) {
    createCustomCategory.mutate(data, {
      onSuccess: (created: any) => {
        setShowCreateCategory(false);
        if (createCategoryContext === "add") {
          setCategory(created.slug);
        } else if (createCategoryContext === "edit") {
          setEditCategory(created.slug);
        } else if (createCategoryContext === "override" && overrideTx) {
          handleInlineCategory(overrideTx, created.slug);
        }
      },
    });
  }

  if (isLoading) {
    return (
      <div className="space-y-4 animate-fade-in">
        <h1 className="text-xl font-semibold">Transactions</h1>
        <div className="shimmer h-10 w-full rounded-xl" />
        <div className="flex gap-2"><div className="shimmer h-8 w-16 rounded-full" /><div className="shimmer h-8 w-20 rounded-full" /><div className="shimmer h-8 w-16 rounded-full" /></div>
        <div className="shimmer h-4 w-24 rounded" />
        <div className="flex gap-2 overflow-hidden"><div className="shimmer h-8 w-28 rounded-full shrink-0" /><div className="shimmer h-8 w-20 rounded-full shrink-0" /><div className="shimmer h-8 w-24 rounded-full shrink-0" /></div>
        <ShimmerCard /><ShimmerCard /><ShimmerCard /><ShimmerCard /><ShimmerCard />
      </div>
    );
  }

  if (error) return <ErrorOverlay message="Couldn't load transactions" onRetry={() => refetch()} />;

  return (
    <div className="space-y-4 animate-fade-in">
      <h1 className="text-xl font-semibold">Transactions</h1>

      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1 min-w-0">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
          <input
            className="w-full pl-9 pr-4 py-2.5 bg-white/[0.05] border border-white/[0.08] rounded-xl text-sm text-white placeholder:text-white/30 outline-none focus:border-accent-blue/50"
            placeholder="Search by note..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Calendar className="w-4 h-4 text-muted hidden sm:block" />
          <select
            value={filterMonth}
            onChange={(e) => setFilterMonth(e.target.value)}
            className="w-full sm:w-[min(100%,220px)] px-3 py-2.5 bg-white/[0.05] border border-white/[0.08] rounded-xl text-sm text-white outline-none [&>option]:bg-surface [&>option]:text-white"
            aria-label="Filter by month"
          >
            <option value="all">All months</option>
            {monthSelectOptions.map((ym) => (
              <option key={ym} value={ym}>
                {formatMonthOption(ym)}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1">
        <Chip active={filterType === "all"} onClick={() => setFilterType("all")}>All</Chip>
        <Chip active={filterType === "expense"} onClick={() => setFilterType("expense")}>Expenses</Chip>
        <Chip active={filterType === "income"} onClick={() => setFilterType("income")}>Income</Chip>
        <div className="w-px bg-white/[0.08] mx-1" />
        <Chip active={filterSource === "all"} onClick={() => setFilterSource("all")}>All Sources</Chip>
        <Chip active={filterSource === "manual"} onClick={() => setFilterSource("manual")}>Manual</Chip>
        <Chip active={filterSource === "split"} onClick={() => setFilterSource("split")}>Split</Chip>
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center gap-2 text-[11px] text-muted uppercase tracking-wide">
          <Tag className="w-3.5 h-3.5 opacity-70" aria-hidden />
          <span>Categories</span>
          {categoryFilters.length > 0 && (
            <span className="normal-case text-white/50">
              ({categoryFilters.length} selected)
            </span>
          )}
        </div>
        <div
          className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1"
          role="group"
          aria-label="Filter by category"
        >
          <Chip
            active={categoryFilters.length === 0}
            onClick={() => setCategoryFilters([])}
          >
            All categories
          </Chip>
          {categoryOptions.map(({ slug, label }) => {
            const on = categoryFilters.includes(slug);
            return (
              <Chip
                key={slug}
                active={on}
                onClick={() => {
                  setCategoryFilters((prev) =>
                    on ? prev.filter((s) => s !== slug) : [...prev, slug]
                  );
                }}
              >
                {label}
              </Chip>
            );
          })}
        </div>
      </div>

      {unmappedRemaining > 0 && (
        <Card className="flex items-center justify-between gap-3 py-3">
          <div className="flex items-center gap-2 min-w-0">
            <Sparkles className="w-4 h-4 text-accent-amber shrink-0" />
            <div className="min-w-0">
              <p className="text-sm font-medium">Smart Categorize</p>
              <p className="text-xs text-muted truncate">
                {unmappedRemaining} transaction{unmappedRemaining === 1 ? "" : "s"} still on &quot;Other&quot; — match your past choices with one tap
              </p>
            </div>
          </div>
          <Button
            size="sm"
            onClick={handleSmartCategorize}
            loading={smartLoading}
            className="shrink-0"
          >
            <Sparkles className="w-3.5 h-3.5 mr-1" />
            Run
          </Button>
        </Card>
      )}

      {smartError && (
        <p className="text-sm text-accent-coral px-1">{smartError}</p>
      )}

      {grouped.length === 0 ? (
        <EmptyState
          icon={<Receipt className="w-12 h-12" />}
          title={
            search
              ? `No results for "${search}"`
              : categoryFilters.length > 0
                ? "No transactions in these categories"
                : filterMonth !== "all"
                  ? `No transactions in ${formatMonthOption(filterMonth)}`
                  : "No transactions"
          }
          description={
            search
              ? undefined
              : categoryFilters.length > 0
                ? "Try different categories or clear filters."
                : filterMonth !== "all"
                  ? "Try another month or clear filters."
                  : "Tap + to log your first transaction"
          }
          actionLabel={
            search || filterSource !== "all" || filterMonth !== "all" || categoryFilters.length > 0
              ? "Clear filters"
              : undefined
          }
          onAction={
            search || filterSource !== "all" || filterMonth !== "all" || categoryFilters.length > 0
              ? () => {
                  setSearch("");
                  setFilterType("all");
                  setFilterSource("all");
                  setFilterMonth("all");
                  setCategoryFilters([]);
                }
              : undefined
          }
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
                  const catLabel = getCategoryLabel(t.category, customCategories);
                  const catIcon = getCategoryIcon(t.category, customCategories);
                  const catColor = getCategoryColor(t.category, customCategories);

                  return (
                    <Card key={t.id} className="flex items-center gap-3 py-3">
                      {/* Category icon — tappable to open category picker modal */}
                      <button
                        onClick={(e) => { e.stopPropagation(); setOverrideTx(t); }}
                        className={cn(
                          "w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition-colors hover:ring-2 hover:ring-accent-blue/30",
                          catColor
                            ? ""
                            : t.type === "income" ? "bg-accent-green/10 text-accent-green" : "bg-accent-coral/10 text-accent-coral"
                        )}
                        style={catColor ? { backgroundColor: catColor + "22", color: catColor } : undefined}
                        title="Change category"
                      >
                        <CategoryIcon name={catIcon} />
                      </button>

                      <div className="flex-1 min-w-0" onClick={() => openEdit(t)} role="button" tabIndex={0}>
                        <p className="text-sm truncate">{t.note || catLabel}</p>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <Badge>{(t as any).accounts?.name || "—"}</Badge>
                          {t.source === "split" && t.split_expenses?.split_groups && (
                            <Badge
                              variant="blue"
                              className="cursor-pointer hover:opacity-80 transition-opacity"
                              onClick={(e: React.MouseEvent) => {
                                e.stopPropagation();
                                router.push(`/split/${t.split_expenses.group_id}`);
                              }}
                            >
                              Split: {t.split_expenses.split_groups.name}
                            </Badge>
                          )}
                        </div>
                      </div>
                      <p
                        className={cn(
                          "font-number text-sm font-semibold whitespace-nowrap",
                          t.type === "income" ? "text-accent-green" : "text-accent-coral"
                        )}
                        onClick={() => openEdit(t)}
                        role="button"
                        tabIndex={0}
                      >
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

      {/* Add Transaction Modal */}
      <Modal open={showAdd} onClose={() => setShowAdd(false)} title="Add Transaction">
        <form onSubmit={handleAdd} className="space-y-4">
          <div className="flex gap-2">
            <button type="button" onClick={() => { setTxType("expense"); setCategory(""); }} className={cn("flex-1 py-2 rounded-xl text-sm font-medium transition-all border", txType === "expense" ? "bg-accent-coral/15 border-accent-coral/30 text-accent-coral" : "border-white/[0.06] text-muted")}>Expense</button>
            <button type="button" onClick={() => { setTxType("income"); setCategory(""); }} className={cn("flex-1 py-2 rounded-xl text-sm font-medium transition-all border", txType === "income" ? "bg-accent-green/15 border-accent-green/30 text-accent-green" : "border-white/[0.06] text-muted")}>Income</button>
          </div>

          <div className="flex gap-3 items-end">
            <div className="flex-1">
              <Input label="Amount" type="number" step="0.01" min="0" placeholder="0.00" value={amount} onChange={(e) => setAmount(e.target.value)} className="font-number text-lg" />
            </div>
            <CurrencyToggle value={currency} onChange={setCurrency} />
          </div>

          <div className="space-y-1.5">
            <label className="block text-sm text-muted">Account</label>
            <select value={accountId} onChange={(e) => setAccountId(e.target.value)} className="w-full px-4 py-2.5 bg-surface border border-white/[0.08] rounded-xl text-sm text-white outline-none [&>option]:bg-surface [&>option]:text-white">
              <option value="">Select account</option>
              {accounts?.map((a: any) => <option key={a.id} value={a.id}>{a.name} ({a.currency})</option>)}
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="block text-sm text-muted">Category</label>
            <CategoryPicker
              value={category}
              type={txType}
              customCategories={customCategories}
              onChange={setCategory}
              onCreateNew={() => { setCreateCategoryContext("add"); setShowCreateCategory(true); }}
            />
          </div>

          <Input label="Note (optional)" placeholder="What was this for?" value={note} onChange={(e) => setNote(e.target.value)} />
          <Input label="Date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />

          <div className="flex items-center gap-3">
            <input type="checkbox" id="recurring" checked={isRecurring} onChange={(e) => setIsRecurring(e.target.checked)} className="accent-accent-green" />
            <label htmlFor="recurring" className="text-sm text-muted">Recurring</label>
            {isRecurring && (
              <select value={recurrence} onChange={(e) => setRecurrence(e.target.value)} className="ml-auto px-3 py-1.5 bg-surface border border-white/[0.08] rounded-lg text-xs text-white outline-none [&>option]:bg-surface [&>option]:text-white">
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="biweekly">Biweekly</option>
                <option value="monthly">Monthly</option>
              </select>
            )}
          </div>

          {formError && <p className="text-sm text-accent-coral">{formError}</p>}
          <Button type="submit" className="w-full" loading={addTx.isPending}>Add Transaction</Button>
        </form>
      </Modal>

      {/* Edit Transaction Modal */}
      <Modal
        open={!!editingTx}
        onClose={() => setEditingTx(null)}
        title="Edit Transaction"
      >
        {editingTx && (
          <form onSubmit={handleEditSave} className="space-y-4">
            <div className="flex gap-2">
              <button type="button" onClick={() => { setEditType("expense"); setEditCategory(""); }} className={cn("flex-1 py-2 rounded-xl text-sm font-medium transition-all border", editType === "expense" ? "bg-accent-coral/15 border-accent-coral/30 text-accent-coral" : "border-white/[0.06] text-muted")}>Expense</button>
              <button type="button" onClick={() => { setEditType("income"); setEditCategory(""); }} className={cn("flex-1 py-2 rounded-xl text-sm font-medium transition-all border", editType === "income" ? "bg-accent-green/15 border-accent-green/30 text-accent-green" : "border-white/[0.06] text-muted")}>Income</button>
            </div>

            <div className="flex gap-3 items-end">
              <div className="flex-1">
                <Input
                  label="Amount"
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0.00"
                  value={editAmount}
                  onChange={(e) => setEditAmount(e.target.value)}
                  className="font-number text-lg"
                  disabled={editingTx.source === "split"}
                />
              </div>
              <CurrencyToggle value={editCurrency} onChange={setEditCurrency} />
            </div>
            {editingTx.source === "split" && (
              <p className="text-xs text-muted -mt-2">Amount is locked for split transactions</p>
            )}

            <div className="space-y-1.5">
              <label className="block text-sm text-muted">Account</label>
              <select value={editAccountId} onChange={(e) => setEditAccountId(e.target.value)} className="w-full px-4 py-2.5 bg-surface border border-white/[0.08] rounded-xl text-sm text-white outline-none [&>option]:bg-surface [&>option]:text-white">
                <option value="">Select account</option>
                {accounts?.map((a: any) => <option key={a.id} value={a.id}>{a.name} ({a.currency})</option>)}
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="block text-sm text-muted">Category</label>
              <CategoryPicker
                value={editCategory}
                type={editType}
                customCategories={customCategories}
                onChange={setEditCategory}
                onCreateNew={() => { setCreateCategoryContext("edit"); setShowCreateCategory(true); }}
              />
            </div>

            <Input label="Note" placeholder="What was this for?" value={editNote} onChange={(e) => setEditNote(e.target.value)} />
            <Input label="Date" type="date" value={editDate} onChange={(e) => setEditDate(e.target.value)} />

            <div className="flex items-center gap-3">
              <input type="checkbox" id="edit-recurring" checked={editRecurring} onChange={(e) => setEditRecurring(e.target.checked)} className="accent-accent-green" />
              <label htmlFor="edit-recurring" className="text-sm text-muted">Recurring</label>
              {editRecurring && (
                <select value={editRecurrence} onChange={(e) => setEditRecurrence(e.target.value)} className="ml-auto px-3 py-1.5 bg-surface border border-white/[0.08] rounded-lg text-xs text-white outline-none [&>option]:bg-surface [&>option]:text-white">
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                  <option value="biweekly">Biweekly</option>
                  <option value="monthly">Monthly</option>
                </select>
              )}
            </div>

            {editError && <p className="text-sm text-accent-coral">{editError}</p>}

            <div className="flex gap-2">
              <Button type="submit" className="flex-1" loading={updateTx.isPending}>Save Changes</Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  if (confirm("Delete this transaction?")) {
                    deleteTx.mutate(editingTx.id);
                    setEditingTx(null);
                  }
                }}
                className="text-accent-coral"
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
          </form>
        )}
      </Modal>

      {/* Category Override Modal */}
      <Modal
        open={!!overrideTx}
        onClose={() => setOverrideTx(null)}
        title="Change Category"
      >
        {overrideTx && (() => {
          const builtIn = overrideTx.type === "expense" ? EXPENSE_CATEGORIES : INCOME_CATEGORIES;
          const customs = (customCategories || []).filter((c: CustomCategory) => c.type === overrideTx.type);
          const allOptions = [
            ...builtIn.map((c) => ({ slug: c.value, label: c.label, icon: c.icon, color: null as string | null })),
            ...customs.map((c: CustomCategory) => ({ slug: c.slug, label: c.name, icon: c.icon, color: c.color })),
          ];
          return (
            <div className="space-y-1 max-h-72 overflow-y-auto -mx-1">
              {allOptions.map((o) => (
                <button
                  key={o.slug}
                  type="button"
                  onClick={() => handleInlineCategory(overrideTx, o.slug)}
                  className={cn(
                    "flex items-center gap-3 w-full px-3 py-2.5 rounded-xl text-sm hover:bg-white/[0.06] transition-colors",
                    overrideTx.category === o.slug && "bg-accent-blue/10 text-accent-blue"
                  )}
                >
                  <span
                    className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
                    style={o.color ? { backgroundColor: o.color + "22", color: o.color } : undefined}
                  >
                    <CategoryIcon name={o.icon} className="w-4 h-4" />
                  </span>
                  <span className="flex-1 text-left">{o.label}</span>
                  {overrideTx.category === o.slug && <Check className="w-4 h-4 text-accent-blue shrink-0" />}
                </button>
              ))}
              <button
                type="button"
                onClick={() => {
                  setCreateCategoryContext("override");
                  setShowCreateCategory(true);
                }}
                className="flex items-center gap-3 w-full px-3 py-2.5 rounded-xl text-sm text-accent-blue hover:bg-accent-blue/10 transition-colors border-t border-white/[0.06] mt-1 pt-3"
              >
                <Plus className="w-4 h-4" />
                <span>Create category</span>
              </button>
            </div>
          );
        })()}
      </Modal>

      {/* Smart Categorize result */}
      <Modal
        open={!!smartResult}
        onClose={() => setSmartResult(null)}
        title="Smart Categorize"
      >
        {smartResult && (
          <div className="space-y-4">
            <p className="text-sm text-white/90">
              {smartResult.updated > 0
                ? `Updated ${smartResult.updated} transaction${smartResult.updated === 1 ? "" : "s"}.`
                : smartResult.message}
            </p>
            {smartResult.changes.length > 0 && (
              <div className="max-h-48 overflow-y-auto space-y-1.5 rounded-xl border border-white/[0.08] p-2">
                {smartResult.changes.map((c) => (
                  <div key={c.id} className="text-xs text-muted flex flex-wrap gap-x-2">
                    <span className="truncate max-w-[180px]">{c.note || "—"}</span>
                    <span className="text-white/40">→</span>
                    <span className="text-accent-green">
                      {getCategoryLabel(c.to, customCategories)}
                    </span>
                  </div>
                ))}
              </div>
            )}
            <p className="text-xs text-muted">Review changes above. You can undo if something looks off.</p>
            <div className="flex gap-2">
              {smartResult.undo.length > 0 && (
                <Button
                  type="button"
                  variant="secondary"
                  className="flex-1"
                  onClick={handleSmartUndo}
                >
                  <Undo2 className="w-4 h-4 mr-1" />
                  Undo
                </Button>
              )}
              <Button type="button" className="flex-1" onClick={() => setSmartResult(null)}>
                Done
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Create Custom Category Modal */}
      <CreateCategoryModal
        open={showCreateCategory}
        onClose={() => setShowCreateCategory(false)}
        onSave={handleCreateCategoryDone}
        loading={createCustomCategory.isPending}
        type={createCategoryContext === "edit" ? editType : (overrideTx?.type || txType)}
      />
    </div>
  );
}
