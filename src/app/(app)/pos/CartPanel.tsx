"use client";

import type { CartItem } from "@/lib/types";
import { formatRupiah, ORDER_TYPES, cn } from "@/lib/utils";
import { Button } from "@/components/ui/Button";

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
            <Button variant="ghost" size="sm" onClick={p.onClear} className="px-3">
              Kosongkan
            </Button>
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
      </div>
    </div>
  );
}
