import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import Groq from "groq-sdk";
import {
  aggregateExpenseByCategory,
  computeBudgetProgress,
  computeDailyBudgetNumber,
  plannedVersusIncome,
  totalMonthlyGoalTargets,
  totalGoalsProgressThisMonth,
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
import { monthlyEquivalent } from "@/lib/recurring-hub";

export const dynamic = "force-dynamic";

const SYSTEM_PROMPT = `You are Numo, a friendly AI budgeting coach. You talk like a smart friend who happens to be great with money — warm, encouraging, zero jargon. The user is a young professional who may manage money in both Indian Rupees (INR) and US Dollars (USD).

Rules:
- Never use terms like "asset allocation," "amortization," or "fiscal"
- If the user overspent, don't shame them. Be curious: "Looks like food was higher this week — anything special going on?"
- Always reference their actual numbers when possible
- Keep responses short (2-4 sentences) unless they ask for detail
- Use ₹ and $ symbols naturally based on context
- Celebrate small wins: "You stayed under budget on transport!"
- When discussing remittances, be sensitive — this is family money
- When discussing split debts, be factual and neutral
- Spending budgets include BOTH personal transactions and Splitwise shares in the same category
- Goals (savings, send home, invest) are separate from monthly spending budgets
- Send Home progress uses remittances linked to that goal; other recurring goals use contributions
- Unbudgeted spending = money in categories with no budget row this month
- If you can't answer from their data, say so honestly
- Credit card payments are recorded as account transfers (e.g. from bank to card), not as expenses; transfers do not affect spending budgets or “Money Out” summaries
- Recurring/fixed expenses (bills, subscriptions, Splitwise shares users marked recurring) appear in their data as recurring_expenses; you can answer “what are my fixed costs?”, “what’s due this week?”, “how much income is locked?”, and suggest canceling or negotiating lowest-value subscriptions when helpful
- Goal monthly targets are separate savings commitments but are part of “total locked” vs income in the recurring hub summary`;

export async function POST(request: Request) {
  try {
    const { message } = await request.json();
    if (!message) {
      return NextResponse.json({ error: "Message required" }, { status: 400 });
    }

    const supabase = createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const now = new Date();
    const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;

    const [
      { data: profile },
      { data: accounts },
      { data: transactions },
      { data: ledgerTransactions },
      { data: budgets },
      { data: goals },
      { data: remittances },
      { data: splitGroups },
      { data: customCats },
      { data: goalContributions },
      { data: recurringExpensesCoach },
    ] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", user.id).single(),
      supabase.from("accounts").select("*"),
      supabase.from("transactions").select("*").gte("date", monthStart).order("date", { ascending: false }).limit(80),
      supabase
        .from("transactions")
        .select("account_id, type, amount, date, created_at")
        .order("date", { ascending: true }),
      supabase.from("budgets").select("*"),
      supabase.from("savings_goals").select("*"),
      supabase.from("remittances").select("*").gte("date", monthStart),
      supabase.from("split_groups").select("*, split_members(*)"),
      supabase.from("custom_categories").select("slug, name"),
      supabase.from("goal_contributions").select("goal_id, amount, date").gte("date", monthStart),
      supabase
        .from("recurring_expenses")
        .select(
          "label, expected_amount, currency, category, frequency, recurrence, expected_day_of_month, source, is_paused, paused_until"
        )
        .eq("user_id", user.id)
        .eq("is_active", true),
    ]);

    const { netWorthLine, accountsDetail } = buildCoachAccountContext(
      accounts || [],
      ledgerTransactions || [],
      now
    );

    const catNameMap = new Map<string, string>();
    (customCats || []).forEach((c: any) => catNameMap.set(c.slug, c.name));

    const totalExpenses = (transactions || [])
      .filter((t: any) => t.type === "expense")
      .reduce((s: number, t: any) => s + t.amount, 0);
    const totalIncome = (transactions || [])
      .filter((t: any) => t.type === "income")
      .reduce((s: number, t: any) => s + t.amount, 0);

    const resolveCatName = (slug: string) => catNameMap.get(slug) || slug;

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
    const budgetSummary = progress
      .map((b) => {
        const split = b.spentSplit.toFixed(0);
        const pers = b.spentPersonal.toFixed(0);
        return `${resolveCatName(b.category)}: ${b.spent.toFixed(0)}/${b.monthly_limit} ${b.currency} (split ${split} + personal ${pers})`;
      })
      .join("; ");

    const goalMonthly = totalGoalsProgressThisMonth(
      goals || [],
      goalContributions || [],
      remittances || [],
      monthStart
    );
    const goalTargetsSum = totalMonthlyGoalTargets(goals || []);
    const planned = plannedVersusIncome(
      (budgets || []).reduce((s: number, b: any) => s + Number(b.monthly_limit), 0),
      goalTargetsSum,
      profile?.monthly_income
    );

    const goalSummary = (goals || [])
      .map((g: any) =>
        `${g.name} (${g.goal_type || "custom"}): ${g.current_balance}/${g.target_amount ?? "n/a"} ${g.currency}; monthly target ${g.monthly_target ?? "n/a"}; recurring ${g.is_recurring ? "yes" : "no"}`
      )
      .join("; ");

    const totalBudgetLimitsCoach = (budgets || []).reduce(
      (s: number, b: any) => s + Number(b.monthly_limit),
      0
    );
    const gcCoach: GoalContributionRow[] = (goalContributions || []).map(
      (c: any) => ({
        goal_id: c.goal_id,
        amount: Number(c.amount),
        date: c.date,
      })
    );
    const rmCoach: RemittanceRow[] = (remittances || []).map((r: any) => ({
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
    const goalsMonthlyCoach = formatGoalsMonthlyForCoach(
      goalsNamed,
      gcCoach,
      rmCoach,
      monthStart
    );
    const recurringGoalCount = (goals || []).filter(
      (g: any) => g.is_recurring && g.monthly_target && Number(g.monthly_target) > 0
    ).length;
    const monthlyPlanCoachLine = formatMonthlyPlanCoachLine(
      planned.income,
      totalBudgetLimitsCoach,
      goalTargetsSum,
      budgetRows.length,
      recurringGoalCount
    );

    const obsDays =
      profile?.budget_observation_started_at
        ? observationDayCount(new Date(profile.budget_observation_started_at))
        : null;

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
        total_limits: daily.totalLimits,
        spent_in_budget_categories: daily.spentInBudgetCategories,
      },
      unbudgeted: {
        total: unbudgeted.total,
        top_categories: unbudgeted.byCategory.slice(0, 6),
      },
      goals_recurring_month: goalMonthly,
      goal_types: (goals || []).map((g: any) => ({
        name: g.name,
        goal_type: g.goal_type ?? "custom",
        monthly_target: g.monthly_target,
        is_recurring: !!g.is_recurring,
      })),
    };

    const remittanceSummary = (remittances || []).length > 0
      ? `Sent ${remittances!.length} transfers this month totaling ${remittances!.reduce((s: number, r: any) => s + r.amount_sent, 0)} ${remittances![0]?.from_currency}`
      : "No remittances this month";

    // Build per-category spending for richer context
    const catSpending: Record<string, number> = {};
    (transactions || [])
      .filter(
        (t: any) =>
          t.type === "expense" && t.category !== "internal_transfer"
      )
      .forEach((t: any) => {
        const name = resolveCatName(t.category);
        catSpending[name] = (catSpending[name] || 0) + t.amount;
      });
    const topSpending = Object.entries(catSpending)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 8)
      .map(([cat, amt]) => `${cat}: ${amt}`)
      .join(", ");

    const customCatNames = (customCats || []).map((c: any) => c.name);

    const nowCoach = new Date();
    const todayCoach = nowCoach.toISOString().slice(0, 10);
    const recurringActive = (recurringExpensesCoach || []).filter((r: any) => {
      if (r.is_paused && r.paused_until && todayCoach < r.paused_until) return false;
      return true;
    });
    const recurringMonthlyTotal = recurringActive.reduce(
      (s: number, r: any) =>
        s +
        monthlyEquivalent(
          Number(r.expected_amount),
          r.frequency || "monthly"
        ),
      0
    );
    const recurringSummary =
      recurringActive.length > 0
        ? recurringActive
            .map(
              (r: any) =>
                `${r.label}: ~${Number(r.expected_amount).toFixed(0)} ${r.currency}/${
                  r.frequency || "monthly"
                } (category ${r.category}, day ~${r.expected_day_of_month ?? "?"}, source ${r.source})`
            )
            .join("; ")
        : "none tracked";
    const lockedVsIncome =
      profile?.monthly_income && Number(profile.monthly_income) > 0
        ? `Recurring bills ~${recurringMonthlyTotal.toFixed(0)} + goal targets ${goalTargetsSum.toFixed(0)} vs income ${Number(profile.monthly_income).toFixed(0)}`
        : `Recurring bills ~${recurringMonthlyTotal.toFixed(0)} (income not set)`;

    const context = `User: ${profile?.display_name || "User"}, primary currency: ${profile?.primary_currency || "USD"}
Budget mode: ${profile?.budget_mode || "unknown"}${obsDays != null ? ` (observation day ${obsDays} of ~30)` : ""}
Stated monthly income: ${profile?.monthly_income ?? "not set"}
Planned monthly remittance (user setting): ${profile?.planned_monthly_remittance ?? "not set"}
Planned vs income: total budgets+recurring goal targets ${planned.totalPlanned.toFixed(0)} vs income ${planned.income.toFixed(0)} — ${planned.isOver ? "OVER (needs trim or more income)" : "OK"}
Daily allowance (budget categories only): ${daily.perDay.toFixed(2)} per day, ${daily.daysLeft} days left, ${daily.remaining.toFixed(0)} remaining of ${daily.totalLimits.toFixed(0)} limits
Unbudgeted spending (categories with no budget): ${unbudgeted.total.toFixed(0)} — top: ${unbudgeted.byCategory.slice(0, 4).map((x) => `${x.category}:${x.amount.toFixed(0)}`).join(", ") || "none"}
Goals this month (recurring): contributed ${goalMonthly.contributed.toFixed(0)} / target ${goalMonthly.target.toFixed(0)}
GOALS (monthly detail): ${goalsMonthlyCoach}
MONTHLY PLAN: ${monthlyPlanCoachLine}
Net worth (assets minus credit card owed, by currency): ${netWorthLine}
Accounts (running balance / owed, limits, utilization, due dates): ${accountsDetail || "None"}
This month: Income ${totalIncome}, Expenses ${totalExpenses} (transfers excluded)
Top spending categories: ${topSpending || "None"}
Budgets (split+personal combined per category): ${budgetSummary || "None set"}
Goals detail: ${goalSummary || "None"}
Remittances: ${remittanceSummary}
Split groups: ${(splitGroups || []).length} active
Custom categories: ${customCatNames.length > 0 ? customCatNames.join(", ") : "None"}
Recurring/fixed expenses (monthly-equivalent total ~${recurringMonthlyTotal.toFixed(0)}): ${recurringSummary}
Locked picture: ${lockedVsIncome}

Structured JSON (machine summary — prefer narrative above, use for precision):
${JSON.stringify(structured)}`;

    const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
    const chatCompletion = await groq.chat.completions.create({
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "system", content: `Financial context:\n${context}` },
        { role: "user", content: message },
      ],
      model: "llama-3.3-70b-versatile",
      temperature: 0.7,
      max_tokens: 500,
    });

    const reply = chatCompletion.choices[0]?.message?.content || "I couldn't generate a response. Try again?";
    return NextResponse.json({ reply });
  } catch (err: any) {
    console.error("Coach API error:", err);
    return NextResponse.json({ error: "Failed to get response" }, { status: 500 });
  }
}
