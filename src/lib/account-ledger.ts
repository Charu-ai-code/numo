/**
 * Single place for balance deltas, net worth, credit card due dates, utilization.
 */

import type { Currency } from "@/lib/constants";

export type LedgerAccountType =
  | "bank"
  | "credit_card"
  | "wallet"
  | "crypto_wallet";

export type LedgerTransactionType =
  | "expense"
  | "income"
  | "transfer_out"
  | "transfer_in";

export const INTERNAL_TRANSFER_CATEGORY = "internal_transfer";

export interface LedgerAccountRow {
  id: string;
  type: string;
  initial_balance: number;
  currency: Currency;
  credit_limit?: number | null;
  payment_due_day?: number | null;
}

export interface LedgerTransactionRow {
  amount: number;
  type: string;
  date: string;
  created_at?: string | null;
}

function isCreditCard(t: string): boolean {
  return t === "credit_card";
}

/** Signed change to stored running balance (CC: positive = more owed). */
export function applyTransactionDelta(
  accountType: string,
  txType: string,
  amount: number
): number {
  const a = Math.abs(Number(amount));
  if (!a || a <= 0) return 0;

  if (isCreditCard(accountType)) {
    switch (txType) {
      case "expense":
        return a;
      case "income":
        return -a;
      case "transfer_in":
        return -a;
      case "transfer_out":
        return a;
      default:
        return 0;
    }
  }

  switch (txType) {
    case "income":
      return a;
    case "expense":
      return -a;
    case "transfer_in":
      return a;
    case "transfer_out":
      return -a;
    default:
      return 0;
  }
}

export function computeRunningBalance(
  account: Pick<LedgerAccountRow, "type" | "initial_balance">,
  transactions: LedgerTransactionRow[]
): number {
  const base = Number(account.initial_balance) || 0;
  const sorted = [...transactions].sort((a, b) => {
    const da = a.date.localeCompare(b.date);
    if (da !== 0) return da;
    const ta = a.created_at || "";
    const tb = b.created_at || "";
    return ta.localeCompare(tb);
  });
  let b = base;
  for (const t of sorted) {
    b += applyTransactionDelta(account.type, t.type, t.amount);
  }
  return b;
}

/** Owed on credit card (always >= 0 for display; negative = overpaid / credit balance). */
export function creditCardOwed(runningBalance: number): number {
  return runningBalance;
}

export function utilizationPercent(
  owed: number,
  creditLimit: number | null | undefined
): number | null {
  if (creditLimit == null || creditLimit <= 0) return null;
  return Math.min(999, (Math.max(0, owed) / creditLimit) * 100);
}

export type UtilizationBucket = "green" | "amber" | "coral";

export function utilizationColorBucket(pct: number | null): UtilizationBucket {
  if (pct == null) return "green";
  if (pct < 30) return "green";
  if (pct <= 50) return "amber";
  return "coral";
}

export const UTILIZATION_HEX: Record<UtilizationBucket, string> = {
  green: "#4edea3",
  amber: "#e9c349",
  coral: "#ffb4ab",
};

function clampDayOfMonth(year: number, monthIndex: number, day: number): Date {
  const last = new Date(year, monthIndex + 1, 0).getDate();
  const dom = Math.min(Math.max(1, day), last);
  return new Date(year, monthIndex, dom);
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function daysBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / (24 * 60 * 60 * 1000));
}

/**
 * Next due date on or after `from` (start of that calendar day).
 */
export function nextPaymentDueDate(
  paymentDueDay: number,
  from: Date = new Date()
): Date {
  const t0 = startOfDay(from);
  const y0 = from.getFullYear();
  const m0 = from.getMonth();
  for (let i = 0; i < 15; i++) {
    const cal = new Date(y0, m0 + i, 1);
    const y = cal.getFullYear();
    const m = cal.getMonth();
    const candidate = clampDayOfMonth(y, m, paymentDueDay);
    if (candidate >= t0) return candidate;
  }
  return clampDayOfMonth(y0, m0, paymentDueDay);
}

export interface DueDateStatus {
  nextDue: Date;
  daysUntil: number;
  overdue: boolean;
}

export function getDueDateStatus(
  paymentDueDay: number | null | undefined,
  now: Date = new Date()
): DueDateStatus | null {
  if (paymentDueDay == null || paymentDueDay < 1 || paymentDueDay > 31)
    return null;
  const t0 = startOfDay(now);
  const y = now.getFullYear();
  const m = now.getMonth();
  const thisMonthDue = clampDayOfMonth(y, m, paymentDueDay);
  let nextDue: Date;
  let overdue: boolean;
  if (t0 <= thisMonthDue) {
    nextDue = thisMonthDue;
    overdue = false;
  } else {
    nextDue = clampDayOfMonth(y, m + 1, paymentDueDay);
    overdue = true;
  }
  const daysUntil = daysBetween(t0, nextDue);
  return { nextDue, daysUntil, overdue };
}

