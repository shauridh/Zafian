"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useCart, cartTotals } from "@/store/cart";
import { useUI } from "@/store/ui";
import { createOrder } from "./actions";
import { CartPanel } from "./CartPanel";
import { PaymentSheet } from "./PaymentSheet";
import { ReceiptModal } from "@/components/pos/ReceiptModal";
import type { ReceiptData } from "./actions";
import { ProductImage } from "@/components/pos/ProductImage";
import { Sheet } from "@/components/ui/Sheet";
import { Numpad } from "@/components/ui/Numpad";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { openShift } from "@/app/(app)/shift/actions";
import type { CategoryDTO, ProductDTO } from "@/lib/types";
import { cn, formatRupiah } from "@/lib/utils";

interface PosClientProps {
  user: { name?: string; role: string };
  categories: CategoryDTO[];
  products: ProductDTO[];
  taxPercent: number;
  defaultOpeningCash: number;
  hasActiveShift: boolean;
  shiftOwner?: string;
  store: {
    name: string;
    address: string;
    phone: string;
    footer: string;
    receiptSize: number;
    autoPrint: boolean;
    logoUrl: string;
    useQzTray: boolean;
    printerName: string;
    useBtPrinter: boolean;
    promoText: string;
    receiptQr: boolean;
    qrText: string;
    receiptAlign: string;
  };
}

type NumpadState =
  | { kind: "closed" }
  | { kind: "item-discount"; productId: string; name: string; price: number }
  | { kind: "order-discount" };

