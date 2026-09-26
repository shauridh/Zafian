import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

interface BadgeProps {
  children: ReactNode;
  className?: string;
}

export function Badge({ children, className }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-lg border-2 border-ink px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide",
        "bg-white text-ink",
        className
      )}
    >
      {children}
    </span>
  );
}
