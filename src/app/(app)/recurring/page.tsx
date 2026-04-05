"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, ChevronLeft, RefreshCw } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAppStore } from "@/lib/stores/app-store";
import { useCustomCategories } from "@/lib/hooks/use-categories";
import {
  EXPENSE_CATEGORIES,
  getCategoryLabel,
  type Currency,
  type CustomCategory,
} from "@/lib/constants";
import { formatCurrency, formatDateShort, cn } from "@/lib/utils";
import { currentMonthStart, nextMonthStart } from "@/lib/monthly-planner";
import { noteFingerprint } from "@/lib/detect-recurring";
import type { DetectedRecurringPattern } from "@/lib/detect-recurring";
import {
  type RecurringViewMode,
  type SpendingRecurringHubRow,
  type HubSpendingItem,
  buildGoalHubRows,
  buildSpendingHubItems,
  displayFrequency,
  summarizeHub,
  todayStr,
  monthlyEquivalent as mEq,
  type GoalHubRow,
} from "@/lib/recurring-hub";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { Modal } from "@/components/ui/modal";
import { Input } from "@/components/ui/input";
import { CategoryPicker } from "@/components/ui/category-picker";
import type { TxHitRow } from "@/lib/recurring-expense-status";

function patternKey(p: DetectedRecurringPattern) {
  return `${p.category}::${p.note_fingerprint}`;
}

