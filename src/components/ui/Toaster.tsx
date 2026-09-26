"use client";

import { useUI } from "@/store/ui";
import { cn } from "@/lib/utils";

export function Toaster() {
  const { toasts, dismiss } = useUI();

  if (toasts.length === 0) return null;

  return (
    <div className="pointer-events-none fixed left-1/2 top-3 z-[100] flex w-full max-w-sm -translate-x-1/2 flex-col gap-2 px-3">
      {toasts.map((t) => (
        <button
          key={t.id}
          onClick={() => dismiss(t.id)}
          className={cn(
            "pointer-events-auto w-full rounded-xl border-[2.5px] border-ink px-4 py-3 text-left text-sm font-bold shadow-neo animate-pop-in",
            t.type === "success" && "bg-lime text-ink",
            t.type === "error" && "bg-danger text-white",
            t.type === "info" && "bg-white text-ink"
          )}
        >
          {t.message}
        </button>
      ))}
    </div>
  );
}
