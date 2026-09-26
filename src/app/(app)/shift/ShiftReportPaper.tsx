"use client";

import { formatRupiah, formatDateTime, orderTypeShort } from "@/lib/utils";
import type { ShiftReportData } from "./report-actions";

/**
 * Rekap shift siap cetak (58mm): rekap kas, semua transaksi, ledger kas,
 * selisih, dan blok tanda tangan kasir vs owner.
 */
export function ShiftReportPaper({ data }: { data: ShiftReportData }) {
  const Row = ({ label, value, bold, danger }: { label: string; value: string; bold?: boolean; danger?: boolean }) => (
    <p className={`flex justify-between leading-snug ${bold ? "font-bold" : ""} ${danger ? "text-danger" : ""}`}>
      <span>{label}</span>
      <span className="num">{value}</span>
    </p>
  );

  return (
    <div
      className="mx-auto border-[2.5px] border-ink bg-white font-mono shadow-neo"
      style={{ width: "58mm", maxWidth: "100%" }}
    >
      <div className="p-2 text-[11px]">
        <div className="text-center">
          <p className="font-display text-sm font-bold uppercase leading-tight">{data.storeName}</p>
          <p className="mt-0.5 font-bold uppercase">Rekap Shift</p>
        </div>

        <div className="my-2 border-t-2 border-dashed border-ink/40" />

        <div className="space-y-0.5 leading-snug">
          <Row label="Kasir" value={data.userName} />
          <Row label="Buka" value={formatDateTime(data.openedAt)} />
          <Row label="Tutup" value={formatDateTime(data.closedAt)} />
        </div>

        <div className="my-2 border-t-2 border-dashed border-ink/40" />

        <p className="font-bold uppercase">Penjualan</p>
        <div className="space-y-0.5 leading-snug">
          <Row label="Tunai" value={formatRupiah(data.cashSales)} />
          <Row label="QRIS" value={formatRupiah(data.qrisSales)} />
          <Row label="Ojol" value={formatRupiah(data.onlineSales)} />
          <Row label="Total" value={formatRupiah(data.totalSales)} bold />
          <Row label="Jml Order" value={`${data.orderCount}`} />
        </div>

        <div className="my-2 border-t-2 border-dashed border-ink/40" />

        <p className="font-bold uppercase">Rekap Kas</p>
        <div className="space-y-0.5 leading-snug">
          <Row label="Modal awal" value={formatRupiah(data.openingCash)} />
          <Row label="+ Penjualan tunai" value={formatRupiah(data.cashSales)} />
          <Row label="+ Kas masuk" value={formatRupiah(data.cashIn)} />
          <Row label="− Kas keluar" value={formatRupiah(data.cashOut)} />
          <Row label="− Refund tunai" value={formatRupiah(data.refundsCash)} />
          <Row label="Kas seharusnya" value={formatRupiah(data.expectedCash)} bold />
          <Row label="Kas fisik" value={formatRupiah(data.actualCash)} bold />
          <Row
            label="Selisih"
            value={formatRupiah(data.difference)}
            bold
            danger={data.difference !== 0}
          />
        </div>

        {data.cashLogs.length > 0 && (
          <>
            <div className="my-2 border-t-2 border-dashed border-ink/40" />
            <p className="font-bold uppercase">Kas In/Out</p>
            <div className="space-y-0.5 leading-snug">
              {data.cashLogs.map((c, i) => (
                <p key={i} className="leading-snug">
                  {c.type === "IN" ? "+" : "−"}
                  {formatRupiah(c.amount)} · {c.note}
                  <span className="opacity-60"> ({formatDateTime(c.time)})</span>
                </p>
              ))}
            </div>
          </>
        )}

        <div className="my-2 border-t-2 border-dashed border-ink/40" />

        <p className="font-bold uppercase">Transaksi ({data.transactions.length})</p>
        <div className="space-y-1 leading-snug">
          {data.transactions.map((t) => (
            <div key={t.orderNo}>
              <p className="flex justify-between font-bold leading-tight">
                <span className="truncate">{t.orderNo}</span>
                <span className={t.status !== "COMPLETED" ? "text-danger" : ""}>
                  {t.status !== "COMPLETED" ? "BATAL" : formatRupiah(t.total)}
                </span>
              </p>
              <p className="leading-tight opacity-60">
                {formatDateTime(t.time)} · {orderTypeShort(t.type)} ·{" "}
                {t.payment === "CASH" ? "Tunai" : t.payment === "QRIS" ? "QRIS" : "Ojol"}
              </p>
            </div>
          ))}
          {data.transactions.length === 0 && <p className="opacity-60">Tidak ada transaksi</p>}
        </div>

        <div className="my-2 border-t-2 border-dashed border-ink/40" />

        {/* Tanda tangan */}
        <div className="mt-4 grid grid-cols-2 gap-3 text-center">
          <div>
            <p className="mb-12 text-[10px] font-bold uppercase">Kasir</p>
            <div className="border-t-2 border-ink pt-1 text-[10px] font-bold">{data.userName}</div>
          </div>
          <div>
            <p className="mb-12 text-[10px] font-bold uppercase">Owner/Spv</p>
            <div className="border-t-2 border-ink pt-1 text-[10px] font-bold">(____________)</div>
          </div>
        </div>

        <p className="mt-3 text-center text-[9px] opacity-60">
          Dicetak {formatDateTime(new Date().toISOString())}
        </p>
      </div>
    </div>
  );
}
