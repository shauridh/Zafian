/**
 * T4 — HPP dinamis: stockInCore dengan harga → weighted costPerUnit → recompute costPrice produk.
 * Jalankan: npx tsx --test tests/integ/hpp.test.ts
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../../src/lib/prisma";
import { stockInCore } from "../../src/app/(app)/ingredients/actions";

const tag = `HPP${Date.now()}`;
let userId = "";
let ingredientId = "";
let productId = "";

before(async () => {
  const user = await prisma.user.create({
    data: { name: tag, email: `${tag.toLowerCase()}@test.local`, password: "x" },
  });
  userId = user.id;
  const ing = await prisma.ingredient.create({
    data: {
      name: `Tepung ${tag}`,
      unit: "gr",
      stock: 1000,
      costPerUnit: 100,
      purchaseUnit: "pack",
      purchaseQty: 1000,
      purchasePrice: 100000,
    },
  });
  ingredientId = ing.id;
  const prod = await prisma.product.create({
    data: {
      name: `Roti ${tag}`,
      price: 20000,
      costPrice: 1000,
      recipe: { create: [{ ingredientId, qtyPerServing: 10 }] },
    },
  });
  productId = prod.id;
});

test("stockInCore dengan harga → costPerUnit weighted 133.33 & costPrice produk 1333", async () => {
  const res = await stockInCore(userId, {
    ingredientId,
    qty: 1, // 1 pack = 1000 gr
    purchasePrice: 200000, // → 200/gr baru
  });
  assert.equal(res.ok, true, JSON.stringify(res));

  const ing = await prisma.ingredient.findUnique({ where: { id: ingredientId } });
  // weighted: (1000×100 + 1000×200) / 2000 = 150
  assert.equal(Number(ing?.costPerUnit), 150, `costPerUnit=${ing?.costPerUnit}`);
  assert.equal(ing?.purchasePrice, 200000);

  const prod = await prisma.product.findUnique({ where: { id: productId } });
  // resep 10 gr × 150 = 1500 (recompute otomatis)
  assert.equal(Number(prod?.costPrice), 1500, `costPrice=${prod?.costPrice}`);
});

test("stockInCore tanpa harga → HPP & costPrice TIDAK berubah", async () => {
  const res = await stockInCore(userId, { ingredientId, qty: 2 }); // 2 pack tanpa harga
  assert.equal(res.ok, true, JSON.stringify(res));

  const ing = await prisma.ingredient.findUnique({ where: { id: ingredientId } });
  assert.equal(Number(ing?.costPerUnit), 150, "HPP harus tetap 150");
  assert.equal(ing?.purchasePrice, 200000, "purchasePrice harus tetap");

  const prod = await prisma.product.findUnique({ where: { id: productId } });
  assert.equal(Number(prod?.costPrice), 1500, "costPrice harus tetap 1500");
});

after(async () => {
  await prisma.product.delete({ where: { id: productId } }).catch(() => null);
  await prisma.recipeItem.deleteMany({ where: { ingredientId } });
  await prisma.ingredientMovement.deleteMany({ where: { ingredientId } });
  await prisma.ingredient.delete({ where: { id: ingredientId } }).catch(() => null);
  await prisma.auditLog.deleteMany({ where: { userId } });
  await prisma.user.delete({ where: { id: userId } }).catch(() => null);
  await prisma.$disconnect();
});
