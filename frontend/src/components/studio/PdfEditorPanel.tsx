"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  FilePlus2,
  Folder,
  Layers,
  Loader2,
  RotateCw,
  Save,
  Trash2,
  Undo2,
} from "lucide-react";
import { formatBytes } from "@/lib/nasDisplay";
import { describeStudioError, StudioError, type StudioErrorInfo } from "@/lib/studio/errors";
import {
  buildEditedPdf,
  readPdfSource,
  type EditorPage,
  type EditorSource,
} from "@/lib/studio/pdfEditor";
import { PageRenderer } from "@/lib/studio/pdfjs";
import { makePdfOutput } from "@/lib/studio/output";
import StudioAlert from "./StudioAlert";
import StudioProgress from "./StudioProgress";
import type { StudioPanelProps } from "./types";

const THUMB_WIDTH = 200;
const MAX_HISTORY = 30;

function thumbKey(sourceId: string, pageIndex: number): string {
  return `${sourceId}:${pageIndex}`;
}

export default function PdfEditorPanel({
  incomingFile,
  onIncomingFileHandled,
  onCommit,
  onSuccess,
  onOpenStoragePicker,
}: StudioPanelProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const insertRef = useRef<HTMLInputElement>(null);
  // Penanda sesi render: sesi lama berhenti sendiri saat berkas diganti.
  const renderToken = useRef(0);

  const [mainSource, setMainSource] = useState<EditorSource | null>(null);
  const [sources, setSources] = useState<EditorSource[]>([]);
  const [pages, setPages] = useState<EditorPage[]>([]);
  const [history, setHistory] = useState<EditorPage[][]>([]);
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const [thumbProgress, setThumbProgress] = useState<{ done: number; total: number } | null>(null);
  /** `null` berarti sisipkan di akhir. */
  const [insertAt, setInsertAt] = useState<number | null>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<StudioErrorInfo | null>(null);

  const renderThumbnails = useCallback(async (source: EditorSource) => {
    const token = renderToken.current + 1;
    renderToken.current = token;
    setThumbProgress({ done: 0, total: source.pageCount });

    let renderer: PageRenderer | null = null;
    try {
      renderer = await PageRenderer.create(source.bytes);
      for (let pageIndex = 0; pageIndex < source.pageCount; pageIndex += 1) {
        if (renderToken.current !== token) break;
        const url = await renderer.renderToDataUrl(pageIndex, THUMB_WIDTH);
        setThumbs((prev) => ({ ...prev, [thumbKey(source.id, pageIndex)]: url }));
        setThumbProgress({ done: pageIndex + 1, total: source.pageCount });
      }
    } catch (err) {
      if (renderToken.current === token) setError(describeStudioError(err));
    } finally {
      if (renderToken.current === token) setThumbProgress(null);
      await renderer?.destroy();
    }
  }, []);

  const acceptFile = useCallback(
    async (file: File) => {
      const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
      if (!isPdf) {
        setError(
          describeStudioError(
            new StudioError("PDF_INVALID", "Berkas ini bukan PDF.", "Pilih berkas berekstensi .pdf.")
          )
        );
        return;
      }

      setBusy(true);
      setError(null);
      try {
        const loaded = await readPdfSource(file);
        setMainSource(loaded.source);
        setSources([loaded.source]);
        setPages(loaded.pages);
        setHistory([]);
        setThumbs({});
        setInsertAt(null);
        void renderThumbnails(loaded.source);
      } catch (err) {
        setError(describeStudioError(err));
      } finally {
        setBusy(false);
      }
    },
    [renderThumbnails]
  );

  // Berkas dari Storage Picker baru diketahui setelah pengguna memilih, jadi
  // nilainya memang baru bisa dibaca di dalam efek — bukan hasil turunan render.
  useEffect(() => {
    if (!incomingFile) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void acceptFile(incomingFile);
    onIncomingFileHandled();
  }, [incomingFile, acceptFile, onIncomingFileHandled]);

  /** Terapkan daftar halaman baru sambil menyimpan versi sebelumnya untuk undo. */
  const applyPages = useCallback(
    (next: EditorPage[]) => {
      setHistory((prev) => [...prev, pages].slice(-MAX_HISTORY));
      setPages(next);
    },
    [pages]
  );

  const movePage = (index: number, delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= pages.length) return;
    const next = [...pages];
    [next[index], next[target]] = [next[target], next[index]];
    applyPages(next);
  };

  const movePageTo = (from: number, to: number) => {
    if (from === to) return;
    const next = [...pages];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    applyPages(next);
  };

  const rotatePage = (index: number) => {
    const next = pages.map((page, position) =>
      position === index
        ? { ...page, rotation: ((page.rotation + 90) % 360) as EditorPage["rotation"] }
        : page
    );
    applyPages(next);
  };

  const deletePage = (index: number) => {
    applyPages(pages.filter((_, position) => position !== index));
  };

  const undo = () => {
    const previous = history[history.length - 1];
    if (!previous) return;
    setPages(previous);
    setHistory((prev) => prev.slice(0, -1));
  };

  const handleInsertFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const picked = event.target.files?.[0];
    event.target.value = "";
    if (!picked) return;

    setBusy(true);
    setError(null);
    try {
      const loaded = await readPdfSource(picked);
      const position = Math.min(insertAt ?? pages.length, pages.length);
      applyPages([...pages.slice(0, position), ...loaded.pages, ...pages.slice(position)]);
      setSources((prev) => [...prev, loaded.source]);
      setInsertAt(null);
      void renderThumbnails(loaded.source);
    } catch (err) {
      setError(describeStudioError(err));
    } finally {
      setBusy(false);
    }
  };

  const handleSave = async () => {
    setBusy(true);
    setError(null);
    try {
      const map = new Map(sources.map((source) => [source.id, source]));
      const bytes = await buildEditedPdf(map, pages);
      const base = (mainSource?.name ?? "dokumen").replace(/\.[^/.]+$/, "");
      const commit = await onCommit(makePdfOutput(bytes, `${base}_diedit.pdf`));
      if (commit.saved) onSuccess(`PDF disimpan · ${pages.length} halaman.`);
    } catch (err) {
      setError(describeStudioError(err));
    } finally {
      setBusy(false);
    }
  };

  const reset = () => {
    renderToken.current += 1;
    setMainSource(null);
    setSources([]);
    setPages([]);
    setHistory([]);
    setThumbs({});
    setThumbProgress(null);
    setInsertAt(null);
    setError(null);
  };

  const totalSourceBytes = sources.reduce((sum, source) => sum + source.bytes.byteLength, 0);
  const insertPosition = Math.min(insertAt ?? pages.length, pages.length);

  return (
    <div className="space-y-4">
      <input
        type="file"
        ref={fileRef}
        accept="application/pdf,.pdf"
        className="hidden"
        onChange={(event) => {
          const picked = event.target.files?.[0];
          event.target.value = "";
          if (picked) void acceptFile(picked);
        }}
      />
      <input
        type="file"
        ref={insertRef}
        accept="application/pdf,.pdf"
        className="hidden"
        onChange={handleInsertFile}
      />

      {error && <StudioAlert error={error} onDismiss={() => setError(null)} />}

      {!mainSource && (
        <div className="rounded-xl border-2 border-dashed border-line-strong bg-surface-2 px-4 py-8 text-center">
          <Layers className="mx-auto mb-2 h-9 w-9 text-[var(--tile-indigo-fg)]" aria-hidden />
          <p className="text-[13px] font-semibold text-fg">Pilih PDF yang ingin disusun ulang</p>
          <p className="mx-auto mt-1 max-w-sm text-[12px] leading-relaxed text-subtle">
            Hapus halaman, geser urutannya, putar, atau sisipkan PDF lain di posisi mana pun. Berkas
            asli tidak diubah.
          </p>
          <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
            <button disabled={busy} onClick={() => fileRef.current?.click()} className="btn btn-primary">
              {busy ? "Membaca…" : "Pilih dari perangkat"}
            </button>
            <button
              disabled={busy}
              onClick={() => onOpenStoragePicker("pdfedit")}
              className="btn btn-secondary"
            >
              <Folder className="h-4 w-4" aria-hidden />
              Pilih dari berkas tersimpan
            </button>
          </div>
        </div>
      )}

      {mainSource && (
        <>
          <div className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-line bg-surface-2 px-3.5 py-3">
            <div className="min-w-0">
              <p className="truncate text-[13px] font-semibold text-fg">{mainSource.name}</p>
              <p className="text-[11.5px] text-subtle">
                {pages.length} halaman · {formatBytes(totalSourceBytes)}
                {sources.length > 1 && ` · ${sources.length} berkas`}
              </p>
            </div>
            <button onClick={reset} disabled={busy} className="btn btn-ghost btn-sm">
              Ganti berkas
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-line bg-surface px-3 py-2.5">
            <label className="flex items-center gap-1.5 text-[12px] text-muted">
              <span className="whitespace-nowrap font-semibold">Sisipkan PDF</span>
              <select
                value={insertPosition}
                onChange={(event) => setInsertAt(Number(event.target.value))}
                className="select py-1 text-[12px]"
                aria-label="Posisi sisip"
              >
                <option value={0}>Di awal</option>
                {pages.map((page, index) => (
                  <option key={page.id} value={index + 1}>
                    Setelah halaman {index + 1}
                  </option>
                ))}
              </select>
            </label>
            <button
              onClick={() => insertRef.current?.click()}
              disabled={busy}
              className="btn btn-secondary btn-sm"
            >
              <FilePlus2 className="h-3.5 w-3.5" aria-hidden />
              Pilih berkas
            </button>

            <div className="ml-auto flex items-center gap-2">
              <button onClick={undo} disabled={busy || history.length === 0} className="btn btn-ghost btn-sm">
                <Undo2 className="h-3.5 w-3.5" aria-hidden />
                Urungkan
              </button>
              <button onClick={handleSave} disabled={busy || pages.length === 0} className="btn btn-primary btn-sm">
                <Save className="h-3.5 w-3.5" aria-hidden />
                {busy ? "Menyiapkan…" : "Simpan PDF"}
              </button>
            </div>
          </div>

          {thumbProgress && (
            <StudioProgress
              label="Menyiapkan pratinjau…"
              percent={(thumbProgress.done / Math.max(1, thumbProgress.total)) * 100}
              detail={`Halaman ${thumbProgress.done} dari ${thumbProgress.total}`}
            />
          )}

          <ul className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4">
            {pages.map((page, index) => {
              const thumbnail = thumbs[thumbKey(page.sourceId, page.pageIndex)];
              return (
                <li
                  key={page.id}
                  draggable
                  onDragStart={() => setDragIndex(index)}
                  onDragEnd={() => setDragIndex(null)}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={() => {
                    if (dragIndex !== null) movePageTo(dragIndex, index);
                    setDragIndex(null);
                  }}
                  className={`rounded-xl border bg-surface p-2 transition-colors ${
                    dragIndex === index ? "border-brand-border bg-brand-soft" : "border-line"
                  }`}
                >
                  <div className="relative">
                    {thumbnail ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={thumbnail}
                        alt={`Pratinjau halaman ${index + 1}`}
                        className="mx-auto max-h-[180px] w-auto rounded-lg border border-line"
                        draggable={false}
                      />
                    ) : (
                      <div className="flex h-[140px] items-center justify-center rounded-lg border border-dashed border-line-strong bg-surface-2">
                        <Loader2 className="h-4 w-4 animate-spin text-subtle" aria-hidden />
                      </div>
                    )}
                    <span className="absolute left-1 top-1 rounded bg-black/65 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                      {index + 1}
                    </span>
                    {page.rotation !== 0 && (
                      <span className="absolute right-1 top-1 rounded bg-black/65 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                        {page.rotation}°
                      </span>
                    )}
                  </div>

                  <div className="mt-1.5 flex items-center justify-between gap-0.5">
                    <button
                      onClick={() => movePage(index, -1)}
                      disabled={index === 0}
                      aria-label={`Geser halaman ${index + 1} ke kiri`}
                      className="btn btn-ghost btn-sm px-1.5"
                    >
                      <ChevronLeft className="h-3.5 w-3.5" aria-hidden />
                    </button>
                    <button
                      onClick={() => rotatePage(index)}
                      aria-label={`Putar halaman ${index + 1}`}
                      className="btn btn-ghost btn-sm px-1.5"
                    >
                      <RotateCw className="h-3.5 w-3.5" aria-hidden />
                    </button>
                    <button
                      onClick={() => deletePage(index)}
                      disabled={pages.length === 1}
                      aria-label={`Hapus halaman ${index + 1}`}
                      className="btn btn-ghost btn-sm px-1.5 text-danger"
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden />
                    </button>
                    <button
                      onClick={() => movePage(index, 1)}
                      disabled={index === pages.length - 1}
                      aria-label={`Geser halaman ${index + 1} ke kanan`}
                      className="btn btn-ghost btn-sm px-1.5"
                    >
                      <ChevronRight className="h-3.5 w-3.5" aria-hidden />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>

          <p className="text-center text-[11.5px] text-subtle">
            Seret kartu halaman untuk memindahkannya. Minimal satu halaman harus tersisa.
          </p>
        </>
      )}
    </div>
  );
}
