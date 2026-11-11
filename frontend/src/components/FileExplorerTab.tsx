"use client";

import React from "react";
import {
  ArrowLeft,
  Check,
  ChevronRight,
  Cloud,
  Download,
  Eye,
  FileArchive,
  FileText,
  Film,
  Folder,
  FolderInput,
  Grid,
  HardDrive,
  Heart,
  Image as ImageIcon,
  List,
  MoreVertical,
  Pencil,
  RefreshCw,
  Share2,
  ShieldCheck,
  Trash2,
  Upload,
  Users,
  WifiOff,
} from "lucide-react";
import type { DisplayItem } from "@/lib/displayItem";
import ThumbnailImage from "@/components/ThumbnailImage";
import { useLongPress, type LongPressPoint } from "@/hooks/useLongPress";
import type { SelectModifiers } from "@/hooks/useFileSelection";

interface FileExplorerTabProps {
  items: DisplayItem[];
  allItems: DisplayItem[];
  currentFolderId: string | null;
  breadcrumbs: { id: string | null; name: string }[];
  connectionMode: "standalone" | "nas";
  isGdriveConnected: boolean;
  viewMode: "grid" | "list";
  onViewModeChange: (mode: "grid" | "list") => void;
  storageFilter: "local" | "gdrive";
  onStorageFilterChange: (filter: "local" | "gdrive") => void;
  pendingUploads: number;
  isOnline: boolean;
  flushingQueue: boolean;
  nasFilesLoading: boolean;
  nasFilesError: string;
  isForeign: (item: DisplayItem) => boolean;
  /** URL pratinjau server; null bila item tidak punya pratinjau. */
  thumbnailUrl: (item: DisplayItem) => string | null;
  onFlushQueue: () => void;
  onReload: () => void;
  onGoBack: () => void;
  onBreadcrumb: (id: string | null, index: number) => void;
  onOpenFolder: (item: DisplayItem) => void;
  onOpenFile: (item: DisplayItem) => void;
  onDelete: (id: string, e: React.MouseEvent) => void;
  onFav: (id: string, e: React.MouseEvent) => void;
  onDownload: (item: DisplayItem) => void;
  onRename: (item: DisplayItem) => void;
  onMove: (item: DisplayItem) => void;
  onShare: (item: DisplayItem) => void;
  /** Buka menu aksi di posisi tertentu. */
  onOpenMenu: (item: DisplayItem, anchor: LongPressPoint) => void;
  selectionMode: boolean;
  selectedIds: string[];
  onToggleSelect: (item: DisplayItem, modifiers: SelectModifiers) => void;
  onToggleSelectionMode: () => void;
}

