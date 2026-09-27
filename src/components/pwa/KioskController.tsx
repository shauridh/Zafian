"use client";

import { useEffect } from "react";
import { useKiosk } from "@/store/kiosk";

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Menahan layar tetap nyala selama Mode Kios aktif dan app terlihat.
 * Efek samping positif: Chrome Android tidak men-throttle JS di foreground
 * terang → keep-alive Bluetooth jalan terus → koneksi printer jauh lebih stabil.
 * Wake lock otomatis dilepas OS saat layar dimatikan manual / app ditutup.
 */
export function KioskController() {
  const enabled = useKiosk((s) => s.enabled);

  useEffect(() => {
    if (!enabled) return;
    let sentinel: any = null;
    let cancelled = false;

    const acquire = async () => {
      try {
        const wl = (navigator as any).wakeLock;
        if (!wl) return;
        sentinel = await wl.request("screen");
        sentinel.addEventListener?.("release", () => {
          sentinel = null;
        });
      } catch {
        /* baterai kritis / tidak didukung — abaikan */
      }
    };

    const onVisible = () => {
      if (document.visibilityState === "visible" && !sentinel && !cancelled) acquire();
    };

    acquire();
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
      try {
        sentinel?.release?.();
      } catch {
        /* noop */
      }
      sentinel = null;
    };
  }, [enabled]);

  return null;
}
