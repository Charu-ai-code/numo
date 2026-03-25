"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Landmark,
  CreditCard,
  Wallet,
  Bitcoin,
  ArrowDown,
} from "lucide-react";
import { useAccounts, useCreateAccount } from "@/lib/hooks/use-accounts";
import { useAppStore } from "@/lib/stores/app-store";
import { ACCOUNT_TYPES, type AccountType, type Currency } from "@/lib/constants";
import { formatCurrency, cn, truncate } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { SegmentedControl } from "@/components/ui/segmented-control";
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
  Landmark,
  CreditCard,
  Wallet,
  Bitcoin,
};

const FILTERS = [
  { value: "all", label: "All" },
  { value: "bank", label: "Bank" },
  { value: "credit_card", label: "Credit Card" },
  { value: "wallet", label: "Wallet" },
  { value: "crypto_wallet", label: "Crypto" },
];

export default function AccountsPage() {
  const router = useRouter();
  const { data: accounts, isLoading, error, refetch } = useAccounts();
  const createAccount = useCreateAccount();
  const profile = useAppStore((s) => s.profile);

  const [filter, setFilter] = useState("all");
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState("");
  const [type, setType] = useState<AccountType>("bank");
  const [currency, setCurrency] = useState<Currency>(
    profile?.primary_currency || "USD"
  );
  const [initialBalance, setInitialBalance] = useState("");
  const [formError, setFormError] = useState("");

  const filtered =
    filter === "all"
      ? accounts
      : accounts?.filter((a: any) => a.type === filter);

  function computeBalance(account: any) {
    return account.initial_balance || 0;
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setFormError("");
    if (!name.trim()) {
      setFormError("Name is required");
      return;
    }
    if (
      accounts &&
      accounts.some(
        (a: any) =>
          a.name.toLowerCase() === name.trim().toLowerCase() && a.type === type
      )
    ) {
      setFormError(`You already have a ${type.replace("_", " ")} called '${name.trim()}'`);
      return;
    }
    if (accounts && accounts.length >= 20) {
      setFormError("Maximum 20 accounts allowed");
      return;
    }
    try {
      await createAccount.mutateAsync({
        name: name.trim(),
        type,
        currency,
        initial_balance: parseFloat(initialBalance) || 0,
      });
      setShowCreate(false);
      setName("");
      setInitialBalance("");
    } catch (err: any) {
      setFormError(err.message);
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-4 animate-fade-in">
        <h1 className="text-xl font-semibold">Accounts</h1>
        <div className="shimmer h-10 w-64 rounded-xl" />
        <div className="grid gap-3">
          <ShimmerCard />
          <ShimmerCard />
          <ShimmerCard />
        </div>
      </div>
    );
  }

  if (error) {
    return <ErrorOverlay message="Couldn't load accounts" onRetry={() => refetch()} />;
  }

  return (
    <div className="space-y-4 animate-fade-in">
      <h1 className="text-xl font-semibold">Accounts</h1>

      <SegmentedControl options={FILTERS} value={filter} onChange={setFilter} />

      {!filtered || filtered.length === 0 ? (
        <EmptyState
          icon={<Landmark className="w-12 h-12" />}
          title="No accounts yet"
          description="Add your first account to get started"
          actionLabel="Add Account"
          onAction={() => setShowCreate(true)}
        />
      ) : (
        <div className="grid gap-3">
          {filtered.map((account: any) => {
            const typeInfo = ACCOUNT_TYPES.find((t) => t.value === account.type);
            const Icon = ICON_MAP[typeInfo?.icon || "Landmark"];
            const balance = computeBalance(account);
            const isNeg = balance < 0;

            return (
              <Card
                key={account.id}
                hover
                className="flex items-center gap-4 cursor-pointer"
                onClick={() => router.push(`/accounts/${account.id}`)}
              >
                <div className="w-10 h-10 rounded-xl bg-white/[0.06] flex items-center justify-center">
                  <Icon className="w-5 h-5 text-muted" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">
                    {truncate(account.name, 32)}
                  </p>
                  <Badge variant={account.currency === "INR" ? "amber" : "blue"}>
                    {account.currency}
                  </Badge>
                </div>
                <div className="text-right">
                  <p
                    className={cn(
                      "font-number text-sm font-semibold",
                      isNeg ? "text-accent-coral" : "text-white"
                    )}
                  >
                    {isNeg && <ArrowDown className="w-3 h-3 inline mr-0.5" />}
                    {formatCurrency(balance, account.currency)}
                  </p>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <FAB onClick={() => setShowCreate(true)} />

      <Modal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        title="New Account"
      >
        <form onSubmit={handleCreate} className="space-y-4">
          <Input
            label="Account Name"
            placeholder="e.g., Chase Checking"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <div className="space-y-1.5">
            <label className="block text-sm text-muted">Type</label>
            <div className="grid grid-cols-2 gap-2">
              {ACCOUNT_TYPES.map((t) => {
                const Icon = ICON_MAP[t.icon];
                return (
                  <button
                    key={t.value}
                    type="button"
                    onClick={() => setType(t.value)}
                    className={cn(
                      "flex items-center gap-2 p-3 rounded-xl border transition-all text-sm",
                      type === t.value
                        ? "border-accent-blue/40 bg-accent-blue/10 text-white"
                        : "border-white/[0.06] bg-white/[0.02] text-muted hover:bg-white/[0.04]"
                    )}
                  >
                    <Icon className="w-4 h-4" />
                    {t.label}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="block text-sm text-muted">Currency</label>
            <CurrencyToggle value={currency} onChange={setCurrency} />
          </div>
          <Input
            label="Initial Balance"
            type="number"
            step="0.01"
            placeholder="0.00"
            value={initialBalance}
            onChange={(e) => setInitialBalance(e.target.value)}
            className="font-number"
          />
          {formError && (
            <p className="text-sm text-accent-coral">{formError}</p>
          )}
          <Button
            type="submit"
            className="w-full"
            loading={createAccount.isPending}
          >
            Add Account
          </Button>
        </form>
      </Modal>
    </div>
  );
}
