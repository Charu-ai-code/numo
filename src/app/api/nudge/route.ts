import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import Groq from "groq-sdk";
import {
  aggregateExpenseByCategory,
  computeBudgetProgress,
  computeDailyBudgetNumber,
  plannedVersusIncome,
  totalGoalsProgressThisMonth,
  totalMonthlyGoalTargets,
  formatGoalsMonthlyForCoach,
  formatMonthlyPlanCoachLine,
  unbudgetedSpending,
  observationDayCount,
  isBudgetEligibleExpense,
  type ExpenseRow,
  type GoalContributionRow,
  type RemittanceRow,
  type GoalNamedRow,
} from "@/lib/budget-engine";
import { buildCoachAccountContext } from "@/lib/account-ledger";
import { nextMonthStart } from "@/lib/monthly-planner";
import {
  overdueRecurringForNudge,
  type RecurringExpenseRow,
} from "@/lib/recurring-expense-status";

export const dynamic = "force-dynamic";

const NUDGE_PROMPT = `Given this user's financial data for the current month, generate exactly ONE short, friendly insight (max 2 sentences). Be specific with numbers. Pick the most actionable or interesting observation. Mention budget mode if observing/suggested/active. Split+personal spending counts toward the same category budgets. Credit card payments are transfers between accounts, not expenses — do not treat them as overspending. Reference unbudgeted totals, daily allowance, goal/remittance progress, net worth, or credit utilization when relevant. Do NOT be generic. Do NOT say "keep it up" without specifics.`;

