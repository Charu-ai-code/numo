import { currentMonthStart } from "@/lib/monthly-planner";
import {
  monthHitForRecurring,
  type RecurringExpenseRow,
  type TxHitRow,
} from "@/lib/recurring-expense-status";
import { monthlyGoalProgress, type GoalContributionRow, type RemittanceRow, type SavingsGoalRow } from "@/lib/budget-engine";

export type RecurringViewMode = "status" | "category" | "date";

export type HubFrequency = "monthly" | "quarterly" | "yearly";

export function todayStr(d: Date = new Date()): string {
  return d.toISOString().slice(0, 10);
}

/** Pause applies for dates strictly before paused_until (resume on paused_until). */
export function isPauseActive(
  re: { is_paused?: boolean | null; paused_until?: string | null },
  nowStr: string = todayStr()
): boolean {
  if (!re.is_paused || !re.paused_until) return false;
  return nowStr < re.paused_until;
}

export function monthlyEquivalent(
  amount: number,
  frequency: string | null | undefined
): number {
  if (frequency === "quarterly") return amount / 3;
  if (frequency === "yearly") return amount / 12;
  return amount;
}

export function displayFrequency(
  recurrence: string | null | undefined,
  frequency: string | null | undefined
): string {
  const f = frequency || "monthly";
  if (f === "quarterly") return "Quarterly";
  if (f === "yearly") return "Yearly";
  if (recurrence && recurrence !== "monthly") {
    const m: Record<string, string> = {
      weekly: "Weekly",
      biweekly: "Biweekly",
      daily: "Daily",
    };
    return m[recurrence] || "Monthly";
  }
  return "Monthly";
}

export type SpendingRecurringHubRow = RecurringExpenseRow & {
  note_fingerprint: string;
  source: string;
  recurrence: string;
  template_transaction_id: string | null;
  is_active: boolean;
  is_paused?: boolean | null;
  paused_until?: string | null;
  frequency?: string | null;
  currency: string;
  expected_amount: number;
};

export type GoalHubRow = {
  kind: "goal";
  id: string;
  name: string;
  goal_type: string;
  monthly_target: number;
  currency: string;
  contributedThisMonth: number;
  hit: boolean;
  expected_day_of_month: number | null;
};

export type HubSpendingItem = {
  kind: "spending";
  re: SpendingRecurringHubRow;
  templateSource: "split" | "manual" | null;
  accountLabel: string | null;
  splitGroupName: string | null;
  hitThisMonth: boolean;
  hitDate: string | null;
  /** Days until expected day this month (negative = past); null if no day */
  daysUntil: number | null;
  status: "hit" | "upcoming" | "overdue" | "paused";
};

export type HubItem = HubSpendingItem | { kind: "goal"; goal: GoalHubRow };

export function buildGoalHubRows(
  goals: any[],
  contributions: GoalContributionRow[],
  remittances: RemittanceRow[],
  monthStart: string
): GoalHubRow[] {
  return (goals || [])
    .filter(
      (g: any) =>
        g.is_recurring &&
        g.monthly_target != null &&
        Number(g.monthly_target) > 0
    )
    .map((g: any) => {
      const ledger: SavingsGoalRow = {
        id: g.id,
        goal_type: g.goal_type,
        monthly_target: g.monthly_target,
        is_recurring: g.is_recurring,
        current_balance: g.current_balance,
        target_amount: g.target_amount,
        currency: g.currency,
      };
      const contributed = monthlyGoalProgress(
        ledger,
        contributions,
        remittances,
        monthStart
      );
      const target = Number(g.monthly_target) || 0;
      return {
        kind: "goal" as const,
        id: g.id,
        name: g.name,
        goal_type: g.goal_type || "custom",
        monthly_target: target,
        currency: g.currency,
        contributedThisMonth: contributed,
        hit: target > 0 && contributed >= target,
        expected_day_of_month: null,
      };
    });
}

export function daysUntilDom(
  expectedDom: number | null,
  now: Date = new Date()
): number | null {
  if (expectedDom == null) return null;
  const y = now.getFullYear();
  const m = now.getMonth();
  const last = new Date(y, m + 1, 0).getDate();
  const dom = Math.min(expectedDom, last);
  const target = new Date(y, m, dom);
  const startOfToday = new Date(y, m, now.getDate());
  return Math.round(
    (target.getTime() - startOfToday.getTime()) / (24 * 60 * 60 * 1000)
  );
}

