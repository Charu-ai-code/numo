"use client";

import { cn } from "@/lib/utils";

interface ToggleProps {
  enabled: boolean;
  onToggle: (v: boolean) => void;
  label?: string;
  className?: string;
}

export function Toggle({ enabled, onToggle, label, className }: ToggleProps) {
  return (
    <button
      type="button"
      onClick={() => onToggle(!enabled)}
      className={cn("flex items-center gap-3", className)}
    >
      <div
        className={cn(
          "relative w-11 h-6 rounded-full transition-colors",
          enabled ? "bg-accent-green" : "bg-white/[0.1]"
        )}
      >
        <div
          className={cn(
            "absolute top-0.5 w-5 h-5 rounded-full bg-white transition-transform shadow-sm",
            enabled ? "translate-x-[22px]" : "translate-x-0.5"
          )}
        />
      </div>
      {label && <span className="text-sm text-white/70">{label}</span>}
    </button>
  );
}
