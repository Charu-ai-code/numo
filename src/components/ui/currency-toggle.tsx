"use client";

import { cn } from "@/lib/utils";
import type { Currency } from "@/lib/constants";

interface CurrencyToggleProps {
  value: Currency;
  onChange: (currency: Currency) => void;
  className?: string;
}

export function CurrencyToggle({ value, onChange, className }: CurrencyToggleProps) {
  return (
    <div className={cn("inline-flex bg-white/[0.04] rounded-xl p-1", className)}>
      <button
        type="button"
        onClick={() => onChange("USD")}
        className={cn(
          "px-3 py-1.5 text-sm rounded-lg transition-all font-mono",
          value === "USD"
            ? "bg-white/[0.1] text-accent-green font-semibold"
            : "text-muted hover:text-white/60"
        )}
      >
        $
      </button>
      <button
        type="button"
        onClick={() => onChange("INR")}
        className={cn(
          "px-3 py-1.5 text-sm rounded-lg transition-all font-mono",
          value === "INR"
            ? "bg-white/[0.1] text-accent-green font-semibold"
            : "text-muted hover:text-white/60"
        )}
      >
        ₹
      </button>
    </div>
  );
}
