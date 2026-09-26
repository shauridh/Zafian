"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Sheet } from "@/components/ui/Sheet";
import { Textarea } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { Numpad } from "@/components/ui/Numpad";
import { ReceiptModal } from "@/components/pos/ReceiptModal";
import type { ReceiptOrderData, ReceiptStoreData } from "@/components/pos/ReceiptPaper";
import { useUI } from "@/store/ui";
import { voidOrder, refundOrder } from "./actions";
import {
  formatRupiah,
  formatDateTime,
  orderTypeShort,
  orderTypeColor,
  cn,
} from "@/lib/utils";

interface OrderRow extends ReceiptOrderData {
  voidReason: string | null;
  itemCount: number;
}

type OrderKind = "VOID" | "REFUND_PICK" | "REFUND_FULL" | "REFUND_PARTIAL";

/**
 * State koreksi: order yang sedang diproses + jenis aksinya.
 * flow: klik Void/Refund di struk → pilih mode (refund) → alasan (+nominal utk partial) → konfirmasi
 */
interface CorrectionState {
  order: OrderRow;
  kind: OrderKind;
}

export function OrdersClient({
  role,
  store,
  orders,
}: {
  role: string;
  store: ReceiptStoreData;
  orders: OrderRow[];
}) {
  const router = useRouter();
  const { toast } = useUI();
  const isOwner = role === "OWNER" || role === "ADMIN";

  const [filter, setFilter] = useState<string>("ALL");
  const [receiptOrder, setReceiptOrder] = useState<OrderRow | null>(null);
  const [correction, setCorrection] = useState<CorrectionState | null>(null);
  const [reason, setReason] = useState("");
  const [restoreStock, setRestoreStock] = useState(true);
  const [partialOpen, setPartialOpen] = useState(false);
  const [partialAmount, setPartialAmount] = useState(0);
  const [busy, setBusy] = useState(false);

  const filtered = useMemo(
    () => (filter === "ALL" ? orders : orders.filter((o) => o.orderType === filter)),
    [orders, filter]
  );

  const netSales = orders.reduce((s, o) => s + (o.total - o.refundAmount), 0);

  const closeCorrection = () => {
    setCorrection(null);
    setReason("");
    setPartialAmount(0);
    setRestoreStock(true);
  };

  const handleVoid = async () => {
    if (!correction) return;
    setBusy(true);
    const res = await voidOrder(correction.order.id, reason, restoreStock);
    setBusy(false);
    if (res.ok) {
      toast("Order di-void", "success");
      closeCorrection();
      setReceiptOrder(null);
      router.refresh();
    } else {
      toast(res.error ?? "Gagal", "error");
    }
  };

  const handleRefund = async () => {
    if (!correction) return;
    const amount = correction.kind === "REFUND_FULL" ? correction.order.total : partialAmount;
    setBusy(true);
    const res = await refundOrder(correction.order.id, reason, correction.kind === "REFUND_FULL" ? "FULL" : "PARTIAL", amount);
    setBusy(false);
    if (res.ok) {
      toast(
        correction.kind === "REFUND_FULL"
          ? "Refund penuh diproses"
          : `Refund ${formatRupiah(amount)} diproses`,
        "success"
      );
      closeCorrection();
      setReceiptOrder(null);
      router.refresh();
    } else {
      toast(res.error ?? "Gagal", "error");
    }
  };

  return (
    <div className="min-h-dvh">
      <PageHeader
        title="Riwayat"
        subtitle={`${orders.length} transaksi · Net: ${formatRupiah(netSales)}`}
      />

      <div className="mx-auto max-w-4xl px-4 py-4">
        {/* Filter channel */}
        <div className="mb-3 flex gap-1.5 overflow-x-auto pb-1">
          {["ALL", "DINE_IN", "TAKE_AWAY", "GOFOOD", "GRABFOOD", "SHOPEEFOOD"].map((t) => (
            <button
              key={t}
              onClick={() => setFilter(t)}
              className={cn(
                "shrink-0 rounded-lg border-2 border-ink px-3 py-1.5 text-xs font-bold uppercase shadow-neo-sm transition-all active:translate-x-[1px] active:translate-y-[1px] active:shadow-none",
                filter === t
                  ? t === "ALL"
                    ? "bg-ink text-white"
                    : orderTypeColor(t)
                  : "bg-white text-ink/60"
              )}
            >
              {t === "ALL" ? "Semua" : orderTypeShort(t)}
            </button>
          ))}
        </div>

        <div className="space-y-2">
          {filtered.map((o) => (
            <Card
              key={o.id}
              className="cursor-pointer p-3 transition-all active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
              onClick={() => setReceiptOrder(o)}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <Badge className={orderTypeColor(o.orderType)}>{orderTypeShort(o.orderType)}</Badge>
                    {o.status === "VOIDED" && <Badge className="bg-danger text-white">VOID</Badge>}
                    {o.status === "REFUNDED" && (
                      <Badge className="bg-candy text-white">
                        {o.refundAmount >= o.total ? "REFUND" : "REFUND SEBAGIAN"}
                      </Badge>
                    )}
                    {o.tableNote && <span className="text-[11px] font-bold text-ink/50">📍 {o.tableNote}</span>}
                  </div>
                  <p className="num mt-0.5 truncate text-xs font-semibold text-ink/50">
                    {o.orderNo} · {formatDateTime(o.createdAt)}
                  </p>
                </div>
                <div className="text-right">
                  <p className={cn("num text-base font-bold", o.status !== "COMPLETED" && "line-through opacity-50")}>
                    {formatRupiah(o.total)}
                  </p>
                  <p className="text-[11px] font-semibold text-ink/50">
                    {o.itemCount} item · {o.cashierName}
                  </p>
                </div>
              </div>
            </Card>
          ))}
          {filtered.length === 0 && (
            <p className="py-10 text-center text-sm font-bold text-ink/40">Tidak ada transaksi</p>
          )}
        </div>
      </div>

      {/* Struk modal — aksi Refund/Void menempel di footer modal */}
      <ReceiptModal
        open={!!receiptOrder}
        onClose={() => setReceiptOrder(null)}
        order={receiptOrder}
        store={store}
        title="Detail Transaksi"
        footer={
          receiptOrder && isOwner && receiptOrder.status === "COMPLETED" ? (
            <div className="grid grid-cols-2 gap-2">
              <Button
                variant="candy"
                onClick={() => setCorrection({ order: receiptOrder, kind: "REFUND_PICK" })}
              >
                💸 Refund
              </Button>
              <Button
                variant="dark"
                onClick={() => setCorrection({ order: receiptOrder, kind: "VOID" })}
              >
                🚫 Void
              </Button>
            </div>
          ) : undefined
        }
      />

      {/* Sheet pilihan refund: penuh / sebagian */}
      <Sheet
        open={correction?.kind === "REFUND_PICK"}
        onClose={closeCorrection}
        title="Jenis Refund"
        maxWidth="max-w-sm"
      >
        <p className="mb-3 rounded-xl border-[2.5px] border-ink bg-sun px-3 py-2 text-xs font-bold">
          Total transaksi: <span className="num">{formatRupiah(correction?.order.total ?? 0)}</span>
        </p>
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => correction && setCorrection({ ...correction, kind: "REFUND_FULL" })}
            className="rounded-xl border-[2.5px] border-ink bg-candy px-3 py-4 font-display text-sm font-bold uppercase text-white shadow-neo active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
          >
            Refund Penuh
            <span className="num block text-[10px] font-semibold opacity-90">
              {formatRupiah(correction?.order.total ?? 0)}
            </span>
          </button>
          <button
            onClick={() => correction && setCorrection({ ...correction, kind: "REFUND_PARTIAL" })}
            className="rounded-xl border-[2.5px] border-ink bg-teal px-3 py-4 font-display text-sm font-bold uppercase shadow-neo active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
          >
            Refund Sebagian
            <span className="block text-[10px] font-semibold opacity-70">tentukan nominal</span>
          </button>
        </div>
        <p className="mt-2 text-center text-[11px] font-semibold text-ink/50">
          Refund tunai akan mengurangi kas shift.
        </p>
      </Sheet>

      {/* Sheet alasan (void / refund penuh / refund sebagian) */}
      <Sheet
        open={!!correction && correction.kind !== "REFUND_PICK"}
        onClose={closeCorrection}
        title={correction?.kind === "VOID" ? "Alasan Void" : "Alasan Refund"}
        maxWidth="max-w-sm"
      >
        {correction && (
          <>
            {correction.kind === "REFUND_PARTIAL" && (
              <button
                onClick={() => setPartialOpen(true)}
                className="mb-3 w-full rounded-lg border-[2.5px] border-ink bg-white px-3 py-2.5 text-left shadow-neo-sm active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
              >
                <span className="block text-[10px] font-bold uppercase text-ink/50">
                  Nominal Refund (maks {formatRupiah(correction.order.total)})
                </span>
                <span className="num text-xl font-bold">{formatRupiah(partialAmount)}</span>
              </button>
            )}
            <Textarea
              label="Alasan (wajib)"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="mis. salah input, komplain pelanggan…"
              rows={3}
            />
            {correction.kind === "VOID" && (
              <label className="mt-2 flex items-center gap-2 rounded-lg border-[2.5px] border-ink bg-white px-3 py-2.5">
                <input
                  type="checkbox"
                  checked={restoreStock}
                  onChange={(e) => setRestoreStock(e.target.checked)}
                  className="h-4 w-4 accent-yellow-400"
                />
                <span className="text-sm font-bold">Kembalikan stok bahan</span>
              </label>
            )}
            <Button
              variant={correction.kind === "VOID" ? "dark" : "danger"}
              className="mt-3 w-full"
              disabled={busy || !reason.trim() || (correction.kind === "REFUND_PARTIAL" && partialAmount <= 0)}
              onClick={correction.kind === "VOID" ? handleVoid : handleRefund}
            >
              {busy
                ? "Memproses…"
                : correction.kind === "VOID"
                  ? "Ya, Void Transaksi"
                  : correction.kind === "REFUND_FULL"
                    ? "Ya, Refund Penuh"
                    : `Refund ${formatRupiah(partialAmount)}`}
            </Button>
          </>
        )}
      </Sheet>

      {/* Numpad nominal refund sebagian */}
      <Numpad
        open={partialOpen}
        onClose={() => setPartialOpen(false)}
        title="Nominal Refund Sebagian"
        subtitle={`Maksimal ${formatRupiah(correction?.order.total ?? 0)}`}
        confirmLabel="Set Nominal"
        onSubmit={(v) => {
          setPartialAmount(Math.min(v, correction?.order.total ?? 0));
          setPartialOpen(false);
        }}
      />
    </div>
  );
}
