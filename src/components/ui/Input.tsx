"use client";

import { cn } from "@/lib/utils";
import type { InputHTMLAttributes, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
}

export function Input({ label, className, ...props }: InputProps) {
  return (
    <label className="block">
      {label && (
        <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-ink/70">
          {label}
        </span>
      )}
      <input
        className={cn(
          "w-full rounded-lg border-[2.5px] border-ink bg-white px-3 py-2.5 text-sm font-semibold text-ink placeholder:font-normal placeholder:text-ink/40 focus:outline-none focus:ring-2 focus:ring-sun",
          className
        )}
        {...props}
      />
    </label>
  );
}

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
}

export function Select({ label, className, children, ...props }: SelectProps) {
  return (
    <label className="block">
      {label && (
        <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-ink/70">
          {label}
        </span>
      )}
      <select
        className={cn(
          "w-full rounded-lg border-[2.5px] border-ink bg-white px-3 py-2.5 text-sm font-semibold text-ink focus:outline-none focus:ring-2 focus:ring-sun",
          className
        )}
        {...props}
      >
        {children}
      </select>
    </label>
  );
}

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
}

export function Textarea({ label, className, ...props }: TextareaProps) {
  return (
    <label className="block">
      {label && (
        <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-ink/70">
          {label}
        </span>
      )}
      <textarea
        className={cn(
          "w-full rounded-lg border-[2.5px] border-ink bg-white px-3 py-2.5 text-sm font-semibold text-ink placeholder:font-normal placeholder:text-ink/40 focus:outline-none focus:ring-2 focus:ring-sun",
          className
        )}
        {...props}
      />
    </label>
  );
}
