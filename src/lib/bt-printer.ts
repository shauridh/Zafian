"use client";

/**
 * Cetak ESC/POS langsung dari browser ke printer thermal Bluetooth (BLE)
 * memakai Web Bluetooth API — didukung Chrome/Edge (Android, ChromeOS, desktop).
 * Tidak butuh aplikasi tambahan (beda dengan QZ Tray yang hanya desktop).
 *
 * Alur: pilih perangkat sekali via dialog Chrome → perangkat diingat di
 * localStorage → konek otomatis berikutnya (klik "Ganti Printer" untuk pilih ulang).
 *
 * Catatan: Web Bluetooth butuh user gesture (klik) dan HTTPS (Vercel sudah HTTPS;
 * untuk lokal, localhost juga diizinkan). Umumnya printer thermal BLE memakai
 * service UUID fff0 + characteristic fff2 (atau 18f0/2af1) — keduanya dicoba.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import { useBtPrinter } from "@/store/bt-printer";

const STORAGE_KEY = "zafian-bt-printer";

export function btSupported(): boolean {
  return typeof navigator !== "undefined" && !!(navigator as any).bluetooth;
}

export function btSavedName(): string | null {
  if (typeof localStorage === "undefined") return null;
  return localStorage.getItem(STORAGE_KEY);
}

export function btForget(): void {
  localStorage.removeItem(STORAGE_KEY);
}

/** Lupakan printer tersimpan + putus koneksi aktif (untuk pairing ulang bersih). */
export async function btForgetDevice(): Promise<void> {
  try {
    if (cached?.server?.connected) cached.server.disconnect();
  } catch {
    /* noop */
  }
  cached = null;
  const bt = (navigator as any).bluetooth;
  try {
    const devices = await bt?.getDevices?.();
    const saved = btSavedName();
    const found = (devices as any[] | undefined)?.find((d) => d.name === saved);
    await found?.forget?.();
  } catch {
    /* forget() butuh Chrome newer — abaikan */
  }
  btForget();
}

/** Tombol "Cetak" yang memicu requestDevice harus dipicu dari klik user. */
async function pickDevice(): Promise<any> {
  const bt = (navigator as any).bluetooth;
  if (!bt) throw new Error("Browser ini tidak mendukung Web Bluetooth. Gunakan Chrome di Android/desktop.");
  // acceptAllDevices + optionalServices agar kompatibel dengan mayoritas printer thermal.
  return bt.requestDevice({
    acceptAllDevices: true,
    optionalServices: ["0000fff0-0000-1000-8000-00805f9b34fb", "000018f0-0000-1000-8000-00805f9b34fb", "e7810a71-73ae-499d-8c15-faa9aef0c3f2"],
  });
}

/** Konek ke perangkat teringat (auto) atau pilih baru (kalau belum ada / force). */
async function connectDevice(forcePick = false): Promise<any> {
  const saved = btSavedName();
  if (!forcePick && saved) {
    const bt = (navigator as any).bluetooth;
    if (!bt) throw new Error("Web Bluetooth tidak tersedia di browser ini.");
    try {
      const device = await bt.getDevices();
      const found = (device as any[]).find((d) => d.name === saved);
      if (found) return await connectGattResilient(found);
    } catch {
      /* getDevices belum didukung → lanjut pilih manual */
    }
  }
  const device = await pickDevice();
  localStorage.setItem(STORAGE_KEY, device.name || "Printer Bluetooth");
  return connectGattResilient(device);
}

let cached: { server: any; char: any } | null = null;

/**
 * Konek GATT dengan retry. "Connection attempt failed" umumnya karena:
 * printer tidur / koneksi setengah-terbuka dari app lain / MTU belum siap.
 * Reset koneksi + tunggu + coba lagi biasanya menyelesaikan.
 */
