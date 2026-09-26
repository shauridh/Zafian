# Zafian POS — Web POS F&B (Soft Neubrutalism)

Aplikasi kasir (POS) untuk bisnis F&B yang berjalan di ponsel & tablet seperti **aplikasi native Android** — PWA installable, bottom navigation, numpad in-app. Dibangun dengan **Next.js 14 (App Router) + Prisma + PostgreSQL (Supabase) + Tailwind CSS**, UI bergaya **Soft Neubrutalism**.

## ✨ Fitur

- **Layar Kasir** — grid menu + foto tampil utuh, pencarian & kategori, keranjang adaptif (bottom-sheet di ponsel, pane di tablet), diskon item & transaksi, catatan per item
- **5 Channel** — Take-away (default), Dine-in (+ catatan meja), GoFood, GrabFood, ShopeeFood (ojol otomatis `ONLINE_PLATFORM`)
- **Pembayaran all-in-one** — satu sheet: numpad langsung, toggle Tunai/QRIS, chip nominal cepat (Pas/50rb/100rb/200rb), kembalian live di-highlight besar
- **Numpad in-app** — reset otomatis saat dibuka; digit pertama setelah preset mengganti nilai
- **Struk modal** — 58/80mm (default 58mm), cetak via dialog browser, share WhatsApp, auto-print opsional
- **Shift & Kas** — modal awal default Rp 350.000, kas in/out dengan keterangan wajib, tutup shift: kas seharusnya vs fisik + selisih (refund parsial ikut dihitung)
- **Menu & Resep** — CRUD produk + upload foto, kategori, **resep bahan** → stok bahan berkurang otomatis saat penjualan (validasi kecukupan)
- **Bahan Baku** — 20 satuan, **konversi satuan beli → satuan jual/resep** (mis. 1 pack = 9 pcs) dengan HPP otomatis, stok masuk per satuan beli, penyesuaian stok opname + alasan wajib, alert menipis
- **Riwayat & Koreksi** — klik order membuka struk lengkap; refund **penuh/sebagian** (nominal via numpad) & void — hanya Owner/Admin, alasan wajib, opsi kembalikan stok, audit log
- **Laporan** — badge **▲/▼ % vs periode sebelumnya** di semua KPI, omzet & laba kotor, per channel & metode bayar, grafik harian, omzet per jam, top menu, pemakaian bahan, filter, ekspor CSV
- **Pengaturan** — submenu: Toko · Struk & Printer (nama printer, ukuran, auto-print, tes cetak) · Transaksi (PPN, modal awal) · Pengguna (role & PIN)
- **PWA** — installable, fullscreen standalone, safe-area notch, offline fallback

## 🚀 Menjalankan Lokal

```bash
npm install
cp .env.example .env    # isi DATABASE_URL, DIRECT_URL, NEXTAUTH_SECRET
npm run db:push         # sinkron schema ke database
npm run db:seed         # data demo
npm run dev
```

Buka http://localhost:3000 → login.

**Akun demo:**

| Role | Email | Password | PIN |
|---|---|---|---|
| Owner | `owner@kasir.id` | `admin123` | `1234` |
| Kasir | `kasir@kasir.id` | `admin123` | `1234` |

## 🗄️ Database — Supabase

1. Buat project di [supabase.com](https://supabase.com)
2. **Project Settings → Database → Connection string**:
   - **Connection pooling** (port 6543, `?pgbouncer=true&connection_limit=1`) → `DATABASE_URL` (runtime/serverless)
   - **URI** (port 5432) → `DIRECT_URL` (migrasi)
3. `npm run db:push && npm run db:seed`

## ▲ Deploy ke Vercel

1. Push repo ini ke GitHub, lalu import di [vercel.com/new](https://vercel.com/new)
2. Set **Environment Variables**:
   | Key | Nilai |
   |---|---|
   | `DATABASE_URL` | Supabase **pooler** (6543) + `?pgbouncer=true&connection_limit=1` |
   | `DIRECT_URL` | Supabase langsung (5432) |
   | `NEXTAUTH_SECRET` | `openssl rand -base64 32` |
   | `NEXTAUTH_URL` | `https://<domain-app>.vercel.app` |
3. Deploy — build otomatis menjalankan `prisma generate`
4. **Penting**: setelah deploy pertama, jalankan `npx prisma db push` sekali dari lokal (mengarah ke Supabase) bila schema belum tersinkron

> ⚠️ Upload gambar produk di Vercel memakai filesystem read-only — untuk produksi gunakan Supabase Storage (bisa ditambahkan sebagai fase berikutnya).

## 🖨️ Cetak Struk

Struk dirender sesuai lebar fisik (58mm default) lalu dicetak lewat dialog print perangkat — tanpa install apa pun. Di Android, pilih printer thermal Bluetooth/network dari dialog print Chrome. Auto-print dapat diaktifkan di Pengaturan → Struk & Printer (ada tombol Tes Cetak).

## 🔄 Alur Operasional Harian

1. **Buka shift** — login PIN → Shift → Buka (modal awal default 350rb, bisa diubah)
2. **Transaksi** — pilih channel → klik produk → Bayar → numpad/chip → kembalian live → struk modal (cetak/WhatsApp)
3. **Kas in/out** — dari halaman Shift untuk uang masuk/keluar non-penjualan
4. **Tutup shift** — kas seharusnya = modal + tunai + kas in − kas out − refund → input fisik → selisih tercatat
5. **Owner** — kelola menu/resep/bahan, approve void & refund (penuh/sebagian), laporan + CSV

## 🔐 Keamanan

- Password & PIN di-hash bcrypt (terpisah, PIN khusus login cepat kasir)
- Role-based: kasir hanya transaksi/riwayat/shift; Owner/Admin untuk menu, bahan, void/refund, laporan, pengaturan
- Void/refund, penyesuaian stok, dan kas tercatat di `AuditLog`

## 🛣️ Fase 2

Member & poin loyalitas · QR order per meja · multi outlet · sinkronisasi offline penuh · payment gateway QRIS dinamis · QZ Tray (ESC/POS auto-print) · rekap komisi ojol · Supabase Storage untuk foto.
