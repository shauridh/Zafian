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
  return createOrderCore(userId, input);
}

/**
 * Inti checkout tanpa konteks HTTP — dipanggil createOrder setelah validasi sesi.
 * Diekstrak agar test integrasi bisa menggerakkan checkout langsung (tanpa next-auth).
 */
export async function createOrderCore(
  userId: string,
  input: CreateOrderInput
): Promise<CreateOrderResult> {
  if (!input.items?.length) return { ok: false, error: "Keranjang kosong" };
  if (!VALID_ORDER_TYPES.includes(input.orderType)) return { ok: false, error: "Tipe pesanan tidak valid" };
  if (!VALID_PAYMENTS.includes(input.paymentMethod)) return { ok: false, error: "Metode pembayaran tidak valid" };

  // Shift aktif wajib
  const shift = await prisma.shift.findFirst({ where: { status: "OPEN" } });
  if (!shift) return { ok: false, error: "Belum ada shift aktif. Buka shift dulu." };

  // Gabungkan item dengan produk yang sama — qty agregat yang divalidasi & dikurangi
  const itemMap = new Map<string, { qty: number; discount: number; note?: string }>();
  for (const item of input.items) {
    const agg = itemMap.get(item.productId);
    if (agg) {
      agg.qty += item.qty;
      agg.discount += item.discount;
      if (item.note) agg.note = agg.note ? `${agg.note}; ${item.note}` : item.note;
    } else {
      itemMap.set(item.productId, { qty: item.qty, discount: item.discount, note: item.note });
    }
  }
  const items = [...itemMap.entries()].map(([productId, agg]) => ({ productId, ...agg }));

  // Ambil produk + resep + isi combo
  const products = await prisma.product.findMany({
    where: { id: { in: [...itemMap.keys()] } },
    include: { recipe: true, comboItems: { include: { child: { include: { recipe: true } } } } },
  });
  const productMap = new Map(products.map((p) => [p.id, p]));

  // Validasi ketersediaan & hitung total
  let subtotal = 0;
  let costTotal = 0;
  let itemDiscountTotal = 0;
  for (const item of items) {
    const p = productMap.get(item.productId);
    if (!p) return { ok: false, error: "Produk tidak ditemukan" };
    if (!p.isAvailable) return { ok: false, error: `${p.name} sedang habis/tidak tersedia` };
    // Combo: stok etalase dilacak per ANAK (didekrement saat transaksi), bukan per paket
    const isCombo = p.comboItems.length > 0;
    if (!isCombo && p.readyEnabled && p.readyQty !== null && p.readyQty < item.qty) {
      return { ok: false, error: `${p.name}: porsi siap jual tinggal ${p.readyQty}, kurang ${item.qty - p.readyQty}` };
    }
    subtotal += p.price * item.qty;
    costTotal += Number(p.costPrice) * item.qty;
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

  // Kebutuhan bahan di-EXPAND dari combo: 1 paket = resep kemasan + Σ (resep anak × qty anak)
  // (loop dari itemMap agregat — input.items mentah bisa duplikat productId)
  const needMap = new Map<string, number>();
  for (const [productId, agg] of itemMap) {
    const p = productMap.get(productId)!;
    for (const r of p.recipe) {
      needMap.set(r.ingredientId, (needMap.get(r.ingredientId) ?? 0) + r.qtyPerServing * agg.qty);
    }
    for (const ci of p.comboItems) {
      for (const r of ci.child.recipe) {
        needMap.set(r.ingredientId, (needMap.get(r.ingredientId) ?? 0) + r.qtyPerServing * ci.qty * agg.qty);
      }
    }
  }
  // Validasi etalase anak combo (agregat lintas item): 1 paket memakan qty anak per porsi
  const childNeed = new Map<string, number>();
  for (const [productId, agg] of itemMap) {
    const p = productMap.get(productId)!;
    for (const ci of p.comboItems) childNeed.set(ci.childId, (childNeed.get(ci.childId) ?? 0) + ci.qty * agg.qty);
  }
  if (needMap.size > 0) {
    const ingredients = await prisma.ingredient.findMany({
      where: { id: { in: [...needMap.keys()] } },
    });
    for (const ing of ingredients) {
      const need = needMap.get(ing.id) ?? 0;
      const needRounded = Math.round(need * 100) / 100;
      if (ing.stock < need) {
        return {
          ok: false,
          error: `Stok bahan "${ing.name}" tidak cukup (butuh ${needRounded} ${ing.unit}, tersisa ${ing.stock} ${ing.unit})`,
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
            create: items.map((item) => {
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

      // 2. Kurangi bahan resep + catat pergerakan — GUARD ATOMIK: gagal jika stok < kebutuhan
      for (const [ingredientId, qty] of needMap) {
        const r = await tx.ingredient.updateMany({
          where: { id: ingredientId, stock: { gte: qty } },
          data: { stock: { decrement: qty } },
        });
        if (r.count === 0) throw new Error(`BAHAN:${ingredientId}`);
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

      // 3. Kurangi porsi siap jual (etalase) — GUARD ATOMIK: gagal jika readyQty < qty
      for (const item of items) {
        const p = productMap.get(item.productId)!;
        if (p.comboItems.length > 0) continue; // combo: etalase didekrement per anak di bawah
        if (p.readyEnabled && p.readyQty !== null) {
          const r = await tx.product.updateMany({
            where: { id: p.id, readyQty: { gte: item.qty } },
            data: { readyQty: { decrement: item.qty } },
          });
          if (r.count === 0) throw new Error(`ETALASE:${p.name}`);
        }
      }
      // 3b. Etalase anak combo (agregat lintas item, termasuk anak dipakai beberapa paket)
      for (const [childId, qty] of childNeed) {
        const child = productMap.get(childId);
        if (!child) {
          const c = await tx.product.findUnique({ where: { id: childId }, select: { readyEnabled: true, readyQty: true, name: true } });
          if (c?.readyEnabled && c.readyQty !== null) {
            const r = await tx.product.updateMany({
              where: { id: childId, readyQty: { gte: qty } },
              data: { readyQty: { decrement: qty } },
            });
            if (r.count === 0) throw new Error(`ETALASE:${c.name}`);
          }
          continue;
        }
        if (child.readyEnabled && child.readyQty !== null) {
          const r = await tx.product.updateMany({
            where: { id: childId, readyQty: { gte: qty } },
            data: { readyQty: { decrement: qty } },
          });
          if (r.count === 0) throw new Error(`ETALASE:${child.name}`);
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
    // Guard transaksi melempar ETALASE:/BAHAN: — petakan ke pesan yang bisa dimengerti kasir
    if (e instanceof Error) {
      if (e.message.startsWith("ETALASE:")) {
        return { ok: false, error: `${e.message.slice(8)}: porsi siap jual habis` };
      }
      if (e.message.startsWith("BAHAN:")) {
        const ing = await prisma.ingredient.findUnique({ where: { id: e.message.slice(6) }, select: { name: true, unit: true } });
        return { ok: false, error: `Stok bahan "${ing?.name ?? "?"}" tidak cukup` };
      }
    }
    console.error("createOrder error", e);
    return { ok: false, error: "Gagal menyimpan transaksi" };
  }
}
