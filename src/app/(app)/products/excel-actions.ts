"use server";

import { getServerSession } from "next-auth";
import { revalidatePath } from "next/cache";
import ExcelJS from "exceljs";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { computeCostPerUnit } from "@/lib/utils";

const OWNER_ONLY = async () => {
  const session = await getServerSession(authOptions);
  return session?.user && ["OWNER", "ADMIN"].includes((session.user as { role: string }).role);
};

/** Ekspor menu & bahan ke satu workbook Excel (2 sheet). */
export async function exportExcel(): Promise<{ ok: boolean; base64?: string; error?: string }> {
  if (!(await OWNER_ONLY())) return { ok: false, error: "Tidak diizinkan" };

  const [products, ingredients] = await Promise.all([
    prisma.product.findMany({ include: { category: true, recipe: { include: { ingredient: true } } } }),
    prisma.ingredient.findMany({ orderBy: { name: "asc" } }),
  ]);

  const wb = new ExcelJS.Workbook();
  wb.creator = "Zafian POS";

  // ===== Sheet MENU =====
  const wsMenu = wb.addWorksheet("Menu");
  wsMenu.columns = [
    { header: "Nama*", width: 28 },
    { header: "Kategori", width: 16 },
    { header: "Harga Jual*", width: 14 },
    { header: "HPP", width: 14 },
    { header: "Tersedia (1/0)*", width: 14 },
    { header: "Resep (bahan=qty;...)", width: 40 },
  ];
  wsMenu.getRow(1).font = { bold: true };
  for (const p of products) {
    const recipe = p.recipe
      .map((r) => `${r.ingredient.name}=${r.qtyPerServing}`)
      .join(";");
    wsMenu.addRow([
      p.name,
      p.category?.name ?? "",
      p.price,
      p.costPrice,
      p.isAvailable ? 1 : 0,
      recipe,
    ]);
  }

  // ===== Sheet BAHAN =====
  const wsBahan = wb.addWorksheet("Bahan");
  wsBahan.columns = [
    { header: "Nama*", width: 24 },
    { header: "Satuan Jual*", width: 12 },
    { header: "Stok", width: 12 },
    { header: "Min Stok", width: 12 },
    { header: "Satuan Beli", width: 12 },
    { header: "Isi per Satuan Beli", width: 18 },
    { header: "Harga per Satuan Beli", width: 20 },
  ];
  wsBahan.getRow(1).font = { bold: true };
  for (const i of ingredients) {
    wsBahan.addRow([
      i.name,
      i.unit,
      i.stock,
      i.minStock,
      i.purchaseUnit ?? "",
      i.purchaseQty ?? "",
      i.purchasePrice ?? "",
    ]);
  }

  const buffer = await wb.xlsx.writeBuffer();
  return { ok: true, base64: Buffer.from(buffer).toString("base64") };
}

interface MenuRow {
  name: string;
  category: string;
  price: number;
  costPrice: number;
  available: boolean;
  recipe: string;
}

interface BahanRow {
  name: string;
  unit: string;
  stock: number;
  minStock: number;
  purchaseUnit: string;
  purchaseQty: number;
  purchasePrice: number;
}

