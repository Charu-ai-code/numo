"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { useAppStore } from "@/lib/stores/app-store";
import { useEffect } from "react";

export function useProfile() {
  const supabase = createClient();
  const setProfile = useAppStore((s) => s.setProfile);

  const query = useQuery({
    queryKey: ["profile"],
    queryFn: async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return null;
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .single();
      if (error) throw error;
      return data;
    },
  });

  useEffect(() => {
    if (query.data) {
      setProfile(query.data as any);
    }
  }, [query.data, setProfile]);

  return query;
}
