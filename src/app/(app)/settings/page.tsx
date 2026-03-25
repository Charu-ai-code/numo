"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  User,
  Globe,
  Shield,
  Link as LinkIcon,
  Calendar,
  Bell,
  Download,
  LogOut,
  ChevronRight,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useProfile } from "@/lib/hooks/use-profile";
import { useAppStore } from "@/lib/stores/app-store";
import { DAYS_OF_WEEK, type Currency } from "@/lib/constants";
import { getInitials, cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Toggle } from "@/components/ui/toggle";
import { CurrencyToggle } from "@/components/ui/currency-toggle";
import { Modal } from "@/components/ui/modal";
import { ShimmerCard } from "@/components/ui/shimmer";

export default function SettingsPage() {
  const router = useRouter();
  const supabase = createClient();
  const qc = useQueryClient();
  const { isLoading } = useProfile();
  const profile = useAppStore((s) => s.profile);

  const [showSignOut, setShowSignOut] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [displayName, setDisplayName] = useState("");

  const updateProfile = useMutation({
    mutationFn: async (updates: Record<string, any>) => {
      const { error } = await supabase
        .from("profiles")
        .update(updates)
        .eq("id", profile!.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["profile"] }),
  });

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  async function exportCSV() {
    const { data } = await supabase
      .from("transactions")
      .select("date, type, category, amount, currency, note")
      .order("date", { ascending: false });
    if (!data || data.length === 0) return;

    const header = "Date,Type,Category,Amount,Currency,Note\n";
    const rows = data.map((t: any) =>
      `${t.date},${t.type},${t.category},${t.amount},${t.currency},"${(t.note || "").replace(/"/g, '""')}"`
    ).join("\n");
    const csv = header + rows;

    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `numo-transactions-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (isLoading || !profile) {
    return (
      <div className="space-y-4 animate-fade-in">
        <h1 className="text-xl font-semibold">Settings</h1>
        <ShimmerCard /><ShimmerCard /><ShimmerCard />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <h1 className="text-xl font-semibold">Settings</h1>

      {/* Profile */}
      <Card className="flex items-center gap-4">
        <div className="w-12 h-12 rounded-full bg-accent-blue/20 flex items-center justify-center text-accent-blue font-semibold">
          {getInitials(profile.display_name || "U")}
        </div>
        <div className="flex-1 min-w-0">
          {editingName ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (displayName.trim()) {
                  updateProfile.mutate({ display_name: displayName.trim() });
                  setEditingName(false);
                }
              }}
              className="flex gap-2"
            >
              <Input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="h-8 text-sm"
              />
              <Button size="sm" type="submit">Save</Button>
            </form>
          ) : (
            <>
              <p className="text-sm font-medium truncate">{profile.display_name || "User"}</p>
              <button
                onClick={() => {
                  setDisplayName(profile.display_name || "");
                  setEditingName(true);
                }}
                className="text-xs text-accent-blue hover:underline"
              >
                Edit name
              </button>
            </>
          )}
        </div>
      </Card>

      {/* Currency */}
      <Card className="space-y-3">
        <div className="flex items-center gap-3">
          <Globe className="w-5 h-5 text-muted" />
          <span className="text-sm">Primary Currency</span>
        </div>
        <CurrencyToggle
          value={profile.primary_currency as Currency}
          onChange={(c) => updateProfile.mutate({ primary_currency: c })}
        />
      </Card>

      {/* Rookie Mode */}
      <Card className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Shield className="w-5 h-5 text-muted" />
          <div>
            <p className="text-sm">Rookie Mode</p>
            <p className="text-xs text-muted">Simpler dashboard, gentler AI</p>
          </div>
        </div>
        <Toggle
          enabled={profile.rookie_mode}
          onToggle={(v) => updateProfile.mutate({ rookie_mode: v })}
        />
      </Card>

      {/* Splitwise */}
      <Card className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <LinkIcon className="w-5 h-5 text-muted" />
          <div>
            <p className="text-sm">Splitwise</p>
            <p className="text-xs text-muted">
              {profile.splitwise_access_token ? (
                <span className="text-accent-green">Connected</span>
              ) : (
                <span>Not connected</span>
              )}
            </p>
          </div>
        </div>
        {profile.splitwise_access_token ? (
          <Button
            size="sm"
            variant="ghost"
            onClick={() =>
              updateProfile.mutate({
                splitwise_access_token: null,
                splitwise_refresh_token: null,
                splitwise_token_expires_at: null,
              })
            }
          >
            Disconnect
          </Button>
        ) : (
          <Button
            size="sm"
            variant="secondary"
            onClick={() => (window.location.href = "/api/splitwise/auth")}
          >
            Connect
          </Button>
        )}
      </Card>

      {/* Weekly Summary Day */}
      <Card className="space-y-3">
        <div className="flex items-center gap-3">
          <Calendar className="w-5 h-5 text-muted" />
          <span className="text-sm">Weekly Summary Day</span>
        </div>
        <select
          value={profile.weekly_summary_day || "Sunday"}
          onChange={(e) => updateProfile.mutate({ weekly_summary_day: e.target.value })}
          className="w-full px-4 py-2.5 bg-white/[0.05] border border-white/[0.08] rounded-xl text-sm text-white outline-none"
        >
          {DAYS_OF_WEEK.map((d) => (
            <option key={d} value={d}>{d}</option>
          ))}
        </select>
      </Card>

      {/* Export Data */}
      <Card
        hover
        className="flex items-center justify-between cursor-pointer"
        onClick={exportCSV}
      >
        <div className="flex items-center gap-3">
          <Download className="w-5 h-5 text-muted" />
          <p className="text-sm">Export Transactions (CSV)</p>
        </div>
        <ChevronRight className="w-4 h-4 text-muted" />
      </Card>

      {/* Sign Out */}
      <Card
        hover
        className="flex items-center justify-between cursor-pointer"
        onClick={() => setShowSignOut(true)}
      >
        <div className="flex items-center gap-3">
          <LogOut className="w-5 h-5 text-accent-coral" />
          <p className="text-sm text-accent-coral">Sign Out</p>
        </div>
      </Card>

      {/* Sign Out Confirmation */}
      <Modal open={showSignOut} onClose={() => setShowSignOut(false)} title="Sign out of numo?">
        <p className="text-sm text-muted mb-4">
          You&apos;ll need to sign in again to access your data.
        </p>
        <div className="flex gap-3">
          <Button variant="secondary" className="flex-1" onClick={() => setShowSignOut(false)}>
            Cancel
          </Button>
          <Button variant="danger" className="flex-1" onClick={handleSignOut}>
            Sign Out
          </Button>
        </div>
      </Modal>
    </div>
  );
}
