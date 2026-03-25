"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { CurrencyToggle } from "@/components/ui/currency-toggle";
import { Input } from "@/components/ui/input";
import { Toggle } from "@/components/ui/toggle";
import { createClient } from "@/lib/supabase/client";
import type { Currency } from "@/lib/constants";

export default function OnboardingPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [displayName, setDisplayName] = useState("");
  const [primaryCurrency, setPrimaryCurrency] = useState<Currency>("USD");
  const [monthlyIncome, setMonthlyIncome] = useState("");
  const [rookieMode, setRookieMode] = useState(false);

  const [displayNameError, setDisplayNameError] = useState("");
  const [incomeError, setIncomeError] = useState("");
  const [formError, setFormError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError("");
    setDisplayNameError("");
    setIncomeError("");

    const trimmedName = displayName.trim();
    if (!trimmedName) {
      setDisplayNameError("Please enter a display name.");
      return;
    }

    let parsedIncome: number | null = null;
    const incomeTrimmed = monthlyIncome.trim();
    if (incomeTrimmed !== "") {
      const n = Number(incomeTrimmed);
      if (Number.isNaN(n) || n < 0) {
        setIncomeError("Income must be zero or greater.");
        return;
      }
      parsedIncome = n;
    }

    setLoading(true);
    try {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        setFormError(userError?.message ?? "You need to be signed in to continue.");
        return;
      }

      const { error: upsertError } = await supabase.from("profiles").upsert(
        {
          id: user.id,
          display_name: trimmedName,
          primary_currency: primaryCurrency,
          monthly_income: parsedIncome,
          rookie_mode: rookieMode,
          onboarding_completed: true,
        },
        { onConflict: "id" }
      );

      if (upsertError) {
        setFormError(upsertError.message);
        return;
      }

      router.push("/");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="p-6 sm:p-8 space-y-8">
      <header className="space-y-2 text-center">
        <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-white flex items-center justify-center gap-2 flex-wrap">
          <span>Welcome to numo.</span>
          <span
            className="inline-block w-2 h-2 rounded-full bg-accent-green shrink-0"
            aria-hidden
          />
        </h1>
        <p className="text-sm text-muted">
          Let&apos;s set up your financial world in 30 seconds.
        </p>
      </header>

      <form onSubmit={handleSubmit} className="space-y-6">
        <Input
          label="What should we call you?"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          autoComplete="name"
          error={displayNameError}
        />

        <div className="space-y-1.5">
          <label className="block text-sm text-muted">What&apos;s your main currency?</label>
          <CurrencyToggle
            value={primaryCurrency}
            onChange={setPrimaryCurrency}
            className="w-full justify-center"
          />
        </div>

        <Input
          type="number"
          inputMode="decimal"
          min={0}
          step="0.01"
          label="Approximate monthly income (optional)"
          placeholder="0.00"
          value={monthlyIncome}
          onChange={(e) => setMonthlyIncome(e.target.value)}
          className="font-number"
          error={incomeError}
        />

        <div className="flex items-start justify-between gap-4 rounded-xl border border-white/[0.08] bg-white/[0.02] p-4">
          <div className="space-y-1 min-w-0">
            <p className="text-sm font-medium text-white">Rookie Mode</p>
            <p className="text-xs text-muted leading-relaxed">
              Simpler dashboard, helpful tooltips, gentler AI coach
            </p>
          </div>
          <Toggle
            enabled={rookieMode}
            onToggle={setRookieMode}
            className="shrink-0 pt-0.5"
          />
        </div>

        {formError ? (
          <p className="text-sm text-accent-coral text-center" role="alert">
            {formError}
          </p>
        ) : null}

        <Button type="submit" size="lg" className="w-full" loading={loading}>
          Get Started
        </Button>
      </form>
    </Card>
  );
}
