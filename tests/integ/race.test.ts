/**
 * T2 — Race: dua checkout paralel pada produk etalase readyQty = 1.
 * Kontrak: tepat SATU order sukses; readyQty akhir 0 (tidak pernah negatif).
 * Jalankan: npx tsx --test tests/integ/race.test.ts
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../../src/lib/prisma";
import { createOrderCore } from "../../src/app/(app)/pos/actions";

const tag = `RACE${Date.now()}`;
let userId = "";
let productId = "";
let shiftId = "";

before(async () => {
  const user = await prisma.user.create({
    data: { name: tag, email: `${tag.toLowerCase()}@test.local`, password: "x" },
  });
  userId = user.id;
  const shift = await prisma.shift.create({ data: { userId, status: "OPEN", openingCash: 0 } });
  shiftId = shift.id;
  const prod = await prisma.product.create({
    data: {
      name: `Sayap ${tag}`,
      price: 8000,
      costPrice: 0,
      isAvailable: true,
      readyEnabled: true,
      readyQty: 1,
    },
  });
  productId = prod.id;
});

test("dua checkout paralel stok etalase 1 → tepat satu sukses, readyQty = 0", async () => {
  const input = {
    orderType: "TAKE_AWAY",
    paymentMethod: "QRIS",
    orderDiscount: 0,
    items: [{ productId, qty: 1, discount: 0 }],
  };
  const [a, b] = await Promise.all([createOrderCore(userId, input), createOrderCore(userId, input)]);
  const okCount = [a, b].filter((r) => r.ok).length;
  assert.equal(okCount, 1, `harus tepat satu sukses, dapat ${okCount}: ${JSON.stringify([a, b])}`);
  const p = await prisma.product.findUnique({ where: { id: productId } });
  assert.equal(p?.readyQty, 0, `readyQty harus 0, dapat ${p?.readyQty}`);
});

after(async () => {
  const orders = await prisma.order.findMany({ where: { shiftId }, select: { id: true } });
  const orderIds = orders.map((o) => o.id);
  await prisma.orderItem.deleteMany({ where: { orderId: { in: orderIds } } });
  await prisma.order.deleteMany({ where: { id: { in: orderIds } } });
  await prisma.auditLog.deleteMany({ where: { userId } });
  await prisma.product.delete({ where: { id: productId } }).catch(() => null);
  await prisma.shift.delete({ where: { id: shiftId } }).catch(() => null);
  await prisma.user.delete({ where: { id: userId } }).catch(() => null);
  await prisma.$disconnect();
});
