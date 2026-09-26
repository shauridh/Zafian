import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
  const orders = await prisma.order.findMany({ orderBy: { createdAt: "desc" }, take: 3 });
  for (const o of orders) console.log("order:", o.orderNo, "| total", o.total, "|", o.createdAt.toISOString());
  const cats = await prisma.category.findMany();
  console.log("kategori:", cats.map((c) => c.name).join(", "));
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
