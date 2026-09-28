/**
 * Harness smoke test — membuktikan runner test berfungsi sebelum test lain ditulis.
 * Jalankan: npx tsx --test tests/unit/smoke.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { formatRupiah } from "../../src/lib/utils";

test("sanity aritmetika", () => {
  assert.equal(1 + 1, 2);
});

test("formatRupiah memformat IDR tanpa desimal", () => {
  // Intl id-ID memakai non-breaking space (U+00A0) — normalisasi agar asersi tidak brittle
  assert.equal(formatRupiah(15000).replace(/\u00A0/g, " "), "Rp 15.000");
});