/** Impor workbook Excel (format sama dengan ekspor). Update by nama; buat baru jika belum ada. */
export async function importExcel(
  base64: string
): Promise<{ ok: boolean; menuCreated?: number; menuUpdated?: number; bahanCreated?: number; bahanUpdated?: number; error?: string }> {
  if (!(await OWNER_ONLY())) return { ok: false, error: "Tidak diizinkan" };

  let wb: ExcelJS.Workbook;
  try {
    wb = new ExcelJS.Workbook();
    const buf: ExcelJS.Buffer = Buffer.from(base64, "base64") as unknown as ExcelJS.Buffer;
    await wb.xlsx.load(buf);
  } catch {
    return { ok: false, error: "File Excel tidak valid" };
  }

  const categories = await prisma.category.findMany();
  const ingredients = await prisma.ingredient.findMany();
  const ingByName = new Map(ingredients.map((i) => [i.name.toLowerCase(), i]));
  let menuCreated = 0, menuUpdated = 0, bahanCreated = 0, bahanUpdated = 0;

  // ===== Bahan dulu (menu butuh referensinya) =====
  const wsBahan = wb.getWorksheet("Bahan");
  if (wsBahan) {
    for (let r = 2; r <= wsBahan.rowCount; r++) {
      const row = wsBahan.getRow(r);
      const name = String(row.getCell(1).value ?? "").trim();
      if (!name) continue;
      const unit = String(row.getCell(2).value ?? "pcs").trim() || "pcs";
      const stock = Number(row.getCell(3).value ?? 0) || 0;
      const minStock = Number(row.getCell(4).value ?? 0) || 0;
      const purchaseUnit = String(row.getCell(5).value ?? "").trim();
      const purchaseQty = Number(row.getCell(6).value ?? 0) || null;
      const purchasePrice = Number(row.getCell(7).value ?? 0) || null;

      const data = {
        unit,
        minStock,
        purchaseUnit: purchaseUnit || null,
        purchaseQty,
        purchasePrice,
        costPerUnit: computeCostPerUnit({ costPerUnit: 0, purchasePrice, purchaseQty }),
      };

      const existing = ingByName.get(name.toLowerCase());
      if (existing) {
        await prisma.ingredient.update({
          where: { id: existing.id },
          data: { ...data, stock: Math.max(existing.stock, stock) },
        });
        bahanUpdated++;
      } else {
        const created = await prisma.ingredient.create({
          data: { name, ...data, stock },
        });
        ingByName.set(name.toLowerCase(), created);
        bahanCreated++;
      }
    }
  }

  // ===== Menu =====
  const wsMenu = wb.getWorksheet("Menu");
  if (wsMenu) {
    for (let r = 2; r <= wsMenu.rowCount; r++) {
      const row = wsMenu.getRow(r);
      const name = String(row.getCell(1).value ?? "").trim();
      if (!name) continue;
      const categoryName = String(row.getCell(2).value ?? "").trim();
      const price = Math.round(Number(row.getCell(3).value ?? 0)) || 0;
      const costPrice = Math.round(Number(row.getCell(4).value ?? 0)) || 0;
      const available = Number(row.getCell(5).value ?? 1) !== 0;
      const recipeStr = String(row.getCell(6).value ?? "").trim();

      // kategori: buat bila belum ada
      let categoryId: string | null = null;
      if (categoryName) {
        let cat = categories.find((c) => c.name.toLowerCase() === categoryName.toLowerCase());
        if (!cat) {
          cat = await prisma.category.create({
            data: { name: categoryName, sortOrder: categories.length + 1 },
          });
          categories.push(cat);
        }
        categoryId = cat.id;
      }

      // parse resep: "Biji Kopi=18;Susu UHT=120"
      const recipeItems: { ingredientId: string; qtyPerServing: number }[] = [];
      if (recipeStr) {
        for (const part of recipeStr.split(";")) {
          const [ingName, qtyStr] = part.split("=").map((s) => s.trim());
          if (!ingName) continue;
          const ing = ingByName.get(ingName.toLowerCase());
          const qty = Number(qtyStr) || 0;
          if (ing && qty > 0) {
            recipeItems.push({ ingredientId: ing.id, qtyPerServing: qty });
          }
        }
      }

      const existing = await prisma.product.findFirst({ where: { name } });
      const data = { name, price, costPrice, isAvailable: available, categoryId };
      if (existing) {
        await prisma.$transaction([
          prisma.product.update({ where: { id: existing.id }, data }),
          prisma.recipeItem.deleteMany({ where: { productId: existing.id } }),
          ...(recipeItems.length
            ? [
                prisma.recipeItem.createMany({
                  data: recipeItems.map((r) => ({ ...r, productId: existing.id })),
                }),
              ]
            : []),
        ]);
        menuUpdated++;
      } else {
        await prisma.product.create({
          data: {
            ...data,
            recipe: { create: recipeItems },
          },
        });
        menuCreated++;
      }
    }
  }

  revalidatePath("/products");
  revalidatePath("/ingredients");
  revalidatePath("/pos");

  return { ok: true, menuCreated, menuUpdated, bahanCreated, bahanUpdated };
}
