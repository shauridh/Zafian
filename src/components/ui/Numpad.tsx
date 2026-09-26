"use client";

import { useEffect, useState } from "react";
import { Sheet } from "./Sheet";
import { formatNumber } from "@/lib/utils";
import { cn } from "@/lib/utils";

interface NumpadProps {
  open: boolean;
  onClose: () => void;
  /**
   * Dipanggil saat tombol konfirmasi ditekan. PARENT wajib menutup numpad
   * (memanggil onClose) di dalam onSubmit — Numpad tidak menutup otomatis
   * agar tidak bentrok dengan transisi state parent.
   */
  onSubmit: (value: number) => void;
  title: string;
  subtitle?: string;
  quickAmounts?: number[];
  confirmLabel?: string;
}

/**
 * Numpad custom in-app. Nilai SELALU direset ke 0 setiap kali dibuka,
 * ditutup, maupun setelah submit — tidak ada nilai sisa dari input sebelumnya.
 */
export function Numpad({
  open,
  onClose,
  onSubmit,
  title,
  subtitle,
  quickAmounts,
  confirmLabel = "OK",
}: NumpadProps) {
  const [raw, setRaw] = useState("");
  const [presetActive, setPresetActive] = useState(false); // true = digit berikutnya mengganti

  // Reset di setiap perubahan open (buka MAUPUN tutup) — anti nilai sisa
  useEffect(() => {
    setRaw("");
    setPresetActive(false);
  }, [open]);

  const press = (key: string) => {
    if (key === "back") {
      setRaw((r) => r.slice(0, -1));
      setPresetActive(false);
    } else if (key === "clear") {
      setRaw("");
      setPresetActive(false);
    } else {
      setRaw((r) => {
        // digit pertama setelah preset MENGGANTI nilai, bukan append (100 + tekan 1 → 1)
        if (presetActive) {
          setPresetActive(false);
          return key;
        }
        return r.length >= 12 ? r : (r + key).replace(/^0+(?=\d)/, "");
      });
    }
  };

  const value = raw === "" ? 0 : parseInt(raw, 10);

  const submit = () => {
    const v = value;
    setRaw(""); // reset segera agar tidak ada sisa jika dibuka lagi
    onSubmit(v); // parent yang memutuskan menutup / melanjutkan flow
  };

  const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "clear", "0", "back"];

  return (
    <Sheet open={open} onClose={onClose} title={title} maxWidth="max-w-md">
      {subtitle && (
        <p className="mb-2 text-center text-xs font-semibold uppercase tracking-wide text-ink/60">
          {subtitle}
        </p>
      )}
      <div className="mb-3 rounded-xl border-[2.5px] border-ink bg-white px-4 py-4 text-right shadow-neo-sm">
        <span className="num text-3xl font-bold tracking-tight">
          {formatNumber(value)}
        </span>
      </div>

      {quickAmounts && quickAmounts.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-2">
          {quickAmounts.map((amount) => (
            <button
              key={amount}
              onClick={() => {
                setRaw(String(amount));
                setPresetActive(true); // digit berikutnya mengganti nilai
              }}
              className="num rounded-lg border-2 border-ink bg-teal px-3 py-2 text-sm font-bold shadow-neo-sm active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
            >
              {formatNumber(amount)}
            </button>
          ))}
        </div>
      )}

      <div className="grid grid-cols-3 gap-2">
        {keys.map((key) => (
          <button
            key={key}
            onClick={() => press(key)}
            className={cn(
              "flex h-14 items-center justify-center rounded-xl border-[2.5px] border-ink font-display text-xl font-bold shadow-neo-sm transition-all active:translate-x-[2px] active:translate-y-[2px] active:shadow-none",
              key === "clear" && "bg-candy text-white text-base",
              key === "back" && "bg-white text-base",
              key !== "clear" && key !== "back" && "bg-white"
            )}
          >
            {key === "back" ? "⌫" : key === "clear" ? "C" : key}
          </button>
        ))}
      </div>

      <button
        onClick={submit}
        className="mt-3 w-full rounded-xl border-[2.5px] border-ink bg-sun py-4 font-display text-lg font-bold uppercase tracking-wide shadow-neo transition-all active:translate-x-[3px] active:translate-y-[3px] active:shadow-none"
      >
        {confirmLabel}
      </button>
    </Sheet>
  );
}
