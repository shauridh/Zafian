/**
 * T5 — ComboItem: ekspansi combo saat checkout & void.
 * Red-green: sebelum implementasi, test ini gagal (prisma.comboItem tidak ada).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../../src/lib/prisma";
import { createOrderCore } from "../../src/app/(app)/pos/actions";
import { voidOrderCore } from "../../src/app/(app)/orders/actions";
import { hppFromCombos } from "../../src/lib/hpp";

const TAG = `COMBO${Date.now()}`;

test("T5: combo checkout mengekspansi resep anak + readyQty anak; void mengembalikan", async (t) => {
  const user = await prisma.user.create({
    data: { name: "Test Combo", email: `combo-${TAG}@test.local`, password: "x", role: "OWNER" },
  });
  const shift = await prisma.shift.create({
    data: { userId: user.id, status: "OPEN", openingCash: 0 },
  });

  const ing = await prisma.ingredient.create({
    data: { name: `Bahan Combo ${TAG}`, unit: "gr", stock: 1000, minStock: 0, costPerUnit: 10 },
  });

  const child = await prisma.product.create({
    data: {
      name: `Anak ${TAG}`,
      price: 5000,
      costPrice: 2000,
      readyEnabled: true,
      readyQty: 3, // 1 combo butuh 2 anak → combo ke-2 harus gagal
      recipe: { create: { ingredientId: ing.id, qtyPerServing: 100 } },
    },
  });

  const combo = await prisma.product.create({
    data: {
      name: `Paket ${TAG}`,
      price: 9000, // lebih murah dari 2×5000
      costPrice: 0, // nanti dihitung dari child
      recipe: { create: { ingredientId: ing.id, qtyPerServing: 50 } }, // kemasan combo sendiri pakai bahan
    },
  });
  await prisma.comboItem.create({ data: { comboId: combo.id, childId: child.id, qty: 2 } });
  // HPP combo = kemasan 50gr×10 + 2 anak × 2000 = 4500 (seperti yang di-set saveProduct)
  await prisma.product.update({ where: { id: combo.id }, data: { costPrice: 4500 } });

  t.after(async () => {
    await prisma.order.deleteMany({ where: { shiftId: shift.id } });
    await prisma.product.deleteMany({ where: { id: { in: [combo.id, child.id] } } });
    await prisma.ingredient.delete({ where: { id: ing.id } }).catch(() => {});
    await prisma.shift.delete({ where: { id: shift.id } }).catch(() => {});
    await prisma.user.delete({ where: { id: user.id } }).catch(() => {});
  });

  // ---- checkout 2 combo: combo ke-2 harus GAGAL (child readyQty 3 < 2×2) ----
  const res = await createOrderCore(user.id, {
    orderType: "TAKE_AWAY",
    paymentMethod: "CASH",
    cashReceived: 100000,
    orderDiscount: 0,
    items: [{ productId: combo.id, qty: 2, discount: 0 }],
  });
  assert.equal(res.ok, false, "combo ke-2 harus ditolak: anak tinggal 3, butuh 4");
  assert.match(res.error ?? "", /Anak/, "error harus menyebut nama anak yang habis");

  // ---- checkout 1 combo: sukses ----
  const ok = await createOrderCore(user.id, {
    orderType: "TAKE_AWAY",
    paymentMethod: "CASH",
    cashReceived: 100000,
    orderDiscount: 0,
    items: [{ productId: combo.id, qty: 1, discount: 0 }],
  });
  assert.equal(ok.ok, true, `checkout combo 1 harus sukses: ${ok.error ?? ""}`);

  const order = await prisma.order.findFirst({ where: { shiftId: shift.id, status: "COMPLETED" }, include: { items: true } });
  assert.ok(order, "order harus ada");
  assert.equal(order!.items.length, 1, "1 baris OrderItem (combo), bukan dipecah");

  // HPP combo = resep kemasan 50gr×10 + 2 anak × 2000 = 500 + 4000 = 4500
  assert.equal(Number(order!.costTotal), 4500, `costTotal harus 4500, dapat ${order!.costTotal}`);

  // Bahan: 1000 − (50×1 kemasan + 100×2 anak) = 750
  const ingAfter = await prisma.ingredient.findUnique({ where: { id: ing.id } });
  assert.equal(ingAfter!.stock, 750, `stok bahan harus 750, dapat ${ingAfter!.stock}`);

  // Etalase anak 3 − 2 = 1
  const childAfter = await prisma.product.findUnique({ where: { id: child.id } });
  assert.equal(childAfter!.readyQty, 1, `readyQty anak harus 1, dapat ${childAfter!.readyQty}`);

  // ---- void + restore stock: semua kembali ----
  const v = await voidOrderCore({ id: user.id, role: "OWNER" }, order!.id, "test combo void", true);
  assert.equal(v.ok, true, `void harus sukses: ${v.error ?? ""}`);

  const ingVoid = await prisma.ingredient.findUnique({ where: { id: ing.id } });
  assert.equal(ingVoid!.stock, 1000, "bahan harus kembali 1000 setelah void restore");
  const childVoid = await prisma.product.findUnique({ where: { id: child.id } });
  assert.equal(childVoid!.readyQty, 3, "etalase anak harus kembali 3");

  // ---- helper HPP combo ----
  const comboFull = await prisma.product.findUnique({
    where: { id: combo.id },
    include: {
      comboItems: { include: { child: true } },
      recipe: { include: { ingredient: { select: { costPerUnit: true } } } },
    },
  });
  assert.equal(hppFromCombos(comboFull!), 4500, "hppFromCombos = Σ anak + resep kemasan");
});
