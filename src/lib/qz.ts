"use client";

/**
 * Integrasi QZ Tray (https://qz.io) — cetak ESC/POS langsung ke printer thermal
 * tanpa dialog print. Butuh aplikasi QZ Tray ter-install di perangkat kasir.
 *
 * Kebijakan keamanan QZ 2.2+ memerlukan signature — untuk development kita
 * set `allowUnsigned` lewat promise sedikit longgar; untuk produksi disarankan
 * membuat sertifikat sendiri (lihat https://qz.io/wiki/digital-signatures).
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

declare global {
  interface Window {
    qz?: any;
  }
}

export function qzAvailable(): boolean {
  return typeof window !== "undefined" && !!window.qz;
}

export async function qzConnect(): Promise<void> {
  if (!window.qz) throw new Error("QZ Tray tidak terdeteksi. Pastikan aplikasi QZ Tray berjalan.");
  const qz = window.qz;

  if (!qz.websocket.isActive()) {
    // development: izinkan unsigned (produksi: pakai sertifikat)
    try {
      await qz.security.setCertificatePromise(() => null as never);
    } catch {
      /* versi lama tanpa setCertificatePromise */
    }
    try {
      await qz.security.setSignaturePromise(() => (data: string) => Promise.resolve(data));
    } catch {
      /* noop */
    }
    await qz.websocket.connect();
  }
}

export async function qzPrinters(): Promise<string[]> {
  await qzConnect();
  const list = await window.qz.printers.find();
  return list as string[];
}

/** Muat gambar jadi data URI (untuk logo struk). */
async function toDataUrl(url: string): Promise<string | null> {
  try {
    const res = await fetch(url);
    const blob = await res.blob();
    return await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

export interface EscposReceiptOptions {
  printer?: string;
  storeName: string;
  storeAddress?: string;
  storePhone?: string;
  logoUrl?: string;
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
  alignMode?: "AUTO" | "SPACE" | "LEFT";
  widthMm?: 58 | 80;
}

const rp = (n: number) =>
  "Rp " + new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 }).format(n);

/** Kirim byte ESC/POS mentah via QZ Tray (untuk pola kalibrasi). */
export async function qzSendRaw(bytes: Uint8Array, widthMm: 58 | 80 = 58): Promise<void> {
  await qzConnect();
  const qz = window.qz;
  const printer = (await qz.printers.find())?.[0];
  if (!printer) throw new Error("Printer thermal tidak ditemukan");
  const cfg = qz.configs.create(printer, {
    units: "mm",
    size: { width: widthMm === 58 ? 58 : 80, height: 0 },
    forceTextEncoding: "utf-8",
  });
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  await qz.print(cfg, [{ type: "raw", format: "command", data: bin }]);
}

/**
 * Cetak struk ESC/POS via QZ Tray. Konteks print 58mm/80mm mengikuti widthMm.
 */
