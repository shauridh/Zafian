"use server";

import { getServerSession } from "next-auth";
import { revalidatePath } from "next/cache";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

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
  recipe: { ingredientId: string; qtyPerServing: number }[];
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

  const data = {
    name: input.name.trim(),
    categoryId: input.categoryId || null,
    price: Math.round(input.price),
    costPrice: Math.round(input.costPrice || 0),
    isAvailable: input.isAvailable,
    imageUrl: input.imageUrl ?? null,
  };

  try {
    await prisma.$transaction(async (tx) => {
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
      } else {
        await tx.product.create({
          data: {
            ...data,
            recipe: {
              create: input.recipe.map((r) => ({
                ingredientId: r.ingredientId,
                qtyPerServing: r.qtyPerServing,
              })),
            },
          },
        });
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
