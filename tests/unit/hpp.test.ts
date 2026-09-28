/**
 * Unit test helper HPP & ketersediaan combo.
 * Jalankan: npx tsx --test tests/unit/hpp.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { weightedCostPerUnit, comboAvailableQty } from "../../src/lib/hpp";

test("weightedCostPerUnit: rata-rata tertimbang dua pembelian", () => {
  // (100×500 + 50×600) / 150 = 533.33 → 533.33 (2 desimal)
  assert.equal(weightedCostPerUnit(100, 500, 50, 600), 533.33);
});

test("weightedCostPerUnit: tanpa stok lama → HPP = harga per satuan jual (2 desimal)", () => {
  // beli 60 pcs @70.000/pack → per-pcs 1166.67; pemanggil mengonversi dulu ke per-satuan-jual
  assert.equal(weightedCostPerUnit(0, 0, 60, 70000 / 60), 1166.67);
});

test("weightedCostPerUnit: harga baru 0/undefined → HPP lama tetap (jangan tergerus 0)", () => {
  assert.equal(weightedCostPerUnit(100, 500, 50, 0), 500);
  assert.equal(weightedCostPerUnit(100, 500, 50, undefined), 500);
});

test("weightedCostPerUnit: qty baru 0 → tidak berubah", () => {
  assert.equal(weightedCostPerUnit(100, 500, 0, 600), 500);
});

test("comboAvailableQty: floor min(readyQty/qty) hanya anak terlacak", () => {
  // anak 5 etalase × 2 → floor 2.5 = 2
  assert.equal(comboAvailableQty([{ readyQty: 5, qty: 2 }]), 2);
  // dua anak: min(floor(10/4)=2, floor(7/2)=3) = 2
  assert.equal(comboAvailableQty([{ readyQty: 10, qty: 4 }, { readyQty: 7, qty: 2 }]), 2);
});

test("comboAvailableQty: anak tak dilacak (null) diabaikan; tanpa anak terlacak → null", () => {
  assert.equal(comboAvailableQty([{ readyQty: null, qty: 1 }, { readyQty: 3, qty: 2 }]), 1);
  assert.equal(comboAvailableQty([{ readyQty: null, qty: 1 }]), null);
  assert.equal(comboAvailableQty([]), null);
});
