"use client";

import { useCallback, useEffect, useState } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { getLiveSnapshot, type LiveSnapshot } from "./actions";
import { formatRupiah, formatTime, orderTypeShort, orderTypeColor, cn } from "@/lib/utils";

/**
 * Dashboard owner real-time. Menggunakan polling 10 detik (SSE/WebSocket
 * butuh server khusus di serverless — polling memberi efek live yang sama
 * dengan biaya infrastruktur nol; interval bisa diturunkan nanti).
 */
export function LiveClient() {
  const [snap, setSnap] = useState<LiveSnapshot | null>(null);
  const [error, setError] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await getLiveSnapshot();
      setSnap(data);
      setLastUpdate(new Date());
      setError(false);
    } catch {
      setError(true);
    }
  }, []);

  useEffect(() => {
    load();
    const timer = setInterval(load, 10000);
    return () => clearInterval(timer);
  }, [load]);

  const maxHour = snap ? Math.max(1, ...snap.today.hourly) : 1;
  const maxChannel = snap ? Math.max(1, ...snap.today.byChannel.map((c) => c.total)) : 1;

  return (
    <div className="min-h-dvh">
      <PageHeader
        title="Live"
        subtitle="Penjualan hari ini — diperbarui otomatis"
        right={
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1.5 rounded-lg border-2 border-ink bg-white px-2 py-1 text-[10px] font-bold uppercase">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-danger opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-danger" />
              </span>
              LIVE
            </span>
            {lastUpdate && (
              <span className="num hidden text-[10px] font-bold text-ink/50 sm:inline">
                {formatTime(lastUpdate)}
              </span>
            )}
          </div>
        }
      />

      <div className="mx-auto max-w-4xl space-y-4 px-4 py-4">
        {error && (
          <div className="rounded-xl border-[2.5px] border-ink bg-danger px-4 py-3 text-sm font-bold text-white">
            Gagal memuat — mencoba lagi otomatis…
          </div>
        )}

        {!snap ? (
          <p className="py-16 text-center text-sm font-bold text-ink/40">Menghubungkan…</p>
        ) : (
          <>
            {/* Shift aktif */}
            {snap.activeShift ? (
              <Card className="flex items-center justify-between px-4 py-3">
                <div>
                  <p className="text-[10px] font-bold uppercase text-ink/50">Shift Aktif · {snap.activeShift.userName}</p>
                  <p className="text-xs font-semibold text-ink/70">Sejak {formatTime(snap.activeShift.openedAt)}</p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] font-bold uppercase text-ink/50">Kas di Drawer</p>
                  <p className="num text-lg font-bold">{formatRupiah(snap.activeShift.expectedCash)}</p>
                </div>
              </Card>
            ) : (
              <Card className="px-4 py-3 text-center text-sm font-bold text-ink/50">
                ⏱️ Tidak ada shift aktif
              </Card>
            )}

            {/* KPI hari ini */}
            <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
              <Card className="p-3">
                <p className="text-[10px] font-bold uppercase text-ink/50">Omzet Hari Ini</p>
                <p className="num text-xl font-bold">{formatRupiah(snap.today.revenue)}</p>
              </Card>
              <Card className="p-3">
                <p className="text-[10px] font-bold uppercase text-ink/50">Transaksi</p>
                <p className="num text-xl font-bold">{snap.today.orderCount}</p>
              </Card>
              <Card className="p-3">
                <p className="text-[10px] font-bold uppercase text-ink/50">Rata-rata</p>
                <p className="num text-xl font-bold">{formatRupiah(snap.today.avgTicket)}</p>
              </Card>
              <Card className="p-3">
                <p className="text-[10px] font-bold uppercase text-ink/50">Tunai / QRIS / Ojol</p>
                <p className="num text-[11px] font-bold leading-tight">
                  {formatRupiah(snap.today.cash)}
                  <span className="text-ink/50"> · {formatRupiah(snap.today.qris)}</span>
                  <span className="text-ink/50"> · {formatRupiah(snap.today.online)}</span>
                </p>
              </Card>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              {/* Order terbaru */}
              <Card className="p-4">
                <h2 className="mb-2 font-display text-sm font-bold uppercase">🧾 Order Terbaru</h2>
                <div className="divide-y-2 divide-dashed divide-ink/20">
                  {snap.recentOrders.map((o) => (
                    <div key={o.id} className="flex items-center justify-between gap-2 py-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <Badge className={orderTypeColor(o.orderType)}>{orderTypeShort(o.orderType)}</Badge>
                          {o.status !== "COMPLETED" && (
                            <Badge className="bg-danger text-white">{o.status}</Badge>
                          )}
                        </div>
                        <p className="num truncate text-[11px] font-semibold text-ink/50">
                          {o.orderNo} · {formatTime(o.createdAt)} · {o.cashierName}
                        </p>
                      </div>
                      <span
                        className={cn(
                          "num shrink-0 text-sm font-bold",
                          o.status !== "COMPLETED" && "line-through opacity-50"
                        )}
                      >
                        {formatRupiah(o.total)}
                      </span>
                    </div>
                  ))}
                  {snap.recentOrders.length === 0 && (
                    <p className="py-6 text-center text-xs font-bold text-ink/40">
                      Belum ada order hari ini
                    </p>
                  )}
                </div>
              </Card>

              <div className="space-y-4">
                {/* Per channel hari ini */}
                <Card className="p-4">
                  <h2 className="mb-2 font-display text-sm font-bold uppercase">Channel Hari Ini</h2>
                  {snap.today.byChannel.length === 0 ? (
                    <p className="text-xs font-bold text-ink/40">Belum ada data</p>
                  ) : (
                    <div className="space-y-2">
                      {snap.today.byChannel.map((c) => (
                        <div key={c.type} className="flex items-center gap-2">
                          <Badge className={orderTypeColor(c.type)}>{orderTypeShort(c.type)}</Badge>
                          <div className="h-2.5 flex-1 overflow-hidden rounded-full border-2 border-ink bg-cream">
                            <div
                              className="h-full bg-accent"
                              style={{ width: `${Math.max(4, (c.total / maxChannel) * 100)}%` }}
                            />
                          </div>
                          <span className="num w-20 shrink-0 text-right text-[11px] font-bold">
                            {formatRupiah(c.total)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </Card>

                {/* Alert stok */}
                <Card className={cn("p-4", snap.lowStock.length > 0 && "border-danger shadow-neo-danger")}>
                  <h2 className="mb-2 font-display text-sm font-bold uppercase">
                    {snap.lowStock.length > 0 ? "⚠️ Stok Menipis" : "✅ Stok Aman"}
                  </h2>
                  {snap.lowStock.length === 0 ? (
                    <p className="text-xs font-bold text-ink/40">Semua bahan di atas batas minimum</p>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {snap.lowStock.map((i) => (
                        <Badge key={i.id} className="bg-danger text-white">
                          {i.name}: {i.stock} {i.unit} (min {i.minStock})
                        </Badge>
                      ))}
                    </div>
                  )}
                </Card>
              </div>
            </div>

            {/* Omzet per jam hari ini */}
            <Card className="p-4">
              <h2 className="mb-2 font-display text-sm font-bold uppercase">Omzet per Jam</h2>
              <div className="flex h-20 items-end gap-0.5">
                {snap.today.hourly.map((v, h) => (
                  <div
                    key={h}
                    className="flex-1 rounded-t-sm border border-ink bg-teal/70"
                    style={{ height: `${Math.max(3, (v / maxHour) * 100)}%` }}
                    title={`${h}:00 — ${formatRupiah(v)}`}
                  />
                ))}
              </div>
              <div className="mt-1 flex justify-between text-[8px] font-bold text-ink/40">
                <span>0</span><span>6</span><span>12</span><span>18</span><span>23</span>
              </div>
            </Card>
          </>
        )}
      </div>
    </div>
  );
}
