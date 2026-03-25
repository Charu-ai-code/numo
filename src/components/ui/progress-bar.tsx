"use client";

import { cn } from "@/lib/utils";

interface ProgressBarProps {
  value: number;
  max: number;
  className?: string;
}

export function ProgressBar({ value, max, className }: ProgressBarProps) {
  const percentage = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  const overBudget = value > max;
  const isWarning = percentage >= 80 && !overBudget;

  const barColor = overBudget
    ? "bg-accent-coral"
    : isWarning
    ? "bg-accent-amber"
    : "bg-accent-green";

  return (
    <div className={cn("w-full h-2 bg-white/[0.06] rounded-full overflow-hidden", className)}>
      <div
        className={cn(
          "h-full rounded-full transition-all duration-500",
          barColor,
          overBudget && "animate-pulse_glow"
        )}
        style={{ width: `${Math.min(percentage, 100)}%` }}
      />
    </div>
  );
}
