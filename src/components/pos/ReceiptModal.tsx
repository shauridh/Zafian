"use client";

import { useEffect, useState } from "react";
import { formatRupiah, orderTypeLabel, formatDateTime } from "@/lib/utils";
import { qzAvailable, qzPrintReceipt } from "@/lib/qz";
import { useUI } from "@/store/ui";
import { Sheet } from "@/components/ui/Sheet";
import { ReceiptPaper, type ReceiptOrderData, type ReceiptStoreData } from "./ReceiptPaper";

/**
 * Modal struk compact: default 58mm, tombol icon-only (cetak & WhatsApp).
 * Slot `footer` untuk aksi tambahan (mis. Refund/Void di halaman Riwayat)
 * agar tombol menempel di dalam modal, tidak mengambang jauh di bawah.
 */
export function ReceiptModal({
  open,
  onClose,
  order,
  store,
  autoPrint,
  title = "Struk",
  footer,
  useQzTray,
  qzPrinter,
}: {
  open: boolean;
  onClose: () => void;
  order: ReceiptOrderData | null;
  store: ReceiptStoreData;
  autoPrint?: boolean;
  title?: string;
  footer?: React.ReactNode;
  useQzTray?: boolean;
  qzPrinter?: string;
}) {
  const { toast } = useUI();
  const [qzBusy, setQzBusy] = useState(false);

  const size: 58 | 80 = store.receiptSize === 80 ? 80 : 58;

  const printViaQz = async () => {
    if (!order) return;
    setQzBusy(true);
    try {
      await qzPrintReceipt({
        printer: qzPrinter || undefined,
        storeName: store.name,
        storeAddress: store.address || undefined,
        storePhone: store.phone || undefined,
        logoUrl: store.logoUrl || undefined,
        orderNo: order.orderNo,
        createdAt: formatDateTime(order.createdAt),
        cashierName: order.cashierName,
        orderTypeLabel: orderTypeLabel(order.orderType),
        items: order.items,
        subtotal: order.subtotal,
        discount: order.discount,
        tax: order.tax,
        total: order.total,
        paymentLabel:
          order.paymentMethod === "CASH" ? "Tunai" : order.paymentMethod === "QRIS" ? "QRIS" : "Ojol",
        cashReceived: order.cashReceived,
        change: order.change,
        footer: store.footer || undefined,
        widthMm: size,
      });
      toast("Struk terkirim ke printer", "success");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Gagal cetak via QZ Tray", "error");
    } finally {
      setQzBusy(false);
    }
  };

  // Auto-print sekali saat dibuka dari alur checkout (jika diaktifkan di pengaturan)
  useEffect(() => {
    if (!open || !autoPrint || !order) return;
    const t = setTimeout(() => {
      if (useQzTray) {
        printViaQz();
      } else {
        window.print();
      }
    }, 500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, autoPrint, order]);

  if (!order) return null;

  const waText = encodeURIComponent(
    `*${store.name}*\nNo: ${order.orderNo}\n${order.items
      .map((i) => `${i.qty}x ${i.name} = ${formatRupiah(i.price * i.qty - i.discount * i.qty)}`)
      .join("\n")}\nTOTAL: ${formatRupiah(order.total)}\n\nTerima kasih!`
  );

  return (
    <Sheet open={open} onClose={onClose} title={title} maxWidth="max-w-xs">
      {order.status !== "COMPLETED" && (
        <div className="mb-2 rounded-xl border-[2.5px] border-ink bg-danger px-3 py-2 text-center text-xs font-bold text-white shadow-neo-sm">
          {order.status === "VOIDED"
            ? "Transaksi di-VOID"
            : order.refundAmount >= order.total
              ? "Refund Penuh"
              : `Refund Sebagian ${formatRupiah(order.refundAmount)}`}
        </div>
      )}

      {/* Tombol icon-only: cetak & WhatsApp */}
      <div className="mb-2 flex items-center justify-center gap-2">
        <button
          onClick={() => (useQzTray ? printViaQz() : window.print())}
          disabled={qzBusy}
          title={useQzTray ? "Cetak via QZ Tray (langsung ke printer)" : "Cetak struk"}
          className="flex h-10 w-10 items-center justify-center rounded-lg border-[2.5px] border-ink bg-ink text-lg text-white shadow-neo-sm transition-all active:translate-x-[2px] active:translate-y-[2px] active:shadow-none disabled:opacity-50"
        >
          {qzBusy ? "⏳" : "🖨️"}
        </button>
        <a
          href={`https://wa.me/?text=${waText}`}
          target="_blank"
          rel="noopener noreferrer"
          title="Kirim via WhatsApp"
          className="flex h-10 w-10 items-center justify-center rounded-lg border-[2.5px] border-ink bg-lime text-lg shadow-neo-sm transition-all active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
        >
          💬
        </a>
        <span className="num ml-1 text-[10px] font-bold uppercase text-ink/40">
          {size}mm
        </span>
      </div>

      {/* Struk — scroll internal jika panjang */}
      <div className="print-area max-h-[55dvh] overflow-y-auto rounded-xl bg-cream p-2">
        <ReceiptPaper order={order} store={store} size={size} />
      </div>

      {/* Slot aksi tambahan — menempel di dalam modal */}
      {footer && <div className="mt-2">{footer}</div>}
    </Sheet>
  );
}
