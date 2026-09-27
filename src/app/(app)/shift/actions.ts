"use server";

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export interface ActiveShift {
  id: string;
  openingCash: number;
  openedAt: string;
  userName: string;
  cashIn: number;
  cashOut: number;
  cashSales: number;
  cashRefunds: number;
  expectedCash: number;
  totalSales: number;
  orderCount: number;
}

export async function getActiveShiftData(): Promise<ActiveShift | null> {
  const session = await getServerSession(authOptions);
  if (!session?.user) return null;

  const shift = await prisma.shift.findFirst({
    where: { status: "OPEN" },
    include: { user: { select: { name: true } } },
  });
  if (!shift) return null;

  const [cashMovs, voided, refunded, agg] = await Promise.all([
    prisma.cashMovement.findMany({ where: { shiftId: shift.id } }),
    // Void = uang tunai kembali penuh (total)
    prisma.order.aggregate({
      _sum: { total: true },
      where: { shiftId: shift.id, status: "VOIDED", paymentMethod: "CASH" },
    }),
    // Refund = uang tunai kembali sebesar refundAmount (bisa sebagian)
    prisma.order.aggregate({
      _sum: { refundAmount: true },
      where: { shiftId: shift.id, status: "REFUNDED", paymentMethod: "CASH" },
    }),
    prisma.order.aggregate({
      _sum: { total: true },
      _count: true,
      where: { shiftId: shift.id, status: "COMPLETED" },
    }),
  ]);

  const cashIn = cashMovs.filter((m) => m.type === "IN").reduce((s, m) => s + m.amount, 0);
  const cashOut = cashMovs.filter((m) => m.type === "OUT").reduce((s, m) => s + m.amount, 0);

  const cashSalesAgg = await prisma.order.aggregate({
    _sum: { total: true },
    where: { shiftId: shift.id, status: "COMPLETED", paymentMethod: "CASH" },
  });

  const cashSales = cashSalesAgg._sum.total ?? 0;
  const cashRefunds = (voided._sum.total ?? 0) + (refunded._sum.refundAmount ?? 0);
  const expectedCash = shift.openingCash + cashSales + cashIn - cashOut - cashRefunds;

  return {
    id: shift.id,
    openingCash: shift.openingCash,
    openedAt: shift.openedAt.toISOString(),
    userName: shift.user.name,
    cashIn,
    cashOut,
    cashSales,
    cashRefunds,
    expectedCash,
    totalSales: agg._sum.total ?? 0,
    orderCount: agg._count ?? 0,
  };
}

export async function openShift(
  openingCash: number
): Promise<{ ok: boolean; error?: string }> {
  const session = await getServerSession(authOptions);
  if (!session?.user) return { ok: false, error: "Sesi berakhir" };

  if (!Number.isFinite(openingCash) || openingCash < 0) {
    return { ok: false, error: "Nominal modal tidak valid" };
  }

  const existing = await prisma.shift.findFirst({ where: { status: "OPEN" } });
  if (existing) return { ok: false, error: "Masih ada shift aktif. Tutup dulu shift sebelumnya." };

  await prisma.shift.create({
    data: { userId: (session.user as { id: string }).id, openingCash, status: "OPEN" },
  });

  await prisma.auditLog.create({
    data: {
      userId: (session.user as { id: string }).id,
      action: "OPEN_SHIFT",
      entity: "Shift",
      meta: JSON.stringify({ openingCash }),
    },
  });

  return { ok: true };
}

export async function recordCashMovement(
  type: "IN" | "OUT",
  amount: number,
  note: string
): Promise<{ ok: boolean; error?: string }> {
  const session = await getServerSession(authOptions);
  if (!session?.user) return { ok: false, error: "Sesi berakhir" };
  const userId = (session.user as { id: string }).id;

  if (!Number.isFinite(amount) || amount <= 0) return { ok: false, error: "Nominal tidak valid" };
  if (!note.trim()) return { ok: false, error: "Keterangan wajib diisi" };

  const shift = await prisma.shift.findFirst({ where: { status: "OPEN" } });
  if (!shift) return { ok: false, error: "Tidak ada shift aktif" };

  await prisma.cashMovement.create({
    data: { shiftId: shift.id, type, amount: Math.round(amount), note: note.trim(), userId },
  });

  await prisma.auditLog.create({
    data: {
      userId,
      action: type === "IN" ? "CASH_IN" : "CASH_OUT",
      entity: "CashMovement",
      meta: JSON.stringify({ amount, note }),
    },
  });

  return { ok: true };
}

export async function closeShift(
  closingCashActual: number,
  note?: string,
  differenceNote?: string
): Promise<{ ok: boolean; error?: string; difference?: number }> {
  const session = await getServerSession(authOptions);
  if (!session?.user) return { ok: false, error: "Sesi berakhir" };
  const userId = (session.user as { id: string }).id;

  const shift = await prisma.shift.findFirst({ where: { status: "OPEN" } });
  if (!shift) return { ok: false, error: "Tidak ada shift aktif" };

  if (!Number.isFinite(closingCashActual) || closingCashActual < 0) {
    return { ok: false, error: "Nominal kas fisik tidak valid" };
  }

  const [cashMovs, cashSalesAgg, voided, refunded] = await Promise.all([
    prisma.cashMovement.findMany({ where: { shiftId: shift.id } }),
    prisma.order.aggregate({
      _sum: { total: true },
      where: { shiftId: shift.id, status: "COMPLETED", paymentMethod: "CASH" },
    }),
    prisma.order.aggregate({
      _sum: { total: true },
      where: { shiftId: shift.id, status: "VOIDED", paymentMethod: "CASH" },
    }),
    prisma.order.aggregate({
      _sum: { refundAmount: true },
      where: { shiftId: shift.id, status: "REFUNDED", paymentMethod: "CASH" },
    }),
  ]);

  const cashIn = cashMovs.filter((m) => m.type === "IN").reduce((s, m) => s + m.amount, 0);
  const cashOut = cashMovs.filter((m) => m.type === "OUT").reduce((s, m) => s + m.amount, 0);
  const cashSales = cashSalesAgg._sum.total ?? 0;
  const cashRefunds = (voided._sum.total ?? 0) + (refunded._sum.refundAmount ?? 0);
  const expected = shift.openingCash + cashSales + cashIn - cashOut - cashRefunds;
  const difference = Math.round(closingCashActual) - expected;

  // Kasir wajib menjelaskan penyebab bila kas fisik tidak pas
  if (difference !== 0 && !differenceNote?.trim()) {
    return { ok: false, error: "Alasan selisih wajib diisi bila kas tidak pas" };
  }

  await prisma.shift.update({
    where: { id: shift.id },
    data: {
      status: "CLOSED",
      closedAt: new Date(),
      closingCashExpected: expected,
      closingCashActual: Math.round(closingCashActual),
      difference,
      differenceNote: difference !== 0 ? differenceNote!.trim() : null,
    },
  });

  await prisma.auditLog.create({
    data: {
      userId,
      action: "CLOSE_SHIFT",
      entity: "Shift",
      entityId: shift.id,
      meta: JSON.stringify({
        expected,
        actual: Math.round(closingCashActual),
        difference,
        differenceNote: difference !== 0 ? differenceNote!.trim() : null,
        note,
      }),
    },
  });

  return { ok: true, difference };
}

export async function getDefaultOpeningCash(): Promise<number> {
  const settings = await prisma.settings.findUnique({ where: { id: "main" } });
  return settings?.defaultOpeningCash ?? 350000;
}
