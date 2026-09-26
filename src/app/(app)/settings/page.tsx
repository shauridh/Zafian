import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { SettingsClient } from "./SettingsClient";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const session = await getServerSession(authOptions);
  const meId = (session?.user as { id?: string })?.id ?? "";

  const [settings, users] = await Promise.all([
    prisma.settings.findUnique({ where: { id: "main" } }),
    prisma.user.findMany({ orderBy: { createdAt: "asc" } }),
  ]);

  return (
    <SettingsClient
      meId={meId}
      settings={{
        storeName: settings?.storeName ?? "",
        address: settings?.address ?? "",
        phone: settings?.phone ?? "",
        footerReceipt: settings?.footerReceipt ?? "",
        taxPercent: settings?.taxPercent ?? 0,
        receiptSize: settings?.receiptSize ?? 58,
        defaultOpeningCash: settings?.defaultOpeningCash ?? 350000,
        autoPrint: settings?.autoPrint ?? true,
        printerName: settings?.printerName ?? "",
        accentColor: settings?.accentColor ?? "#FFD93D",
        logoUrl: settings?.logoUrl ?? "",
        useQzTray: settings?.useQzTray ?? false,
      }}
      logoUrl={settings?.logoUrl ?? ""}
      users={users.map((u) => ({
        id: u.id,
        name: u.name,
        email: u.email,
        role: u.role as "OWNER" | "ADMIN" | "CASHIER",
        active: u.active,
        hasPin: !!u.pinHash,
      }))}
    />
  );
}
