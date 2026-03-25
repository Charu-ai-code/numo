import { cn } from "@/lib/utils";

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  hover?: boolean;
}

export function Card({ className, hover, children, ...props }: CardProps) {
  return (
    <div
      className={cn(hover ? "glass-hover" : "glass", "p-4", className)}
      {...props}
    >
      {children}
    </div>
  );
}
