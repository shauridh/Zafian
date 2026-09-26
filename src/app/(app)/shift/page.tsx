import { prisma } from "@/lib/prisma";
import { ShiftClient } from "./ShiftClient";

export const dynamic = "force-dynamic";

export default async function ShiftPage() {
  const settings = await prisma.settings.findUnique({ where: { id: "main" } });

  // Riwayat shift terakhir (10)
  const history = await prisma.shift.findMany({
    where: { status: "CLOSED" },
    orderBy: { openedAt: "desc" },
    take: 10,
    include: { user: { select: { name: true } } },
  });

  return (
    <ShiftClient
      defaultOpeningCash={settings?.defaultOpeningCash ?? 350000}
      history={history.map((s) => ({
        id: s.id,
        userName: s.user.name,
        openingCash: s.openingCash,
        closingCashExpected: s.closingCashExpected,
        closingCashActual: s.closingCashActual,
        difference: s.difference,
        openedAt: s.openedAt.toISOString(),
        closedAt: s.closedAt?.toISOString() ?? null,
      }))}
    />
  );
}
