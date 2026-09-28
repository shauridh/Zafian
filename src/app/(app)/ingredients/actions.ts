"use server";

import { getServerSession } from "next-auth";
import { revalidatePath } from "next/cache";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { computeCostPerUnit } from "@/lib/utils";
import { weightedCostPerUnit } from "@/lib/hpp";

async function requireOwner() {
  const session = await getServerSession(authOptions);
  if (!session?.user || !["OWNER", "ADMIN"].includes((session.user as { role: string }).role)) {
    return null;
  }
  return session;
}

export interface IngredientInput {
  id?: string;
  name: string;
  unit: string; // satuan jual/resep
  minStock: number;
  costPerUnit: number; // opsional manual; dioverride jika ada data beli
  purchaseUnit?: string | null;
  purchaseQty?: number | null; // isi per 1 satuan beli (dalam satuan jual)
  purchasePrice?: number | null; // harga per 1 satuan beli
}

/**
 * Toggle aktif/nonaktif bahan. Nonaktif = disembunyikan dari pemilihan resep di halaman Menu;
 * riwayat & laporan tetap utuh.
 */
export async function toggleIngredient(id: string, isActive: boolean): Promise<{ ok: boolean; error?: string }> {
  const session = await requireOwner();
  if (!session) return { ok: false, error: "Tidak diizinkan" };
  try {
    await prisma.ingredient.update({ where: { id }, data: { isActive } });
    revalidatePath("/ingredients");
    revalidatePath("/products");
    return { ok: true };
  } catch {
    return { ok: false, error: "Gagal mengubah status bahan" };
  }
}

export async function saveIngredient(input: IngredientInput): Promise<{ ok: boolean; error?: string }> {
  const session = await requireOwner();
  if (!session) return { ok: false, error: "Tidak diizinkan" };
  if (!input.name.trim()) return { ok: false, error: "Nama bahan wajib diisi" };
  if (!input.unit.trim()) return { ok: false, error: "Satuan jual wajib diisi" };
  if (input.purchaseUnit && (!input.purchaseQty || input.purchaseQty <= 0)) {
    return { ok: false, error: "Isi per satuan beli harus > 0" };
  }

  const costPerUnit = computeCostPerUnit(input);

  const data = {
    name: input.name.trim(),
    unit: input.unit.trim(),
    minStock: input.minStock || 0,
    costPerUnit,
    purchaseUnit: input.purchaseUnit || null,
    purchaseQty: input.purchaseQty || null,
    purchasePrice: input.purchasePrice || null,
  };

  try {
    if (input.id) {
      await prisma.ingredient.update({ where: { id: input.id }, data });
    } else {
      await prisma.ingredient.create({ data });
    }
    revalidatePath("/ingredients");
    return { ok: true };
  } catch {
    return { ok: false, error: "Gagal menyimpan bahan" };
  }
}

export async function deleteIngredient(id: string): Promise<{ ok: boolean; error?: string }> {
  const session = await requireOwner();
  if (!session) return { ok: false, error: "Tidak diizinkan" };
  try {
    await prisma.ingredient.delete({ where: { id } });
    revalidatePath("/ingredients");
    return { ok: true };
  } catch {
    return { ok: false, error: "Gagal menghapus bahan" };
  }
}

/**
 * Stok masuk dalam SATUAN BELI (mis. 1 pak) — otomatis dikonversi
 * ke satuan jual (mis. 9 pcs) sesuai konversi yang tersimpan.
 */
export async function stockIn(input: {
  ingredientId: string;
  qty: number; // dalam satuan beli jika bahan punya konversi, else satuan jual
  purchasePrice?: number | null; // opsional: update harga beli terbaru
  note?: string;
}): Promise<{ ok: boolean; error?: string }> {
  const session = await getServerSession(authOptions);
  if (!session?.user || !["OWNER", "ADMIN"].includes((session.user as { role: string }).role)) {
    return { ok: false, error: "Tidak diizinkan" };
  }
  const userId = (session.user as { id: string }).id;
  const res = await stockInCore(userId, input);
  if (res.ok) {
    revalidatePath("/ingredients");
    revalidatePath("/products"); // HPP menu bisa ikut recompute
  }
  return res;
}

/**
 * Inti stok masuk tanpa konteks HTTP (dipanggil stockIn; test integrasi memanggil ini langsung).
 * Jika purchasePrice diberikan: HPP bahan diperbarui dengan RATA-RATA TERTIMBANG
 * (stok lama × HPP lama + qty baru × harga baru) / total — lalu HPP produk yang
 * mereferensikan bahan ini direcompute (Σ qtyPerServing × costPerUnit).
 */
