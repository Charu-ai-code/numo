"use client";

import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { PiggyBank, Trash2, Plus, Pencil } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAppStore } from "@/lib/stores/app-store";
import { useAccounts } from "@/lib/hooks/use-accounts";
import { useCustomCategories, useCreateCustomCategory } from "@/lib/hooks/use-categories";
import { EXPENSE_CATEGORIES, getCategoryLabel, type Currency } from "@/lib/constants";
import { formatCurrency, daysLeftInMonth, cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { FAB } from "@/components/ui/fab";
import { Modal } from "@/components/ui/modal";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { CurrencyToggle } from "@/components/ui/currency-toggle";
import { ProgressBar } from "@/components/ui/progress-bar";
import { EmptyState } from "@/components/ui/empty-state";
import { ShimmerCard } from "@/components/ui/shimmer";
import { CategoryPicker, CategoryIcon } from "@/components/ui/category-picker";
import { CreateCategoryModal } from "@/components/ui/create-category-modal";

const OVER_BUDGET_MESSAGES = [
  "No stress — awareness is the first step. Let's see what we can trim next week.",
  "Happens to the best of us. Tomorrow's a fresh start.",
  "A little over is okay. Just keep an eye on it the next few days.",
];

export default function BudgetsPage() {
  const supabase = createClient();
  const qc = useQueryClient();
  const profile = useAppStore((s) => s.profile);
  const { data: accounts } = useAccounts();
  const { data: customCategories } = useCustomCategories();
  const createCustomCategory = useCreateCustomCategory();

  const [showAdd, setShowAdd] = useState(false);
  const [showCreateCategory, setShowCreateCategory] = useState(false);
  const [category, setCategory] = useState("");
  const [limit, setLimit] = useState("");
  const [currency, setCurrency] = useState<Currency>(profile?.primary_currency || "USD");
  const [formError, setFormError] = useState("");

  const [editingBudget, setEditingBudget] = useState<any>(null);
  const [editLimit, setEditLimit] = useState("");
  const [editError, setEditError] = useState("");

  const { data: budgets, isLoading } = useQuery({
    queryKey: ["budgets"],
    queryFn: async () => {
      const { data, error } = await supabase.from("budgets").select("*");
      if (error) throw error;
      return data;
    },
  });

  const now = new Date();
  const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;

  const { data: transactions } = useQuery({
    queryKey: ["month-transactions", monthStart],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("transactions")
        .select("amount, category, type, currency")
        .eq("type", "expense")
        .gte("date", monthStart);
      if (error) throw error;
      return data;
    },
  });

  const budgetProgress = useMemo(() => {
    if (!budgets || !transactions) return [];
    return budgets.map((b: any) => {
      const spent = transactions
        .filter((t: any) => t.category === b.category)
        .reduce((s: number, t: any) => s + t.amount, 0);
      const pct = b.monthly_limit > 0 ? (spent / b.monthly_limit) * 100 : 0;
      return { ...b, spent, pct };
    });
  }, [budgets, transactions]);

  const addBudget = useMutation({
    mutationFn: async (budget: { category: string; monthly_limit: number; currency: string }) => {
      const { data: { user } } = await supabase.auth.getUser();
      const { data, error } = await supabase
        .from("budgets")
        .insert({ ...budget, user_id: user!.id })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["budgets"] }),
  });

  const deleteBudget = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("budgets").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["budgets"] }),
  });

  const existingCategories = new Set(budgets?.map((b: any) => b.category) || []);

  const totalBudgeted = budgets?.reduce((s: number, b: any) => s + (b.monthly_limit || 0), 0) || 0;
  const totalAccountBalance = accounts?.reduce((s: number, a: any) => s + (a.initial_balance || 0), 0) || 0;
  const monthlyIncome = profile?.monthly_income || 0;
  const remainingToBudget = (monthlyIncome || totalAccountBalance) - totalBudgeted;

  const updateBudget = useMutation({
    mutationFn: async ({ id, monthly_limit }: { id: string; monthly_limit: number }) => {
      const { error } = await supabase.from("budgets").update({ monthly_limit }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["budgets"] }),
  });

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setFormError("");
    if (!category) { setFormError("Pick a category"); return; }
    const num = parseFloat(limit);
    if (!num || num <= 0) { setFormError("Limit must be greater than 0"); return; }
    try {
      await addBudget.mutateAsync({ category, monthly_limit: num, currency });
      setShowAdd(false);
      setCategory(""); setLimit("");
    } catch (err: any) {
      setFormError(err.message);
    }
  }

  async function handleEditSave(e: React.FormEvent) {
    e.preventDefault();
    setEditError("");
    const num = parseFloat(editLimit);
    if (!num || num <= 0) { setEditError("Limit must be greater than 0"); return; }
    try {
      await updateBudget.mutateAsync({ id: editingBudget.id, monthly_limit: num });
      setEditingBudget(null); setEditLimit("");
    } catch (err: any) {
      setEditError(err.message);
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-4 animate-fade-in">
        <h1 className="text-xl font-semibold">Budgets</h1>
        <ShimmerCard /><ShimmerCard /><ShimmerCard />
      </div>
    );
  }

  return (
    <div className="space-y-4 animate-fade-in">
      <h1 className="text-xl font-semibold">Budgets</h1>
      <p className="text-xs text-muted">{daysLeftInMonth()} days left this month</p>

      {budgetProgress.length === 0 ? (
        <EmptyState
          icon={<PiggyBank className="w-12 h-12" />}
          title="No budgets yet"
          description="Set a spending limit for any category. Start with just one."
          actionLabel="Set a Budget"
          onAction={() => setShowAdd(true)}
        />
      ) : (
        <div className="space-y-3">
          {budgetProgress.map((b: any) => {
            const exceeded = b.pct >= 100;
            const warning = b.pct >= 80 && !exceeded;
            return (
              <Card
                key={b.id}
                className={cn(exceeded && "animate-pulse_glow")}
              >
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <p className="text-sm font-medium">{getCategoryLabel(b.category, customCategories)}</p>
                    <p className="font-number text-xs text-muted">
                      {formatCurrency(b.spent, b.currency)} / {formatCurrency(b.monthly_limit, b.currency)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {exceeded && (
                      <span className="text-xs text-accent-coral font-medium">Exceeded</span>
                    )}
                    {warning && (
                      <span className="text-xs text-accent-amber font-medium">Heads up</span>
                    )}
                    <button
                      onClick={() => { setEditingBudget(b); setEditLimit(String(b.monthly_limit)); }}
                      className="p-1 rounded-lg hover:bg-white/[0.05] text-muted"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => deleteBudget.mutate(b.id)}
                      className="p-1 rounded-lg hover:bg-white/[0.05] text-muted"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
                <ProgressBar value={b.spent} max={b.monthly_limit} />
                {exceeded && (
                  <p className="text-xs text-accent-coral/70 mt-2">
                    {OVER_BUDGET_MESSAGES[b.category.length % OVER_BUDGET_MESSAGES.length]}
                  </p>
                )}
              </Card>
            );
          })}
        </div>
      )}

      <FAB onClick={() => setShowAdd(true)} />

      <Modal open={showAdd} onClose={() => setShowAdd(false)} title="Set a Budget">
        <form onSubmit={handleAdd} className="space-y-4">
          {remainingToBudget > 0 && (
            <div className="p-3 rounded-xl bg-accent-green/10 border border-accent-green/20">
              <p className="text-xs text-accent-green">
                {formatCurrency(remainingToBudget, currency)} remaining to budget
                {monthlyIncome > 0 ? " from your monthly income" : " across your accounts"}
              </p>
            </div>
          )}
          <div className="space-y-1.5">
            <label className="block text-sm text-muted">Category</label>
            <CategoryPicker
              value={category}
              type="expense"
              customCategories={customCategories}
              onChange={setCategory}
              onCreateNew={() => setShowCreateCategory(true)}
              exclude={existingCategories}
            />
          </div>
          <div className="flex gap-3 items-end">
            <div className="flex-1">
              <Input label="Monthly Limit" type="number" step="0.01" min="0" placeholder="0.00" value={limit} onChange={(e) => setLimit(e.target.value)} className="font-number" />
            </div>
            <CurrencyToggle value={currency} onChange={setCurrency} />
          </div>
          {formError && <p className="text-sm text-accent-coral">{formError}</p>}
          <Button type="submit" className="w-full" loading={addBudget.isPending}>Set Budget</Button>
        </form>
      </Modal>

      <Modal open={!!editingBudget} onClose={() => setEditingBudget(null)} title={`Edit: ${editingBudget ? getCategoryLabel(editingBudget.category, customCategories) : ""}`}>
        <form onSubmit={handleEditSave} className="space-y-4">
          <Input label="Monthly Limit" type="number" step="0.01" min="0" placeholder="0.00" value={editLimit} onChange={(e) => setEditLimit(e.target.value)} className="font-number" />
          {editError && <p className="text-sm text-accent-coral">{editError}</p>}
          <Button type="submit" className="w-full" loading={updateBudget.isPending}>Save Changes</Button>
        </form>
      </Modal>

      <CreateCategoryModal
        open={showCreateCategory}
        onClose={() => setShowCreateCategory(false)}
        onSave={(data) => {
          createCustomCategory.mutate(data, {
            onSuccess: (created: any) => {
              setShowCreateCategory(false);
              setCategory(created.slug);
            },
          });
        }}
        loading={createCustomCategory.isPending}
        type="expense"
      />
    </div>
  );
}