export default function RecurringExpensesPage() {
  const router = useRouter();
  const supabase = createClient();
  const qc = useQueryClient();
  const profile = useAppStore((s) => s.profile);
  const { data: customCategories } = useCustomCategories();
  const [view, setView] = useState<RecurringViewMode>("status");
  const [suggestions, setSuggestions] = useState<DetectedRecurringPattern[]>([]);
  const [selectedSuggest, setSelectedSuggest] = useState<Set<string>>(new Set());
  const [detectBusy, setDetectBusy] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [editRow, setEditRow] = useState<SpendingRecurringHubRow | null>(null);
  const [formLabel, setFormLabel] = useState("");
  const [formAmount, setFormAmount] = useState("");
  const [formCategory, setFormCategory] = useState("");
  const [formDay, setFormDay] = useState("1");
  const [formFrequency, setFormFrequency] = useState("monthly");
  const [formError, setFormError] = useState("");

  const monthStart = currentMonthStart();
  const monthEndExcl = nextMonthStart(monthStart);
  const income = Number(profile?.monthly_income) || 0;
  const primaryCur = (profile?.primary_currency || "USD") as Currency;

  const { data: recurringRaw } = useQuery({
    queryKey: ["recurring-expenses"],
    queryFn: async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return [];
      const { data, error } = await supabase
        .from("recurring_expenses")
        .select("*")
        .eq("user_id", user.id)
        .eq("is_active", true)
        .order("label");
      if (error) throw error;
      return (data || []) as SpendingRecurringHubRow[];
    },
  });

  const { data: goals } = useQuery({
    queryKey: ["goals"],
    queryFn: async () => {
      const { data, error } = await supabase.from("savings_goals").select("*");
      if (error) throw error;
      return data;
    },
  });

  const { data: goalContributions } = useQuery({
    queryKey: ["goal-contributions-month-recurring", monthStart],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("goal_contributions")
        .select("goal_id, amount, date")
        .gte("date", monthStart)
        .lt("date", monthEndExcl);
      if (error) throw error;
      return data || [];
    },
  });

  const { data: remittances } = useQuery({
    queryKey: ["remittances-month-recurring", monthStart],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("remittances")
        .select("*")
        .gte("date", monthStart)
        .lt("date", monthEndExcl);
      if (error) throw error;
      return data || [];
    },
  });

  const { data: monthTxs } = useQuery({
    queryKey: ["month-txs-recurring-hub", monthStart],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("transactions")
        .select("*")
        .eq("type", "expense")
        .gte("date", monthStart)
        .lt("date", monthEndExcl);
      if (error) throw error;
      return data || [];
    },
  });

  const { data: accounts } = useQuery({
    queryKey: ["accounts"],
    queryFn: async () => {
      const { data, error } = await supabase.from("accounts").select("id, name");
      if (error) throw error;
      return data || [];
    },
  });

  const templateIds = useMemo(() => {
    const ids = new Set<string>();
    (recurringRaw || []).forEach((r) => {
      if (r.template_transaction_id) ids.add(r.template_transaction_id);
    });
    return Array.from(ids);
  }, [recurringRaw]);

  const { data: templateTxs } = useQuery({
    queryKey: ["recurring-template-txs", templateIds.join(",")],
    enabled: templateIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("transactions")
        .select(
          "id, source, account_id, split_expense_id, split_expenses(group_id, split_groups(name))"
        )
        .in("id", templateIds);
      if (error) throw error;
      return data || [];
    },
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      const today = todayStr();
      const { data: paused } = await supabase
        .from("recurring_expenses")
        .select("id, paused_until")
        .eq("user_id", user.id)
        .eq("is_paused", true);
      for (const r of paused || []) {
        if (r.paused_until && today >= r.paused_until) {
          await supabase
            .from("recurring_expenses")
            .update({ is_paused: false, paused_until: null })
            .eq("id", r.id);
        }
      }
      if (!cancelled) qc.invalidateQueries({ queryKey: ["recurring-expenses"] });
    })();
    return () => {
      cancelled = true;
    };
  }, [supabase, qc]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setDetectBusy(true);
      try {
        const res = await fetch("/api/recurring/detect", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        });
        const j = await res.json();
        if (!cancelled && res.ok && j.patterns) {
          const existing = new Set(
            (recurringRaw || []).map(
              (r) => `${r.category}::${r.note_fingerprint}`
            )
          );
          setSuggestions(
            (j.patterns as DetectedRecurringPattern[]).filter(
              (p) => !existing.has(patternKey(p))
            )
          );
        }
      } finally {
        if (!cancelled) setDetectBusy(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [recurringRaw]);

  const templateMeta = useMemo(() => {
    const accMap = new Map((accounts || []).map((a: any) => [a.id, a.name]));
    const m = new Map<
      string,
      {
        source: "split" | "manual";
        accountName: string | null;
        groupName: string | null;
      }
    >();
    (templateTxs || []).forEach((t: any) => {
      const src = t.source === "split" ? "split" : "manual";
      const gname = t.split_expenses?.split_groups?.name || null;
      m.set(t.id, {
        source: src,
        accountName: accMap.get(t.account_id) || null,
        groupName: gname,
      });
    });
    return m;
  }, [templateTxs, accounts]);

  const txHits: TxHitRow[] = useMemo(
    () =>
      (monthTxs || []).map((t: any) => ({
        recurring_expense_id: t.recurring_expense_id,
        date: t.date,
        amount: Number(t.amount),
        note: t.note,
        source: t.source,
      })),
    [monthTxs]
  );

  const goalRows = useMemo(
    () =>
      buildGoalHubRows(
        goals || [],
        (goalContributions || []).map((c: any) => ({
          goal_id: c.goal_id,
          amount: Number(c.amount),
          date: c.date,
        })),
        (remittances || []).map((r: any) => ({
          goal_id: r.goal_id ?? null,
          amount_sent: Number(r.amount_sent),
          date: r.date,
          from_currency: r.from_currency,
        })),
        monthStart
      ),
    [goals, goalContributions, remittances, monthStart]
  );

  const spendingItems = useMemo(
    () =>
      buildSpendingHubItems(
        recurringRaw || [],
        monthStart,
        monthEndExcl,
        txHits,
        templateMeta,
        new Date()
      ),
    [recurringRaw, monthStart, monthEndExcl, txHits, templateMeta]
  );

  const summary = useMemo(
    () =>
      summarizeHub({
        spendingRecurring: recurringRaw || [],
        goalRows,
        monthlyIncome: income,
        now: new Date(),
      }),
    [recurringRaw, goalRows, income]
  );

  const applyDetectMutation = useMutation({
    mutationFn: async (keys: string[]) => {
      const res = await fetch("/api/recurring/detect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apply: true, applyKeys: keys }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "Apply failed");
      return j;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["recurring-expenses"] });
      setSuggestions([]);
      setSelectedSuggest(new Set());
    },
  });

  const insertRecurring = useMutation({
    mutationFn: async (payload: Record<string, unknown>) => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not signed in");
      const { data, error } = await supabase
        .from("recurring_expenses")
        .insert({ ...payload, user_id: user.id })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["recurring-expenses"] });
      setAddOpen(false);
      setEditRow(null);
    },
  });

  const updateRecurring = useMutation({
    mutationFn: async ({
      id,
      patch,
    }: {
      id: string;
      patch: Record<string, unknown>;
    }) => {
      const { error } = await supabase
        .from("recurring_expenses")
        .update(patch)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["recurring-expenses"] }),
  });

  function openAdd() {
    setFormError("");
    setFormLabel("");
    setFormAmount("");
    setFormCategory("");
    setFormDay("1");
    setFormFrequency("monthly");
    setAddOpen(true);
  }

  function openEdit(row: SpendingRecurringHubRow) {
    setFormError("");
    setEditRow(row);
    setFormLabel(row.label);
    setFormAmount(String(row.expected_amount));
    setFormCategory(row.category);
    setFormDay(
      row.expected_day_of_month != null ? String(row.expected_day_of_month) : "1"
    );
    setFormFrequency((row.frequency as string) || "monthly");
  }

  async function handleAddSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError("");
    const amt = parseFloat(formAmount);
    const dom = parseInt(formDay, 10);
    if (!formLabel.trim()) {
      setFormError("Name required");
      return;
    }
    if (!amt || amt <= 0) {
      setFormError("Amount required");
      return;
    }
    if (!formCategory) {
      setFormError("Category required");
      return;
    }
    await insertRecurring.mutateAsync({
      category: formCategory,
      label: formLabel.trim().slice(0, 200),
      note_fingerprint: noteFingerprint(formLabel),
      expected_amount: amt,
      currency: primaryCur,
      recurrence: "monthly",
      frequency: formFrequency,
      expected_day_of_month: Number.isFinite(dom) ? Math.min(31, Math.max(1, dom)) : 1,
      source: "transaction",
      is_active: true,
      is_paused: false,
      paused_until: null,
    });
  }

  async function handleEditSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!editRow) return;
    setFormError("");
    const meta = editRow.template_transaction_id
      ? templateMeta.get(editRow.template_transaction_id)
      : undefined;
    const splitLocked = meta?.source === "split" || editRow.source === "splitwise";
    const amt = parseFloat(formAmount);
    const dom = parseInt(formDay, 10);
    if (!formLabel.trim()) {
      setFormError("Name required");
      return;
    }
    if (!splitLocked && (!amt || amt <= 0)) {
      setFormError("Amount required");
      return;
    }
    if (!formCategory) {
      setFormError("Category required");
      return;
    }
    const patch: Record<string, unknown> = {
      label: formLabel.trim().slice(0, 200),
      category: formCategory,
      recurrence: "monthly",
      frequency: formFrequency,
 expected_day_of_month: Number.isFinite(dom) ? Math.min(31, Math.max(1, dom)) : 1,
      updated_at: new Date().toISOString(),
    };
    if (!splitLocked) patch.expected_amount = amt;
    await updateRecurring.mutateAsync({ id: editRow.id, patch });
    setEditRow(null);
  }

  function toggleSuggest(key: string) {
    setSelectedSuggest((prev) => {
      const n = new Set(prev);
      if (n.has(key)) n.delete(key);
      else n.add(key);
      return n;
    });
  }

  const topOpportunities = useMemo(() => {
    const list = [...(spendingItems || [])]
      .filter((i) => i.kind === "spending")
      .sort(
        (a, b) =>
          Number((b as HubSpendingItem).re.expected_amount) -
          Number((a as HubSpendingItem).re.expected_amount)
      )
      .slice(0, 3);
    return list as HubSpendingItem[];
  }, [spendingItems]);

  const upcoming = spendingItems.filter(
    (i) => i.status !== "hit" && i.status !== "paused"
  );
  const hit = spendingItems.filter((i) => i.status === "hit");
  const paused = spendingItems.filter((i) => i.status === "paused");

  const goalsUpcoming = goalRows.filter((g) => !g.hit);
  const goalsHit = goalRows.filter((g) => g.hit);

  function sortByDate(a: HubSpendingItem, b: HubSpendingItem) {
    const da = a.re.expected_day_of_month ?? 99;
    const db = b.re.expected_day_of_month ?? 99;
    return da - db;
  }

  const byCategory = useMemo(() => {
    const m = new Map<string, HubSpendingItem[]>();
    spendingItems.forEach((it) => {
      const k = it.re.category;
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(it);
    });
    return Array.from(m.entries()).sort(([a], [b]) =>
      getCategoryLabel(a, customCategories ?? undefined).localeCompare(
        getCategoryLabel(b, customCategories ?? undefined)
      )
    );
  }, [spendingItems, customCategories]);

  return (
    <div className="space-y-4 animate-fade-in pb-24">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => router.back()}
          className="p-2 rounded-xl hover:bg-white/[0.06] text-muted"
          aria-label="Back"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <h1 className="text-xl font-semibold flex items-center gap-2">
          <span aria-hidden>🔄</span> Recurring Expenses
        </h1>
        <Button size="sm" className="ml-auto shrink-0" onClick={openAdd}>
          <Plus className="w-4 h-4 mr-1" /> Add New
        </Button>
      </div>

      <div className="flex flex-wrap gap-2">
        <Chip active={view === "status"} onClick={() => setView("status")}>
          By status
        </Chip>
        <Chip active={view === "category"} onClick={() => setView("category")}>
          By category
        </Chip>
        <Chip active={view === "date"} onClick={() => setView("date")}>
          By date
        </Chip>
      </div>

      <Card className="space-y-2">
        <p className="font-number text-lg font-semibold">
          Total monthly fixed costs:{" "}
          {formatCurrency(summary.fixedMonthly, primaryCur)}
        </p>
        {income > 0 ? (
          <p className="text-sm text-muted leading-relaxed">
            That&apos;s {summary.pctLocked != null ? `${summary.pctLocked}%` : "—"} of
            your {formatCurrency(income, primaryCur)} income locked before variable
            spending.
          </p>
        ) : (
          <p className="text-sm text-muted">
            Set monthly income in Settings to see what share is locked.
          </p>
        )}
      </Card>

      {suggestions.length > 0 && (
        <Card className="space-y-3 border border-accent-blue/25">
          <p className="text-sm font-medium flex items-center gap-2">
            <span aria-hidden>💡</span> New patterns detected
            {detectBusy && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
          </p>
          <ul className="space-y-2 text-sm">
            {suggestions.map((p) => {
              const k = patternKey(p);
              return (
                <li key={k} className="flex items-start gap-2">
                  <input
                    type="checkbox"
                    checked={selectedSuggest.has(k)}
                    onChange={() => toggleSuggest(k)}
                    className="mt-1 accent-accent-green"
                  />
                  <span className="text-white/85">
                    {p.label} · ~{formatCurrency(p.suggested_amount, p.currency as Currency)}/
                    {displayFrequency("monthly", "monthly")} ·{" "}
                    {getCategoryLabel(p.category, customCategories ?? undefined)}
                  </span>
                </li>
              );
            })}
          </ul>
          <Button
            size="sm"
            disabled={selectedSuggest.size === 0 || applyDetectMutation.isPending}
            onClick={() =>
              applyDetectMutation.mutate(Array.from(selectedSuggest))
            }
          >
            Add selected
          </Button>
        </Card>
      )}

      {view === "status" && (
        <>
          <SectionTitle>Upcoming this month</SectionTitle>
          {goalsUpcoming.map((g) => (
            <GoalRow key={g.id} g={g} />
          ))}
          {upcoming.map((i) => (
              <SpendingRow
                key={i.re.id}
                item={i}
                customCategories={customCategories}
                onEdit={() => openEdit(i.re)}
                onPause={() => {
                  updateRecurring.mutate({
                    id: i.re.id,
                    patch: {
                      is_paused: true,
                      paused_until: monthEndExcl,
                      updated_at: new Date().toISOString(),
                    },
                  });
                }}
                onStop={() => {
                  updateRecurring.mutate({
                    id: i.re.id,
                    patch: {
                      is_active: false,
                      updated_at: new Date().toISOString(),
                    },
                  });
                }}
              />
            ))}
          {upcoming.length === 0 &&
            goalsUpcoming.length === 0 && (
              <p className="text-sm text-muted">Nothing upcoming — you&apos;re clear.</p>
            )}

          <SectionTitle>Already hit this month</SectionTitle>
          {goalsHit.map((g) => (
            <GoalRow key={g.id} g={g} />
          ))}
          {hit.map((i) => (
            <SpendingRow
              key={i.re.id}
              item={i}
              customCategories={customCategories}
              onEdit={() => openEdit(i.re)}
              onPause={() => {}}
              onStop={() =>
                updateRecurring.mutate({
                  id: i.re.id,
                  patch: {
                    is_active: false,
                    updated_at: new Date().toISOString(),
                  },
                })
              }
              hidePause
            />
          ))}

          {paused.length > 0 && (
            <>
              <SectionTitle>Paused (this month)</SectionTitle>
              {paused.map((i) => (
                <SpendingRow
                  key={i.re.id}
                  item={i}
                  customCategories={customCategories}
                  onEdit={() => openEdit(i.re)}
                  onPause={() =>
                    updateRecurring.mutate({
                      id: i.re.id,
                      patch: {
                        is_paused: false,
                        paused_until: null,
                        updated_at: new Date().toISOString(),
                      },
                    })
                  }
                  onStop={() =>
                    updateRecurring.mutate({
                      id: i.re.id,
                      patch: {
                        is_active: false,
                        updated_at: new Date().toISOString(),
                      },
                    })
                  }
                  resumeOnly
                />
              ))}
            </>
          )}
        </>
      )}

      {view === "category" && (
        <>
          <SectionTitle>Goals</SectionTitle>
          <Card className="text-sm text-muted mb-2">
            {formatCurrency(
              goalRows.reduce((s, g) => s + g.monthly_target, 0),
              primaryCur
            )}
            /month across {goalRows.length} goal targets
          </Card>
          {goalRows.map((g) => (
            <GoalRow key={g.id} g={g} />
          ))}
          {byCategory.map(([cat, items]) => (
            <div key={cat} className="space-y-2">
              <SectionTitle>
                {getCategoryLabel(cat, customCategories ?? undefined)} —{" "}
                {formatCurrency(
                  items.reduce(
                    (s, i) =>
                      s +
                      mEq(Number(i.re.expected_amount), i.re.frequency),
                    0
                  ),
                  (items[0]?.re.currency || primaryCur) as Currency
                )}
                /mo
              </SectionTitle>
              {items.sort(sortByDate).map((i) => (
                <SpendingRow
                  key={i.re.id}
                  item={i}
                  customCategories={customCategories}
                  onEdit={() => openEdit(i.re)}
                  onPause={() =>
                    updateRecurring.mutate({
                      id: i.re.id,
                      patch: {
                        is_paused: true,
                        paused_until: monthEndExcl,
                        updated_at: new Date().toISOString(),
                      },
                    })
                  }
                  onStop={() =>
                    updateRecurring.mutate({
                      id: i.re.id,
                      patch: {
                        is_active: false,
                        updated_at: new Date().toISOString(),
                      },
                    })
                  }
                />
              ))}
            </div>
          ))}
        </>
      )}

      {view === "date" && (
        <>
          {goalRows.map((g) => (
            <GoalRow key={g.id} g={g} />
          ))}
          {spendingItems.slice().sort(sortByDate).map((i) => (
            <SpendingRow
              key={i.re.id}
              item={i}
              customCategories={customCategories}
              onEdit={() => openEdit(i.re)}
              onPause={() =>
                updateRecurring.mutate({
                  id: i.re.id,
                  patch: {
                    is_paused: true,
                    paused_until: monthEndExcl,
                    updated_at: new Date().toISOString(),
                  },
                })
              }
              onStop={() =>
                updateRecurring.mutate({
                  id: i.re.id,
                  patch: {
                    is_active: false,
                    updated_at: new Date().toISOString(),
                  },
                })
              }
            />
          ))}
        </>
      )}

      <SectionTitle>Summary</SectionTitle>
      <Card className="space-y-2 text-sm">
        <div className="flex justify-between gap-2">
          <span className="text-muted">Fixed spending</span>
          <span className="font-number">
            {formatCurrency(summary.fixedMonthly, primaryCur)}/month
          </span>
        </div>
        <div className="flex justify-between gap-2">
          <span className="text-muted">Goal commitments</span>
          <span className="font-number">
            {formatCurrency(summary.goalsMonthly, primaryCur)}/month
          </span>
        </div>
        <div className="flex justify-between gap-2 font-medium pt-2 border-t border-white/[0.06]">
          <span className="text-muted">Total locked</span>
          <span className="font-number">
            {formatCurrency(summary.totalLocked, primaryCur)}/month
            {summary.pctLocked != null && income > 0 && (
              <span className="text-xs text-muted font-sans ml-1">
                ({summary.pctLocked}% of income)
              </span>
            )}
          </span>
        </div>
        <div className="flex justify-between gap-2">
          <span className="text-muted">Variable room</span>
          <span className="font-number text-accent-green">
            {summary.variableRoomMonthly != null
              ? `${formatCurrency(summary.variableRoomMonthly, primaryCur)}/month`
              : "—"}
          </span>
        </div>
        {summary.variablePerDay != null && income > 0 && (
          <p className="text-xs text-muted leading-relaxed">
            ~{formatCurrency(summary.variablePerDay, primaryCur)}/day left this month
            for groceries, dining, and everything else.
          </p>
        )}
      </Card>

      {summary.warnFixedHeavy && income > 0 && (
        <Card className="border border-accent-amber/30 bg-accent-amber/[0.06] space-y-2">
          <p className="text-sm font-medium text-accent-amber">⚠️ Heavy fixed load</p>
          <p className="text-xs text-muted leading-relaxed">
            Fixed + goals use most of your income. Quick wins might include:{" "}
            {topOpportunities.map((t, idx) => (
              <span key={t.re.id}>
                {idx > 0 ? "; " : ""}
                <strong className="text-white/80">{t.re.label}</strong> (
                {formatCurrency(
                  Number(t.re.expected_amount),
                  t.re.currency as Currency
                )}
              </span>
            ))}
            . Consider negotiating bills or trimming optional subscriptions.
          </p>
        </Card>
      )}

      <Modal open={addOpen} onClose={() => setAddOpen(false)} title="Add recurring expense">
        <form onSubmit={handleAddSubmit} className="space-y-4">
          <Input
            label="Name"
            value={formLabel}
            onChange={(e) => setFormLabel(e.target.value)}
            placeholder="e.g. Car insurance"
          />
          <Input
            label="Amount"
            type="number"
            step="0.01"
            value={formAmount}
            onChange={(e) => setFormAmount(e.target.value)}
            className="font-number"
          />
          <div className="space-y-1.5">
            <label className="block text-sm text-muted">Category</label>
            <CategoryPicker
              value={formCategory}
              type="expense"
              customCategories={customCategories}
              onChange={setFormCategory}
              onCreateNew={() => {}}
            />
          </div>
          <Input
            label="Typical day of month"
            type="number"
            min={1}
            max={31}
            value={formDay}
            onChange={(e) => setFormDay(e.target.value)}
          />
          <div className="space-y-1.5">
            <label className="block text-sm text-muted">Frequency</label>
            <select
              value={formFrequency}
              onChange={(e) => setFormFrequency(e.target.value)}
              className="w-full px-4 py-2.5 bg-surface border border-white/[0.08] rounded-xl text-sm text-white outline-none [&>option]:bg-surface"
            >
              <option value="monthly">Monthly</option>
              <option value="quarterly">Quarterly</option>
              <option value="yearly">Yearly</option>
            </select>
          </div>
          {formError && (
            <p className="text-sm text-accent-coral">{formError}</p>
          )}
          <Button type="submit" className="w-full" loading={insertRecurring.isPending}>
            Save
          </Button>
        </form>
      </Modal>

      <Modal
        open={!!editRow}
        onClose={() => setEditRow(null)}
        title="Edit recurring expense"
      >
        {editRow && (
          <form onSubmit={handleEditSubmit} className="space-y-4">
            <Input
              label="Name"
              value={formLabel}
              onChange={(e) => setFormLabel(e.target.value)}
            />
            <Input
              label="Amount"
              type="number"
              step="0.01"
              value={formAmount}
              onChange={(e) => setFormAmount(e.target.value)}
              disabled={
                editRow.template_transaction_id
                  ? templateMeta.get(editRow.template_transaction_id)?.source ===
                      "split" || editRow.source === "splitwise"
                  : false
              }
            />
            {(editRow.source === "splitwise" ||
              (editRow.template_transaction_id &&
                templateMeta.get(editRow.template_transaction_id)?.source ===
                  "split")) && (
              <p className="text-xs text-muted">
                Split-linked amount comes from Splitwise sync.
              </p>
            )}
            <div className="space-y-1.5">
              <label className="block text-sm text-muted">Category</label>
              <CategoryPicker
                value={formCategory}
                type="expense"
                customCategories={customCategories}
                onChange={setFormCategory}
                onCreateNew={() => {}}
              />
            </div>
            <Input
              label="Typical day of month"
              type="number"
              min={1}
              max={31}
              value={formDay}
              onChange={(e) => setFormDay(e.target.value)}
            />
            <div className="space-y-1.5">
              <label className="block text-sm text-muted">Frequency</label>
              <select
                value={formFrequency}
                onChange={(e) => setFormFrequency(e.target.value)}
                className="w-full px-4 py-2.5 bg-surface border border-white/[0.08] rounded-xl text-sm text-white outline-none [&>option]:bg-surface"
              >
                <option value="monthly">Monthly</option>
                <option value="quarterly">Quarterly</option>
                <option value="yearly">Yearly</option>
              </select>
            </div>
            {formError && (
              <p className="text-sm text-accent-coral">{formError}</p>
            )}
            <Button type="submit" className="w-full" loading={updateRecurring.isPending}>
              Save changes
            </Button>
          </form>
        )}
      </Modal>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[11px] uppercase tracking-wide text-muted border-b border-white/[0.08] pb-1">
      {children}
    </p>
  );
}

