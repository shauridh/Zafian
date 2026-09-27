"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Numpad } from "@/components/ui/Numpad";
import { Sheet } from "@/components/ui/Sheet";
import { Input } from "@/components/ui/Input";
import { useUI } from "@/store/ui";
import {
  getActiveShiftData,
  openShift,
  closeShift,
  recordCashMovement,
  type ActiveShift,
} from "./actions";
import { getShiftReport, type ShiftReportData } from "./report-actions";
import { ShiftReportPaper } from "./ShiftReportPaper";
import {
  formatRupiah,
  formatDateTime,
  differenceLabel,
} from "@/lib/utils";

interface ShiftHistory {
  id: string;
  userName: string;
  openingCash: number;
  closingCashExpected: number | null;
  closingCashActual: number | null;
  difference: number | null;
  openedAt: string;
  closedAt: string | null;
}

interface CashLog {
  id: string;
  type: "IN" | "OUT";
  amount: number;
  note: string | null;
  createdAt: string;
}

export function ShiftClient({
  defaultOpeningCash,
  history,
}: {
  defaultOpeningCash: number;
  history: ShiftHistory[];
}) {
  const router = useRouter();
  const { toast } = useUI();
  const [shift, setShift] = useState<ActiveShift | null>(null);
  const [loading, setLoading] = useState(true);
  const [numpad, setNumpad] = useState<
    | { kind: "closed" }
    | { kind: "opening" }
    | { kind: "cash-in" }
    | { kind: "cash-out" }
    | { kind: "closing" }
  >({ kind: "closed" });
  const [cashNote, setCashNote] = useState("");
  const [cashNoteType, setCashNoteType] = useState<"IN" | "OUT">("IN");
  const [noteOpen, setNoteOpen] = useState(false);
  const [pendingCashAmount, setPendingCashAmount] = useState(0);
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<ShiftReportData | null>(null);
  // Konfirmasi sebelum finalisasi tutup shift: { amount = kas fisik, expected = kas seharusnya }
  const [confirmClose, setConfirmClose] = useState<
    { amount: number; expected: number } | null
  >(null);
  // Alasan selisih (wajib bila kas tidak pas): { amount, expected } saat sheet terbuka
  const [diffNote, setDiffNote] = useState<{ amount: number; expected: number } | null>(null);
  const [diffNoteText, setDiffNoteText] = useState("");

  const load = useCallback(async () => {
    const data = await getActiveShiftData();
    setShift(data);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleOpenShift = async (amount: number) => {
    setBusy(true);
    const res = await openShift(amount);
    setBusy(false);
    if (res.ok) {
      toast("Shift dibuka! Selamat bekerja 🎉", "success");
      load();
      router.refresh();
    } else {
      toast(res.error ?? "Gagal membuka shift", "error");
    }
  };

  const handleCashMovement = async (amount: number, type: "IN" | "OUT") => {
    setCashNoteType(type);
    setPendingCashAmount(amount);
    setCashNote("");
    setNoteOpen(true);
  };

  const submitCashMovement = async () => {
    setBusy(true);
    const res = await recordCashMovement(cashNoteType, pendingCashAmount, cashNote);
    setBusy(false);
    setNoteOpen(false);
    if (res.ok) {
      toast(cashNoteType === "IN" ? "Kas masuk tercatat" : "Kas keluar tercatat", "success");
      load();
    } else {
      toast(res.error ?? "Gagal mencatat kas", "error");
    }
  };

  /** Finalisasi: tutup shift dengan nilai kas fisik yang sudah dikonfirmasi. */
  const finalizeCloseShift = async (amount: number, reason?: string) => {
    setBusy(true);
    // ambil id shift aktif sebelum ditutup untuk laporan
    const current = shift;
    const res = await closeShift(amount, undefined, reason);
    setBusy(false);
    if (res.ok) {
      toast(
        `Shift ditutup — ${differenceLabel(res.difference ?? 0)}`,
        (res.difference ?? 0) === 0 ? "success" : "info"
      );
      setShift(null);
      // muat rekap shift untuk ditawarkan cetak
      if (current) {
        const rep = await getShiftReport(current.id);
        if (rep) setReport(rep);
      }
      router.refresh();
    } else {
      toast(res.error ?? "Gagal menutup shift", "error");
    }
  };

  return (
    <div className="min-h-dvh">
      <PageHeader title="Shift" subtitle="Kelola shift & kas harian" />

      <div className="mx-auto max-w-2xl space-y-4 px-4 py-4">
        {loading ? (
          <p className="text-center text-sm font-bold text-ink/40">Memuat…</p>
        ) : shift ? (
          <>
            {/* Shift aktif */}
            <Card className="overflow-hidden">
              <div className="border-b-[2.5px] border-ink bg-sun px-4 py-3">
                <p className="text-[10px] font-bold uppercase tracking-wide text-ink/60">
                  Shift Aktif · {shift.userName}
                </p>
                <p className="text-sm font-bold">Dibuka {formatDateTime(shift.openedAt)}</p>
              </div>
              <div className="grid grid-cols-2 gap-px border-b-[2.5px] border-ink bg-ink/10">
                <Stat label="Modal Awal" value={formatRupiah(shift.openingCash)} />
                <Stat label="Penjualan Tunai" value={formatRupiah(shift.cashSales)} />
                <Stat label="Kas Masuk" value={formatRupiah(shift.cashIn)} accent="text-gofood" />
                <Stat label="Kas Keluar" value={formatRupiah(shift.cashOut)} accent="text-danger" />
                <Stat label="Total Penjualan" value={formatRupiah(shift.totalSales)} />
                <Stat label="Jumlah Order" value={`${shift.orderCount} order`} />
              </div>
              <div className="flex items-center justify-between bg-cream px-4 py-3">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wide text-ink/50">
                    Kas Seharusnya
                  </p>
                  <p className="num text-2xl font-bold">{formatRupiah(shift.expectedCash)}</p>
                </div>
              </div>
            </Card>

            <div className="grid grid-cols-3 gap-2">
              <Button variant="lime" onClick={() => setNumpad({ kind: "cash-in" })}>
                ⬇️ Kas Masuk
              </Button>
              <Button variant="danger" onClick={() => setNumpad({ kind: "cash-out" })}>
                ⬆️ Kas Keluar
              </Button>
              <Button variant="dark" onClick={() => setNumpad({ kind: "closing" })}>
                🔒 Tutup
              </Button>
            </div>
          </>
        ) : (
          <Card className="p-6 text-center">
            <span className="mb-2 block text-4xl">⏱️</span>
            <p className="font-display text-lg font-bold">Belum ada shift aktif</p>
            <p className="mb-4 text-sm font-semibold text-ink/50">
              Buka shift untuk mulai mencatat transaksi (default {formatRupiah(defaultOpeningCash)})
            </p>
            <Button onClick={() => setNumpad({ kind: "opening" })}>Buka Shift</Button>
          </Card>
        )}

        {/* Riwayat */}
        {history.length > 0 && (
          <div>
            <h2 className="mb-2 font-display text-sm font-bold uppercase tracking-wide text-ink/60">
              Riwayat Shift
            </h2>
            <div className="space-y-2">
              {history.map((s) => (
                <Card key={s.id} className="flex items-center justify-between px-4 py-3">
                  <div>
                    <p className="text-sm font-bold">{formatDateTime(s.openedAt)}</p>
                    <p className="text-xs font-semibold text-ink/50">
                      {s.userName} · Modal {formatRupiah(s.openingCash)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="num text-sm font-bold">{formatRupiah(s.closingCashActual ?? 0)}</p>
                    <p
                      className={`text-xs font-bold ${
                        (s.difference ?? 0) === 0 ? "text-gofood" : "text-danger"
                      }`}
                    >
                      {differenceLabel(s.difference)}
                    </p>
                  </div>
                </Card>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Numpads */}
      <Numpad
        open={numpad.kind === "opening"}
        onClose={() => setNumpad({ kind: "closed" })}
        title="Buka Shift"
        subtitle="Modal awal kas"
        quickAmounts={[defaultOpeningCash, 500000, 1000000]}
        confirmLabel="Buka Shift"
        onSubmit={(v) => {
          setNumpad({ kind: "closed" });
          handleOpenShift(v);
        }}
      />

      <Numpad
        open={numpad.kind === "cash-in"}
        onClose={() => setNumpad({ kind: "closed" })}
        title="Kas Masuk"
        subtitle="Uang masuk non-penjualan"
        confirmLabel="Lanjut"
        onSubmit={(v) => {
          setNumpad({ kind: "closed" });
          handleCashMovement(v, "IN");
        }}
      />

      <Numpad
        open={numpad.kind === "cash-out"}
        onClose={() => setNumpad({ kind: "closed" })}
        title="Kas Keluar"
        subtitle="Uang keluar dari kas (beli bahan, dsb.)"
        confirmLabel="Lanjut"
        onSubmit={(v) => {
          setNumpad({ kind: "closed" });
          handleCashMovement(v, "OUT");
        }}
      />

      <Numpad
        open={numpad.kind === "closing"}
        onClose={() => setNumpad({ kind: "closed" })}
        title="Tutup Shift"
        subtitle={
          shift
            ? `Kas seharusnya: ${formatRupiah(shift.expectedCash)}`
            : undefined
        }
        confirmLabel="Hitung Selisih"
        onSubmit={(v) => {
          setNumpad({ kind: "closed" });
          // Jangan langsung tutup — tampilkan dialog konfirmasi dulu
          setConfirmClose({ amount: v, expected: shift?.expectedCash ?? 0 });
        }}
      />

      {/* Konfirmasi tutup shift: kas benar / edit kas akhir */}
      <Sheet
        open={!!confirmClose}
        onClose={() => setConfirmClose(null)}
        title="Konfirmasi Tutup Shift"
        maxWidth="max-w-sm"
      >
        {confirmClose && (
          <div className="space-y-3">
            <p className="text-center text-xs font-semibold text-ink/60">
              Apakah hitungan kas sudah benar?
            </p>
            <div className="space-y-px overflow-hidden rounded-xl border-[2.5px] border-ink bg-ink/10">
              <div className="flex items-center justify-between bg-white px-4 py-2.5">
                <span className="text-xs font-bold uppercase text-ink/50">Kas seharusnya</span>
                <span className="num text-sm font-bold">
                  {formatRupiah(confirmClose.expected)}
                </span>
              </div>
              <div className="flex items-center justify-between bg-white px-4 py-2.5">
                <span className="text-xs font-bold uppercase text-ink/50">Kas fisik</span>
                <span className="num text-sm font-bold">
                  {formatRupiah(confirmClose.amount)}
                </span>
              </div>
              <div
                className={`flex items-center justify-between px-4 py-2.5 ${
                  confirmClose.amount - confirmClose.expected === 0 ? "bg-lime" : "bg-sun"
                }`}
              >
                <span className="text-xs font-bold uppercase">Selisih</span>
                <span className="num text-sm font-bold">
                  {differenceLabel(confirmClose.amount - confirmClose.expected)}
                </span>
              </div>
            </div>
            <Button
              variant="lime"
              className="w-full"
              disabled={busy}
              onClick={() => {
                const amount = confirmClose.amount;
                const expected = confirmClose.expected;
                setConfirmClose(null);
                if (amount - expected !== 0) {
                  // Kas tidak pas → wajib isi alasan selisih dulu
                  setDiffNoteText("");
                  setDiffNote({ amount, expected });
                } else {
                  finalizeCloseShift(amount);
                }
              }}
            >
              ✅ Ya, benar — Tutup Shift
            </Button>
            <Button
              variant="dark"
              className="w-full"
              disabled={busy}
              onClick={() => {
                setConfirmClose(null);
                setNumpad({ kind: "closing" }); // kembali ke numpad untuk edit kas akhir
              }}
            >
              ✏️ Edit Kas Akhir
            </Button>
            <Button
              variant="ghost"
              className="w-full"
              disabled={busy}
              onClick={() => setConfirmClose(null)}
            >
              Batal
            </Button>
          </div>
        )}
      </Sheet>

      {/* Rekap shift — muncul setelah tutup shift, bisa dicetak */}
      <Sheet
        open={!!report}
        onClose={() => setReport(null)}
        title="Rekap Shift"
        maxWidth="max-w-xs"
      >
        {report && (
          <>
            <div className="mb-2 flex justify-center">
              <button
                onClick={() => window.print()}
                title="Cetak rekap"
                className="flex h-10 w-10 items-center justify-center rounded-lg border-[2.5px] border-ink bg-ink text-lg text-white shadow-neo-sm active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
              >
                🖨️
              </button>
            </div>
            <div className="print-area max-h-[55dvh] overflow-y-auto rounded-xl bg-cream p-2">
              <ShiftReportPaper data={report} />
            </div>
          </>
        )}
      </Sheet>

      {/* Alasan selisih — wajib bila kas fisik tidak pas saat tutup shift */}
      <Sheet
        open={!!diffNote}
        onClose={() => setDiffNote(null)}
        title="Alasan Selisih"
        maxWidth="max-w-sm"
      >
        {diffNote && (
          <div className="space-y-3">
            <div className="flex items-center justify-between rounded-xl border-[2.5px] border-ink bg-sun px-4 py-3">
              <span className="text-xs font-bold uppercase">Selisih</span>
              <span className="num text-sm font-bold">
                {differenceLabel(diffNote.amount - diffNote.expected)}
              </span>
            </div>
            <p className="text-xs font-semibold text-ink/60">
              Kas tidak pas — jelaskan penyebabnya (mis. kembalian kurang, uang pecahan
              rusak, salah hitung). Alasan tersimpan di log audit dan tercetak di rekap shift.
            </p>
            <Input
              label="Alasan selisih (wajib)"
              value={diffNoteText}
              onChange={(e) => setDiffNoteText(e.target.value)}
              placeholder="mis. kembalian kurang Rp 5.000"
              autoFocus
            />
            <Button
              variant="lime"
              className="w-full"
              disabled={busy || !diffNoteText.trim()}
              onClick={() => {
                const amount = diffNote.amount;
                const reason = diffNoteText.trim();
                setDiffNote(null);
                finalizeCloseShift(amount, reason);
              }}
            >
              Tutup Shift
            </Button>
            <Button
              variant="ghost"
              className="w-full"
              disabled={busy}
              onClick={() => setDiffNote(null)}
            >
              Batal
            </Button>
          </div>
        )}
      </Sheet>

      {/* Input keterangan kas */}
      <Sheet open={noteOpen} onClose={() => setNoteOpen(false)} title={cashNoteType === "IN" ? "Kas Masuk" : "Kas Keluar"} maxWidth="max-w-sm">
        <p className="mb-3 text-center">
          <span className="block text-xs font-bold uppercase text-ink/50">Nominal</span>
          <span className="num text-2xl font-bold">{formatRupiah(pendingCashAmount)}</span>
        </p>
        <Input
          label="Keterangan (wajib)"
          value={cashNote}
          onChange={(e) => setCashNote(e.target.value)}
          placeholder="mis. beli susu, setor ke bos…"
          autoFocus
        />
        <Button className="mt-3 w-full" disabled={!cashNote.trim() || busy} onClick={submitCashMovement}>
          Simpan
        </Button>
      </Sheet>
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="bg-white px-4 py-2.5">
      <p className="text-[10px] font-bold uppercase tracking-wide text-ink/50">{label}</p>
      <p className={`num text-sm font-bold ${accent ?? ""}`}>{value}</p>
    </div>
  );
}
