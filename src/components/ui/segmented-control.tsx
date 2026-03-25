"use client";

import { cn } from "@/lib/utils";

interface SegmentedControlProps {
  options: { value: string; label: string }[];
  value: string;
  onChange: (value: string) => void;
  className?: string;
}

export function SegmentedControl({
  options,
  value,
  onChange,
  className,
}: SegmentedControlProps) {
  return (
    <div
      className={cn(
        "inline-flex bg-white/[0.04] rounded-xl p-1 gap-0.5",
        className
      )}
    >
      {options.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          className={cn(
            "px-3 py-1.5 text-sm rounded-lg transition-all",
            value === opt.value
              ? "bg-white/[0.1] text-white font-medium"
              : "text-muted hover:text-white/60"
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
