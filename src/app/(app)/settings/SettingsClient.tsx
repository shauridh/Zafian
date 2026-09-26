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
import { useUI } from "@/store/ui";
import {
  saveSettings,
  saveUser,
  toggleUserActive,
  getTestReceipt,
  type SettingsInput,
  type UserInput,
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

type Tab = "toko" | "branding" | "struk" | "transaksi" | "user";

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: "toko", label: "Toko", icon: "🏪" },
  { id: "branding", label: "Branding", icon: "🎨" },
  { id: "struk", label: "Struk & Printer", icon: "🖨️" },
  { id: "transaksi", label: "Transaksi", icon: "💰" },
  { id: "user", label: "Pengguna", icon: "👥" },
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

  // logo yang dipakai untuk pratinjau tes struk: upload baru > tersimpan > kosong
  const effectiveLogo = form.logoUrl || logoUrl || "";

  const handleSave = async () => {
    setBusy(true);
    const res = await saveSettings(form);
    setBusy(false);
    if (res.ok) toast("Pengaturan disimpan", "success");
    else toast(res.error ?? "Gagal", "error");
  };

  const handleTestPrint = async () => {
    // simpan dulu agar pengaturan terbaru terpakai
    await handleSave();
    const res = await getTestReceipt();
    if (res.ok && res.receipt) {
      setTestReceipt(res.receipt);
    } else {
      toast(res.error ?? "Gagal", "error");
    }
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

              <Button variant="dark" className="w-full" disabled={busy} onClick={handleTestPrint}>
                🧪 Tes Cetak Struk
              </Button>
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
        }}
        useQzTray={form.useQzTray}
        qzPrinter={form.printerName}
        title="Tes Struk"
      />
    </div>
  );
}
