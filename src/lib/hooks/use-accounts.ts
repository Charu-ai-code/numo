"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";

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

export function useAccountBalance(accountId: string) {
  const supabase = createClient();
  return useQuery({
    queryKey: ["account-balance", accountId],
    queryFn: async () => {
      const { data: account } = await supabase
        .from("accounts")
        .select("initial_balance")
        .eq("id", accountId)
        .single();

      const { data: txns } = await supabase
        .from("transactions")
        .select("amount, type")
        .eq("account_id", accountId);

      let balance = account?.initial_balance || 0;
      (txns || []).forEach((t: any) => {
        balance += t.type === "income" ? t.amount : -t.amount;
      });
      return balance;
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
    }) => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const { data, error } = await supabase
        .from("accounts")
        .insert({ ...account, user_id: user!.id })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["accounts"] });
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
    },
  });
}
