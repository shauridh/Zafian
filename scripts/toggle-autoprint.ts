import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
  const target = process.argv[2] === "on";
  await prisma.settings.upsert({
    where: { id: "main" },
    update: { autoPrint: target },
    create: { id: "main", autoPrint: target },
  });
  const s = await prisma.settings.findUnique({ where: { id: "main" } });
  console.log("autoPrint =", s?.autoPrint, "| storeName =", s?.storeName);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