export async function GET() {
  try {
    const supabase = createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: existing } = await supabase
      .from("ai_nudges")
      .select("*")
      .eq("user_id", user.id)
      .order("generated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existing) {
      const age = Date.now() - new Date(existing.generated_at).getTime();
      if (age < 24 * 60 * 60 * 1000) {
        return NextResponse.json({ nudge: existing.content, cached: true });
      }
    }

    const now = new Date();
    const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;

    const monthEndExcl = nextMonthStart(monthStart);

    const [
      { data: profile },
      { data: accounts },
      { data: transactions },
      { data: ledgerTransactions },
      { data: budgets },
      { data: goals },
      { data: remittances },
      { data: goalContributions },
      { data: recurringExpensesNudge },
    ] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", user.id).single(),
      supabase.from("accounts").select("*"),
      supabase.from("transactions").select("*").gte("date", monthStart),
      supabase
        .from("transactions")
        .select("account_id, type, amount, date, created_at")
        .order("date", { ascending: true }),
      supabase.from("budgets").select("*"),
      supabase.from("savings_goals").select("*"),
      supabase.from("remittances").select("*").gte("date", monthStart),
      supabase.from("goal_contributions").select("goal_id, amount, date").gte("date", monthStart),
      supabase
        .from("recurring_expenses")
        .select(
          "id, category, label, recurrence, expected_day_of_month, expected_amount, currency"
        )
        .eq("user_id", user.id)
        .eq("is_active", true),
    ]);

    const { netWorthLine, accountsDetail } = buildCoachAccountContext(
      accounts || [],
      ledgerTransactions || [],
      now
    );

    const totalExpenses = (transactions || [])
      .filter((t: any) => t.type === "expense")
      .reduce((s: number, t: any) => s + t.amount, 0);
    const totalIncome = (transactions || [])
      .filter((t: any) => t.type === "income")
      .reduce((s: number, t: any) => s + t.amount, 0);

    const expenseRows: ExpenseRow[] = (transactions || [])
      .filter(
        (t: any) =>
          t.type === "expense" &&
          t.category !== "internal_transfer" &&
          isBudgetEligibleExpense(t.category)
      )
      .map((t: any) => ({
        amount: Number(t.amount),
        category: t.category,
        currency: t.currency,
        type: "expense" as const,
        source: (t.source as "manual" | "split") || "manual",
      }));
    const byCat = aggregateExpenseByCategory(expenseRows);
    const budgetRows = (budgets || []).map((b: any) => ({
      id: b.id,
      category: b.category,
      monthly_limit: Number(b.monthly_limit),
      currency: b.currency,
    }));
    const progress = computeBudgetProgress(budgetRows, byCat);
    const budgetedCategories = new Set(budgetRows.map((b) => b.category));
    const unbudgeted = unbudgetedSpending(byCat, budgetedCategories);
    const daily = computeDailyBudgetNumber(budgetRows, byCat);
    const atRisk = progress.find((b) => b.pct >= 80);
    const goalProg = totalGoalsProgressThisMonth(
      goals || [],
      goalContributions || [],
      remittances || [],
      monthStart
    );
    const goalTargetsSum = totalMonthlyGoalTargets(goals || []);
    const totalBudgetLimitsNudge = (budgets || []).reduce(
      (s: number, b: any) => s + Number(b.monthly_limit),
      0
    );
    const planned = plannedVersusIncome(
      totalBudgetLimitsNudge,
      goalTargetsSum,
      profile?.monthly_income
    );
    const gcNudge: GoalContributionRow[] = (goalContributions || []).map(
      (c: any) => ({
        goal_id: c.goal_id,
        amount: Number(c.amount),
        date: c.date,
      })
    );
    const rmNudge: RemittanceRow[] = (remittances || []).map((r: any) => ({
      goal_id: r.goal_id ?? null,
      amount_sent: Number(r.amount_sent),
      date: r.date,
      from_currency: r.from_currency,
    }));
    const goalsNamed: GoalNamedRow[] = (goals || []).map((g: any) => ({
      id: g.id,
      name: g.name,
      goal_type: g.goal_type,
      monthly_target: g.monthly_target,
      is_recurring: g.is_recurring,
      current_balance: g.current_balance,
      target_amount: g.target_amount,
      currency: g.currency,
    }));
    const goalsMonthlyNudge = formatGoalsMonthlyForCoach(
      goalsNamed,
      gcNudge,
      rmNudge,
      monthStart
    );
    const recurringGoalCount = (goals || []).filter(
      (g: any) => g.is_recurring && g.monthly_target && Number(g.monthly_target) > 0
    ).length;
    const monthlyPlanNudge = formatMonthlyPlanCoachLine(
      planned.income,
      totalBudgetLimitsNudge,
      goalTargetsSum,
      budgetRows.length,
      recurringGoalCount
    );
    const obsDays =
      profile?.budget_observation_started_at
        ? observationDayCount(new Date(profile.budget_observation_started_at))
        : null;

    const overdueRecurring = overdueRecurringForNudge(
      (recurringExpensesNudge || []) as RecurringExpenseRow[],
      monthStart,
      monthEndExcl,
      (transactions || []).map((t: any) => ({
        recurring_expense_id: t.recurring_expense_id ?? null,
        date: t.date,
        amount: Number(t.amount),
        note: t.note,
        source: t.source,
      })),
      now
    );

    const structured = {
      budget_mode: profile?.budget_mode ?? null,
      observation_days: obsDays,
      monthly_income: profile?.monthly_income ?? null,
      planned_monthly_remittance: profile?.planned_monthly_remittance ?? null,
      planned_vs_income: planned,
      daily_budget: {
        per_day: daily.perDay,
        days_left: daily.daysLeft,
        remaining: daily.remaining,
      },
      unbudgeted_total: unbudgeted.total,
      unbudgeted_top: unbudgeted.byCategory.slice(0, 4),
      goals_recurring_month: goalProg,
      remittances_count: (remittances || []).length,
      recurring_overdue: overdueRecurring,
    };

    const recurringLateLine =
      overdueRecurring.length > 0
        ? ` Recurring bills that usually land by a set day still have not appeared this month (after a short grace): ${overdueRecurring
            .map(
              (o) =>
                `${o.label} (~day ${o.expected_day}, category ${o.category})`
            )
            .join("; ")}.`
        : "";

    const context = `Budget mode: ${profile?.budget_mode || "unknown"}${obsDays != null ? `, observation day ${obsDays}/30` : ""}.
Stated monthly income: ${profile?.monthly_income ?? "n/a"}. Planned monthly remittance setting: ${profile?.planned_monthly_remittance ?? "n/a"}.
Planned vs income: ${planned.isOver ? "OVER" : "OK"} (planned ${planned.totalPlanned.toFixed(0)} vs income ${planned.income.toFixed(0)}).
Net worth (by currency): ${netWorthLine}. Accounts detail: ${accountsDetail || "none"}.
Transaction income this month: ${totalIncome}. Expenses this month: ${totalExpenses} (transfers excluded).
Budget categories: ${progress.map((b) => `${b.category} ${Math.round(b.pct)}% (split ${b.spentSplit.toFixed(0)} / personal ${b.spentPersonal.toFixed(0)})`).join(", ") || "none"}.
${atRisk ? `Heads up: ${atRisk.category} at ${Math.round(atRisk.pct)}%.` : ""}
Daily allowance (budget categories): ${daily.perDay.toFixed(2)}/day, ${daily.daysLeft} days left.
Unbudgeted spending: ${unbudgeted.total.toFixed(0)} (${unbudgeted.byCategory.slice(0, 3).map((x) => `${x.category}:${x.amount.toFixed(0)}`).join(", ") || "none"}).
Recurring goals this month: ${goalProg.contributed.toFixed(0)}/${goalProg.target.toFixed(0)}.
GOALS (monthly): ${goalsMonthlyNudge}
MONTHLY PLAN: ${monthlyPlanNudge}
Goals overall: ${(goals || []).map((g: any) => {
      const cap = g.target_amount != null && g.target_amount > 0;
      const pct = cap ? Math.round((g.current_balance / g.target_amount) * 100) : null;
      return `${g.name} (${g.goal_type || "custom"}) ${pct != null ? pct + "%" : "no cap"}`;
    }).join(", ") || "None"}.
Remittances logged this month: ${(remittances || []).length}.${recurringLateLine}

JSON: ${JSON.stringify(structured)}`;

    const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
    const completion = await groq.chat.completions.create({
      messages: [
        { role: "system", content: NUDGE_PROMPT },
        { role: "user", content: context },
      ],
      model: "llama-3.3-70b-versatile",
      temperature: 0.8,
      max_tokens: 150,
    });

    const content = completion.choices[0]?.message?.content || "Keep tracking your spending — every number tells a story!";

    await supabase.from("ai_nudges").insert({ user_id: user.id, content });

    return NextResponse.json({ nudge: content, cached: false });
  } catch (err: any) {
    console.error("Nudge API error:", err);
    return NextResponse.json({ error: "Failed to generate nudge" }, { status: 500 });
  }
}
