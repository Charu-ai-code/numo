import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { applyUserMappingsToTransactions } from "@/lib/smart-categorize";
import {
  isSplitwiseSettlementExpense,
  parseSplitwiseSettlements,
} from "@/lib/splitwise-settlement";
import { detectRecurringPatterns } from "@/lib/detect-recurring";
import { upsertDetectedRecurringRows } from "@/lib/recurring-expense-sync";

export const dynamic = "force-dynamic";

const SW_BASE = "https://secure.splitwise.com/api/v3.0";
const RATE_LIMIT_MS = 200;

const CATEGORY_MAP: Record<string, string> = {
  "dining out": "food",
  "food and drink": "food",
  "groceries": "food",
  "liquor": "food",
  "taxi": "transport",
  "car": "transport",
  "parking": "transport",
  "bus/train": "transport",
  "gas/fuel": "transport",
  "bicycle": "transport",
  "hotel": "transport",
  "rent": "housing",
  "mortgage": "housing",
  "household supplies": "housing",
  "furniture": "housing",
  "maintenance": "housing",
  "electricity": "utilities",
  "water": "utilities",
  "internet": "utilities",
  "heat/gas": "utilities",
  "phone": "utilities",
  "tv/cable": "utilities",
  "trash": "utilities",
  "cleaning": "utilities",
  "entertainment": "entertainment",
  "movies": "entertainment",
  "music": "entertainment",
  "games": "entertainment",
  "sports": "entertainment",
  "clothing": "shopping",
  "gifts": "shopping",
  "electronics": "shopping",
  "general": "other_expense",
  "education": "education",
  "childcare": "family_remittance",
  "pets": "other_expense",
  "insurance": "other_expense",
  "medical expenses": "healthcare",
  "taxes": "other_expense",
  "life": "other_expense",
};

function mapCategory(swCategory: string | undefined | null): string {
  if (!swCategory) return "other_expense";
  return CATEGORY_MAP[swCategory.toLowerCase()] || "other_expense";
}

