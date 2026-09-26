"use server";

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export interface ShiftReportData {
  shiftId: string;
  userName: string;
  openedAt: string;
  closedAt: string;
  openingCash: number;
  cashSales: number;
  qrisSales: number;
  onlineSales: number;
  cashIn: number;
  cashOut: number;
  refundsCash: number;
  expectedCash: number;
  actualCash: number;
  difference: number;
  totalSales: number;
  orderCount: number;
  storeName: string;
  transactions: {
    orderNo: string;
    time: string;
    type: string;
    payment: string;
    total: number;
    status: string;
  }[];
  cashLogs: { time: string; type: string; amount: number; note: string | null }[];
}

export async function getShiftReport(shiftId: string): Promise<ShiftReportData | null> {
  const session = await getServerSession(authOptions);
  if (!session?.user) return null;

  const shift = await prisma.shift.findUnique({
    where: { id: shiftId },
    include: { user: { select: { name: true } } },
  });
  if (!shift) return null;

  const [orders, cashMovs, settings] = await Promise.all([
    prisma.order.findMany({
      where: { shiftId: shift.id },
      orderBy: { createdAt: "asc" },
    }),
    prisma.cashMovement.findMany({
      where: { shiftId: shift.id },
      orderBy: { createdAt: "asc" },
    }),
    prisma.settings.findUnique({ where: { id: "main" } }),
  ]);

  const completed = orders.filter((o) => o.status === "COMPLETED");
  const cashSales = completed.filter((o) => o.paymentMethod === "CASH").reduce((s, o) => s + o.total, 0);
  const qrisSales = completed.filter((o) => o.paymentMethod === "QRIS").reduce((s, o) => s + o.total, 0);
  const onlineSales = completed.filter((o) => o.paymentMethod === "ONLINE_PLATFORM").reduce((s, o) => s + o.total, 0);
  const cashIn = cashMovs.filter((m) => m.type === "IN").reduce((s, m) => s + m.amount, 0);
  const cashOut = cashMovs.filter((m) => m.type === "OUT").reduce((s, m) => s + m.amount, 0);
  const refundsCash = orders
    .filter((o) => o.status !== "COMPLETED" && o.paymentMethod === "CASH")
    .reduce((s, o) => s + (o.status === "VOIDED" ? o.total : o.refundAmount), 0);

  return {
    shiftId: shift.id,
    userName: shift.user.name,
    openedAt: shift.openedAt.toISOString(),
    closedAt: (shift.closedAt ?? new Date()).toISOString(),
    openingCash: shift.openingCash,
    cashSales,
    qrisSales,
    onlineSales,
    cashIn,
    cashOut,
    refundsCash,
    expectedCash: shift.closingCashExpected ?? 0,
    actualCash: shift.closingCashActual ?? 0,
    difference: shift.difference ?? 0,
    totalSales: completed.reduce((s, o) => s + (o.total - o.refundAmount), 0),
    orderCount: completed.length,
    storeName: settings?.storeName ?? "Toko",
    transactions: orders.map((o) => ({
      orderNo: o.orderNo,
      time: o.createdAt.toISOString(),
      type: o.orderType,
      payment: o.paymentMethod,
      total: o.total,
      status: o.status,
    })),
    cashLogs: cashMovs.map((m) => ({
      time: m.createdAt.toISOString(),
      type: m.type,
      amount: m.amount,
      note: m.note,
    })),
  };
}
