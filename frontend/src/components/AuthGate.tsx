"use client";

import React, { useState } from "react";
import { HardDrive, Lock, Mail, RefreshCw, Shield, User } from "lucide-react";
import {
  getStoredServerUrl,
  loginNas,
  registerNas,
  NasUser,
} from "@/lib/api/nas";

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
        setError("Password minimal 8 karakter.");
        return;
      }
      if (password !== confirm) {
        setError("Konfirmasi password tidak cocok.");
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
    <div className="min-h-screen w-full bg-zinc-950 text-zinc-100 flex items-center justify-center p-6">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center space-y-2">
          <div className="h-12 w-12 rounded-2xl bg-blue-600 flex items-center justify-center mx-auto shadow-lg shadow-blue-500/30">
            <HardDrive className="h-6 w-6 text-white" />
          </div>
          <h1 className="text-xl font-bold tracking-tight">NAS Cloud</h1>
          <p className="text-xs text-zinc-400">
            Masuk ke server pribadi Anda
          </p>
        </div>

        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 space-y-5 shadow-2xl">
          <div className="grid grid-cols-2 gap-2 p-1 bg-zinc-950 border border-zinc-800 rounded-xl">
            <button
              type="button"
              onClick={() => {
                setMode("login");
                setError("");
              }}
              className={`py-2 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
                mode === "login"
                  ? "bg-blue-600 text-white"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              Masuk
            </button>
            <button
              type="button"
              onClick={() => {
                setMode("register");
                setError("");
              }}
              className={`py-2 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
                mode === "register"
                  ? "bg-blue-600 text-white"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              Daftar
            </button>
          </div>

          <form onSubmit={submit} className="space-y-3">
            <div>
              <label className="text-[11px] font-medium text-zinc-400 block mb-1">
                Email
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-500" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="nama@email.com"
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg pl-9 pr-3 py-2.5 text-xs text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>

            {mode === "register" && (
              <div>
                <label className="text-[11px] font-medium text-zinc-400 block mb-1">
                  Username
                </label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-500" />
                  <input
                    type="text"
                    required
                    minLength={3}
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="username"
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg pl-9 pr-3 py-2.5 text-xs text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>
            )}

            <div>
              <label className="text-[11px] font-medium text-zinc-400 block mb-1">
                Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-500" />
                <input
                  type="password"
                  required
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="minimal 8 karakter"
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg pl-9 pr-3 py-2.5 text-xs text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>

            {mode === "register" && (
              <div>
                <label className="text-[11px] font-medium text-zinc-400 block mb-1">
                  Konfirmasi Password
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-500" />
                  <input
                    type="password"
                    required
                    minLength={8}
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    placeholder="ulangi password"
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg pl-9 pr-3 py-2.5 text-xs text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>
            )}

            {error && (
              <p className="text-[11px] text-rose-300 bg-rose-500/10 border border-rose-500/30 rounded-lg px-3 py-2">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs font-semibold py-2.5 rounded-lg transition-colors cursor-pointer flex items-center justify-center gap-2"
            >
              {loading && <RefreshCw className="h-3.5 w-3.5 animate-spin" />}
              {mode === "login" ? "Masuk" : "Daftar & Masuk"}
            </button>
          </form>

          {mode === "register" && (
            <p className="text-[10px] text-zinc-500 text-center leading-relaxed">
              Akun pertama yang mendaftar otomatis menjadi <strong>owner</strong>.
            </p>
          )}
        </div>

        <div className="space-y-3 text-center">
          <p className="text-[10px] text-zinc-500 font-mono">
            {getStoredServerUrl()}
          </p>
          <button
            onClick={onSkip}
            className="text-[11px] text-zinc-400 hover:text-zinc-200 underline underline-offset-2 cursor-pointer"
          >
            Lanjut tanpa server (Mode Standalone)
          </button>
        </div>

        <div className="flex items-center justify-center gap-1.5 text-[10px] text-zinc-600">
          <Shield className="h-3 w-3" />
          <span>Password di-hash Argon2id · sesi tersimpan di server</span>
        </div>
      </div>
    </div>
  );
}
