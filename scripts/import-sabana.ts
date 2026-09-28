/**
 * Import master bahan baku dari Price List Sabana (PDF 11 Juni 2026) ke tabel Ingredient.
 *
 * Aturan:
 * - Dedup peka nama+satuan (case-insensitive): baris duplikat digabung, harga TERAKHIR menang,
 *   konflik harga/isi dicatat ke log.
 * - Nama sama persis (case-insensitive) dengan bahan existing → HANYA update harga beli &
 *   costPerUnit; stok TIDAK disentuh.
 * - Bahan baru: stok 0, minStock 0.
 * - "Pouch" (tak ada di daftar UNITS UI) dipetakan ke "bks" (bungkus).
 *
 * Jalankan: npx tsx scripts/import-sabana.ts
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// [nama, satuan jual, satuan beli|null, isi per satuan beli|null, harga beli (Rp)]
type Row = [string, string, string | null, number | null, number];

const rows: Row[] = [
  ["AYAM POTONG 9", "pcs", "pack", 9, 48_000],
  ["AYAM POTONG 12", "pcs", "pack", 12, 48_000],
  ["AYAM BONELESS", "pcs", "pack", 30, 65_000],
  ["KULIT AYAM", "gr", "pack", 500, 20_000],
  ["BERAS MENTIK WANGI 10 KG", "kg", "karung", 10, 165_000],
  ["BERAS MENTIK WANGI 25 KG", "kg", "karung", 25, 412_500],
  ["KULIT AYAM", "gr", "pack", 500, 20_000], // dup — identik
  ["AYAM BONELESS", "pcs", "pack", 60, 70_000], // dup — harga/isi beda (konflik)
  ["AYAM POTONG 9", "pcs", "pack", 9, 45_000], // dup — harga beda (konflik)
  ["TEPUNG FRIED CHICKEN", "pack", null, null, 23_500],
  ["SUNCO MINYAK GORENG 2 LITER", "l", "bks", 2, 43_400],
  ["CHICKEN PATTY", "pcs", null, null, 4_500],
  ["ROTI BURGER", "pcs", null, null, 2_600],
  ["BAKSO", "pcs", "pack", 50, 24_000],
  ["CHICKEN ROLL", "pcs", "pack", 10, 24_400],
  ["SAUS SAMBAL SABANA", "pcs", "pack", 125, 22_500],
  ["SAUS TOMAT DELMONTE", "pcs", "pack", 20, 5_300],
  ["SAUS SAMBAL REFILL 1 KG DELMONTE", "kg", "bks", 1, 20_700],
  ["SAUS TOMAT REFILL 1 KG DELMONTE", "kg", "bks", 1, 15_100],
  ["KEMASAN AYAM", "pcs", "pack", 100, 23_500],
  ["KEMASAN KULIT CRISPY", "pcs", "pack", 100, 15_000],
  ["KERTAS NASI", "pcs", "pack", 100, 13_000],
  ["BOX STANDARD", "pcs", "pack", 100, 125_000],
  ["LUNCH BOX", "pcs", "pack", 100, 115_000],
  ["BOX SERBAGUNA", "pcs", "pack", 100, 85_000],
  ["BOX SIAP SAJI", "pcs", "pack", 100, 60_500],
  ["BOX KENTANG", "pcs", "pack", 200, 119_800],
  ["SAMBAL GEPREK", "gr", "bks", 500, 64_000],
  ["SAMBAL IJO", "gr", "bks", 500, 53_000],
  ["SAMBAL HITAM", "gr", "bks", 500, 51_500],
  ["CUP SAUCE 35 ML", "pcs", "pack", 50, 15_000],
  ["PLASTIK KECIL", "pcs", "pack", 25, 7_000],
  ["PLASTIK SEDANG", "pcs", "pack", 25, 7_000],
  ["PLASTIK HITAM", "pcs", "pack", 30, 15_600],
  ["PLASTIK MERAH", "pcs", "pack", 30, 28_000],
  ["SARUNG TANGAN", "pcs", "pack", 75, 11_000],
  ["SAUD BULDAK", "gr", "bks", 500, 36_800],
  ["SAUS TOMAT PRIMA", "pcs", "pack", 20, 9_300],
  ["SAUS KEJU MENTAI", "gr", "bks", 500, 27_000],
  ["SAUS BLACK PAPPER", "pcs", "pack", 10, 16_500],
  ["SAUS BBQ", "pcs", "pack", 10, 8_000],
  ["SAUS EXTRA PEDAS (SADAS)", "gr", "bks", 500, 24_500],
  ["MAYONAISE PRIMA 900 GR", "gr", "bks", 900, 36_700],
  ["FRUIT TEA APPLE 250 ML", "pcs", null, null, 2_500],
  ["FRUIT TEA BLACKCURRANT 250 ML", "pcs", null, null, 2_500],
  ["FRUIT TEA LEMON 250 ML", "pcs", null, null, 2_500],
  ["THE BOTOL SOSRO 250 ML", "pcs", null, null, 2_500],
  ["CONCENTRATE FRUIT TEA RASA BLACKCURRANT", "botol", null, null, 16_700],
  ["CONCENTRATE FRUIT TEA RASA LEMON TEA", "botol", null, null, 16_700],
  ["AIR BOTOL 330 ML", "botol", "dus", 24, 59_400],
  ["AIR KESEHATAN CUP 220 ML", "cup", "dus", 48, 28_000],
  ["KENTANG SIMPLOT 2.72 KG", "gr", "pack", 2_720, 115_000],
  ["KENTANG MC CAIN 2.5 KG", "gr", "pack", 2_500, 110_500],
  ["KARDUS UKURAN 30", "pcs", null, null, 9_500],
  ["KARDUS UKURAN 50", "pcs", null, null, 11_000],
  ["ROTI CHICKEN BUN", "pcs", "pack", 4, 8_000],
  ["PAPER BOWL 500 ML", "pcs", "pack", 25, 38_750],
];

async function main() {
  // 1. Dedup in-memory: kunci nama lower, harga terakhir menang, konflik dicatat
  const merged = new Map<string, { row: Row; conflicts: string[] }>();
  for (const r of rows) {
    const key = r[0].toLowerCase();
    const prev = merged.get(key);
    if (!prev) {
      merged.set(key, { row: r, conflicts: [] });
      continue;
    }
    if (prev.row[4] !== r[4] || prev.row[3] !== r[3]) {
      prev.conflicts.push(`harga/isi ${prev.row[3] ?? "-"} @${prev.row[4].toLocaleString("id-ID")} digantikan ${r[3] ?? "-"} @${r[4].toLocaleString("id-ID")}`);
    }
    prev.row = r;
  }

  // 2. Ambil existing untuk matching nama (case-insensitive) + deteksi nama mirip
  const existing = await prisma.ingredient.findMany();
  const byName = new Map(existing.map((i) => [i.name.toLowerCase(), i]));

  let created = 0;
  let updated = 0;
  const nearMatches: string[] = [];

  for (const [key, { row, conflicts }] of merged) {
    const [name, unit, pUnit, pQty, price] = row;
    const sameUnit = pUnit !== null && pUnit === unit;
    const costPerUnit = pQty && pQty > 0 ? Math.round(price / pQty) : price;
    const data = {
      unit,
      costPerUnit,
      purchaseUnit: sameUnit ? null : pUnit,
      purchaseQty: sameUnit ? null : pQty,
      purchasePrice: price,
    };

    const hit = byName.get(key);
    if (hit) {
      await prisma.ingredient.update({ where: { id: hit.id }, data });
      updated++;
      console.log(`~ update : ${hit.name} → HPP ${costPerUnit.toLocaleString("id-ID")}/${unit} (beli ${pQty ?? 1} ${pUnit ?? unit} @${price.toLocaleString("id-ID")})${conflicts.length ? " | KONFLIK: " + conflicts.join("; ") : ""}`);
      continue;
    }

    // Deteksi nama mirip (substring dua arah) terhadap bahan existing
    for (const ex of existing) {
      const a = ex.name.toLowerCase();
      if (a !== key && (a.includes(key) || key.includes(a)) && Math.min(a.length, key.length) >= 4) {
        nearMatches.push(`"${name}" mirip existing "${ex.name}" — cek manual bila perlu digabung`);
      }
    }

    await prisma.ingredient.create({
      data: { name, stock: 0, minStock: 0, ...data },
    });
    created++;
    console.log(`+ baru   : ${name} — ${costPerUnit.toLocaleString("id-ID")}/${unit} (beli ${pQty ?? 1} ${pUnit ?? unit} @${price.toLocaleString("id-ID")})${conflicts.length ? " | KONFLIK: " + conflicts.join("; ") : ""}`);
  }

  console.log(`\nSelesai: ${created} bahan baru, ${updated} existing di-update, dari ${rows.length} baris price list (${merged.size} unik).`);
  if (nearMatches.length) {
    console.log("\n⚠️ Kemungkinan duplikat semantik:");
    for (const n of new Set(nearMatches)) console.log("  - " + n);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
