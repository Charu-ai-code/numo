import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

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
      .select("splitwise_access_token")
      .eq("id", user.id)
      .single();

    if (!profile?.splitwise_access_token) {
      return NextResponse.json(
        { error: "Splitwise not connected" },
        { status: 400 }
      );
    }

    const groupsRes = await fetch(
      "https://secure.splitwise.com/api/v3.0/get_groups",
      {
        headers: {
          Authorization: `Bearer ${profile.splitwise_access_token}`,
        },
      }
    );

    if (groupsRes.status === 401) {
      await supabase
        .from("profiles")
        .update({
          splitwise_access_token: null,
          splitwise_refresh_token: null,
          splitwise_token_expires_at: null,
        })
        .eq("id", user.id);
      return NextResponse.json(
        { error: "Splitwise token expired. Please reconnect." },
        { status: 401 }
      );
    }

    if (!groupsRes.ok) {
      const errorText = await groupsRes.text();
      console.error("Splitwise API error:", groupsRes.status, errorText);
      return NextResponse.json(
        { error: `Splitwise API error: ${groupsRes.status}` },
        { status: 502 }
      );
    }

    const body = await groupsRes.json();
    const groups = body.groups || [];
    let syncedCount = 0;

    for (const g of groups) {
      if (g.id === 0) continue;

      const { data: existing } = await supabase
        .from("split_groups")
        .select("id")
        .eq("splitwise_group_id", String(g.id))
        .eq("user_id", user.id)
        .maybeSingle();

      if (!existing) {
        const { data: newGroup } = await supabase
          .from("split_groups")
          .insert({
            name: g.name,
            user_id: user.id,
            splitwise_group_id: String(g.id),
          })
          .select()
          .single();

        if (newGroup && g.members) {
          const members = g.members.map((m: any) => ({
            group_id: newGroup.id,
            name:
              `${m.first_name || ""} ${m.last_name || ""}`.trim() || "Unknown",
            email: m.email || null,
          }));
          await supabase.from("split_members").insert(members);
        }
        syncedCount++;
      }
    }

    return NextResponse.json({
      success: true,
      total_groups: groups.length,
      new_groups_synced: syncedCount,
    });
  } catch (err: any) {
    console.error("Splitwise sync error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
