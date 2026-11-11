"use client";

import React, { useState } from "react";
import { HardDrive, Lock, Mail, RefreshCw, Shield, User } from "lucide-react";
import {
  getStoredServerUrl,
  loginNas,
  registerNas,
  NasUser,
} from "@/lib/api/nas";
import ThemeToggle from "@/components/ThemeToggle";

interface AuthGateProps {
  onAuthed: (user: NasUser) => void;
  onSkip: () => void;
}

export default function AuthGate({ onAuthed, onSkip }: AuthGateProps) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (mode === "register") {
      if (username.trim().length < 3) {
        setError("Username minimal 3 karakter.");
        return;
      }
      if (password.length < 8) {
        setError("Kata sandi minimal 8 karakter.");
        return;
      }
      if (password !== confirm) {
        setError("Konfirmasi kata sandi tidak cocok.");
        return;
      }
    }

    setLoading(true);
    try {
      if (mode === "register") {
        await registerNas({ email, username, password });
      }
      const { user } = await loginNas({ email, password });
      onAuthed(user);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Terjadi kesalahan.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative flex min-h-screen w-full items-center justify-center bg-canvas px-4 py-10">
      <div className="absolute right-4 top-4">
        <ThemeToggle />
      </div>

      <div className="w-full max-w-md space-y-5">
        <div className="space-y-2 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-solid text-white shadow-brand">
            <HardDrive className="h-6 w-6" aria-hidden />
          </div>
          <h1 className="text-[20px] font-bold tracking-tight text-fg">Barva</h1>
          <p className="text-[12.5px] text-subtle">
            Penyimpanan pribadi keluarga Anda — masuk untuk melanjutkan
          </p>
        </div>

        <div className="card p-5 sm:p-6">
          <div className="mb-4 grid grid-cols-2 gap-1 rounded-xl bg-surface-2 p-1" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={mode === "login"}
              onClick={() => {
                setMode("login");
                setError("");
              }}
              className={`rounded-lg py-2 text-[12.5px] font-semibold transition-colors ${
                mode === "login" ? "bg-surface text-brand shadow-sm" : "text-muted hover:text-fg"
              }`}
            >
              Masuk
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === "register"}
              onClick={() => {
                setMode("register");
                setError("");
              }}
              className={`rounded-lg py-2 text-[12.5px] font-semibold transition-colors ${
                mode === "register" ? "bg-surface text-brand shadow-sm" : "text-muted hover:text-fg"
              }`}
            >
              Buat akun
            </button>
          </div>

          <form onSubmit={submit} className="space-y-3">
            <div>
              <label htmlFor="auth-email" className="label">
                Email
              </label>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle" aria-hidden />
                <input
                  id="auth-email"
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="nama@email.com"
                  className="input pl-9"
                />
              </div>
            </div>

            {mode === "register" && (
              <div>
                <label htmlFor="auth-username" className="label">
                  Nama pengguna
                </label>
                <div className="relative">
                  <User className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle" aria-hidden />
                  <input
                    id="auth-username"
                    type="text"
                    required
                    minLength={3}
                    autoComplete="username"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="Minimal 3 karakter"
                    className="input pl-9"
                  />
                </div>
              </div>
            )}

            <div>
              <label htmlFor="auth-password" className="label">
                Kata sandi
              </label>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle" aria-hidden />
                <input
                  id="auth-password"
                  type="password"
                  required
                  minLength={8}
                  autoComplete={mode === "login" ? "current-password" : "new-password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Minimal 8 karakter"
                  className="input pl-9"
                />
              </div>
            </div>

            {mode === "register" && (
              <div>
                <label htmlFor="auth-confirm" className="label">
                  Ulangi kata sandi
                </label>
                <div className="relative">
                  <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle" aria-hidden />
                  <input
                    id="auth-confirm"
                    type="password"
                    required
                    minLength={8}
                    autoComplete="new-password"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    placeholder="Ulangi kata sandi"
                    className="input pl-9"
                  />
                </div>
              </div>
            )}

            {error && (
              <p role="alert" className="rounded-xl border border-danger-border bg-danger-soft px-3 py-2 text-[11.5px] text-danger">
                {error}
              </p>
            )}

            <button type="submit" disabled={loading} className="btn btn-primary btn-lg w-full">
              {loading && <RefreshCw className="h-4 w-4 animate-spin" aria-hidden />}
              {mode === "login" ? "Masuk" : "Buat akun & masuk"}
            </button>
          </form>

          {mode === "register" && (
            <p className="mt-3 text-center text-[11px] leading-relaxed text-subtle">
              Akun pertama yang mendaftar otomatis menjadi pemilik (owner).
            </p>
          )}
        </div>

        <div className="space-y-2 text-center">
          <button
            onClick={onSkip}
            className="text-[12px] font-medium text-muted underline underline-offset-4 transition-colors hover:text-fg"
          >
            Lanjut tanpa server (simpan di perangkat ini)
          </button>
          <p className="font-mono text-[10.5px] text-subtle">{getStoredServerUrl()}</p>
        </div>

        <p className="flex items-center justify-center gap-1.5 text-[10.5px] text-subtle">
          <Shield className="h-3 w-3" aria-hidden />
          Kata sandi disimpan terenkripsi di server Anda
        </p>
      </div>
    </div>
  );
}
