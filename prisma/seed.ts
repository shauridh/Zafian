import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const password = await bcrypt.hash("admin123", 10);
  const pin = await bcrypt.hash("1234", 10);

  await prisma.user.upsert({
    where: { email: "owner@kasir.id" },
    update: {},
    create: {
      name: "Owner",
      email: "owner@kasir.id",
      password,
      pinHash: pin,
      role: "OWNER",
    },
  });

  await prisma.user.upsert({
    where: { email: "kasir@kasir.id" },
    update: {},
    create: {
      name: "Kasir Satu",
      email: "kasir@kasir.id",
      password,
      pinHash: pin,
      role: "CASHIER",
    },
  });

  await prisma.settings.upsert({
    where: { id: "main" },
    update: {},
    create: {
      id: "main",
      storeName: "Zafian Kedai",
      address: "Jl. Merdeka No. 10, Jakarta",
      phone: "0812-3456-7890",
      footerReceipt: "Terima kasih! IG: @kedaikita",
      taxPercent: 0,
      receiptSize: 80,
      defaultOpeningCash: 350000,
    },
  });

  const cats = [
    { name: "Kopi", sortOrder: 1 },
    { name: "Non-Kopi", sortOrder: 2 },
    { name: "Makanan", sortOrder: 3 },
  ];
  for (const c of cats) {
    // idempoten: cari by NAME (bukan id) agar seed re-run tidak membuat duplikat
    const existing = await prisma.category.findFirst({ where: { name: c.name } });
    if (!existing) await prisma.category.create({ data: c });
  }

  const catKopi = await prisma.category.findFirst({ where: { name: "Kopi" } });
  const catNonKopi = await prisma.category.findFirst({ where: { name: "Non-Kopi" } });
  const catMakanan = await prisma.category.findFirst({ where: { name: "Makanan" } });

  // Bahan baku — contoh konversi satuan beli → satuan jual/resep:
  // Biji Kopi dibeli per kg (Rp 100.000/kg = 1.000 gr) → HPP 100/gr
  // Telur dibeli per pack isi 9 pcs (Rp 27.000/pack) → HPP 3.000/pcs
  const ingredients = [
    { name: "Biji Kopi", unit: "gr", stock: 2000, minStock: 300, costPerUnit: 100, purchaseUnit: "kg", purchaseQty: 1000, purchasePrice: 100000 },
    { name: "Susu UHT", unit: "ml", stock: 10000, minStock: 1000, costPerUnit: 15, purchaseUnit: "botol", purchaseQty: 1000, purchasePrice: 17000 },
    { name: "Gula Cair", unit: "ml", stock: 3000, minStock: 500, costPerUnit: 8, purchaseUnit: null, purchaseQty: null, purchasePrice: null },
    { name: "Es Batu", unit: "gr", stock: 20000, minStock: 2000, costPerUnit: 1, purchaseUnit: "karung", purchaseQty: 5000, purchasePrice: 6000 },
    { name: "Roti Brioche", unit: "pcs", stock: 50, minStock: 10, costPerUnit: 6000, purchaseUnit: null, purchaseQty: null, purchasePrice: null },
    { name: "Telur", unit: "pcs", stock: 100, minStock: 20, costPerUnit: 3000, purchaseUnit: "pack", purchaseQty: 9, purchasePrice: 27000 },
  ];
  for (const i of ingredients) {
    const existing = await prisma.ingredient.findFirst({ where: { name: i.name } });
    if (!existing) await prisma.ingredient.create({ data: i });
    else
      await prisma.ingredient.update({
        where: { id: existing.id },
        data: {
          purchaseUnit: i.purchaseUnit,
          purchaseQty: i.purchaseQty,
          purchasePrice: i.purchasePrice,
          costPerUnit:
            i.purchasePrice && i.purchaseQty
              ? Math.round(i.purchasePrice / i.purchaseQty)
              : i.costPerUnit,
          // top-up: pastikan stok minimal kembali ke level awal saat seed dijalankan
          stock: Math.max(existing.stock, i.stock),
        },
      });
  }
  const ing = async (name: string) =>
    (await prisma.ingredient.findFirst({ where: { name } }))!;

  const products = [
    {
      name: "Espresso",
      price: 18000,
      costPrice: 6000,
      categoryId: catKopi?.id,
      recipe: [{ ingredientId: (await ing("Biji Kopi")).id, qtyPerServing: 18 }],
    },
    {
      name: "Kopi Susu Gula Aren",
      price: 22000,
      costPrice: 8000,
      categoryId: catKopi?.id,
      recipe: [
        { ingredientId: (await ing("Biji Kopi")).id, qtyPerServing: 18 },
        { ingredientId: (await ing("Susu UHT")).id, qtyPerServing: 120 },
        { ingredientId: (await ing("Gula Cair")).id, qtyPerServing: 20 },
      ],
    },
    {
      name: "Latte",
      price: 25000,
      costPrice: 9000,
      categoryId: catKopi?.id,
      recipe: [
        { ingredientId: (await ing("Biji Kopi")).id, qtyPerServing: 18 },
        { ingredientId: (await ing("Susu UHT")).id, qtyPerServing: 180 },
      ],
    },
    {
      name: "Matcha Latte",
      price: 28000,
      costPrice: 11000,
      categoryId: catNonKopi?.id,
      recipe: [{ ingredientId: (await ing("Susu UHT")).id, qtyPerServing: 200 }],
    },
    {
      name: "Roti Bakar Telur",
      price: 23000,
      costPrice: 10000,
      categoryId: catMakanan?.id,
      recipe: [
        { ingredientId: (await ing("Roti Brioche")).id, qtyPerServing: 1 },
        { ingredientId: (await ing("Telur")).id, qtyPerServing: 2 },
      ],
    },
  ];

  for (const p of products) {
    const existing = await prisma.product.findFirst({ where: { name: p.name } });
    if (!existing) {
      await prisma.product.create({
        data: {
          name: p.name,
          price: p.price,
          costPrice: p.costPrice,
          categoryId: p.categoryId,
          recipe: {
            create: p.recipe.map((r) => ({
              ingredientId: r.ingredientId,
              qtyPerServing: r.qtyPerServing,
            })),
          },
        },
      });
    }
  }

  console.log("✅ Seed selesai: owner@kasir.id / kasir@kasir.id, PIN 1234");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
