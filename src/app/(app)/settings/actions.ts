"use server";

import { getServerSession } from "next-auth";
import { revalidatePath } from "next/cache";
import bcrypt from "bcryptjs";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

async function requireOwner() {
  const session = await getServerSession(authOptions);
  if (!session?.user || !["OWNER", "ADMIN"].includes((session.user as { role: string }).role)) {
    return null;
  }
  return session;
}

export interface SettingsInput {
  storeName: string;
  address: string;
  phone: string;
  footerReceipt: string;
  taxPercent: number;
  receiptSize: number;
  defaultOpeningCash: number;
  autoPrint: boolean;
  printerName: string;
  accentColor: string;
  logoUrl: string;
  useQzTray: boolean;
}

export async function saveSettings(input: SettingsInput): Promise<{ ok: boolean; error?: string }> {
  const session = await requireOwner();
  if (!session) return { ok: false, error: "Tidak diizinkan" };
  if (!input.storeName.trim()) return { ok: false, error: "Nama toko wajib diisi" };
  if (input.taxPercent < 0 || input.taxPercent > 100) return { ok: false, error: "PPN 0–100%" };
  if (input.defaultOpeningCash < 0) return { ok: false, error: "Modal awal tidak valid" };
  if (!/^#[0-9a-fA-F]{6}$/.test(input.accentColor)) return { ok: false, error: "Warna aksen tidak valid" };

  await prisma.settings.upsert({
    where: { id: "main" },
    update: {
      storeName: input.storeName.trim(),
      address: input.address,
      phone: input.phone,
      footerReceipt: input.footerReceipt,
      taxPercent: input.taxPercent,
      receiptSize: input.receiptSize === 80 ? 80 : 58,
      defaultOpeningCash: Math.round(input.defaultOpeningCash),
      autoPrint: input.autoPrint,
      printerName: input.printerName.trim(),
      accentColor: input.accentColor,
      logoUrl: input.logoUrl ?? "",
      useQzTray: input.useQzTray,
    },
    create: {
      id: "main",
      storeName: input.storeName.trim(),
      address: input.address,
      phone: input.phone,
      footerReceipt: input.footerReceipt,
      taxPercent: input.taxPercent,
      receiptSize: input.receiptSize === 80 ? 80 : 58,
      defaultOpeningCash: Math.round(input.defaultOpeningCash),
      autoPrint: input.autoPrint,
      printerName: input.printerName.trim(),
      accentColor: input.accentColor,
      logoUrl: input.logoUrl ?? "",
      useQzTray: input.useQzTray,
    },
  });

  revalidatePath("/settings");
  revalidatePath("/pos");
  revalidatePath("/shift");
  return { ok: true };
}

export interface UserInput {
  id?: string;
  name: string;
  email: string;
  role: "OWNER" | "ADMIN" | "CASHIER";
  active: boolean;
  password?: string;
  pin?: string;
}

export async function saveUser(input: UserInput): Promise<{ ok: boolean; error?: string }> {
  const session = await requireOwner();
  if (!session) return { ok: false, error: "Tidak diizinkan" };

  if (!input.name.trim()) return { ok: false, error: "Nama wajib diisi" };
  if (!/^\S+@\S+\.\S+$/.test(input.email)) return { ok: false, error: "Email tidak valid" };
  if (input.pin && !/^\d{4,8}$/.test(input.pin)) return { ok: false, error: "PIN harus 4–8 angka" };

  const email = input.email.toLowerCase().trim();

  try {
    if (input.id) {
      const data: Record<string, unknown> = {
        name: input.name.trim(),
        email,
        role: input.role,
        active: input.active,
      };
      if (input.password) {
        if (input.password.length < 6) return { ok: false, error: "Password min. 6 karakter" };
        data.password = await bcrypt.hash(input.password, 10);
      }
      if (input.pin) {
        data.pinHash = await bcrypt.hash(input.pin, 10);
      }
      await prisma.user.update({ where: { id: input.id }, data });
    } else {
      if (!input.password || input.password.length < 6) {
        return { ok: false, error: "Password min. 6 karakter" };
      }
      await prisma.user.create({
        data: {
          name: input.name.trim(),
          email,
          password: await bcrypt.hash(input.password, 10),
          pinHash: input.pin ? await bcrypt.hash(input.pin, 10) : null,
          role: input.role,
          active: input.active,
        },
      });
    }
    revalidatePath("/settings");
    return { ok: true };
  } catch {
    return { ok: false, error: "Gagal menyimpan (email mungkin sudah dipakai)" };
  }
}

/** Data contoh untuk tombol "Tes Cetak Struk". */
export async function getTestReceipt(): Promise<{
  ok: boolean;
  receipt?: {
    id: string;
    orderNo: string;
    orderType: string;
    tableNote: string | null;
    status: string;
    subtotal: number;
    discount: number;
    tax: number;
    total: number;
    refundAmount: number;
    paymentMethod: string;
    cashReceived: number | null;
    change: number | null;
    createdAt: string;
    cashierName: string;
    items: { name: string; price: number; qty: number; discount: number; note: string | null }[];
  };
  error?: string;
}> {
  const session = await requireOwner();
  if (!session) return { ok: false, error: "Tidak diizinkan" };

  const settings = await prisma.settings.findUnique({ where: { id: "main" } });
  const taxPercent = settings?.taxPercent ?? 0;
  const subtotal = 18000;
  const tax = Math.round((subtotal * taxPercent) / 100);

  return {
    ok: true,
    receipt: {
      id: "test",
      orderNo: "TEST-PRINT-001",
      orderType: "TAKE_AWAY",
      tableNote: null,
      status: "COMPLETED",
      subtotal,
      discount: 0,
      tax,
      total: subtotal + tax,
      refundAmount: 0,
      paymentMethod: "CASH",
      cashReceived: 20000,
      change: 20000 - subtotal - tax,
      createdAt: new Date().toISOString(),
      cashierName: "Tes Printer",
      items: [
        { name: "Espresso (contoh)", price: 18000, qty: 1, discount: 0, note: null },
      ],
    },
  };
}

export async function toggleUserActive(id: string, active: boolean): Promise<{ ok: boolean; error?: string }> {
  const session = await requireOwner();
  if (!session) return { ok: false, error: "Tidak diizinkan" };
  const meId = (session.user as { id: string }).id;
  if (id === meId) return { ok: false, error: "Tidak bisa menonaktifkan akun sendiri" };
  await prisma.user.update({ where: { id }, data: { active } });
  revalidatePath("/settings");
  return { ok: true };
}
