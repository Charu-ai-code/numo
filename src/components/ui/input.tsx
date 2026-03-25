"use client";

import { cn } from "@/lib/utils";
import { forwardRef } from "react";

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, error, ...props }, ref) => {
    return (
      <div className="space-y-1.5">
        {label && (
          <label className="block text-sm text-muted">{label}</label>
        )}
        <input
          ref={ref}
          className={cn(
            "w-full px-4 py-2.5 bg-white/[0.05] border border-white/[0.08] rounded-xl text-white placeholder:text-white/30 outline-none transition-all focus:border-accent-blue/50 focus:bg-white/[0.07]",
            error && "border-accent-coral/50",
            className
          )}
          {...props}
        />
        {error && <p className="text-xs text-accent-coral">{error}</p>}
      </div>
    );
  }
);

Input.displayName = "Input";
