"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { FileText, Folder, Lock, RefreshCw, Wand2 } from "lucide-react";
import { formatBytes } from "@/lib/nasDisplay";
import { describeStudioError, StudioError, type StudioErrorInfo } from "@/lib/studio/errors";
import { makeDocxOutput } from "@/lib/studio/output";
import { countPdfPages, pdfToWord, type PdfToWordProgress } from "@/lib/studio/pdfToWord";
import { isPdfPasswordError } from "@/lib/studio/pdfjs";
import StudioAlert from "./StudioAlert";
import StudioProgress from "./StudioProgress";
import type { StudioPanelProps } from "./types";

export default function PdfToWordPanel({
  incomingFile,
  onIncomingFileHandled,
  onCommit,
  onSuccess,
  onOpenStoragePicker,
}: StudioPanelProps) {
  const fileRef = useRef<HTMLInputElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [pageCount, setPageCount] = useState<number | null>(null);
  const [password, setPassword] = useState("");
  const [needsPassword, setNeedsPassword] = useState(false);
  const [progress, setProgress] = useState<PdfToWordProgress | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<StudioErrorInfo | null>(null);

  // Baca jumlah halaman begitu berkas masuk, supaya pengguna tahu besar
  // pekerjaannya sebelum menekan tombol ubah.
  const inspect = useCallback(async (target: File, secret?: string) => {
    setBusy(true);
    setError(null);
    setPageCount(null);
    try {
      const total = await countPdfPages(target, secret);
      setPageCount(total);
      setNeedsPassword(false);
    } catch (err) {
      setError(describeStudioError(err));
      setNeedsPassword(isPdfPasswordError(err));
    } finally {
      setBusy(false);
    }
  }, []);

  const acceptFile = useCallback(
    (next: File) => {
      const isPdf = next.type === "application/pdf" || next.name.toLowerCase().endsWith(".pdf");
      if (!isPdf) {
        setFile(null);
        setPageCount(null);
        setError(
          describeStudioError(
            new StudioError("PDF_INVALID", "Berkas ini bukan PDF.", "Pilih berkas berekstensi .pdf.")
          )
        );
        return;
      }

      setFile(next);
      setPassword("");
      void inspect(next);
    },
    [inspect]
  );

  // Berkas dari Storage Picker baru diketahui setelah pengguna memilih, jadi
  // nilainya memang baru bisa dibaca di dalam efek — bukan hasil turunan render.
  useEffect(() => {
    if (!incomingFile) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    acceptFile(incomingFile);
    onIncomingFileHandled();
  }, [incomingFile, acceptFile, onIncomingFileHandled]);

  const handleConvert = async () => {
    if (!file || pageCount === null) return;

    setBusy(true);
    setError(null);
    setProgress({ page: 1, total: pageCount });

    try {
      const result = await pdfToWord(file, {
        password: password || undefined,
        onProgress: setProgress,
      });

      const base = file.name.replace(/\.[^/.]+$/, "");
      const commit = await onCommit(makeDocxOutput(result.blob, `${base}.docx`));

      if (commit.saved) {
        onSuccess(describeResult(result.textPages, result.imagePages, result.pages));
      }
    } catch (err) {
      setError(describeStudioError(err));
      setNeedsPassword(isPdfPasswordError(err));
    } finally {
      setProgress(null);
      setBusy(false);
    }
  };

  const reset = () => {
    setFile(null);
    setPageCount(null);
    setPassword("");
    setNeedsPassword(false);
    setProgress(null);
    setError(null);
  };

  const percent = progress ? Math.round((progress.page / Math.max(1, progress.total)) * 100) : 0;

  return (
    <div className="space-y-4">
      <input
        type="file"
        ref={fileRef}
        accept="application/pdf,.pdf"
        className="hidden"
        onChange={(event) => {
          const picked = event.target.files?.[0];
          if (picked) acceptFile(picked);
          event.target.value = "";
        }}
      />

      {error && <StudioAlert error={error} onDismiss={() => setError(null)} />}

      {progress && (
        <StudioProgress
          label="Mengubah PDF…"
          percent={percent}
          detail={`Halaman ${progress.page} dari ${progress.total}. Jangan tutup tab ini.`}
        />
      )}

      {!file && (
        <div className="rounded-xl border-2 border-dashed border-line-strong bg-surface-2 px-4 py-8 text-center">
          <FileText className="mx-auto mb-2 h-9 w-9 text-[var(--tile-purple-fg)]" aria-hidden />
          <p className="text-[13px] font-semibold text-fg">Pilih berkas PDF yang ingin dijadikan Word</p>
          <p className="mx-auto mt-1 max-w-sm text-[12px] leading-relaxed text-subtle">
            Teks diekstrak menjadi paragraf yang bisa diedit. Halaman hasil pindai dimasukkan sebagai
            gambar agar isinya tidak hilang.
          </p>
          <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
            <button
              disabled={busy}
              onClick={() => fileRef.current?.click()}
              className="btn btn-primary"
            >
              Pilih dari perangkat
            </button>
            <button
              disabled={busy}
              onClick={() => onOpenStoragePicker("pdf2word")}
              className="btn btn-secondary"
            >
              <Folder className="h-4 w-4" aria-hidden />
              Pilih dari berkas tersimpan
            </button>
          </div>
        </div>
      )}

      {file && (
        <>
          <div className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-line bg-surface-2 px-3.5 py-3">
            <div className="min-w-0">
              <p className="truncate text-[13px] font-semibold text-fg">{file.name}</p>
              <p className="text-[11.5px] text-subtle">
                {formatBytes(file.size)}
                {pageCount !== null && ` · ${pageCount} halaman`}
              </p>
            </div>
            <button onClick={reset} disabled={busy} className="btn btn-ghost btn-sm">
              <RefreshCw className="h-3.5 w-3.5" aria-hidden />
              Ganti berkas
            </button>
          </div>

          {needsPassword && (
            <div className="rounded-xl border border-warn-border bg-warn-soft px-3.5 py-3">
              <label htmlFor="pdf-password" className="flex items-center gap-1.5 text-[12.5px] font-semibold text-warn">
                <Lock className="h-3.5 w-3.5" aria-hidden />
                Dokumen terkunci kata sandi
              </label>
              <p className="mt-0.5 text-[11.5px] leading-relaxed text-warn/90">
                Masukkan kata sandi dokumen. Kata sandi hanya dipakai di perangkat ini.
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                <input
                  id="pdf-password"
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete="off"
                  placeholder="Kata sandi PDF"
                  className="input flex-1"
                />
                <button
                  onClick={() => file && void inspect(file, password)}
                  disabled={busy || password.length === 0}
                  className="btn btn-secondary"
                >
                  Buka
                </button>
              </div>
            </div>
          )}

          <div className="rounded-xl border border-line bg-surface-2 px-3.5 py-3 text-[12px] leading-relaxed text-subtle">
            Satu halaman PDF menjadi satu halaman Word. Paragraf disusun ulang dari posisi teks, jadi
            kolom ganda dan tabel akan tampil sebagai teks berurutan.
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-[11.5px] text-subtle">
              {pageCount === null
                ? busy
                  ? "Membaca dokumen…"
                  : "Dokumen belum siap."
                : `Siap diubah · ${pageCount} halaman`}
            </p>
            <button
              onClick={handleConvert}
              disabled={busy || pageCount === null || needsPassword}
              className="btn btn-primary"
            >
              <Wand2 className="h-4 w-4" aria-hidden />
              {busy ? "Memproses…" : "Ubah ke Word"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function describeResult(textPages: number, imagePages: number, total: number): string {
  const parts = [`${total} halaman diubah ke Word`];
  if (textPages > 0) parts.push(`${textPages} halaman teks`);
  if (imagePages > 0) parts.push(`${imagePages} halaman gambar`);
  return `${parts.join(" · ")}.`;
}
