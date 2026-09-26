import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { AppShell } from "@/components/layout/AppShell";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const settings = await prisma.settings.findUnique({ where: { id: "main" } });
  const accent = /^#[0-9a-fA-F]{6}$/.test(settings?.accentColor ?? "")
    ? settings!.accentColor
    : "#FFD93D";
  const logoUrl = settings?.logoUrl ?? "";
  const storeName = settings?.storeName ?? "Zafian POS";

  return (
    <div style={{ ["--accent" as never]: accent }}>
      <AppShell session={session} logoUrl={logoUrl} storeName={storeName}>
        {children}
      </AppShell>
    </div>
  );
}
