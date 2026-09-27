"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { CartItem } from "@/lib/types";

export interface HeldOrder {
  id: string;
  label: string;
  items: CartItem[];
  orderType: string;
  tableNote: string;
  orderDiscount: number;
  heldAt: number;
}

interface CartState {
  items: CartItem[];
  orderType: string;
  tableNote: string;
  orderDiscount: number;
  held: HeldOrder[];
  addItem: (item: Omit<CartItem, "qty" | "discount">) => void;
  removeItem: (productId: string) => void;
  setQty: (productId: string, qty: number) => void;
  setDiscount: (productId: string, discount: number) => void;
  setNote: (productId: string, note: string) => void;
  setOrderType: (t: string) => void;
  setTableNote: (n: string) => void;
  setOrderDiscount: (d: number) => void;
  /** Simpan keranjang saat ini ke daftar simpanan, kosongkan keranjang. */
  hold: (label: string) => string | null;
  /** Muat simpanan ke keranjang (keranjang aktif ikut tersimpan balik ke daftar hold). */
  loadHeld: (id: string) => void;
  /** Hapus simpanan tanpa memuat. */
  dropHeld: (id: string) => void;
  clear: () => void;
}

export const useCart = create<CartState>()(
  persist(
    (set, get) => ({
      items: [],
      orderType: "TAKE_AWAY",
      tableNote: "",
      orderDiscount: 0,
      held: [],
      addItem: (item) =>
        set((state) => {
          const existing = state.items.find((i) => i.productId === item.productId);
          if (existing) {
            return {
              items: state.items.map((i) =>
                i.productId === item.productId ? { ...i, qty: i.qty + 1 } : i
              ),
            };
          }
          return { items: [...state.items, { ...item, qty: 1, discount: 0 }] };
        }),
      removeItem: (productId) =>
        set((state) => ({ items: state.items.filter((i) => i.productId !== productId) })),
      setQty: (productId, qty) =>
        set((state) => ({
          items:
            qty <= 0
              ? state.items.filter((i) => i.productId !== productId)
              : state.items.map((i) => (i.productId === productId ? { ...i, qty } : i)),
        })),
      setDiscount: (productId, discount) =>
        set((state) => ({
          items: state.items.map((i) =>
            i.productId === productId ? { ...i, discount: Math.max(0, discount) } : i
          ),
        })),
      setNote: (productId, note) =>
        set((state) => ({
          items: state.items.map((i) =>
            i.productId === productId ? { ...i, note } : i
          ),
        })),
      setOrderType: (t) => set({ orderType: t }),
      setTableNote: (n) => set({ tableNote: n }),
      setOrderDiscount: (d) => set({ orderDiscount: Math.max(0, d) }),

      hold: (label) => {
        const { items, orderType, tableNote, orderDiscount } = get();
        if (items.length === 0) return null;
        const id = `H${Date.now().toString(36)}`;
        const heldOrder: HeldOrder = {
          id,
          label: label.trim() || `Simpanan ${new Date().toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}`,
          items,
          orderType,
          tableNote,
          orderDiscount,
          heldAt: Date.now(),
        };
        set({ held: [heldOrder, ...get().held].slice(0, 20), items: [], tableNote: "", orderDiscount: 0 });
        return id;
      },

      loadHeld: (id) => {
        const state = get();
        const target = state.held.find((h) => h.id === id);
        if (!target) return;
        // Keranjang aktif yang terisi → tumpuk balik ke daftar simpanan dulu
        if (state.items.length > 0) {
          const swapId = `H${Date.now().toString(36)}`;
          const swapped: HeldOrder = {
            id: swapId,
            label: `Aktif ${new Date().toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}`,
            items: state.items,
            orderType: state.orderType,
            tableNote: state.tableNote,
            orderDiscount: state.orderDiscount,
            heldAt: Date.now(),
          };
          set({
            held: [swapped, ...state.held.filter((h) => h.id !== id)],
            items: target.items,
            orderType: target.orderType,
            tableNote: target.tableNote,
            orderDiscount: target.orderDiscount,
          });
        } else {
          set({
            held: state.held.filter((h) => h.id !== id),
            items: target.items,
            orderType: target.orderType,
            tableNote: target.tableNote,
            orderDiscount: target.orderDiscount,
          });
        }
      },

      dropHeld: (id) => set((state) => ({ held: state.held.filter((h) => h.id !== id) })),

      clear: () => set({ items: [], tableNote: "", orderDiscount: 0 }),
    }),
    { name: "kasir-cart" }
  )
);

export function cartTotals(items: CartItem[], orderDiscount = 0) {
  const subtotal = items.reduce((s, i) => s + i.price * i.qty, 0);
  const itemDiscount = items.reduce((s, i) => s + i.discount * i.qty, 0);
  const afterDiscount = Math.max(0, subtotal - itemDiscount - orderDiscount);
  return { subtotal, itemDiscount, orderDiscount, afterDiscount };
}
