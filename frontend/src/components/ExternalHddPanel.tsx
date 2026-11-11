"use client";

import React, { useCallback, useEffect, useState } from "react";
import {
  ArrowLeft,
  Check,
  Download,
  Eye,
  FileArchive,
  FileText,
  Film,
  Folder,
  HardDrive,
  Image as ImageIcon,
  Loader2,
  MoreVertical,
  RefreshCw,
  Search,
  ShieldAlert,
  ShieldCheck,
} from "lucide-react";
import { HddEntry, hddDownloadUrl, hddList } from "@/lib/api/cloud";
import type { DisplayItem } from "@/lib/displayItem";
import { detectFileType } from "@/lib/fileTypes";
import ThumbnailImage from "@/components/ThumbnailImage";
import { useLongPress, type LongPressPoint } from "@/hooks/useLongPress";
import type { SelectModifiers } from "@/hooks/useFileSelection";

function fmtBytes(n: number): string {
  if (!n || n <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(Math.floor(Math.log(n) / Math.log(1024)), units.length - 1);
  return `${(n / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

export function hddEntryToDisplayItem(entry: HddEntry): DisplayItem {
  const type = entry.is_dir
    ? "folder"
    : detectFileType({ mime: entry.mime_type, name: entry.name });
  const inlineUrl = entry.is_dir ? undefined : hddDownloadUrl(entry.path, true);
  return {
    id: `hdd:${entry.path}`,
    name: entry.name,
    type,
    sizeStr: entry.is_dir ? "Folder" : fmtBytes(entry.size_bytes),
    sizeBytes: entry.size_bytes,
    updatedAt: entry.modified_time
      ? new Date(entry.modified_time).toLocaleDateString("id-ID", {
          day: "2-digit",
          month: "short",
          year: "numeric",
        })
      : "—",
    updatedAtISO: entry.modified_time,
    source: "hdd",
    readOnly: true,
    downloadUrl: entry.is_dir ? undefined : hddDownloadUrl(entry.path, false),
    previewUrl: inlineUrl,
  };
}

function FileTypeIcon({ type, className = "h-4 w-4" }: { type: DisplayItem["type"]; className?: string }) {
  if (type === "folder") return <Folder className={`${className} text-[var(--tile-amber-fg)]`} aria-hidden />;
  if (type === "image") return <ImageIcon className={`${className} text-[var(--tile-purple-fg)]`} aria-hidden />;
  if (type === "video") return <Film className={`${className} text-[var(--tile-green-fg)]`} aria-hidden />;
  if (type === "archive") return <FileArchive className={`${className} text-[var(--tile-amber-fg)]`} aria-hidden />;
  return <FileText className={`${className} text-[var(--tile-blue-fg)]`} aria-hidden />;
}

function SelectionBox({ checked }: { checked: boolean }) {
  return (
    <span
      className={`flex h-6 w-6 items-center justify-center rounded-md border-2 transition-colors ${
        checked ? "border-brand bg-brand text-white" : "border-line-strong bg-surface/90 text-transparent"
      }`}
      aria-hidden
    >
      <Check className="h-3.5 w-3.5" />
    </span>
  );
}

interface ExternalHddPanelProps {
  viewMode?: "grid" | "list";
  selectionMode?: boolean;
  selectedIds?: string[];
  onToggleSelect?: (item: DisplayItem, modifiers: SelectModifiers) => void;
  onOpenFile?: (item: DisplayItem) => void;
  onDownload?: (item: DisplayItem) => void;
  onOpenMenu?: (item: DisplayItem, anchor: LongPressPoint) => void;
  onItemsLoaded?: (items: DisplayItem[]) => void;
}

export default function ExternalHddPanel({
  viewMode = "grid",
  selectionMode = false,
  selectedIds = [],
  onToggleSelect,
  onOpenFile,
  onDownload,
  onOpenMenu,
  onItemsLoaded,
}: ExternalHddPanelProps) {
  const [items, setItems] = useState<DisplayItem[]>([]);
  const [currentPath, setCurrentPath] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  const loadPath = useCallback(
    async (path: string, q?: string) => {
      setLoading(true);
      setErr("");
      try {
        const res = await hddList({ path, q: q || undefined });
        setCurrentPath(res.path || "");
        const mapped = (res.items || []).map(hddEntryToDisplayItem);
        setItems(mapped);
        onItemsLoaded?.(mapped);
      } catch (e) {
        setErr((e as Error).message);
        setItems([]);
        onItemsLoaded?.([]);
      } finally {
        setLoading(false);
      }
    },
    [onItemsLoaded]
  );

  useEffect(() => {
    // Daftar akar HDD dibaca sekali saat panel dibuka. Pemicunya mount, bukan
    // render, jadi setState di dalam pemuat ini memang disengaja.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadPath("");
  }, [loadPath]);

  const segments = currentPath ? currentPath.split("/").filter(Boolean) : [];
  const folders = items.filter((i) => i.type === "folder");
  const files = items.filter((i) => i.type !== "folder");

  const pressedItem = React.useRef<DisplayItem | null>(null);
  const longPress = useLongPress(() => {
    const item = pressedItem.current;
    if (!item || !onToggleSelect || selectedIds.includes(item.id)) return;
    onToggleSelect(item, {});
  });

  const pressProps = (item: DisplayItem) => ({
    onPointerDown: (event: React.PointerEvent) => {
      pressedItem.current = item;
      longPress.onPointerDown(event);
    },
    onPointerMove: longPress.onPointerMove,
    onPointerUp: longPress.onPointerUp,
    onPointerLeave: longPress.onPointerLeave,
    onPointerCancel: longPress.onPointerCancel,
  });

  function openFolder(relPath: string) {
    setSearch("");
    loadPath(relPath, "");
  }

  function goUp() {
    if (segments.length === 0) return;
    const parent = segments.slice(0, -1).join("/");
    loadPath(parent, search);
  }

  function activate(item: DisplayItem, event: React.MouseEvent) {
    if (longPress.consumeLongPress()) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    if (selectionMode && onToggleSelect && item.type !== "folder") {
      onToggleSelect(item, event);
      return;
    }
    if (item.type === "folder") {
      openFolder(item.id.replace(/^hdd:/, ""));
    } else if (onOpenFile) {
      onOpenFile(item);
    } else if (item.previewUrl) {
      window.open(item.previewUrl, "_blank", "noopener,noreferrer");
    }
  }

  function openMenuAt(item: DisplayItem, event: React.MouseEvent) {
    if (!onOpenMenu || item.type === "folder") return;
    event.preventDefault();
    event.stopPropagation();
    onOpenMenu(item, { x: event.clientX, y: event.clientY });
  }

  function openMenuFromButton(item: DisplayItem, event: React.MouseEvent<HTMLButtonElement>) {
    if (!onOpenMenu) return;
    event.preventDefault();
    event.stopPropagation();
    const rect = event.currentTarget.getBoundingClientRect();
    onOpenMenu(item, { x: rect.left, y: rect.bottom + 4 });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 rounded-xl border border-success-border bg-success-soft/60 px-3.5 py-2.5 text-[12px] text-success sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 shrink-0" aria-hidden />
          <span>
            <strong>Mode Baca-Saja (Read-Only Protection Aktif):</strong> Seluruh berkas lama di HDD
            500 GB dikunci agar tidak bisa dihapus, diubah, atau rusak. Klik kanan / tombol ⋮ untuk
            alat AI Studio atau menyalin ke Perangkat ini / Google Drive.
          </span>
        </div>
        <button
          type="button"
          onClick={() => loadPath(currentPath, search)}
          className="btn btn-sm btn-secondary shrink-0 self-start sm:self-auto"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} aria-hidden />
          Muat ulang
        </button>
      </div>

      {err && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-xl border border-danger-border bg-danger-soft px-3.5 py-2.5 text-[12.5px] text-danger"
        >
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <span className="break-all">{err}</span>
        </div>
      )}

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search
            className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-subtle"
            aria-hidden
          />
          <input
            value={search}
            onChange={(e) => {
              const v = e.target.value;
              setSearch(v);
              loadPath(currentPath, v);
            }}
            placeholder="Saring nama berkas/folder di folder HDD ini…"
            aria-label="Saring nama berkas di HDD"
            className="input pl-9"
          />
        </div>
        {segments.length > 0 && (
          <button type="button" onClick={goUp} className="btn btn-secondary">
            <ArrowLeft className="h-4 w-4" aria-hidden />
            Kembali
          </button>
        )}
      </div>

      {/* Breadcrumb navigasi folder HDD */}
      <div className="flex flex-wrap items-center gap-1.5 text-[12px] text-subtle">
        <button
          type="button"
          onClick={() => openFolder("")}
          className={`flex items-center gap-1 rounded-md px-2 py-1 font-medium transition-colors ${
            segments.length === 0 ? "bg-brand-soft text-brand" : "hover:bg-surface-2 hover:text-fg"
          }`}
        >
          <HardDrive className="h-3.5 w-3.5" aria-hidden />
          HDD 500GB (Data)
        </button>
        {segments.map((seg, idx) => {
          const targetPath = segments.slice(0, idx + 1).join("/");
          const isLast = idx === segments.length - 1;
          return (
            <React.Fragment key={targetPath}>
              <span>/</span>
              <button
                type="button"
                onClick={() => openFolder(targetPath)}
                className={`rounded-md px-2 py-1 font-medium transition-colors ${
                  isLast ? "bg-brand-soft text-brand" : "hover:bg-surface-2 hover:text-fg"
                }`}
              >
                {seg}
              </button>
            </React.Fragment>
          );
        })}
      </div>

      {loading ? (
        <div className="card flex items-center justify-center gap-2 p-10 text-[12.5px] text-muted">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          Membaca isi HDD 500 GB…
        </div>
      ) : items.length === 0 ? (
        <div className="card space-y-1 p-10 text-center">
          <p className="text-[12.5px] font-semibold text-fg">Folder kosong atau tidak ditemukan</p>
          <p className="text-[11.5px] text-subtle">Coba kata kunci lain atau kembali ke folder induk.</p>
        </div>
      ) : (
        <>
          {folders.length > 0 && (
            <section className="space-y-2.5" aria-labelledby="hdd-folders-title">
              <h2 id="hdd-folders-title" className="text-[13px] font-bold text-fg">
                Folder <span className="font-normal text-subtle">({folders.length})</span>
              </h2>
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
                {folders.map((folder) => (
                  <div
                    key={folder.id}
                    className="card card-hover relative flex items-center gap-3 p-3"
                  >
                    <button
                      type="button"
                      onClick={(event) => activate(folder, event)}
                      className="flex min-w-0 flex-1 items-center gap-3 text-left"
                    >
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--tile-blue)] text-[var(--tile-blue-fg)]">
                        <Folder className="h-5 w-5 fill-current" aria-hidden />
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-[13px] font-semibold text-fg">
                          {folder.name}
                        </span>
                        <span className="block truncate text-[11.5px] text-subtle">
                          Folder · {folder.updatedAt}
                        </span>
                      </span>
                    </button>
                  </div>
                ))}
              </div>
            </section>
          )}

          {files.length > 0 && (
            <section className="space-y-2.5" aria-labelledby="hdd-files-title">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 id="hdd-files-title" className="text-[13px] font-bold text-fg">
                  Berkas <span className="font-normal text-subtle">({files.length})</span>
                </h2>
                <span className="text-[11.5px] text-subtle">
                  Seret berkas ke tab Perangkat ini / Google Drive di atas untuk menyalin
                </span>
              </div>

              {viewMode === "grid" ? (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  {files.map((file) => {
                    const selected = selectedIds.includes(file.id);
                    return (
                      <article
                        key={file.id}
                        draggable
                        onDragStart={(e) => {
                          const toDrag =
                            selected && selectedIds.length > 1
                              ? files.filter((f) => selectedIds.includes(f.id))
                              : [file];
                          e.dataTransfer.setData(
                            "application/x-barva-items",
                            JSON.stringify(toDrag)
                          );
                          e.dataTransfer.effectAllowed = "copy";
                        }}
                        {...pressProps(file)}
                        onContextMenu={(event) => openMenuAt(file, event)}
                        className={`card relative flex flex-col p-3 transition-colors hover:border-brand-border ${
                          selected ? "border-brand-border bg-brand-soft/40" : ""
                        }`}
                      >
                        {selectionMode && onToggleSelect && (
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              onToggleSelect(file, event);
                            }}
                            className="absolute left-2 top-2 z-10"
                            aria-pressed={selected}
                            aria-label={selected ? `Batalkan pilihan ${file.name}` : `Pilih ${file.name}`}
                          >
                            <SelectionBox checked={selected} />
                          </button>
                        )}

                        {file.type === "image" && file.previewUrl ? (
                          <button
                            type="button"
                            onClick={(event) => activate(file, event)}
                            className="relative mb-2.5 flex h-36 w-full items-center justify-center overflow-hidden rounded-xl bg-surface-2"
                            aria-label={`Lihat ${file.name}`}
                          >
                            <ThumbnailImage
                              src={file.previewUrl}
                              alt={file.name}
                              className="h-full w-full object-cover"
                              fallback={<FileTypeIcon type="image" className="h-8 w-8" />}
                            />
                          </button>
                        ) : (
                          <div className="flex items-start justify-between gap-2">
                            <button
                              type="button"
                              onClick={(event) => activate(file, event)}
                              className={`flex h-11 w-11 items-center justify-center overflow-hidden rounded-xl bg-surface-2 ${
                                selectionMode ? "ml-7" : ""
                              }`}
                              aria-label={`Lihat ${file.name}`}
                            >
                              <FileTypeIcon type={file.type} className="h-5 w-5" />
                            </button>
                            <div className="flex items-center gap-0.5">
                              <button
                                type="button"
                                onClick={(event) => openMenuFromButton(file, event)}
                                className="icon-btn h-8 w-8"
                                title="Alat AI & Aksi lain"
                                aria-label={`Aksi lain untuk ${file.name}`}
                              >
                                <MoreVertical className="h-4 w-4" aria-hidden />
                              </button>
                            </div>
                          </div>
                        )}

                        <div className="flex items-start justify-between gap-2">
                          <button
                            type="button"
                            onClick={(event) => activate(file, event)}
                            className="min-w-0 flex-1 text-left"
                          >
                            <p className="line-clamp-1 text-[12.5px] font-semibold text-fg">
                              {file.name}
                            </p>
                            <p className="mt-0.5 text-[11.5px] text-subtle">
                              {file.sizeStr} · {file.updatedAt}
                            </p>
                          </button>
                          {file.type === "image" && (
                            <button
                              type="button"
                              onClick={(event) => openMenuFromButton(file, event)}
                              className="icon-btn h-8 w-8 shrink-0"
                              title="Alat AI & Aksi lain"
                              aria-label={`Aksi lain untuk ${file.name}`}
                            >
                              <MoreVertical className="h-4 w-4" aria-hidden />
                            </button>
                          )}
                        </div>

                        <div className="mt-2.5 flex items-center justify-between border-t border-line pt-2">
                          <span className="inline-flex items-center gap-1 text-[10.5px] font-medium text-success">
                            <ShieldCheck className="h-3 w-3" aria-hidden />
                            Baca-Saja (Aman)
                          </span>
                          <div className="flex items-center gap-0.5">
                            <button
                              type="button"
                              onClick={(event) => activate(file, event)}
                              className="icon-btn h-8 w-8"
                              title="Pratinjau"
                              aria-label={`Pratinjau ${file.name}`}
                            >
                              <Eye className="h-4 w-4" aria-hidden />
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                onDownload
                                  ? onDownload(file)
                                  : file.downloadUrl && window.open(file.downloadUrl, "_blank", "noopener")
                              }
                              className="icon-btn h-8 w-8"
                              title="Unduh berkas asli"
                              aria-label={`Unduh ${file.name}`}
                            >
                              <Download className="h-4 w-4" aria-hidden />
                            </button>
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
              ) : (
                <div className="card overflow-hidden">
                  <ul className="divide-y divide-line">
                    {files.map((file) => {
                      const selected = selectedIds.includes(file.id);
                      return (
                        <li
                          key={file.id}
                          draggable
                          onDragStart={(e) => {
                            const toDrag =
                              selected && selectedIds.length > 1
                                ? files.filter((f) => selectedIds.includes(f.id))
                                : [file];
                            e.dataTransfer.setData(
                              "application/x-barva-items",
                              JSON.stringify(toDrag)
                            );
                            e.dataTransfer.effectAllowed = "copy";
                          }}
                          {...pressProps(file)}
                          onContextMenu={(event) => openMenuAt(file, event)}
                          className={`flex items-center gap-2.5 px-3 py-2.5 transition-colors hover:bg-surface-2 ${
                            selected ? "bg-brand-soft/40" : ""
                          }`}
                        >
                          {selectionMode && onToggleSelect && (
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                onToggleSelect(file, event);
                              }}
                              className="shrink-0"
                              aria-pressed={selected}
                            >
                              <SelectionBox checked={selected} />
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={(event) => activate(file, event)}
                            className="flex min-w-0 flex-1 items-center gap-2.5 text-left hover:text-brand"
                          >
                            {file.type === "image" && file.previewUrl ? (
                              <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-surface-2">
                                <ThumbnailImage
                                  src={file.previewUrl}
                                  alt={file.name}
                                  className="h-full w-full object-cover"
                                  fallback={<FileTypeIcon type="image" />}
                                />
                              </span>
                            ) : (
                              <FileTypeIcon type={file.type} />
                            )}
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-[12.5px] font-medium text-fg">
                                {file.name}
                              </span>
                              <span className="block text-[11px] text-subtle">
                                {file.sizeStr} · {file.updatedAt}
                              </span>
                            </span>
                          </button>
                          <div className="flex shrink-0 items-center gap-1">
                            <button
                              type="button"
                              onClick={(event) => activate(file, event)}
                              className="icon-btn h-8 w-8"
                              title="Pratinjau"
                              aria-label={`Pratinjau ${file.name}`}
                            >
                              <Eye className="h-4 w-4" aria-hidden />
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                onDownload
                                  ? onDownload(file)
                                  : file.downloadUrl && window.open(file.downloadUrl, "_blank", "noopener")
                              }
                              className="icon-btn h-8 w-8"
                              title="Unduh berkas asli"
                              aria-label={`Unduh ${file.name}`}
                            >
                              <Download className="h-4 w-4" aria-hidden />
                            </button>
                            <button
                              type="button"
                              onClick={(event) => openMenuFromButton(file, event)}
                              className="icon-btn h-8 w-8"
                              title="Alat AI & Aksi lain"
                              aria-label={`Aksi lain untuk ${file.name}`}
                            >
                              <MoreVertical className="h-4 w-4" aria-hidden />
                            </button>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
            </section>
          )}
        </>
      )}
    </div>
  );
}
