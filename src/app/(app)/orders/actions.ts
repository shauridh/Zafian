"use server";

import { getServerSession } from "next-auth";
import { revalidatePath } from "next/cache";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function voidOrder(
  orderId: string,
  reason: string,
  restoreStock: boolean
): Promise<{ ok: boolean; error?: string }> {
  const session = await getServerSession(authOptions);
  if (!session?.user) return { ok: false, error: "Sesi berakhir" };
  const user = session.user as { id: string; role: string };      return voidOrderCore(user, orderId, reason, restoreStock).then((res) => {
        if (res.ok) {
          revalidatePath("/orders");
          revalidatePath("/pos");
        }
        return res;
      });
    }

/**
 * Inti void tanpa konteks HTTP (test integrasi memanggil ini langsung).
 * restoreStock mengembalikan bahan resep — termasuk resep ANAK dari combo.
 */
export async function voidOrderCore(
  user: { id: string; role: string },
  orderId: string,
  reason: string,
  restoreStock: boolean
): Promise<{ ok: boolean; error?: string }> {
  // Void butuh approval OWNER/ADMIN
  if (!["OWNER", "ADMIN"].includes(user.role)) {
    return { ok: false, error: "Void hanya bisa di-approve Owner/Admin" };
  }
  if (!reason.trim()) return { ok: false, error: "Alasan void wajib diisi" };

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { items: true },
  });
  if (!order) return { ok: false, error: "Order tidak ditemukan" };
  if (order.status !== "COMPLETED") return { ok: false, error: "Order sudah diproses sebelumnya" };

  await prisma.$transaction(async (tx) => {
    await tx.order.update({
      where: { id: orderId },
      data: {
        status: "VOIDED",
        voidReason: reason.trim(),
        voidById: user.id,
        voidedAt: new Date(),
      },
    });

    // Kembalikan bahan jika dipilih
    if (restoreStock) {
      const productIds = order.items.map((i) => i.productId).filter((x): x is string => !!x);
      const products = await tx.product.findMany({
        where: { id: { in: productIds } },
        include: { recipe: true, comboItems: { include: { child: { include: { recipe: true } } } } },
      });
      const pMap = new Map(products.map((p) => [p.id, p]));

      const needMap = new Map<string, number>();
      const childRestore = new Map<string, number>();
      for (const item of order.items) {
        if (!item.productId) continue;
        const p = pMap.get(item.productId);
        if (!p) continue;
        for (const r of p.recipe) {
          needMap.set(r.ingredientId, (needMap.get(r.ingredientId) ?? 0) + r.qtyPerServing * item.qty);
        }
        // Combo: kembalikan bahan & etalase ANAK (kebalikan dekrement saat checkout)
        for (const ci of p.comboItems) {
          for (const r of ci.child.recipe) {
            needMap.set(r.ingredientId, (needMap.get(r.ingredientId) ?? 0) + r.qtyPerServing * ci.qty * item.qty);
          }
          childRestore.set(ci.childId, (childRestore.get(ci.childId) ?? 0) + ci.qty * item.qty);
        }
      }
      for (const [ingredientId, qty] of needMap) {
        await tx.ingredient.update({
          where: { id: ingredientId },
          data: { stock: { increment: qty } },
        });
        await tx.ingredientMovement.create({
          data: {
            ingredientId,
            type: "VOID",
            qty,
            note: `Void ${order.orderNo}: ${reason.trim()}`,
            userId: user.id,
          },
        });
      }
      // Etalase anak combo kembali (hanya yang dilacak)
      for (const [childId, qty] of childRestore) {
        const child = await tx.product.findUnique({
          where: { id: childId },
          select: { readyEnabled: true, readyQty: true },
        });
        if (child?.readyEnabled && child.readyQty !== null) {
          await tx.product.update({
            where: { id: childId },
            data: { readyQty: { increment: qty } },
          });
        }
      }
    }      await tx.auditLog.create({
        data: {
          userId: user.id,
          action: "VOID_ORDER",
          entity: "Order",
          entityId: orderId,
          meta: JSON.stringify({ orderNo: order.orderNo, reason, restoreStock }),
        },
      });
    });

  return { ok: true };
}

export async function refundOrder(
  orderId: string,
  reason: string,
  mode: "FULL" | "PARTIAL",
  partialAmount?: number
): Promise<{ ok: boolean; error?: string }> {
  const session = await getServerSession(authOptions);
  if (!session?.user) return { ok: false, error: "Sesi berakhir" };
  const user = session.user as { id: string; role: string };

  if (!["OWNER", "ADMIN"].includes(user.role)) {
    return { ok: false, error: "Refund hanya bisa di-approve Owner/Admin" };
  }
  if (!reason.trim()) return { ok: false, error: "Alasan refund wajib diisi" };

  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) return { ok: false, error: "Order tidak ditemukan" };
  if (order.status !== "COMPLETED") return { ok: false, error: "Order sudah diproses sebelumnya" };

  let refundAmount = order.total;
  if (mode === "PARTIAL") {
    if (!Number.isFinite(partialAmount) || (partialAmount ?? 0) <= 0) {
      return { ok: false, error: "Nominal refund tidak valid" };
    }
    if ((partialAmount ?? 0) >= order.total) {
      return { ok: false, error: "Refund sebagian harus lebih kecil dari total" };
    }
    refundAmount = Math.round(partialAmount ?? 0);
  }

  await prisma.$transaction(async (tx) => {
    await tx.order.update({
      where: { id: orderId },
      data: {
        status: "REFUNDED",
        voidReason: reason.trim(),
        refundAmount,
        voidById: user.id,
        voidedAt: new Date(),
      },
    });

    await tx.auditLog.create({
      data: {
        userId: user.id,
        action: "REFUND_ORDER",
        entity: "Order",
        entityId: orderId,
        meta: JSON.stringify({ orderNo: order.orderNo, reason, mode, refundAmount, total: order.total, payment: order.paymentMethod }),
      },
    });
  });

  revalidatePath("/orders");
  return { ok: true };
}
