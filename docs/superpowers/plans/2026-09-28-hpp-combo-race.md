# HPP Dinamis + Race Fix + Combo Menu — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans (inline). Steps use checkbox (`- [ ]`) syntax.

**Goal:** Stok etalase & bahan tak bisa minus saat order bersamaan; HPP mengikuti harga beli terbaru (rata-rata tertimbang + auto-update produk); produk bisa berupa PAKET (combo) dari produk lain dengan HPP & etalase gabungan.

**Architecture:** (1) Guard atomik `updateMany({ where: { …, stock/readyQty: { gte: need } } })` DI DALAM `$transaction` createOrder sebagai backstop kebenaran (validasi pre-tx tetap untuk pesan ramah). (2) `adjustReadyQty` jadi dua `updateMany` atomik (naik: increment; turun: guard `gte` + clamp 0). (3) `costPerUnit`/`costPrice`/`costTotal` Int → `Decimal(12,2)`; semua aritmetika konversi `Number()`. (4) `stockIn` terima `unitPrice?` → rata-rata tertimbang → recompute `costPrice` semua produk ber-resep (dan combo yang memuat anaknya). (5) `ComboItem(comboId, childId, qty)` Product→Product; combo diekspansi di `createOrder` (resep anak, etalase anak), HPP combo = Σ anak + resep kemasan sendiri; ketersediaan combo = min floor(readyQty anak/qty).

**Tech Stack:** Next 14 App Router, Prisma 5.22 (db push), node:test via `npx tsx --test` (tanpa dependensi baru), Supabase direct (dev).

**Spec:** diskusi user (pesan rekomendasi logic + 3 prompt terpilih). Tidak ada doc spesek lain — ruling: plan ini + pesan user adalah otoritas.

## Global Constraints
- Tanpa dependensi baru. Tests: `npx tsx --test tests/**/*.test.ts` (node:test API).
- DB dev lokal (5432 direct). Test integrasi wajib membuat fixture nama unik + bersih di `after()`.
- UI copy bahasa Indonesia; soft neubrutalism (border-ink, shadow-neo).
- TANPA commit/push kecuali user minta (konvensi repo): langkah "commit" di plan = siapkan diff, catat di ledger.
- `npx tsc --noEmit` harus exit 0 di akhir setiap task.

## Review Focus
1. Dua order paralel produk etalase stok 1 → tepat satu sukses, `readyQty` tak pernah negatif. (Test: T2)
2. Combo berisi anak TAK dilacak etalase → ketersediaan combo tak dibatasi anak itu. (Test: T5)
3. `stockIn` tanpa `unitPrice` → HPP tidak berubah (jangan recompute dgn harga 0). (Test: T4)
4. Produk combo + resep kemasan sendiri → costTotal = Σ anak + resep sendiri. (Test: T5)
5. Artefak Decimal bocor ke UI (`Rp 1.166,666…`) → semua konversi `Number()` + bulatkan saat tampil. (Check: T3, smoke)

---

### Task 1: Harness test
**Files:** Create `tests/unit/smoke.test.ts`; Create `.superpowers/sdd/2026-09-28-hpp-combo-race.md/progress.md` (ledger, di luar git tracking).
- [ ] Tulis `tests/unit/smoke.test.ts`: `node:test` + assert `1+1===2` dan import `formatRupiah(15000) === "Rp 15.000"`.
- [ ] Run `npx tsx --test tests/unit/smoke.test.ts` → Expected: PASS 2/2. Jika tsx --test tak didukung Node ini → fallback ruling: `node --import tsx --test`.
- [ ] Ledger dibuat, baris pertama: `# SDD ledger — plan: docs/superpowers/plans/2026-09-28-hpp-combo-race.md`.

### Task 2: Race fix (RED → GREEN)
**Files:** Modify `src/app/(app)/pos/actions.ts`, `src/app/(app)/products/actions.ts`; Test `tests/integ/race.test.ts`.
- [ ] Test (RED): fixture produk etalase `readyQty=1` + shift + user; `Promise.all([createOrder(1), createOrder(1)])` → expect tepat 1 ok & readyQty akhir `0`. Run → Expected FAIL (readyQty -1).
- [ ] Fix `createOrder`: dalam `$transaction`, ganti dekrement langsung jadi guard:
```ts
for (const item of items) {
  const p = productMap.get(item.productId)!;
  if (p.readyEnabled && p.readyQty !== null) {
    const r = await tx.product.updateMany({ where: { id: p.id, readyQty: { gte: item.qty } }, data: { readyQty: { decrement: item.qty } } });
    if (r.count === 0) throw new Error(`ETALASE:${p.name}`);
  }
}
for (const [ingredientId, qty] of needMap) {
  const r = await tx.ingredient.updateMany({ where: { id: ingredientId, stock: { gte: qty } }, data: { stock: { decrement: qty } } });
  if (r.count === 0) throw new Error(`BAHAN:${ingredientId}`);
  await tx.ingredientMovement.create({ data: { ingredientId, type: "SALE", qty: -qty, note: `Order ${created.orderNo}`, userId } });
}
```
catch luar: pesan `ETALASE:` → `"{nama}: porsi siap jual habis"`; `BAHAN:` → ambil nama dari map → `Stok bahan "{nama}" tidak cukup`.
- [ ] Fix `adjustReadyQty` atomik (naik: `updateMany … increment`; turun: guard `gte(abs)` lalu fallback `updateMany … data:{readyQty:0}`; baca ulang untuk return).
- [ ] Run test → PASS. Run tsc → 0. Ledger + (tanpa commit).

