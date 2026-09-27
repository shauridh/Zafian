/**
 * Reset data production — kosongkan transaksi & operasional, sisakan master data.
 *
 * Dipertahankan : User, Settings, Category, Product (+ resep), Ingredient
 * Dihapus       : Order + OrderItem, Shift + CashMovement, StockMovement,
 *                 IngredientMovement, AuditLog
 *
 * Jalankan: npx tsx scripts/reset-production.ts
 * Wajib set DATABASE_URL ke database yang dimaksud (lokal .env sudah benar).
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("🧹 Menghapus data transaksi & operasional...");

  // Urutan penting: child dulu, parent belakangan
  const orderItems = await prisma.orderItem.deleteMany({});
  const orders = await prisma.order.deleteMany({});
  const cashMovements = await prisma.cashMovement.deleteMany({});
  const shifts = await prisma.shift.deleteMany({});
  const stockMovements = await prisma.stockMovement.deleteMany({});
  const ingredientMovements = await prisma.ingredientMovement.deleteMany({});
  const auditLogs = await prisma.auditLog.deleteMany({});

  console.log(`✅ Selesai:`);
  console.log(`   OrderItem        : ${orderItems.count} dihapus`);
  console.log(`   Order            : ${orders.count} dihapus`);
  console.log(`   CashMovement     : ${cashMovements.count} dihapus`);
  console.log(`   Shift            : ${shifts.count} dihapus`);
  console.log(`   StockMovement    : ${stockMovements.count} dihapus`);
  console.log(`   IngredientMovement: ${ingredientMovements.count} dihapus`);
  console.log(`   AuditLog         : ${auditLogs.count} dihapus`);

  const [users, products, ingredients, categories] = await Promise.all([
    prisma.user.count(),
    prisma.product.count(),
    prisma.ingredient.count(),
    prisma.category.count(),
  ]);
  console.log(`\n📌 Master data tetap: ${users} user, ${categories} kategori, ${products} produk, ${ingredients} bahan`);
  console.log("   (User demo owner@kasir.id & kasir@kasir.id TIDAK dihapus — hapus manual di Settings jika perlu)");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
