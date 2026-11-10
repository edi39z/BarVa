"use client";

import React, { useState, useEffect, Suspense } from "react";
import { useParams } from "next/navigation";
import {
  FileText,
  Image as ImageIcon,
  Film,
  FileArchive,
  Download,
  Lock,
  ShieldCheck,
  AlertCircle,
  Loader2,
  Clock,
} from "lucide-react";
import { backendBase } from "@/lib/api/cloud";

type ShareInfo = {
  node_name: string;
  is_directory: boolean;
  size_bytes: number | null;
  mime_type: string | null;
  permission: string;
  expires_at: string | null;
  has_password: boolean;
};

function fmtBytes(n: number | null | undefined): string {
  if (!n || n <= 0) return "—";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(Math.floor(Math.log(n) / Math.log(1024)), units.length - 1);
  return `${(n / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

function iconFor(mime: string | null) {
  const m = (mime || "").toLowerCase();
  if (m.startsWith("image/")) return <ImageIcon className="h-6 w-6 text-purple-400" />;
  if (m.startsWith("video/") || m.startsWith("audio/"))
    return <Film className="h-6 w-6 text-emerald-400" />;
  if (m.includes("zip") || m.includes("rar") || m.includes("7z") || m.includes("gzip"))
    return <FileArchive className="h-6 w-6 text-amber-400" />;
  return <FileText className="h-6 w-6 text-blue-400" />;
}

function PublicShareContent() {
  const params = useParams();
  const token = (params?.token as string) || "";

  const [info, setInfo] = useState<ShareInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [password, setPassword] = useState("");
  const [unlocked, setUnlocked] = useState(false);
  const [checking, setChecking] = useState(false);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    if (!token) {
      setError("Tautan berbagi tidak lengkap.");
      setLoading(false);
      return;
    }
    fetch(`${backendBase()}/api/v1/public/share/${encodeURIComponent(token)}`)
      .then(async (res) => {
        const body = await res.json().catch(() => null);
        if (!res.ok) {
          throw new Error(
            body?.error?.message || `Tautan tidak dapat dibuka (${res.status}).`
          );
        }
        const data = body?.data as ShareInfo;
        setInfo(data);
        if (!data.has_password) setUnlocked(true);
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [token]);

  // Verifikasi password lewat endpoint khusus, tanpa menyentuh berkas.
  // Berlaku untuk share berkas maupun folder.
  async function handleUnlock(e: React.FormEvent) {
    e.preventDefault();
    if (!password) {
      setError("Silakan masukkan kata sandi.");
      return;
    }
    setChecking(true);
    setError("");
    try {
      const res = await fetch(
        `${backendBase()}/api/v1/public/share/${encodeURIComponent(token)}/verify`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ password }),
        }
      );
      if (res.status === 401) {
        throw new Error("Kata sandi salah.");
      }
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error?.message || `Gagal membuka tautan (${res.status}).`);
      }
      setUnlocked(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setChecking(false);
    }
  }

  function handleDownload() {
    if (!token) return;
    setDownloading(true);
    const query = info?.has_password && password
      ? `?password=${encodeURIComponent(password)}`
      : "";
    window.location.href = `${backendBase()}/api/v1/public/share/${encodeURIComponent(token)}/download${query}`;
    setTimeout(() => setDownloading(false), 1200);
  }

  function handleDownloadArchive() {
    if (!token) return;
    setDownloading(true);
    const query = info?.has_password && password
      ? `?password=${encodeURIComponent(password)}`
      : "";
    window.location.href = `${backendBase()}/api/v1/public/share/${encodeURIComponent(token)}/archive${query}`;
    setTimeout(() => setDownloading(false), 1500);
  }

  return (
    <div className="w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-3xl p-6 sm:p-8 shadow-2xl space-y-6 text-center">
      <div className="flex items-center justify-center gap-2.5">
        <div className="h-9 w-9 rounded-xl bg-blue-600 flex items-center justify-center font-bold text-white shadow-lg shadow-blue-500/20">
          N
        </div>
        <span className="font-semibold text-sm tracking-wide text-zinc-100">NAS Project Cloud</span>
      </div>

      {loading && (
        <div className="py-10 flex flex-col items-center gap-3 text-zinc-400">
          <Loader2 className="h-6 w-6 animate-spin text-blue-400" />
          <p className="text-xs">Memeriksa tautan...</p>
        </div>
      )}

      {!loading && error && !info && (
        <div className="space-y-3">
          <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-start gap-2 text-left">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
          <a
            href="/"
            className="block w-full bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-medium text-xs py-3 rounded-xl transition-colors"
          >
            Buka Aplikasi NAS
          </a>
        </div>
      )}

      {!loading && info && (
        <>
          <div className="space-y-1">
            <span className="text-[10px] uppercase font-bold tracking-wider text-blue-400 bg-blue-500/10 border border-blue-500/20 px-2.5 py-0.5 rounded-full">
              Tautan Berbagi Publik
            </span>
            <h1 className="text-lg font-bold text-zinc-100 pt-2">
              {info.is_directory ? "Folder Dibagikan" : "Berkas Siap Diunduh"}
            </h1>
          </div>

          <div className="bg-zinc-950 border border-zinc-800/80 rounded-2xl p-5 flex items-center gap-4 text-left">
            <div className="h-12 w-12 rounded-xl bg-zinc-900 border border-zinc-800 flex items-center justify-center shrink-0">
              {iconFor(info.mime_type)}
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="text-xs font-semibold text-zinc-200 truncate" title={info.node_name}>
                {info.node_name}
              </h2>
              <div className="flex items-center gap-2 text-[11px] text-zinc-500 mt-0.5 flex-wrap">
                <span>{fmtBytes(info.size_bytes)}</span>
                <span>•</span>
                <span className="font-mono text-emerald-400 flex items-center gap-1">
                  <ShieldCheck className="h-3 w-3" /> Akses tervalidasi server
                </span>
              </div>
              {info.expires_at && (
                <p className="text-[10px] text-zinc-500 mt-1 flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  Berlaku sampai{" "}
                  {new Date(info.expires_at).toLocaleString("id-ID", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </p>
              )}
            </div>
          </div>

          {!unlocked ? (
            <form onSubmit={handleUnlock} className="space-y-3 pt-1 text-left">
              <label className="text-xs font-medium text-zinc-300 flex items-center gap-1.5">
                <Lock className="h-3.5 w-3.5 text-amber-400" />
                <span>
                  {info.is_directory
                    ? "Folder ini diproteksi kata sandi:"
                    : "Berkas ini diproteksi kata sandi:"}
                </span>
              </label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Masukkan kata sandi pembuka..."
                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3.5 py-2.5 text-xs text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-blue-500"
              />
              {error && (
                <p className="text-[11px] text-rose-400 flex items-center gap-1">
                  <AlertCircle className="h-3.5 w-3.5" /> {error}
                </p>
              )}
              <button
                type="submit"
                disabled={checking}
                className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-medium text-xs py-2.5 rounded-xl transition-all cursor-pointer"
              >
                {checking && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                <span>{checking ? "Memeriksa..." : "Buka Tautan"}</span>
              </button>
            </form>
          ) : info.is_directory ? (
            <div className="space-y-3 pt-1">
              <button
                onClick={handleDownloadArchive}
                disabled={downloading}
                className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs py-3 rounded-xl transition-all shadow-lg shadow-blue-600/25 active:scale-[0.99] cursor-pointer disabled:opacity-50"
              >
                <Download className="h-4 w-4" />
                <span>{downloading ? "Menyiapkan Arsip..." : "Unduh Folder (ZIP)"}</span>
              </button>
              <p className="text-[10px] text-zinc-500 leading-relaxed">
                Seluruh isi folder dikemas dalam satu arsip zip dan dialirkan langsung dari server
                pemilik. Untuk folder besar, unduhan bisa memakan waktu.
              </p>
            </div>
          ) : (
            <div className="space-y-3 pt-1">
              <button
                onClick={handleDownload}
                disabled={downloading}
                className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs py-3 rounded-xl transition-all shadow-lg shadow-blue-600/25 active:scale-[0.99] cursor-pointer disabled:opacity-50"
              >
                <Download className="h-4 w-4" />
                <span>{downloading ? "Menyiapkan Unduhan..." : "Unduh Berkas Sekarang"}</span>
              </button>
              <p className="text-[10px] text-zinc-500">
                Diunduh langsung dari server penyimpanan privat pemilik.
              </p>
            </div>
          )}
        </>
      )}

      <div className="pt-2 border-t border-zinc-800/80 flex items-center justify-between text-[10px] text-zinc-500">
        <span>
          Token: <code className="font-mono text-zinc-400">{token ? `${token.substring(0, 10)}...` : "—"}</code>
        </span>
        <a href="/" className="text-blue-400 hover:underline">Buka Aplikasi NAS →</a>
      </div>
    </div>
  );
}

export default function PublicSharePage() {
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col items-center justify-center p-4">
      <Suspense fallback={<div className="text-zinc-400 text-xs">Memuat berkas berbagi...</div>}>
        <PublicShareContent />
      </Suspense>
    </div>
  );
}
