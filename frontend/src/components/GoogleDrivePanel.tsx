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
} from "@/lib/api/cloud";

function fmtBytes(n: number): string {
  if (!n || n <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(Math.floor(Math.log(n) / Math.log(1024)), units.length - 1);
  return `${(n / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

function fileIcon(mime: string) {
  if (mime.includes("folder")) return <Folder className="h-4 w-4 text-amber-400 shrink-0" />;
  if (mime.startsWith("image/")) return <ImageIcon className="h-4 w-4 text-purple-400 shrink-0" />;
  if (mime.startsWith("video/")) return <Film className="h-4 w-4 text-emerald-400 shrink-0" />;
  if (mime.includes("zip") || mime.includes("rar") || mime.includes("tar"))
    return <FileArchive className="h-4 w-4 text-orange-400 shrink-0" />;
  return <FileText className="h-4 w-4 text-indigo-400 shrink-0" />;
}

export default function GoogleDrivePanel() {
  const [status, setStatus] = useState<GDriveStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  // form setup (sekali seumur pemasangan)
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [redirectUri, setRedirectUri] = useState(
    "http://localhost:8080/api/v1/gdrive/callback"
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
        setFiles(f.files || []);
      } catch (e) {
        setErr((e as Error).message);
        setFiles([]);
      } finally {
        setLoadingFiles(false);
      }
    },
    [search, folder]
  );

  useEffect(() => {
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
    <div className="max-w-5xl mx-auto space-y-6 pt-2">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-800 pb-4">
        <div>
          <h2 className="text-base font-semibold text-zinc-100 flex items-center gap-2">
            <Cloud className="h-5 w-5 text-emerald-400" />
            <span>Google Drive</span>
          </h2>
          <p className="text-xs text-zinc-400">
            Terhubung lewat server NAS — token di-refresh otomatis, tidak pernah
            kedaluwarsa tiap 1 jam.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {status?.connected ? (
            <span className="flex items-center gap-1.5 text-[11px] font-medium text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1 rounded-full">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              Terhubung
            </span>
          ) : (
            <span className="flex items-center gap-1.5 text-[11px] font-medium text-zinc-400 bg-zinc-800/60 border border-zinc-700 px-2.5 py-1 rounded-full">
              <span className="h-1.5 w-1.5 rounded-full bg-zinc-500" />
              Belum terhubung
            </span>
          )}
        </div>
      </div>

      {msg && (
        <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/25 text-emerald-300 text-xs flex items-start gap-2">
          <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />
          <span>{msg}</span>
        </div>
      )}
      {err && (
        <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/25 text-rose-300 text-xs flex items-start gap-2">
          <ShieldAlert className="h-4 w-4 shrink-0 mt-0.5" />
          <span className="break-all">{err}</span>
        </div>
      )}

      {/* STEP 1 — kredensial OAuth (sekali saja) */}
      {status && !status.has_client && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 space-y-4">
          <div className="flex items-center gap-2">
            <KeyRound className="h-4 w-4 text-amber-400" />
            <h3 className="text-sm font-semibold text-zinc-100">
              Langkah 1 — Daftarkan aplikasi sekali saja
            </h3>
          </div>
          <div className="text-[11px] text-zinc-400 space-y-1.5 leading-relaxed">
            <p>
              Supaya token tidak mati dalam 1 jam, aplikasi butuh{" "}
              <strong className="text-zinc-200">refresh token</strong> miliknya
              sendiri. Ini butuh satu OAuth Client dari Google Cloud Console —
              dibuat <strong className="text-zinc-200">satu kali</strong>, lalu
              dipakai selamanya oleh semua anggota keluarga.
            </p>
            <ol className="list-decimal ml-4 space-y-1">
              <li>
                Buka <span className="font-mono text-blue-400">console.cloud.google.com</span>{" "}
                → buat project (nama bebas).
              </li>
              <li>
                Menu <strong>APIs &amp; Services → Library</strong> → aktifkan{" "}
                <strong>Google Drive API</strong>.
              </li>
              <li>
                <strong>OAuth consent screen</strong> → tipe <em>External</em> →
                tambahkan email Anda sebagai <em>Test user</em>.
              </li>
              <li>
                <strong>Credentials → Create Credentials → OAuth client ID</strong>{" "}
                → tipe <em>Web application</em>.
              </li>
              <li>
                Di <em>Authorized redirect URIs</em>, tempel:{" "}
                <code className="text-amber-300 break-all">{redirectUri}</code>
              </li>
              <li>Salin Client ID &amp; Client Secret ke kolom di bawah.</li>
            </ol>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              placeholder="Client ID (…apps.googleusercontent.com)"
              className="bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-blue-500"
            />
            <input
              type="password"
              value={clientSecret}
              onChange={(e) => setClientSecret(e.target.value)}
              placeholder="Client Secret"
              className="bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-blue-500"
            />
            <input
              value={redirectUri}
              onChange={(e) => setRedirectUri(e.target.value)}
              placeholder="Redirect URI"
              className="sm:col-span-2 bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-zinc-200 font-mono placeholder:text-zinc-600 focus:outline-none focus:border-blue-500"
            />
          </div>

          <button
            onClick={handleSaveClient}
            disabled={busy || !clientId || !clientSecret}
            className="w-full sm:w-auto flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white text-xs font-semibold px-4 py-2.5 rounded-xl transition-colors cursor-pointer"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
            <span>Simpan Kredensial</span>
          </button>
        </div>
      )}

      {/* STEP 2 — hubungkan akun */}
      {status && status.has_client && !status.connected && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 text-center space-y-3">
          <div className="h-12 w-12 mx-auto rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
            <Cloud className="h-6 w-6 text-emerald-400" />
          </div>
          <h3 className="text-sm font-semibold text-zinc-100">
            Langkah 2 — Hubungkan akun Google Anda
          </h3>
          <p className="text-[11px] text-zinc-400 max-w-md mx-auto">
            Anda akan diarahkan ke halaman izin Google. Pilih{" "}
            <strong className="text-zinc-200">akun utama</strong> (yang punya
            Google One 5 TB). Setelah selesai, server menyimpan refresh token dan
            memperbarui akses otomatis.
          </p>
          <button
            onClick={handleConnect}
            disabled={busy}
            className="mx-auto flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white text-xs font-semibold px-4 py-2.5 rounded-xl transition-colors cursor-pointer"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ExternalLink className="h-4 w-4" />}
            <span>Hubungkan &amp; Beri Izin</span>
          </button>
        </div>
      )}

      {/* Terhubung */}
      {status?.connected && (
        <>
          {!status.full_drive && (
            <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/25 text-amber-300 text-xs flex items-start gap-2">
              <Info className="h-4 w-4 shrink-0 mt-0.5" />
              <span>
                Izin saat ini hanya <code>drive.file</code>, jadi Google
                menyembunyikan file lama Anda. Putuskan koneksi lalu hubungkan
                ulang lewat tombol di panel ini agar memakai izin penuh.
              </span>
            </div>
          )}

          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
                  <Cloud className="h-5 w-5 text-emerald-400" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-zinc-100">
                    {email || status.email || "Akun Google"}
                  </p>
                  <p className="text-[11px] text-zinc-500">
                    Refresh token aktif • akses diperbarui otomatis oleh server
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => loadDrive({ folder, q: search })}
                  className="flex items-center gap-1.5 text-[11px] text-zinc-300 bg-zinc-800 hover:bg-zinc-700 px-2.5 py-1.5 rounded-lg transition-colors cursor-pointer"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${loadingFiles ? "animate-spin" : ""}`} />
                  <span>Muat ulang</span>
                </button>
                <button
                  onClick={handleDisconnect}
                  className="flex items-center gap-1.5 text-[11px] text-rose-300 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 px-2.5 py-1.5 rounded-lg transition-colors cursor-pointer"
                >
                  <LogOut className="h-3.5 w-3.5" />
                  <span>Putuskan</span>
                </button>
              </div>
            </div>

            {quota && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-[11px] text-zinc-400">
                  <span>
                    {fmtBytes(quota.usage)} dari {fmtBytes(quota.limit)} terpakai
                  </span>
                  <span className="font-mono text-zinc-500">{pct.toFixed(1)}%</span>
                </div>
                <div className="h-2 w-full bg-zinc-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 rounded-full transition-all"
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <p className="text-[10px] text-zinc-500">
                  Sisa {fmtBytes(Math.max(0, quota.limit - quota.usage))}
                </p>
              </div>
            )}
          </div>

          {/* Search + breadcrumb */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-2">
            <div className="relative flex-1">
              <Search className="h-3.5 w-3.5 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
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
                placeholder="Cari file di seluruh Drive lalu tekan Enter..."
                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl pl-9 pr-3 py-2 text-xs text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-blue-500"
              />
            </div>
            {(folder || crumbs.length > 0) && (
              <button
                onClick={goBack}
                className="flex items-center gap-1.5 text-[11px] text-zinc-300 bg-zinc-800 hover:bg-zinc-700 px-3 py-2 rounded-xl transition-colors cursor-pointer"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                <span>Kembali</span>
              </button>
            )}
          </div>

          {crumbs.length > 0 && (
            <p className="text-[11px] text-zinc-500">
              {crumbs.map((c) => c.name).join(" / ")}
            </p>
          )}

          {/* File list */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
            {loadingFiles ? (
              <div className="p-10 flex items-center justify-center gap-2 text-zinc-400 text-xs">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Memuat isi Drive...</span>
              </div>
            ) : files.length === 0 ? (
              <div className="p-10 text-center space-y-1">
                <p className="text-xs font-medium text-zinc-300">
                  Tidak ada file di sini
                </p>
                <p className="text-[11px] text-zinc-500">
                  Coba kata kunci lain, atau pastikan akun yang terhubung berisi
                  file.
                </p>
              </div>
            ) : (
              <table className="w-full text-left text-xs">
                <thead className="bg-zinc-950 text-zinc-500 border-b border-zinc-800">
                  <tr>
                    <th className="py-2.5 px-4 font-medium">Nama</th>
                    <th className="py-2.5 px-4 font-medium">Ukuran</th>
                    <th className="py-2.5 px-4 font-medium">Diubah</th>
                    <th className="py-2.5 px-4 font-medium text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/70">
                  {files.map((f) => {
                    const isFolder = f.mimeType.includes("folder");
                    return (
                      <tr key={f.id} className="hover:bg-zinc-800/40">
                        <td className="py-2.5 px-4">
                          <button
                            onClick={() => (isFolder ? openFolder(f) : undefined)}
                            className={`flex items-center gap-2 max-w-md text-left ${
                              isFolder ? "hover:text-amber-300 cursor-pointer" : "cursor-default"
                            }`}
                          >
                            {fileIcon(f.mimeType)}
                            <span className="truncate text-zinc-200">{f.name}</span>
                          </button>
                        </td>
                        <td className="py-2.5 px-4 font-mono text-zinc-400">
                          {f.size ? fmtBytes(Number(f.size)) : isFolder ? "—" : "—"}
                        </td>
                        <td className="py-2.5 px-4 text-zinc-400">
                          {f.modifiedTime
                            ? new Date(f.modifiedTime).toLocaleDateString("id-ID", {
                                day: "2-digit",
                                month: "short",
                                year: "numeric",
                              })
                            : "—"}
                        </td>
                        <td className="py-2.5 px-4 text-right">
                          {!isFolder && (
                            <div className="inline-flex items-center gap-1">
                              <a
                                href={gdriveDownloadUrl(f.id)}
                                className="inline-flex items-center gap-1 text-emerald-400 hover:text-emerald-300 px-1.5 py-1"
                                title="Unduh lewat server NAS"
                              >
                                <Download className="h-3.5 w-3.5" />
                              </a>
                              {f.webViewLink && (
                                <a
                                  href={f.webViewLink}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="inline-flex items-center gap-1 text-zinc-400 hover:text-white px-1.5 py-1"
                                  title="Buka di Google Drive"
                                >
                                  <ExternalLink className="h-3.5 w-3.5" />
                                </a>
                              )}
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>

          <p className="text-[10px] text-zinc-600">
            File diunduh melalui backend {backendBase()} — access token Google
            tidak pernah dikirim ke browser.
          </p>
        </>
      )}
    </div>
  );
}
