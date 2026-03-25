import { cn } from "@/lib/utils";

interface ShimmerProps {
  className?: string;
}

export function Shimmer({ className }: ShimmerProps) {
  return <div className={cn("shimmer", className)} />;
}

export function ShimmerCard() {
  return (
    <div className="glass p-4 space-y-3">
      <Shimmer className="h-4 w-1/3" />
      <Shimmer className="h-8 w-2/3" />
      <Shimmer className="h-3 w-1/2" />
    </div>
  );
}
