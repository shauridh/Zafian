"use client";

import { useState } from "react";
import type { CartItem } from "@/lib/types";
import { formatRupiah, ORDER_TYPES, cn } from "@/lib/utils";
import { Button } from "@/components/ui/Button";
import { Sheet } from "@/components/ui/Sheet";
import { useCart, type HeldOrder } from "@/store/cart";

interface CartPanelProps {
  items: CartItem[];
  orderType: string;
  tableNote: string;
  subtotal: number;
  itemDiscount: number;
  tax: number;
  total: number;
  orderDiscount: number;
  canCheckout: boolean;
  onSetOrderType: (t: string) => void;
  onSetTableNote: (n: string) => void;
  onInc: (id: string) => void;
  onDec: (id: string) => void;
  onRemove: (id: string) => void;
  onNote: (id: string) => void;
  onDiscount: (id: string) => void;
  onOrderDiscount: () => void;
  onClear: () => void;
  onCheckout: () => void;
  embedded?: boolean;
}

export function CartPanel(p: CartPanelProps) {
  const held = useCart((s) => s.held);
  const holdOrder = useCart((s) => s.hold);
  const loadHeld = useCart((s) => s.loadHeld);
  const dropHeld = useCart((s) => s.dropHeld);
  const [heldOpen, setHeldOpen] = useState(false);
  const [holdLabel, setHoldLabel] = useState("");

  const handleHold = () => {
    const id = holdOrder(holdLabel);
    setHoldLabel("");
    if (id) setHeldOpen(true);
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Tipe pesanan */}
      <div className="shrink-0 border-b-[2.5px] border-ink bg-white px-3 py-2.5">
        <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wide text-ink/50">
          Tipe Pesanan
        </p>
        <div className="flex flex-wrap gap-1.5">
          {ORDER_TYPES.map((t) => (
            <button
              key={t.value}
              onClick={() => p.onSetOrderType(t.value)}
              className={cn(
                "rounded-lg border-2 border-ink px-2.5 py-1.5 text-[11px] font-bold uppercase shadow-neo-sm transition-all active:translate-x-[1px] active:translate-y-[1px] active:shadow-none",
                p.orderType === t.value ? t.color : "bg-white text-ink/40"
              )}
            >
              {t.short}
            </button>
          ))}
        </div>
        {p.orderType === "DINE_IN" && (
          <input
            value={p.tableNote}
            onChange={(e) => p.onSetTableNote(e.target.value)}
            placeholder="No. meja (opsional)…"
            className="mt-2 w-full rounded-lg border-2 border-ink bg-cream px-3 py-2 text-sm font-semibold placeholder:font-normal placeholder:text-ink/40 focus:outline-none focus:ring-2 focus:ring-sun"
          />
        )}
      </div>

      {/* Daftar item */}
      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2">
        {p.items.length === 0 ? (
          <div className="flex h-full min-h-[160px] flex-col items-center justify-center text-center">
            <span className="mb-2 text-4xl opacity-30">🛒</span>
            <p className="text-sm font-bold text-ink/40">Keranjang kosong</p>
            <p className="text-xs text-ink/30">Pilih produk untuk mulai</p>
          </div>
        ) : (
          <ul className="space-y-2">
            {p.items.map((item) => (
              <li
                key={item.productId}
                className="rounded-xl border-2 border-ink bg-white p-2.5 shadow-neo-sm"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold">{item.name}</p>
                    <p className="num text-xs text-ink/60">
                      {formatRupiah(item.price)}
                      {item.discount > 0 && (
                        <span className="ml-1 font-bold text-candy">
                          −{formatRupiah(item.discount * item.qty)}
                        </span>
                      )}
                    </p>
                    {item.note && (
                      <p className="mt-0.5 truncate text-[11px] italic text-ink/50">
                        📝 {item.note}
                      </p>
                    )}
                  </div>
                  <button
                    onClick={() => p.onRemove(item.productId)}
                    className="shrink-0 rounded-md border-2 border-ink bg-white px-1.5 py-0.5 text-xs font-bold shadow-neo-sm active:translate-x-[1px] active:translate-y-[1px] active:shadow-none"
                    aria-label={`Hapus ${item.name}`}
                  >
                    ✕
                  </button>
                </div>
                <div className="mt-2 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => p.onDec(item.productId)}
                      className="flex h-9 w-9 items-center justify-center rounded-lg border-[2.5px] border-ink bg-white text-lg font-bold shadow-neo-sm active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
                    >
                      −
                    </button>
                    <span className="num min-w-[2rem] text-center text-base font-bold">
                      {item.qty}
                    </span>
                    <button
                      onClick={() => p.onInc(item.productId)}
                      className="flex h-9 w-9 items-center justify-center rounded-lg border-[2.5px] border-ink bg-sun text-lg font-bold shadow-neo-sm active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
                    >
                      +
                    </button>
                  </div>
                  <div className="flex gap-1.5">
                    <button
                      onClick={() => p.onDiscount(item.productId)}
                      className="rounded-lg border-2 border-ink bg-white px-2 py-1.5 text-[11px] font-bold uppercase shadow-neo-sm active:translate-x-[1px] active:translate-y-[1px] active:shadow-none"
                    >
                      Diskon
                    </button>
                    <button
                      onClick={() => p.onNote(item.productId)}
                      className="rounded-lg border-2 border-ink bg-white px-2 py-1.5 text-[11px] font-bold uppercase shadow-neo-sm active:translate-x-[1px] active:translate-y-[1px] active:shadow-none"
                    >
                      Catatan
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Ringkasan + tombol */}
      <div className="shrink-0 space-y-2 border-t-[2.5px] border-ink bg-white px-3 py-3">
        {p.items.length > 0 && (
          <>
            <div className="flex items-center justify-between text-xs font-semibold text-ink/60">
              <span>Subtotal</span>
              <span className="num">{formatRupiah(p.subtotal)}</span>
            </div>
            {p.itemDiscount > 0 && (
              <div className="flex items-center justify-between text-xs font-semibold text-candy">
                <span>Diskon item</span>
                <span className="num">−{formatRupiah(p.itemDiscount)}</span>
              </div>
            )}
            <button
              onClick={p.onOrderDiscount}
              className="flex w-full items-center justify-between rounded-lg border-2 border-dashed border-ink/40 px-2 py-1.5 text-xs font-bold text-ink/60 active:bg-cream"
            >
              <span>Diskon transaksi {p.orderDiscount > 0 ? `(−${formatRupiah(p.orderDiscount)})` : ""}</span>
              <span className="text-candy">Atur</span>
            </button>
            {p.tax > 0 && (
              <div className="flex items-center justify-between text-xs font-semibold text-ink/60">
                <span>PPN</span>
                <span className="num">{formatRupiah(p.tax)}</span>
              </div>
            )}
            <div className="flex items-center justify-between border-t-2 border-dashed border-ink/30 pt-2">
              <span className="text-sm font-bold uppercase">Total</span>
              <span className="num text-xl font-bold">{formatRupiah(p.total)}</span>
            </div>
          </>
        )}
        <div className="flex gap-2">
          {p.items.length > 0 && (
            <>
              <Button variant="ghost" size="sm" onClick={handleHold} className="px-3">
                📌 Hold
              </Button>
              <Button variant="ghost" size="sm" onClick={p.onClear} className="px-3">
                Kosongkan
              </Button>
            </>
          )}
          <Button
            variant="primary"
            className="flex-1"
            disabled={p.items.length === 0 || !p.canCheckout}
            onClick={p.onCheckout}
          >
            Bayar
          </Button>
        </div>
        {held.length > 0 && (
          <button
            onClick={() => setHeldOpen(true)}
            className="flex w-full items-center justify-center gap-1.5 rounded-lg border-2 border-dashed border-ink/40 py-1.5 text-[11px] font-bold uppercase text-ink/60 active:bg-cream"
          >
            📌 {held.length} pesanan disimpan
          </button>
        )}
      </div>

      {/* Sheet pesanan disimpan (hold) */}
      <Sheet open={heldOpen} onClose={() => setHeldOpen(false)} title="📌 Pesanan Simpanan" maxWidth="max-w-sm">
        {p.items.length > 0 && (
          <div className="mb-3 space-y-2 rounded-xl border-[2.5px] border-ink bg-cream p-3">
            <p className="text-[10px] font-bold uppercase tracking-wide text-ink/50">
              Simpan keranjang aktif ({p.items.length} item · {formatRupiah(p.total)})
            </p>
            <div className="flex gap-2">
              <input
                value={holdLabel}
                onChange={(e) => setHoldLabel(e.target.value)}
                placeholder="Label (mis. Meja 5)…"
                className="min-w-0 flex-1 rounded-lg border-2 border-ink bg-white px-3 py-2 text-sm font-semibold placeholder:font-normal placeholder:text-ink/40 focus:outline-none focus:ring-2 focus:ring-sun"
              />
              <Button size="sm" onClick={handleHold}>
                Simpan
              </Button>
            </div>
          </div>
        )}
        {held.length === 0 ? (
          <p className="py-6 text-center text-sm font-bold text-ink/40">Belum ada pesanan disimpan</p>
        ) : (
          <ul className="space-y-2">
            {held.map((h) => (
              <HeldRow
                key={h.id}
                h={h}
                onLoad={() => {
                  loadHeld(h.id);
                  setHeldOpen(false);
                }}
                onDrop={() => dropHeld(h.id)}
              />
            ))}
          </ul>
        )}
      </Sheet>
    </div>
  );
}

function HeldRow({ h, onLoad, onDrop }: { h: HeldOrder; onLoad: () => void; onDrop: () => void }) {
  const total = h.items.reduce((s, i) => s + i.price * i.qty - i.discount * i.qty, 0);
  const ago = Math.floor((Date.now() - h.heldAt) / 60000);
  return (
    <li className="rounded-xl border-[2.5px] border-ink bg-white p-2.5 shadow-neo-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-bold">{h.label}</p>
          <p className="text-[11px] font-semibold text-ink/50">
            {h.items.reduce((s, i) => s + i.qty, 0)} item · {formatRupiah(total)} ·{" "}
            {ago < 1 ? "baru saja" : ago < 60 ? `${ago} mnt lalu` : `${Math.floor(ago / 60)} jam lalu`}
          </p>
        </div>
        <div className="flex shrink-0 gap-1.5">
          <Button size="sm" onClick={onLoad}>
            Muat
          </Button>
          <Button size="sm" variant="candy" onClick={onDrop}>
            ✕
          </Button>
        </div>
      </div>
    </li>
  );
}
