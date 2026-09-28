"use server";

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { generateOrderNo } from "@/lib/utils";

export interface CreateOrderInput {
  orderType: string;
  tableNote?: string;
  paymentMethod: string;
  orderDiscount: number;
  cashReceived?: number;
  items: {
    productId: string;
    qty: number;
    discount: number;
    note?: string;
  }[];
}

export interface ReceiptData {
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
}

export interface CreateOrderResult {
  ok: boolean;
  error?: string;
  orderId?: string;
  orderNo?: string;
  receipt?: ReceiptData;
}

const VALID_ORDER_TYPES = ["DINE_IN", "TAKE_AWAY", "GOFOOD", "GRABFOOD", "SHOPEEFOOD"];
const VALID_PAYMENTS = ["CASH", "QRIS", "ONLINE_PLATFORM"];

export async function createOrder(input: CreateOrderInput): Promise<CreateOrderResult> {
  const session = await getServerSession(authOptions);
  if (!session?.user) return { ok: false, error: "Sesi berakhir, silakan login ulang" };
  const userId = (session.user as { id: string }).id;

  if (!input.items?.length) return { ok: false, error: "Keranjang kosong" };
  if (!VALID_ORDER_TYPES.includes(input.orderType)) return { ok: false, error: "Tipe pesanan tidak valid" };
  if (!VALID_PAYMENTS.includes(input.paymentMethod)) return { ok: false, error: "Metode pembayaran tidak valid" };

  // Shift aktif wajib
  const shift = await prisma.shift.findFirst({ where: { status: "OPEN" } });
  if (!shift) return { ok: false, error: "Belum ada shift aktif. Buka shift dulu." };

  // Ambil produk + resep
  const productIds = input.items.map((i) => i.productId);
  const products = await prisma.product.findMany({
    where: { id: { in: productIds } },
    include: { recipe: true },
  });
  const productMap = new Map(products.map((p) => [p.id, p]));

  // Validasi ketersediaan & hitung total
  let subtotal = 0;
  let costTotal = 0;
  let itemDiscountTotal = 0;
  for (const item of input.items) {
    const p = productMap.get(item.productId);
    if (!p) return { ok: false, error: "Produk tidak ditemukan" };
    if (!p.isAvailable) return { ok: false, error: `${p.name} sedang habis/tidak tersedia` };
    if (p.readyEnabled && p.readyQty !== null && p.readyQty < item.qty) {
      return { ok: false, error: `${p.name}: porsi siap jual tinggal ${p.readyQty}, kurang ${item.qty - p.readyQty}` };
    }
    subtotal += p.price * item.qty;
    costTotal += p.costPrice * item.qty;
    itemDiscountTotal += item.discount * item.qty;
  }

  const afterDiscount = Math.max(0, subtotal - itemDiscountTotal - input.orderDiscount);
  const settings = await prisma.settings.findUnique({ where: { id: "main" } });
  const tax = Math.round((afterDiscount * (settings?.taxPercent ?? 0)) / 100);
  const total = afterDiscount + tax;

  // Validasi pembayaran
  let cashReceived: number | null = null;
  let change: number | null = null;
  const paymentMethod =
    input.orderType === "GOFOOD" || input.orderType === "GRABFOOD" || input.orderType === "SHOPEEFOOD"
      ? "ONLINE_PLATFORM"
      : input.paymentMethod;

  if (paymentMethod === "CASH") {
    if (!input.cashReceived || input.cashReceived < total) {
      return { ok: false, error: "Uang diterima kurang dari total" };
    }
    cashReceived = input.cashReceived;
    change = input.cashReceived - total;
  }

  // Cek kecukupan bahan (resep)
  const needMap = new Map<string, number>();
  for (const item of input.items) {
    const p = productMap.get(item.productId)!;
    for (const r of p.recipe) {
      needMap.set(r.ingredientId, (needMap.get(r.ingredientId) ?? 0) + r.qtyPerServing * item.qty);
    }
  }
  if (needMap.size > 0) {
    const ingredients = await prisma.ingredient.findMany({
      where: { id: { in: [...needMap.keys()] } },
    });
    for (const ing of ingredients) {
      const need = needMap.get(ing.id) ?? 0;
      if (ing.stock < need) {
        return {
          ok: false,
          error: `Stok bahan "${ing.name}" tidak cukup (butuh ${need} ${ing.unit}, tersisa ${ing.stock} ${ing.unit})`,
        };
      }
    }
  }

  try {
    const order = await prisma.$transaction(async (tx) => {
      // 1. Buat order + items
      const created = await tx.order.create({
        data: {
          orderNo: generateOrderNo(),
          shiftId: shift.id,
          cashierId: userId,
          orderType: input.orderType as never,
          tableNote: input.tableNote || null,
          subtotal,
          discount: itemDiscountTotal + input.orderDiscount,
          tax,
          total,
          costTotal,
          paymentMethod: paymentMethod as never,
          cashReceived,
          change,
          status: "COMPLETED",
          items: {
            create: input.items.map((item) => {
              const p = productMap.get(item.productId)!;
              return {
                productId: item.productId,
                nameSnapshot: p.name,
                priceSnapshot: p.price,
                qty: item.qty,
                discount: item.discount,
                note: item.note || null,
              };
            }),
          },
        },
      });

      // 2. Kurangi bahan resep + catat pergerakan
      for (const [ingredientId, qty] of needMap) {
        await tx.ingredient.update({
          where: { id: ingredientId },
          data: { stock: { decrement: qty } },
        });
        await tx.ingredientMovement.create({
          data: {
            ingredientId,
            type: "SALE",
            qty: -qty,
            note: `Order ${created.orderNo}`,
            userId,
          },
        });
      }

      // 3. Kurangi porsi siap jual (etalase) untuk produk yang dilacak
      for (const item of input.items) {
        const p = productMap.get(item.productId)!;
        if (p.readyEnabled && p.readyQty !== null) {
          await tx.product.update({
            where: { id: p.id },
            data: { readyQty: { decrement: item.qty } },
          });
        }
      }

      // 4. Catat penjualan tunai ke shift (implisit via total orders; ledger kas hanya non-penjualan)

      // 5. Audit log
      await tx.auditLog.create({
        data: {
          userId,
          action: "CREATE_ORDER",
          entity: "Order",
          entityId: created.id,
          meta: JSON.stringify({ orderNo: created.orderNo, total, orderType: input.orderType, paymentMethod }),
        },
      });

      const full = await tx.order.findUnique({
        where: { id: created.id },
        include: { items: { orderBy: { id: "asc" } }, cashier: { select: { name: true } } },
      });
      return full;
    });

    if (!order) return { ok: false, error: "Gagal memuat data order" };

    return {
      ok: true,
      orderId: order.id,
      orderNo: order.orderNo,
      receipt: {
        id: order.id,
        orderNo: order.orderNo,
        orderType: order.orderType,
        tableNote: order.tableNote,
        status: order.status,
        subtotal: order.subtotal,
        discount: order.discount,
        tax: order.tax,
        total: order.total,
        refundAmount: order.refundAmount,
        paymentMethod: order.paymentMethod,
        cashReceived: order.cashReceived,
        change: order.change,
        createdAt: order.createdAt.toISOString(),
        cashierName: order.cashier?.name ?? "-",
        items: order.items.map((i) => ({
          name: i.nameSnapshot,
          price: i.priceSnapshot,
          qty: i.qty,
          discount: i.discount,
          note: i.note,
        })),
      },
    };
  } catch (e) {
    console.error("createOrder error", e);
    return { ok: false, error: "Gagal menyimpan transaksi" };
  }
}
