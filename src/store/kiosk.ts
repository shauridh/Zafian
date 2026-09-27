"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

interface KioskState {
  enabled: boolean;
  setEnabled: (v: boolean) => void;
}

/** Mode Kios: layar tetap nyala selama app terbuka (Screen Wake Lock API). */
export const useKiosk = create<KioskState>()(
  persist(
    (set) => ({
      enabled: false,
      setEnabled: (enabled) => set({ enabled }),
    }),
    { name: "zafian-kiosk" }
  )
);
