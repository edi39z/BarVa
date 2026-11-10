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
import { loginNas, registerNas } from "@/lib/api/nas";
import ThemeToggle from "@/components/ThemeToggle";

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

  // Undangan hanya menyimpan email. Untuk benar-benar bisa masuk, penerima
  // butuh akun di server: username dan password dipilih di sini.
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

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

  async function handleAccept(e: React.FormEvent) {
    e.preventDefault();
    if (!token || !info) return;

    if (username.trim().length < 3) {
      setError("Username minimal 3 karakter.");
      return;
    }
    if (password.length < 8) {
      setError("Kata sandi minimal 8 karakter.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Konfirmasi kata sandi tidak cocok.");
      return;
    }

    setJoining(true);
    setError("");
    try {
      // 1. Buat akun dengan membawa token undangan, supaya server menerapkan
      //    role dan kuota dari undangan (bukan default member tanpa kuota).
      //    Kalau email sudah terdaftar, lanjut ke login saja.
      let accountExists = false;
      try {
        await registerNas({
          email: info.email,
          username: username.trim(),
          password,
          inviteToken: token,
        });
      } catch (err) {
        const msg = (err as Error).message || "";
        if (!/sudah terdaftar|already/i.test(msg)) throw err;
        accountExists = true;
      }

      // 2. Masuk untuk mendapatkan token sesi.
      try {
        await loginNas({ email: info.email, password });
      } catch (err) {
        if (accountExists) {
          throw new Error(
            "Email ini sudah punya akun, tetapi kata sandinya tidak cocok. Masukkan kata sandi akun Anda yang lama."
          );
        }
        throw err;
      }

      // 3. Tandai undangan diterima.
      await acceptInvite(token);

      setJoined(true);
      setTimeout(() => router.push("/"), 1200);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setJoining(false);
    }
  }

  return (
    <div className="relative w-full max-w-lg space-y-4">
      <div className="flex justify-end">
        <ThemeToggle />
      </div>

      <div className="card space-y-5 p-5 text-center sm:p-7">
        <div className="flex items-center justify-center gap-2.5">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-solid text-lg font-bold text-white shadow-brand">
            N
          </div>
          <div className="text-left">
            <span className="block text-[13.5px] font-bold tracking-tight text-fg">NAS Project</span>
            <span className="block text-[10.5px] font-medium text-success">Penyimpanan keluarga</span>
          </div>
        </div>

        {loading && (
          <div className="flex flex-col items-center gap-2 py-10 text-muted">
            <Loader2 className="h-6 w-6 animate-spin text-brand" aria-hidden />
            <p className="text-[12px]">Memeriksa undangan…</p>
          </div>
        )}

        {!loading && error && !info && (
          <div className="space-y-3">
            <div className="flex items-start gap-2 rounded-xl border border-danger-border bg-danger-soft p-3 text-left text-[12px] text-danger">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              <span>{error}</span>
            </div>
            <a href="/" className="btn btn-secondary w-full">
              Buka aplikasi
            </a>
          </div>
        )}

        {!loading && !error && info && (
          <>
            <div className="space-y-1.5">
              <span className="chip chip-brand">Undangan anggota keluarga</span>
              <h1 className="pt-1 text-[20px] font-bold text-fg sm:text-[22px]">
                Halo, {info.name}!
              </h1>
              <p className="mx-auto max-w-md text-[12.5px] leading-relaxed text-muted">
                Anda diundang bergabung ke penyimpanan keluarga. Undangan berlaku sampai{" "}
                <strong className="font-semibold text-fg">
                  {new Date(info.expires_at).toLocaleDateString("id-ID", {
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                  })}
                </strong>
                .
              </p>
            </div>

            <div className="rounded-2xl border border-line bg-surface-2 p-4 text-left">
              <h2 className="mb-2.5 text-[11px] font-semibold uppercase tracking-wide text-subtle">
                Yang Anda dapatkan
              </h2>
              <ul className="space-y-2.5 text-[12px]">
                <li className="flex items-start gap-2.5">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-brand">
                    <HardDrive className="h-4 w-4" aria-hidden />
                  </span>
                  <span>
                    <span className="block font-semibold text-fg">Ruang pribadi {info.quota_gb} GB</span>
                    <span className="block text-[11px] text-subtle">
                      Berkas pribadi tidak terlihat anggota lain.
                    </span>
                  </span>
                </li>
                <li className="flex items-start gap-2.5">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-success-soft text-success">
                    <Folder className="h-4 w-4" aria-hidden />
                  </span>
                  <span>
                    <span className="block font-semibold text-fg">Folder bersama keluarga</span>
                    <span className="block text-[11px] text-subtle">
                      Lihat dan unggah foto serta arsip keluarga.
                    </span>
                  </span>
                </li>
                <li className="flex items-start gap-2.5">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[var(--tile-purple)] text-[var(--tile-purple-fg)]">
                    <Sparkles className="h-4 w-4" aria-hidden />
                  </span>
                  <span>
                    <span className="block font-semibold text-fg">Studio foto & dokumen</span>
                    <span className="block text-[11px] text-subtle">
                      Pasfoto, kompres foto, dan gabung PDF langsung di HP.
                    </span>
                  </span>
                </li>
              </ul>
            </div>

            {!info.valid && (
              <div className="rounded-xl border border-warn-border bg-warn-soft p-3 text-left text-[12px] text-warn">
                Status undangan: <strong className="font-semibold">{info.status}</strong>. Undangan ini
                sudah tidak bisa dipakai.
              </div>
            )}

            {joined ? (
              <div
                role="status"
                className="flex items-center justify-center gap-2 rounded-xl border border-success-border bg-success-soft p-4 text-[12.5px] font-semibold text-success"
              >
                <CheckCircle2 className="h-5 w-5" aria-hidden />
                Berhasil bergabung! Mengalihkan ke beranda…
              </div>
            ) : (
              <form onSubmit={handleAccept} className="space-y-3 text-left">
                <div>
                  <label htmlFor="invite-email" className="label">
                    Email
                  </label>
                  <input
                    id="invite-email"
                    value={info.email}
                    readOnly
                    className="input cursor-not-allowed bg-surface-2 text-muted"
                  />
                </div>

                <div>
                  <label htmlFor="invite-username" className="label">
                    Nama pengguna
                  </label>
                  <input
                    id="invite-username"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="Minimal 3 karakter"
                    autoComplete="username"
                    className="input"
                  />
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label htmlFor="invite-password" className="label">
                      Kata sandi
                    </label>
                    <input
                      id="invite-password"
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Minimal 8 karakter"
                      autoComplete="new-password"
                      className="input"
                    />
                  </div>
                  <div>
                    <label htmlFor="invite-confirm" className="label">
                      Ulangi kata sandi
                    </label>
                    <input
                      id="invite-confirm"
                      type="password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Ulangi kata sandi"
                      autoComplete="new-password"
                      className="input"
                    />
                  </div>
                </div>

                {error && (
                  <div
                    role="alert"
                    className="flex items-start gap-2 rounded-xl border border-danger-border bg-danger-soft p-3 text-[11.5px] text-danger"
                  >
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                    <span>{error}</span>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={!info.valid || joining}
                  className="btn btn-primary btn-lg w-full"
                >
                  {joining ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  ) : (
                    <ArrowRight className="h-4 w-4" aria-hidden />
                  )}
                  {joining ? "Membuat akun…" : "Terima undangan & buat akun"}
                </button>
                <p className="text-center text-[11px] text-subtle">
                  Sudah punya akun dengan email ini? Masukkan kata sandi lama Anda.
                </p>
              </form>
            )}
          </>
        )}
      </div>
    </div>
  );
}
