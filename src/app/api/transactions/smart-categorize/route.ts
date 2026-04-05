import { NextResponse } from "next/server";
import Groq from "groq-sdk";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  keywordFromNote,
  normalizeNoteForKeyword,
  isUnmappedCategory,
} from "@/lib/smart-categorize";
import { EXPENSE_CATEGORIES, INCOME_CATEGORIES } from "@/lib/constants";
import {
  INTERNAL_TRANSFER_CATEGORY,
  isTransferType,
} from "@/lib/account-ledger";

export const dynamic = "force-dynamic";

function extractJsonObject(text: string): Record<string, unknown> | null {
  const trimmed = text.trim();
  const codeBlock = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = codeBlock ? codeBlock[1].trim() : trimmed;
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(raw.slice(start, end + 1)) as Record<string, unknown>;
      } catch {
        return null;
      }
    }
    return null;
  }
}

export async function POST() {
  try {
    const supabase = createServerSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "GROQ_API_KEY is not configured" },
        { status: 503 }
      );
    }

    const [{ data: txs }, { data: customCats }, { data: mappings }] =
      await Promise.all([
        supabase
          .from("transactions")
          .select("id, type, category, note")
          .eq("user_id", user.id),
        supabase.from("custom_categories").select("slug, name, type"),
        supabase.from("category_mappings").select("keyword, category"),
      ]);

    const customSlugs = new Set((customCats || []).map((c: any) => c.slug));
    const expenseSlugs = new Set([
      ...EXPENSE_CATEGORIES.map((c) => c.value),
      ...(customCats || [])
        .filter((c: any) => c.type === "expense")
        .map((c: any) => c.slug),
    ]);
    const incomeSlugs = new Set([
      ...INCOME_CATEGORIES.map((c) => c.value),
      ...(customCats || [])
        .filter((c: any) => c.type === "income")
        .map((c: any) => c.slug),
    ]);

    const trainingLines: string[] = [];
    for (const m of mappings || []) {
      const row = m as any;
      trainingLines.push(`- "${row.keyword}" → ${row.category}`);
    }

    const seenTrain = new Set(
      (mappings || []).map((m: any) =>
        String(m.keyword).toLowerCase().trim()
      )
    );
    for (const t of txs || []) {
      const tx = t as any;
      if (isTransferType(tx.type)) continue;
      if (tx.category === INTERNAL_TRANSFER_CATEGORY) continue;
      const kw = keywordFromNote(tx.note);
      if (!kw) continue;
      if (tx.type === "expense" && tx.category === "other_expense") continue;
      if (tx.type === "income" && tx.category === "other_income") continue;
      if (!kw || seenTrain.has(kw)) continue;
      seenTrain.add(kw);
      trainingLines.push(`- "${normalizeNoteForKeyword(tx.note)}" → ${tx.category}`);
    }

    const targets: {
      id: string;
      type: string;
      note: string | null;
      category: string;
    }[] = [];
    for (const t of txs || []) {
      const tx = t as any;
      if (isTransferType(tx.type)) continue;
      if (tx.category === INTERNAL_TRANSFER_CATEGORY) continue;
      if (!isUnmappedCategory(tx.type, tx.category, customSlugs)) continue;
      const note = tx.note || "";
      if (!note.trim()) continue;
      targets.push({
        id: tx.id,
        type: tx.type,
        note: tx.note,
        category: tx.category,
      });
    }

    if (targets.length === 0) {
      return NextResponse.json({
        success: true,
        updated: 0,
        changes: [],
        undo: [],
        message: "No transactions need categorizing.",
      });
    }

    const MAX_BATCH = 45;
    const targetsBatch = targets.slice(0, MAX_BATCH);
    const truncatedTotal = targets.length > MAX_BATCH;

    if (trainingLines.length === 0) {
      return NextResponse.json(
        {
          error:
            "No training examples yet. Categorize a few transactions manually or add category rules first.",
        },
        { status: 400 }
      );
    }

    const allowedSlugsList = [
      ...Array.from(expenseSlugs),
      ...Array.from(incomeSlugs),
    ].filter((s, i, a) => a.indexOf(s) === i);

    const customLabels = (customCats || [])
      .map((c: any) => `${c.slug} (${c.name}, ${c.type})`)
      .join(", ");

    const prompt = `The user has categorized their transactions like this:
${trainingLines.slice(0, 80).join("\n")}

Now categorize these remaining transactions using the same logic and style. Prefer custom categories when they clearly fit the merchant or description.

Allowed category slugs (you MUST use these exact slug strings):
Built-in expense: ${EXPENSE_CATEGORIES.map((c) => c.value).join(", ")}
Built-in income: ${INCOME_CATEGORIES.map((c) => c.value).join(", ")}
Custom: ${customLabels || "(none)"}

Full allowed slug list: ${allowedSlugsList.join(", ")}

Transactions to categorize (JSON array)${truncatedTotal ? ` — showing first ${MAX_BATCH} of ${targets.length}` : ""}:
${JSON.stringify(
      targetsBatch.map((t) => ({
        transaction_id: t.id,
        type: t.type,
        note: t.note,
      })),
      null,
      2
    )}

Respond with ONLY valid JSON (no markdown fences) in this exact shape:
{"assignments":[{"transaction_id":"<uuid>","category":"<slug>"}]}

Each transaction_id must appear exactly once. Use only allowed slugs for category.`;

    const groq = new Groq({ apiKey });
    const completion = await groq.chat.completions.create({
      messages: [
        {
          role: "system",
          content:
            "You output only valid JSON. No markdown, no explanation. Category slugs must match the allowed list exactly.",
        },
        { role: "user", content: prompt },
      ],
      model: "llama-3.3-70b-versatile",
      temperature: 0.2,
      max_tokens: 4000,
    });

    const text = completion.choices[0]?.message?.content || "";
    const parsed = extractJsonObject(text);
    const assignments = (parsed?.assignments as Array<{
      transaction_id?: string;
      category?: string;
    }>) || [];

    const undo: { id: string; category: string }[] = [];
    const changes: {
      id: string;
      note: string;
      from: string;
      to: string;
    }[] = [];
    let updated = 0;

    const targetById = new Map(targetsBatch.map((t) => [t.id, t]));

    for (const a of assignments) {
      const id = a.transaction_id;
      const cat = a.category?.trim();
      if (!id || !cat) continue;
      const row = targetById.get(id);
      if (!row) continue;

      const allowed =
        row.type === "expense" ? expenseSlugs : incomeSlugs;
      if (!allowed.has(cat)) continue;

      undo.push({ id, category: row.category });
      const { error } = await supabase
        .from("transactions")
        .update({ category: cat })
        .eq("id", id)
        .eq("user_id", user.id);

      if (!error) {
        updated++;
        changes.push({
          id,
          note: row.note || "",
          from: row.category,
          to: cat,
        });
        const kw = keywordFromNote(row.note);
        if (kw) {
          await supabase.from("category_mappings").upsert(
            {
              user_id: user.id,
              keyword: kw,
              category: cat,
            },
            { onConflict: "user_id,keyword" }
          );
        }
      }
    }

    return NextResponse.json({
      success: true,
      updated,
      changes,
      undo,
      truncated: truncatedTotal,
      message:
        updated > 0
          ? `Updated ${updated} transaction${updated === 1 ? "" : "s"}.${truncatedTotal ? " Run again to categorize more." : ""}`
          : "No changes applied.",
    });
  } catch (err: any) {
    console.error("smart-categorize error:", err);
    return NextResponse.json(
      { error: err.message || "Smart categorize failed" },
      { status: 500 }
    );
  }
}