### Task 3: Decimal HPP
**Files:** `prisma/schema.prisma` (costPerUnit/costPrice/costTotal → `Decimal @db.Decimal(12,2) @default(0)`), `pos/actions.ts` (`costTotal += Number(p.costPrice) * qty; costTotal: Math.round(costTotal)` simpan Decimal? simpan `new Prisma.Decimal(Math.round(costTotal))`), `products/actions.ts` (costPrice: `new Prisma.Decimal(hasil)`), `products/page.tsx` (`Number(r.ingredient.costPerUnit)`), `products/excel-actions.ts`, `ingredients/*` (display Number()).
- [ ] `npx prisma db push` (Int→Decimal aman). [ ] tsc → 0 (iterasi sampai bersih). [ ] Smoke script cek HPP pecahan 70000/60 = 1166.67 tersimpan. Ledger.

### Task 4: HPP dinamis stockIn (RED → GREEN)
**Files:** `src/lib/hpp.ts` (baru: `weightedCostPerUnit(oldStock, oldCost, addUnits, addCost)`, `comboAvailableQty`), `ingredients/actions.ts` (stockIn param `unitPrice?: number`; jika ada & >0: update purchasePrice, recompute costPerUnit rata-rata tertimbang, lalu recompute `costPrice` produk ber-resep terkait + combo yang memuatnya — transaksi), `ingredients/IngredientsClient.tsx` (field harga beli opsional di dialog Stok Masuk), Test `tests/integ/hpp.test.ts`.
- [ ] Test unit `tests/unit/hpp.test.ts`: weighted (100×500 + 50×600)/150 = 533.33; comboAvailable floor.
- [ ] Test integ (RED): produk P resep 10 gr bahan B (cost 100, stock 1000, purchasePrice 100000/1000gr) → costPrice 1000; stockIn B 500 gr unitPrice 200.000 → expect B costPerUnit = (1000×100+500×200)/1500 = 133.33→133; P.costPrice = 1333. Run → FAIL (fungsi belum ada). Implement → PASS.

### Task 5: Combo schema + checkout (RED → GREEN)
**Files:** schema (+model ComboItem & relasi di Product), `prisma db push`, `products/actions.ts` (saveProduct: input `combo: {childId, qty}[]`; costPrice = Σ anak.costPrice×qty + Σ resep; hapus+buat ComboItem; larang nested combo & self), `pos/page.tsx` (include comboItems; readyQty efektif = min floor; null jika tak ada anak terlacak), `pos/actions.ts` (ekspansi combo: validasi isAvailable anak, childNeedMap → guard etalase anak & resep anak masuk needMap), `pos/PosClient.tsx` (tanpa perubahan — readyQty efektif sudah cukup), Test `tests/integ/combo.test.ts`.
- [ ] Test (RED): anak A (etalase 5, resep tepung 55gr) + paket P (2×A, harga X) → createOrder P qty 2 → expect readyQty A = 1, tepung berkurang 220, costTotal = 2×(2×A.costPrice). Run FAIL (combo belum didukung) → implement → PASS.

### Task 6: UI combo builder
**Files:** `products/ProductsClient.tsx` (section "PAKET MENU": pilih produk + qty via numpad; preview HPP paket; sembunyikan section resep? tidak — keduanya boleh), `products/page.tsx` (kirim daftar produk ringkas untuk picker: id, name, price, isCombo). [ ] tsc 0. [ ] Smoke preview: buat paket, cek badge di POS, beli 1 → etalase anak berkurang.

### Task 7: Validasi akhir
- [ ] `npx tsc --noEmit` → 0. [ ] `npx tsx --test tests/**/*.test.ts` semua pass. [ ] Smoke UI checklist. [ ] Self-review seluruh diff (tanpa subagent — dicatat di ledger). [ ] Laporan: rulings + deferred minors.
