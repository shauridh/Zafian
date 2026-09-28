"use server";

import { getServerSession } from "next-auth";
import { revalidatePath } from "next/cache";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hppFromCombos } from "@/lib/hpp";

async function requireOwner() {
  const session = await getServerSession(authOptions);
  if (!session?.user || !["OWNER", "ADMIN"].includes((session.user as { role: string }).role)) {
    return null;
  }
  return session;
}

export async function saveProduct(input: {
  id?: string;
  name: string;
  categoryId?: string | null;
  price: number;
  costPrice: number;
  isAvailable: boolean;
  imageUrl?: string | null;
  readyEnabled: boolean;
  readyQty: number;
  recipe: { ingredientId: string; qtyPerServing: number }[];
  comboItems?: { childId: string; qty: number }[];
}): Promise<{ ok: boolean; error?: string }> {
  const session = await requireOwner();
  if (!session) return { ok: false, error: "Hanya Owner/Admin yang bisa mengubah menu" };

  if (!input.name.trim()) return { ok: false, error: "Nama produk wajib diisi" };
  if (!Number.isFinite(input.price) || input.price < 0) return { ok: false, error: "Harga tidak valid" };

  // validasi resep
  for (const r of input.recipe) {
    if (!r.ingredientId || !Number.isFinite(r.qtyPerServing) || r.qtyPerServing <= 0) {
      return { ok: false, error: "Resep tidak valid" };
    }
  }

  // HPP otomatis dari resep: Σ (qty per sajian × HPP satuan bahan)
  let costPrice = Math.round(input.costPrice || 0);
  if (input.recipe.length > 0) {
    const ings = await prisma.ingredient.findMany({
      where: { id: { in: input.recipe.map((r) => r.ingredientId) } },
      select: { id: true, costPerUnit: true },
    });
    const costMap = new Map(ings.map((i) => [i.id, Number(i.costPerUnit)]));
    costPrice = input.recipe.reduce(
      (s, r) => s + r.qtyPerServing * (costMap.get(r.ingredientId) ?? 0),
      0
    );
    costPrice = Math.round(costPrice);
  }

  // Validasi combo: tidak boleh combo & ber-resep bahan sekaligus kecuali kemasan,
  // tidak boleh jadi anak dirinya sendiri, anak harus ada.
  const combos = (input.comboItems ?? []).filter((c) => c.childId && c.qty > 0);
  if (combos.length > 0) {
    if (input.id && combos.some((c) => c.childId === input.id)) {
      return { ok: false, error: "Paket tidak bisa memuat dirinya sendiri" };
    }
    const childIds = combos.map((c) => c.childId);
    const childCount = await prisma.product.count({ where: { id: { in: childIds } } });
    if (childCount !== new Set(childIds).size) {
      return { ok: false, error: "Ada anak paket yang tidak ditemukan" };
    }
    if (input.recipe.length > 0) {
      const ings = await prisma.ingredient.findMany({
        where: { id: { in: input.recipe.map((r) => r.ingredientId) } },
        select: { id: true, costPerUnit: true },
      });
      const costMap = new Map(ings.map((i) => [i.id, Number(i.costPerUnit)]));
      const packagingOnly = input.recipe.every((r) => (costMap.get(r.ingredientId) ?? 0) === 0);
      if (!packagingOnly) {
        return { ok: false, error: "Paket hanya boleh punya resep kemasan (bahan ber-HPP 0) — bahan makanan sudah dihitung dari anak paket" };
      }
    }
  }

  const data = {
    name: input.name.trim(),
    categoryId: input.categoryId || null,
    price: Math.round(input.price),
    costPrice,
    isAvailable: input.isAvailable,
    readyEnabled: input.readyEnabled,
    readyQty: input.readyEnabled ? Math.max(0, Math.round(input.readyQty)) : null,
    imageUrl: input.imageUrl ?? null,
  };

  try {
    await prisma.$transaction(async (tx) => {
      let comboId: string | undefined;
      if (input.id) {
        await tx.product.update({ where: { id: input.id }, data });
        await tx.recipeItem.deleteMany({ where: { productId: input.id } });
        if (input.recipe.length > 0) {
          await tx.recipeItem.createMany({
            data: input.recipe.map((r) => ({
              productId: input.id!,
              ingredientId: r.ingredientId,
              qtyPerServing: r.qtyPerServing,
            })),
          });
        }
        await tx.comboItem.deleteMany({ where: { comboId: input.id } });
        if (combos.length > 0) {
          await tx.comboItem.createMany({
            data: combos.map((c) => ({ comboId: input.id!, childId: c.childId, qty: c.qty })),
          });
        }
        comboId = input.id;
      } else {
        const created = await tx.product.create({
          data: {
            ...data,
            recipe: {
              create: input.recipe.map((r) => ({
                ingredientId: r.ingredientId,
                qtyPerServing: r.qtyPerServing,
              })),
            },
            comboItems: {
              create: combos.map((c) => ({ childId: c.childId, qty: c.qty })),
            },
          },
        });
        comboId = created.id;
      }

      // HPP combo = resep kemasan + Σ (HPP anak × qty) — dihitung SETELAH relasi tersimpan
      if (combos.length > 0 && comboId) {
        const full = await tx.product.findUnique({
          where: { id: comboId },
          include: {
            comboItems: { include: { child: true } },
            recipe: { include: { ingredient: { select: { costPerUnit: true } } } },
          },
        });
        if (full) await tx.product.update({ where: { id: comboId }, data: { costPrice: hppFromCombos(full) } });
      }
    });

    revalidatePath("/products");
    revalidatePath("/pos");
    return { ok: true };
  } catch (e) {
    console.error(e);
    return { ok: false, error: "Gagal menyimpan produk" };
  }
}

