"use client";

import React from "react";
import {
  ArrowLeft,
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
  Pencil,
  RefreshCw,
  Search,
  Server,
  Share2,
  Shield,
  ShieldCheck,
  Trash2,
  Upload,
  Users,
  WifiOff,
} from "lucide-react";
import type { DisplayItem } from "@/lib/nasDisplay";
import { formatBytes } from "@/lib/nasDisplay";
import ThumbnailImage from "@/components/ThumbnailImage";

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
}: FileExplorerTabProps) {
  return (
      <div className="space-y-6">
        {pendingUploads > 0 && (
          <div className="rounded-xl bg-sky-950/50 border border-sky-800/60 px-4 py-2.5 text-xs flex items-center gap-2">
            <Upload className="h-3.5 w-3.5 text-sky-300 shrink-0" />
            <span className="text-sky-200">
              {pendingUploads} berkas menunggu koneksi ke server untuk diunggah.
            </span>
            <button
              onClick={onFlushQueue}
              disabled={!isOnline || flushingQueue}
              className="ml-auto shrink-0 flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-sky-500/15 border border-sky-500/40 text-sky-200 hover:bg-sky-500/25 transition-colors cursor-pointer disabled:opacity-40"
            >
              <RefreshCw className={`h-3 w-3 ${flushingQueue ? "animate-spin" : ""}`} />
              <span>{flushingQueue ? "Mengunggah..." : "Unggah sekarang"}</span>
            </button>
          </div>
        )}
        {/* Storage Source Switcher & Stats */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center p-1 bg-zinc-900 border border-zinc-800 rounded-lg w-fit text-xs">
            <button
              onClick={() => onStorageFilterChange("local")}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-md font-medium transition-all cursor-pointer ${
                storageFilter === "local"
                  ? "bg-zinc-800 text-white shadow-sm"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              <HardDrive className="h-3.5 w-3.5 text-blue-400" />
              <span>Lokal Device (IndexedDB)</span>
            </button>
            <button
              onClick={() => onStorageFilterChange("gdrive")}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-md font-medium transition-all cursor-pointer ${
                storageFilter === "gdrive"
                  ? "bg-zinc-800 text-white shadow-sm"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              <Cloud className="h-3.5 w-3.5 text-emerald-400" />
              <span>Google Drive</span>
              {!isGdriveConnected && (
                <span className="text-[10px] bg-amber-500/20 text-amber-300 px-1 rounded">off</span>
              )}
            </button>
          </div>

          <div className="flex items-center gap-1 bg-zinc-900 border border-zinc-800 p-1 rounded-lg">
            <button
              onClick={() => onViewModeChange("grid")}
              className={`p-1.5 rounded cursor-pointer ${
                viewMode === "grid" ? "bg-zinc-800 text-white" : "text-zinc-400"
              }`}
              title="Grid View"
            >
              <Grid className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => onViewModeChange("list")}
              className={`p-1.5 rounded cursor-pointer ${
                viewMode === "list" ? "bg-zinc-800 text-white" : "text-zinc-400"
              }`}
              title="List View"
            >
              <List className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {/* Breadcrumbs Navigation Bar */}
        <div className="bg-zinc-900/60 border border-zinc-800/80 rounded-xl px-4 py-2.5 flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs flex-wrap">
            {currentFolderId && (
              <button
                onClick={onGoBack}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 transition-colors mr-1 cursor-pointer font-medium"
                title="Kembali ke folder sebelumnya"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                <span>Kembali</span>
              </button>
            )}

            <div className="flex items-center gap-1.5">
              {breadcrumbs.map((crumb, idx) => {
                const isLast = idx === breadcrumbs.length - 1;
                return (
                  <React.Fragment key={idx}>
                    {idx > 0 && <ChevronRight className="h-3.5 w-3.5 text-zinc-600 shrink-0" />}
                    <button
                      onClick={() => onBreadcrumb(crumb.id, idx)}
                      className={`transition-colors cursor-pointer ${
                        isLast
                          ? "text-blue-400 font-semibold cursor-default pointer-events-none"
                          : "text-zinc-400 hover:text-zinc-200 hover:underline"
                      }`}
                    >
                      {crumb.name}
                    </button>
                  </React.Fragment>
                );
              })}
            </div>
          </div>

          <span className="text-[11px] text-zinc-500 font-mono hidden sm:inline">
            {items.filter((f) => (f.parentId || null) === currentFolderId).length} item di direktori ini
          </span>
        </div>

        {/* Status pemuatan dari server NAS */}
        {connectionMode === "nas" && (nasFilesLoading || nasFilesError) && (
          <div
            className={`rounded-xl px-4 py-2.5 text-xs flex items-center gap-2 ${
              nasFilesError
                ? "bg-rose-950/50 border border-rose-800/60 text-rose-300"
                : "bg-zinc-900/60 border border-zinc-800/80 text-zinc-400"
            }`}
          >
            {nasFilesError ? (
              <>
                <WifiOff className="h-3.5 w-3.5 shrink-0" />
                <span>Gagal memuat dari server: {nasFilesError}</span>
                <button
                  onClick={() => onReload()}
                  className="ml-auto underline hover:text-white cursor-pointer shrink-0"
                >
                  Coba lagi
                </button>
              </>
            ) : (
              <>
                <RefreshCw className="h-3.5 w-3.5 animate-spin shrink-0" />
                <span>Memuat isi folder dari server...</span>
              </>
            )}
          </div>
        )}

        {/* Folders Section in Current Directory */}
        {(() => {
          const currentFolderItems = items.filter((f) => (f.parentId || null) === currentFolderId);
          const currentFolders = currentFolderItems.filter((f) => f.type === "folder");
          const currentFiles = currentFolderItems.filter((f) => f.type !== "folder");

          return (
            <>
              {currentFolders.length > 0 && (
                <div className="space-y-3">
                  <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                    Folder ({currentFolders.length})
                  </h2>
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                    {currentFolders.map((folder) => {
                      const childCount = allItems.filter((i) => (i.parentId || null) === folder.id).length;
                      return (
                        <div
                          key={folder.id}
                          onClick={() => onOpenFolder(folder)}
                          className="bg-zinc-900/40 hover:bg-zinc-900 border border-zinc-800/80 hover:border-blue-500/50 rounded-xl p-3.5 flex items-center justify-between cursor-pointer transition-all group shadow-sm hover:scale-[1.01]"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="h-9 w-9 rounded-lg bg-blue-500/10 flex items-center justify-center text-blue-400 shrink-0 group-hover:bg-blue-600 group-hover:text-white transition-colors">
                              <Folder className="h-5 w-5 fill-current" />
                            </div>
                            <div className="truncate">
                              <p className="text-xs font-medium text-zinc-200 group-hover:text-blue-400 transition-colors truncate">
                                {folder.name}
                              </p>
                              <p className="text-[11px] text-zinc-500">
                                {isForeign(folder)
                                  ? "Milik anggota lain • Klik untuk buka"
                                  : connectionMode === "nas"
                                  ? "Klik untuk buka"
                                  : `${childCount} item • Klik untuk buka`}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-0.5">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                onRename(folder);
                              }}
                              className="text-zinc-600 hover:text-blue-400 p-1 cursor-pointer"
                              title="Ganti Nama Folder"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                onMove(folder);
                              }}
                              className="text-zinc-600 hover:text-amber-400 p-1 cursor-pointer"
                              title="Pindahkan Folder"
                            >
                              <FolderInput className="h-3.5 w-3.5" />
                            </button>
                            <button
                              onClick={(e) => onDelete(folder.id, e)}
                              className="text-zinc-600 hover:text-rose-400 p-1 cursor-pointer"
                              title="Hapus Folder"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Files Section in Current Directory */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                    File ({currentFiles.length})
                  </h2>
                  <span className="text-[11px] text-zinc-500">
                    {connectionMode === "nas" ? "Tersimpan di server NAS" : "Tersimpan lokal & aman di browser"}
                  </span>
                </div>

                {currentFiles.length === 0 && currentFolders.length === 0 ? (
                  <div className="text-center py-12 border-2 border-dashed border-zinc-800/80 rounded-2xl bg-zinc-900/20">
                    <Folder className="h-12 w-12 text-zinc-600 mx-auto mb-3" />
                    <p className="text-sm font-semibold text-zinc-300">Folder ini masih kosong</p>
                    <p className="text-xs text-zinc-500 mt-1">
                      Gunakan tombol <strong>"Upload File Asli"</strong> atau <strong>"Folder Baru"</strong> di kanan atas untuk mengisi direktori ini.
                    </p>
                  </div>
                ) : viewMode === "grid" ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    {currentFiles.map((file) => (
                      <div
                        key={file.id}
                        className="bg-zinc-900/40 border border-zinc-800/80 rounded-xl p-4 flex flex-col justify-between hover:border-zinc-700 hover:bg-zinc-900/80 transition-all group"
                      >
                        <div className="flex items-start justify-between">
                          <div className="h-10 w-10 rounded-lg bg-zinc-800 flex items-center justify-center overflow-hidden">
                            {file.type === "image" ? (
                              <ThumbnailImage
                                blob={file.blob}
                                src={thumbnailUrl(file)}
                                alt={file.name}
                                className="h-full w-full object-cover"
                                fallback={<ImageIcon className="h-5 w-5 text-purple-400" />}
                              />
                            ) : file.type === "video" ? (
                              <Film className="h-5 w-5 text-emerald-400" />
                            ) : file.type === "archive" ? (
                              <FileArchive className="h-5 w-5 text-amber-400" />
                            ) : (
                              <FileText className="h-5 w-5 text-blue-400" />
                            )}
                          </div>

                          <div className="flex items-center gap-1">
                            <button
                              onClick={(e) => onFav(file.id, e)}
                              className={`p-1 cursor-pointer transition-colors ${
                                file.isFavorite ? "text-rose-500 fill-rose-500" : "text-zinc-500 hover:text-rose-400"
                              }`}
                              title="Favorit"
                            >
                              <Heart className={`h-3.5 w-3.5 ${file.isFavorite ? "fill-rose-500" : ""}`} />
                            </button>
                            {!isForeign(file) && (
                              <button
                                onClick={() => onShare(file)}
                                className="text-zinc-500 hover:text-blue-400 p-1 cursor-pointer"
                                title="Bagikan Link"
                              >
                                <Share2 className="h-3.5 w-3.5" />
                              </button>
                            )}
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                onRename(file);
                              }}
                              className="text-zinc-500 hover:text-blue-400 p-1 cursor-pointer"
                              title="Ganti Nama"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                onMove(file);
                              }}
                              className="text-zinc-500 hover:text-amber-400 p-1 cursor-pointer"
                              title="Pindahkan ke Folder"
                            >
                              <FolderInput className="h-3.5 w-3.5" />
                            </button>
                            <button
                              onClick={(e) => onDelete(file.id, e)}
                              className="text-zinc-500 hover:text-rose-400 p-1 cursor-pointer"
                              title="Hapus File"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>

                        <div className="mt-3">
                          <p className="text-xs font-medium text-zinc-200 line-clamp-1 group-hover:text-blue-400 transition-colors">
                            {file.name}
                          </p>
                          {isForeign(file) && (
                            <span className="inline-flex items-center gap-1 mt-1 text-[10px] px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30">
                              <Users className="h-2.5 w-2.5" />
                              Milik anggota lain
                            </span>
                          )}
                          <div className="flex items-center justify-between text-[11px] text-zinc-500 mt-1">
                            <span>{file.sizeStr}</span>
                            <span>{file.updatedAt}</span>
                          </div>
                        </div>

                        <div className="mt-3 pt-3 border-t border-zinc-800/60 flex items-center justify-between text-[10px]">
                          <span className="font-mono text-zinc-500 flex items-center gap-1">
                            <Shield className="h-3 w-3 text-emerald-500" /> {file.sha256 ? "SHA-256 Valid" : "Verified"}
                          </span>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => onOpenFile(file)}
                              className="text-zinc-400 hover:text-white cursor-pointer"
                              title="Lihat Detail"
                            >
                              <Eye className="h-3.5 w-3.5" />
                            </button>
                            <button
                              onClick={() => onDownload(file)}
                              className="text-zinc-400 hover:text-white cursor-pointer"
                              title="Download File Asli"
                            >
                              <Download className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="border border-zinc-800 rounded-xl overflow-hidden bg-zinc-900/20">
                    <table className="w-full text-left text-xs text-zinc-300">
                      <thead className="bg-zinc-900 border-b border-zinc-800 text-zinc-400">
                        <tr>
                          <th className="py-2.5 px-4 font-medium">Nama File</th>
                          <th className="py-2.5 px-4 font-medium">Ukuran</th>
                          <th className="py-2.5 px-4 font-medium">Waktu</th>
                          <th className="py-2.5 px-4 font-medium">Integritas</th>
                          <th className="py-2.5 px-4 text-right font-medium">Aksi</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-800/60">
                        {currentFiles.map((file) => (
                          <tr key={file.id} className="hover:bg-zinc-900/60 transition-colors">
                            <td className="py-2.5 px-4 font-medium text-zinc-200 flex items-center gap-2">
                              {file.type === "document" && <FileText className="h-4 w-4 text-blue-400" />}
                              {file.type === "video" && <Film className="h-4 w-4 text-emerald-400" />}
                              {file.type === "image" && <ImageIcon className="h-4 w-4 text-purple-400" />}
                              {file.type === "archive" && <FileArchive className="h-4 w-4 text-amber-400" />}
                              <span className="truncate max-w-xs">{file.name}</span>
                              {isForeign(file) && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30 shrink-0">
                                  Milik anggota lain
                                </span>
                              )}
                            </td>
                            <td className="py-2.5 px-4 font-mono text-zinc-400">{file.sizeStr}</td>
                            <td className="py-2.5 px-4 text-zinc-400">{file.updatedAt}</td>
                            <td className="py-2.5 px-4 font-mono text-[11px] text-zinc-500">{file.sha256 || "Valid"}</td>
                            <td className="py-2.5 px-4 text-right">
                              <button
                                onClick={(e) => onFav(file.id, e)}
                                className={`p-1 mr-1 cursor-pointer ${
                                  file.isFavorite ? "text-rose-500" : "text-zinc-500 hover:text-rose-400"
                                }`}
                              >
                                <Heart className="h-3.5 w-3.5" />
                              </button>
                              <button
                                onClick={() => onDownload(file)}
                                className="text-zinc-400 hover:text-white p-1 mr-1 cursor-pointer"
                                title="Download"
                              >
                                <Download className="h-3.5 w-3.5" />
                              </button>
                              <button
                                onClick={(e) => onDelete(file.id, e)}
                                className="text-zinc-500 hover:text-rose-400 p-1 cursor-pointer"
                                title="Hapus"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          );
        })()}
      </div>

  );
}
