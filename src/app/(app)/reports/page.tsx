import { prisma } from "@/lib/prisma";
import { ReportsClient } from "./ReportsClient";

export const dynamic = "force-dynamic";

export default async function ReportsPage() {
  // 180 hari untuk mendukung perbandingan periode (90 hari vs 90 hari sebelumnya)
  const since = new Date();
  since.setDate(since.getDate() - 180);
  since.setHours(0, 0, 0, 0);

  const [orders, movements, ingredients] = await Promise.all([
    prisma.order.findMany({
      where: { createdAt: { gte: since } },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        orderNo: true,
        orderType: true,
        paymentMethod: true,
        status: true,
        subtotal: true,
        discount: true,
        tax: true,
        total: true,
        costTotal: true,
        refundAmount: true,
        createdAt: true,
        items: {
          select: { nameSnapshot: true, qty: true, priceSnapshot: true, discount: true },
        },
      },
    }),
    prisma.ingredientMovement.findMany({
      where: { createdAt: { gte: since } },
      include: { ingredient: { select: { name: true, unit: true } } },
    }),
    prisma.ingredient.findMany({ select: { name: true, unit: true, stock: true, minStock: true } }),
  ]);

  return (
    <ReportsClient
      orders={orders.map((o) => ({
        id: o.id,
        orderNo: o.orderNo,
        orderType: o.orderType,
        paymentMethod: o.paymentMethod,
        status: o.status,
        subtotal: o.subtotal,
        discount: o.discount,
        tax: o.tax,
        total: o.total,
        costTotal: o.costTotal,
        refundAmount: o.refundAmount,
        createdAt: o.createdAt.toISOString(),
        items: o.items.map((i) => ({
          name: i.nameSnapshot,
          qty: i.qty,
          price: i.priceSnapshot,
          discount: i.discount,
        })),
      }))}
      ingredientUsage={movements.map((m) => ({
        name: m.ingredient.name,
        unit: m.ingredient.unit,
        type: m.type,
        qty: m.qty,
        createdAt: m.createdAt.toISOString(),
      }))}
      ingredients={ingredients}
    />
  );
}