export type DueUrgency = "ok" | "soon" | "critical" | "overdue";

export function dueUrgency(status: DueDateStatus | null): DueUrgency {
  if (!status) return "ok";
  if (status.overdue) return "overdue";
  if (status.daysUntil <= 2) return "critical";
  if (status.daysUntil <= 7) return "soon";
  return "ok";
}

export function computeNetWorthByCurrency(
  accounts: LedgerAccountRow[],
  transactionsByAccountId: Map<string, LedgerTransactionRow[]>
): Record<Currency, number> {
  const out: Record<Currency, number> = { USD: 0, INR: 0 };
  for (const a of accounts) {
    const txs = transactionsByAccountId.get(a.id) || [];
    const bal = computeRunningBalance(a, txs);
    const cur = a.currency as Currency;
    if (isCreditCard(a.type)) {
      out[cur] -= bal;
    } else {
      out[cur] += bal;
    }
  }
  return out;
}

/** Group raw DB rows by account for ledger helpers (coach/nudge, etc.). */
export function transactionsMapByAccountId(
  rows: Array<{
    account_id: string | null;
    type: string;
    amount: number | string;
    date: string;
    created_at?: string | null;
  }>
): Map<string, LedgerTransactionRow[]> {
  const m = new Map<string, LedgerTransactionRow[]>();
  for (const t of rows) {
    if (!t.account_id) continue;
    const row: LedgerTransactionRow = {
      amount: Number(t.amount),
      type: t.type,
      date: t.date,
      created_at: t.created_at ?? null,
    };
    const arr = m.get(t.account_id) || [];
    arr.push(row);
    m.set(t.account_id, arr);
  }
  return m;
}

/** Running balances, utilization, due dates, and net worth for AI context strings. */
export function buildCoachAccountContext(
  accounts: Array<{
    id: string;
    name?: string | null;
    type: string;
    initial_balance: number | string;
    currency: string;
    credit_limit?: number | null;
    payment_due_day?: number | null;
  }>,
  transactionRows: Array<{
    account_id: string | null;
    type: string;
    amount: number | string;
    date: string;
    created_at?: string | null;
  }>,
  now: Date = new Date()
): { netWorthLine: string; accountsDetail: string } {
  const map = transactionsMapByAccountId(transactionRows);
  const ledgerAccounts: LedgerAccountRow[] = accounts.map((a) => ({
    id: a.id,
    type: a.type,
    initial_balance: Number(a.initial_balance),
    currency: a.currency as Currency,
    credit_limit: a.credit_limit,
    payment_due_day: a.payment_due_day,
  }));
  const nw = computeNetWorthByCurrency(ledgerAccounts, map);
  const netWorthLine =
    Object.entries(nw)
      .filter(([, v]) => Math.abs(v) > 0.005)
      .map(([c, v]) => `${c} ${v.toFixed(2)}`)
      .join("; ") || "0";

  const accountsDetail = accounts
    .map((a) => {
      const txs = map.get(a.id) || [];
      const running = computeRunningBalance(
        { type: a.type, initial_balance: Number(a.initial_balance) },
        txs
      );
      const nm = a.name || "Account";
      if (a.type === "credit_card") {
        const owed = creditCardOwed(running);
        const util = utilizationPercent(owed, a.credit_limit);
        const bucket = util != null ? utilizationColorBucket(util) : "n/a";
        const due = getDueDateStatus(a.payment_due_day ?? null, now);
        const dueStr = due
          ? `next due ${due.nextDue.toISOString().slice(0, 10)}, ${due.daysUntil} days, overdue=${due.overdue}, urgency=${dueUrgency(due)}`
          : "due day not set";
        return `${nm} [CC ${a.currency}]: owed ${owed.toFixed(2)}; limit ${a.credit_limit != null ? Number(a.credit_limit).toFixed(0) : "n/a"}; util ${util != null ? util.toFixed(0) + "%" : "n/a"} (${bucket}); ${dueStr}`;
      }
      return `${nm} [${a.type} ${a.currency}]: balance ${running.toFixed(2)}`;
    })
    .join(" | ");

  return { netWorthLine, accountsDetail };
}

export function isTransferType(t: string): boolean {
  return t === "transfer_in" || t === "transfer_out";
}
