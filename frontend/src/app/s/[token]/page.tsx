"use client";

import React, { useState, useEffect, Suspense } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
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
import { detectFileType } from "@/lib/fileTypes";
import ThemeToggle from "@/components/ThemeToggle";

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
  switch (detectFileType({ mime })) {
    case "image":
      return <ImageIcon className="h-6 w-6 text-[var(--tile-purple-fg)]" aria-hidden />;
    case "video":
      return <Film className="h-6 w-6 text-[var(--tile-green-fg)]" aria-hidden />;
    case "archive":
      return <FileArchive className="h-6 w-6 text-[var(--tile-amber-fg)]" aria-hidden />;
    default:
      return <FileText className="h-6 w-6 text-[var(--tile-blue-fg)]" aria-hidden />;
  }
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

  // Token kosong adalah kondisi statis, bukan hasil efek. Diturunkan saat render
  // supaya efek tidak perlu memanggil setState hanya untuk menandai galat.
  const isLoading = Boolean(token) && loading;
  const errorMessage = error || (token ? "" : "Tautan berbagi tidak lengkap.");

  useEffect(() => {
    if (!token) return;

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
    // Tujuan navigasi ada di origin backend (bukan halaman Next.js), jadi
    // router.push tidak berlaku — ini memicu unduhan dari server NAS.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.href = `${backendBase()}/api/v1/public/share/${encodeURIComponent(token)}/download${query}`;
    setTimeout(() => setDownloading(false), 1200);
  }

  function handleDownloadArchive() {
    if (!token) return;
    setDownloading(true);
    const query = info?.has_password && password
      ? `?password=${encodeURIComponent(password)}`
      : "";
    // Sama seperti unduhan berkas: endpoint arsip ada di origin backend.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.href = `${backendBase()}/api/v1/public/share/${encodeURIComponent(token)}/archive${query}`;
    setTimeout(() => setDownloading(false), 1500);
  }

  return (
    <div className="w-full max-w-md space-y-4">
      <div className="flex justify-end">
        <ThemeToggle />
      </div>

      <div className="card space-y-5 p-5 text-center sm:p-6">
        <div className="flex items-center justify-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-solid font-bold text-white shadow-brand">
            N
          </div>
          <span className="text-[13.5px] font-bold tracking-tight text-fg">Barva</span>
        </div>

        {isLoading && (
          <div className="flex flex-col items-center gap-2 py-10 text-muted">
            <Loader2 className="h-6 w-6 animate-spin text-brand" aria-hidden />
            <p className="text-[12px]">Memeriksa tautan…</p>
          </div>
        )}

        {!isLoading && errorMessage && !info && (
          <div className="space-y-3">
            <div className="flex items-start gap-2 rounded-xl border border-danger-border bg-danger-soft p-3 text-left text-[12px] text-danger">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              <span>{errorMessage}</span>
            </div>
            <Link href="/" className="btn btn-secondary w-full">
              Buka aplikasi
            </Link>
          </div>
        )}

        {!isLoading && info && (
          <>
            <div className="space-y-1.5">
              <span className="chip chip-brand">Tautan berbagi</span>
              <h1 className="pt-1 text-[18px] font-bold text-fg">
                {info.is_directory ? "Folder dibagikan" : "Berkas siap diunduh"}
              </h1>
            </div>

            <div className="flex items-center gap-3.5 rounded-2xl border border-line bg-surface-2 p-4 text-left">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-surface">
                {iconFor(info.mime_type)}
              </span>
              <div className="min-w-0 flex-1">
                <h2 className="truncate text-[12.5px] font-semibold text-fg" title={info.node_name}>
                  {info.node_name}
                </h2>
                <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px] text-subtle">
                  <span>{fmtBytes(info.size_bytes)}</span>
                  <span className="inline-flex items-center gap-1 text-success">
                    <ShieldCheck className="h-3 w-3" aria-hidden /> Diperiksa server
                  </span>
                </p>
                {info.expires_at && (
                  <p className="mt-1 flex items-center gap-1 text-[10.5px] text-subtle">
                    <Clock className="h-3 w-3" aria-hidden />
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
              <form onSubmit={handleUnlock} className="space-y-2.5 text-left">
                <label htmlFor="share-pass" className="flex items-center gap-1.5 text-[12px] font-semibold text-fg">
                  <Lock className="h-3.5 w-3.5 text-warn" aria-hidden />
                  {info.is_directory
                    ? "Folder ini dilindungi kata sandi"
                    : "Berkas ini dilindungi kata sandi"}
                </label>
                <input
                  id="share-pass"
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Masukkan kata sandi"
                  className="input"
                />
                {errorMessage && (
                  <p className="flex items-center gap-1 text-[11.5px] text-danger">
                    <AlertCircle className="h-3.5 w-3.5" aria-hidden /> {errorMessage}
                  </p>
                )}
                <button type="submit" disabled={checking} className="btn btn-primary btn-lg w-full">
                  {checking && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
                  {checking ? "Memeriksa…" : "Buka tautan"}
                </button>
              </form>
            ) : info.is_directory ? (
              <div className="space-y-2">
                <button onClick={handleDownloadArchive} disabled={downloading} className="btn btn-primary btn-lg w-full">
                  <Download className="h-4 w-4" aria-hidden />
                  {downloading ? "Menyiapkan arsip…" : "Unduh folder (ZIP)"}
                </button>
                <p className="text-[11px] leading-relaxed text-subtle">
                  Seluruh isi folder dikemas dalam satu arsip. Untuk folder besar, unduhan bisa
                  memakan waktu.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                <button onClick={handleDownload} disabled={downloading} className="btn btn-primary btn-lg w-full">
                  <Download className="h-4 w-4" aria-hidden />
                  {downloading ? "Menyiapkan unduhan…" : "Unduh berkas"}
                </button>
                <p className="text-[11px] text-subtle">
                  Diunduh langsung dari penyimpanan pribadi pemilik tautan.
                </p>
              </div>
            )}
          </>
        )}

        <div className="flex items-center justify-between border-t border-line pt-3 text-[10.5px] text-subtle">
          <span className="font-mono">
            {token ? `${token.substring(0, 10)}…` : "—"}
          </span>
          <Link href="/" className="font-semibold text-brand hover:underline">
            Buka aplikasi →
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function PublicSharePage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-canvas p-4 text-fg">
      <Suspense fallback={<div className="text-[12px] text-muted">Memuat berkas…</div>}>
        <PublicShareContent />
      </Suspense>
    </div>
  );
}
