"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import {
  computeRunningBalance,
  type LedgerAccountRow,
  type LedgerTransactionRow,
} from "@/lib/account-ledger";

export function useAccounts() {
  const supabase = createClient();
  return useQuery({
    queryKey: ["accounts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("accounts")
        .select("*")
        .order("type")
        .order("name");
      if (error) throw error;
      return data;
    },
  });
}

/** All transactions for ledger / net worth (amount, type, date, account). */
export function useAllTransactionsLedger() {
  const supabase = createClient();
  return useQuery({
    queryKey: ["transactions-ledger"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("transactions")
        .select("id, account_id, amount, type, date, created_at")
        .order("date", { ascending: true })
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data as LedgerTransactionRow[] & { id: string; account_id: string }[];
    },
  });
}

export function useAccountBalance(accountId: string) {
  const supabase = createClient();
  return useQuery({
    queryKey: ["account-balance", accountId],
    queryFn: async () => {
      const { data: account } = await supabase
        .from("accounts")
        .select("id, type, initial_balance, currency")
        .eq("id", accountId)
        .single();

      const { data: txns } = await supabase
        .from("transactions")
        .select("amount, type, date, created_at")
        .eq("account_id", accountId);

      if (!account) return 0;
      return computeRunningBalance(
        account as LedgerAccountRow,
        (txns || []) as LedgerTransactionRow[]
      );
    },
  });
}

export function useCreateAccount() {
  const supabase = createClient();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (account: {
      name: string;
      type: string;
      currency: string;
      initial_balance: number;
      credit_limit?: number | null;
      payment_due_day?: number | null;
      apr?: number | null;
    }) => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      // Only include columns we set — avoids "apr not in schema" on DBs that never ran the apr migration.
      const row: Record<string, unknown> = {
        name: account.name,
        type: account.type,
        currency: account.currency,
        initial_balance: account.initial_balance,
        user_id: user!.id,
      };
      if (account.type === "credit_card") {
        row.credit_limit = account.credit_limit ?? null;
        row.payment_due_day = account.payment_due_day ?? null;
        if (account.apr != null && !Number.isNaN(account.apr)) {
          row.apr = account.apr;
        }
      }
      const { data, error } = await supabase
        .from("accounts")
        .insert(row as any)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["accounts"] });
      qc.invalidateQueries({ queryKey: ["transactions-ledger"] });
    },
  });
}

export function useUpdateAccount() {
  const supabase = createClient();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      ...updates
    }: {
      id: string;
      name?: string;
      initial_balance?: number;
      credit_limit?: number | null;
      payment_due_day?: number | null;
      apr?: number | null;
    }) => {
      const { error } = await supabase
        .from("accounts")
        .update(updates)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["accounts"] });
      qc.invalidateQueries({ queryKey: ["account", vars.id] });
      qc.invalidateQueries({ queryKey: ["account-balance", vars.id] });
      qc.invalidateQueries({ queryKey: ["transactions-ledger"] });
    },
  });
}

export function useDeleteAccount() {
  const supabase = createClient();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("accounts").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["accounts"] });
      qc.invalidateQueries({ queryKey: ["transactions"] });
      qc.invalidateQueries({ queryKey: ["transactions-ledger"] });
    },
  });
}
