import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import Groq from "groq-sdk";

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
- If you can't answer from their data, say so honestly`;

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
      { data: budgets },
      { data: goals },
      { data: remittances },
      { data: splitGroups },
    ] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", user.id).single(),
      supabase.from("accounts").select("*"),
      supabase.from("transactions").select("*").gte("date", monthStart).order("date", { ascending: false }).limit(50),
      supabase.from("budgets").select("*"),
      supabase.from("savings_goals").select("*"),
      supabase.from("remittances").select("*").gte("date", monthStart),
      supabase.from("split_groups").select("*, split_members(*)"),
    ]);

    const totalExpenses = (transactions || [])
      .filter((t: any) => t.type === "expense")
      .reduce((s: number, t: any) => s + t.amount, 0);
    const totalIncome = (transactions || [])
      .filter((t: any) => t.type === "income")
      .reduce((s: number, t: any) => s + t.amount, 0);

    const budgetSummary = (budgets || []).map((b: any) => {
      const spent = (transactions || [])
        .filter((t: any) => t.type === "expense" && t.category === b.category)
        .reduce((s: number, t: any) => s + t.amount, 0);
      return `${b.category}: spent ${spent}/${b.monthly_limit} ${b.currency}`;
    }).join("; ");

    const goalSummary = (goals || []).map((g: any) =>
      `${g.name}: ${g.current_balance}/${g.target_amount} ${g.currency} (${g.is_completed ? "completed" : "in progress"})`
    ).join("; ");

    const remittanceSummary = (remittances || []).length > 0
      ? `Sent ${remittances!.length} transfers this month totaling ${remittances!.reduce((s: number, r: any) => s + r.amount_sent, 0)} ${remittances![0]?.from_currency}`
      : "No remittances this month";

    const context = `User: ${profile?.display_name || "User"}, primary currency: ${profile?.primary_currency || "USD"}
Accounts: ${(accounts || []).map((a: any) => `${a.name} (${a.currency}): ${a.initial_balance}`).join(", ") || "None"}
This month: Income ${totalIncome}, Expenses ${totalExpenses}
Budgets: ${budgetSummary || "None set"}
Goals: ${goalSummary || "None"}
Remittances: ${remittanceSummary}
Split groups: ${(splitGroups || []).length} active`;

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
