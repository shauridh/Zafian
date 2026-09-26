"use server";

import { getServerSession } from "next-auth";
import { revalidatePath } from "next/cache";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { computeCostPerUnit } from "@/lib/utils";

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
  if (!Number.isFinite(input.qty) || input.qty <= 0) {
    return { ok: false, error: "Jumlah tidak valid" };
  }

  const ing = await prisma.ingredient.findUnique({ where: { id: input.ingredientId } });
  if (!ing) return { ok: false, error: "Bahan tidak ditemukan" };

  const hasConversion = !!ing.purchaseUnit && !!ing.purchaseQty && ing.purchaseQty > 0;
  const qtySellUnit = hasConversion ? input.qty * (ing.purchaseQty as number) : input.qty;

  const userId = (session.user as { id: string }).id;
  await prisma.$transaction([
    prisma.ingredient.update({
      where: { id: input.ingredientId },
      data: {
        stock: { increment: qtySellUnit },
        ...(input.purchasePrice ? { purchasePrice: Math.round(input.purchasePrice) } : {}),
      },
    }),
    prisma.ingredientMovement.create({
      data: {
        ingredientId: input.ingredientId,
        type: "IN",
        qty: qtySellUnit,
        note: hasConversion
          ? `${input.note || "Stok masuk"} (${input.qty} ${ing.purchaseUnit} = ${qtySellUnit} ${ing.unit})`
          : input.note || "Stok masuk",
        userId,
      },
    }),
    prisma.auditLog.create({
      data: {
        userId,
        action: "INGREDIENT_IN",
        entity: "Ingredient",
        entityId: input.ingredientId,
        meta: JSON.stringify({ qtyBeli: input.qty, qtyJual: qtySellUnit, note: input.note }),
      },
    }),
  ]);

  revalidatePath("/ingredients");
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
