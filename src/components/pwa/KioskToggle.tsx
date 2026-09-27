"use client";

import { useEffect, useState } from "react";
import { useKiosk } from "@/store/kiosk";

/** Toggle Mode Kios: layar tetap nyala selama app terbuka. */
export function KioskToggle() {
  const { enabled, setEnabled } = useKiosk();
  const [supported, setSupported] = useState(true);

  useEffect(() => {
    setSupported(typeof navigator !== "undefined" && "wakeLock" in navigator);
  }, []);

  if (!supported) return null;

  return (
    <label className="mb-3 flex items-center gap-2 rounded-lg border-[2.5px] border-ink bg-white px-3 py-2.5">
      <input
        type="checkbox"
        checked={enabled}
        onChange={(e) => setEnabled(e.target.checked)}
        className="h-4 w-4 accent-yellow-400"
      />
      <span className="text-sm font-bold">
        🖥️ Mode Kios (layar selalu nyala)
        <span className="block text-[11px] font-semibold text-ink/50">
          Cegah layar HP mati saat kasir terbuka — koneksi printer Bluetooth jadi jauh lebih stabil
        </span>
      </span>
    </label>
  );
}
