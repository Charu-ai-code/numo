import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { syncTransactionRecurring } from "@/lib/recurring-expense-sync";

export const dynamic = "force-dynamic";

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
    const transactionId = body?.transactionId as string | undefined;
    if (!transactionId) {
      return NextResponse.json(
        { error: "transactionId required" },
        { status: 400 }
      );
    }

    const result = await syncTransactionRecurring(
      supabase,
      user.id,
      transactionId
    );
    if (!result.ok) {
      return NextResponse.json(
        { error: result.error || "Sync failed" },
        { status: 400 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error("recurring/from-transaction:", err);
    return NextResponse.json(
      { error: err?.message || "Server error" },
      { status: 500 }
    );
  }
}
