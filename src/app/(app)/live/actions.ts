"use server";

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export interface LiveSnapshot {
  serverTime: string;
  today: {
    revenue: number;
    orderCount: number;
    avgTicket: number;
    cash: number;
    qris: number;
    online: number;
    byChannel: { type: string; count: number; total: number }[];
    hourly: number[];
  };
  recentOrders: {
    id: string;
    orderNo: string;
    orderType: string;
    total: number;
    paymentMethod: string;
    status: string;
    createdAt: string;
    cashierName: string;
  }[];
  lowStock: { id: string; name: string; stock: number; unit: string; minStock: number }[];
  activeShift: { userName: string; openedAt: string; expectedCash: number } | null;
}

export async function getLiveSnapshot(): Promise<LiveSnapshot> {
  const session = await getServerSession(authOptions);
  if (!session?.user) throw new Error("Unauthorized");

  const startToday = new Date();
  startToday.setHours(0, 0, 0, 0);

  const [orders, lowIngredients, activeShift] = await Promise.all([
    prisma.order.findMany({
      where: { createdAt: { gte: startToday } },
      orderBy: { createdAt: "desc" },
      include: { cashier: { select: { name: true } } },
    }),
    prisma.ingredient.findMany({ where: {}, orderBy: { name: "asc" } }),
    prisma.shift.findFirst({
      where: { status: "OPEN" },
      include: { user: { select: { name: true } } },
    }),
  ]);

  const completed = orders.filter((o) => o.status === "COMPLETED");
  const revenue = completed.reduce((s, o) => s + (o.total - o.refundAmount), 0);
  const orderCount = completed.length;

  const byPayment = { cash: 0, qris: 0, online: 0 };
  const byChannel = new Map<string, { count: number; total: number }>();
  const hourly = new Array(24).fill(0) as number[];

  for (const o of completed) {
    const net = o.total - o.refundAmount;
    if (o.paymentMethod === "CASH") byPayment.cash += net;
    else if (o.paymentMethod === "QRIS") byPayment.qris += net;
    else byPayment.online += net;

    const c = byChannel.get(o.orderType) ?? { count: 0, total: 0 };
    c.count += 1;
    c.total += net;
    byChannel.set(o.orderType, c);

    hourly[new Date(o.createdAt).getHours()] += net;
  }

  let expectedCash = 0;
  if (activeShift) {
    const cashMovs = await prisma.cashMovement.findMany({ where: { shiftId: activeShift.id } });
    const cashIn = cashMovs.filter((m) => m.type === "IN").reduce((s, m) => s + m.amount, 0);
    const cashOut = cashMovs.filter((m) => m.type === "OUT").reduce((s, m) => s + m.amount, 0);
    const cashSales = completed
      .filter((o) => o.shiftId === activeShift.id && o.paymentMethod === "CASH")
      .reduce((s, o) => s + o.total, 0);
    const refunds = orders
      .filter((o) => o.shiftId === activeShift.id && o.status !== "COMPLETED" && o.paymentMethod === "CASH")
      .reduce((s, o) => s + (o.status === "VOIDED" ? o.total : o.refundAmount), 0);
    expectedCash = activeShift.openingCash + cashSales + cashIn - cashOut - refunds;
  }

  return {
    serverTime: new Date().toISOString(),
    today: {
      revenue,
      orderCount,
      avgTicket: orderCount ? Math.round(revenue / orderCount) : 0,
      ...byPayment,
      byChannel: [...byChannel.entries()]
        .map(([type, v]) => ({ type, ...v }))
        .sort((a, b) => b.total - a.total),
      hourly,
    },
    recentOrders: orders.slice(0, 10).map((o) => ({
      id: o.id,
      orderNo: o.orderNo,
      orderType: o.orderType,
      total: o.total,
      paymentMethod: o.paymentMethod,
      status: o.status,
      createdAt: o.createdAt.toISOString(),
      cashierName: o.cashier?.name ?? "-",
    })),
    lowStock: lowIngredients
      .filter((i) => i.stock <= i.minStock)
      .map((i) => ({ id: i.id, name: i.name, stock: i.stock, unit: i.unit, minStock: i.minStock })),
    activeShift: activeShift
      ? {
          userName: activeShift.user.name,
          openedAt: activeShift.openedAt.toISOString(),
          expectedCash,
        }
      : null,
  };
}
