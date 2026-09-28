"use client";

import { useMemo, useState } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { formatRupiah, formatNumber, formatDay, orderTypeShort, orderTypeColor, cn } from "@/lib/utils";

interface OrderLite {
  id: string;
  orderNo: string;
  orderType: string;
  paymentMethod: string;
  status: string;
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  costTotal: number;
  refundAmount: number;
  createdAt: string;
  items: { name: string; qty: number; price: number; discount: number }[];
}

interface UsageLite {
  name: string;
  unit: string;
  type: string;
  qty: number;
  createdAt: string;
}

const PERIODS = [
  { value: 1, label: "Hari Ini" },
  { value: 7, label: "7 Hari" },
  { value: 30, label: "30 Hari" },
  { value: 90, label: "90 Hari" },
];

function pctChange(current: number, previous: number): number | null {
  if (previous === 0) return current > 0 ? 100 : null;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

function Delta({ current, previous }: { current: number; previous: number }) {
  const pct = pctChange(current, previous);
  if (pct === null) return <span className="text-[10px] font-bold text-ink/30">—</span>;
  const up = pct >= 0;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 rounded-md border-[1.5px] border-ink px-1.5 py-0.5 text-[10px] font-bold",
        up ? "bg-lime" : "bg-danger text-white"
      )}
      title={`Periode sebelumnya: ${formatRupiah(previous)}`}
    >
      {up ? "▲" : "▼"} {Math.abs(pct)}%
    </span>
  );
}

