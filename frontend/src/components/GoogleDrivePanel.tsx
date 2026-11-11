"use client";

import React, { useCallback, useEffect, useState } from "react";
import {
  Cloud,
  Folder,
  FileText,
  Image as ImageIcon,
  Film,
  FileArchive,
  Download,
  ExternalLink,
  RefreshCw,
  Search,
  ShieldCheck,
  ShieldAlert,
  LogOut,
  CheckCircle2,
  Loader2,
  ArrowLeft,
  Info,
  KeyRound,
  MoreVertical,
  Eye,
} from "lucide-react";
import {
  GDriveFile,
  GDriveStatus,
  backendBase,
  gdriveAuthUrl,
  gdriveDisconnect,
  gdriveDownloadUrl,
  gdriveFiles,
  gdriveQuota,
  gdriveSaveClient,
  gdriveStatus,
  gdriveUploadFile,
} from "@/lib/api/cloud";
import type { DisplayItem } from "@/lib/displayItem";
import { detectFileType } from "@/lib/fileTypes";
import ThumbnailImage from "@/components/ThumbnailImage";
import type { LongPressPoint } from "@/hooks/useLongPress";
import type { SelectModifiers } from "@/hooks/useFileSelection";
import { Check } from "lucide-react";

function fmtBytes(n: number): string {
  if (!n || n <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(Math.floor(Math.log(n) / Math.log(1024)), units.length - 1);
  return `${(n / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

function fileIcon(mime: string) {
  if (mime.includes("folder")) return <Folder className="h-4 w-4 shrink-0 text-[var(--tile-amber-fg)]" aria-hidden />;
  if (mime.startsWith("image/")) return <ImageIcon className="h-4 w-4 shrink-0 text-[var(--tile-purple-fg)]" aria-hidden />;
  if (mime.startsWith("video/")) return <Film className="h-4 w-4 shrink-0 text-[var(--tile-green-fg)]" aria-hidden />;
  if (mime.includes("zip") || mime.includes("rar") || mime.includes("tar"))
    return <FileArchive className="h-4 w-4 shrink-0 text-[var(--tile-amber-fg)]" aria-hidden />;
  return <FileText className="h-4 w-4 shrink-0 text-[var(--tile-blue-fg)]" aria-hidden />;
}

export function gdriveFileToDisplayItem(f: GDriveFile): DisplayItem {
  const isFolder = f.mimeType.includes("folder");
  const type = isFolder ? "folder" : detectFileType({ mime: f.mimeType, name: f.name });
  const dlUrl = isFolder ? undefined : gdriveDownloadUrl(f.id);
  return {
    id: `gdrive:${f.id}`,
    name: f.name,
    type,
    sizeStr: f.size ? fmtBytes(Number(f.size)) : isFolder ? "Folder" : "—",
    sizeBytes: f.size ? Number(f.size) : 0,
    updatedAt: f.modifiedTime
      ? new Date(f.modifiedTime).toLocaleDateString("id-ID", {
          day: "2-digit",
          month: "short",
          year: "numeric",
        })
      : "—",
    updatedAtISO: f.modifiedTime,
    source: "gdrive",
    readOnly: true,
    downloadUrl: dlUrl,
    previewUrl: f.thumbnailLink || dlUrl,
  };
}

interface GoogleDrivePanelProps {
  selectionMode?: boolean;
  selectedIds?: string[];
  onToggleSelect?: (item: DisplayItem, modifiers: SelectModifiers) => void;
  onOpenFile?: (item: DisplayItem) => void;
  onDownload?: (item: DisplayItem) => void;
  onOpenMenu?: (item: DisplayItem, anchor: LongPressPoint) => void;
  onItemsLoaded?: (items: DisplayItem[]) => void;
}

export default function GoogleDrivePanel({
  selectionMode = false,
  selectedIds = [],
  onToggleSelect,
  onOpenFile,
  onDownload,
  onOpenMenu,
  onItemsLoaded,
}: GoogleDrivePanelProps = {}) {
  const [status, setStatus] = useState<GDriveStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [draggingOver, setDraggingOver] = useState(false);
  const [uploadingDrive, setUploadingDrive] = useState(false);

  // form setup (sekali seumur pemasangan)
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [redirectUri, setRedirectUri] = useState(() =>
    typeof window !== "undefined"
      ? `${backendBase()}/api/v1/gdrive/callback`
      : "http://localhost:8080/api/v1/gdrive/callback"
  );

  // data drive
  const [files, setFiles] = useState<GDriveFile[]>([]);
  const [quota, setQuota] = useState<{ limit: number; usage: number } | null>(null);
  const [email, setEmail] = useState("");
  const [search, setSearch] = useState("");
  const [folder, setFolder] = useState<string>("");
  const [crumbs, setCrumbs] = useState<{ id: string; name: string }[]>([]);
  const [loadingFiles, setLoadingFiles] = useState(false);

  const refreshStatus = useCallback(async () => {
    try {
      const s = await gdriveStatus();
      setStatus(s);
      if (s.redirect_uri) setRedirectUri(s.redirect_uri);
      if (s.email) setEmail(s.email);
      return s;
    } catch (e) {
      setErr((e as Error).message);
      return null;
    }
  }, []);

  const loadDrive = useCallback(
    async (opts?: { q?: string; folder?: string }) => {
      setLoadingFiles(true);
      setErr("");
      try {
        const [q, f] = await Promise.all([
          gdriveQuota(),
          gdriveFiles({
            q: opts?.q ?? (search || undefined),
            folder: opts?.folder ?? (folder || undefined),
            limit: 100,
          }),
        ]);
        if (q.storageQuota) {
          setQuota({
            limit: Number(q.storageQuota.limit || 0),
            usage: Number(q.storageQuota.usage || 0),
          });
        }
        if (q.user?.emailAddress) setEmail(q.user.emailAddress);
        const list = f.files || [];
        setFiles(list);
        onItemsLoaded?.(list.map(gdriveFileToDisplayItem));
      } catch (e) {
        setErr((e as Error).message);
        setFiles([]);
        onItemsLoaded?.([]);
      } finally {
        setLoadingFiles(false);
      }
    },
    [search, folder, onItemsLoaded]
  );

  async function handleDropFiles(fileList: FileList | File[]) {
    const arr = Array.from(fileList);
    if (arr.length === 0) return;
    setUploadingDrive(true);
    setErr("");
    setMsg(`Mengunggah ${arr.length} berkas ke Google Drive…`);
    try {
      for (const file of arr) {
        await gdriveUploadFile(file, folder || undefined);
      }
      setMsg(`Berhasil mengunggah ${arr.length} berkas ke Google Drive.`);
      await loadDrive({ folder, q: search });
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setUploadingDrive(false);
    }
  }

  useEffect(() => {
    // Status Drive diambil sekali saat panel dibuka. Pemicunya mount, bukan
    // render, jadi setState di dalam pemuat ini memang disengaja.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refreshStatus().then((s) => {
      if (s?.connected) loadDrive({ folder: "" });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSaveClient() {
    setBusy(true);
    setErr("");
    setMsg("");
    try {
      await gdriveSaveClient(clientId.trim(), clientSecret.trim(), redirectUri.trim());
      setMsg("Kredensial disimpan. Sekarang klik Hubungkan.");
      await refreshStatus();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function handleConnect() {
    setBusy(true);
    setErr("");
    try {
      const { url } = await gdriveAuthUrl();
      window.open(url, "_blank", "noopener,noreferrer");
      setMsg("Selesaikan izin di tab Google, lalu kembali ke sini.");
      // pantau sampai terhubung
      let tries = 0;
      const timer = setInterval(async () => {
        tries += 1;
        const s = await refreshStatus();
        if (s?.connected || tries > 60) {
          clearInterval(timer);
          if (s?.connected) {
            setMsg("Google Drive berhasil terhubung.");
            loadDrive({ folder: "" });
          }
        }
      }, 2000);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function handleDisconnect() {
    if (!confirm("Putuskan koneksi Google Drive dari server ini?")) return;
    setBusy(true);
    try {
      await gdriveDisconnect();
      setFiles([]);
      setQuota(null);
      await refreshStatus();
      setMsg("Koneksi Google Drive diputus.");
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function openFolder(f: GDriveFile) {
    setCrumbs((c) => [...c, { id: f.id, name: f.name }]);
    setFolder(f.id);
    loadDrive({ folder: f.id, q: "" });
  }

  function goBack() {
    const next = crumbs.slice(0, -1);
    setCrumbs(next);
    const id = next.length ? next[next.length - 1].id : "";
    setFolder(id);
    loadDrive({ folder: id, q: "" });
  }

  const pct = quota && quota.limit > 0 ? Math.min(100, (quota.usage / quota.limit) * 100) : 0;

  return (
    <div className="mx-auto max-w-5xl space-y-4 pb-24 lg:pb-6">
      <div className="flex flex-col gap-3 border-b border-line pb-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-[17px] font-bold text-fg">
            <Cloud className="h-[18px] w-[18px] text-[var(--tile-green-fg)]" aria-hidden />
            Google Drive
          </h1>
          <p className="mt-1 max-w-xl text-[12.5px] leading-relaxed text-subtle">
            Sambungkan akun Google agar berkas Drive bisa dibuka dari sini. Izin diperbarui otomatis
            oleh server.
          </p>
        </div>
        {status?.connected ? (
          <span className="chip chip-success">
            <span className="h-1.5 w-1.5 rounded-full bg-success" aria-hidden />
            Terhubung
          </span>
        ) : (
          <span className="chip chip-neutral">
            <span className="h-1.5 w-1.5 rounded-full bg-subtle" aria-hidden />
            Belum terhubung
          </span>
        )}
      </div>

      {msg && (
        <div
          role="status"
          className="flex items-start gap-2 rounded-xl border border-success-border bg-success-soft px-3.5 py-2.5 text-[12.5px] text-success"
        >
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <span>{msg}</span>
        </div>
      )}
      {err && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-xl border border-danger-border bg-danger-soft px-3.5 py-2.5 text-[12.5px] text-danger"
        >
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <span className="break-all">{err}</span>
        </div>
      )}

      {/* Langkah 1 — kredensial OAuth */}
      {status && !status.has_client && (
        <div className="card space-y-4 p-4 sm:p-5">
          <div className="flex items-center gap-2">
            <KeyRound className="h-4 w-4 text-warn" aria-hidden />
            <h2 className="text-[14px] font-bold text-fg">Langkah 1 — Daftarkan aplikasi (sekali saja)</h2>
          </div>
          <div className="space-y-2 text-[12px] leading-relaxed text-muted">
            <p>
              Agar akses tidak terputus setiap jam, server butuh izin permanen dari akun Google Anda.
              Ini cukup dilakukan satu kali oleh pemilik NAS.
            </p>
            <ol className="ml-4 list-decimal space-y-1">
              <li>
                Buka <span className="font-mono text-brand">console.cloud.google.com</span>, buat
                project baru.
              </li>
              <li>
                Buka <strong className="font-semibold text-fg">APIs &amp; Services → Library</strong>,
                aktifkan <strong className="font-semibold text-fg">Google Drive API</strong>.
              </li>
              <li>
                Isi <strong className="font-semibold text-fg">OAuth consent screen</strong> tipe{" "}
                <em>External</em>, tambahkan email Anda sebagai test user.
              </li>
              <li>
                Buat <strong className="font-semibold text-fg">OAuth client ID</strong> tipe{" "}
                <em>Web application</em>.
              </li>
              <li>
                Tempel alamat ini di <em>Authorized redirect URIs</em>:{" "}
                <code className="break-all text-warn">{redirectUri}</code>
              </li>
              <li>Salin Client ID dan Client Secret ke kolom di bawah.</li>
            </ol>
          </div>

          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            <input
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              placeholder="Client ID (…apps.googleusercontent.com)"
              aria-label="Client ID"
              className="input"
            />
            <input
              type="password"
              value={clientSecret}
              onChange={(e) => setClientSecret(e.target.value)}
              placeholder="Client Secret"
              aria-label="Client Secret"
              className="input"
            />
            <input
              value={redirectUri}
              onChange={(e) => setRedirectUri(e.target.value)}
              placeholder="Redirect URI"
              aria-label="Redirect URI"
              className="input font-mono sm:col-span-2"
            />
          </div>

          <button
            onClick={handleSaveClient}
            disabled={busy || !clientId || !clientSecret}
            className="btn btn-primary w-full sm:w-auto"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <ShieldCheck className="h-4 w-4" aria-hidden />}
            Simpan kredensial
          </button>
        </div>
      )}

      {/* Langkah 2 — hubungkan akun */}
      {status && status.has_client && !status.connected && (
        <div className="card space-y-3 p-6 text-center">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-success-soft text-success">
            <Cloud className="h-6 w-6" aria-hidden />
          </span>
          <h2 className="text-[14px] font-bold text-fg">Langkah 2 — Hubungkan akun Google</h2>
          <p className="mx-auto max-w-md text-[12px] leading-relaxed text-muted">
            Anda akan diarahkan ke halaman izin Google. Pilih akun utama yang menyimpan berkas Drive.
            Setelah selesai, server menyimpan izin tersebut dan memperbaruinya otomatis.
          </p>
          <button onClick={handleConnect} disabled={busy} className="btn btn-primary mx-auto">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <ExternalLink className="h-4 w-4" aria-hidden />}
            Hubungkan akun
          </button>
        </div>
      )}

      {status?.connected && (
        <>
          {!status.full_drive && (
            <div className="flex items-start gap-2 rounded-xl border border-warn-border bg-warn-soft px-3.5 py-2.5 text-[12px] text-warn">
              <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              <span>
                Izin saat ini hanya <code>drive.file</code>, sehingga berkas lama tidak terlihat.
                Putuskan koneksi lalu hubungkan ulang agar memakai izin penuh.
              </span>
            </div>
          )}

          <div className="card space-y-4 p-4 sm:p-5">
            <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-success-soft text-success">
                  <Cloud className="h-5 w-5" aria-hidden />
                </span>
                <div className="min-w-0">
                  <p className="truncate text-[13px] font-semibold text-fg">
                    {email || status.email || "Akun Google"}
                  </p>
                  <p className="text-[11.5px] text-subtle">Akses diperbarui otomatis oleh server</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => loadDrive({ folder, q: search })} className="btn btn-sm btn-secondary">
                  <RefreshCw className={`h-3.5 w-3.5 ${loadingFiles ? "animate-spin" : ""}`} aria-hidden />
                  Muat ulang
                </button>
                <button onClick={handleDisconnect} className="btn btn-sm btn-danger">
                  <LogOut className="h-3.5 w-3.5" aria-hidden />
                  Putuskan
                </button>
              </div>
            </div>

            {quota && (
              <div>
                <div className="flex items-center justify-between text-[11.5px] text-muted">
                  <span>
                    {fmtBytes(quota.usage)} dari {fmtBytes(quota.limit)} terpakai
                  </span>
                  <span className="font-semibold tabular-nums text-fg">{pct.toFixed(1)}%</span>
                </div>
                <div
                  className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-surface-3"
                  role="progressbar"
                  aria-label="Pemakaian Google Drive"
                  aria-valuenow={Math.round(pct)}
                  aria-valuemin={0}
                  aria-valuemax={100}
                >
                  <div className="h-full rounded-full bg-success transition-all" style={{ width: `${pct}%` }} />
                </div>
                <p className="mt-1 text-[11px] text-subtle">Sisa {fmtBytes(Math.max(0, quota.limit - quota.usage))}</p>
              </div>
            )}
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-subtle" aria-hidden />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    setCrumbs([]);
                    setFolder("");
                    loadDrive({ folder: "", q: search });
                  }
                }}
                placeholder="Cari berkas di Drive, lalu tekan Enter…"
                aria-label="Cari berkas di Google Drive"
                className="input pl-9"
              />
            </div>
            {(folder || crumbs.length > 0) && (
              <button onClick={goBack} className="btn btn-secondary">
                <ArrowLeft className="h-4 w-4" aria-hidden />
                Kembali
              </button>
            )}
          </div>

          {crumbs.length > 0 && (
            <p className="text-[11.5px] text-subtle">{crumbs.map((c) => c.name).join(" / ")}</p>
          )}

          <div
            onDragOver={(e) => {
              if (e.dataTransfer.types.includes("Files")) {
                e.preventDefault();
                setDraggingOver(true);
              }
            }}
            onDragLeave={() => setDraggingOver(false)}
            onDrop={(e) => {
              if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                e.preventDefault();
                setDraggingOver(false);
                void handleDropFiles(e.dataTransfer.files);
              }
            }}
            className={`card relative overflow-hidden transition-colors ${
              draggingOver ? "border-2 border-dashed border-brand bg-brand-soft/20" : ""
            }`}
          >
            {uploadingDrive && (
              <div className="flex items-center gap-2 border-b border-line bg-brand-soft/40 px-4 py-2 text-[12px] text-brand">
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                Mengunggah berkas ke Google Drive…
              </div>
            )}
            {loadingFiles ? (
              <div className="flex items-center justify-center gap-2 p-10 text-[12.5px] text-muted">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                Memuat isi Drive…
              </div>
            ) : files.length === 0 ? (
              <div className="space-y-1 p-10 text-center">
                <p className="text-[12.5px] font-semibold text-fg">Tidak ada berkas di sini</p>
                <p className="text-[11.5px] text-subtle">
                  Coba kata kunci lain, buka folder lain, atau seret berkas dari komputer ke sini.
                </p>
              </div>
            ) : (
              <ul className="divide-y divide-line">
                {files.map((f) => {
                  const isFolder = f.mimeType.includes("folder");
                  const item = gdriveFileToDisplayItem(f);
                  const selected = selectedIds.includes(item.id);
                  const isImage = item.type === "image";
                  return (
                    <li
                      key={f.id}
                      draggable={!isFolder}
                      onDragStart={(e) => {
                        if (isFolder) return;
                        const allDisplay = files.filter((x) => !x.mimeType.includes("folder")).map(gdriveFileToDisplayItem);
                        const toDrag =
                          selected && selectedIds.length > 1
                            ? allDisplay.filter((d) => selectedIds.includes(d.id))
                            : [item];
                        e.dataTransfer.setData("application/x-barva-items", JSON.stringify(toDrag));
                        e.dataTransfer.effectAllowed = "copy";
                      }}
                      onContextMenu={(event) => {
                        if (isFolder || !onOpenMenu) return;
                        event.preventDefault();
                        event.stopPropagation();
                        onOpenMenu(item, { x: event.clientX, y: event.clientY });
                      }}
                      className={`flex items-center gap-2.5 px-3 py-2.5 transition-colors hover:bg-surface-2 ${
                        selected ? "bg-brand-soft/40" : ""
                      }`}
                    >
                      {selectionMode && !isFolder && onToggleSelect && (
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            onToggleSelect(item, event);
                          }}
                          className="shrink-0"
                          aria-pressed={selected}
                        >
                          <span
                            className={`flex h-6 w-6 items-center justify-center rounded-md border-2 transition-colors ${
                              selected
                                ? "border-brand bg-brand text-white"
                                : "border-line-strong bg-surface/90 text-transparent"
                            }`}
                          >
                            <Check className="h-3.5 w-3.5" />
                          </span>
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={(event) => {
                          if (selectionMode && !isFolder && onToggleSelect) {
                            onToggleSelect(item, event);
                            return;
                          }
                          if (isFolder) openFolder(f);
                          else if (onOpenFile) onOpenFile(item);
                          else if (item.previewUrl) window.open(item.previewUrl, "_blank", "noopener,noreferrer");
                        }}
                        className="flex min-w-0 flex-1 items-center gap-2.5 text-left hover:text-brand"
                      >
                        {isImage && item.previewUrl ? (
                          <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-surface-2">
                            <ThumbnailImage
                              src={item.previewUrl}
                              alt={f.name}
                              className="h-full w-full object-cover"
                              fallback={fileIcon(f.mimeType)}
                            />
                          </span>
                        ) : (
                          fileIcon(f.mimeType)
                        )}
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[12.5px] font-medium text-fg">{f.name}</span>
                          <span className="block text-[11px] text-subtle">
                            {f.size ? fmtBytes(Number(f.size)) : isFolder ? "Folder" : "—"}
                            {f.modifiedTime
                              ? ` · ${new Date(f.modifiedTime).toLocaleDateString("id-ID", {
                                  day: "2-digit",
                                  month: "short",
                                  year: "numeric",
                                })}`
                              : ""}
                          </span>
                        </span>
                      </button>
                      {!isFolder && (
                        <div className="flex shrink-0 items-center gap-0.5">
                          <button
                            type="button"
                            onClick={() =>
                              onOpenFile
                                ? onOpenFile(item)
                                : item.previewUrl && window.open(item.previewUrl, "_blank", "noopener")
                            }
                            className="icon-btn h-8 w-8"
                            title="Pratinjau"
                            aria-label={`Pratinjau ${f.name}`}
                          >
                            <Eye className="h-4 w-4" aria-hidden />
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              onDownload
                                ? onDownload(item)
                                : window.open(gdriveDownloadUrl(f.id), "_blank", "noopener")
                            }
                            className="icon-btn h-8 w-8"
                            title="Unduh lewat server"
                            aria-label={`Unduh ${f.name}`}
                          >
                            <Download className="h-4 w-4" aria-hidden />
                          </button>
                          {f.webViewLink && (
                            <a
                              href={f.webViewLink}
                              target="_blank"
                              rel="noreferrer"
                              className="icon-btn h-8 w-8"
                              title="Buka di Google Drive"
                              aria-label={`Buka ${f.name} di Google Drive`}
                            >
                              <ExternalLink className="h-4 w-4" aria-hidden />
                            </a>
                          )}
                          {onOpenMenu && (
                            <button
                              type="button"
                              onClick={(event) => {
                                event.preventDefault();
                                event.stopPropagation();
                                const rect = event.currentTarget.getBoundingClientRect();
                                onOpenMenu(item, { x: rect.left, y: rect.bottom + 4 });
                              }}
                              className="icon-btn h-8 w-8"
                              title="Alat AI & Aksi lain"
                              aria-label={`Aksi lain untuk ${f.name}`}
                            >
                              <MoreVertical className="h-4 w-4" aria-hidden />
                            </button>
                          )}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <p className="text-[10.5px] text-subtle">
            Berkas diunduh lewat server {backendBase()} — token Google tidak pernah dikirim ke browser.
          </p>
        </>
      )}
    </div>
  );
}
