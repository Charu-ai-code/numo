import type { SupabaseClient } from "@supabase/supabase-js";

export type PairedTransferInput = {
  fromAccountId: string;
  toAccountId: string;
  amount: number;
  currency: string;
  transferDate: string;
  note: string | null;
};

/**
 * Creates transfer_out + transfer_in rows and links them.
 * Same behavior as the optional `create_transfer` RPC (SECURITY INVOKER + account checks).
 * Use this when PostgREST has no `create_transfer` in the schema cache.
 * Optional DB RPC: `supabase/migration_rpc_create_transfer.sql`.
 */
export async function createPairedTransfer(
  supabase: SupabaseClient,
  input: PairedTransferInput
): Promise<{ error: Error | null }> {
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();
  if (authErr || !user) {
    return { error: new Error("Not authenticated") };
  }

  const {
    fromAccountId,
    toAccountId,
    amount,
    currency,
    transferDate,
    note: rawNote,
  } = input;

  if (fromAccountId === toAccountId) {
    return { error: new Error("From and to accounts must differ") };
  }
  if (amount == null || amount <= 0) {
    return { error: new Error("Amount must be positive") };
  }
  if (currency !== "USD" && currency !== "INR") {
    return { error: new Error("Invalid currency") };
  }

  const { data: accRows, error: accErr } = await supabase
    .from("accounts")
    .select("id, user_id, currency")
    .in("id", [fromAccountId, toAccountId]);

  if (accErr) {
    return { error: new Error(accErr.message) };
  }
  if (!accRows || accRows.length !== 2) {
    return { error: new Error("Account not found") };
  }
  const accFrom = accRows.find((r) => r.id === fromAccountId);
  const accTo = accRows.find((r) => r.id === toAccountId);
  if (!accFrom || !accTo) {
    return { error: new Error("Account not found") };
  }
  if (accFrom.user_id !== user.id || accTo.user_id !== user.id) {
    return { error: new Error("Forbidden") };
  }
  if (
    accFrom.currency !== accTo.currency ||
    accFrom.currency !== currency
  ) {
    return { error: new Error("Accounts must use the same currency as the transfer") };
  }

  const note =
    rawNote != null && String(rawNote).trim() !== ""
      ? String(rawNote).trim()
      : "Transfer";

  const { data: outRow, error: e1 } = await supabase
    .from("transactions")
    .insert({
      user_id: user.id,
      account_id: fromAccountId,
      amount,
      currency,
      type: "transfer_out",
      category: "internal_transfer",
      note,
      date: transferDate,
      source: "manual",
    })
    .select("id")
    .single();

  if (e1) {
    return { error: new Error(e1.message) };
  }

  const idOut = outRow!.id;

  const { data: inRow, error: e2 } = await supabase
    .from("transactions")
    .insert({
      user_id: user.id,
      account_id: toAccountId,
      amount,
      currency,
      type: "transfer_in",
      category: "internal_transfer",
      note,
      date: transferDate,
      source: "manual",
      linked_transfer_id: idOut,
    })
    .select("id")
    .single();

  if (e2) {
    await supabase.from("transactions").delete().eq("id", idOut);
    return { error: new Error(e2.message) };
  }

  const idIn = inRow!.id;

  const { error: e3 } = await supabase
    .from("transactions")
    .update({ linked_transfer_id: idIn })
    .eq("id", idOut);

  if (e3) {
    return { error: new Error(e3.message) };
  }

  return { error: null };
}
