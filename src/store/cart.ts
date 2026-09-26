"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { CartItem } from "@/lib/types";

interface CartState {
  items: CartItem[];
  orderType: string;
  tableNote: string;
  orderDiscount: number;
  addItem: (item: Omit<CartItem, "qty" | "discount">) => void;
  removeItem: (productId: string) => void;
  setQty: (productId: string, qty: number) => void;
  setDiscount: (productId: string, discount: number) => void;
  setNote: (productId: string, note: string) => void;
  setOrderType: (t: string) => void;
  setTableNote: (n: string) => void;
  setOrderDiscount: (d: number) => void;
  clear: () => void;
}

export const useCart = create<CartState>()(
  persist(
    (set) => ({
      items: [],
      orderType: "TAKE_AWAY",
      tableNote: "",
      orderDiscount: 0,
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
