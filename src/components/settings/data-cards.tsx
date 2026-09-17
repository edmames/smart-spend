"use client";

import { formatCalendarDate, calendarDateFromInstant } from "@/domain/calendar";

import { useRef, useState } from "react";
import { Download, RotateCcw, Upload } from "lucide-react";
import { Badge, Button, Card } from "@/components/ui/layout";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useSmartSpendStore } from "@/app/store";
import { buildExportArtifact, parseImportJson, type ImportValidation } from "@/app/backup";

/**
 * Export / import / reset.
 *
 * These are the only places that touch the whole dataset at once, so both go
 * through the same repository + validation pipeline as normal mutations: an import
 * is either fully valid (and replaces the dataset) or rejected in its entirety.
 */

export function ExportCard() {
  const data = useSmartSpendStore((state) => state.data);
  const [message, setMessage] = useState<string | null>(null);

  const totals = {
    wallets: data.wallets.length,
    transactions: data.transactions.length,
    savings: data.savingsTargets.length,
    budgets: data.budgets.length,
  };

  const download = () => {
    const artifact = buildExportArtifact(data);
    const blob = new Blob([artifact.contents], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = artifact.filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    setMessage(`File ${artifact.filename} diunduh.`);
  };

  return (
    <Card as="section" className="flex flex-col gap-2.5">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className="text-[14.5px] font-bold text-ink">Ekspor JSON</h2>
          <p className="text-[12.5px] leading-relaxed text-muted">
            Berisi <code className="rounded bg-canvas px-1">schemaVersion</code>, <code className="rounded bg-canvas px-1">exportedAt</code>, dompet, transaksi,
            tabungan, budget, dan pengaturan aman.
          </p>
        </div>
        <Badge tone="brand">v{data.version}</Badge>
      </div>

      <ul className="grid grid-cols-2 gap-1.5 text-[12.5px] text-muted">
        <li className="flex justify-between rounded-lg bg-canvas px-2.5 py-1.5">
          <span>Dompet</span>
          <strong className="text-ink">{totals.wallets}</strong>
        </li>
        <li className="flex justify-between rounded-lg bg-canvas px-2.5 py-1.5">
          <span>Transaksi</span>
          <strong className="text-ink">{totals.transactions}</strong>
        </li>
        <li className="flex justify-between rounded-lg bg-canvas px-2.5 py-1.5">
          <span>Tabungan</span>
          <strong className="text-ink">{totals.savings}</strong>
        </li>
        <li className="flex justify-between rounded-lg bg-canvas px-2.5 py-1.5">
          <span>Budget</span>
          <strong className="text-ink">{totals.budgets}</strong>
        </li>
      </ul>

      <div className="flex items-center gap-2">
        <Button size="sm" onClick={download}>
          <Download className="h-4 w-4" aria-hidden />
          Unduh cadangan
        </Button>
        {message ? <span className="text-[12px] font-medium text-income">{message}</span> : null}
      </div>
    </Card>
  );
}

export function ImportCard() {
  const data = useSmartSpendStore((state) => state.data);
  const importDataset = useSmartSpendStore((state) => state.importDataset);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [pending, setPending] = useState<{ validation: Extract<ImportValidation, { ok: true }>; filename: string } | null>(null);
  const [error, setError] = useState<{ message: string; issues: { path: string; message: string }[]; filename: string } | null>(null);

  const onPick = async (file: File) => {
    setError(null);
    const text = await file.text();
    const validation = parseImportJson(text);
    if (!validation.ok) {
      setError({ message: validation.message, issues: validation.issues, filename: file.name });
      return;
    }
    setPending({ validation, filename: file.name });
  };

  const confirm = () => {
    if (!pending) return;
    const raw = pending.validation.data;
    const result = importDataset(raw);
    setPending(null);
    if (!result.ok) {
      setError({ message: result.error.message, issues: [], filename: pending.filename });
    }
  };

  return (
    <Card as="section" className="flex flex-col gap-2.5">
      <div>
        <h2 className="text-[14.5px] font-bold text-ink">Impor JSON</h2>
        <p className="text-[12.5px] leading-relaxed text-muted">
          Seluruh file divalidasi (skema + referensi + riwayat saldo). Jika ada satu masalah, impor ditolak total.
          Versi pertama ini bersifat <strong>mengganti</strong> data saat ini.
        </p>
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="application/json,.json"
        className="sr-only"
        aria-label="Pilih file cadangan JSON"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void onPick(file);
          event.target.value = "";
        }}
      />

      <Button size="sm" variant="secondary" onClick={() => fileRef.current?.click()}>
        <Upload className="h-4 w-4" aria-hidden />
        Pilih file
      </Button>

      {error ? (
        <div className="rounded-xl border border-expense/30 bg-expense-soft px-3 py-2">
          <p className="text-[12.5px] font-bold text-expense">Impor {error.filename} ditolak</p>
          <p className="mt-0.5 text-[12px] text-ink/80">{error.message}</p>
          {error.issues.length > 0 ? (
            <ul className="mt-1.5 flex max-h-32 flex-col gap-0.5 overflow-auto text-[11.5px] text-muted">
              {error.issues.map((issue) => (
                <li key={`${issue.path}-${issue.message}`}>
                  <code>{issue.path}</code>: {issue.message}
                </li>
              ))}
            </ul>
          ) : null}
          <button type="button" onClick={() => setError(null)} className="mt-1.5 text-[12px] font-semibold text-expense hover:underline">
            Tutup
          </button>
        </div>
      ) : null}

      <ConfirmDialog
        open={pending !== null}
        title="Pulihkan data dari cadangan?"
        description={
          <>
            <p className="text-[13px] leading-relaxed text-muted">
              Memulihkan backup akan mengganti data SmartSpend yang tersimpan di perangkat ini.
            </p>
            <p className="mt-1.5 text-[12.5px] leading-relaxed text-muted">
              Data saat ini ({data.wallets.length} dompet, {data.transactions.length} transaksi) akan digantikan
              oleh <strong>{pending?.filename}</strong>. Ekspor dulu jika ingin menyimpan kondisi sekarang.
            </p>
            {pending?.validation.preview.exportedAt ? (
              <p className="mt-1.5 text-[12.5px] text-muted">
                Backup dibuat pada {formatCalendarDate(calendarDateFromInstant(new Date(pending.validation.preview.exportedAt)))}
              </p>
            ) : null}
          </>
        }
        confirmLabel="Pulihkan data"
        cancelLabel="Batal"
        tone="danger"
        onConfirm={confirm}
        onClose={() => setPending(null)}
      >
        {pending ? (
          <>
            <ul className="flex flex-col gap-1 rounded-xl bg-canvas px-3 py-2 text-[12.5px]">
              <li className="flex justify-between">
                <span className="text-muted">Dompet</span>
                <strong className="text-ink">{pending.validation.preview.counts.wallets}</strong>
              </li>
              <li className="flex justify-between">
                <span className="text-muted">Transaksi</span>
                <strong className="text-ink">{pending.validation.preview.counts.transactions}</strong>
              </li>
              <li className="flex justify-between">
                <span className="text-muted">Target tabungan</span>
                <strong className="text-ink">{pending.validation.preview.counts.savingsTargets}</strong>
              </li>
              <li className="flex justify-between">
                <span className="text-muted">Kategori</span>
                <strong className="text-ink">{pending.validation.preview.counts.categories}</strong>
              </li>
              <li className="flex justify-between">
                <span className="text-muted">Budget</span>
                <strong className="text-ink">{pending.validation.preview.counts.budgets}</strong>
              </li>
              <li className="flex justify-between">
                <span className="text-muted">Schema</span>
                <strong className="text-ink">v{pending.validation.preview.schemaVersion}</strong>
              </li>
            </ul>
            {pending.validation.preview.firstTransactionDate ? (
              <p className="text-[12px] text-muted">
                Rentang transaksi:{" "}
                {formatCalendarDate(pending.validation.preview.firstTransactionDate)} –{" "}
                {pending.validation.preview.lastTransactionDate
                  ? formatCalendarDate(pending.validation.preview.lastTransactionDate)
                  : "—"}
              </p>
            ) : null}
            {pending.validation.warnings.map((warning) => (
              <p key={warning} className="rounded-lg bg-warning-soft px-2.5 py-1.5 text-[12px] text-warning">
                {warning}
              </p>
            ))}
          </>
        ) : null}
      </ConfirmDialog>
    </Card>
  );
}

