import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import Groq from "groq-sdk";

export const dynamic = "force-dynamic";

const NUDGE_PROMPT = `Given this user's financial data for the current month, generate exactly ONE short, friendly insight (max 2 sentences). Be specific with numbers. Pick the most actionable or interesting observation. Do NOT be generic. Do NOT say "keep it up" without specifics.`;

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

    const [
      { data: accounts },
      { data: transactions },
      { data: budgets },
      { data: goals },
      { data: remittances },
    ] = await Promise.all([
      supabase.from("accounts").select("*"),
      supabase.from("transactions").select("*").gte("date", monthStart),
      supabase.from("budgets").select("*"),
      supabase.from("savings_goals").select("*"),
      supabase.from("remittances").select("*").gte("date", monthStart),
    ]);

    const totalExpenses = (transactions || [])
      .filter((t: any) => t.type === "expense")
      .reduce((s: number, t: any) => s + t.amount, 0);
    const totalIncome = (transactions || [])
      .filter((t: any) => t.type === "income")
      .reduce((s: number, t: any) => s + t.amount, 0);

    const context = `Accounts: ${(accounts || []).length}. Income: ${totalIncome}. Expenses: ${totalExpenses}. Budgets: ${(budgets || []).length} set. Goals: ${(goals || []).map((g: any) => `${g.name} ${Math.round((g.current_balance / g.target_amount) * 100)}%`).join(", ") || "None"}. Remittances this month: ${(remittances || []).length}.`;

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