async function connectGattResilient(device: any): Promise<any> {
  const MAX = 3;
  const btStore = useBtPrinter.getState();
  btStore.setStatus("connecting");
  for (let attempt = 1; attempt <= MAX; attempt++) {
    try {
      // Reset koneksi setengah-terbuka dari percobaan/sesi sebelumnya
      try {
        device.gatt.disconnect();
        await new Promise((r) => setTimeout(r, 250));
      } catch {
        /* perangkat mungkin belum pernah konek — abaikan */
      }
      const conn = await connectGatt(device);
      btStore.setStatus("connected");
      btStore.setPrinterName(device.name || "Printer Bluetooth");
      return conn;
    } catch (e) {
      console.warn(`[bt] percobaan konek ${attempt}/${MAX} gagal:`, e);
      if (attempt < MAX) await new Promise((r) => setTimeout(r, 600 * attempt));
    }
  }
  btStore.setStatus("disconnected");
  throw new Error(
    "Gagal konek ke printer setelah 3 percobaan. Cek: (1) printer menyala & kertas terpasang, " +
      "(2) tidak sedang dipakai app lain (putuskan dulu), " +
      "(3) jarak < 2 m. Lalu coba lagi, atau tap Lupakan Printer lalu pairing ulang."
  );
}

async function connectGatt(device: any): Promise<any> {
  device.addEventListener?.("gattserverdisconnected", () => {
    console.warn("[bt] printer terputus:", device.name);
    cached = null;
  });
  const server = await device.gatt.connect();
  await new Promise((r) => setTimeout(r, 150)); // beri waktu GATT discovery
  // Coba service yang umum dipakai printer thermal
  const candidates = [
    { s: "0000fff0-0000-1000-8000-00805f9b34fb", c: "0000fff2-0000-1000-8000-00805f9b34fb" },
    { s: "000018f0-0000-1000-8000-00805f9b34fb", c: "00002af1-0000-1000-8000-00805f9b34fb" },
    { s: "e7810a71-73ae-499d-8c15-faa9aef0c3f2", c: "bef8d6c9-9c21-4c9e-b632-bd58c1009f9f" },
  ];
  for (const cand of candidates) {
    try {
      const service = await server.getPrimaryService(cand.s);
      const char = await service.getCharacteristic(cand.c);
      return { server, char };
    } catch {
      /* coba kandidat berikutnya */
    }
  }
  // Fallback terakhir: ambil characteristic pertama yang writable
  const services = await server.getPrimaryServices();
  for (const service of services) {
    const chars = await service.getCharacteristics();
    const writable = chars.find((c: any) => c.properties?.write || c.properties?.writeWithoutResponse);
    if (writable) return { server, char: writable };
  }
  throw new Error("Characteristic printer tidak ditemukan. Printer mungkin tidak kompatibel BLE print.");
}

/**
 * Keep-alive: kirim "dummy feed" 1mm (ESC @ tidak mencetak apa pun — hanya reset
 * internal, tanpa paper movement terlihat) supaya koneksi GATT tidak di-drop
 * printer yang sleep. Ini yang membuat reconnect TIDAK butuh test print lagi.
 */
const IDLE_PING = new Uint8Array([0x1b, 0x40, 0x0a]); // init + 1 linefeed kosong

let keepAliveTimer: ReturnType<typeof setInterval> | null = null;

function startKeepAlive() {
  if (keepAliveTimer) return;
  keepAliveTimer = setInterval(async () => {
    if (!cached?.server?.connected) return;
    try {
      await writeData(cached.char, IDLE_PING);
    } catch {
      console.warn("[bt] keep-alive gagal — printer mungkin terputus");
    }
  }, 25_000); // tiap 25 detik
}

export function btStopKeepAlive() {
  if (keepAliveTimer) clearInterval(keepAliveTimer);
  keepAliveTimer = null;
}

/**
 * Pastikan printer siap tanpa dialog: kalau perangkat sudah pernah diizinkan
 * (sudah pernah dipilih lewat dialog), Chrome mengizinkan reconnect senyap via
 * navigator.bluetooth.getDevices() — TANPA user gesture.
 * Dipanggil otomatis saat halaman kasir dibuka & tiap 15 detik saat disconnected.
 */
