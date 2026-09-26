import { cn } from "@/lib/utils";
import type { HTMLAttributes, ReactNode } from "react";

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
}

export function Card({ className, children, ...props }: CardProps) {
  return (
    <div
      className={cn(
        "rounded-chunky border-[2.5px] border-ink bg-white shadow-neo",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}