export async function qzPrintReceipt(opts: EscposReceiptOptions): Promise<void> {
  await qzConnect();
  const qz = window.qz;

  const printer = opts.printer
    ? await qz.printers.find(opts.printer).catch(() => null) || (await qz.printers.find())?.[0]
    : (await qz.printers.find())?.[0];
  if (!printer) throw new Error("Printer thermal tidak ditemukan");

  const cfg = qz.configs.create(printer, {
    units: "mm",
    size: { width: opts.widthMm === 58 ? 58 : 80, height: 0 }, // height 0 = continuous
    forceTextEncoding: "utf-8",
  });

  const data: any[] = [];
  const line = (char = "-") => ({ type: "raw", format: "command", data: char.repeat(32) + "\n" });
  const text = (t: string) => ({ type: "raw", format: "command", data: t + "\n" });

  // Logo (raster via QZ image → ESC/POS)
  if (opts.logoUrl) {
    const dataUrl = await toDataUrl(opts.logoUrl);
    if (dataUrl) {
      data.push({ type: "pixel", format: "image", flavor: "file", data: dataUrl, options: { language: "ESCPOS", x: "center" } });
    }
  }

  data.push({ type: "raw", format: "command", data: "\x1B@\x1Ba\x01" }); // init + center
  data.push(text(`${opts.storeName}\n`));
  data.push({ type: "raw", format: "command", data: "\x1Ba\x00" }); // left
  if (opts.storeAddress) data.push(text(`${opts.storeAddress}\n`));
  if (opts.storePhone) data.push(text(`Telp: ${opts.storePhone}\n`));
  data.push(line());

  data.push(text(`No    : ${opts.orderNo}`));
  data.push(text(`Waktu : ${opts.createdAt}`));
  data.push(text(`Kasir : ${opts.cashierName}`));
  data.push(text(`Tipe  : ${opts.orderTypeLabel}`));
  data.push(line());

  for (const i of opts.items) {
    data.push(text(`${i.name}`));
    const lineTotal = i.price * i.qty - i.discount * i.qty;
    data.push(text(`  ${i.qty} x ${rp(i.price)}${i.discount ? ` -${rp(i.discount * i.qty)}` : ""}${" ".repeat(2)}${rp(lineTotal).padStart(14)}`));
    if (i.note) data.push(text(`  > ${i.note}`));
  }

  data.push(line());

  if (opts.promoText) {
    for (const p of opts.promoText.split("\n").filter((x) => x.trim())) {
      data.push({ type: "raw", format: "command", data: "\x1Ba\x01" });
      data.push(text(`${p.trim()}\n`));
      data.push({ type: "raw", format: "command", data: "\x1Ba\x00" });
    }
    data.push(line());
  }

  data.push(text(`Subtotal${rp(opts.subtotal).padStart(24)}`));
  if (opts.discount) data.push(text(`Diskon -${rp(opts.discount).padStart(22)}`));
  if (opts.tax) data.push(text(`PPN${rp(opts.tax).padStart(28)}`));
  data.push({ type: "raw", format: "command", data: "\x1B!\x30" }); // double height+width
  data.push(text(`TOTAL${rp(opts.total).padStart(26)}`));
  data.push({ type: "raw", format: "command", data: "\x1B!\x00" });
  data.push(text(`${opts.paymentLabel}${rp(opts.cashReceived ?? opts.total).padStart(24)}`));
  if (opts.change && opts.change > 0) data.push(text(`Kembali${rp(opts.change).padStart(24)}`));
  data.push(line());

  if (opts.footer) {
    data.push({ type: "raw", format: "command", data: "\x1Ba\x01" });
    data.push(text(`${opts.footer}\n`));
    data.push({ type: "raw", format: "command", data: "\x1Ba\x00" });
  }

  // QR code (GS ( k model 2)
  if (opts.receiptQr && opts.qrText) {
    data.push({ type: "raw", format: "command", data: "\x1Ba\x01" });
    const enc = new TextEncoder();
    const qrData = enc.encode(opts.qrText);
    const lenL = (qrData.length + 3) % 256;
    const lenH = Math.floor((qrData.length + 3) / 256);
    const bin = (arr: number[]) => String.fromCharCode(...arr);
    data.push({ type: "raw", format: "command", data: bin([0x1d, 0x28, 0x6b, 0x04, 0x00, 0x31, 0x41, 0x32, 0x00]) });
    data.push({ type: "raw", format: "command", data: bin([0x1d, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x43, 0x06]) });
    data.push({ type: "raw", format: "command", data: bin([0x1d, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x45, 0x31]) });
    data.push({ type: "raw", format: "command", data: bin([0x1d, 0x28, 0x6b, lenL, lenH, 0x31, 0x50, 0x30, ...qrData]) });
    data.push({ type: "raw", format: "command", data: bin([0x1d, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x51, 0x30]) });
    data.push({ type: "raw", format: "command", data: "\x1Ba\x00" });
  }

  data.push(text("\n\n\n"));
  data.push({ type: "raw", format: "command", data: "\x1D\x56\x42\x00" }); // cut

  await qz.print(cfg, data);
}