export function PosClient(p: PosClientProps) {
  const router = useRouter();
  const { data: session } = useSession();
  const { toast } = useUI();
  const cart = useCart();
  const items = cart.items;

  const [search, setSearch] = useState("");
  const [activeCat, setActiveCat] = useState<string | null>(null);
  const [cartOpen, setCartOpen] = useState(false);
  const [payOpen, setPayOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false); // lock sinkron anti double-submit
  const [openingShift, setOpeningShift] = useState(false);
  const [numpad, setNumpad] = useState<NumpadState>({ kind: "closed" });
  const [noteTarget, setNoteTarget] = useState<string | null>(null);
  const [noteText, setNoteText] = useState("");
  const [receipt, setReceipt] = useState<ReceiptData | null>(null);

  const totals = useMemo(() => cartTotals(items, cart.orderDiscount), [items, cart.orderDiscount]);
  const tax = Math.round((totals.afterDiscount * p.taxPercent) / 100);
  const total = totals.afterDiscount + tax;

  const userId = (session?.user as { id?: string } | undefined)?.id;
  const canCheckout = p.hasActiveShift;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return p.products.filter((prod) => {
      if (activeCat && prod.categoryId !== activeCat) return false;
      if (q && !prod.name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [p.products, search, activeCat]);

  // ================= Checkout =================
  const doCheckout = async (paymentMethod: "CASH" | "QRIS", cashReceived?: number) => {
    if (submittingRef.current) return;
    submittingRef.current = true;
    setSubmitting(true);

    const payment =
      cart.orderType === "GOFOOD" || cart.orderType === "GRABFOOD" || cart.orderType === "SHOPEEFOOD"
        ? "ONLINE_PLATFORM"
        : paymentMethod;

    const result = await createOrder({
      orderType: cart.orderType,
      tableNote: cart.tableNote,
      paymentMethod: payment,
      orderDiscount: cart.orderDiscount,
      cashReceived: payment === "CASH" ? cashReceived : undefined,
      items: items.map((i) => ({
        productId: i.productId,
        qty: i.qty,
        discount: i.discount,
        note: i.note,
      })),
    });
    submittingRef.current = false;
    setSubmitting(false);

    if (!result.ok) {
      setPayOpen(false);
      toast(result.error ?? "Gagal menyimpan transaksi", "error");
      return;
    }

    cart.clear();
    setPayOpen(false);
    setCartOpen(false);
    setReceipt(result.receipt ?? null);
    toast(`Transaksi ${result.orderNo} berhasil!`, "success");
  };

  // ================= Shift =================
  const handleOpenShift = async () => {
    setOpeningShift(true);
    const res = await openShift(p.defaultOpeningCash);
    setOpeningShift(false);
    if (res.ok) {
      toast("Shift dibuka! Selamat bekerja 🎉", "success");
      router.refresh();
    } else {
      toast(res.error ?? "Gagal membuka shift", "error");
    }
  };

  // ================= Render =================
  const totalQty = items.reduce((s, i) => s + i.qty, 0);

  const productGrid = (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="shrink-0 px-3 pt-3 lg:px-4">
        <div className="mb-3 flex gap-2">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari menu…"
            className="w-full rounded-xl border-[2.5px] border-ink bg-white px-4 py-2.5 text-sm font-semibold placeholder:font-normal placeholder:text-ink/40 focus:outline-none focus:ring-2 focus:ring-sun"
          />
        </div>
        <div className="mb-3 flex gap-1.5 overflow-x-auto pb-1">
          <button
            onClick={() => setActiveCat(null)}
            className={cn(
              "shrink-0 rounded-lg border-2 border-ink px-3 py-1.5 text-xs font-bold uppercase shadow-neo-sm transition-all active:translate-x-[1px] active:translate-y-[1px] active:shadow-none",
              activeCat === null ? "bg-ink text-white" : "bg-white text-ink/60"
            )}
          >
            Semua
          </button>
          {p.categories.map((c) => (
            <button
              key={c.id}
              onClick={() => setActiveCat(c.id)}
              className={cn(
                "shrink-0 rounded-lg border-2 border-ink px-3 py-1.5 text-xs font-bold uppercase shadow-neo-sm transition-all active:translate-x-[1px] active:translate-y-[1px] active:shadow-none",
                activeCat === c.id ? "bg-teal text-ink" : "bg-white text-ink/60"
              )}
            >
              {c.name}
            </button>
          ))}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-3 lg:px-4">
        {filtered.length === 0 ? (
          <div className="flex h-40 flex-col items-center justify-center text-center">
            <span className="mb-2 text-4xl opacity-30">🔍</span>
            <p className="text-sm font-bold text-ink/40">Menu tidak ditemukan</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
            {filtered.map((prod) => (
              <button
                key={prod.id}
                onClick={() =>
                  cart.addItem({
                    productId: prod.id,
                    name: prod.name,
                    price: prod.price,
                    imageUrl: prod.imageUrl,
                  })
                }
                className="rounded-xl border-[2.5px] border-ink bg-white p-2 text-left shadow-neo transition-all active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
              >
                <ProductImage src={prod.imageUrl} alt={prod.name} className="aspect-square w-full" />
                <p className="mt-1.5 line-clamp-2 min-h-[2.1rem] text-xs font-bold leading-tight">{prod.name}</p>
                <p className="num text-sm font-bold text-ink/80">{formatRupiah(prod.price)}</p>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );

  const cartPanel = () => (
    <CartPanel
      items={items}
      orderType={cart.orderType}
      tableNote={cart.tableNote}
      subtotal={totals.subtotal}
      itemDiscount={totals.itemDiscount}
      orderDiscount={cart.orderDiscount}
      tax={tax}
      total={total}
      canCheckout={canCheckout}
      onSetOrderType={cart.setOrderType}
      onSetTableNote={cart.setTableNote}
      onInc={(id) => {
        const item = items.find((i) => i.productId === id);
        if (item) cart.setQty(id, item.qty + 1);
      }}
      onDec={(id) => {
        const item = items.find((i) => i.productId === id);
        if (item) cart.setQty(id, item.qty - 1);
      }}
      onRemove={cart.removeItem}
      onNote={(id) => {
        const item = items.find((i) => i.productId === id);
        setNoteTarget(id);
        setNoteText(item?.note ?? "");
      }}
      onDiscount={(id) => {
        const item = items.find((i) => i.productId === id);
        if (item)
          setNumpad({ kind: "item-discount", productId: id, name: item.name, price: item.price });
      }}
      onOrderDiscount={() => setNumpad({ kind: "order-discount" })}
      onClear={cart.clear}
      onCheckout={() => setPayOpen(true)}
    />
  );

  return (
    <div className="flex h-[100dvh] flex-col overflow-hidden">
      {/* Alert shift */}
      {!p.hasActiveShift && (
        <div className="shrink-0 border-b-[2.5px] border-ink bg-sun px-4 py-2.5">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-bold">⏱️ Belum ada shift aktif — transaksi terkunci.</p>
            <Button size="sm" variant="dark" disabled={openingShift} onClick={handleOpenShift}>
              {openingShift ? "Membuka…" : `Buka Shift ${formatRupiah(p.defaultOpeningCash)}`}
            </Button>
          </div>
        </div>
      )}

      {/* Desktop/tablet: dua pane */}
      <div className="hidden min-h-0 flex-1 lg:flex">
        <div className="flex min-w-0 flex-1 flex-col">{productGrid}</div>
        <aside className="flex w-[380px] shrink-0 flex-col border-l-[2.5px] border-ink bg-cream">
          {cartPanel()}
        </aside>
      </div>

      {/* Ponsel: grid penuh + tombol keranjang */}
      <div className="flex min-h-0 flex-1 flex-col lg:hidden">{productGrid}</div>

      {items.length > 0 && (
        <button
          onClick={() => setCartOpen(true)}
          className="fixed bottom-[calc(4.5rem+env(safe-area-inset-bottom))] right-3 z-30 flex items-center gap-2 rounded-2xl border-[2.5px] border-ink bg-accent px-4 py-3 font-display font-bold shadow-neo-lg active:translate-x-[3px] active:translate-y-[3px] active:shadow-none lg:hidden"
        >
          🛒 {totalQty} item · {formatRupiah(total)}
        </button>
      )}

      {cartOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 bg-ink/50 animate-fade-in"
            onClick={() => setCartOpen(false)}
          />
          <div className="absolute inset-x-0 bottom-0 top-12 flex flex-col rounded-t-2xl border-t-[2.5px] border-ink bg-cream animate-sheet-up pb-safe">
            {cartPanel()}
          </div>
        </div>
      )}

      {/* ===== Payment all-in-one ===== */}
      <PaymentSheet
        open={payOpen}
        onClose={() => setPayOpen(false)}
        total={total}
        loading={submitting}
        onlineOnly={["GOFOOD", "GRABFOOD", "SHOPEEFOOD"].includes(cart.orderType)}
        onPay={doCheckout}
      />

      <Numpad
        open={numpad.kind === "item-discount"}
        onClose={() => setNumpad({ kind: "closed" })}
        title={`Diskon ${numpad.kind === "item-discount" ? numpad.name : ""}`}
        subtitle={
          numpad.kind === "item-discount" ? `Harga satuan ${formatRupiah(numpad.price)}` : undefined
        }
        confirmLabel="Simpan Diskon"
        onSubmit={(v) => {
          if (numpad.kind === "item-discount") {
            cart.setDiscount(numpad.productId, Math.min(v, numpad.price));
          }
          setNumpad({ kind: "closed" });
        }}
      />

      <Numpad
        open={numpad.kind === "order-discount"}
        onClose={() => setNumpad({ kind: "closed" })}
        title="Diskon Transaksi"
        subtitle="Potongan langsung dari total"
        confirmLabel="Simpan"
        onSubmit={(v) => {
          cart.setOrderDiscount(v);
          setNumpad({ kind: "closed" });
        }}
      />

      {/* Catatan item */}
      <Sheet open={!!noteTarget} onClose={() => setNoteTarget(null)} title="Catatan Item" maxWidth="max-w-sm">
        <Input
          value={noteText}
          onChange={(e) => setNoteText(e.target.value)}
          placeholder="mis. less sugar, no ice, pedas…"
        />
        <Button
          className="mt-3 w-full"
          onClick={() => {
            if (noteTarget) cart.setNote(noteTarget, noteText);
            setNoteTarget(null);
          }}
        >
          Simpan Catatan
        </Button>
      </Sheet>

      {/* Struk modal — muncul setelah checkout, tanpa pindah halaman */}
      <ReceiptModal
        open={!!receipt}
        onClose={() => setReceipt(null)}
        order={receipt}
        store={p.store}
        autoPrint={p.store.autoPrint}
        useQzTray={p.store.useQzTray}
        qzPrinter={p.store.printerName}
        useBtPrinter={p.store.useBtPrinter}
        receiptAlign={(p.store.receiptAlign as "AUTO" | "SPACE" | "LEFT") ?? "AUTO"}
      />

      {/* Processing overlay */}
      {submitting && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-ink/60">
          <div className="rounded-2xl border-[2.5px] border-ink bg-white px-8 py-6 text-center shadow-neo-lg animate-pop-in">
            <span className="mb-2 block text-3xl">⏳</span>
            <p className="text-sm font-bold">Menyimpan transaksi…</p>
          </div>
        </div>
      )}
    </div>
  );
}
