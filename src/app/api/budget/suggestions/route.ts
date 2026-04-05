import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import Groq from "groq-sdk";
import {
  aggregateExpenseByCategory,
  isBudgetEligibleExpense,
  type ExpenseRow,
} from "@/lib/budget-engine";

export const dynamic = "force-dynamic";

const SUGGESTION_PROMPT = `You are a budgeting assistant. Given category spending (split vs personal), suggest a realistic monthly budget limit per category and a one-line reasoning. Respond with ONLY valid JSON: array of objects {"category":"slug","suggested_limit":number,"ai_reasoning":"string"}. Use suggested_limit >= actual spent if user is underspending; slightly below or at spent if trimming. Categories use slugs like food, transport, housing.`;

export async function POST() {
  try {
    const supabase = createServerSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("primary_currency, budget_observation_started_at")
      .eq("id", user.id)
      .single();

    const now = new Date();
    const start = new Date(now);
    start.setDate(start.getDate() - 30);
    const fromDate = start.toISOString().slice(0, 10);

    const { data: txns, error: txErr } = await supabase
      .from("transactions")
      .select("amount, category, currency, type, source")
      .eq("type", "expense")
      .gte("date", fromDate)
      .order("date", { ascending: false });

    if (txErr) throw txErr;

    const expenses: ExpenseRow[] = (txns || [])
      .filter((t: any) => isBudgetEligibleExpense(t.category))
      .map((t: any) => ({
        amount: Number(t.amount),
        category: t.category,
        currency: t.currency,
        type: "expense" as const,
        source: (t.source as "manual" | "split") || "manual",
      }));

    const byCat = aggregateExpenseByCategory(expenses);
    if (byCat.size === 0) {
      return NextResponse.json(
        { error: "No eligible spending in the last 30 days to base suggestions on." },
        { status: 400 }
      );
    }

    const rows = Array.from(byCat.values()).map((c) => ({
      category: c.category,
      actual_spent: c.spentTotal,
      split_portion: c.spentSplit,
      personal_portion: c.spentPersonal,
    }));

    const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
    const completion = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      temperature: 0.4,
      max_tokens: 2000,
      messages: [
        { role: "system", content: SUGGESTION_PROMPT },
        {
          role: "user",
          content: `Primary currency: ${profile?.primary_currency || "USD"}. Data:\n${JSON.stringify(rows, null, 2)}`,
        },
      ],
    });

    const raw = completion.choices[0]?.message?.content || "[]";
    let parsed: {
      category: string;
      suggested_limit: number;
      ai_reasoning?: string;
    }[] = [];
    try {
      const jsonMatch = raw.match(/\[[\s\S]*\]/);
      parsed = JSON.parse(jsonMatch ? jsonMatch[0] : raw);
    } catch {
      return NextResponse.json(
        { error: "Could not parse AI response. Try again." },
        { status: 502 }
      );
    }

    if (!Array.isArray(parsed) || parsed.length === 0) {
      return NextResponse.json({ error: "No suggestions generated." }, { status: 502 });
    }

    const monthObserved = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
    const currency = (profile?.primary_currency as "USD" | "INR") || "USD";

    await supabase
      .from("budget_suggestions")
      .delete()
      .eq("user_id", user.id)
      .eq("status", "pending");

    const inserts = parsed
      .filter((p) => p.category && p.suggested_limit > 0)
      .map((p) => {
        const agg = byCat.get(p.category);
        return {
          user_id: user.id,
          category: p.category,
          suggested_limit: Math.round(p.suggested_limit * 100) / 100,
          actual_spent: agg?.spentTotal ?? 0,
          split_portion: agg?.spentSplit ?? 0,
          personal_portion: agg?.spentPersonal ?? 0,
          ai_reasoning: p.ai_reasoning || null,
          status: "pending" as const,
          currency,
          month_observed: monthObserved,
        };
      });

    if (inserts.length === 0) {
      return NextResponse.json({ error: "No valid suggestion rows." }, { status: 400 });
    }

    const { error: insErr } = await supabase.from("budget_suggestions").insert(inserts);
    if (insErr) throw insErr;

    await supabase
      .from("profiles")
      .update({ budget_mode: "suggested" })
      .eq("id", user.id);

    return NextResponse.json({ success: true, count: inserts.length });
  } catch (err: any) {
    console.error("budget suggestions:", err);
    return NextResponse.json({ error: err.message || "Failed" }, { status: 500 });
  }
}
