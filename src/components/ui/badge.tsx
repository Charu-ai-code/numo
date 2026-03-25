import { cn } from "@/lib/utils";

interface BadgeProps {
  children: React.ReactNode;
  variant?: "default" | "green" | "coral" | "amber" | "blue";
  className?: string;
}

export function Badge({ children, variant = "default", className }: BadgeProps) {
  const variants = {
    default: "bg-white/[0.08] text-white/70",
    green: "bg-accent-green/15 text-accent-green",
    coral: "bg-accent-coral/15 text-accent-coral",
    amber: "bg-accent-amber/15 text-accent-amber",
    blue: "bg-accent-blue/15 text-accent-blue",
  };

  return (
    <span
      className={cn(
        "inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-md",
        variants[variant],
        className
      )}
    >
      {children}
    </span>
  );
}
