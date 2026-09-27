"use client";

import { useEffect, useState } from "react";
import { useBtPrinter, type BtStatus } from "@/store/bt-printer";
import { btEnsureConnected, btSavedName } from "@/lib/bt-printer";

const META: Record<BtStatus, { dot: string; text: string; label: string; bg: string }> = {
  connected: { dot: "bg-teal", text: "text-ink", label: "Printer siap", bg: "bg-white" },
  connecting: { dot: "bg-sun", text: "text-ink", label: "Menyambung…", bg: "bg-white" },
  disconnected: { dot: "bg-candy", text: "text-white", label: "Printer putus", bg: "bg-candy" },
  unsupported: { dot: "bg-ink/40", text: "text-white", label: "BT tak didukung", bg: "bg-ink/40" },
  disabled: { dot: "bg-ink/40", text: "text-white", label: "BT nonaktif", bg: "bg-ink/40" },
};

/**
 * Pill status koneksi printer Bluetooth untuk header halaman kasir.
 * Klik pill = coba sambung ulang senyap (tanpa dialog).
 */
export function BtIndicator() {
  const { status, printerName, lastPrintAt, setStatus } = useBtPrinter();
  const [busy, setBusy] = useState(false);
  const [showFlash, setShowFlash] = useState(false);

  // Flash singkat setiap berhasil cetak
  useEffect(() => {
    if (!lastPrintAt) return;
    setShowFlash(true);
    const t = setTimeout(() => setShowFlash(false), 1500);
    return () => clearTimeout(t);
  }, [lastPrintAt]);

  // Retry senyap otomatis setiap 15 detik saat printer terputus
  useEffect(() => {
    if (status !== "disconnected" || !btSavedName()) return;
    const iv = setInterval(() => {
      btEnsureConnected();
    }, 15000);
    return () => clearInterval(iv);
  }, [status]);

  const m = META[status];

  const handleClick = async () => {
    if (busy || status === "connected" || status === "unsupported") return;
    setBusy(true);
    setStatus("connecting");
    const ok = await btEnsureConnected();
    if (!ok) setStatus("disconnected");
    setBusy(false);
  };

  return (
    <button
      onClick={handleClick}
      title={printerName ? `${printerName} — klik untuk sambung ulang` : "Klik untuk sambung printer"}
      className={`flex shrink-0 items-center gap-2 border-b-[2.5px] border-ink px-4 py-1.5 text-left transition-colors ${m.bg}`}
    >
      <span className={`relative flex h-2.5 w-2.5`}>
        {status === "connected" && (
          <span className={`absolute inline-flex h-full w-full animate-ping rounded-full ${m.dot} opacity-60`} />
        )}
        <span className={`relative inline-flex h-2.5 w-2.5 rounded-full border border-ink ${m.dot}`} />
      </span>
      <span className={`text-[11px] font-bold uppercase tracking-wide ${status === "disconnected" || status === "unsupported" ? "text-white" : "text-ink/70"}`}>
        {showFlash ? "✅ Struk tercetak" : m.label}
        {printerName && status === "connected" && (
          <span className="ml-1 font-semibold normal-case text-ink/50">· {printerName}</span>
        )}
      </span>
    </button>
  );
}