/**
 * Tambah/kurangi porsi siap jual (etalase), terpisah dari stok bahan baku.
 * Hanya aktif untuk produk dengan readyEnabled; tidak bisa minus di bawah 0.
 */
export async function adjustReadyQty(
  id: string,
  delta: number
): Promise<{ ok: boolean; error?: string; readyQty?: number }> {
  const session = await requireOwner();
  if (!session) return { ok: false, error: "Tidak diizinkan" };
  if (!Number.isInteger(delta) || Math.abs(delta) > 999) return { ok: false, error: "Perubahan tidak valid" };

  const p = await prisma.product.findUnique({ where: { id }, select: { readyEnabled: true, readyQty: true, name: true } });
  if (!p) return { ok: false, error: "Produk tidak ditemukan" };
  if (!p.readyEnabled || p.readyQty === null) return { ok: false, error: "Pelacakan etalase tidak aktif untuk menu ini" };

  // Atomik: increment langsung; decrement dengan guard gte 0 (tanpa read-then-write yang bisa lost-update)
  if (delta >= 0) {
    const r = await prisma.product.updateMany({
      where: { id, readyEnabled: true, readyQty: { not: null } },
      data: { readyQty: { increment: delta } },
    });
    if (r.count === 0) return { ok: false, error: "Pelacakan etalase tidak aktif untuk menu ini" };
  } else {
    const abs = Math.abs(delta);
    const dec = await prisma.product.updateMany({
      where: { id, readyQty: { gte: abs } },
      data: { readyQty: { decrement: abs } },
    });
    if (dec.count === 0) {
      // Sisa < abs → clamp ke 0 dalam satu operasi kondisional (tetap atomik)
      await prisma.product.updateMany({
        where: { id, readyQty: { gt: 0 } },
        data: { readyQty: 0 },
      });
    }
  }

  const next = (await prisma.product.findUnique({ where: { id }, select: { readyQty: true } }))?.readyQty ?? 0;
  revalidatePath("/products");
  revalidatePath("/pos");
  return { ok: true, readyQty: next };
}

/**
 * Laba & margin per menu dari penjualan 30 hari terakhir (status COMPLETED).
 * Laba memakai HPP tercatat per transaksi (costTotal), bukan HPP hari ini.
 */
export async function getProductProfit(): Promise<
  Record<string, { qty: number; revenue: number; profit: number }>
> {
  const since = new Date();
  since.setDate(since.getDate() - 30);
  since.setHours(0, 0, 0, 0);

  const items = await prisma.orderItem.findMany({
    where: { order: { status: "COMPLETED", createdAt: { gte: since } } },
    select: {
      productId: true,
      qty: true,
      priceSnapshot: true,
      discount: true,
      order: { select: { refundAmount: true, total: true } },
    },
  });

  const map: Record<string, { qty: number; revenue: number; profit: number }> = {};

  // Net revenue per menu (refund dibagi proporsional berdasar nilai bruto item)
  for (const it of items) {
    if (!it.productId) continue;
    const m = (map[it.productId] ??= { qty: 0, revenue: 0, profit: 0 });
    const gross = (it.priceSnapshot - it.discount) * it.qty;
    const share = it.order.total > 0 ? gross / it.order.total : 0;
    m.qty += it.qty;
    m.revenue += gross - it.order.refundAmount * share;
  }

  // Laba per menu = bruto − refund proporsional − HPP tercatat proporsional
  const orders = await prisma.order.findMany({
    where: { status: "COMPLETED", createdAt: { gte: since } },
    select: { id: true, total: true, costTotal: true, refundAmount: true, items: { select: { productId: true, qty: true, priceSnapshot: true, discount: true } } },
  });
  for (const o of orders) {
    for (const it of o.items) {
      if (!it.productId) continue;
      const gross = (it.priceSnapshot - it.discount) * it.qty;
      const share = o.total > 0 ? gross / o.total : 0;
      const m = map[it.productId];
      if (m) m.profit += gross - share * o.refundAmount - share * Number(o.costTotal);
    }
  }

  // Bulatkan hasil agar tidak bocor artefak float (mis. 6932.999999999) ke UI
  for (const m of Object.values(map)) {
    m.revenue = Math.round(m.revenue);
    m.profit = Math.round(m.profit);
  }

  return map;
}

export async function deleteProduct(id: string): Promise<{ ok: boolean; error?: string }> {
  const session = await requireOwner();
  if (!session) return { ok: false, error: "Tidak diizinkan" };
  try {
    await prisma.product.delete({ where: { id } });
    revalidatePath("/products");
    revalidatePath("/pos");
    return { ok: true };
  } catch {
    return { ok: false, error: "Gagal menghapus produk (mungkin masih dipakai transaksi)" };
  }
}

export async function saveCategory(name: string, sortOrder: number): Promise<{ ok: boolean; error?: string }> {
  const session = await requireOwner();
  if (!session) return { ok: false, error: "Tidak diizinkan" };
  if (!name.trim()) return { ok: false, error: "Nama kategori wajib diisi" };
  const existing = await prisma.category.findFirst({ where: { name: name.trim() } });
  if (existing) return { ok: false, error: "Kategori dengan nama itu sudah ada" };
  await prisma.category.create({ data: { name: name.trim(), sortOrder } });
  revalidatePath("/products");
  revalidatePath("/pos");
  return { ok: true };
}

export async function deleteCategory(id: string): Promise<{ ok: boolean; error?: string }> {
  const session = await requireOwner();
  if (!session) return { ok: false, error: "Tidak diizinkan" };
  await prisma.category.delete({ where: { id } }).catch(() => null);
  revalidatePath("/products");
  revalidatePath("/pos");
  return { ok: true };
}
