"use client";

import { cn } from "@/lib/utils";
import { Plus } from "lucide-react";

interface FABProps {
  onClick: () => void;
  className?: string;
}

export function FAB({ onClick, className }: FABProps) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "fixed bottom-24 lg:bottom-8 right-6 w-14 h-14 rounded-full bg-accent-green text-obsidian flex items-center justify-center shadow-lg shadow-accent-green/20 hover:scale-105 transition-transform z-40",
        className
      )}
    >
      <Plus className="w-6 h-6" />
    </button>
  );
}