function FileTypeIcon({ type, className = "h-4 w-4" }: { type: DisplayItem["type"]; className?: string }) {
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

export default function FileExplorerTab({
  items,
  allItems,
  currentFolderId,
  breadcrumbs,
  connectionMode,
  isGdriveConnected,
  viewMode,
  onViewModeChange,
  storageFilter,
  onStorageFilterChange,
  pendingUploads,
  isOnline,
  flushingQueue,
  nasFilesLoading,
  nasFilesError,
  isForeign,
  thumbnailUrl,
  onFlushQueue,
  onReload,
  onGoBack,
  onBreadcrumb,
  onOpenFolder,
  onOpenFile,
  onDelete,
  onFav,
  onDownload,
  onRename,
  onMove,
  onShare,
  onOpenMenu,
  selectionMode,
  selectedIds,
  onToggleSelect,
  onToggleSelectionMode,
}: FileExplorerTabProps) {
  const currentItems = items.filter((f) => (f.parentId || null) === currentFolderId);
  const currentFolders = currentItems.filter((f) => f.type === "folder");
  const currentFiles = currentItems.filter((f) => f.type !== "folder");

  const pressedItem = React.useRef<DisplayItem | null>(null);
  // Tekan lama memilih item dan menyalakan mode pilih, seperti galeri ponsel.
  // Menu aksi tetap terbuka lewat klik kanan atau tombol ⋮.
  const longPress = useLongPress(() => {
    const item = pressedItem.current;
    if (!item || selectedIds.includes(item.id)) return;
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

  const openMenuAt = (item: DisplayItem, event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    onOpenMenu(item, { x: event.clientX, y: event.clientY });
  };

  const openMenuFromButton = (item: DisplayItem, event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    const rect = event.currentTarget.getBoundingClientRect();
    onOpenMenu(item, { x: rect.left, y: rect.bottom + 4 });
  };

  const activate = (item: DisplayItem, event: React.MouseEvent) => {
    if (longPress.consumeLongPress()) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    if (selectionMode) {
      onToggleSelect(item, event);
      return;
    }
    if (item.type === "folder") {
      onOpenFolder(item);
    } else {
      onOpenFile(item);
    }
  };

  const isSelected = (id: string) => selectedIds.includes(id);

  return (
    <div className="mx-auto max-w-7xl space-y-4 pb-24 lg:pb-6">
      {pendingUploads > 0 && (
        <div
          role="status"
          className="flex flex-wrap items-center gap-2 rounded-xl border border-info-border bg-info-soft px-3.5 py-2.5 text-[12.5px] text-info"
        >
          <Upload className="h-4 w-4 shrink-0" aria-hidden />
          <span className="min-w-0 flex-1">
            {pendingUploads} berkas menunggu koneksi sebelum bisa diunggah.
          </span>
          <button
            onClick={onFlushQueue}
            disabled={!isOnline || flushingQueue}
            className="btn btn-sm border-info-border bg-surface text-info"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${flushingQueue ? "animate-spin" : ""}`} aria-hidden />
            {flushingQueue ? "Mengunggah…" : "Unggah sekarang"}
          </button>
        </div>
      )}

      {/* Sumber penyimpanan + pilihan tampilan */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div
          className="flex w-fit items-center gap-1 rounded-xl border border-line bg-surface p-1 text-[12.5px]"
          role="group"
          aria-label="Pilih sumber penyimpanan"
        >
          <button
            onClick={() => onStorageFilterChange("local")}
            aria-pressed={storageFilter === "local"}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 font-semibold transition-colors ${
              storageFilter === "local"
                ? "bg-brand-soft text-brand"
                : "text-muted hover:text-fg"
            }`}
          >
            <HardDrive className="h-3.5 w-3.5" aria-hidden />
            Perangkat ini
          </button>
          <button
            onClick={() => onStorageFilterChange("gdrive")}
            aria-pressed={storageFilter === "gdrive"}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 font-semibold transition-colors ${
              storageFilter === "gdrive"
                ? "bg-brand-soft text-brand"
                : "text-muted hover:text-fg"
            }`}
          >
            <Cloud className="h-3.5 w-3.5" aria-hidden />
            Google Drive
            {!isGdriveConnected && <span className="chip chip-warn">nonaktif</span>}
          </button>
        </div>

        <div className="flex items-center gap-2 self-start">
          <button
            type="button"
            onClick={onToggleSelectionMode}
            aria-pressed={selectionMode}
            className={`btn btn-sm ${selectionMode ? "btn-primary" : "btn-secondary"}`}
          >
            {selectionMode ? "Selesai" : "Pilih"}
          </button>
          <div className="flex items-center gap-1 rounded-xl border border-line bg-surface p-1">
            <button
              onClick={() => onViewModeChange("grid")}
              aria-pressed={viewMode === "grid"}
              className={`icon-btn h-8 w-8 ${viewMode === "grid" ? "bg-brand-soft text-brand" : ""}`}
              title="Tampilan kotak"
              aria-label="Tampilan kotak"
            >
              <Grid className="h-4 w-4" aria-hidden />
            </button>
            <button
              onClick={() => onViewModeChange("list")}
              aria-pressed={viewMode === "list"}
              className={`icon-btn h-8 w-8 ${viewMode === "list" ? "bg-brand-soft text-brand" : ""}`}
              title="Tampilan daftar"
              aria-label="Tampilan daftar"
            >
              <List className="h-4 w-4" aria-hidden />
            </button>
          </div>
        </div>
      </div>

      {/* Lokasi folder saat ini */}
      <nav
        aria-label="Lokasi folder"
        className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line bg-surface px-3 py-2.5"
      >
        <div className="flex flex-wrap items-center gap-1.5 text-[12.5px]">
          {currentFolderId && (
            <button onClick={onGoBack} className="btn btn-secondary btn-sm mr-1">
              <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
              Kembali
            </button>
          )}
          {breadcrumbs.map((crumb, idx) => {
            const isLast = idx === breadcrumbs.length - 1;
            return (
              <React.Fragment key={`${crumb.id ?? "root"}-${idx}`}>
                {idx > 0 && <ChevronRight className="h-3.5 w-3.5 text-subtle" aria-hidden />}
                <button
                  onClick={() => onBreadcrumb(crumb.id, idx)}
                  aria-current={isLast ? "location" : undefined}
                  className={`rounded-md px-1 py-0.5 transition-colors ${
                    isLast
                      ? "font-semibold text-fg"
                      : "text-muted hover:text-fg hover:underline"
                  }`}
                >
                  {crumb.name}
                </button>
              </React.Fragment>
            );
          })}
        </div>
        <span className="text-[11.5px] text-subtle">
          {currentItems.length} item di folder ini
        </span>
      </nav>

      {connectionMode === "nas" && (nasFilesLoading || nasFilesError) && (
        <div
          role="status"
          className={`flex items-center gap-2 rounded-xl border px-3.5 py-2.5 text-[12.5px] ${
            nasFilesError
              ? "border-danger-border bg-danger-soft text-danger"
              : "border-line bg-surface text-muted"
          }`}
        >
          {nasFilesError ? (
            <>
              <WifiOff className="h-4 w-4 shrink-0" aria-hidden />
              <span className="min-w-0 flex-1">Gagal memuat dari server: {nasFilesError}</span>
              <button onClick={onReload} className="shrink-0 font-semibold underline">
                Coba lagi
              </button>
            </>
          ) : (
            <>
              <RefreshCw className="h-4 w-4 shrink-0 animate-spin" aria-hidden />
              <span>Memuat isi folder…</span>
            </>
          )}
        </div>
      )}

      {currentFolders.length > 0 && (
        <section className="space-y-2.5" aria-labelledby="folders-title">
          <h2 id="folders-title" className="text-[13px] font-bold text-fg">
            Folder <span className="font-normal text-subtle">({currentFolders.length})</span>
          </h2>
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
            {currentFolders.map((folder) => {
              const childCount = allItems.filter((i) => (i.parentId || null) === folder.id).length;
              const selected = isSelected(folder.id);
              return (
                <div
                  key={folder.id}
                  {...pressProps(folder)}
                  onContextMenu={(event) => openMenuAt(folder, event)}
                  className={`card card-hover relative flex items-center gap-3 p-3 ${
                    selected ? "border-brand-border bg-brand-soft/40" : ""
                  }`}
                >
                  {selectionMode && (
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        onToggleSelect(folder, event);
                      }}
                      className="shrink-0"
                      aria-pressed={selected}
                      aria-label={selected ? `Batalkan pilihan ${folder.name}` : `Pilih ${folder.name}`}
                    >
                      <SelectionBox checked={selected} />
                    </button>
                  )}
                  <button
                    onClick={(event) => activate(folder, event)}
                    className="flex min-w-0 flex-1 items-center gap-3 text-left"
                  >
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--tile-blue)] text-[var(--tile-blue-fg)]">
                      <Folder className="h-5 w-5 fill-current" aria-hidden />
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-[13px] font-semibold text-fg">{folder.name}</span>
                      <span className="block truncate text-[11.5px] text-subtle">
                        {isForeign(folder)
                          ? "Milik anggota lain · ketuk untuk membuka"
                          : connectionMode === "nas"
                          ? "Ketuk untuk membuka"
                          : `${childCount} item · ketuk untuk membuka`}
                      </span>
                    </span>
                  </button>
                  <div className="flex shrink-0 items-center gap-0.5">
                    <button
                      onClick={(event) => {
                        event.stopPropagation();
                        onRename(folder);
                      }}
                      className="icon-btn h-8 w-8"
                      title="Ganti nama folder"
                      aria-label={`Ganti nama ${folder.name}`}
                    >
                      <Pencil className="h-4 w-4" aria-hidden />
                    </button>
                    <button
                      onClick={(event) => {
                        event.stopPropagation();
                        onMove(folder);
                      }}
                      className="icon-btn h-8 w-8"
                      title="Pindahkan folder"
                      aria-label={`Pindahkan ${folder.name}`}
                    >
                      <FolderInput className="h-4 w-4" aria-hidden />
                    </button>
                    <button
                      onClick={(event) => onDelete(folder.id, event)}
                      className="icon-btn h-8 w-8 hover:text-danger"
                      title="Hapus folder"
                      aria-label={`Hapus ${folder.name}`}
                    >
                      <Trash2 className="h-4 w-4" aria-hidden />
                    </button>
                    <button
                      onClick={(event) => openMenuFromButton(folder, event)}
                      className="icon-btn h-8 w-8"
                      title="Aksi lain"
                      aria-label={`Aksi lain untuk ${folder.name}`}
                    >
                      <MoreVertical className="h-4 w-4" aria-hidden />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      <section className="space-y-2.5" aria-labelledby="files-title">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="files-title" className="text-[13px] font-bold text-fg">
            Berkas <span className="font-normal text-subtle">({currentFiles.length})</span>
          </h2>
          <span className="text-[11.5px] text-subtle">
            {connectionMode === "nas" ? "Tersimpan di server rumah" : "Tersimpan di perangkat ini"}
          </span>
        </div>

        {currentFiles.length === 0 && currentFolders.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-line-strong bg-surface px-4 py-14 text-center">
            <Folder className="h-10 w-10 text-subtle" aria-hidden />
            <p className="text-[13.5px] font-semibold text-fg">Folder ini masih kosong</p>
            <p className="max-w-sm text-[12px] leading-relaxed text-subtle">
              Gunakan tombol <strong className="font-semibold text-muted">Unggah Berkas</strong> atau{" "}
              <strong className="font-semibold text-muted">Folder Baru</strong> di kanan atas untuk
              mulai mengisi.
            </p>
          </div>
        ) : viewMode === "grid" ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {currentFiles.map((file) => {
              const selected = isSelected(file.id);
              return (
                <article
                  key={file.id}
                  {...pressProps(file)}
                  onContextMenu={(event) => openMenuAt(file, event)}
                  onClick={(event) => {
                    if (longPress.consumeLongPress()) {
                      event.preventDefault();
                      return;
                    }
                    if (!selectionMode) return;
                    if ((event.target as HTMLElement).closest("button")) return;
                    onToggleSelect(file, event);
                  }}
                  className={`card relative flex flex-col p-3 transition-colors hover:border-brand-border ${
                    selected ? "border-brand-border bg-brand-soft/40" : ""
                  }`}
                >
                  {selectionMode && (
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

                  <div className="flex items-start justify-between gap-2">
                    <button
                      onClick={(event) => activate(file, event)}
                      className={`flex h-11 w-11 items-center justify-center overflow-hidden rounded-xl bg-surface-2 ${
                        selectionMode ? "ml-7" : ""
                      }`}
                      aria-label={`Lihat ${file.name}`}
                    >
                      {file.type === "image" ? (
                        <ThumbnailImage
                          blob={file.blob}
                          src={thumbnailUrl(file)}
                          alt={file.name}
                          className="h-full w-full object-cover"
                          fallback={<FileTypeIcon type="image" className="h-5 w-5" />}
                        />
                      ) : (
                        <FileTypeIcon type={file.type} className="h-5 w-5" />
                      )}
                    </button>

                    <div className="flex items-center gap-0.5">
                      <button
                        onClick={(event) => onFav(file.id, event)}
                        className={`icon-btn h-8 w-8 ${file.isFavorite ? "text-danger" : ""}`}
                        title={file.isFavorite ? "Hapus dari favorit" : "Tandai favorit"}
                        aria-label={file.isFavorite ? "Hapus dari favorit" : "Tandai favorit"}
                      >
                        <Heart className={`h-4 w-4 ${file.isFavorite ? "fill-current" : ""}`} aria-hidden />
                      </button>
                      {!isForeign(file) && (
                        <button
                          onClick={() => onShare(file)}
                          className="icon-btn h-8 w-8"
                          title="Bagikan tautan"
                          aria-label={`Bagikan ${file.name}`}
                        >
                          <Share2 className="h-4 w-4" aria-hidden />
                        </button>
                      )}
                      <button
                        onClick={(event) => {
                          event.stopPropagation();
                          onRename(file);
                        }}
                        className="icon-btn h-8 w-8"
                        title="Ganti nama"
                        aria-label={`Ganti nama ${file.name}`}
                      >
                        <Pencil className="h-4 w-4" aria-hidden />
                      </button>
                      <button
                        onClick={(event) => {
                          event.stopPropagation();
                          onMove(file);
                        }}
                        className="icon-btn h-8 w-8"
                        title="Pindahkan"
                        aria-label={`Pindahkan ${file.name}`}
                      >
                        <FolderInput className="h-4 w-4" aria-hidden />
                      </button>
                      <button
                        onClick={(event) => onDelete(file.id, event)}
                        className="icon-btn h-8 w-8 hover:text-danger"
                        title="Hapus"
                        aria-label={`Hapus ${file.name}`}
                      >
                        <Trash2 className="h-4 w-4" aria-hidden />
                      </button>
                      <button
                        onClick={(event) => openMenuFromButton(file, event)}
                        className="icon-btn h-8 w-8"
                        title="Aksi lain"
                        aria-label={`Aksi lain untuk ${file.name}`}
                      >
                        <MoreVertical className="h-4 w-4" aria-hidden />
                      </button>
                    </div>
                  </div>

                  <button onClick={(event) => activate(file, event)} className="mt-2.5 min-w-0 text-left">
                    <p className="line-clamp-1 text-[12.5px] font-semibold text-fg">{file.name}</p>
                    <p className="mt-0.5 text-[11.5px] text-subtle">
                      {file.sizeStr} · {file.updatedAt}
                    </p>
                  </button>

                  {isForeign(file) && (
                    <span className="chip chip-warn mt-1.5 w-fit">
                      <Users className="h-2.5 w-2.5" aria-hidden />
                      Milik anggota lain
                    </span>
                  )}

                  <div className="mt-2.5 flex items-center justify-between border-t border-line pt-2">
                    <span className="inline-flex items-center gap-1 text-[10.5px] font-medium text-success">
                      <ShieldCheck className="h-3 w-3" aria-hidden />
                      {file.sha256 ? "Terverifikasi" : "Aman"}
                    </span>
                    <div className="flex items-center gap-0.5">
                      <button
                        onClick={(event) => activate(file, event)}
                        className="icon-btn h-8 w-8"
                        title="Lihat detail"
                        aria-label={`Lihat detail ${file.name}`}
                      >
                        <Eye className="h-4 w-4" aria-hidden />
                      </button>
                      <button
                        onClick={() => onDownload(file)}
                        className="icon-btn h-8 w-8"
                        title="Unduh"
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
            <table className="w-full text-left text-[12.5px]">
              <thead className="border-b border-line bg-surface-2 text-[11.5px] uppercase tracking-wide text-subtle">
                <tr>
                  <th className="px-4 py-2.5 font-semibold">Nama berkas</th>
                  <th className="px-4 py-2.5 font-semibold">Ukuran</th>
                  <th className="hidden px-4 py-2.5 font-semibold sm:table-cell">Diubah</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {currentFiles.map((file) => {
                  const selected = isSelected(file.id);
                  return (
                    <tr
                      key={file.id}
                      {...pressProps(file)}
                      onContextMenu={(event) => openMenuAt(file, event)}
                      className={`transition-colors hover:bg-surface-2 ${
                        selected ? "bg-brand-soft/40" : ""
                      }`}
                    >
                      <td className="px-4 py-2.5">
                        <button onClick={(event) => activate(file, event)} className="flex items-center gap-2 text-left">
                          {selectionMode && <SelectionBox checked={selected} />}
                          <FileTypeIcon type={file.type} />
                          <span className="max-w-[14rem] truncate font-medium text-fg">{file.name}</span>
                          {isForeign(file) && <span className="chip chip-warn">Milik anggota lain</span>}
                        </button>
                      </td>
                      <td className="px-4 py-2.5 tabular-nums text-muted">{file.sizeStr}</td>
                      <td className="hidden px-4 py-2.5 text-muted sm:table-cell">{file.updatedAt}</td>
                      <td className="px-4 py-2.5">
                        <div className="flex items-center justify-end gap-0.5">
                          <button
                            onClick={(event) => onFav(file.id, event)}
                            className={`icon-btn h-8 w-8 ${file.isFavorite ? "text-danger" : ""}`}
                            aria-label="Tandai favorit"
                            title="Favorit"
                          >
                            <Heart className={`h-4 w-4 ${file.isFavorite ? "fill-current" : ""}`} aria-hidden />
                          </button>
                          <button
                            onClick={() => onDownload(file)}
                            className="icon-btn h-8 w-8"
                            aria-label={`Unduh ${file.name}`}
                            title="Unduh"
                          >
                            <Download className="h-4 w-4" aria-hidden />
                          </button>
                          <button
                            onClick={(event) => onDelete(file.id, event)}
                            className="icon-btn h-8 w-8 hover:text-danger"
                            aria-label={`Hapus ${file.name}`}
                            title="Hapus"
                          >
                            <Trash2 className="h-4 w-4" aria-hidden />
                          </button>
                          <button
                            onClick={(event) => openMenuFromButton(file, event)}
                            className="icon-btn h-8 w-8"
                            aria-label={`Aksi lain untuk ${file.name}`}
                            title="Aksi lain"
                          >
                            <MoreVertical className="h-4 w-4" aria-hidden />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
