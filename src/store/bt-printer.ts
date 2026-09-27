"use client";

import { create } from "zustand";

export type BtStatus = "disabled" | "unsupported" | "disconnected" | "connecting" | "connected";

interface BtPrinterState {
  status: BtStatus;
  printerName: string | null;
  lastPrintAt: number | null;
  lastError: string | null;
  setStatus: (status: BtStatus) => void;
  setPrinterName: (name: string | null) => void;
  markPrinted: () => void;
  setError: (msg: string | null) => void;
}

/** Status koneksi printer Bluetooth — dipakai indikator header kasir & settings. */
export const useBtPrinter = create<BtPrinterState>((set) => ({
  status: "disconnected",
  printerName: null,
  lastPrintAt: null,
  lastError: null,
  setStatus: (status) => set({ status }),
  setPrinterName: (printerName) => set({ printerName }),
  markPrinted: () => set({ lastPrintAt: Date.now(), lastError: null }),
  setError: (lastError) => set({ lastError }),
}));
