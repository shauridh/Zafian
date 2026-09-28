import { prisma } from "@/lib/prisma";
import { ProductsClient } from "./ProductsClient";
import { getProductProfit } from "./actions";

export const dynamic = "force-dynamic";

export default async function ProductsPage() {
  const [products, categories, ingredients, profit] = await Promise.all([
    prisma.product.findMany({
      orderBy: { name: "asc" },
      include: {
        category: true,
        recipe: { include: { ingredient: { select: { costPerUnit: true } } } },
        comboItems: { include: { child: true } },
      },
    }),
    prisma.category.findMany({ orderBy: { sortOrder: "asc" } }),
    prisma.ingredient.findMany({ where: { isActive: true }, orderBy: { name: "asc" } }),
    getProductProfit(),
  ]);

  return (
    <ProductsClient
      products={products.map((p) => {
        const pr = profit[p.id];
        // HPP otomatis dari resep saat ini (Σ qty × HPP satuan bahan)
        const recipeCost = p.recipe.reduce((s, r) => s + r.qtyPerServing * Number(r.ingredient.costPerUnit), 0);
        return {
          id: p.id,
          name: p.name,
          price: p.price,
          costPrice: Number(p.costPrice),
          recipeCost: Math.round(recipeCost),
          hasRecipe: p.recipe.length > 0,
          readyQty: p.readyQty,
          readyEnabled: p.readyEnabled,
          isAvailable: p.isAvailable,
          imageUrl: p.imageUrl,
          categoryId: p.categoryId,
          categoryName: p.category?.name ?? null,
          recipe: p.recipe.map((r) => ({
            ingredientId: r.ingredientId,
            qtyPerServing: r.qtyPerServing,
          })),
          combos: p.comboItems.map((ci) => ({
            childId: ci.childId,
            qty: ci.qty,
            childName: ci.child.name,
            childPrice: ci.child.price,
            childCost: Number(ci.child.costPrice),
          })),
          soldQty: pr?.qty ?? 0,
          revenue30d: Math.round(pr?.revenue ?? 0),
          profit30d: Math.round(pr?.profit ?? 0),
        };
      })}
      categories={categories.map((c) => ({ id: c.id, name: c.name }))}
      ingredients={ingredients.map((i) => ({ id: i.id, name: i.name, unit: i.unit, costPerUnit: Number(i.costPerUnit) }))}
    />
  );
}
