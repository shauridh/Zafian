"use client";

import { cn, formatRupiah, formatDateTime, orderTypeLabel } from "@/lib/utils";

export interface ReceiptOrderData {
  id: string;
  orderNo: string;
  orderType: string;
  tableNote: string | null;
  status: string;
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  refundAmount: number;
  paymentMethod: string;
  cashReceived: number | null;
  change: number | null;
  createdAt: string;
  cashierName: string;
  items: { name: string; price: number; qty: number; discount: number; note: string | null }[];
}

export interface ReceiptStoreData {
  name: string;
  address: string;
  phone: string;
  footer: string;
  receiptSize: number;
  autoPrint?: boolean;
  logoUrl?: string;
}

export function ReceiptPaper({
  order,
  store,
  size,
}: {
  order: ReceiptOrderData;
  store: ReceiptStoreData;
  size: 58 | 80;
}) {
  const pad = size === 58 ? "p-2 text-[11px]" : "p-3 text-xs";
  const refunded = order.refundAmount > 0;
  const remaining = Math.max(0, order.total - order.refundAmount);

  const paymentLabel =
    order.paymentMethod === "CASH" ? "Tunai" : order.paymentMethod === "QRIS" ? "QRIS" : "Ojol";

  return (
    <div
      className="mx-auto border-[2.5px] border-ink bg-white font-mono shadow-neo"
      style={{ width: size === 58 ? "58mm" : "80mm", maxWidth: "100%" }}
    >
      <div className={pad}>
        <div className="text-center">
          {store.logoUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={store.logoUrl}
              alt="Logo"
              className="mx-auto mb-1 h-14 w-14 object-contain"
            />
          )}
          <p className="font-display text-base font-bold uppercase leading-tight">{store.name}</p>
          {store.address && <p className="mt-0.5 leading-snug opacity-70">{store.address}</p>}
          {store.phone && <p className="leading-snug opacity-70">Telp: {store.phone}</p>}
        </div>

        <div className="my-2 border-t-2 border-dashed border-ink/40" />

        <div className="space-y-0.5 leading-snug">
          <p className="flex justify-between"><span>No.</span><span>{order.orderNo}</span></p>
          <p className="flex justify-between"><span>Waktu</span><span>{formatDateTime(order.createdAt)}</span></p>
          <p className="flex justify-between"><span>Kasir</span><span>{order.cashierName}</span></p>
          <p className="flex justify-between">
            <span>Tipe</span>
            <span>
              {orderTypeLabel(order.orderType)}
              {order.tableNote ? ` (${order.tableNote})` : ""}
            </span>
          </p>
        </div>

        <div className="my-2 border-t-2 border-dashed border-ink/40" />

        <div className="space-y-1.5">
          {order.items.map((i, idx) => (
            <div key={idx}>
              <p className="font-bold leading-tight">{i.name}</p>
              <p className="flex justify-between leading-snug">
                <span>
                  {i.qty} x {formatRupiah(i.price)}
                  {i.discount > 0 && (
                    <span className="text-danger"> −{formatRupiah(i.discount * i.qty)}</span>
                  )}
                </span>
                <span>{formatRupiah(i.price * i.qty - i.discount * i.qty)}</span>
              </p>
              {i.note && <p className="leading-snug italic opacity-60">&gt; {i.note}</p>}
            </div>
          ))}
        </div>

        <div className="my-2 border-t-2 border-dashed border-ink/40" />

        <div className="space-y-0.5 leading-snug">
          <p className="flex justify-between"><span>Subtotal</span><span>{formatRupiah(order.subtotal)}</span></p>
          {order.discount > 0 && (
            <p className="flex justify-between"><span>Diskon</span><span>−{formatRupiah(order.discount)}</span></p>
          )}
          {order.tax > 0 && (
            <p className="flex justify-between"><span>PPN</span><span>{formatRupiah(order.tax)}</span></p>
          )}
          <p className="mt-1 flex justify-between border-t-2 border-ink pt-1 font-display text-sm font-bold">
            <span>TOTAL</span><span>{formatRupiah(order.total)}</span>
          </p>
          <p className="flex justify-between">
            <span>{paymentLabel}</span>
            <span>{formatRupiah(order.cashReceived ?? order.total)}</span>
          </p>
          {order.change !== null && order.change > 0 && (
            <p className="flex justify-between font-bold"><span>Kembali</span><span>{formatRupiah(order.change)}</span></p>
          )}
          {refunded && (
            <div className="mt-1 rounded border-2 border-danger px-2 py-1">
              <p className="flex justify-between font-bold text-danger">
                <span>DIREFUND</span><span>−{formatRupiah(order.refundAmount)}</span>
              </p>
              <p className="flex justify-between font-bold">
                <span>Netto</span><span>{formatRupiah(remaining)}</span>
              </p>
            </div>
          )}
          {order.status === "VOIDED" && (
            <p className="mt-1 rounded border-2 border-danger px-2 py-1 text-center font-bold text-danger">
              ** TRANSKAKSI DIBATALKAN **
            </p>
          )}
        </div>

        <div className="my-2 border-t-2 border-dashed border-ink/40" />

        <p className="text-center leading-snug opacity-80">{store.footer}</p>
      </div>
    </div>
  );
}
