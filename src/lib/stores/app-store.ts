import { create } from "zustand";
import type { Currency } from "@/lib/constants";

interface Profile {
  id: string;
  display_name: string;
  primary_currency: Currency;
  monthly_income: number | null;
  rookie_mode: boolean;
  onboarding_completed: boolean;
  splitwise_access_token: string | null;
  weekly_summary_day: string;
  avatar_url: string | null;
  default_account_id: string | null;
}

interface AppState {
  profile: Profile | null;
  setProfile: (profile: Profile | null) => void;
  viewCurrency: Currency;
  setViewCurrency: (currency: Currency) => void;
}

export const useAppStore = create<AppState>((set) => ({
  profile: null,
  setProfile: (profile) =>
    set({ profile, viewCurrency: profile?.primary_currency || "USD" }),
  viewCurrency: "USD",
  setViewCurrency: (viewCurrency) => set({ viewCurrency }),
}));
