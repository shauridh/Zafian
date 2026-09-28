/**
 * Verifikasi data transaksi terakhir: dekrement readyQty, dekrement bahan resep,
 * Item teragregasi (satu baris per productId), dan konsistensi uang.
 * Jalankan: npx tsx scripts/verify-order.ts
 */
import { prisma } from "../src/lib/prisma";

async function main() {
  const order = await prisma.order.findFirst({
    orderBy: { createdAt: "desc" },
    include: { items: true, cashier: { select: { name: true } } },
  });
  if (!order) return console.log("NO_ORDER");

  console.log("order:", order.orderNo, "| status:", order.status, "| total:", order.total);
  console.log(
    "items (harus 1 baris per produk, qty teragregasi):",
    order.items.map((i) => `${i.nameSnapshot} x${i.qty} (disc ${i.discount})`)
  );
  const itemSum = order.items.reduce((s, i) => s + i.priceSnapshot * i.qty - i.discount * i.qty, 0);
  console.log("konsistensi: itemSum", itemSum, "== subtotal?", itemSum === order.subtotal);

  const sayap = await prisma.product.findFirst({ where: { name: "Sayap" } });
  console.log(
    "Sayap readyQty (awal 8, terjual 8 → harus 0):",
    sayap?.readyQty,
    "| readyEnabled:",
    sayap?.readyEnabled
  );

  const plastik = await prisma.ingredient.findFirst({ where: { name: "plastik kecil" } });
  console.log("plastik kecil stock (700 − 8 = 692):", plastik?.stock);

  const movs = await prisma.ingredientMovement.findMany({
    where: { type: "SALE", note: { contains: order.orderNo } },
    include: { ingredient: { select: { name: true } } },
  });
  console.log("ingredientMovement SALE:", movs.map((m) => `${m.ingredient.name}:${m.qty}`));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
