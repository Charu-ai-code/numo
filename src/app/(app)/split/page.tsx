"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Users,
  Plus,
  ArrowRight,
  Link as LinkIcon,
  RefreshCw,
  Handshake,
  Copy,
  Wallet,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAccounts } from "@/lib/hooks/use-accounts";
import { useAppStore } from "@/lib/stores/app-store";
import { type Currency } from "@/lib/constants";
import {
  getInitials,
  formatCurrency,
  resolveDefaultAccount,
  cn,
} from "@/lib/utils";
import {
  balancesFromManualLedger,
  balancesFromSimplifiedDebts,
  type SimplifiedDebtRow,
} from "@/lib/splitwise-debts";
import { Card } from "@/components/ui/card";
import { FAB } from "@/components/ui/fab";
import { Modal } from "@/components/ui/modal";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ShimmerCard } from "@/components/ui/shimmer";

interface PersonDebt {
  name: string;
  email: string | null;
  net: number;
  currency: Currency;
  groups: string[];
  memberId: string;
  groupId: string;
}

export default function SplitPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createClient();
  const qc = useQueryClient();
  const profile = useAppStore((s) => s.profile);
  const { data: accounts } = useAccounts();
  const didAutoSync = useRef(false);

  const [showCreate, setShowCreate] = useState(false);
  const [groupName, setGroupName] = useState("");
  const [memberInputs, setMemberInputs] = useState<string[]>([""]);
  const [formError, setFormError] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState("");
  const [showSettle, setShowSettle] = useState(false);
  const [settleTarget, setSettleTarget] = useState<PersonDebt | null>(null);
  const [settleAmount, setSettleAmount] = useState("");
  const [defaultAccountPick, setDefaultAccountPick] = useState("");
  const [toastMsg, setToastMsg] = useState("");

  const isSplitwiseConnected = !!profile?.splitwise_access_token;
  const needsDefaultAccount =
    !resolveDefaultAccount(profile, accounts) &&
    accounts &&
    accounts.length > 1;

  async function handleSync() {
    setSyncing(true);
    setSyncMsg("");
    try {
      const res = await fetch("/api/splitwise/sync", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setSyncMsg(data.error || "Sync failed");
      } else {
        const parts = [];
        if (data.new_groups_synced) parts.push(`${data.new_groups_synced} group(s)`);
        if (data.expenses_synced) parts.push(`${data.expenses_synced} expense(s)`);
        if (data.settlements_synced) parts.push(`${data.settlements_synced} settlement(s)`);
        if (data.transactions_created) parts.push(`${data.transactions_created} transaction(s)`);
        setSyncMsg(parts.length ? `Synced ${parts.join(", ")}` : "Everything up to date");
        qc.invalidateQueries({ queryKey: ["split-groups"] });
        qc.invalidateQueries({ queryKey: ["split-debts"] });
        qc.invalidateQueries({ queryKey: ["split-settlements"] });
        qc.invalidateQueries({ queryKey: ["dashboard-split-settlements"] });
        qc.invalidateQueries({ queryKey: ["transactions"] });
      }
    } catch {
      setSyncMsg("Network error during sync");
    } finally {
      setSyncing(false);
    }
  }

  useEffect(() => {
    if (searchParams.get("connected") === "true" && !didAutoSync.current) {
      didAutoSync.current = true;
      qc.invalidateQueries({ queryKey: ["profile"] });
      router.replace("/split", { scroll: false });
      handleSync();
    }
  }, [searchParams]);

  const { data: groups, isLoading } = useQuery({
    queryKey: ["split-groups"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("split_groups")
        .select("*, split_members(*)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  // Fetch all expenses and settlements across all groups for debt computation
  const { data: allExpenses } = useQuery({
    queryKey: ["split-debts-expenses"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("split_expenses")
        .select("*, split_shares(*), split_groups(name)");
      if (error) throw error;
      return data;
    },
    enabled: !!groups && groups.length > 0,
  });

  const { data: allSettlements } = useQuery({
    queryKey: ["split-debts-settlements"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("split_settlements")
        .select("*, split_groups(name)");
      if (error) throw error;
      return data;
    },
    enabled: !!groups && groups.length > 0,
  });

  // Compute per-person debts across all groups
  const personDebts = useMemo(() => {
    if (!groups || !allExpenses || !profile) return [];

    const allMembers: Record<string, any> = {};
    const memberToGroup: Record<string, string[]> = {};
    let myMemberIds = new Set<string>();

    for (const g of groups) {
      for (const m of g.split_members || []) {
        allMembers[m.id] = m;
        if (!memberToGroup[m.id]) memberToGroup[m.id] = [];
        memberToGroup[m.id].push(g.name);
        if (m.user_id === profile.id) myMemberIds.add(m.id);
      }
    }

    const bal: Record<string, number> = {};
    const cur = (profile.primary_currency as string) || "USD";

    for (const g of groups) {
      if (g.splitwise_group_id) {
        const part = balancesFromSimplifiedDebts(
          g.simplified_debts as SimplifiedDebtRow[] | null,
          g.split_members || [],
          cur
        );
        for (const [id, v] of Object.entries(part)) {
          bal[id] = (bal[id] || 0) + v;
        }
      } else {
        const part = balancesFromManualLedger(
          g.id,
          allExpenses,
          allSettlements || []
        );
        for (const [id, v] of Object.entries(part)) {
          bal[id] = (bal[id] || 0) + v;
        }
      }
    }

    // My total balance across all member IDs
    let myTotal = 0;
    for (const mid of Array.from(myMemberIds)) {
      myTotal += bal[mid] || 0;
    }

    // Per-person: group debts by member name (aggregated across groups)
    const personMap = new Map<string, PersonDebt>();
    for (const [memberId, balance] of Object.entries(bal)) {
      if (myMemberIds.has(memberId)) continue;
      const member = allMembers[memberId];
      if (!member) continue;
      const key = member.email || member.name;
      const existing = personMap.get(key);
      if (existing) {
        existing.net += balance;
        const newGroups = memberToGroup[memberId] || [];
        for (const gn of newGroups) {
          if (!existing.groups.includes(gn)) existing.groups.push(gn);
        }
      } else {
        personMap.set(key, {
          name: member.name,
          email: member.email,
          net: balance,
          currency: (profile.primary_currency as Currency) || "USD",
          groups: [...(memberToGroup[memberId] || [])],
          memberId,
          groupId: member.group_id,
        });
      }
    }

    return Array.from(personMap.values())
      .filter((p) => Math.abs(p.net) > 0.01)
      .sort((a, b) => a.net - b.net);
  }, [groups, allExpenses, allSettlements, profile]);

  const totalIOwe = personDebts
    .filter((p) => p.net > 0)
    .reduce((s, p) => s + p.net, 0);
  const totalOwedToMe = personDebts
    .filter((p) => p.net < 0)
    .reduce((s, p) => s + Math.abs(p.net), 0);

  const createGroup = useMutation({
    mutationFn: async ({
      name,
      memberNames,
    }: {
      name: string;
      memberNames: string[];
    }) => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const { data: group, error } = await supabase
        .from("split_groups")
        .insert({ name, user_id: user!.id })
        .select()
        .single();
      if (error) throw error;

      const allMembers = [
        {
          group_id: group.id,
          name: profile?.display_name || "Me",
          user_id: user!.id,
        },
        ...memberNames
          .filter(Boolean)
          .map((n) => ({ group_id: group.id, name: n, user_id: null })),
      ];
      await supabase.from("split_members").insert(allMembers);
      return group;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["split-groups"] }),
  });

  const saveDefaultAccount = useMutation({
    mutationFn: async (accountId: string) => {
      const { error } = await supabase
        .from("profiles")
        .update({ default_account_id: accountId })
        .eq("id", profile!.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["profile"] }),
  });

  const settle = useMutation({
    mutationFn: async ({
      groupId,
      from,
      to,
      amt,
    }: {
      groupId: string;
      from: string;
      to: string;
      amt: number;
    }) => {
      const { error } = await supabase.from("split_settlements").insert({
        group_id: groupId,
        from_member: from,
        to_member: to,
        amount: amt,
        currency: profile?.primary_currency || "USD",
        date: new Date().toISOString().slice(0, 10),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["split-debts-expenses"] });
      qc.invalidateQueries({ queryKey: ["split-debts-settlements"] });
      setShowSettle(false);
      setSettleAmount("");
      setSettleTarget(null);
    },
  });

  function addMemberField() {
    setMemberInputs([...memberInputs, ""]);
  }

  function updateMember(index: number, value: string) {
    const copy = [...memberInputs];
    copy[index] = value;
    setMemberInputs(copy);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setFormError("");
    if (!groupName.trim()) {
      setFormError("Group name is required");
      return;
    }
    const validMembers = memberInputs.filter((m) => m.trim());
    if (validMembers.length === 0) {
      setFormError("Add at least one member");
      return;
    }
    try {
      await createGroup.mutateAsync({
        name: groupName.trim(),
        memberNames: validMembers,
      });
      setShowCreate(false);
      setGroupName("");
      setMemberInputs([""]);
    } catch (err: any) {
      setFormError(err.message);
    }
  }

  function handleRemind(person: PersonDebt) {
    const amount = formatCurrency(Math.abs(person.net), person.currency);
    const msg = `Hey ${person.name}! You owe me ${amount} from ${person.groups.join(", ")} on Numo. Can you settle up?`;
    navigator.clipboard.writeText(msg);
    setToastMsg("Message copied — paste it in WhatsApp/iMessage");
    setTimeout(() => setToastMsg(""), 3000);
  }

  function handlePay(person: PersonDebt) {
    setSettleTarget(person);
    setSettleAmount(Math.abs(person.net).toFixed(2));
    setShowSettle(true);
  }

  function handleSettleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!settleTarget || !profile) return;
    const amt = parseFloat(settleAmount);
    if (!amt || amt <= 0) return;

    // Find my member ID in the same group as the settle target
    const targetGroup = groups?.find((g: any) =>
      (g.split_members || []).some((m: any) => m.id === settleTarget.memberId)
    );
    if (!targetGroup) return;
    const myMember = (targetGroup.split_members || []).find(
      (m: any) => m.user_id === profile.id
    );
    if (!myMember) return;

    settle.mutate({
      groupId: targetGroup.id,
      from: myMember.id,
      to: settleTarget.memberId,
      amt,
    });
  }

  const displayCurrency = (profile?.primary_currency as Currency) || "USD";

  if (isLoading) {
    return (
      <div className="space-y-4 animate-fade-in">
        <h1 className="text-xl font-semibold">Splits</h1>
        <ShimmerCard />
        <ShimmerCard />
      </div>
    );
  }

  return (
    <div className="space-y-4 animate-fade-in">
      <h1 className="text-xl font-semibold">Splits</h1>

      {/* Default account prompt */}
      {needsDefaultAccount && groups && groups.length > 0 && (
        <Card className="space-y-3 border-accent-amber/20">
          <div className="flex items-center gap-2">
            <Wallet className="w-4 h-4 text-accent-amber" />
            <p className="text-sm">Which account do you pay shared bills from?</p>
          </div>
          <div className="flex gap-2">
            <select
              value={defaultAccountPick}
              onChange={(e) => setDefaultAccountPick(e.target.value)}
              className="flex-1 px-3 py-2 bg-white/[0.05] border border-white/[0.08] rounded-xl text-sm text-white outline-none [&>option]:bg-surface [&>option]:text-white"
            >
              <option value="">Select account</option>
              {accounts?.map((a: any) => (
                <option key={a.id} value={a.id}>
                  {a.name} ({a.currency})
                </option>
              ))}
            </select>
            <Button
              size="sm"
              onClick={() => {
                if (defaultAccountPick) saveDefaultAccount.mutate(defaultAccountPick);
              }}
              loading={saveDefaultAccount.isPending}
            >
              Save
            </Button>
          </div>
        </Card>
      )}

      {/* Splitwise connection / sync banner */}
      <Card className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-accent-blue/10 flex items-center justify-center">
          <LinkIcon className="w-4 h-4 text-accent-blue" />
        </div>
        <div className="flex-1">
          <p className="text-sm">Splitwise</p>
          <p className="text-xs text-muted">
            {isSplitwiseConnected
              ? "Connected — tap Sync to import groups & expenses"
              : "Sync your existing groups"}
          </p>
        </div>
        <div className="flex gap-2">
          {!isSplitwiseConnected && (
            <Button
              size="sm"
              variant="secondary"
              onClick={() => (window.location.href = "/api/splitwise/auth")}
            >
              Connect
            </Button>
          )}
          <Button
            size="sm"
            variant="secondary"
            onClick={handleSync}
            loading={syncing}
          >
            <RefreshCw
              className={cn("w-3.5 h-3.5 mr-1", syncing && "animate-spin")}
            />
            Sync
          </Button>
        </div>
      </Card>
      {syncMsg && (
        <p
          className={cn(
            "text-xs px-1",
            syncMsg.includes("error") ||
              syncMsg.includes("fail") ||
              syncMsg.includes("expired")
              ? "text-accent-coral"
              : "text-accent-green"
          )}
        >
          {syncMsg}
        </p>
      )}

      {/* Debt Summary Banner */}
      {personDebts.length > 0 && (
        <>
          <Card className="flex items-center justify-between">
            <div className="text-center flex-1">
              <p className="text-xs text-muted">You owe</p>
              <p className="font-number text-sm font-semibold text-accent-coral">
                {formatCurrency(totalIOwe, displayCurrency)}
              </p>
            </div>
            <div className="w-px h-8 bg-white/[0.08]" />
            <div className="text-center flex-1">
              <p className="text-xs text-muted">You&apos;re owed</p>
              <p className="font-number text-sm font-semibold text-accent-green">
                {formatCurrency(totalOwedToMe, displayCurrency)}
              </p>
            </div>
            <div className="w-px h-8 bg-white/[0.08]" />
            <div className="text-center flex-1">
              <p className="text-xs text-muted">Net</p>
              <p
                className={cn(
                  "font-number text-sm font-semibold",
                  totalIOwe > totalOwedToMe
                    ? "text-accent-coral"
                    : "text-accent-green"
                )}
              >
                {totalIOwe > totalOwedToMe ? "-" : "+"}
                {formatCurrency(
                  Math.abs(totalIOwe - totalOwedToMe),
                  displayCurrency
                )}
              </p>
            </div>
          </Card>

          {/* Per-Person Debt Cards */}
          <div className="space-y-2">
            {personDebts.map((p) => {
              const iOwe = p.net > 0;
              return (
                <Card
                  key={p.memberId}
                  className="flex items-center gap-3"
                >
                  <div className="w-8 h-8 rounded-full bg-accent-blue/20 flex items-center justify-center text-[10px] font-semibold text-accent-blue">
                    {getInitials(p.name)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{p.name}</p>
                    <p className="text-xs text-muted truncate">
                      {p.groups.join(", ")}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="text-right">
                      <p
                        className={cn(
                          "font-number text-sm font-semibold",
                          iOwe ? "text-accent-coral" : "text-accent-green"
                        )}
                      >
                        {formatCurrency(Math.abs(p.net), p.currency)}
                      </p>
                      <p className="text-[10px] text-muted">
                        {iOwe ? "you owe" : "owes you"}
                      </p>
                    </div>
                    {iOwe ? (
                      <button
                        onClick={() => handlePay(p)}
                        className="px-2.5 py-1 rounded-lg bg-accent-coral/15 text-accent-coral text-xs font-medium hover:bg-accent-coral/25 transition-colors"
                      >
                        Pay
                      </button>
                    ) : (
                      <button
                        onClick={() => handleRemind(p)}
                        className="px-2.5 py-1 rounded-lg bg-accent-green/15 text-accent-green text-xs font-medium hover:bg-accent-green/25 transition-colors"
                      >
                        <Copy className="w-3 h-3 inline mr-1" />
                        Remind
                      </button>
                    )}
                  </div>
                </Card>
              );
            })}
          </div>
        </>
      )}

      {/* Toast */}
      {toastMsg && (
        <div className="fixed bottom-28 left-1/2 -translate-x-1/2 bg-surface border border-white/[0.08] rounded-xl px-4 py-2 text-xs text-accent-green shadow-lg z-50 animate-fade-in">
          {toastMsg}
        </div>
      )}

      {/* Groups List */}
      {!groups || groups.length === 0 ? (
        <EmptyState
          icon={<Users className="w-12 h-12" />}
          title="No splits yet"
          description="Create a group or connect Splitwise"
          actionLabel="Create a Group"
          onAction={() => setShowCreate(true)}
        />
      ) : (
        <div className="space-y-3">
          <p className="text-xs text-muted uppercase tracking-wide">Groups</p>
          {groups.map((g: any) => {
            const memberCount = g.split_members?.length || 0;
            return (
              <Card
                key={g.id}
                hover
                className="flex items-center gap-3 cursor-pointer"
                onClick={() => router.push(`/split/${g.id}`)}
              >
                <div className="flex -space-x-2">
                  {(g.split_members || [])
                    .slice(0, 4)
                    .map((m: any) => (
                      <div
                        key={m.id}
                        className="w-8 h-8 rounded-full bg-accent-blue/20 border-2 border-obsidian flex items-center justify-center text-[10px] font-semibold text-accent-blue"
                      >
                        {getInitials(m.name)}
                      </div>
                    ))}
                  {memberCount > 4 && (
                    <div className="w-8 h-8 rounded-full bg-white/[0.06] border-2 border-obsidian flex items-center justify-center text-[10px] text-muted">
                      +{memberCount - 4}
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{g.name}</p>
                  <p className="text-xs text-muted">{memberCount} members</p>
                </div>
                <ArrowRight className="w-4 h-4 text-muted" />
              </Card>
            );
          })}
        </div>
      )}

      <FAB onClick={() => setShowCreate(true)} />

      {/* Create Group Modal */}
      <Modal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        title="New Split Group"
      >
        <form onSubmit={handleCreate} className="space-y-4">
          <Input
            label="Group Name"
            placeholder="e.g., Apartment, Trip to Goa"
            value={groupName}
            onChange={(e) => setGroupName(e.target.value)}
          />
          <div className="space-y-2">
            <label className="block text-sm text-muted">Members</label>
            {memberInputs.map((m, i) => (
              <Input
                key={i}
                placeholder={`Member ${i + 1} name`}
                value={m}
                onChange={(e) => updateMember(i, e.target.value)}
              />
            ))}
            <button
              type="button"
              onClick={addMemberField}
              className="text-xs text-accent-blue hover:underline flex items-center gap-1"
            >
              <Plus className="w-3 h-3" /> Add another member
            </button>
          </div>
          {formError && (
            <p className="text-sm text-accent-coral">{formError}</p>
          )}
          <Button
            type="submit"
            className="w-full"
            loading={createGroup.isPending}
          >
            Create Group
          </Button>
        </form>
      </Modal>

      {/* Settle Up Modal */}
      <Modal
        open={showSettle}
        onClose={() => {
          setShowSettle(false);
          setSettleTarget(null);
        }}
        title={
          settleTarget
            ? `Settle with ${settleTarget.name}`
            : "Settle Up"
        }
      >
        <form onSubmit={handleSettleSubmit} className="space-y-4">
          {settleTarget && (
            <p className="text-sm text-muted">
              You owe {settleTarget.name}{" "}
              <span className="text-accent-coral font-semibold">
                {formatCurrency(Math.abs(settleTarget.net), settleTarget.currency)}
              </span>{" "}
              from {settleTarget.groups.join(", ")}
            </p>
          )}
          <Input
            label="Amount"
            type="number"
            step="0.01"
            placeholder="0.00"
            value={settleAmount}
            onChange={(e) => setSettleAmount(e.target.value)}
            className="font-number"
          />
          <Button
            type="submit"
            className="w-full"
            loading={settle.isPending}
          >
            <Handshake className="w-4 h-4 mr-1" /> Record Payment
          </Button>
        </form>
      </Modal>
    </div>
  );
}