async function swFetch(path: string, token: string): Promise<Response> {
  return fetch(`${SW_BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
}

function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/** Remove mistaken split_expense + linked transactions before re-importing as settlement */
async function deleteLegacySwExpenseAndTx(
  supabase: ReturnType<typeof createServerSupabaseClient>,
  swExpenseId: string
) {
  const { data: old } = await supabase
    .from("split_expenses")
    .select("id")
    .eq("splitwise_expense_id", swExpenseId)
    .maybeSingle();
  if (!old) return;
  await supabase.from("transactions").delete().eq("split_expense_id", old.id);
  await supabase.from("split_expenses").delete().eq("id", old.id);
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

    const apiKey = process.env.SPLITWISE_API_KEY;
    const { data: profile } = await supabase
      .from("profiles")
      .select(
        "splitwise_access_token, splitwise_last_sync, default_account_id"
      )
      .eq("id", user.id)
      .single();

    // Prefer user's OAuth token (their actual Splitwise account) over the app-level API key
    const token = profile?.splitwise_access_token || apiKey;

    if (!token) {
      return NextResponse.json(
        { error: "Splitwise not connected and no API key configured" },
        { status: 400 }
      );
    }

    // Load user's category_mappings for smart category resolution
    const { data: userMappings } = await supabase
      .from("category_mappings")
      .select("keyword, category")
      .eq("user_id", user.id);

    const userMappingMap = new Map<string, string>();
    (userMappings || []).forEach((m: any) => {
      userMappingMap.set(m.keyword.toLowerCase(), m.category);
    });

    // Resolve default account for auto-created transactions
    const { data: accounts } = await supabase
      .from("accounts")
      .select("id")
      .eq("user_id", user.id)
      .order("created_at")
      .limit(2);

    let defaultAccountId = profile?.default_account_id;
    if (!defaultAccountId && accounts?.length === 1) {
      defaultAccountId = accounts[0].id;
    }

    // Step 1: Get current Splitwise user
    const meRes = await swFetch("/get_current_user", token);
    if (meRes.status === 401) {
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
        { error: "Splitwise token expired. Please reconnect." },
        { status: 401 }
      );
    }
    if (!meRes.ok) {
      return NextResponse.json(
        { error: `Splitwise API error: ${meRes.status}` },
        { status: 502 }
      );
    }
    const meBody = await meRes.json();
    const swCurrentUserId = String(meBody.user?.id);

    await delay(RATE_LIMIT_MS);

    // Step 2: Fetch groups
    const groupsRes = await swFetch("/get_groups", token);
    if (!groupsRes.ok) {
      const errorText = await groupsRes.text();
      console.error("Splitwise groups error:", groupsRes.status, errorText);
      return NextResponse.json(
        { error: `Splitwise API error: ${groupsRes.status}` },
        { status: 502 }
      );
    }

    const groupsBody = await groupsRes.json();
    const swGroups = (groupsBody.groups || []).filter(
      (g: any) => g.id !== 0
    );

    let newGroupsSynced = 0;
    let expensesSynced = 0;
    let transactionsCreated = 0;
    let settlementsSynced = 0;

    const lastSync = profile?.splitwise_last_sync || null;

    for (const g of swGroups) {
      await delay(RATE_LIMIT_MS);

      // Upsert group
      const { data: existingGroup } = await supabase
        .from("split_groups")
        .select("id")
        .eq("splitwise_group_id", String(g.id))
        .eq("user_id", user.id)
        .maybeSingle();

      let localGroupId: string;

      if (existingGroup) {
        localGroupId = existingGroup.id;
        await supabase
          .from("split_groups")
          .update({
            name: g.name,
            simplified_debts: g.simplified_debts ?? [],
          })
          .eq("id", localGroupId);
      } else {
        const { data: newGroup, error: insertErr } = await supabase
          .from("split_groups")
          .insert({
            name: g.name,
            user_id: user.id,
            splitwise_group_id: String(g.id),
            simplified_debts: g.simplified_debts ?? [],
          })
          .select("id")
          .single();
        if (insertErr) console.error("[sync] group insert error:", insertErr);
        if (!newGroup) continue;
        localGroupId = newGroup.id;
        newGroupsSynced++;
      }

      // Upsert members with splitwise_user_id
      if (g.members) {
        for (const m of g.members) {
          const swMemberId = String(m.id);
          const memberName =
            `${m.first_name || ""} ${m.last_name || ""}`.trim() || "Unknown";
          const isCurrentUser = swMemberId === swCurrentUserId;

          const { data: existingMember } = await supabase
            .from("split_members")
            .select("id, user_id")
            .eq("group_id", localGroupId)
            .eq("splitwise_user_id", swMemberId)
            .maybeSingle();

          if (existingMember) {
            // Link existing member to Supabase user if not already linked
            if (isCurrentUser && !existingMember.user_id) {
              await supabase
                .from("split_members")
                .update({ user_id: user.id })
                .eq("id", existingMember.id);
            }
          } else {
            await supabase.from("split_members").insert({
              group_id: localGroupId,
              name: memberName,
              email: m.email || null,
              splitwise_user_id: swMemberId,
              user_id: isCurrentUser ? user.id : null,
            });
          }
        }
      }

      // Step 3: Fetch expenses for this group (paginated)
      // Check if this group has any local expenses already
      const { count: localExpenseCount } = await supabase
        .from("split_expenses")
        .select("id", { count: "exact", head: true })
        .eq("group_id", localGroupId);

      const useIncrementalSync = lastSync && (localExpenseCount ?? 0) > 0;
      

      let offset = 0;
      const limit = 50;
      let hasMore = true;

      while (hasMore) {
        await delay(RATE_LIMIT_MS);

        let expUrl = `/get_expenses?group_id=${g.id}&limit=${limit}&offset=${offset}`;
        if (useIncrementalSync) {
          expUrl += `&updated_after=${new Date(lastSync!).toISOString()}`;
        }

        const expRes = await swFetch(expUrl, token);
        if (!expRes.ok) {
          console.error(
            `Splitwise expenses error for group ${g.id}:`,
            expRes.status
          );
          break;
        }

        const expBody = await expRes.json();
        const expenses = expBody.expenses || [];

        if (expenses.length < limit) hasMore = false;
        offset += limit;

        // Fetch all local members for this group once per group
        const { data: localMembers } = await supabase
          .from("split_members")
          .select("id, splitwise_user_id")
          .eq("group_id", localGroupId);

        const memberMap = new Map<string, string>();
        (localMembers || []).forEach((lm: any) => {
          if (lm.splitwise_user_id)
            memberMap.set(lm.splitwise_user_id, lm.id);
        });

        for (const exp of expenses) {
          if (exp.deleted_at) continue;
          if (parseFloat(exp.cost) === 0) continue;

          const swExpenseId = String(exp.id);
          const amount = parseFloat(exp.cost);
          const currencyCode = exp.currency_code === "INR" ? "INR" : "USD";
          const categoryName = exp.category?.name;
          // User mappings win over AI/default: check expense description first
          const descLower = (exp.description || "").toLowerCase().trim();
          const numoCategory = userMappingMap.get(descLower) || mapCategory(categoryName);
          const expDate = exp.date
            ? exp.date.slice(0, 10)
            : new Date().toISOString().slice(0, 10);

          // Debt transfers — not shared spending; store as split_settlements, not transactions
          if (isSplitwiseSettlementExpense(exp)) {
            await deleteLegacySwExpenseAndTx(supabase, swExpenseId);
            const parsed = parseSplitwiseSettlements(exp, memberMap);
            for (const p of parsed) {
              const { error: setErr } = await supabase.from("split_settlements").upsert(
                {
                  group_id: localGroupId,
                  from_member: p.fromMemberId,
                  to_member: p.toMemberId,
                  amount: p.amount,
                  currency: currencyCode,
                  date: expDate,
                  splitwise_expense_id: p.dedupKey,
                },
                { onConflict: "splitwise_expense_id" }
              );
              if (!setErr) settlementsSynced++;
            }
            continue;
          }

          // Find who paid (the user with highest paid_share)
          let paidBySwId: string | null = null;
          let maxPaid = 0;
          for (const u of exp.users || []) {
            const paid = parseFloat(u.paid_share || "0");
            if (paid > maxPaid) {
              maxPaid = paid;
              paidBySwId = String(u.user_id);
            }
          }
          const paidByLocalId = paidBySwId
            ? memberMap.get(paidBySwId)
            : null;

          // Upsert split_expense
          const { data: existingExp, error: existingExpErr } = await supabase
            .from("split_expenses")
            .select("id")
            .eq("splitwise_expense_id", swExpenseId)
            .maybeSingle();

          let localExpenseId: string;

          if (existingExp) {
            await supabase
              .from("split_expenses")
              .update({
                description: exp.description || "Splitwise expense",
                amount,
                currency: currencyCode,
                date: expDate,
                paid_by: paidByLocalId || undefined,
              })
              .eq("id", existingExp.id);
            localExpenseId = existingExp.id;
          } else {
            if (!paidByLocalId) continue;
            const { data: newExp, error: insertExpErr } = await supabase
              .from("split_expenses")
              .insert({
                group_id: localGroupId,
                description: exp.description || "Splitwise expense",
                amount,
                currency: currencyCode,
                paid_by: paidByLocalId,
                split_method: "custom",
                date: expDate,
                splitwise_expense_id: swExpenseId,
              })
              .select("id")
              .single();
            if (!newExp) continue;
            localExpenseId = newExp.id;
            expensesSynced++;
          }

          // Upsert split_shares for each user
          for (const u of exp.users || []) {
            const shareAmount = parseFloat(u.owed_share || "0");
            if (shareAmount <= 0) continue;
            const memberLocalId = memberMap.get(String(u.user_id));
            if (!memberLocalId) continue;

            const { data: existingShare } = await supabase
              .from("split_shares")
              .select("id")
              .eq("expense_id", localExpenseId)
              .eq("member_id", memberLocalId)
              .maybeSingle();

            if (existingShare) {
              await supabase
                .from("split_shares")
                .update({ share_amount: shareAmount })
                .eq("id", existingShare.id);
            } else {
              await supabase.from("split_shares").insert({
                expense_id: localExpenseId,
                member_id: memberLocalId,
                share_amount: shareAmount,
              });
            }
          }

          // Auto-create/update one expense = user's Splitwise owed_share on default_account_id only (not the full merchant/card charge). Posting the full card amount would be a separate product/sync change.
          if (!defaultAccountId) continue;

          const currentUserData = (exp.users || []).find(
            (u: any) => String(u.user_id) === swCurrentUserId
          );
          if (!currentUserData) continue;
          const myShare = parseFloat(currentUserData.owed_share || "0");
          if (myShare <= 0) continue;

          const txNote = `${exp.description || "Splitwise expense"} (Split: ${g.name})`;

          const { data: existingTx } = await supabase
            .from("transactions")
            .select("id")
            .eq("split_expense_id", localExpenseId)
            .eq("user_id", user.id)
            .maybeSingle();

          if (existingTx) {
            await supabase
              .from("transactions")
              .update({
                amount: myShare,
                note: txNote,
                category: numoCategory,
                date: expDate,
              })
              .eq("id", existingTx.id);
          } else {
            const { error: txErr } = await supabase
              .from("transactions")
              .insert({
                user_id: user.id,
                account_id: defaultAccountId,
                amount: myShare,
                currency: currencyCode,
                type: "expense",
                category: numoCategory,
                note: txNote,
                date: expDate,
                source: "split",
                split_expense_id: localExpenseId,
              });
            if (!txErr) transactionsCreated++;
          }
        }
      }
    }

    // Apply saved category_mappings to any transactions still on default categories (silent)
    const mappingUpdates = await applyUserMappingsToTransactions(supabase, user.id);

    /** Detect recurring Splitwise shares (rent, utilities, etc.) → recurring_expenses */
    let recurring_from_split = 0;
    try {
      const since = new Date();
      since.setMonth(since.getMonth() - 3);
      const sinceStr = since.toISOString().slice(0, 10);
      const { data: splitTxs } = await supabase
        .from("transactions")
        .select("id, date, amount, note, category, currency, source")
        .eq("user_id", user.id)
        .eq("type", "expense")
        .eq("source", "split")
        .gte("date", sinceStr);
      const patterns = detectRecurringPatterns(
        (splitTxs || []).map((t: any) => ({
          id: t.id,
          date: t.date,
          amount: Number(t.amount),
          note: t.note,
          category: t.category,
          currency: t.currency,
          source: t.source,
        })),
        { sinceDate: sinceStr }
      ).filter((p) => p.source === "splitwise");
      if (patterns.length) {
        recurring_from_split = await upsertDetectedRecurringRows(
          supabase,
          user.id,
          patterns
        );
      }
    } catch (e) {
      console.warn("Splitwise recurring detection skipped:", e);
    }

    // Step 4: Update last sync timestamp
    await supabase
      .from("profiles")
      .update({ splitwise_last_sync: new Date().toISOString() })
      .eq("id", user.id);

    return NextResponse.json({
      success: true,
      total_groups: swGroups.length,
      new_groups_synced: newGroupsSynced,
      expenses_synced: expensesSynced,
      transactions_created: transactionsCreated,
      settlements_synced: settlementsSynced,
      category_mapping_updates: mappingUpdates,
      recurring_from_split,
    });
  } catch (err: any) {
    console.error("Splitwise sync error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
