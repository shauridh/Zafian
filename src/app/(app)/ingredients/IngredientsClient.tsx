"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Sheet } from "@/components/ui/Sheet";
import { Input, Select } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { Numpad } from "@/components/ui/Numpad";
import { useUI } from "@/store/ui";
import { saveIngredient, deleteIngredient, stockIn, adjustStock } from "./actions";
import { formatNumber, formatRupiah, formatDateTime, UNITS, cn } from "@/lib/utils";

interface IngredientRow {
  id: string;
  name: string;
  unit: string; // satuan jual
  stock: number;
  minStock: number;
  costPerUnit: number;
  purchaseUnit: string | null;
  purchaseQty: number | null;
  purchasePrice: number | null;
}

interface MovementRow {
  id: string;
  ingredientName: string;
  unit: string;
  type: string;
  qty: number;
  note: string | null;
  createdAt: string;
}

interface FormState {
  id?: string;
  name: string;
  unit: string;
  minStock: number;
  costPerUnit: number;
  purchaseUnit: string;
  purchaseQty: number;
  purchasePrice: number;
  useConversion: boolean;
}

const emptyForm: FormState = {
  name: "",
  unit: "gr",
  minStock: 0,
  costPerUnit: 0,
  purchaseUnit: "pack",
  purchaseQty: 0,
  purchasePrice: 0,
  useConversion: false,
};