export function ResetCard() {
  const data = useSmartSpendStore((state) => state.data);
  const resetAllData = useSmartSpendStore((state) => state.resetAllData);
  const [ask, setAsk] = useState(false);

  return (
    <Card as="section" className="flex flex-col gap-2.5 border-expense/25">
      <div>
        <h2 className="text-[14.5px] font-bold text-ink">Hapus Semua Data</h2>
        <p className="text-[12.5px] leading-relaxed text-muted">
          Menghapus seluruh data keuangan dari perangkat ini dan mengembalikan aplikasi ke kondisi kosong (0 dompet, 0
          transaksi, 0 tabungan, 0 budget). Preferensi akan dikembalikan ke nilai awal. Tidak bisa dibatalkan.
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="danger" onClick={() => setAsk(true)}>
          <RotateCcw className="h-4 w-4" aria-hidden />
          Hapus semua data
        </Button>
        <span className="text-[11.5px] text-muted">
          Semua saldo, ringkasan, dan budget dihitung ulang otomatis setelah reset.
        </span>
      </div>

      <ConfirmDialog
        key={ask ? "reset-open" : "reset-closed"}
        open={ask}
        title="Hapus semua data SmartSpend?"
        description={
          <>
            {data.wallets.length} dompet, {data.transactions.length} transaksi, {data.savingsTargets.length} target
            tabungan, dan {data.budgets.length} budget akan dihapus dari perangkat ini.
          </>
        }
        confirmLabel="Hapus permanen"
        requirePhrase="HAPUS"
        onConfirm={() => {
          void resetAllData();
          setAsk(false);
        }}
        onClose={() => setAsk(false)}
      />
    </Card>
  );
}
