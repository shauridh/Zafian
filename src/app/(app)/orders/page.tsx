import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { OrdersClient } from "./OrdersClient";

export const dynamic = "force-dynamic";

export default async function OrdersPage() {
  const session = await getServerSession(authOptions);
  const role = (session?.user as { role?: string })?.role ?? "CASHIER";

  const [orders, settings] = await Promise.all([
    prisma.order.findMany({
      orderBy: { createdAt: "desc" },
      take: 100,
      include: {
        cashier: { select: { name: true } },
        items: { orderBy: { id: "asc" } },
      },
    }),
    prisma.settings.findUnique({ where: { id: "main" } }),
  ]);

  return (
    <OrdersClient
      role={role}
      store={{
        name: settings?.storeName ?? "Toko",
        address: settings?.address ?? "",
        phone: settings?.phone ?? "",
        footer: settings?.footerReceipt ?? "",
        receiptSize: settings?.receiptSize ?? 80,
      }}
      orders={orders.map((o) => ({
        id: o.id,
        orderNo: o.orderNo,
        orderType: o.orderType,
        tableNote: o.tableNote,
        status: o.status,
        subtotal: o.subtotal,
        discount: o.discount,
        tax: o.tax,
        total: o.total,
        refundAmount: o.refundAmount,
        paymentMethod: o.paymentMethod,
        cashReceived: o.cashReceived,
        change: o.change,
        voidReason: o.voidReason,
        createdAt: o.createdAt.toISOString(),
        cashierName: o.cashier?.name ?? "-",
        itemCount: o.items.reduce((s, i) => s + i.qty, 0),
        items: o.items.map((i) => ({
          name: i.nameSnapshot,
          price: i.priceSnapshot,
          qty: i.qty,
          discount: i.discount,
          note: i.note,
        })),
      }))}
    />
  );
}
