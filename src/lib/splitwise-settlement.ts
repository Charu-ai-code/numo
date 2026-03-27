/**
 * Splitwise "payment" expenses are debt transfers, not shared spending.
 * @see https://dev.splitwise.com/ — expense.payment and repayments[]
 */
export function isSplitwiseSettlementExpense(exp: {
  payment?: boolean;
  description?: string | null;
}): boolean {
  if (exp.payment === true) return true;
  return looksLikeSettlementDescription(exp.description);
}

/** For local DB rows (no `payment` flag) — hide from shared-expense lists */
export function looksLikeSettlementDescription(
  description?: string | null
): boolean {
  const t = (description || "").trim().toLowerCase();
  if (t.startsWith("payment")) return true;
  if (t.includes("settle all balances")) return true;
  return false;
}

export type ParsedSwSettlement = {
  fromMemberId: string;
  toMemberId: string;
  amount: number;
  /** Dedup key for split_settlements.splitwise_expense_id */
  dedupKey: string;
};

/**
 * Prefer Splitwise repayments[]. Else infer one payer / one receiver from users[].
 */
export function parseSplitwiseSettlements(
  exp: {
    id: number | string;
    cost?: string;
    repayments?: { from: number; to: number; amount: string }[];
    users?: {
      user_id: number | string;
      paid_share?: string;
      owed_share?: string;
    }[];
  },
  memberMap: Map<string, string>
): ParsedSwSettlement[] {
  const swExpenseId = String(exp.id);
  const reps = exp.repayments || [];
  const out: ParsedSwSettlement[] = [];

  if (reps.length > 0) {
    reps.forEach((r, i) => {
      const from = memberMap.get(String(r.from));
      const to = memberMap.get(String(r.to));
      const amt = parseFloat(String(r.amount || "0"));
      if (!from || !to || amt <= 0) return;
      out.push({
        fromMemberId: from,
        toMemberId: to,
        amount: amt,
        dedupKey: reps.length === 1 ? swExpenseId : `${swExpenseId}_${i}`,
      });
    });
    if (out.length > 0) return out;
  }

  const users = exp.users || [];
  const cost = parseFloat(String(exp.cost || "0"));
  if (users.length < 2 || cost <= 0) return [];

  let payerSw: string | null = null;
  let receiverSw: string | null = null;
  let maxPaid = 0;
  let maxOwed = 0;
  for (const u of users) {
    const p = parseFloat(String(u.paid_share || "0"));
    const o = parseFloat(String(u.owed_share || "0"));
    if (p > maxPaid) {
      maxPaid = p;
      payerSw = String(u.user_id);
    }
    if (o > maxOwed) {
      maxOwed = o;
      receiverSw = String(u.user_id);
    }
  }

  if (
    payerSw &&
    receiverSw &&
    payerSw !== receiverSw &&
    maxPaid > 0.01 &&
    maxOwed > 0.01
  ) {
    const from = memberMap.get(payerSw);
    const to = memberMap.get(receiverSw);
    const amt = Math.min(maxPaid, maxOwed, cost);
    if (from && to && amt > 0) {
      out.push({
        fromMemberId: from,
        toMemberId: to,
        amount: amt,
        dedupKey: swExpenseId,
      });
    }
  }

  return out;
}