function GoalRow({ g }: { g: GoalHubRow }) {
  return (
    <Card className="flex flex-col gap-1 py-3 text-sm">
      <div className="flex justify-between gap-2">
        <span>
          {g.hit ? "✅" : "⏳"} {g.name}
        </span>
        <span className="font-number">
          {formatCurrency(g.monthly_target, g.currency as Currency)}
        </span>
      </div>
      <p className="text-[11px] text-muted">
        Goals · {g.hit ? "Met this month" : "Not met yet"} ·{" "}
        <Link href={`/goals/${g.id}`} className="text-accent-blue">
          Open goal
        </Link>
      </p>
    </Card>
  );
}

function SpendingRow({
  item,
  customCategories,
  onEdit,
  onPause,
  onStop,
  hidePause,
  resumeOnly,
}: {
  item: HubSpendingItem;
  customCategories: CustomCategory[] | null | undefined;
  onEdit: () => void;
  onPause: () => void;
  onStop: () => void;
  hidePause?: boolean;
  resumeOnly?: boolean;
}) {
  const i = item;
  const cat = getCategoryLabel(i.re.category, customCategories ?? undefined);
  const freq = displayFrequency(i.re.recurrence, i.re.frequency);
  const dom =
    i.re.expected_day_of_month != null ? `${i.re.expected_day_of_month}` : "—";
  const statusChar =
    i.status === "hit" ? "✅" : i.status === "overdue" ? "⚠️" : i.status === "paused" ? "⏸" : "⏳";
  let due = "";
  if (i.hitThisMonth && i.hitDate) due = `Hit ${formatDateShort(i.hitDate)}`;
  else if (i.daysUntil != null) {
    if (i.daysUntil === 0) due = "Due today";
    else if (i.daysUntil > 0) due = `Due in ${i.daysUntil} day(s)`;
    else due = "Past due window";
  }

  const splitBadge =
    i.templateSource === "split" || i.re.source === "splitwise";

  return (
    <Card className="space-y-2 py-3">
      <button type="button" className="w-full text-left" onClick={onEdit}>
        <div className="flex justify-between gap-2">
          <span>
            {statusChar} {i.re.label}
          </span>
          <span className="font-number shrink-0">
            {formatCurrency(Number(i.re.expected_amount), i.re.currency as Currency)}
          </span>
        </div>
        <p className="text-[11px] text-muted mt-1">
          {cat}
          {i.accountLabel ? ` · ${i.accountLabel}` : ""}
          {i.splitGroupName ? ` · Split: ${i.splitGroupName}` : ""}
          {splitBadge && (
            <span className="ml-1 text-accent-blue">(from Splitwise)</span>
          )}{" "}
          · {freq} · {dom}
          {due && ` · ${due}`}
        </p>
      </button>
      <div className="flex gap-2 flex-wrap">
        {resumeOnly ? (
          <Button type="button" size="sm" variant="secondary" onClick={onPause}>
            Resume
          </Button>
        ) : (
          !hidePause && (
            <Button type="button" size="sm" variant="secondary" onClick={onPause}>
              Skip this month
            </Button>
          )
        )}
        <Button type="button" size="sm" variant="ghost" className="text-accent-coral" onClick={onStop}>
          Stop tracking
        </Button>
      </div>
    </Card>
  );
}
