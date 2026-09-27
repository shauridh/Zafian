"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Sheet } from "@/components/ui/Sheet";
import { Input, Select, Textarea } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { Numpad } from "@/components/ui/Numpad";
import { ReceiptModal } from "@/components/pos/ReceiptModal";
import { ReceiptPaper } from "@/components/pos/ReceiptPaper";
import { useUI } from "@/store/ui";
import { btPrintReceipt, btSavedName, btSendRaw, btEnsureConnected, btForgetDevice } from "@/lib/bt-printer";
import {
  saveSettings,
  saveUser,
  toggleUserActive,
  getTestReceipt,
  purgeData,
  type SettingsInput,
  type UserInput,
  type PurgeScope,
} from "./actions";
import { formatRupiah, cn } from "@/lib/utils";

interface UserRow {
  id: string;
  name: string;
  email: string;
  role: "OWNER" | "ADMIN" | "CASHIER";
  active: boolean;
  hasPin: boolean;
}

type Tab = "toko" | "branding" | "struk" | "transaksi" | "user" | "data";

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: "toko", label: "Toko", icon: "🏪" },
  { id: "branding", label: "Branding", icon: "🎨" },
  { id: "struk", label: "Struk & Printer", icon: "🖨️" },
  { id: "transaksi", label: "Transaksi", icon: "💰" },
  { id: "user", label: "Pengguna", icon: "👥" },
  { id: "data", label: "Data", icon: "🗄️" },
];

/** Preset warna aksen yang sudah lolos WCAG AA (kontras ≥4.5:1 dengan ink #141414) */
const ACCENT_PRESETS = [
  { value: "#FFD93D", label: "Kuning" },
  { value: "#C7F464", label: "Lime" },
  { value: "#7CD1FF", label: "Biru langit" },
  { value: "#FFB86B", label: "Oranye" },
  { value: "#FF9EC3", label: "Pink muda" },
  { value: "#9AF0E0", label: "Mint" },
];

