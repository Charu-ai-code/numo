import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const SW_BASE = "https://secure.splitwise.com/api/v3.0";

async function swPost(path: string, token: string, body: Record<string, string | number>) {
  return fetch(`${SW_BASE}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

/**
 * After a split expense is saved in Numo, push it to Splitwise so it appears in the
 * real Splitwise app for the linked group (same group_id as sync).
 */
export async function POST(request: Request) {
  try {
    const supabase = createServerSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let expenseId: string;
    try {
      const json = await request.json();
      expenseId = json.expenseId;
    } catch {
      return NextResponse.json({ error: "expenseId required" }, { status: 400 });
    }

    if (!expenseId || typeof expenseId !== "string") {
      return NextResponse.json({ error: "expenseId required" }, { status: 400 });
    }

    const apiKey = process.env.SPLITWISE_API_KEY;
    const { data: profile } = await supabase
      .from("profiles")
      .select("splitwise_access_token")
      .eq("id", user.id)
      .single();

    const token = profile?.splitwise_access_token || apiKey;
    if (!token) {
      return NextResponse.json(
        { error: "Connect Splitwise in Settings to sync expenses." },
        { status: 400 }
      );
    }

    const { data: expense, error: expErr } = await supabase
      .from("split_expenses")
      .select(
        "id, group_id, description, amount, currency, paid_by, date, splitwise_expense_id"
      )
      .eq("id", expenseId)
      .single();

    if (expErr || !expense) {
      return NextResponse.json({ error: "Expense not found" }, { status: 404 });
    }

    const { data: group, error: groupErr } = await supabase
      .from("split_groups")
      .select("id, user_id, splitwise_group_id")
      .eq("id", expense.group_id)
      .single();

    if (groupErr || !group) {
      return NextResponse.json({ error: "Group not found" }, { status: 404 });
    }

    if (group.user_id !== user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (!group.splitwise_group_id) {
      return NextResponse.json(
        {
          error:
            "This group is only in Numo. Sync from Splitwise or use a group that came from Splitwise to push expenses there.",
        },
        { status: 400 }
      );
    }

    if (expense.splitwise_expense_id) {
      return NextResponse.json({
        ok: true,
        skipped: true,
        splitwise_expense_id: expense.splitwise_expense_id,
      });
    }

    const { data: shares, error: shErr } = await supabase
      .from("split_shares")
      .select("member_id, share_amount")
      .eq("expense_id", expenseId);

    if (shErr || !shares?.length) {
      return NextResponse.json({ error: "No split shares for this expense" }, { status: 400 });
    }

    const { data: members, error: memErr } = await supabase
      .from("split_members")
      .select("id, splitwise_user_id, name")
      .eq("group_id", expense.group_id);

    if (memErr || !members?.length) {
      return NextResponse.json({ error: "Could not load group members" }, { status: 400 });
    }

    const memberById = new Map(members.map((m: any) => [m.id, m]));

    const ordered = [...shares].sort((a: any, b: any) =>
      String(a.member_id).localeCompare(String(b.member_id))
    );

    for (const sh of ordered) {
      const m = memberById.get(sh.member_id);
      if (!m?.splitwise_user_id) {
        return NextResponse.json(
          {
            error: `Member "${m?.name ?? "Unknown"}" has no Splitwise ID. Run Sync from the Split page so members match Splitwise.`,
          },
          { status: 400 }
        );
      }
    }

    const totalCents = Math.round(Number(expense.amount) * 100);
    const costStr = (totalCents / 100).toFixed(2);
    const swGroupId = parseInt(String(group.splitwise_group_id), 10);
    if (Number.isNaN(swGroupId)) {
      return NextResponse.json({ error: "Invalid Splitwise group id" }, { status: 400 });
    }

    const owedCents = ordered.map((sh: any) =>
      Math.round(Number(sh.share_amount) * 100)
    );
    let owedSum = owedCents.reduce((a: number, b: number) => a + b, 0);
    const drift = totalCents - owedSum;
    if (drift !== 0 && owedCents.length > 0) {
      owedCents[owedCents.length - 1] += drift;
    }

    const payload: Record<string, string | number> = {
      cost: costStr,
      description: expense.description || "Expense",
      currency_code: expense.currency === "INR" ? "INR" : "USD",
      group_id: swGroupId,
      date: `${expense.date}T12:00:00.000Z`,
    };

    let idx = 0;
    for (let i = 0; i < ordered.length; i++) {
      const sh = ordered[i] as any;
      const m = memberById.get(sh.member_id)!;
      const paid =
        sh.member_id === expense.paid_by ? costStr : "0.00";
      const owed = (owedCents[i] / 100).toFixed(2);
      payload[`users__${idx}__user_id`] = parseInt(m.splitwise_user_id, 10);
      payload[`users__${idx}__paid_share`] = paid;
      payload[`users__${idx}__owed_share`] = owed;
      idx++;
    }

    const swRes = await swPost("/create_expense", token, payload);
    const swBody = await swRes.json().catch(() => ({}));

    if (swRes.status === 401) {
      if (profile?.splitwise_access_token) {
        await supabase
          .from("profiles")
          .update({
            splitwise_access_token: null,
            splitwise_refresh_token: null,
            splitwise_token_expires_at: null,
          })
          .eq("id", user.id);
      }
      return NextResponse.json(
        { error: "Splitwise session expired. Reconnect in Settings." },
        { status: 401 }
      );
    }

    if (!swRes.ok) {
      const msg =
        (swBody as any)?.error ||
        (swBody as any)?.errors?.base?.[0] ||
        `Splitwise error (${swRes.status})`;
      return NextResponse.json({ error: String(msg) }, { status: 502 });
    }

    const errs = (swBody as any)?.errors;
    if (errs && typeof errs === "object" && Object.keys(errs).length > 0) {
      return NextResponse.json(
        { error: JSON.stringify(errs) },
        { status: 400 }
      );
    }

    const swExp = (swBody as any)?.expenses?.[0];
    const swId = swExp?.id != null ? String(swExp.id) : null;

    if (swId) {
      await supabase
        .from("split_expenses")
        .update({ splitwise_expense_id: swId })
        .eq("id", expenseId);
    }

    return NextResponse.json({
      ok: true,
      splitwise_expense_id: swId,
    });
  } catch (e: any) {
    console.error("[push-expense]", e);
    return NextResponse.json(
      { error: e?.message || "Unknown error" },
      { status: 500 }
    );
  }
}