export async function btEnsureConnected(): Promise<boolean> {
  const btStore = useBtPrinter.getState();
  if (!btSupported()) {
    btStore.setStatus("unsupported");
    return false;
  }
  if (!btSavedName()) {
    btStore.setStatus("disconnected");
    return false;
  }
  if (cached?.server?.connected) {
    btStore.setStatus("connected");
    btStore.setPrinterName(btSavedName());
    startKeepAlive();
    return true;
  }
  try {
    const bt = (navigator as any).bluetooth;
    if (!bt?.getDevices) return false;
    const devices = await bt.getDevices();
    const found = (devices as any[]).find((d) => d.name === btSavedName());
    if (!found) {
      btStore.setStatus("disconnected");
      return false;
    }
    cached = await connectGattResilient(found);
    startKeepAlive();
    return true;
  } catch (e) {
    console.warn("[bt] auto-connect gagal (printer mati/di luar jangkauan):", e);
    btStore.setError(e instanceof Error ? e.message : String(e));
    cached = null;
    return false;
  }
}

/** Kirim byte ESC/POS dalam chunk ≤20 byte (MTU BLE default aman) dengan jeda kecil. */
async function writeData(char: any, data: Uint8Array): Promise<void> {
  const CHUNK = 20;
  for (let i = 0; i < data.length; i += CHUNK) {
    const chunk = data.slice(i, i + CHUNK);
    if (char.writeValueWithResponse) await char.writeValueWithResponse(chunk);
    else await char.writeValue(chunk);
    await new Promise((r) => setTimeout(r, 12));
  }
}

export async function btTestPrint(): Promise<void> {
  const { char } = await connectDevice();
  const enc = new TextEncoder();
  const body = "\x1B@\x1Ba\x01ZAFIAN POS\x1Ba\x00\nTes cetak Bluetooth OK\n\n\n";
  await writeData(char, enc.encode(body));
  await writeData(char, new Uint8Array([0x1d, 0x56, 0x42, 0x00])); // cut
}

/** Kirim byte mentah (mis. pola kalibrasi) ke printer Bluetooth. */
export async function btSendRaw(bytes: Uint8Array): Promise<void> {
  const btStore = useBtPrinter.getState();
  if (cached?.server?.connected) {
    await writeData(cached.char, bytes);
    btStore.markPrinted();
    return;
  }
  const conn = await connectDevice();
  cached = conn;
  await writeData(conn.char, bytes);
  btStore.markPrinted();
}

/* ========================= PERATAAN =========================
 * AUTO  : pakai perintah ESC/POS \x1Ba\x01 (standar — akurat di mayoritas printer)
 * SPACE : center manual dengan spasi (untuk printer yang mengabaikan \x1Ba\x01)
 * LEFT  : semua rata kiri
 * Kolom kanan (harga/total) selalu di-hitung manual via padding, jadi tidak terpengaruh.
 */
export type AlignMode = "AUTO" | "SPACE" | "LEFT";

export interface BtReceiptOptions {
  storeName: string;
  storeAddress?: string;
  storePhone?: string;
  orderNo: string;
  createdAt: string;
  cashierName: string;
  orderTypeLabel: string;
  items: { name: string; qty: number; price: number; discount: number; note?: string | null }[];
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  paymentLabel: string;
  cashReceived?: number | null;
  change?: number | null;
  footer?: string;
  promoText?: string;
  receiptQr?: boolean;
  qrText?: string;
  alignMode?: AlignMode;
  widthMm?: 58 | 80;
}

/* "Rp" + NBSP dari Intl membuat karakter aneh di font printer → format ASCII murni. */
export const rpAscii = (n: number) =>
  "Rp " + new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 }).format(n);

