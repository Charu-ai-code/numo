"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Landmark,
  CreditCard,
  Wallet,
  Bitcoin,
  ArrowDown,
} from "lucide-react";
import {
  useAccounts,
  useAllTransactionsLedger,
  useCreateAccount,
} from "@/lib/hooks/use-accounts";
import { useAppStore } from "@/lib/stores/app-store";
import { ACCOUNT_TYPES, type AccountType, type Currency } from "@/lib/constants";
import { formatCurrency, cn, truncate } from "@/lib/utils";
import {
  computeNetWorthByCurrency,
  computeRunningBalance,
  getDueDateStatus,
  utilizationPercent,
  utilizationColorBucket,
  UTILIZATION_HEX,
  type LedgerAccountRow,
  type LedgerTransactionRow,
} from "@/lib/account-ledger";
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
import { ProgressBar } from "@/components/ui/progress-bar";

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

const SECTION_ORDER: { key: AccountType | "header"; label: string }[] = [
  { key: "bank", label: "Bank accounts" },
  { key: "credit_card", label: "Credit cards" },
  { key: "wallet", label: "Wallets" },
  { key: "crypto_wallet", label: "Crypto" },
];

export default function AccountsPage() {
  const router = useRouter();
  const { data: accounts, isLoading, error, refetch } = useAccounts();
  const { data: ledgerTxs, isLoading: ledgerLoading } = useAllTransactionsLedger();
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
  const [creditLimit, setCreditLimit] = useState("");
  const [paymentDueDay, setPaymentDueDay] = useState("");
  const [apr, setApr] = useState("");
  const [formError, setFormError] = useState("");

  const txsByAccountId = useMemo(() => {
    const m = new Map<string, LedgerTransactionRow[]>();
    if (!ledgerTxs) return m;
    for (const row of ledgerTxs as any[]) {
      const aid = row.account_id as string;
      const t: LedgerTransactionRow = {
        amount: row.amount,
        type: row.type,
        date: row.date,
        created_at: row.created_at,
      };
      if (!m.has(aid)) m.set(aid, []);
      m.get(aid)!.push(t);
    }
    return m;
  }, [ledgerTxs]);

  const netWorthByCurrency = useMemo(() => {
    if (!accounts) return { USD: 0, INR: 0 };
    return computeNetWorthByCurrency(
      accounts as LedgerAccountRow[],
      txsByAccountId
    );
  }, [accounts, txsByAccountId]);

  const filtered =
    filter === "all"
      ? accounts
      : accounts?.filter((a: any) => a.type === filter);

  function balanceFor(account: any) {
    return computeRunningBalance(
      account as LedgerAccountRow,
      txsByAccountId.get(account.id) || []
    );
  }

  function resetCreateForm() {
    setName("");
    setInitialBalance("");
    setCreditLimit("");
    setPaymentDueDay("");
    setApr("");
    setFormError("");
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

    const owed = parseFloat(initialBalance);
    if (type === "credit_card") {
      if (Number.isNaN(owed) || owed < 0) {
        setFormError("Current balance owed is required (0 or more)");
        return;
      }
      const lim = parseFloat(creditLimit);
      if (!lim || lim <= 0) {
        setFormError("Credit limit is required");
        return;
      }
      const due = parseInt(paymentDueDay, 10);
      if (!due || due < 1 || due > 31) {
        setFormError("Payment due day must be 1–31");
        return;
      }
      let aprVal: number | null = null;
      if (apr.trim()) {
        const a = parseFloat(apr);
        if (!Number.isNaN(a) && a >= 0) aprVal = a;
      }
      try {
        await createAccount.mutateAsync({
          name: name.trim(),
          type,
          currency,
          initial_balance: owed,
          credit_limit: lim,
          payment_due_day: due,
          apr: aprVal,
        });
        setShowCreate(false);
        resetCreateForm();
      } catch (err: any) {
        setFormError(err.message);
      }
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
      resetCreateForm();
    } catch (err: any) {
      setFormError(err.message);
    }
  }

  function renderAccountCard(account: any) {
    const typeInfo = ACCOUNT_TYPES.find((t) => t.value === account.type);
    const Icon = ICON_MAP[typeInfo?.icon || "Landmark"];
    const balance = balanceFor(account);
    const isCC = account.type === "credit_card";
    const limit = account.credit_limit != null ? Number(account.credit_limit) : null;
    const util = utilizationPercent(balance, limit);
    const bucket = utilizationColorBucket(util);
    const utilColor = UTILIZATION_HEX[bucket];
    const dueMeta =
      isCC && account.payment_due_day
        ? getDueDateStatus(account.payment_due_day)
        : null;

    return (
      <Card
        key={account.id}
        hover
        className="flex flex-col gap-3 cursor-pointer p-4"
        onClick={() => router.push(`/accounts/${account.id}`)}
      >
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-white/[0.06] flex items-center justify-center shrink-0">
            <Icon className="w-5 h-5 text-muted" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{truncate(account.name, 32)}</p>
            <div className="flex flex-wrap gap-1.5 mt-1">
              <Badge variant={account.currency === "INR" ? "amber" : "blue"}>
                {typeInfo?.label}
              </Badge>
              <Badge variant={account.currency === "INR" ? "amber" : "blue"}>
                {account.currency}
              </Badge>
            </div>
          </div>
          <div className="text-right shrink-0">
            {isCC ? (
              <>
                <p className="text-[10px] text-muted uppercase tracking-wide">Owed</p>
                <p className="font-number text-sm font-semibold text-accent-coral">
                  {formatCurrency(balance, account.currency)}
                </p>
              </>
            ) : (
              <p
                className={cn(
                  "font-number text-sm font-semibold",
                  balance < 0 ? "text-accent-coral" : "text-white"
                )}
              >
                {balance < 0 && <ArrowDown className="w-3 h-3 inline mr-0.5" />}
                {formatCurrency(balance, account.currency)}
              </p>
            )}
          </div>
        </div>

        {isCC && limit != null && limit > 0 && (
          <div className="space-y-1" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between text-[11px] text-muted">
              <span style={{ color: utilColor }}>
                {util != null ? `${Math.round(util)}% of limit` : "—"}
              </span>
              <span>
                Available {formatCurrency(Math.max(0, limit - Math.max(0, balance)), account.currency)}
              </span>
            </div>
            <ProgressBar value={Math.min(balance, limit)} max={limit} />
          </div>
        )}

        {isCC && dueMeta && (
          <p
            className={cn(
              "text-xs",
              dueMeta.overdue || dueMeta.daysUntil <= 2
                ? "text-accent-coral"
                : dueMeta.daysUntil <= 7
                  ? "text-accent-amber"
                  : "text-muted"
            )}
          >
            Due {dueMeta.nextDue.toLocaleDateString(undefined, { month: "short", day: "numeric" })}
            {dueMeta.overdue
              ? " · overdue"
              : dueMeta.daysUntil === 0
                ? " · today"
                : ` · ${dueMeta.daysUntil} day${dueMeta.daysUntil === 1 ? "" : "s"} away`}
          </p>
        )}

        {isCC && (
          <Button
            type="button"
            size="sm"
            variant="secondary"
            className="w-full"
            onClick={(e) => {
              e.stopPropagation();
              router.push(`/accounts/${account.id}?pay=1`);
            }}
          >
            Pay card
          </Button>
        )}
      </Card>
    );
  }

  if (isLoading || ledgerLoading) {
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

  const hasAccounts = filtered && filtered.length > 0;

  return (
    <div className="space-y-4 animate-fade-in">
      <h1 className="text-xl font-semibold">Accounts</h1>

      {accounts && accounts.length > 0 && (
        <Card className="space-y-2 border border-white/[0.08]">
          <p className="text-[11px] text-muted uppercase tracking-wide">Net worth</p>
          <p className="text-xs text-muted">Banks + wallets + crypto − credit cards owed</p>
          <div className="space-y-1">
            <p className="font-number text-lg font-semibold">
              {formatCurrency(netWorthByCurrency.USD, "USD")}
            </p>
            <p className="font-number text-sm text-muted">
              {formatCurrency(netWorthByCurrency.INR, "INR", true)}
            </p>
          </div>
        </Card>
      )}

      <SegmentedControl options={FILTERS} value={filter} onChange={setFilter} />

      {!hasAccounts ? (
        <EmptyState
          icon={<Landmark className="w-12 h-12" />}
          title="No accounts yet"
          description="Add your first account to get started"
          actionLabel="Add Account"
          onAction={() => setShowCreate(true)}
        />
      ) : filter === "all" ? (
        <div className="space-y-6">
          {SECTION_ORDER.map(({ key, label }) => {
            const rows = (filtered as any[]).filter((a) => a.type === key);
            if (rows.length === 0) return null;
            return (
              <div key={key} className="space-y-2">
                <p className="text-[11px] text-muted uppercase tracking-wide">{label}</p>
                <div className="grid gap-3">{rows.map((a) => renderAccountCard(a))}</div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="grid gap-3">
          {(filtered as any[]).map((a) => renderAccountCard(a))}
        </div>
      )}

      <FAB onClick={() => setShowCreate(true)} />

      <Modal
        open={showCreate}
        onClose={() => {
          setShowCreate(false);
          resetCreateForm();
        }}
        title="New Account"
      >
        <form onSubmit={handleCreate} className="space-y-4">
          <Input
            label="Account Name"
            placeholder={type === "credit_card" ? "e.g., Chase Sapphire" : "e.g., Chase Checking"}
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
          {type === "credit_card" ? (
            <>
              <Input
                label="Current balance owed"
                type="number"
                step="0.01"
                min={0}
                placeholder="0.00"
                value={initialBalance}
                onChange={(e) => setInitialBalance(e.target.value)}
                className="font-number"
              />
              <Input
                label="Credit limit"
                type="number"
                step="0.01"
                min={0}
                placeholder="0.00"
                value={creditLimit}
                onChange={(e) => setCreditLimit(e.target.value)}
                className="font-number"
              />
              <Input
                label="Payment due day (1–31)"
                type="number"
                min={1}
                max={31}
                placeholder="21"
                value={paymentDueDay}
                onChange={(e) => setPaymentDueDay(e.target.value)}
                className="font-number"
              />
              <Input
                label="APR % (optional)"
                type="number"
                step="0.01"
                min={0}
                placeholder="e.g. 24.99"
                value={apr}
                onChange={(e) => setApr(e.target.value)}
                className="font-number"
              />
            </>
          ) : (
            <Input
              label="Initial Balance"
              type="number"
              step="0.01"
              placeholder="0.00"
              value={initialBalance}
              onChange={(e) => setInitialBalance(e.target.value)}
              className="font-number"
            />
          )}
          {formError && <p className="text-sm text-accent-coral">{formError}</p>}
          <Button type="submit" className="w-full" loading={createAccount.isPending}>
            Add Account
          </Button>
        </form>
      </Modal>
    </div>
  );
}
