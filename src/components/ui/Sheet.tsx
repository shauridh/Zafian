"use client";

import { useEffect, type ReactNode } from "react";
import { cn } from "@/lib/utils";

interface SheetProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  maxWidth?: string;
}

export function Sheet({ open, onClose, title, children, maxWidth = "max-w-lg" }: SheetProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <div
        className="absolute inset-0 bg-ink/50 animate-fade-in"
        onClick={onClose}
        aria-hidden
      />
      <div
        className={cn(
          "relative z-10 max-h-[92dvh] w-full overflow-y-auto rounded-t-2xl border-[2.5px] border-ink bg-cream p-4 shadow-neo-lg animate-sheet-up sm:rounded-2xl sm:animate-pop-in sm:pb-4",
          "pb-[calc(1rem+env(safe-area-inset-bottom))]",
          maxWidth
        )}
      >
        {title && (
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-display text-lg font-bold uppercase tracking-wide">{title}</h2>
            <button
              onClick={onClose}
              className="flex h-9 w-9 items-center justify-center rounded-lg border-2 border-ink bg-white font-bold shadow-neo-sm active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
              aria-label="Tutup"
            >
              ✕
            </button>
          </div>
        )}
        {children}
      </div>
    </div>
  );
}
