"use client";

import { cn } from "@/lib/utils";

interface ChipProps {
  children: React.ReactNode;
  active?: boolean;
  onClick?: () => void;
  className?: string;
}

export function Chip({ children, active, onClick, className }: ChipProps) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "px-3 py-1.5 text-sm rounded-full transition-all whitespace-nowrap",
        active
          ? "bg-accent-blue/20 text-accent-blue border border-accent-blue/30"
          : "bg-white/[0.05] text-muted border border-white/[0.06] hover:bg-white/[0.08]",
        className
      )}
    >
      {children}
    </button>
  );
}
