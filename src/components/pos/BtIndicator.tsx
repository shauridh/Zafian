"use client";

import { useEffect, useState } from "react";
import { useBtPrinter, type BtStatus } from "@/store/bt-printer";
import { btEnsureConnected, btSavedName } from "@/lib/bt-printer";
import { useUI } from "@/store/ui";

/**
 * Indikator status printer Bluetooth — icon-only, menempel di sidebar bawah
 * (sejajar tombol Keluar) supaya halaman kasir tidak bertambah tinggi.
 * Klik icon = sambung ulang senyap (tanpa dialog, tanpa test print).
 */
export function BtIndicator() {
  const { status, printerName, lastPrintAt, queueCount, setStatus } = useBtPrinter();
  const { toast } = useUI();
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState(false);

  // Flash singkat setiap berhasil cetak
  useEffect(() => {
    if (!lastPrintAt) return;
    setFlash(true);
    const t = setTimeout(() => setFlash(false), 1500);
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

  const handleClick = async () => {
    if (busy || status === "connected" || status === "unsupported") return;
    setBusy(true);
    setStatus("connecting");
    const ok = await btEnsureConnected();
    if (ok) toast("Printer tersambung ✓", "success");
    else setStatus("disconnected");
    setBusy(false);
  };

  const title =
    status === "connected"
      ? `Printer siap${printerName ? `: ${printerName}` : ""}${queueCount > 0 ? ` — ${queueCount} struk mengantri` : ""}`
      : status === "connecting"
        ? "Menyambung printer…"
        : status === "unsupported"
          ? "Browser tidak mendukung Web Bluetooth"
          : `Printer terputus${queueCount > 0 ? ` — ${queueCount} struk mengantri, akan tercetak otomatis` : ""} — klik untuk sambung ulang`;

  const dotColor =
    status === "connected" ? "bg-teal" : status === "connecting" ? "bg-sun" : status === "disconnected" ? "bg-candy" : "bg-ink/40";

  return (
    <button
      onClick={handleClick}
      title={title}
      aria-label={title}
      className="relative flex h-9 w-9 items-center justify-center rounded-xl border-[2.5px] border-ink bg-white shadow-neo-sm active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
    >
      <span className="text-base leading-none">🖨️</span>
      <span className={`absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border border-ink ${dotColor}`}>
        {status === "connected" && (
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-teal opacity-60" />
        )}
      </span>
      {flash && <span className="absolute -top-1 -left-1 text-xs">✅</span>}
      {queueCount > 0 && (
        <span className="absolute -bottom-1 -left-1 flex h-4 min-w-4 items-center justify-center rounded-full border border-ink bg-sun px-1 text-[9px] font-bold">
          {queueCount}
        </span>
      )}
    </button>
  );
}