/** Bangun array byte struk — dipisah agar bisa dipakai ulang (kalibrasi/tes & QZ). */
export function buildReceiptBytes(opts: BtReceiptOptions): Uint8Array {
  const W = opts.widthMm === 80 ? 48 : 32;
  const align: AlignMode = opts.alignMode ?? "AUTO";
  const enc = new TextEncoder();
  const out: number[] = [];

  const push = (s: string) => {
    for (const b of enc.encode(s)) out.push(b);
  };
  const cmd = (...bytes: number[]) => out.push(...bytes);

  const raw = (s: string) => push(s + "\n");
  const line = () => raw("-".repeat(W));
  const row = (label: string, value: string) => {
    const space = Math.max(1, W - label.length - value.length);
    raw(label + " ".repeat(space) + value);
  };

  // center: kalau AUTO pakai perintah printer; kalau SPACE pakai padding manual
  const centerOn = () => (align === "SPACE" ? undefined : cmd(0x1b, 0x61, 0x01));
  const centerOff = () => (align === "SPACE" ? undefined : cmd(0x1b, 0x61, 0x00));
  const centerText = (s: string) => {
    if (align === "LEFT") return raw(s);
    const pad = Math.max(0, Math.floor((W - s.length) / 2));
    raw(" ".repeat(pad) + s);
  };

  cmd(0x1b, 0x40); // init
  centerOn();
  centerText(opts.storeName);
  centerOff();
  if (opts.storeAddress) {
    if (align === "LEFT") raw(opts.storeAddress);
    else centerText(opts.storeAddress);
  }
  if (opts.storePhone) {
    const t = `Telp: ${opts.storePhone}`;
    if (align === "LEFT") raw(t);
    else centerText(t);
  }
  line();

  row("No", opts.orderNo);
  row("Waktu", opts.createdAt);
  row("Kasir", opts.cashierName);
  row("Tipe", opts.orderTypeLabel);
  line();

  for (const i of opts.items) {
    raw(i.name);
    const lineTotal = i.price * i.qty - i.discount * i.qty;
    row(`  ${i.qty} x ${rpAscii(i.price)}`, rpAscii(lineTotal));
    if (i.note) raw(`  > ${i.note}`);
  }
  line();

  // PROMO (multi-baris)
  if (opts.promoText) {
    for (const p of opts.promoText.split("\n").filter((x) => x.trim())) {
      if (align === "LEFT") raw(p);
      else centerText(p.trim());
    }
    line();
  }

  row("Subtotal", rpAscii(opts.subtotal));
  if (opts.discount) row("Diskon", "-" + rpAscii(opts.discount));
  if (opts.tax) row("PPN", rpAscii(opts.tax));
  cmd(0x1b, 0x21, 0x30); // double height+width
  row("TOTAL", rpAscii(opts.total));
  cmd(0x1b, 0x21, 0x00);
  row(opts.paymentLabel, rpAscii(opts.cashReceived ?? opts.total));
  if (opts.change && opts.change > 0) row("Kembali", rpAscii(opts.change));
  line();

  // QR code (GS ( k — model 2)
  if (opts.receiptQr && opts.qrText) {
    if (align !== "LEFT") centerOn();
    const data = enc.encode(opts.qrText);
    const lenL = (data.length + 3) % 256;
    const lenH = Math.floor((data.length + 3) / 256);
    cmd(0x1d, 0x28, 0x6b, 0x04, 0x00, 0x31, 0x41, 0x32, 0x00); // model 2
    cmd(0x1d, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x43, 0x06); // ukuran modul 6
    cmd(0x1d, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x45, 0x31); // error correction M
    cmd(0x1d, 0x28, 0x6b, lenL, lenH, 0x31, 0x50, 0x30, ...data); // simpan data
    cmd(0x1d, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x51, 0x30); // cetak
    if (align !== "LEFT") centerOff();
    push("\n");
  }

  if (opts.footer) {
    if (align !== "LEFT") centerOn();
    if (align === "LEFT") raw(opts.footer);
    else centerText(opts.footer);
    if (align !== "LEFT") centerOff();
  }
  push("\n\n\n");
  cmd(0x1d, 0x56, 0x42, 0x00); // cut

  return new Uint8Array(out);
}

/** Cetak struk ESC/POS via Bluetooth. */
export async function btPrintReceipt(opts: BtReceiptOptions): Promise<void> {
  const btStore = useBtPrinter.getState();
  const write = async (char: any) => {
    await writeData(char, buildReceiptBytes(opts));
    btStore.markPrinted();
  };
  // Pakai koneksi cache bila masih hidup → tanpa dialog & tanpa gesture.
  if (cached?.server?.connected) {
    await write(cached.char);
    return;
  }
  const conn = await connectDevice();
  cached = conn;
  await write(conn.char);
}
