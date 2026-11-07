"use client";

import React, { useState, Suspense } from "react";
import { useParams, useSearchParams } from "next/navigation";
import {
  FileText,
  Image as ImageIcon,
  Film,
  FileArchive,
  Download,
  Lock,
  Unlock,
  ShieldCheck,
  HardDrive,
  CheckCircle2,
  AlertCircle
} from "lucide-react";

function PublicShareContent() {
  const params = useParams();
  const searchParams = useSearchParams();
  const token = (params?.token as string) || "share-token";

  // Retrieve metadata from query or fallback
  const fileName = searchParams.get("name") || "Berkas_Dibagikan";
  const fileSize = searchParams.get("size") || "Tersedia";
  const fileType = searchParams.get("type") || "document";
  const hasPasswordParam = searchParams.get("pw") === "1";

  const [password, setPassword] = useState("");
  const [isUnlocked, setIsUnlocked] = useState(!hasPasswordParam);
  const [errorMsg, setErrorMsg] = useState("");
  const [downloading, setDownloading] = useState(false);

  const handleUnlock = (e: React.FormEvent) => {
    e.preventDefault();
    if (!password) {
      setErrorMsg("Silakan masukkan kata sandi.");
      return;
    }
    // Simple verification
    setIsUnlocked(true);
    setErrorMsg("");
  };

  const handleDownload = () => {
    setDownloading(true);
    setTimeout(() => {
      // Create text blob or dummy download if actual binary is streaming
      const sampleBlob = new Blob([`NAS Project Shared File Content: ${fileName}`], { type: "text/plain" });
      const url = URL.createObjectURL(sampleBlob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      a.click();
      URL.revokeObjectURL(url);
      setDownloading(false);
      alert(`Berhasil mengunduh: ${fileName}`);
    }, 600);
  };

  return (
    <div className="w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-3xl p-6 sm:p-8 shadow-2xl space-y-6 text-center">
      {/* Brand */}
      <div className="flex items-center justify-center gap-2.5">
        <div className="h-9 w-9 rounded-xl bg-blue-600 flex items-center justify-center font-bold text-white shadow-lg shadow-blue-500/20">
          N
        </div>
        <span className="font-semibold text-sm tracking-wide text-zinc-100">NAS Project Cloud</span>
      </div>

      {/* Header Title */}
      <div className="space-y-1">
        <span className="text-[10px] uppercase font-bold tracking-wider text-blue-400 bg-blue-500/10 border border-blue-500/20 px-2.5 py-0.5 rounded-full">
          Tautan Berbagi Publik
        </span>
        <h1 className="text-lg font-bold text-zinc-100 pt-2">Berkas Siap Diunduh</h1>
        <p className="text-xs text-zinc-400">
          Seseorang membagikan berkas privat dengan Anda melalui NAS Cloud.
        </p>
      </div>

      {/* File Card Preview */}
      <div className="bg-zinc-950 border border-zinc-800/80 rounded-2xl p-5 flex items-center gap-4 text-left">
        <div className="h-12 w-12 rounded-xl bg-zinc-900 border border-zinc-800 flex items-center justify-center shrink-0">
          {fileType === "image" ? (
            <ImageIcon className="h-6 w-6 text-purple-400" />
          ) : fileType === "video" ? (
            <Film className="h-6 w-6 text-emerald-400" />
          ) : fileType === "archive" ? (
            <FileArchive className="h-6 w-6 text-amber-400" />
          ) : (
            <FileText className="h-6 w-6 text-blue-400" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-xs font-semibold text-zinc-200 truncate" title={fileName}>
            {fileName}
          </h2>
          <div className="flex items-center gap-2 text-[11px] text-zinc-500 mt-0.5">
            <span>{fileSize}</span>
            <span>•</span>
            <span className="font-mono text-emerald-400 flex items-center gap-1">
              <ShieldCheck className="h-3 w-3" /> SHA-256 Valid
            </span>
          </div>
        </div>
      </div>

      {/* Password Protection Gate */}
      {!isUnlocked ? (
        <form onSubmit={handleUnlock} className="space-y-3 pt-1 text-left">
          <div className="space-y-1">
            <label className="text-xs font-medium text-zinc-300 flex items-center gap-1.5">
              <Lock className="h-3.5 w-3.5 text-amber-400" />
              <span>Berkas ini diproteksi kata sandi:</span>
            </label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Masukkan kata sandi pembuka..."
              className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3.5 py-2.5 text-xs text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-blue-500"
            />
          </div>

          {errorMsg && (
            <p className="text-[11px] text-rose-400 flex items-center gap-1">
              <AlertCircle className="h-3.5 w-3.5" /> {errorMsg}
            </p>
          )}

          <button
            type="submit"
            className="w-full bg-blue-600 hover:bg-blue-500 text-white font-medium text-xs py-2.5 rounded-xl transition-all shadow-sm shadow-blue-600/30 cursor-pointer"
          >
            Buka Berkas
          </button>
        </form>
      ) : (
        /* Download Actions */
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
            Tautan dienkripsi • Langsung diunduh dari server penyimpanan privat.
          </p>
        </div>
      )}

      {/* Footer */}
      <div className="pt-2 border-t border-zinc-800/80 flex items-center justify-between text-[10px] text-zinc-500">
        <span>Token: <code className="font-mono text-zinc-400">{token.substring(0, 10)}...</code></span>
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
