import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
const prisma = new PrismaClient();

async function main() {
  const users = await prisma.user.findMany();
  for (const u of users) {
    const pinOk = u.pinHash ? await bcrypt.compare("1234", u.pinHash) : false;
    const pwOk = await bcrypt.compare("admin123", u.password);
    console.log(u.email, "| role", u.role, "| active", u.active, "| PIN 1234 match:", pinOk, "| password match:", pwOk);
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
