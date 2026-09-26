"use client";

import { useEffect, useState } from "react";
import { Sheet } from "@/components/ui/Sheet";
import { cn, formatNumber, formatRupiah } from "@/lib/utils";

interface PaymentSheetProps {
  open: boolean;
  onClose: () => void;
  total: number;
  loading: boolean;
  onlineOnly?: boolean;
  onPay: (method: "CASH" | "QRIS", cashReceived?: number) => void;
}

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "C", "0", "⌫"];

/**
 * Sheet pembayaran all-in-one, compact tanpa scroll: numpad langsung tampil,
 * toggle Tunai/QRIS, chip nominal cepat, kembalian live di-highlight.
 *
 * Aturan input: nilai SELALU reset saat dibuka; digit pertama setelah
 * preset/chip MENGGANTI nilai (bukan append) — 100 lalu tekan 1 → 1.
 */
export function PaymentSheet({ open, onClose, total, loading, onlineOnly, onPay }: PaymentSheetProps) {
  const [method, setMethod] = useState<"CASH" | "QRIS">("CASH");
  const [raw, setRaw] = useState("");
  const [presetActive, setPresetActive] = useState(false); // true = ketikan berikutnya mengganti

  // Reset setiap kali sheet dibuka
  useEffect(() => {
    if (open) {
      setRaw("");
      setMethod("CASH");
      setPresetActive(false);
    }
  }, [open]);

  const value = raw === "" ? 0 : parseInt(raw, 10);
  const change = Math.max(0, value - total);
  const enough = value >= total;
  const cashMode = !onlineOnly && method === "CASH";

  const press = (k: string) => {
    if (k === "⌫") {
      setRaw((r) => r.slice(0, -1));
      setPresetActive(false);
    } else if (k === "C") {
      setRaw("");
      setPresetActive(false);
    } else {
      setRaw((r) => {
        // digit pertama setelah preset MENGGANTI, bukan append
        if (presetActive) {
          setPresetActive(false);
          return k;
        }
        return r.length >= 12 ? r : (r + k).replace(/^0+(?=\d)/, "");
      });
    }
  };

  const setPreset = (v: number) => {
    setRaw(String(v));
    setPresetActive(true); // tandai: ketikan berikutnya mengganti
  };

  // Nominal cepat: pas + pecahan umum (tanpa duplikat, ≤ total×10 agar relevan)
  const quick = [...new Set([total, 50000, 100000, 200000].filter((v) => v <= Math.max(total, 200000)))].slice(0, 4);

  return (
    <Sheet open={open} onClose={() => !loading && onClose()} title="Pembayaran" maxWidth="max-w-sm">
      <div className="space-y-2">
        {/* Total */}
        <div className="rounded-xl border-[2.5px] border-ink bg-white px-3 py-2 text-center shadow-neo-sm">
          <p className="text-[9px] font-bold uppercase tracking-wide text-ink/50">Total Tagihan</p>
          <p className="num text-2xl font-bold leading-tight">{formatRupiah(total)}</p>
        </div>

        {/* Kembalian — highlight besar */}
        {cashMode && (
          <div
            className={cn(
              "rounded-xl border-[2.5px] border-ink px-3 py-2 text-center shadow-neo-sm",
              enough ? "bg-lime" : raw === "" ? "bg-cream" : "bg-danger text-white"
            )}
          >
            <p className="text-[9px] font-bold uppercase tracking-wide opacity-60">
              {enough ? "Kembalian" : raw === "" ? "Masukkan uang diterima" : "Uang Kurang"}
            </p>
            <p className="num text-3xl font-bold leading-tight">
              {raw === "" ? "—" : formatRupiah(enough ? change : total - value)}
            </p>
          </div>
        )}

        {/* Metode */}
        {onlineOnly ? (
          <p className="rounded-xl border-[2.5px] border-ink bg-teal px-3 py-2 text-center text-[11px] font-bold uppercase tracking-wide">
            Dibayar via platform (GoFood/GrabFood/ShopeeFood)
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-2 rounded-xl border-[2.5px] border-ink bg-white p-1">
            {(["CASH", "QRIS"] as const).map((m) => (
              <button
                key={m}
                onClick={() => setMethod(m)}
                className={cn(
                  "rounded-lg border-2 py-2 text-xs font-bold uppercase tracking-wide transition-all",
                  method === m ? "border-ink bg-sun shadow-neo-sm" : "border-transparent text-ink/50"
                )}
              >
                {m === "CASH" ? "💵 Tunai" : "📱 QRIS"}
              </button>
            ))}
          </div>
        )}

        {cashMode && (
          <>
            {/* Chip nominal cepat */}
            <div className="grid grid-cols-4 gap-1.5">
              <button
                onClick={() => setPreset(total)}
                className={cn(
                  "rounded-lg border-2 border-ink py-2 text-[11px] font-bold uppercase shadow-neo-sm active:translate-x-[1px] active:translate-y-[1px] active:shadow-none",
                  presetActive && raw === String(total) ? "bg-sun" : "bg-teal"
                )}
              >
                Pas
              </button>
              {quick.slice(1).map((v) => (
                <button
                  key={v}
                  onClick={() => setPreset(v)}
                  className={cn(
                    "num rounded-lg border-2 border-ink py-2 text-[11px] font-bold shadow-neo-sm active:translate-x-[1px] active:translate-y-[1px] active:shadow-none",
                    presetActive && raw === String(v) ? "bg-sun" : "bg-white"
                  )}
                >
                  {v >= 1000000 ? `${v / 1000000}jt` : `${v / 1000}rb`}
                </button>
              ))}
            </div>

            {/* Layar nilai diterima */}
            <div className="rounded-xl border-[2.5px] border-ink bg-white px-3 py-1.5 text-right">
              <span className="block text-[9px] font-bold uppercase tracking-wide text-ink/50">Uang Diterima</span>
              <span className="num text-xl font-bold">{formatNumber(value)}</span>
            </div>

            {/* Numpad — tinggi dipadatkan */}
            <div className="grid grid-cols-3 gap-1.5">
              {KEYS.map((k) => (
                <button
                  key={k}
                  onClick={() => press(k)}
                  className={cn(
                    "flex h-10 items-center justify-center rounded-lg border-[2.5px] border-ink font-display text-lg font-bold shadow-neo-sm transition-all active:translate-x-[2px] active:translate-y-[2px] active:shadow-none",
                    k === "C" ? "bg-candy text-sm text-white" : "bg-white"
                  )}
                >
                  {k}
                </button>
              ))}
            </div>

            <button
              disabled={!enough || loading}
              onClick={() => onPay("CASH", value)}
              className="w-full rounded-xl border-[2.5px] border-ink bg-sun py-3 font-display text-base font-bold uppercase tracking-wide shadow-neo transition-all active:translate-x-[3px] active:translate-y-[3px] active:shadow-none disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none disabled:active:translate-x-0 disabled:active:translate-y-0"
            >
              {loading ? "Memproses…" : "Bayar Sekarang"}
            </button>
          </>
        )}

        {!cashMode && (
          <button
            disabled={loading}
            onClick={() => onPay("QRIS")}
            className="w-full rounded-xl border-[2.5px] border-ink bg-lime py-3.5 font-display text-base font-bold uppercase tracking-wide shadow-neo transition-all active:translate-x-[3px] active:translate-y-[3px] active:shadow-none disabled:opacity-50"
          >
            {loading ? "Memproses…" : "Tandai Lunas"}
          </button>
        )}
      </div>
    </Sheet>
  );
}
