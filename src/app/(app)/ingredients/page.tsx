import { prisma } from "@/lib/prisma";
import { IngredientsClient } from "./IngredientsClient";

export const dynamic = "force-dynamic";

export default async function IngredientsPage() {
  const [ingredients, movements] = await Promise.all([
    prisma.ingredient.findMany({ orderBy: [{ name: "asc" }] }),
    prisma.ingredientMovement.findMany({
      orderBy: { createdAt: "desc" },
      take: 20,
      include: { ingredient: { select: { name: true, unit: true } } },
    }),
  ]);

  return (
    <IngredientsClient
      ingredients={ingredients.map((i) => ({
        id: i.id,
        name: i.name,
        unit: i.unit,
        stock: i.stock,
        minStock: i.minStock,
        costPerUnit: i.costPerUnit,
        purchaseUnit: i.purchaseUnit,
        purchaseQty: i.purchaseQty,
        purchasePrice: i.purchasePrice,
      }))}
      movements={movements.map((m) => ({
        id: m.id,
        ingredientName: m.ingredient.name,
        unit: m.ingredient.unit,
        type: m.type,
        qty: m.qty,
        note: m.note,
        createdAt: m.createdAt.toISOString(),
      }))}
    />
  );
}
