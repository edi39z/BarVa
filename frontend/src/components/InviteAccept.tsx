"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  HardDrive,
  Folder,
  ArrowRight,
  CheckCircle2,
  Sparkles,
  AlertCircle,
  Loader2,
} from "lucide-react";
import { acceptInvite, peekInvite } from "@/lib/api/cloud";

type InviteInfo = {
  valid: boolean;
  status: string;
  name: string;
  email: string;
  role: string;
  quota_gb: number;
  expires_at: string;
};

export default function InviteAccept({ token }: { token?: string }) {
  const router = useRouter();
  const [info, setInfo] = useState<InviteInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [joining, setJoining] = useState(false);
  const [joined, setJoined] = useState(false);

  useEffect(() => {
    if (!token) {
      setError("Tautan undangan tidak lengkap. Minta tautan baru ke pemilik NAS.");
      setLoading(false);
      return;
    }
    peekInvite(token)
      .then((d) => setInfo(d))
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [token]);

  async function handleAccept() {
    if (!token) return;
    setJoining(true);
    setError("");
    try {
      const res = await acceptInvite(token);
      localStorage.setItem("nas_current_user", JSON.stringify(res.member));
      setJoined(true);
      setTimeout(() => router.push("/"), 1400);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setJoining(false);
    }
  }

  return (
    <div className="w-full max-w-lg bg-zinc-900 border border-zinc-800 rounded-3xl p-6 sm:p-8 shadow-2xl space-y-6 text-center">
      <div className="flex items-center justify-center gap-2.5">
        <div className="h-10 w-10 rounded-xl bg-blue-600 flex items-center justify-center font-bold text-lg text-white shadow-lg shadow-blue-500/25">
          N
        </div>
        <div>
          <span className="font-bold text-sm tracking-wide text-zinc-100 block text-left">
            NAS Project
          </span>
          <span className="text-[10px] text-emerald-400 font-medium block text-left">
            Family Cloud Storage
          </span>
        </div>
      </div>

      {loading && (
        <div className="py-10 flex flex-col items-center gap-3 text-zinc-400">
          <Loader2 className="h-6 w-6 animate-spin text-blue-400" />
          <p className="text-xs">Memeriksa undangan...</p>
        </div>
      )}

      {!loading && error && (
        <div className="space-y-4">
          <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-start gap-2 text-left">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
          <a
            href="/"
            className="block w-full bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-medium text-xs py-3 rounded-xl transition-colors"
          >
            Buka Dashboard NAS
          </a>
        </div>
      )}

      {!loading && !error && info && (
        <>
          <div className="space-y-2">
            <span className="text-[11px] uppercase font-bold tracking-wider text-purple-400 bg-purple-500/10 border border-purple-500/20 px-3 py-1 rounded-full">
              Undangan Anggota Keluarga
            </span>
            <h1 className="text-xl sm:text-2xl font-bold text-white pt-2">
              Halo, {info.name}! 👋
            </h1>
            <p className="text-xs sm:text-sm text-zinc-300 max-w-md mx-auto">
              Anda diundang bergabung ke penyimpanan cloud keluarga. Undangan ini
              berlaku sampai{" "}
              <strong>
                {new Date(info.expires_at).toLocaleDateString("id-ID", {
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                })}
              </strong>
              .
            </p>
          </div>

          <div className="bg-zinc-950 border border-zinc-800/80 rounded-2xl p-5 text-left space-y-3.5">
            <h2 className="text-xs font-semibold text-zinc-200 uppercase tracking-wider">
              Hak Akses Anda
            </h2>
            <div className="space-y-2.5 text-xs text-zinc-300">
              <div className="flex items-start gap-3">
                <div className="h-7 w-7 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400 shrink-0">
                  <HardDrive className="h-4 w-4" />
                </div>
                <div>
                  <p className="font-medium text-zinc-200">
                    Kuota Privat {info.quota_gb} GB
                  </p>
                  <p className="text-[11px] text-zinc-500">
                    Berkas pribadi Anda tidak terlihat oleh anggota lain.
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="h-7 w-7 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 shrink-0">
                  <Folder className="h-4 w-4" />
                </div>
                <div>
                  <p className="font-medium text-zinc-200">
                    Folder Bersama Keluarga
                  </p>
                  <p className="text-[11px] text-zinc-500">
                    Lihat dan unggah foto serta arsip keluarga.
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="h-7 w-7 rounded-lg bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400 shrink-0">
                  <Sparkles className="h-4 w-4" />
                </div>
                <div>
                  <p className="font-medium text-zinc-200">
                    Studio Foto &amp; Dokumen
                  </p>
                  <p className="text-[11px] text-zinc-500">
                    Pasfoto 3x4/4x6, kompres foto, gabung PDF — langsung di HP.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {!info.valid && (
            <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs text-left">
              Status undangan: <strong>{info.status}</strong>. Undangan ini tidak
              bisa dipakai lagi.
            </div>
          )}

          {joined ? (
            <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs flex items-center justify-center gap-2">
              <CheckCircle2 className="h-5 w-5" />
              <span className="font-medium">
                Berhasil bergabung! Mengalihkan ke dashboard...
              </span>
            </div>
          ) : (
            <button
              onClick={handleAccept}
              disabled={!info.valid || joining}
              className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold text-xs py-3.5 rounded-xl transition-all shadow-lg shadow-blue-600/30 cursor-pointer"
            >
              {joining ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <ArrowRight className="h-4 w-4" />
              )}
              <span>
                {joining ? "Memproses..." : "Terima Undangan & Masuk"}
              </span>
            </button>
          )}
        </>
      )}
    </div>
  );
}
