import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  detectRecurringPatterns,
  type TxDetectInput,
} from "@/lib/detect-recurring";
import { upsertDetectedRecurringRows } from "@/lib/recurring-expense-sync";

export const dynamic = "force-dynamic";

function monthsAgoIso(months: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() - months);
  return d.toISOString().slice(0, 10);
}

export async function POST(req: Request) {
  try {
    const supabase = createServerSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const categoryId = body?.categoryId as string | undefined;
    const apply = Boolean(body?.apply);
    const splitwiseOnly = Boolean(body?.splitwiseOnly);

    const since = monthsAgoIso(3);

    let q = supabase
      .from("transactions")
      .select("id, date, amount, note, category, currency, source")
      .eq("user_id", user.id)
      .eq("type", "expense")
      .gte("date", since)
      .order("date", { ascending: false });

    if (categoryId) q = q.eq("category", categoryId);
    if (splitwiseOnly) q = q.eq("source", "split");

    const { data: rows, error } = await q;
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    const inputs: TxDetectInput[] = (rows || []).map((t: any) => ({
      id: t.id,
      date: t.date,
      amount: Number(t.amount),
      note: t.note,
      category: t.category,
      currency: t.currency,
      source: t.source,
    }));

    let patterns = detectRecurringPatterns(inputs, { sinceDate: since });
    if (splitwiseOnly) {
      patterns = patterns.filter((p) => p.source === "splitwise");
    }

    const applyKeys = body?.applyKeys as string[] | undefined;
    const patternKey = (p: (typeof patterns)[0]) =>
      `${p.category}::${p.note_fingerprint}`;

    let applied = 0;
    if (apply && patterns.length) {
      const keys = applyKeys ?? [];
      const toApply =
        keys.length > 0
          ? patterns.filter((p) => keys.includes(patternKey(p)))
          : patterns;
      if (toApply.length) {
        applied = await upsertDetectedRecurringRows(supabase, user.id, toApply);
      }
    }

    return NextResponse.json({ patterns, applied });
  } catch (err: any) {
    console.error("recurring/detect:", err);
    return NextResponse.json(
      { error: err?.message || "Server error" },
      { status: 500 }
    );
  }
}
