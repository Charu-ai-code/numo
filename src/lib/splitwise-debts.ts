import { looksLikeSettlementDescription } from "@/lib/splitwise-settlement";

/**
 * Splitwise authoritative balances: GET /get_groups → group.simplified_debts
 * Each entry: { from, to, amount, currency_code } — "from" owes "to" that amount.
 */

export type SimplifiedDebtRow = {
  from: number;
  to: number;
  amount: string;
  currency_code: string;
};

/** Net balance per local member id (same sign convention as previous Numo split math) */
export function balancesFromSimplifiedDebts(
  debts: SimplifiedDebtRow[] | null | undefined,
  splitMembers: { id: string; splitwise_user_id: string | null }[],
  currency: string
): Record<string, number> {
  const bal: Record<string, number> = {};
  const map = new Map(
    splitMembers
      .filter((m) => m.splitwise_user_id)
      .map((m) => [String(m.splitwise_user_id), m.id])
  );

  for (const d of debts || []) {
    if (d.currency_code && d.currency_code !== currency) continue;
    const fromId = map.get(String(d.from));
    const toId = map.get(String(d.to));
    const amt = parseFloat(String(d.amount || "0"));
    if (!fromId || !toId || amt <= 0) continue;
    bal[fromId] = (bal[fromId] || 0) - amt;
    bal[toId] = (bal[toId] || 0) + amt;
  }
  return bal;
}

/** Local-only groups: approximate net from expenses + settlements (not authoritative). */
export function balancesFromManualLedger(
  groupId: string,
  expenses: {
    group_id: string;
    description?: string | null;
    paid_by: string;
    amount: number;
    split_shares?: { member_id: string; share_amount: number }[];
  }[],
  settlements: {
    group_id: string;
    from_member: string;
    to_member: string;
    amount: number;
  }[]
): Record<string, number> {
  const bal: Record<string, number> = {};

  for (const exp of expenses) {
    if (exp.group_id !== groupId) continue;
    if (looksLikeSettlementDescription(exp.description)) continue;
    const shares = exp.split_shares || [];
    for (const s of shares) {
      bal[s.member_id] = (bal[s.member_id] || 0) - s.share_amount;
    }
    bal[exp.paid_by] = (bal[exp.paid_by] || 0) + exp.amount;
  }

  for (const s of settlements) {
    if (s.group_id !== groupId) continue;
    bal[s.from_member] = (bal[s.from_member] || 0) + s.amount;
    bal[s.to_member] = (bal[s.to_member] || 0) - s.amount;
  }

  return bal;
}
