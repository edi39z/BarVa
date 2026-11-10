"use client";

import React from "react";
import { CheckCircle2, Copy, Users, X } from "lucide-react";

interface AddMemberModalProps {
  generatedInviteUrl: string;
  name: string;
  onNameChange: (value: string) => void;
  email: string;
  onEmailChange: (value: string) => void;
  role: "member" | "admin";
  onRoleChange: (value: "member" | "admin") => void;
  quotaGB: number;
  onQuotaChange: (value: number) => void;
  onSubmit: (e: React.FormEvent) => void;
  onClose: () => void;
  onFinish: () => void;
}

export default function AddMemberModal({
  generatedInviteUrl,
  name,
  onNameChange,
  email,
  onEmailChange,
  role,
  onRoleChange,
  quotaGB,
  onQuotaChange,
  onSubmit,
  onClose,
  onFinish,
}: AddMemberModalProps) {
  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-md p-6 space-y-4 shadow-2xl">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-zinc-100 font-semibold text-sm">
            <Users className="h-4 w-4 text-blue-400" />
            <span>Tambah Anggota Keluarga Baru</span>
          </div>
          <button onClick={onClose} className="text-zinc-500 hover:text-white cursor-pointer">
            <X className="h-4 w-4" />
          </button>
        </div>

        {generatedInviteUrl ? (
          <div className="space-y-4 pt-1">
            <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-left space-y-2.5">
              <div className="flex items-center gap-2 text-emerald-400 font-semibold text-xs">
                <CheckCircle2 className="h-4 w-4" />
                <span>Anggota Berhasil Didaftarkan!</span>
              </div>
              <p className="text-[11px] text-zinc-300">
                Kirimkan tautan undangan ini ke HP keluarga via WhatsApp atau Telegram. Saat mereka
                mengklik link ini di HP mereka, mereka langsung bergabung:
              </p>
              <div className="bg-zinc-950 p-2.5 rounded-xl border border-zinc-800 text-[11px] font-mono text-zinc-200 break-all select-all">
                {generatedInviteUrl}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  if (typeof navigator !== "undefined" && navigator.clipboard) {
                    navigator.clipboard.writeText(generatedInviteUrl);
                  }
                  alert(
                    "Tautan undangan berhasil disalin! Silakan kirimkan ke HP anggota keluarga Anda."
                  );
                }}
                className="flex-1 bg-blue-600 hover:bg-blue-500 text-white font-medium py-2.5 rounded-xl text-xs cursor-pointer flex items-center justify-center gap-1.5 shadow-sm shadow-blue-600/30"
              >
                <Copy className="h-3.5 w-3.5" />
                <span>Salin Link Undangan</span>
              </button>
              <button
                onClick={onFinish}
                className="px-4 py-2.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-xl text-xs font-medium cursor-pointer"
              >
                Selesai
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="space-y-3.5 text-xs">
            <div>
              <label className="text-zinc-400 block mb-1 font-medium">Nama Lengkap</label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => onNameChange(e.target.value)}
                placeholder="Misal: Ibu, Kakak, atau Adik"
                className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-blue-500"
              />
            </div>

            <div>
              <label className="text-zinc-400 block mb-1 font-medium">Alamat Email</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => onEmailChange(e.target.value)}
                placeholder="ibu@nas.local atau email asli"
                className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-blue-500"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-zinc-400 block mb-1 font-medium">Peran (Role)</label>
                <select
                  value={role}
                  onChange={(e) => onRoleChange(e.target.value as "member" | "admin")}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-zinc-200 focus:outline-none focus:border-blue-500 cursor-pointer"
                >
                  <option value="member">Member (Akses Biasa)</option>
                  <option value="admin">Admin (Kelola User)</option>
                </select>
              </div>

              <div>
                <label className="text-zinc-400 block mb-1 font-medium">Batas Kuota</label>
                <select
                  value={quotaGB}
                  onChange={(e) => onQuotaChange(parseInt(e.target.value))}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-zinc-200 focus:outline-none focus:border-blue-500 cursor-pointer"
                >
                  <option value={50}>50 GB</option>
                  <option value={100}>100 GB</option>
                  <option value={250}>250 GB</option>
                  <option value={500}>500 GB</option>
                </select>
              </div>
            </div>

            <p className="text-[11px] text-zinc-500 pt-1">
              Anggota keluarga akan mendapatkan tautan khusus untuk membuka akun privat mereka dan
              otomatis mengakses folder bersama keluarga.
            </p>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-zinc-800">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-medium cursor-pointer"
              >
                Batal
              </button>
              <button
                type="submit"
                className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium cursor-pointer shadow-sm shadow-blue-600/30"
              >
                Daftarkan & Buat Link
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
