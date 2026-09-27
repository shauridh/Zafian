import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { PosClient } from "./PosClient";

export const dynamic = "force-dynamic";

export default async function PosPage() {
  const session = await getServerSession(authOptions);
  const [categories, products, settings, activeShift] = await Promise.all([
    prisma.category.findMany({ orderBy: { sortOrder: "asc" } }),
    prisma.product.findMany({
      where: { isAvailable: true },
      orderBy: { name: "asc" },
      include: { category: true },
    }),
    prisma.settings.findUnique({ where: { id: "main" } }),
    prisma.shift.findFirst({ where: { status: "OPEN" } }),
  ]);

  return (
    <PosClient
      user={(session!.user as { name?: string; role: string })}
      categories={categories.map((c) => ({ id: c.id, name: c.name }))}
      products={products.map((p) => ({
        id: p.id,
        name: p.name,
        price: p.price,
        imageUrl: p.imageUrl,
        isAvailable: p.isAvailable,
        categoryId: p.categoryId,
        categoryName: p.category?.name,
      }))}
      taxPercent={settings?.taxPercent ?? 0}
      defaultOpeningCash={settings?.defaultOpeningCash ?? 350000}
      store={{
        name: settings?.storeName ?? "Toko",
        address: settings?.address ?? "",
        phone: settings?.phone ?? "",
        footer: settings?.footerReceipt ?? "",
        receiptSize: settings?.receiptSize ?? 58,
        autoPrint: settings?.autoPrint ?? true,
        logoUrl: settings?.logoUrl ?? "",
        useQzTray: settings?.useQzTray ?? false,
        printerName: settings?.printerName ?? "",
        useBtPrinter: settings?.useBtPrinter ?? false,
      }}
      hasActiveShift={!!activeShift}
      shiftOwner={activeShift?.userId}
    />
  );
}
