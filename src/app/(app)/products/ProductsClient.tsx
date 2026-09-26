"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Sheet } from "@/components/ui/Sheet";
import { Input, Select } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { ProductImage } from "@/components/pos/ProductImage";
import { Numpad } from "@/components/ui/Numpad";
import { useUI } from "@/store/ui";
import { saveProduct, deleteProduct, saveCategory } from "./actions";
import { exportExcel, importExcel } from "./excel-actions";
import { formatRupiah } from "@/lib/utils";

interface RecipeRow {
  ingredientId: string;
  qtyPerServing: number;
}

interface ProductRow {
  id: string;
  name: string;
  price: number;
  costPrice: number;
  isAvailable: boolean;
  imageUrl: string | null;
  categoryId: string | null;
  categoryName: string | null;
  recipe: RecipeRow[];
}

interface ProductsClientProps {
  products: ProductRow[];
  categories: { id: string; name: string }[];
  ingredients: { id: string; name: string; unit: string }[];
}

export function ProductsClient({ products, categories, ingredients }: ProductsClientProps) {
  const router = useRouter();
  const { toast } = useUI();

  const [formOpen, setFormOpen] = useState(false);
  const [catOpen, setCatOpen] = useState(false);
  const [catName, setCatName] = useState("");
  const [busy, setBusy] = useState(false);

  const emptyForm = {
    id: undefined as string | undefined,
    name: "",
    categoryId: "",
    price: 0,
    costPrice: 0,
    isAvailable: true,
    imageUrl: "" as string | null,
    recipe: [] as RecipeRow[],
  };
  const [form, setForm] = useState(emptyForm);

  const [numpad, setNumpad] = useState<
    | { kind: "closed" }
    | { kind: "price" }
    | { kind: "cost" }
    | { kind: "recipe-qty"; index: number }
  >({ kind: "closed" });
  const [catNumpadOpen, setCatNumpadOpen] = useState(false);
  const [catSortOrder, setCatSortOrder] = useState(0);
  const [excelOpen, setExcelOpen] = useState(false);

  const openCreate = () => {
    setForm(emptyForm);
    setFormOpen(true);
  };

  const openEdit = (p: ProductRow) => {
    setForm({
      id: p.id,
      name: p.name,
      categoryId: p.categoryId ?? "",
      price: p.price,
      costPrice: p.costPrice,
      isAvailable: p.isAvailable,
      imageUrl: p.imageUrl,
      recipe: [...p.recipe],
    });
    setFormOpen(true);
  };

  const handleUpload = async (file: File) => {
    setBusy(true);
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch("/api/upload", { method: "POST", body: fd });
    const json = await res.json();
    setBusy(false);
    if (res.ok) {
      setForm((f) => ({ ...f, imageUrl: json.url }));
      toast("Foto terupload", "success");
    } else {
      toast(json.error ?? "Gagal upload", "error");
    }
  };

  const handleSave = async () => {
    setBusy(true);
    const res = await saveProduct({
      id: form.id,
      name: form.name,
      categoryId: form.categoryId || null,
      price: form.price,
      costPrice: form.costPrice,
      isAvailable: form.isAvailable,
      imageUrl: form.imageUrl || null,
      recipe: form.recipe.filter((r) => r.ingredientId && r.qtyPerServing > 0),
    });
    setBusy(false);
    if (res.ok) {
      toast(form.id ? "Produk diperbarui" : "Produk ditambahkan", "success");
      setFormOpen(false);
      router.refresh();
    } else {
      toast(res.error ?? "Gagal menyimpan", "error");
    }
  };

  const handleDelete = async (p: ProductRow) => {
    if (!confirm(`Hapus "${p.name}"?`)) return;
    const res = await deleteProduct(p.id);
    if (res.ok) {
      toast("Produk dihapus", "success");
      router.refresh();
    } else {
      toast(res.error ?? "Gagal menghapus", "error");
    }
  };

  const handleSaveCategory = async () => {
    setBusy(true);
    const res = await saveCategory(catName, catSortOrder);
    setBusy(false);
    if (res.ok) {
      toast("Kategori ditambahkan", "success");
      setCatOpen(false);
      setCatName("");
      setCatSortOrder(0);
      router.refresh();
    } else {
      toast(res.error ?? "Gagal menambah kategori", "error");
    }
  };

  const handleExportExcel = async () => {
    setBusy(true);
    const res = await exportExcel();
    setBusy(false);
    if (res.ok && res.base64) {
      const bin = atob(res.base64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const blob = new Blob([bytes], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `zafian-menu-bahan.xlsx`;
      a.click();
      URL.revokeObjectURL(a.href);
      toast("Excel terunduh", "success");
    } else {
      toast(res.error ?? "Gagal ekspor", "error");
    }
  };

  const handleImportExcel = async (file: File) => {
    setBusy(true);
    const buf = await file.arrayBuffer();
    let binary = "";
    const bytes = new Uint8Array(buf);
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    const res = await importExcel(btoa(binary));
    setBusy(false);
    if (res.ok) {
      toast(
        `Impor selesai: menu +${res.menuCreated ?? 0} / ~${res.menuUpdated ?? 0}, bahan +${res.bahanCreated ?? 0} / ~${res.bahanUpdated ?? 0}`,
        "success"
      );
      setExcelOpen(false);
      router.refresh();
    } else {
      toast(res.error ?? "Gagal impor", "error");
    }
  };

  const ingMap = new Map(ingredients.map((i) => [i.id, i]));

  return (
    <div className="min-h-dvh">
      <PageHeader
        title="Menu"
        subtitle={`${products.length} produk`}
        right={
          <div className="flex gap-2">
            <Button size="sm" variant="dark" onClick={() => setExcelOpen(true)}>
              📊 Excel
            </Button>
            <Button size="sm" variant="ghost" className="hidden border-2 border-ink lg:inline-flex" onClick={() => setCatOpen(true)}>
              + Kategori
            </Button>
            <Button size="sm" onClick={openCreate}>
              + Produk
            </Button>
          </div>
        }
      />

      <div className="mx-auto max-w-6xl px-4 py-4">
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
          {products.map((p) => (
            <Card key={p.id} className="flex gap-3 p-3">
              <ProductImage src={p.imageUrl} alt={p.name} className="h-20 w-20 shrink-0" iconSize="text-3xl" />
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-1">
                  <p className="truncate text-sm font-bold">{p.name}</p>
                  <Badge
                    className={p.isAvailable ? "bg-lime" : "bg-danger text-white"}
                  >
                    {p.isAvailable ? "Ready" : "Habis"}
                    {" "}{" "}
                  </Badge>
                </div>
                <p className="num text-sm font-bold">{formatRupiah(p.price)}</p>
                <p className="text-[11px] font-semibold text-ink/50">
                  {p.categoryName ?? "Tanpa kategori"} · HPP {formatRupiah(p.costPrice)}
                </p>
                {p.recipe.length > 0 && (
                  <p className="mt-0.5 text-[11px] text-ink/50">
                    🧪 {p.recipe.length} bahan resep
                  </p>
                )}
                <div className="mt-1.5 flex gap-1.5">
                  <Button size="sm" variant="ghost" className="border-2 border-ink px-2" onClick={() => openEdit(p)}>
                    Edit
                  </Button>
                  <Button size="sm" variant="ghost" className="border-2 border-ink px-2 text-danger" onClick={() => handleDelete(p)}>
                    Hapus
                  </Button>
                </div>
              </div>
            </Card>
          ))}
          {products.length === 0 && (
            <p className="col-span-full py-10 text-center text-sm font-bold text-ink/40">
              Belum ada produk. Tambahkan produk pertama!
            </p>
          )}
        </div>
      </div>

      {/* Form produk */}
      <Sheet open={formOpen} onClose={() => setFormOpen(false)} title={form.id ? "Edit Produk" : "Produk Baru"} maxWidth="max-w-lg">
        <div className="space-y-3">
          {/* Foto */}
          <div className="flex gap-3">
            <ProductImage src={form.imageUrl} alt="preview" className="h-24 w-24 shrink-0" />
            <div className="flex-1 space-y-2">
              <label className="block">
                <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-ink/70">
                  Foto (tampil utuh, rasio bebas)
                </span>
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleUpload(f);
                  }}
                  className="w-full text-xs font-semibold"
                />
              </label>
              {form.imageUrl && (
                <Button size="sm" variant="ghost" className="border-2 border-ink" onClick={() => setForm((f) => ({ ...f, imageUrl: null }))}>
                  Hapus Foto
                </Button>
              )}
            </div>
          </div>

          <Input
            label="Nama Produk"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            placeholder="mis. Kopi Susu Gula Aren"
          />

          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => setNumpad({ kind: "price" })}
              className="rounded-lg border-[2.5px] border-ink bg-white px-3 py-2.5 text-left shadow-neo-sm active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
            >
              <span className="block text-[10px] font-bold uppercase text-ink/50">Harga Jual</span>
              <span className="num text-sm font-bold">{formatRupiah(form.price)}</span>
            </button>
            <button
              onClick={() => setNumpad({ kind: "cost" })}
              className="rounded-lg border-[2.5px] border-ink bg-white px-3 py-2.5 text-left shadow-neo-sm active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
            >
              <span className="block text-[10px] font-bold uppercase text-ink/50">Harga Pokok (HPP)</span>
              <span className="num text-sm font-bold">{formatRupiah(form.costPrice)}</span>
            </button>
          </div>

          <Select
            label="Kategori"
            value={form.categoryId}
            onChange={(e) => setForm((f) => ({ ...f, categoryId: e.target.value }))}
          >
            <option value="">— Tanpa kategori —</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>

          <label className="flex items-center gap-2 rounded-lg border-[2.5px] border-ink bg-white px-3 py-2.5">
            <input
              type="checkbox"
              checked={form.isAvailable}
              onChange={(e) => setForm((f) => ({ ...f, isAvailable: e.target.checked }))}
              className="h-4 w-4 accent-yellow-400"
            />
            <span className="text-sm font-bold">Tersedia di POS</span>
          </label>

          {/* Resep */}
          <div className="rounded-xl border-[2.5px] border-ink bg-cream p-3">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-xs font-bold uppercase tracking-wide">🧪 Resep Bahan (stok auto berkurang)</p>
              <Button
                size="sm"
                variant="teal"
                onClick={() =>
                  setForm((f) => ({
                    ...f,
                    recipe: [...f.recipe, { ingredientId: ingredients[0]?.id ?? "", qtyPerServing: 0 }],
                  }))
                }
              >
                + Bahan
              </Button>
            </div>
            {form.recipe.length === 0 && (
              <p className="text-xs text-ink/40">Belum ada bahan. Stok bahan tidak akan berkurang otomatis.</p>
            )}
            <div className="space-y-2">
              {form.recipe.map((r, idx) => (
                <div key={idx} className="flex items-center gap-1.5">
                  <select
                    value={r.ingredientId}
                    onChange={(e) =>
                      setForm((f) => {
                        const recipe = [...f.recipe];
                        recipe[idx] = { ...recipe[idx], ingredientId: e.target.value };
                        return { ...f, recipe };
                      })
                    }
                    className="min-w-0 flex-1 rounded-lg border-2 border-ink bg-white px-2 py-2 text-xs font-semibold"
                  >
                    {ingredients.map((i) => (
                      <option key={i.id} value={i.id}>
                        {i.name} ({i.unit})
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={() => setNumpad({ kind: "recipe-qty", index: idx })}
                    className="num shrink-0 rounded-lg border-2 border-ink bg-white px-2 py-2 text-xs font-bold shadow-neo-sm active:translate-x-[1px] active:translate-y-[1px] active:shadow-none"
                  >
                    {r.qtyPerServing} {ingMap.get(r.ingredientId)?.unit ?? ""}
                  </button>
                  <button
                    onClick={() => setForm((f) => ({ ...f, recipe: f.recipe.filter((_, i) => i !== idx) }))}
                    className="shrink-0 rounded-lg border-2 border-ink bg-danger px-2 py-2 text-xs font-bold text-white"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          </div>

          <Button className="w-full" disabled={busy || !form.name.trim()} onClick={handleSave}>
            {busy ? "Menyimpan…" : form.id ? "Simpan Perubahan" : "Tambah Produk"}
          </Button>
        </div>
      </Sheet>

      {/* Kategori */}
      <Sheet open={catOpen} onClose={() => setCatOpen(false)} title="Kategori Baru" maxWidth="max-w-sm">
        <Input label="Nama Kategori" value={catName} onChange={(e) => setCatName(e.target.value)} placeholder="mis. Snack" />
        <button
          onClick={() => setCatNumpadOpen(true)}
          className="mt-2 w-full rounded-lg border-[2.5px] border-ink bg-white px-3 py-2.5 text-left shadow-neo-sm active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
        >
          <span className="block text-[10px] font-bold uppercase text-ink/50">Urutan Tampil</span>
          <span className="num text-sm font-bold">{catSortOrder}</span>
        </button>
        <Button className="mt-3 w-full" disabled={busy || !catName.trim()} onClick={handleSaveCategory}>
          Simpan Kategori
        </Button>
      </Sheet>

      {/* Ekspor/Impor Excel */}
      <Sheet open={excelOpen} onClose={() => setExcelOpen(false)} title="Menu & Bahan via Excel" maxWidth="max-w-md">
        <div className="space-y-3">
          <p className="rounded-xl border-[2.5px] border-ink bg-cream px-3 py-2.5 text-xs font-semibold text-ink/70">
            Untuk onboarding massal: unduh template berisi data saat ini, edit di Excel/Google Sheets,
            lalu impor kembali. Menu di-update berdasarkan <b>nama</b>; resep ditulis format
            <code className="mx-1 rounded bg-white px-1 py-0.5 font-mono">Bahan=qty;Bahan2=qty</code>.
            Impor bahan dijalankan dulu, jadi menu bisa merujuk bahan baru dalam file yang sama.
          </p>
          <Button variant="dark" className="w-full" disabled={busy} onClick={handleExportExcel}>
            ⬇️ Unduh Excel (menu + bahan)
          </Button>
          <div>
            <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-ink/70">
              Impor file Excel
            </span>
            <input
              type="file"
              accept=".xlsx"
              disabled={busy}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleImportExcel(f);
              }}
              className="w-full text-xs font-semibold"
            />
            <p className="mt-1 text-[10px] font-semibold text-ink/50">
              Sheet "Menu" & "Bahan" diproses; baris dengan nama sama akan diperbarui.
            </p>
          </div>
        </div>
      </Sheet>

      {/* Numpads */}
      <Numpad
        open={numpad.kind === "price"}
        onClose={() => setNumpad({ kind: "closed" })}
        title="Harga Jual"
        onSubmit={(v) => {
          setForm((f) => ({ ...f, price: v }));
          setNumpad({ kind: "closed" });
        }}
      />
      <Numpad
        open={numpad.kind === "cost"}
        onClose={() => setNumpad({ kind: "closed" })}
        title="Harga Pokok (HPP)"
        onSubmit={(v) => {
          setForm((f) => ({ ...f, costPrice: v }));
          setNumpad({ kind: "closed" });
        }}
      />
      <Numpad
        open={numpad.kind === "recipe-qty"}
        onClose={() => setNumpad({ kind: "closed" })}
        title="Jumlah per Sajian"
        subtitle="Satuan mengikuti bahan (gr/ml/pcs)"
        onSubmit={(v) => {
          setForm((f) => {
            const recipe = [...f.recipe];
            if (numpad.kind === "recipe-qty") recipe[numpad.index] = { ...recipe[numpad.index], qtyPerServing: v };
            return { ...f, recipe };
          });
          setNumpad({ kind: "closed" });
        }}
      />
      <Numpad
        open={catNumpadOpen}
        onClose={() => setCatNumpadOpen(false)}
        title="Urutan Kategori"
        onSubmit={(v) => {
          setCatSortOrder(v);
          setCatNumpadOpen(false);
        }}
      />
    </div>
  );
}