export async function stockInCore(
  userId: string,
  input: {
    ingredientId: string;
    qty: number;
    purchasePrice?: number | null;
    note?: string;
  }
): Promise<{ ok: boolean; error?: string }> {
  if (!Number.isFinite(input.qty) || input.qty <= 0) {
    return { ok: false, error: "Jumlah tidak valid" };
  }

  const ing = await prisma.ingredient.findUnique({ where: { id: input.ingredientId } });
  if (!ing) return { ok: false, error: "Bahan tidak ditemukan" };

  const hasConversion = !!ing.purchaseUnit && !!ing.purchaseQty && ing.purchaseQty > 0;
  const qtySellUnit = hasConversion ? input.qty * (ing.purchaseQty as number) : input.qty;

  await prisma.$transaction(async (tx) => {
    // 1. HPP baru (rata-rata tertimbang) jika harga dicatat
    let newCostPerUnit: number | null = null;
    if (input.purchasePrice && input.purchasePrice > 0) {
      const pricePerSellUnit = hasConversion
        ? input.purchasePrice / (ing.purchaseQty as number)
        : input.purchasePrice;
      newCostPerUnit = weightedCostPerUnit(
        ing.stock,
        Number(ing.costPerUnit),
        qtySellUnit,
        pricePerSellUnit
      );
    }

    // 2. Update bahan (stok + harga beli + HPP bila dihitung)
    await tx.ingredient.update({
      where: { id: input.ingredientId },
      data: {
        stock: { increment: qtySellUnit },
        ...(input.purchasePrice && input.purchasePrice > 0
          ? { purchasePrice: Math.round(input.purchasePrice) }
          : {}),
        ...(newCostPerUnit !== null ? { costPerUnit: newCostPerUnit } : {}),
      },
    });

    // 3. Recompute costPrice semua produk yang mereferensikan bahan ini
    if (newCostPerUnit !== null) {
      const recipeRows = await tx.recipeItem.findMany({
        where: { ingredientId: input.ingredientId },
        select: { productId: true },
      });
      const productIds = [...new Set(recipeRows.map((r) => r.productId))];
      for (const pid of productIds) {
        const rows = await tx.recipeItem.findMany({
          where: { productId: pid },
          select: { qtyPerServing: true, ingredient: { select: { costPerUnit: true } } },
        });
        const costPrice = rows.reduce((s, r) => s + r.qtyPerServing * Number(r.ingredient.costPerUnit), 0);
        await tx.product.update({ where: { id: pid }, data: { costPrice: Math.round(costPrice) } });
      }
    }

    // 4. Movement + audit
    await tx.ingredientMovement.create({
      data: {
        ingredientId: input.ingredientId,
        type: "IN",
        qty: qtySellUnit,
        note: hasConversion
          ? `${input.note || "Stok masuk"} (${input.qty} ${ing.purchaseUnit} = ${qtySellUnit} ${ing.unit})`
          : input.note || "Stok masuk",
        userId,
      },
    });
    await tx.auditLog.create({
      data: {
        userId,
        action: "INGREDIENT_IN",
        entity: "Ingredient",
        entityId: input.ingredientId,
        meta: JSON.stringify({ qtyBeli: input.qty, qtyJual: qtySellUnit, note: input.note }),
      },
    });
  });

  return { ok: true };
}

export async function adjustStock(input: {
  ingredientId: string;
  newStock: number;
  note: string;
}): Promise<{ ok: boolean; error?: string }> {
  const session = await getServerSession(authOptions);
  if (!session?.user || !["OWNER", "ADMIN"].includes((session.user as { role: string }).role)) {
    return { ok: false, error: "Tidak diizinkan" };
  }
  if (!Number.isFinite(input.newStock) || input.newStock < 0) {
    return { ok: false, error: "Stok tidak valid" };
  }
  if (!input.note.trim()) return { ok: false, error: "Alasan penyesuaian wajib diisi" };

  const userId = (session.user as { id: string }).id;
  const ing = await prisma.ingredient.findUnique({ where: { id: input.ingredientId } });
  if (!ing) return { ok: false, error: "Bahan tidak ditemukan" };

  const diff = input.newStock - ing.stock;

  await prisma.$transaction([
    prisma.ingredient.update({
      where: { id: input.ingredientId },
      data: { stock: input.newStock },
    }),
    prisma.ingredientMovement.create({
      data: {
        ingredientId: input.ingredientId,
        type: "ADJUSTMENT",
        qty: diff,
        note: input.note.trim(),
        userId,
      },
    }),
    prisma.auditLog.create({
      data: {
        userId,
        action: "INGREDIENT_ADJUST",
        entity: "Ingredient",
        entityId: input.ingredientId,
        meta: JSON.stringify({ from: ing.stock, to: input.newStock, note: input.note }),
      },
    }),
  ]);

  revalidatePath("/ingredients");
  return { ok: true };
}
