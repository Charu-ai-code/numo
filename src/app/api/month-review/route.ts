import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import Groq from "groq-sdk";
import {
  aggregateExpenseByCategory,
  isBudgetEligibleExpense,
  type ExpenseRow,
} from "@/lib/budget-engine";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const supabase = createServerSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const monthParam = searchParams.get("month");
    const now = new Date();
    let y = now.getFullYear();
    let m = now.getMonth();
    if (monthParam && /^\d{4}-\d{2}$/.test(monthParam)) {
      const [yy, mm] = monthParam.split("-").map(Number);
      y = yy;
      m = mm - 1;
    } else {
      m = m - 1;
      if (m < 0) {
        m = 11;
        y -= 1;
      }
    }

    const monthStart = `${y}-${String(m + 1).padStart(2, "0")}-01`;
    const monthEnd = new Date(y, m + 1, 0).toISOString().slice(0, 10);

    const [
      { data: profile },
      { data: budgets },
      { data: transactions },
      { data: goals },
    ] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", user.id).single(),
      supabase.from("budgets").select("*"),
      supabase
        .from("transactions")
        .select("*")
        .gte("date", monthStart)
        .lte("date", monthEnd),
      supabase.from("savings_goals").select("*"),
    ]);

    const expenses: ExpenseRow[] = (transactions || [])
      .filter((t: any) => t.type === "expense" && isBudgetEligibleExpense(t.category))
      .map((t: any) => ({
        amount: Number(t.amount),
        category: t.category,
        currency: t.currency,
        type: "expense" as const,
        source: (t.source as "manual" | "split") || "manual",
      }));

    const byCat = aggregateExpenseByCategory(expenses);
    const budgetLines = (budgets || []).map((b: any) => {
      const s = byCat.get(b.category);
      const spent = s?.spentTotal ?? 0;
      return `${b.category}: budget ${b.monthly_limit}, spent ${spent}`;
    });

    const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
    const completion = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      temperature: 0.5,
      max_tokens: 1200,
      messages: [
        {
          role: "system",
          content:
            "Write a concise month-end review: spending vs budgets, wins, over-budget categories with split vs personal insight, goals line if any, and one actionable suggestion. Use markdown sections. Warm tone.",
        },
        {
          role: "user",
          content: `Month: ${monthStart.slice(0, 7)}. User: ${profile?.display_name || "User"}. Income (stated): ${profile?.monthly_income ?? "unknown"}.
Budgets: ${budgetLines.join("; ") || "None"}
Category totals: ${JSON.stringify(Array.from(byCat.values()))}
Goals: ${(goals || []).map((g: any) => `${g.name} ${g.current_balance}/${g.target_amount}`).join("; ") || "None"}`,
        },
      ],
    });

    const review =
      completion.choices[0]?.message?.content ||
      "Could not generate review.";

    return NextResponse.json({ month: monthStart.slice(0, 7), review });
  } catch (err: any) {
    console.error("month-review:", err);
    return NextResponse.json({ error: err.message || "Failed" }, { status: 500 });
  }
}
