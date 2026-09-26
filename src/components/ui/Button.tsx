"use client";

import { cn } from "@/lib/utils";
import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "dark" | "teal" | "candy" | "danger" | "ghost" | "lime";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: "sm" | "md" | "lg";
  children: ReactNode;
}

const variants: Record<Variant, string> = {
  primary: "bg-sun text-ink shadow-neo hover:bg-[#ffe066] active:translate-x-[3px] active:translate-y-[3px] active:shadow-none",
  dark: "bg-ink text-white shadow-neo hover:bg-[#2a2a2a] active:translate-x-[3px] active:translate-y-[3px] active:shadow-none",
  teal: "bg-teal text-ink shadow-neo hover:bg-[#66d9d1] active:translate-x-[3px] active:translate-y-[3px] active:shadow-none",
  candy: "bg-candy text-white shadow-neo hover:bg-[#ff7fab] active:translate-x-[3px] active:translate-y-[3px] active:shadow-none",
  lime: "bg-lime text-ink shadow-neo hover:bg-[#d1f87e] active:translate-x-[3px] active:translate-y-[3px] active:shadow-none",
  danger: "bg-danger text-white shadow-neo hover:bg-[#f5556e] active:translate-x-[3px] active:translate-y-[3px] active:shadow-none",
  ghost: "bg-transparent text-ink border-transparent shadow-none hover:bg-ink/5",
};

const sizes = {
  sm: "px-3 py-1.5 text-xs",
  md: "px-4 py-2.5 text-sm",
  lg: "px-6 py-4 text-base",
};

export function Button({ variant = "primary", size = "md", className, children, ...props }: ButtonProps) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-lg border-[2.5px] border-ink font-display font-bold uppercase tracking-wide transition-all disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none disabled:active:translate-x-0 disabled:active:translate-y-0",
        variants[variant],
        sizes[size],
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
}
