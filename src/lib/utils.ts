export function cn(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(" ");
}

export function formatRupiah(n: number): string {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(n);
}

export function formatNumber(n: number): string {
  return new Intl.NumberFormat("id-ID").format(n);
}

export function formatDateTime(d: Date | string): string {
  return new Date(d).toLocaleString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatDate(d: Date | string): string {
  return new Date(d).toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function formatTime(d: Date | string): string {
  return new Date(d).toLocaleTimeString("id-ID", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Label pendek untuk grafik harian: "24/9" */
export function formatDay(d: Date): string {
  return `${d.getDate()}/${d.getMonth() + 1}`;
}

/**
 * HPP per satuan jual = harga beli per satuan beli ÷ isi per satuan beli.
 * Contoh: beli ayam 1 pak Rp 90.000, isi 9 pcs → HPP = 10.000/pcs.
 */
export function computeCostPerUnit(input: {
  costPerUnit: number;
  purchasePrice?: number | null;
  purchaseQty?: number | null;
}): number {
  if (input.purchasePrice && input.purchaseQty && input.purchaseQty > 0) {
    return Math.round(input.purchasePrice / input.purchaseQty);
  }
  return Math.round(input.costPerUnit || 0);
}

export function generateOrderNo(): string {
  const now = new Date();
  const pad = (n: number, l = 2) => String(n).padStart(l, "0");
  const rand = Math.floor(Math.random() * 9000 + 1000);
  return `TRX${pad(now.getFullYear() % 100)}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}-${rand}`;
}

export function parseNumpadValue(raw: string): number {
  const n = parseInt(raw, 10);
  return Number.isNaN(n) ? 0 : n;
}

export const ORDER_TYPES = [
  { value: "TAKE_AWAY", label: "Bawa Pulang", short: "Bawa", color: "bg-sun text-ink" },
  { value: "DINE_IN", label: "Makan di Tempat", short: "Makan", color: "bg-teal text-ink" },
  { value: "GOFOOD", label: "GoFood", short: "GoFood", color: "bg-gofood text-white" },
  { value: "GRABFOOD", label: "GrabFood", short: "GrabFood", color: "bg-grabfood text-white" },
  { value: "SHOPEEFOOD", label: "ShopeeFood", short: "Shopee", color: "bg-shopeefood text-white" },
] as const;

export const PAYMENT_METHODS = [
  { value: "CASH", label: "Tunai" },
  { value: "QRIS", label: "QRIS" },
] as const;

/** Daftar satuan untuk bahan (jual/resep maupun beli) */
export const UNITS = [
  "gr", "kg", "ons", "ml", "l", "pcs", "pack", "porsi",
  "botol", "kaleng", "sloki", "dus", "sak", "bks", "cup",
  "tray", "karung", "galon", "rim", "ikat",
] as const;

export function orderTypeLabel(t: string): string {
  return ORDER_TYPES.find((o) => o.value === t)?.label ?? t;
}

export function orderTypeShort(t: string): string {
  return ORDER_TYPES.find((o) => o.value === t)?.short ?? t;
}

export function orderTypeColor(t: string): string {
  return ORDER_TYPES.find((o) => o.value === t)?.color ?? "bg-ink text-white";
}
