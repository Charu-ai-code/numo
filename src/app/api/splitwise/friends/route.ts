import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const SW_BASE = "https://secure.splitwise.com/api/v3.0";

async function swFetch(path: string, token: string): Promise<Response> {
  return fetch(`${SW_BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
}

/** Numo person-debt convention: net > 0 = you owe them; net < 0 = they owe you. */
function numoNetFromSplitwiseFriendBalance(amountStr: string): number {
  const sw = parseFloat(String(amountStr || "0"));
  if (!Number.isFinite(sw)) return 0;
  return -sw;
}

export async function GET() {
  try {
    const supabase = createServerSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const apiKey = process.env.SPLITWISE_API_KEY;
    const { data: profile } = await supabase
      .from("profiles")
      .select("splitwise_access_token, primary_currency")
      .eq("id", user.id)
      .single();

    const token = profile?.splitwise_access_token || apiKey;
    if (!token) {
      return NextResponse.json(
        { error: "Splitwise not connected" },
        { status: 400 }
      );
    }

    const primary = (profile?.primary_currency as string) || "USD";

    const res = await swFetch("/get_friends", token);
    if (res.status === 401) {
      return NextResponse.json(
        { error: "Splitwise token expired" },
        { status: 401 }
      );
    }
    if (!res.ok) {
      const t = await res.text();
      console.error("get_friends", res.status, t);
      return NextResponse.json(
        { error: `Splitwise API error: ${res.status}` },
        { status: 502 }
      );
    }

    const body = await res.json();
    const friends = (body.friends || []) as any[];

    const { data: memberRows } = await supabase
      .from("split_members")
      .select(
        `
        id,
        splitwise_user_id,
        group_id,
        split_groups!inner ( id, name, user_id )
      `
      )
      .eq("split_groups.user_id", user.id)
      .not("splitwise_user_id", "is", null);

    type Agg = {
      memberIds: string[];
      groupIds: string[];
      groupNames: string[];
    };
    const bySw = new Map<string, Agg>();
    for (const row of memberRows || []) {
      const swId = String((row as any).splitwise_user_id);
      const sg = (row as any).split_groups;
      const gname = sg?.name as string | undefined;
      if (!bySw.has(swId)) {
        bySw.set(swId, { memberIds: [], groupIds: [], groupNames: [] });
      }
      const a = bySw.get(swId)!;
      a.memberIds.push((row as any).id as string);
      a.groupIds.push((row as any).group_id as string);
      if (gname && !a.groupNames.includes(gname)) a.groupNames.push(gname);
    }

    const out: {
      splitwiseUserId: string;
      name: string;
      email: string | null;
      net: number;
      currency: string;
      groups: string[];
      memberId: string;
      groupId: string;
    }[] = [];

    for (const f of friends) {
      const swId = String(f.id);
      const balances = (f.balance || []) as {
        currency_code?: string;
        amount?: string;
      }[];
      const forPrimary = balances.find(
        (b) => b.currency_code === primary
      );
      const hit = forPrimary || balances[0];
      if (!hit?.currency_code) continue;

      const net = numoNetFromSplitwiseFriendBalance(String(hit.amount ?? "0"));
      if (Math.abs(net) < 0.005) continue;

      const name =
        [f.first_name, f.last_name].filter(Boolean).join(" ").trim() ||
        f.email ||
        "Friend";
      const agg = bySw.get(swId);

      out.push({
        splitwiseUserId: swId,
        name,
        email: f.email ?? null,
        net,
        currency: hit.currency_code || primary,
        groups:
          agg?.groupNames?.length ? agg.groupNames : ["Non-group / other"],
        memberId: agg?.memberIds[0] ?? "",
        groupId: agg?.groupIds[0] ?? "",
      });
    }

    out.sort((a, b) => a.net - b.net);

    return NextResponse.json({ friends: out, primaryCurrencyWanted: primary });
  } catch (err: any) {
    console.error("splitwise/friends:", err);
    return NextResponse.json(
      { error: err?.message || "Server error" },
      { status: 500 }
    );
  }
}
