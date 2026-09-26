import { prisma } from "@/lib/prisma";
import { ProductsClient } from "./ProductsClient";

export const dynamic = "force-dynamic";

export default async function ProductsPage() {
  const [products, categories, ingredients] = await Promise.all([
    prisma.product.findMany({
      orderBy: { name: "asc" },
      include: { category: true, recipe: true },
    }),
    prisma.category.findMany({ orderBy: { sortOrder: "asc" } }),
    prisma.ingredient.findMany({ orderBy: { name: "asc" } }),
  ]);

  return (
    <ProductsClient
      products={products.map((p) => ({
        id: p.id,
        name: p.name,
        price: p.price,
        costPrice: p.costPrice,
        isAvailable: p.isAvailable,
        imageUrl: p.imageUrl,
        categoryId: p.categoryId,
        categoryName: p.category?.name ?? null,
        recipe: p.recipe.map((r) => ({
          ingredientId: r.ingredientId,
          qtyPerServing: r.qtyPerServing,
        })),
      }))}
      categories={categories.map((c) => ({ id: c.id, name: c.name }))}
      ingredients={ingredients.map((i) => ({ id: i.id, name: i.name, unit: i.unit }))}
    />
  );
}