export function ReportsClient({
  orders,
  ingredientUsage,
  ingredients,
}: {
  orders: OrderLite[];
  ingredientUsage: UsageLite[];
  ingredients: { name: string; unit: string; stock: number; minStock: number }[];
}) {
  const [days, setDays] = useState(7);
  const [channelFilter, setChannelFilter] = useState("ALL");
  const [paymentFilter, setPaymentFilter] = useState("ALL");

  const data = useMemo(() => {
    const now = new Date();
    const curStart = new Date(now);
    curStart.setDate(curStart.getDate() - days);
    curStart.setHours(0, 0, 0, 0);
    const prevStart = new Date(curStart);
    prevStart.setDate(prevStart.getDate() - days);

    const matchFilters = (o: OrderLite) =>
      (channelFilter === "ALL" || o.orderType === channelFilter) &&
      (paymentFilter === "ALL" || o.paymentMethod === paymentFilter);

    const cur = orders.filter((o) => new Date(o.createdAt) >= curStart && matchFilters(o));
    const prev = orders.filter(
      (o) => new Date(o.createdAt) >= prevStart && new Date(o.createdAt) < curStart && matchFilters(o)
    );

    const net = (list: OrderLite[]) =>
      list.reduce((s, o) => s + (o.status === "COMPLETED" ? o.total - o.refundAmount : 0), 0);
    const cost = (list: OrderLite[]) =>
      list.reduce((s, o) => s + (o.status === "COMPLETED" ? o.costTotal : 0), 0);
    const count = (list: OrderLite[]) => list.filter((o) => o.status === "COMPLETED").length;

    const revenue = net(cur);
    const prevRevenue = net(prev);
    const grossProfit = revenue - cost(cur);
    const prevGrossProfit = prevRevenue - cost(prev);
    const trxCount = count(cur);
    const prevTrxCount = count(prev);
    const avg = trxCount ? Math.round(revenue / trxCount) : 0;
    const prevAvg = prevTrxCount ? Math.round(prevRevenue / prevTrxCount) : 0;
    const totalDiscount = cur.reduce((s, o) => s + (o.status === "COMPLETED" ? o.discount : 0), 0);
    const totalRefund = cur.reduce((s, o) => s + (o.status !== "COMPLETED" ? o.refundAmount || o.total : 0), 0);

    // Per channel
    const byChannel = new Map<string, { count: number; total: number; prevTotal: number }>();
    for (const o of cur) {
      if (o.status !== "COMPLETED") continue;
      const c = byChannel.get(o.orderType) ?? { count: 0, total: 0, prevTotal: 0 };
      c.count += 1;
      c.total += o.total - o.refundAmount;
      byChannel.set(o.orderType, c);
    }
    for (const o of prev) {
      if (o.status !== "COMPLETED") continue;
      const c = byChannel.get(o.orderType) ?? { count: 0, total: 0, prevTotal: 0 };
      c.prevTotal += o.total - o.refundAmount;
      byChannel.set(o.orderType, c);
    }

    // Per pembayaran
    const byPayment = new Map<string, number>();
    for (const o of cur) {
      if (o.status !== "COMPLETED") continue;
      byPayment.set(o.paymentMethod, (byPayment.get(o.paymentMethod) ?? 0) + (o.total - o.refundAmount));
    }

    // Grafik harian (net sales per hari)
    const dailyMap = new Map<string, number>();
    for (let d = 0; d < days; d++) {
      const day = new Date(now);
      day.setDate(day.getDate() - d);
      dailyMap.set(formatDay(day), 0);
    }
    for (const o of cur) {
      if (o.status !== "COMPLETED") continue;
      const key = formatDay(new Date(o.createdAt));
      if (dailyMap.has(key)) dailyMap.set(key, (dailyMap.get(key) ?? 0) + (o.total - o.refundAmount));
    }
    const daily = [...dailyMap.entries()].reverse();

    // Top menu (qty & omzet)
    const topMap = new Map<string, { qty: number; revenue: number }>();
    for (const o of cur) {
      if (o.status !== "COMPLETED") continue;
      for (const i of o.items) {
        const t = topMap.get(i.name) ?? { qty: 0, revenue: 0 };
        t.qty += i.qty;
        t.revenue += i.price * i.qty - i.discount * i.qty;
        topMap.set(i.name, t);
      }
    }
    const topItems = [...topMap.entries()]
      .map(([name, v]) => ({ name, ...v }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 8);

    // Jam sibuk (0-23)
    const hourMap = new Array(24).fill(0) as number[];
    for (const o of cur) {
      if (o.status !== "COMPLETED") continue;
      hourMap[new Date(o.createdAt).getHours()] += o.total - o.refundAmount;
    }
    const maxHour = Math.max(1, ...hourMap);

    // Pemakaian bahan per tipe: IN (belanja), SALE (terpakai), ADJUSTMENT (opname), WASTE, VOID
    const ingMap = new Map<
      string,
      { unit: string; bought: number; used: number; adjusted: number; wasted: number }
    >();
    const bump = (name: string, unit: string, type: string, qty: number) => {
      const e = ingMap.get(name) ?? { unit, bought: 0, used: 0, adjusted: 0, wasted: 0 };
      if (type === "IN") e.bought += qty;
      else if (type === "SALE") e.used += Math.abs(qty);
      else if (type === "ADJUSTMENT") e.adjusted += qty;
      else if (type === "WASTE" || type === "VOID") e.wasted += Math.abs(qty);
      ingMap.set(name, e);
    };
    for (const u of ingredientUsage) {
      if (new Date(u.createdAt) < curStart) continue;
      bump(u.name, u.unit, u.type, u.qty);
    }
    const ingUsage = [...ingMap.entries()]
      .map(([name, v]) => ({ name, ...v }))
      .sort((a, b) => b.used - a.used);

    const usage = ingUsage.map((e) => ({
      name: e.name,
      unit: e.unit,
      bought: e.bought,
      used: e.used,
      adjusted: e.adjusted,
      wasted: e.wasted,
    }));

    return {
      revenue, prevRevenue, grossProfit, prevGrossProfit, trxCount, prevTrxCount,
      avg, prevAvg, totalDiscount, totalRefund,
      byChannel: [...byChannel.entries()].sort((a, b) => b[1].total - a[1].total),
      byPayment, daily, topItems, hourMap, maxHour, usage,
      completed: cur.filter((o) => o.status === "COMPLETED"),
    };
  }, [orders, ingredientUsage, days, channelFilter, paymentFilter]);

  const maxDaily = Math.max(1, ...data.daily.map(([, v]) => v));
  const maxChannel = Math.max(1, ...data.byChannel.map(([, v]) => v.total));

  const exportCSV = () => {
    const rows: (string | number)[][] = [
      ["No Order", "Tanggal", "Channel", "Pembayaran", "Status", "Subtotal", "Diskon", "PPN", "Total", "Refund", "Net", "HPP", "Laba"],
      ...data.completed.map((o) => [
        o.orderNo,
        new Date(o.createdAt).toLocaleString("id-ID"),
        o.orderType,
        o.paymentMethod,
        o.status,
        String(o.subtotal),
        String(o.discount),
        String(o.tax),
        String(o.total),
        String(o.refundAmount),
        String(o.total - o.refundAmount),
        String(o.costTotal),
        String(o.total - o.costTotal),
      ]),
      ["Bahan", "Satuan", "Belanja", "Terpakai", "Opname", "Rusak", "Sisa Stok"],
      ...data.usage.map((u) => [
        u.name,
        u.unit,
        String(Math.round(u.bought * 100) / 100),
        String(Math.round(u.used * 100) / 100),
        String(Math.round(u.adjusted * 100) / 100),
        String(Math.round(u.wasted * 100) / 100),
        String(
          Math.round((ingredients.find((i) => i.name === u.name)?.stock ?? 0) * 100) / 100
        ),
      ]),
    ];
    const csv = rows.map((r) => r.map((c) => `"${String(c)}"`).join(";")).join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `laporan-${days}hari.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div className="min-h-dvh">
      <PageHeader
        title="Laporan"
        subtitle="Analisa penjualan, laba & pemakaian bahan"
        right={
          <Button size="sm" variant="lime" onClick={exportCSV}>
            ⬇️ CSV
          </Button>
        }
      />

      <div className="mx-auto max-w-4xl space-y-4 px-4 py-4">
        {/* Periode */}
        <div className="flex gap-1.5 overflow-x-auto pb-1">
          {PERIODS.map((p) => (
            <button
              key={p.value}
              onClick={() => setDays(p.value)}
              className={cn(
                "shrink-0 rounded-lg border-2 border-ink px-3 py-1.5 text-xs font-bold uppercase shadow-neo-sm transition-all active:translate-x-[1px] active:translate-y-[1px] active:shadow-none",
                days === p.value ? "bg-ink text-white" : "bg-white text-ink/60"
              )}
            >
              {p.label}
            </button>
          ))}
        </div>

        {/* Filter channel & pembayaran */}
        <div className="grid grid-cols-2 gap-2">
          <select
            value={channelFilter}
            onChange={(e) => setChannelFilter(e.target.value)}
            className="rounded-lg border-[2.5px] border-ink bg-white px-3 py-2.5 text-sm font-bold"
          >
            <option value="ALL">Semua Channel</option>
            {["DINE_IN", "TAKE_AWAY", "GOFOOD", "GRABFOOD", "SHOPEEFOOD"].map((t) => (
              <option key={t} value={t}>{orderTypeShort(t)}</option>
            ))}
          </select>
          <select
            value={paymentFilter}
            onChange={(e) => setPaymentFilter(e.target.value)}
            className="rounded-lg border-[2.5px] border-ink bg-white px-3 py-2.5 text-sm font-bold"
          >
            <option value="ALL">Semua Pembayaran</option>
            <option value="CASH">Tunai</option>
            <option value="QRIS">QRIS</option>
            <option value="ONLINE_PLATFORM">Ojol</option>
          </select>
        </div>

        {/* KPI utama dengan % vs periode sebelumnya */}
        <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
          <Card className="p-3">
            <p className="text-[10px] font-bold uppercase text-ink/50">Omzet Net</p>
            <p className="num text-lg font-bold">{formatRupiah(data.revenue)}</p>
            <Delta current={data.revenue} previous={data.prevRevenue} />
          </Card>
          <Card className="p-3">
            <p className="text-[10px] font-bold uppercase text-ink/50">Laba Kotor</p>
            <p className="num text-lg font-bold text-gofood">{formatRupiah(data.grossProfit)}</p>
            <Delta current={data.grossProfit} previous={data.prevGrossProfit} />
          </Card>
          <Card className="p-3">
            <p className="text-[10px] font-bold uppercase text-ink/50">Transaksi</p>
            <p className="num text-lg font-bold">{data.trxCount}</p>
            <Delta current={data.trxCount} previous={data.prevTrxCount} />
          </Card>
          <Card className="p-3">
            <p className="text-[10px] font-bold uppercase text-ink/50">Rata-rata/Trx</p>
            <p className="num text-lg font-bold">{formatRupiah(data.avg)}</p>
            <Delta current={data.avg} previous={data.prevAvg} />
          </Card>
        </div>

        {/* KPI sekunder */}
        <div className="grid grid-cols-2 gap-2.5">
          <Card className="p-3">
            <p className="text-[10px] font-bold uppercase text-ink/50">Total Diskon Diberikan</p>
            <p className="num text-base font-bold text-candy">{formatRupiah(data.totalDiscount)}</p>
          </Card>
          <Card className="p-3">
            <p className="text-[10px] font-bold uppercase text-ink/50">Total Refund/Void</p>
            <p className="num text-base font-bold text-danger">{formatRupiah(data.totalRefund)}</p>
          </Card>
        </div>

        {/* Grafik harian */}
        <Card className="p-4">
          <h2 className="mb-3 font-display text-sm font-bold uppercase tracking-wide">
            📈 Omzet Harian ({days} hari)
          </h2>
          {data.daily.every(([, v]) => v === 0) ? (
            <p className="text-xs font-bold text-ink/40">Belum ada data</p>
          ) : (
            <div className="flex h-32 items-stretch gap-1">
              {data.daily.map(([day, v]) => (
                <div
                  key={day}
                  className="group flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-0.5"
                  title={`${day}: ${formatRupiah(v)}`}
                >
                  <span
                    className={cn(
                      "num text-[8px] font-bold transition-opacity",
                      v > 0 ? "opacity-70" : "opacity-0"
                    )}
                  >
                    {v > 0 ? formatNumber(Math.round(v / 1000)) + "rb" : ""}
                  </span>
                  <div
                    className="w-full shrink-0 rounded-t-md border-2 border-ink bg-sun"
                    style={{ height: `${Math.max(4, (v / maxDaily) * 70)}%` }}
                  />
                  <span className="shrink-0 text-[8px] font-bold text-ink/40">{day.split("/")[0]}</span>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Per channel */}
        <Card className="p-4">
          <h2 className="mb-3 font-display text-sm font-bold uppercase tracking-wide">Penjualan per Channel</h2>
          {data.byChannel.length === 0 ? (
            <p className="text-xs font-bold text-ink/40">Belum ada data</p>
          ) : (
            <div className="space-y-2.5">
              {data.byChannel.map(([type, v]) => (
                <div key={type}>
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <Badge className={orderTypeColor(type)}>{orderTypeShort(type)}</Badge>
                    <div className="flex items-center gap-1.5">
                      <span className="num text-xs font-bold">
                        {formatRupiah(v.total)} · {v.count} trx
                      </span>
                      <Delta current={v.total} previous={v.prevTotal} />
                    </div>
                  </div>
                  <div className="h-3 w-full overflow-hidden rounded-full border-2 border-ink bg-cream">
                    <div
                      className="h-full bg-sun"
                      style={{ width: `${Math.max(4, (v.total / maxChannel) * 100)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Metode pembayaran */}
        <Card className="p-4">
          <h2 className="mb-2 font-display text-sm font-bold uppercase tracking-wide">Metode Pembayaran</h2>
          <div className="grid grid-cols-3 gap-2">
            {["CASH", "QRIS", "ONLINE_PLATFORM"].map((m) => (
              <div key={m} className="rounded-xl border-2 border-ink bg-cream px-3 py-2 text-center">
                <p className="text-[10px] font-bold uppercase text-ink/50">
                  {m === "CASH" ? "Tunai" : m === "QRIS" ? "QRIS" : "Ojol"}
                </p>
                <p className="num text-sm font-bold">{formatRupiah(data.byPayment.get(m) ?? 0)}</p>
              </div>
            ))}
          </div>
        </Card>

        {/* Top menu */}
        <Card className="p-4">
          <h2 className="mb-3 font-display text-sm font-bold uppercase tracking-wide">🏆 Menu Terlaris</h2>
          {data.topItems.length === 0 ? (
            <p className="text-xs font-bold text-ink/40">Belum ada data</p>
          ) : (
            <div className="space-y-2">
              {data.topItems.map((t, i) => (
                <div key={t.name} className="flex items-center gap-2">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border-2 border-ink bg-sun text-xs font-bold">
                    {i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-xs font-bold">{t.name}</p>
                      <p className="num shrink-0 text-xs font-bold">{formatRupiah(t.revenue)}</p>
                    </div>
                    <div className="mt-0.5 h-2 w-full overflow-hidden rounded-full border border-ink/30 bg-cream">
                      <div
                        className="h-full bg-teal"
                        style={{ width: `${Math.max(3, (t.revenue / data.topItems[0].revenue) * 100)}%` }}
                      />
                    </div>
                  </div>
                  <span className="num shrink-0 text-[10px] font-bold text-ink/50">{t.qty}x</span>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Jam sibuk */}
        <Card className="p-4">
          <h2 className="mb-3 font-display text-sm font-bold uppercase tracking-wide">🕐 Omzet per Jam</h2>
          <div className="flex h-20 items-end gap-0.5">
            {data.hourMap.map((v, h) => (
              <div
                key={h}
                className="flex-1 rounded-t-sm border border-ink bg-candy/80"
                style={{ height: `${Math.max(3, (v / data.maxHour) * 100)}%` }}
                title={`${h}:00 — ${formatRupiah(v)}`}
              />
            ))}
          </div>
          <div className="mt-1 flex justify-between text-[8px] font-bold text-ink/40">
            <span>0</span><span>6</span><span>12</span><span>18</span><span>23</span>
          </div>
        </Card>        {/* Pemakaian bahan */}
        <Card className="p-4">
          <h2 className="mb-2 font-display text-sm font-bold uppercase tracking-wide">
            🧪 Pemakaian Bahan (resep) · Belanja · Opname · Rusak
          </h2>
          {data.usage.length === 0 ? (
            <p className="text-xs font-bold text-ink/40">Belum ada pemakaian</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b-2 border-ink text-[10px] font-bold uppercase tracking-wide text-ink/60">
                    <th className="py-1.5 pr-2">Bahan</th>
                    <th className="py-1.5 pr-2 text-right">🛒 Belanja</th>
                    <th className="py-1.5 pr-2 text-right">🔥 Terpakai</th>
                    <th className="py-1.5 pr-2 text-right">⚖️ Opname</th>
                    <th className="py-1.5 pr-2 text-right">🗑️ Rusak</th>
                    <th className="py-1.5 text-right">📦 Sisa Stok</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-dashed divide-ink/20">
                  {data.usage.map((u) => {
                    const stock = ingredients.find((i) => i.name === u.name);
                    return (
                      <tr key={u.name} className="font-bold">
                        <td className="py-1.5 pr-2">{u.name}</td>
                        <td className="num py-1.5 pr-2 text-right text-lime-700">
                          +{formatNumber(Math.round(u.bought * 100) / 100)}
                        </td>
                        <td className="num py-1.5 pr-2 text-right">{formatNumber(Math.round(u.used * 100) / 100)} {u.unit}</td>
                        <td className="num py-1.5 pr-2 text-right text-sun-700">
                          {u.adjusted !== 0 ? `${u.adjusted > 0 ? "+" : ""}${formatNumber(Math.round(u.adjusted * 100) / 100)}` : "—"}
                        </td>
                        <td className="num py-1.5 pr-2 text-right text-danger">
                          {u.wasted !== 0 ? `−${formatNumber(Math.round(u.wasted * 100) / 100)}` : "—"}
                        </td>
                        <td className="num py-1.5 text-right">
                          {stock ? `${formatNumber(Math.round(stock.stock * 100) / 100)} ${u.unit}` : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}</Card>

        {/* Stok menipis */}
        {ingredients.some((i) => i.stock <= i.minStock) && (
          <Card className="border-danger p-4 shadow-neo-danger">
            <h2 className="mb-2 font-display text-sm font-bold uppercase text-danger">
              ⚠️ Bahan Perlu Restock
            </h2>
            <div className="flex flex-wrap gap-1.5">
              {ingredients
                .filter((i) => i.stock <= i.minStock)
                .map((i) => (
                  <Badge key={i.name} className="bg-danger text-white">
                    {i.name}: {formatNumber(i.stock)} {i.unit}
                  </Badge>
                ))}
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
