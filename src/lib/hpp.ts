/**
 * Helper HPP & paket (combo). Dipakai server actions & test.
 */

/**
 * Rata-rata tertimbang HPP setelah pembelian baru.
 * - oldQty/oldCost: stok & HPP satuan lama (dalam satuan jual)
 * - addQty: kuantitas masuk dalam SATUAN JUAL
 * - addPrice: harga per SATUAN JUAL (pemanggil konversi dulu: harga per pack ÷ isi pack;
 *   0/undefined = harga tidak dicatat → HPP lama dipertahankan)
 * - return: HPP baru dibulatkan 2 desimal
 */
export function weightedCostPerUnit(
  oldQty: number,
  oldCost: number,
  addQty: number,
  addPrice: number | null | undefined
): number {
  if (addQty <= 0) return round2(oldCost);
  if (!addPrice || addPrice <= 0) return round2(oldCost);
  const totalQty = oldQty + addQty;
  if (totalQty <= 0) return round2(oldCost);
  return round2((oldQty * oldCost + addQty * addPrice) / totalQty);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Ketersediaan paket (combo) = min over anak TERLACAK etalase:
 * floor(readyQty_anak / qty_per_paket). Anak tak dilacak (null) tidak membatasi.
 * Tanpa anak terlacak → null (ketersediaan paket tidak dihitung dari anak).
 */
export function comboAvailableQty(
  children: { readyQty: number | null; qty: number }[]
): number | null {
  let min: number | null = null;
  for (const c of children) {
    if (c.readyQty === null) continue;
    const avail = Math.floor(c.readyQty / Math.max(1, c.qty));
    if (min === null || avail < min) min = avail;
  }
  return min;
}

/**
 * Kebutuhan bahan 1 porsi combo = resep kemasan combo + Σ (resep anak × qty anak).
 * Menerima include comboItems.child dengan recipe.
 */
export function comboIngredientNeeds(
  combo: {
    recipe: { ingredientId: string; qtyPerServing: number }[];
    comboItems: { qty: number; child: { recipe: { ingredientId: string; qtyPerServing: number }[] } }[];
  }
): Map<string, number> {
  const need = new Map<string, number>();
  const add = (id: string, q: number) => need.set(id, (need.get(id) ?? 0) + q);
  for (const r of combo.recipe) add(r.ingredientId, r.qtyPerServing);
  for (const ci of combo.comboItems)
    for (const r of ci.child.recipe) add(r.ingredientId, r.qtyPerServing * ci.qty);
  return need;
}

/**
 * HPP 1 porsi combo = Σ (qtyPerServing × HPP bahan) kemasan + Σ (costPrice anak × qty anak).
 * Menerima include comboItems.child + recipe dengan ingredient.costPerUnit.
 */
export function hppFromCombos(
  combo: {
    recipe: { qtyPerServing: number; ingredient: { costPerUnit: unknown } }[];
    comboItems: { qty: number; child: { costPrice: unknown } }[];
  }
): number {
  const packaging = combo.recipe.reduce(
    (s, r) => s + r.qtyPerServing * Number(r.ingredient.costPerUnit),
    0
  );
  const children = combo.comboItems.reduce((s, ci) => s + ci.qty * Number(ci.child.costPrice), 0);
  return Math.round(packaging + children);
}