export function buildSpendingHubItems(
  recurring: SpendingRecurringHubRow[],
  monthStart: string,
  monthEndExclusive: string,
  monthTxs: TxHitRow[],
  templateMeta: Map<
    string,
    { source: "split" | "manual"; accountName: string | null; groupName: string | null }
  >,
  now: Date = new Date()
): HubSpendingItem[] {
  const nowStr = todayStr(now);
  const isCurrentMonth = monthStart === currentMonthStart(now);

  return (recurring || [])
    .filter((re) => re.is_active)
    .map((re) => {
      const paused = isPauseActive(re, nowStr);
      const { hit, hitDate } = monthHitForRecurring(
        re.id,
        monthStart,
        monthEndExclusive,
        monthTxs
      );
      const meta = re.template_transaction_id
        ? templateMeta.get(re.template_transaction_id)
        : undefined;
      const dUntil =
        re.recurrence === "monthly" && re.expected_day_of_month != null
          ? daysUntilDom(re.expected_day_of_month, now)
          : null;

      let status: HubSpendingItem["status"];
      if (paused) status = "paused";
      else if (hit) status = "hit";
      else if (
        isCurrentMonth &&
        re.recurrence === "monthly" &&
        re.expected_day_of_month != null &&
        dUntil != null &&
        dUntil < -5
      ) {
        status = "overdue";
      } else status = "upcoming";

      return {
        kind: "spending",
        re,
        templateSource: meta?.source ?? (re.source === "splitwise" ? "split" : null),
        accountLabel: meta?.accountName ?? null,
        splitGroupName: meta?.groupName ?? null,
        hitThisMonth: hit,
        hitDate,
        daysUntil: dUntil,
        status,
      };
    });
}

export function upcomingWithinDays(
  items: HubSpendingItem[],
  days: number,
  now: Date = new Date()
): HubSpendingItem[] {
  if (days <= 0) return [];
  return items.filter((it) => {
    if (it.kind !== "spending") return false;
    if (it.hitThisMonth || it.status === "paused") return false;
    if (it.daysUntil == null) return false;
    return it.daysUntil >= 0 && it.daysUntil <= days;
  });
}

export function summarizeHub(args: {
  spendingRecurring: SpendingRecurringHubRow[];
  goalRows: GoalHubRow[];
  monthlyIncome: number;
  now?: Date;
}): {
  fixedMonthly: number;
  goalsMonthly: number;
  totalLocked: number;
  pctLocked: number | null;
  variableRoomMonthly: number | null;
  variablePerDay: number | null;
  daysLeftInMonth: number;
  warnFixedHeavy: boolean;
} {
  const now = args.now ?? new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const lastDom = new Date(y, m + 1, 0).getDate();
  const daysLeftInMonth = Math.max(1, lastDom - now.getDate() + 1);

  const nowStr = todayStr(now);
  const fixedMonthly = (args.spendingRecurring || [])
    .filter((r) => r.is_active && !isPauseActive(r, nowStr))
    .reduce(
      (s, r) =>
        s +
        monthlyEquivalent(
          Number(r.expected_amount),
          r.frequency || "monthly"
        ),
      0
    );

  const goalsMonthly = (args.goalRows || []).reduce(
    (s, g) => s + Number(g.monthly_target),
    0
  );

  const income = args.monthlyIncome;
  const totalLocked = fixedMonthly + goalsMonthly;
  const pctLocked =
    income > 0 ? Math.round((totalLocked / income) * 100) : null;
  const variableRoomMonthly = income > 0 ? Math.max(0, income - totalLocked) : null;
  const variablePerDay =
    variableRoomMonthly != null
      ? variableRoomMonthly / daysLeftInMonth
      : null;

  const warnFixedHeavy = income > 0 && totalLocked / income >= 0.8;

  return {
    fixedMonthly,
    goalsMonthly,
    totalLocked,
    pctLocked,
    variableRoomMonthly,
    variablePerDay,
    daysLeftInMonth,
    warnFixedHeavy,
  };
}