export function IngredientsClient({
  ingredients,
  movements,
}: {
  ingredients: IngredientRow[];
  movements: MovementRow[];
}) {
  const router = useRouter();
  const { toast } = useUI();
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [busy, setBusy] = useState(false);

  const [stockInTarget, setStockInTarget] = useState<IngredientRow | null>(null);
  const [adjustTarget, setAdjustTarget] = useState<IngredientRow | null>(null);
  const [adjustStep, setAdjustStep] = useState<"closed" | "numpad" | "note">("closed");
  const [adjustNote, setAdjustNote] = useState("");
  const [pendingQty, setPendingQty] = useState(0);
  const [numpadKind, setNumpadKind] = useState<
    "closed" | "min" | "cost" | "purchase-price" | "purchase-qty"
  >("closed");

  const lowStock = ingredients.filter((i) => i.stock <= i.minStock);

  /** Tampilan stok: satuan jual + ekuivalen satuan beli (mis. "90 pcs ≈ 10 pack"). */
  const stockLabel = (i: IngredientRow) => {
    if (!i.purchaseUnit || !i.purchaseQty || i.purchaseQty <= 0) {
      return `${formatNumber(i.stock)} ${i.unit}`;
    }
    const packs = Math.round((i.stock / i.purchaseQty) * 10) / 10;
    return `${formatNumber(i.stock)} ${i.unit} ≈ ${formatNumber(packs)} ${i.purchaseUnit}`;
  };

  const openCreate = () => {
    setForm(emptyForm);
    setFormOpen(true);
  };

  const openEdit = (i: IngredientRow) => {
    setForm({
      id: i.id,
      name: i.name,
      unit: i.unit,
      minStock: i.minStock,
      costPerUnit: i.costPerUnit,
      purchaseUnit: i.purchaseUnit ?? "pack",
      purchaseQty: i.purchaseQty ?? 0,
      purchasePrice: i.purchasePrice ?? 0,
      useConversion: !!i.purchaseUnit,
    });
    setFormOpen(true);
  };

  const effCost = (() => {
    if (form.useConversion && form.purchasePrice > 0 && form.purchaseQty > 0) {
      return Math.round(form.purchasePrice / form.purchaseQty);
    }
    return form.costPerUnit;
  })();

  const handleSave = async () => {
    setBusy(true);
    const res = await saveIngredient({
      id: form.id,
      name: form.name,
      unit: form.unit,
      minStock: form.minStock,
      costPerUnit: form.costPerUnit,
      purchaseUnit: form.useConversion ? form.purchaseUnit : null,
      purchaseQty: form.useConversion ? form.purchaseQty : null,
      purchasePrice: form.useConversion ? form.purchasePrice : null,
    });
    setBusy(false);
    if (res.ok) {
      toast(form.id ? "Bahan diperbarui" : "Bahan ditambahkan", "success");
      setFormOpen(false);
      router.refresh();
    } else {
      toast(res.error ?? "Gagal", "error");
    }
  };

  const handleDelete = async (i: IngredientRow) => {
    if (!confirm(`Hapus bahan "${i.name}"?`)) return;
    const res = await deleteIngredient(i.id);
    if (res.ok) {
      toast("Bahan dihapus", "success");
      router.refresh();
    } else {
      toast(res.error ?? "Gagal", "error");
    }
  };

  const handleStockIn = async (qty: number) => {
    if (!stockInTarget) return;
    setStockInTarget(null); // tutup dulu (kontrak Numpad baru)
    setBusy(true);
    const res = await stockIn({
      ingredientId: stockInTarget.id,
      qty,
      note: stockInTarget.purchaseUnit ? `Beli ${qty} ${stockInTarget.purchaseUnit}` : "Stok masuk",
    });
    setBusy(false);
    if (res.ok) {
      const converted = stockInTarget.purchaseQty ? qty * stockInTarget.purchaseQty : qty;
      toast(
        stockInTarget.purchaseQty
          ? `+${formatNumber(converted)} ${stockInTarget.unit} (${qty} ${stockInTarget.purchaseUnit})`
          : `+${formatNumber(qty)} ${stockInTarget.unit}`,
        "success"
      );
      router.refresh();
    } else {
      toast(res.error ?? "Gagal", "error");
    }
  };

  const handleAdjust = async (qty: number) => {
    if (!adjustTarget) return;
    setBusy(true);
    const res = await adjustStock({ ingredientId: adjustTarget.id, newStock: qty, note: adjustNote });
    setBusy(false);
    if (res.ok) {
      toast("Stok disesuaikan", "success");
      setAdjustTarget(null);
      setAdjustNote("");
      setAdjustStep("closed");
      setPendingQty(0);
      router.refresh();
    } else {
      toast(res.error ?? "Gagal", "error");
    }
  };

  return (
    <div className="min-h-dvh">
      <PageHeader
        title="Bahan Baku"
        subtitle={lowStock.length > 0 ? `⚠️ ${lowStock.length} bahan menipis!` : `${ingredients.length} bahan`}
        right={
          <Button size="sm" onClick={openCreate}>
            + Bahan
          </Button>
        }
      />

      <div className="mx-auto max-w-4xl space-y-4 px-4 py-4">
        {lowStock.length > 0 && (
          <div className="rounded-xl border-[2.5px] border-ink bg-danger px-4 py-3 text-white shadow-neo">
            <p className="text-sm font-bold">
              ⚠️ Stok menipis: {lowStock.map((i) => `${i.name} (${stockLabel(i)})`).join(", ")}
            </p>
          </div>
        )}

        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
          {ingredients.map((i) => (
            <Card key={i.id} className="p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold">{i.name}</p>
                  <p className="num text-xl font-bold">
                    {formatNumber(i.stock)}{" "}
                    <span className="text-xs font-semibold text-ink/50">{i.unit}</span>
                  </p>
                  {i.purchaseUnit && i.purchaseQty ? (
                    <p className="text-[11px] font-semibold text-ink/50">
                      ≈ {formatNumber(Math.round((i.stock / i.purchaseQty) * 10) / 10)} {i.purchaseUnit} tersedia
                    </p>
                  ) : null}
                  <p className="text-[11px] font-semibold text-ink/50">
                    HPP/{i.unit} {formatRupiah(i.costPerUnit)}
                    {i.purchaseUnit && i.purchaseQty
                      ? ` · Beli per ${formatNumber(i.purchaseQty)} ${i.unit}/${i.purchaseUnit}`
                      : ""}
                  </p>
                  <p className="text-[11px] font-semibold text-ink/40">
                    Min: {formatNumber(i.minStock)} {i.unit}
                  </p>
                </div>
                {i.stock <= i.minStock && <Badge className="bg-danger text-white">Menipis</Badge>}
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <Button size="sm" variant="lime" onClick={() => setStockInTarget(i)}>
                  + Stok Masuk
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="border-2 border-ink"
                  onClick={() => {
                    setAdjustTarget(i);
                    setAdjustNote("");
                    setAdjustStep("numpad");
                  }}
                >
                  Sesuaikan
                </Button>
                <Button size="sm" variant="ghost" className="border-2 border-ink" onClick={() => openEdit(i)}>
                  Edit
                </Button>
                <Button size="sm" variant="ghost" className="border-2 border-ink text-danger" onClick={() => handleDelete(i)}>
                  Hapus
                </Button>
              </div>
            </Card>
          ))}
          {ingredients.length === 0 && (
            <p className="col-span-full py-10 text-center text-sm font-bold text-ink/40">
              Belum ada bahan. Tambahkan bahan lalu isi resep di menu produk.
            </p>
          )}
        </div>

        {/* Riwayat */}
        <div>
          <h2 className="mb-2 font-display text-sm font-bold uppercase tracking-wide text-ink/60">
            Riwayat Pergerakan Terbaru
          </h2>
          <Card className="divide-y-2 divide-dashed divide-ink/20">
            {movements.map((m) => (
              <div key={m.id} className="flex items-center justify-between gap-2 px-3 py-2">
                <div className="min-w-0">
                  <p className="truncate text-xs font-bold">
                    {m.ingredientName}{" "}
                    <span className={cn("font-bold", m.qty >= 0 ? "text-gofood" : "text-danger")}>
                      {m.qty >= 0 ? "+" : ""}
                      {formatNumber(m.qty)} {m.unit}
                    </span>
                  </p>
                  <p className="truncate text-[11px] text-ink/50">
                    {m.note ?? m.type} · {formatDateTime(m.createdAt)}
                  </p>
                </div>
                <Badge
                  className={
                    m.type === "IN" ? "bg-lime" : m.type === "SALE" ? "bg-white" : m.type === "VOID" ? "bg-teal" : "bg-candy text-white"
                  }
                >
                  {m.type}
                </Badge>
              </div>
            ))}
            {movements.length === 0 && (
              <p className="py-6 text-center text-xs font-bold text-ink/40">Belum ada pergerakan</p>
            )}
          </Card>
        </div>
      </div>

      {/* ===== Form bahan ===== */}
      <Sheet open={formOpen} onClose={() => setFormOpen(false)} title={form.id ? "Edit Bahan" : "Bahan Baru"} maxWidth="max-w-md">
        <div className="space-y-3">
          <Input label="Nama Bahan" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="mis. Dada Ayam" />

          <div className="grid grid-cols-2 gap-2">
            <Select label="Satuan Jual / Resep" value={form.unit} onChange={(e) => setForm((f) => ({ ...f, unit: e.target.value }))}>
              {UNITS.map((u) => (
                <option key={u} value={u}>{u}</option>
              ))}
            </Select>
            <Select
              label="Satuan Beli (opsional)"
              value={form.useConversion ? form.purchaseUnit : ""}
              onChange={(e) => setForm((f) => ({ ...f, useConversion: e.target.value !== "", purchaseUnit: e.target.value || f.purchaseUnit }))}
            >
              <option value="">— sama dengan jual —</option>
              {UNITS.filter((u) => u !== form.unit).map((u) => (
                <option key={u} value={u}>{u}</option>
              ))}
            </Select>
          </div>

          {/* Konversi satuan beli → jual */}
          {form.useConversion && (
            <div className="space-y-2 rounded-xl border-[2.5px] border-ink bg-cream p-3">
              <p className="text-xs font-bold uppercase tracking-wide">
                📦 Konversi Beli → Jual
              </p>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => setNumpadKind("purchase-qty")}
                  className="rounded-lg border-[2.5px] border-ink bg-white px-3 py-2 text-left shadow-neo-sm active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
                >
                  <span className="block text-[10px] font-bold uppercase text-ink/50">Isi per 1 {form.purchaseUnit}</span>
                  <span className="num text-sm font-bold">
                    {formatNumber(form.purchaseQty)} {form.unit}
                  </span>
                </button>
                <button
                  onClick={() => setNumpadKind("purchase-price")}
                  className="rounded-lg border-[2.5px] border-ink bg-white px-3 py-2 text-left shadow-neo-sm active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
                >
                  <span className="block text-[10px] font-bold uppercase text-ink/50">Harga per 1 {form.purchaseUnit}</span>
                  <span className="num text-sm font-bold">{formatRupiah(form.purchasePrice)}</span>
                </button>
              </div>
              <p className="rounded-lg border-2 border-dashed border-ink/40 bg-white px-3 py-2 text-xs font-semibold">
                {form.purchaseQty > 0 && form.purchasePrice > 0 ? (
                  <>
                    1 {form.purchaseUnit} = {formatNumber(form.purchaseQty)} {form.unit} → HPP otomatis{" "}
                    <b className="num">{formatRupiah(effCost)}/{form.unit}</b>
                  </>
                ) : (
                  "Isi jumlah dan harga untuk hitung HPP otomatis."
                )}
              </p>
            </div>
          )}

          {!form.useConversion && (
            <button
              onClick={() => setNumpadKind("cost")}
              className="w-full rounded-lg border-[2.5px] border-ink bg-white px-3 py-2.5 text-left shadow-neo-sm active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
            >
              <span className="block text-[10px] font-bold uppercase text-ink/50">HPP per {form.unit} (manual)</span>
              <span className="num text-sm font-bold">{formatRupiah(form.costPerUnit)}</span>
            </button>
          )}

          <button
            onClick={() => setNumpadKind("min")}
            className="w-full rounded-lg border-[2.5px] border-ink bg-white px-3 py-2.5 text-left shadow-neo-sm active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
          >
            <span className="block text-[10px] font-bold uppercase text-ink/50">Batas Stok Menipis ({form.unit})</span>
            <span className="num text-sm font-bold">{formatNumber(form.minStock)}</span>
          </button>

          <Button className="w-full" disabled={busy || !form.name.trim()} onClick={handleSave}>
            {busy ? "Menyimpan…" : "Simpan"}
          </Button>
        </div>
      </Sheet>

      {/* Stok masuk — dalam satuan BELI jika ada konversi */}
      <Numpad
        open={!!stockInTarget}
        onClose={() => setStockInTarget(null)}
        title={`Stok Masuk: ${stockInTarget?.name ?? ""}`}
        subtitle={
          stockInTarget?.purchaseUnit
            ? `dalam ${stockInTarget.purchaseUnit} (1 ${stockInTarget.purchaseUnit} = ${formatNumber(stockInTarget.purchaseQty ?? 0)} ${stockInTarget.unit})`
            : `dalam ${stockInTarget?.unit ?? ""}`
        }
        quickAmounts={stockInTarget?.purchaseUnit ? [1, 5, 10] : undefined}
        confirmLabel="Tambah Stok"
        onSubmit={handleStockIn}
      />

      {/* Penyesuaian: numpad → alasan */}
      <Numpad
        open={adjustStep === "numpad"}
        onClose={() => {
          setAdjustStep("closed");
          setAdjustTarget(null);
        }}
        title={`Stok Fisik: ${adjustTarget?.name ?? ""}`}
        subtitle={
          adjustTarget?.purchaseUnit && adjustTarget.purchaseQty
            ? `stok fisik dalam ${adjustTarget.unit} (1 ${adjustTarget.purchaseUnit} = ${formatNumber(adjustTarget.purchaseQty)} ${adjustTarget.unit})`
            : `Masukkan stok hasil hitung fisik (${adjustTarget?.unit ?? ""})`
        }
        confirmLabel="Lanjut Isi Alasan"
        onSubmit={(qty) => {
          setPendingQty(qty);
          setAdjustStep("note"); // TIDAK menutup numpad via onClose — sheet alasan menggantikan
        }}
      />

      <Sheet
        open={adjustStep === "note"}
        onClose={() => {
          setAdjustStep("closed");
          setAdjustTarget(null);
          setPendingQty(0);
        }}
        title="Alasan Penyesuaian"
        maxWidth="max-w-sm"
      >
        <p className="mb-3 text-center">
          <span className="block text-xs font-bold uppercase text-ink/50">Stok baru {adjustTarget?.name}</span>
          <span className="num text-2xl font-bold">
            {formatNumber(pendingQty)} {adjustTarget?.unit}
          </span>
        </p>
        <Input label="Alasan (wajib)" value={adjustNote} onChange={(e) => setAdjustNote(e.target.value)} placeholder="mis. stok opname, bahan rusak…" />
        <Button className="mt-3 w-full" disabled={!adjustNote.trim() || busy} onClick={() => handleAdjust(pendingQty)}>
          Simpan Penyesuaian
        </Button>
      </Sheet>

      {/* Numpad form fields */}
      <Numpad
        open={numpadKind === "min"}
        onClose={() => setNumpadKind("closed")}
        title={`Batas Menipis (${form.unit})`}
        onSubmit={(v) => {
          setForm((f) => ({ ...f, minStock: v }));
          setNumpadKind("closed");
        }}
      />
      <Numpad
        open={numpadKind === "cost"}
        onClose={() => setNumpadKind("closed")}
        title={`HPP per ${form.unit}`}
        onSubmit={(v) => {
          setForm((f) => ({ ...f, costPerUnit: v }));
          setNumpadKind("closed");
        }}
      />
      <Numpad
        open={numpadKind === "purchase-qty"}
        onClose={() => setNumpadKind("closed")}
        title={`Isi per 1 ${form.purchaseUnit}`}
        subtitle={`dalam ${form.unit}`}
        onSubmit={(v) => {
          setForm((f) => ({ ...f, purchaseQty: v }));
          setNumpadKind("closed");
        }}
      />
      <Numpad
        open={numpadKind === "purchase-price"}
        onClose={() => setNumpadKind("closed")}
        title={`Harga per 1 ${form.purchaseUnit}`}
        onSubmit={(v) => {
          setForm((f) => ({ ...f, purchasePrice: v }));
          setNumpadKind("closed");
        }}
      />
    </div>
  );
}
