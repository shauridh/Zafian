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

/** Tombol "Cetak" yang memicu requestDevice harus dipanggil dari klik user. */
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
      if (found) return await connectGatt(found);
    } catch {
      /* getDevices belum didukung → lanjut pilih manual */
    }
  }
  const device = await pickDevice();
  localStorage.setItem(STORAGE_KEY, device.name || "Printer Bluetooth");
  return connectGatt(device);
}

async function connectGatt(device: any): Promise<any> {
  device.addEventListener?.("gattserverdisconnected", () => {
    console.warn("[bt] printer terputus:", device.name);
  });
  const server = await device.gatt.connect();
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
  widthMm?: 58 | 80;
}

const rp = (n: number) =>
  new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n);

/** Cetak struk ESC/POS via Bluetooth. widthChars: 32 (58mm) / 48 (80mm). */
export async function btPrintReceipt(opts: BtReceiptOptions): Promise<void> {
  const { char } = await connectDevice();
  const W = opts.widthMm === 80 ? 48 : 32;
  const enc = new TextEncoder();
  const out: number[] = [];

  const push = (s: string) => {
    for (const b of enc.encode(s)) out.push(b);
  };
  const line = () => push("-".repeat(W) + "\n");
  const row = (label: string, value: string) => {
    const space = Math.max(1, W - label.length - value.length);
    push(label + " ".repeat(space) + value + "\n");
  };
  const center = (s: string) => {
    const pad = Math.max(0, Math.floor((W - s.length) / 2));
    push(" ".repeat(pad) + s + "\n");
  };

  push("\x1B@"); // init
  push("\x1Ba\x01"); // center
  center(opts.storeName);
  push("\x1Ba\x00"); // left
  if (opts.storeAddress) push(`${opts.storeAddress}\n`);
  if (opts.storePhone) push(`Telp: ${opts.storePhone}\n`);
  line();

  row("No", opts.orderNo);
  row("Waktu", opts.createdAt);
  row("Kasir", opts.cashierName);
  row("Tipe", opts.orderTypeLabel);
  line();

  for (const i of opts.items) {
    push(`${i.name}\n`);
    const lineTotal = i.price * i.qty - i.discount * i.qty;
    row(`  ${i.qty} x ${rp(i.price)}`, rp(lineTotal));
    if (i.note) push(`  > ${i.note}\n`);
  }
  line();

  row("Subtotal", rp(opts.subtotal));
  if (opts.discount) row("Diskon", "-" + rp(opts.discount));
  if (opts.tax) row("PPN", rp(opts.tax));
  push("\x1B!\x30"); // double height+width
  row("TOTAL", rp(opts.total));
  push("\x1B!\x00");
  row(opts.paymentLabel, rp(opts.cashReceived ?? opts.total));
  if (opts.change && opts.change > 0) row("Kembali", rp(opts.change));
  line();

  if (opts.footer) {
    push("\x1Ba\x01");
    push(`${opts.footer}\n`);
    push("\x1Ba\x00");
  }
  push("\n\n\n");
  out.push(0x1d, 0x56, 0x42, 0x00); // cut

  await writeData(char, new Uint8Array(out));
}