export function SettingsClient({
  meId,
  settings,
  users,
  logoUrl,
}: {
  meId: string;
  settings: SettingsInput;
  users: UserRow[];
  logoUrl?: string;
}) {
  const router = useRouter();
  const { toast } = useUI();
  const [tab, setTab] = useState<Tab>("toko");
  const [form, setForm] = useState<SettingsInput>(settings);
  const [busy, setBusy] = useState(false);
  const [numpad, setNumpad] = useState<
    | { kind: "closed" }
    | { kind: "tax" }
    | { kind: "opening" }
  >({ kind: "closed" });

  const [userOpen, setUserOpen] = useState(false);
  const [userForm, setUserForm] = useState<{
    id?: string;
    name: string;
    email: string;
    role: "OWNER" | "ADMIN" | "CASHIER";
    active: boolean;
    password: string;
    pin: string;
  }>({ name: "", email: "", role: "CASHIER", active: true, password: "", pin: "" });

  const [testReceipt, setTestReceipt] = useState<Awaited<ReturnType<typeof getTestReceipt>>["receipt"] | null>(null);
  const [calBusy, setCalBusy] = useState(false);
  const [btBusy, setBtBusy] = useState(false);
  const [btForgetTick, setBtForgetTick] = useState(0);
  const btSavedPrinter = btForgetTick >= 0 ? btSavedName() : null;

  // logo yang dipakai untuk pratinjau tes struk: upload baru > tersimpan > kosong
  const effectiveLogo = form.logoUrl || logoUrl || "";

  const handleSave = async () => {
    setBusy(true);
    const res = await saveSettings(form);
    setBusy(false);
    if (res.ok) toast("Pengaturan disimpan", "success");
    else toast(res.error ?? "Gagal", "error");
  };

  /** Cetak pola kalibrasi: cek perataan, lebar kolom 32/48 kolom, karakter Rp, QR, cut. */
  const handleCalibration = async (widthMm: 58 | 80) => {
    setCalBusy(true);
    try {
      const W = widthMm === 80 ? 48 : 32;
      const align = (form.receiptAlign as "AUTO" | "SPACE" | "LEFT") ?? "AUTO";
      const enc = new TextEncoder();
      const out: number[] = [];
      const push = (s: string) => {
        for (const b of enc.encode(s)) out.push(b);
      };
      const cmd = (...b: number[]) => out.push(...b);
      const raw = (s: string) => push(s + "\n");
      const row = (l: string, v: string) => raw(l + " ".repeat(Math.max(1, W - l.length - v.length)) + v);
      const ctr = (s: string) => {
        if (align === "LEFT") return raw(s);
        if (align !== "SPACE") cmd(0x1b, 0x61, 0x01);
        raw(" ".repeat(Math.max(0, Math.floor((W - s.length) / 2))) + s);
        if (align !== "SPACE") cmd(0x1b, 0x61, 0x00);
      };

      cmd(0x1b, 0x40);
      ctr("=== KALIBRASI ===");
      ctr(form.storeName);
      ctr(`${widthMm}mm / ${W} kolom`);
      raw("-".repeat(W));
      row("Kiri", "Kanan");
      row("Rp 12.345", "Rp 678.900");
      raw("0123456789".repeat(5).slice(0, W));
      raw("abcdefghij".repeat(5).slice(0, W));
      raw("-".repeat(W));
      ctr("CENTER OK");
      ctr("promo line 1");
      ctr("promo line 2");
      raw("-".repeat(W));
      // QR: kotak kecil
      if (align !== "LEFT") cmd(0x1b, 0x61, 0x01);
      {
        const d = enc.encode("KALIS-TEST");
        cmd(0x1d, 0x28, 0x6b, 0x04, 0x00, 0x31, 0x41, 0x32, 0x00);
        cmd(0x1d, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x43, 0x05);
        cmd(0x1d, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x45, 0x31);
        cmd(0x1d, 0x28, 0x6b, (d.length + 3) % 256, Math.floor((d.length + 3) / 256), 0x31, 0x50, 0x30, ...d);
        cmd(0x1d, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x51, 0x30);
      }
      if (align !== "LEFT") cmd(0x1b, 0x61, 0x00);
      push("\n\n\n");
      cmd(0x1d, 0x56, 0x42, 0x00);

      const bytes = new Uint8Array(out);
      if (form.useBtPrinter) {
        await btSendRaw(bytes);
        toast(`Pola kalibrasi ${widthMm}mm terkirim ke printer Bluetooth`, "success");
      } else {
        const { qzSendRaw } = await import("@/lib/qz");
        await qzSendRaw(bytes, widthMm);
        toast(`Pola kalibrasi ${widthMm}mm terkirim via QZ Tray`, "success");
      }
    } catch (e) {
      toast(e instanceof Error ? e.message : "Gagal kalibrasi", "error");
    } finally {
      setCalBusy(false);
    }
  };

  const handleTestPrint = async () => {
    // simpan dulu agar pengaturan terbaru terpakai
    await handleSave();
    const res = await getTestReceipt();
    if (!res.ok || !res.receipt) {
      toast(res.error ?? "Gagal", "error");
      return;
    }
    if (form.useBtPrinter) {
      // Bluetooth: cetak langsung (butuh klik user — sudah dipicu dari tombol)
      try {
        await btPrintReceipt({
          storeName: form.storeName,
          storeAddress: form.address || undefined,
          storePhone: form.phone || undefined,
          orderNo: res.receipt.orderNo,
          createdAt: new Date().toLocaleString("id-ID"),
          cashierName: "Tes Cetak",
          orderTypeLabel: "Tes",
          items: res.receipt.items,
          subtotal: res.receipt.subtotal,
          discount: res.receipt.discount,
          tax: res.receipt.tax,
          total: res.receipt.total,
          paymentLabel: "Tunai",
          footer: form.footerReceipt || undefined,
          promoText: form.promoText || undefined,
          receiptQr: form.receiptQr,
          qrText: form.qrText?.trim() ? form.qrText : res.receipt.orderNo,
          alignMode: (form.receiptAlign as "AUTO" | "SPACE" | "LEFT") ?? "AUTO",
          widthMm: form.receiptSize === 80 ? 80 : 58,
        });
        toast("Tes struk terkirim ke printer Bluetooth", "success");
      } catch (e) {
        toast(e instanceof Error ? e.message : "Gagal cetak via Bluetooth", "error");
      }
      return;
    }
    setTestReceipt(res.receipt);
  };

  const handleSaveUser = async () => {
    setBusy(true);
    const res = await saveUser({
      id: userForm.id,
      name: userForm.name,
      email: userForm.email,
      role: userForm.role,
      active: userForm.active,
      password: userForm.password || undefined,
      pin: userForm.pin || undefined,
    } as UserInput);
    setBusy(false);
    if (res.ok) {
      toast(userForm.id ? "User diperbarui" : "User ditambahkan", "success");
      setUserOpen(false);
      router.refresh();
    } else {
      toast(res.error ?? "Gagal", "error");
    }
  };

  const handleToggle = async (u: UserRow) => {
    const res = await toggleUserActive(u.id, !u.active);
    if (res.ok) router.refresh();
    else toast(res.error ?? "Gagal", "error");
  };

  const handleLogoUpload = async (file: File) => {
    setBusy(true);
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch("/api/upload", { method: "POST", body: fd });
    const json = await res.json();
    setBusy(false);
    if (res.ok) {
      setForm((f) => ({ ...f, logoUrl: json.url }));
      toast("Logo terupload", "success");
    } else {
      toast(json.error ?? "Gagal upload", "error");
    }
  };

  // ===== Hapus data (zona berbahaya) =====
  const [purgeConfirm, setPurgeConfirm] = useState<{
    scope: PurgeScope;
    title: string;
    description: string;
  } | null>(null);
  const [purgePin, setPurgePin] = useState("");
  const [purgeBusy, setPurgeBusy] = useState(false);

  const handlePurge = async () => {
    if (!purgeConfirm) return;
    setPurgeBusy(true);
    const res = await purgeData(purgeConfirm.scope, purgePin);
    setPurgeBusy(false);
    if (res.ok) {
      toast(res.message ?? "Data dihapus", "success");
      setPurgeConfirm(null);
      setPurgePin("");
      router.refresh();
    } else {
      toast(res.error ?? "Gagal", "error");
      setPurgePin("");
    }
  };

  const purgeRows: { scope: PurgeScope; icon: string; title: string; description: string }[] = [
    {
      scope: "transactions",
      icon: "🧾",
      title: "Transaksi (Order)",
      description: "Semua order + item, riwayat stok, log audit. Riwayat shift & kas tetap ada.",
    },
    {
      scope: "shifts",
      icon: "⏱️",
      title: "Shift & Kas",
      description: "Semua shift, rekap kas, kas masuk/keluar, TERMASUK semua transaksi/order.",
    },
    {
      scope: "ingredients",
      icon: "🥫",
      title: "Bahan (Termasuk Resep)",
      description: "Semua bahan beserta stok & resep yang memakainya. Menu tidak ikut terhapus.",
    },
    {
      scope: "products",
      icon: "🍔",
      title: "Menu (Termasuk Resep)",
      description: "Semua produk beserta resepnya. Bahan tidak ikut terhapus.",
    },
    {
      scope: "all",
      icon: "💣",
      title: "SEMUA (Mulai dari Nol)",
      description:
        "Transaksi, shift & kas, menu + resep, dan bahan. Akun pengguna & pengaturan toko tetap aman.",
    },
  ];

  const storeFields = (
    <div className="space-y-2.5">
      <Input label="Nama Toko" value={form.storeName} onChange={(e) => setForm((f) => ({ ...f, storeName: e.target.value }))} />
      <Input label="Alamat" value={form.address} onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))} />
      <Input label="Telepon / WhatsApp" value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} />
      <Textarea
        label="Footer Struk"
        value={form.footerReceipt}
        onChange={(e) => setForm((f) => ({ ...f, footerReceipt: e.target.value }))}
        rows={2}
        placeholder="mis. Terima kasih! IG: @toko"
      />
    </div>
  );

  return (
    <div className="min-h-dvh">
      <PageHeader title="Pengaturan" subtitle="Kelola toko, struk, transaksi & pengguna" />

      {/* Sub menu tab */}
      <div className="sticky top-[57px] z-10 border-b-[2.5px] border-ink bg-cream/95 backdrop-blur">
        <div className="mx-auto flex max-w-2xl gap-1.5 overflow-x-auto px-4 py-2">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                "shrink-0 rounded-lg border-2 border-ink px-3 py-1.5 text-xs font-bold uppercase tracking-wide shadow-neo-sm transition-all active:translate-x-[1px] active:translate-y-[1px] active:shadow-none",
                tab === t.id ? "bg-ink text-white" : "bg-white text-ink/60"
              )}
            >
              {t.icon} {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mx-auto max-w-2xl space-y-4 px-4 py-4 pb-safe">
        {/* ===== TAB TOKO ===== */}
        {tab === "toko" && (
          <Card className="p-4">
            <h2 className="mb-3 font-display text-sm font-bold uppercase tracking-wide">🏪 Identitas Toko</h2>
            {storeFields}
            <Button className="mt-4 w-full" disabled={busy} onClick={handleSave}>
              {busy ? "Menyimpan…" : "Simpan"}
            </Button>
          </Card>
        )}

        {/* ===== TAB BRANDING ===== */}
        {tab === "branding" && (
          <Card className="p-4">
            <h2 className="mb-3 font-display text-sm font-bold uppercase tracking-wide">🎨 Branding</h2>
            <div className="space-y-4">
              {/* Logo */}
              <div>
                <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-ink/70">
                  Logo Toko (tampil di sidebar/login & struk)
                </span>
                <div className="flex items-center gap-3">
                  <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-xl border-[2.5px] border-ink bg-white">
                    {form.logoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={form.logoUrl} alt="Logo" className="h-full w-full object-contain p-1" />
                    ) : (
                      <span className="text-3xl opacity-40">🏪</span>
                    )}
                  </div>
                  <div className="flex-1 space-y-2">
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) handleLogoUpload(f);
                      }}
                      className="w-full text-xs font-semibold"
                    />
                    {form.logoUrl && (
                      <Button size="sm" variant="ghost" className="border-2 border-ink" onClick={() => setForm((f) => ({ ...f, logoUrl: "" }))}>
                        Hapus Logo
                      </Button>
                    )}
                  </div>
                </div>
              </div>

              {/* Warna aksen */}
              <div>
                <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-ink/70">
                  Warna Aksen (tombol utama, highlight)
                </span>
                <div className="grid grid-cols-3 gap-2">
                  {ACCENT_PRESETS.map((p) => (
                    <button
                      key={p.value}
                      onClick={() => setForm((f) => ({ ...f, accentColor: p.value }))}
                      className={cn(
                        "flex items-center gap-2 rounded-lg border-[2.5px] px-2.5 py-2 text-left text-[11px] font-bold shadow-neo-sm transition-all active:translate-x-[1px] active:translate-y-[1px] active:shadow-none",
                        form.accentColor === p.value ? "border-ink" : "border-ink/30"
                      )}
                    >
                      <span
                        className="h-6 w-6 shrink-0 rounded-md border-2 border-ink"
                        style={{ backgroundColor: p.value }}
                      />
                      {p.label}
                      {form.accentColor === p.value && <span className="ml-auto">✓</span>}
                    </button>
                  ))}
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <input
                    type="color"
                    value={form.accentColor}
                    onChange={(e) => setForm((f) => ({ ...f, accentColor: e.target.value }))}
                    className="h-10 w-14 cursor-pointer rounded-lg border-[2.5px] border-ink bg-white"
                    title="Warna kustom"
                  />
                  <span className="num text-xs font-bold">{form.accentColor}</span>
                  <span className="text-[10px] font-semibold text-ink/50">
                    Preset di atas dijamin kontras WCAG AA dengan teks hitam.
                  </span>
                </div>
              </div>

              {/* Preview */}
              <div className="rounded-xl border-[2.5px] border-ink bg-cream p-3">
                <p className="mb-2 text-[10px] font-bold uppercase text-ink/50">Pratinjau</p>
                <div className="flex items-center gap-2">
                  <button
                    className="rounded-lg border-[2.5px] border-ink px-4 py-2 font-display text-sm font-bold uppercase shadow-neo-sm"
                    style={{ backgroundColor: form.accentColor, color: "#141414" }}
                  >
                    Bayar Sekarang
                  </button>
                  <span className="text-xs font-semibold text-ink/60">← teks tetap hitam agar selalu terbaca</span>
                </div>
              </div>

              <Button className="w-full" disabled={busy} onClick={handleSave}>
                {busy ? "Menyimpan…" : "Simpan Branding"}
              </Button>
            </div>
          </Card>
        )}

        {/* ===== TAB STRUK & PRINTER ===== */}
        {tab === "struk" && (
          <Card className="p-4">
            <h2 className="mb-3 font-display text-sm font-bold uppercase tracking-wide">🖨️ Struk & Printer</h2>
            <div className="space-y-3">
              <Input
                label="Nama Printer (referensi)"
                value={form.printerName}
                onChange={(e) => setForm((f) => ({ ...f, printerName: e.target.value }))}
                placeholder="mis. EPSON TM-T82 (Bluetooth)"
              />
              <p className="rounded-lg border-2 border-dashed border-ink/40 bg-cream px-3 py-2 text-[11px] font-semibold text-ink/60">
                Pencetakan memakai dialog print browser: pilih printer thermal dari daftar perangkat
                (Bluetooth/network). Nama printer di sini hanya sebagai catatan agar kasir tahu printer mana yang dipakai.
              </p>

              <div>
                <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-ink/70">Ukuran Kertas</span>
                <div className="grid grid-cols-2 gap-2">
                  {[58, 80].map((s) => (
                    <button
                      key={s}
                      onClick={() => setForm((f) => ({ ...f, receiptSize: s }))}
                      className={cn(
                        "rounded-lg border-2 border-ink py-2.5 text-sm font-bold uppercase shadow-neo-sm active:translate-x-[1px] active:translate-y-[1px] active:shadow-none",
                        form.receiptSize === s ? "bg-sun" : "bg-white text-ink/50"
                      )}
                    >
                      {s}mm
                    </button>
                  ))}
                </div>
              </div>

              <label className="flex items-center gap-2 rounded-lg border-[2.5px] border-ink bg-white px-3 py-2.5">
                <input
                  type="checkbox"
                  checked={form.autoPrint}
                  onChange={(e) => setForm((f) => ({ ...f, autoPrint: e.target.checked }))}
                  className="h-4 w-4 accent-yellow-400"
                />
                <span className="text-sm font-bold">
                  Auto-print setelah bayar
                  <span className="block text-[11px] font-semibold text-ink/50">
                    Dialog print terbuka otomatis saat transaksi selesai
                  </span>
                </span>
              </label>

              <label className="flex items-center gap-2 rounded-lg border-[2.5px] border-ink bg-white px-3 py-2.5">
                <input
                  type="checkbox"
                  checked={form.useQzTray}
                  onChange={(e) => setForm((f) => ({ ...f, useQzTray: e.target.checked }))}
                  className="h-4 w-4 accent-yellow-400"
                />
                <span className="text-sm font-bold">
                  Cetak via QZ Tray (ESC/POS)
                  <span className="block text-[11px] font-semibold text-ink/50">
                    Langsung ke printer tanpa dialog — butuh aplikasi QZ Tray ter-install di perangkat kasir (qz.io)
                  </span>
                </span>
              </label>
              {form.useQzTray && (
                <p className="rounded-lg border-2 border-dashed border-ink/40 bg-cream px-3 py-2 text-[11px] font-semibold text-ink/60">
                  Pastikan QZ Tray berjalan dan mengizinkan koneksi dari situs ini.
                  Printer yang dipakai: <b>{form.printerName || "printer pertama yang ditemukan"}</b>.
                </p>
              )}

              <label className="flex items-center gap-2 rounded-lg border-[2.5px] border-ink bg-white px-3 py-2.5">
                <input
                  type="checkbox"
                  checked={form.useBtPrinter}
                  onChange={(e) => setForm((f) => ({ ...f, useBtPrinter: e.target.checked }))}
                  className="h-4 w-4 accent-yellow-400"
                />
                <span className="text-sm font-bold">
                  Cetak via Printer Bluetooth
                  <span className="block text-[11px] font-semibold text-ink/50">
                    Tanpa aplikasi — konek langsung dari Chrome (Android/desktop) ke printer thermal BLE
                  </span>
                </span>
              </label>
              {form.useBtPrinter && (
                <div className="space-y-2 rounded-lg border-2 border-dashed border-ink/40 bg-cream px-3 py-2.5 text-[11px] font-semibold text-ink/60">
                  <p>
                    Aktif di Chrome/Edge (Android/desktop) + HTTPS. Dialog pilih printer hanya
                    muncul <b>sekali</b> — setelah itu app menyambung otomatis dan cetak struk
                    tanpa dialog & tanpa tap. Struk tidak pernah hilang: bila printer putus,
                    otomatis masuk antrian dan tercetak saat tersambung kembali.
                  </p>
                  <p className="rounded-md border border-ink/20 bg-white px-2 py-1.5">
                    💡 Koneksi sering putus saat layar HP mati? Coba alternatif: pasang app
                    gratis <b>RawBT</b> (Play Store) — printer disambungkan ke RawBT, lalu di
                    Android Settings → Aplikasi default → Cetak, pilih RawBT. Koneksi dikelola
                    sistem Android (jauh lebih stabil, tahan layar mati), app ini cukup cetak
                    lewat dialog print biasa (mode Bluetooth dimatikan).
                  </p>
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="dark"
                      disabled={btBusy}
                      onClick={async () => {
                        setBtBusy(true);
                        try {
                          const ok = await btEnsureConnected();
                          if (ok) toast("Printer Bluetooth tersambung ✓", "success");
                          else toast("Belum bisa tersambung senyap — pilih printer dulu via 🧪 Tes Struk", "info");
                        } catch (e) {
                          toast(e instanceof Error ? e.message : "Gagal menyambung", "error");
                        } finally {
                          setBtBusy(false);
                        }
                      }}
                    >
                      {btBusy ? "Menyambung…" : "🔗 Sambungkan Printer"}
                    </Button>
                    {btSavedPrinter && (
                      <>
                        <span className="text-[10px]">
                          Tersimpan: <b>{btSavedPrinter}</b>
                        </span>
                        <Button
                          size="sm"
                          variant="candy"
                          disabled={btBusy}
                          onClick={async () => {
                            await btForgetDevice();
                            setBtForgetTick((t) => t + 1);
                            toast("Printer dilupakan — lakukan pairing ulang via Tes Struk", "info");
                          }}
                        >
                          🗑️ Lupakan
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              )}

              {/* ===== PERATAAN HEADER ===== */}
              <div>
                <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-ink/70">
                  Perataan Header Struk
                </span>
                <div className="grid grid-cols-3 gap-2">
                  {([
                    { v: "AUTO", d: "Perintah printer" },
                    { v: "SPACE", d: "Pad spasi manual" },
                    { v: "LEFT", d: "Rata kiri semua" },
                  ] as const).map((a) => (
                    <button
                      key={a.v}
                      onClick={() => setForm((f) => ({ ...f, receiptAlign: a.v }))}
                      className={cn(
                        "rounded-lg border-[2.5px] border-ink px-2 py-2 text-center shadow-neo-sm active:translate-x-[1px] active:translate-y-[1px] active:shadow-none",
                        form.receiptAlign === a.v ? "bg-sun" : "bg-white"
                      )}
                    >
                      <span className="block text-xs font-bold">{a.v}</span>
                      <span className="block text-[9px] font-semibold text-ink/50">{a.d}</span>
                    </button>
                  ))}
                </div>
                <p className="mt-1 text-[10px] font-semibold text-ink/50">
                  Header tidak center? Coba "SPACE" (beberapa printer BLE mengabaikan perintah perataan).
                </p>
              </div>

              {/* ===== PROMO & QR ===== */}
              <Textarea
                label="Teks Promo (opsional, tampil di struk — Enter untuk baris baru)"
                value={form.promoText}
                onChange={(e) => setForm((f) => ({ ...f, promoText: e.target.value }))}
                rows={2}
                placeholder="mis. Beli 2 Gratis 1 / Follow IG @kedaikita"
              />
              <label className="flex items-center gap-2 rounded-lg border-[2.5px] border-ink bg-white px-3 py-2.5">
                <input
                  type="checkbox"
                  checked={form.receiptQr}
                  onChange={(e) => setForm((f) => ({ ...f, receiptQr: e.target.checked }))}
                  className="h-4 w-4 accent-yellow-400"
                />
                <span className="text-sm font-bold">
                  Tampilkan QR di struk
                  <span className="block text-[11px] font-semibold text-ink/50">
                    Isi QR dikosongkan = nomor order (untuk pelacakan)
                  </span>
                </span>
              </label>
              {form.receiptQr && (
                <Input
                  label="Isi QR (opsional — kosongkan untuk nomor order)"
                  value={form.qrText}
                  onChange={(e) => setForm((f) => ({ ...f, qrText: e.target.value }))}
                  placeholder="mis. https://instagram.com/kedaikita"
                />
              )}

              {/* ===== PANEL KALIBRASI ===== */}
              <div className="rounded-xl border-[2.5px] border-ink bg-cream p-3">
                <p className="mb-2 font-display text-sm font-bold uppercase tracking-wide">🔧 Kalibrasi Printer</p>
                <p className="mb-2 text-[11px] font-semibold text-ink/60">
                  Cetak pola tes untuk cek perataan, lebar kolom, dan karakter. Bandingkan dengan
                  pratinjau di bawah.
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <Button variant="dark" disabled={busy} onClick={handleTestPrint}>
                    🧪 Tes Struk Penuh
                  </Button>
                  <Button
                    variant="dark"
                    disabled={calBusy}
                    onClick={() => handleCalibration(form.receiptSize === 80 ? 80 : 58)}
                  >
                    📐 Pola Kalibrasi
                  </Button>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <Button disabled={busy || calBusy} onClick={() => handleCalibration(58)}>
                    Cetak 58mm
                  </Button>
                  <Button disabled={busy || calBusy} onClick={() => handleCalibration(80)}>
                    Cetak 80mm
                  </Button>
                </div>
                {btSavedPrinter && (
                  <p className="mt-2 text-center text-[10px] font-semibold text-ink/50">
                    Printer BT tersimpan: <b>{btSavedPrinter}</b>
                  </p>
                )}
              </div>

              {/* ===== PRATINJAU STRUK ===== */}
              <div className="rounded-xl border-[2.5px] border-ink bg-cream p-3">
                <p className="mb-2 font-display text-sm font-bold uppercase tracking-wide">👁️ Pratinjau Struk</p>
                <p className="mb-2 text-[11px] font-semibold text-ink/60">
                  Tampilan di printer mengikuti pengaturan di atas (perataan, promo, QR).
                </p>
                <div className="flex justify-center">
                  <ReceiptPaper
                    order={{
                      id: "preview",
                      orderNo: "PRV-001",
                      orderType: "TAKE_AWAY",
                      tableNote: null,
                      status: "COMPLETED",
                      subtotal: 47000,
                      discount: 0,
                      tax: 0,
                      total: 47000,
                      refundAmount: 0,
                      paymentMethod: "CASH",
                      cashReceived: 50000,
                      change: 3000,
                      createdAt: new Date().toISOString(),
                      cashierName: "Kasir",
                      items: [
                        { name: "Kopi Susu Gula Aren", qty: 1, price: 22000, discount: 0, note: null },
                        { name: "Roti Bakar Telur", qty: 1, price: 23000, discount: 0, note: "tanpa bawang" },
                      ],
                    }}
                    store={{
                      name: form.storeName,
                      address: form.address,
                      phone: form.phone,
                      footer: form.footerReceipt,
                      receiptSize: form.receiptSize,
                      logoUrl: effectiveLogo,
                      promoText: form.promoText,
                      receiptQr: form.receiptQr,
                      qrText: form.qrText,
                    }}
                    size={form.receiptSize === 80 ? 80 : 58}
                  />
                </div>
              </div>

              <Button className="w-full" disabled={busy} onClick={handleSave}>
                {busy ? "Menyimpan…" : "Simpan"}
              </Button>
            </div>
          </Card>
        )}

        {/* ===== TAB TRANSAKSI ===== */}
        {tab === "transaksi" && (
          <Card className="p-4">
            <h2 className="mb-3 font-display text-sm font-bold uppercase tracking-wide">💰 Transaksi & Kas</h2>
            <div className="space-y-2.5">
              <button
                onClick={() => setNumpad({ kind: "tax" })}
                className="w-full rounded-lg border-[2.5px] border-ink bg-white px-3 py-2.5 text-left shadow-neo-sm active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
              >
                <span className="block text-[10px] font-bold uppercase text-ink/50">PPN (%)</span>
                <span className="num text-sm font-bold">{form.taxPercent}%</span>
              </button>
              <button
                onClick={() => setNumpad({ kind: "opening" })}
                className="w-full rounded-lg border-[2.5px] border-ink bg-white px-3 py-2.5 text-left shadow-neo-sm active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
              >
                <span className="block text-[10px] font-bold uppercase text-ink/50">Modal Awal Shift (default)</span>
                <span className="num text-sm font-bold">{formatRupiah(form.defaultOpeningCash)}</span>
              </button>
              <p className="rounded-lg border-2 border-dashed border-ink/40 bg-cream px-3 py-2 text-[11px] font-semibold text-ink/60">
                Modal awal menjadi default saat kasir membuka shift — masih bisa diubah per shift via numpad.
              </p>
              <Button className="w-full" disabled={busy} onClick={handleSave}>
                {busy ? "Menyimpan…" : "Simpan"}
              </Button>
            </div>
          </Card>
        )}

        {/* ===== TAB DATA (hapus data) ===== */}
        {tab === "data" && (
          <Card className="p-4">
            <h2 className="mb-1 font-display text-sm font-bold uppercase tracking-wide">🗄️ Hapus Data</h2>
            <p className="mb-3 rounded-lg border-2 border-dashed border-danger/50 bg-danger/5 px-3 py-2 text-[11px] font-semibold text-danger">
              ⚠️ Data yang dihapus TIDAK bisa dikembalikan. Setiap aksi dicatat di log audit dan
              wajib konfirmasi + PIN owner/admin.
            </p>
            <div className="space-y-2">
              {purgeRows.map((r) => (
                <button
                  key={r.scope}
                  onClick={() => {
                    setPurgePin("");
                    setPurgeConfirm({ scope: r.scope, title: r.title, description: r.description });
                  }}
                  className="flex w-full items-start gap-3 rounded-xl border-[2.5px] border-ink bg-white px-3 py-2.5 text-left shadow-neo-sm active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
                >
                  <span className="text-xl">{r.icon}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-bold">Hapus {r.title}</span>
                    <span className="block text-[11px] font-semibold text-ink/50">{r.description}</span>
                  </span>
                  <span className="mt-0.5 shrink-0 rounded-lg border-2 border-ink bg-danger px-2 py-1 text-[10px] font-bold uppercase text-white">
                    Hapus
                  </span>
                </button>
              ))}
            </div>
            <p className="mt-3 text-[11px] font-semibold text-ink/50">
              Akun pengguna & pengaturan toko tidak terpengaruh. Untuk backup sebelum hapus,
              gunakan Excel export di halaman laporan.
            </p>
          </Card>
        )}

        {/* ===== TAB PENGGUNA ===== */}
        {tab === "user" && (
          <Card className="p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-display text-sm font-bold uppercase tracking-wide">👥 Pengguna</h2>
              <Button
                size="sm"
                onClick={() => {
                  setUserForm({ name: "", email: "", role: "CASHIER", active: true, password: "", pin: "" });
                  setUserOpen(true);
                }}
              >
                + User
              </Button>
            </div>
            <div className="space-y-2">
              {users.map((u) => (
                <div key={u.id} className="flex items-center justify-between gap-2 rounded-xl border-2 border-ink bg-cream px-3 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold">
                      {u.name} {u.id === meId && <span className="text-[10px] text-ink/40">(kamu)</span>}
                    </p>
                    <p className="truncate text-[11px] font-semibold text-ink/50">
                      {u.email} {u.hasPin && "· PIN ✓"}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <Badge className={u.role === "CASHIER" ? "bg-teal" : "bg-sun"}>{u.role}</Badge>
                    {u.id !== meId && (
                      <>
                        <button
                          onClick={() => {
                            setUserForm({ id: u.id, name: u.name, email: u.email, role: u.role, active: u.active, password: "", pin: "" });
                            setUserOpen(true);
                          }}
                          className="rounded-lg border-2 border-ink bg-white px-2 py-1.5 text-[11px] font-bold shadow-neo-sm active:translate-x-[1px] active:translate-y-[1px] active:shadow-none"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleToggle(u)}
                          className={cn(
                            "rounded-lg border-2 border-ink px-2 py-1.5 text-[11px] font-bold shadow-neo-sm active:translate-x-[1px] active:translate-y-[1px] active:shadow-none",
                            u.active ? "bg-danger text-white" : "bg-lime"
                          )}
                        >
                          {u.active ? "Nonaktifkan" : "Aktifkan"}
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}
      </div>

      {/* Numpads */}
      <Numpad
        open={numpad.kind === "tax"}
        onClose={() => setNumpad({ kind: "closed" })}
        title="PPN (%)"
        subtitle="0 = tanpa pajak"
        onSubmit={(v) => {
          setForm((f) => ({ ...f, taxPercent: Math.min(v, 100) }));
          setNumpad({ kind: "closed" });
        }}
      />
      <Numpad
        open={numpad.kind === "opening"}
        onClose={() => setNumpad({ kind: "closed" })}
        title="Modal Awal Shift"
        subtitle="Default saat kasir membuka shift"
        onSubmit={(v) => {
          setForm((f) => ({ ...f, defaultOpeningCash: v }));
          setNumpad({ kind: "closed" });
        }}
      />

      {/* Form user */}
      <Sheet open={userOpen} onClose={() => setUserOpen(false)} title={userForm.id ? "Edit User" : "User Baru"} maxWidth="max-w-sm">
        <div className="space-y-2.5">
          <Input label="Nama" value={userForm.name} onChange={(e) => setUserForm((f) => ({ ...f, name: e.target.value }))} />
          <Input label="Email" type="email" value={userForm.email} onChange={(e) => setUserForm((f) => ({ ...f, email: e.target.value }))} />
          <Select
            label="Role"
            value={userForm.role}
            onChange={(e) => setUserForm((f) => ({ ...f, role: e.target.value as UserRow["role"] }))}
          >
            <option value="CASHIER">Kasir</option>
            <option value="ADMIN">Admin</option>
            <option value="OWNER">Owner</option>
          </Select>
          <Input
            label={userForm.id ? "Password Baru (opsional)" : "Password (min. 6)"}
            type="password"
            value={userForm.password}
            onChange={(e) => setUserForm((f) => ({ ...f, password: e.target.value }))}
            placeholder={userForm.id ? "biarkan kosong jika tidak diubah" : ""}
          />
          <Input
            label="PIN Kasir (4–8 angka, opsional)"
            inputMode="numeric"
            value={userForm.pin}
            onChange={(e) => setUserForm((f) => ({ ...f, pin: e.target.value.replace(/\D/g, "") }))}
            maxLength={8}
          />
          <label className="flex items-center gap-2 rounded-lg border-[2.5px] border-ink bg-white px-3 py-2.5">
            <input
              type="checkbox"
              checked={userForm.active}
              onChange={(e) => setUserForm((f) => ({ ...f, active: e.target.checked }))}
              className="h-4 w-4 accent-yellow-400"
            />
            <span className="text-sm font-bold">Aktif</span>
          </label>
          <Button className="w-full" disabled={busy || !userForm.name.trim() || !userForm.email.trim()} onClick={handleSaveUser}>
            {busy ? "Menyimpan…" : "Simpan User"}
          </Button>
        </div>
      </Sheet>

      {/* Konfirmasi hapus data: alert → PIN → eksekusi */}
      <Sheet
        open={!!purgeConfirm}
        onClose={() => setPurgeConfirm(null)}
        title="Hapus Data"
        maxWidth="max-w-sm"
      >
        {purgeConfirm && (
          <div className="space-y-3">
            <div className="rounded-xl border-[2.5px] border-danger bg-danger/10 p-3">
              <p className="font-display text-sm font-bold uppercase text-danger">
                ⚠️ Hapus {purgeConfirm.title}?
              </p>
              <p className="mt-1 text-xs font-semibold text-ink/70">{purgeConfirm.description}</p>
              <p className="mt-1 text-xs font-bold text-danger">
                Tindakan ini permanen dan tidak bisa dibatalkan.
              </p>
            </div>
            <Input
              label="PIN Owner/Admin (4–8 angka)"
              type="password"
              inputMode="numeric"
              value={purgePin}
              onChange={(e) => setPurgePin(e.target.value.replace(/\D/g, ""))}
              maxLength={8}
              autoFocus
            />
            <Button
              variant="danger"
              className="w-full"
              disabled={purgeBusy || purgePin.length < 4}
              onClick={handlePurge}
            >
              {purgeBusy ? "Menghapus…" : "🗑️ Ya, Hapus Permanen"}
            </Button>
            <Button
              variant="ghost"
              className="w-full"
              disabled={purgeBusy}
              onClick={() => setPurgeConfirm(null)}
            >
              Batal
            </Button>
          </div>
        )}
      </Sheet>

      {/* Tes cetak struk */}
      <ReceiptModal
        open={!!testReceipt}
        onClose={() => setTestReceipt(null)}
        order={testReceipt ?? null}
        store={{
          name: form.storeName,
          address: form.address,
          phone: form.phone,
          footer: form.footerReceipt,
          receiptSize: form.receiptSize,
          autoPrint: form.autoPrint,
          logoUrl: effectiveLogo,
          useBtPrinter: form.useBtPrinter,
        }}
        useQzTray={form.useQzTray}
        qzPrinter={form.printerName}
        useBtPrinter={form.useBtPrinter}
        receiptAlign={(form.receiptAlign as "AUTO" | "SPACE" | "LEFT") ?? "AUTO"}
        title="Tes Struk"
      />
    </div>
  );
}
