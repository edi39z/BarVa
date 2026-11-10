"use client";

import React from "react";
import { CheckCircle2, Copy, Users } from "lucide-react";
import Modal from "@/components/Modal";

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
    <Modal
      title="Tambah anggota keluarga"
      description="Anggota akan menerima tautan untuk membuat akun sendiri."
      icon={<Users className="h-4 w-4" aria-hidden />}
      onClose={onClose}
      footer={
        generatedInviteUrl ? (
          <>
            <button
              onClick={() => {
                if (typeof navigator !== "undefined" && navigator.clipboard) {
                  navigator.clipboard.writeText(generatedInviteUrl);
                }
                alert("Tautan undangan berhasil disalin. Silakan kirim ke anggota keluarga Anda.");
              }}
              className="btn btn-primary"
            >
              <Copy className="h-4 w-4" aria-hidden />
              Salin tautan
            </button>
            <button onClick={onFinish} className="btn btn-secondary">
              Selesai
            </button>
          </>
        ) : (
          <>
            <button type="button" onClick={onClose} className="btn btn-ghost">
              Batal
            </button>
            <button type="submit" form="add-member-form" className="btn btn-primary">
              Buat undangan
            </button>
          </>
        )
      }
    >
      {generatedInviteUrl ? (
        <div className="space-y-3">
          <div className="flex items-start gap-2 rounded-xl border border-success-border bg-success-soft p-3 text-success">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <div>
              <p className="text-[12.5px] font-semibold">Undangan berhasil dibuat</p>
              <p className="mt-0.5 text-[11.5px] leading-relaxed text-success/90">
                Kirim tautan ini lewat WhatsApp atau pesan lainnya. Anggota langsung bergabung saat
                membukanya.
              </p>
            </div>
          </div>

          <p className="break-all rounded-xl border border-line bg-surface-2 p-3 font-mono text-[11.5px] text-fg select-all">
            {generatedInviteUrl}
          </p>
        </div>
      ) : (
        <form id="add-member-form" onSubmit={onSubmit} className="space-y-3">
          <div>
            <label htmlFor="member-name" className="label">
              Nama lengkap
            </label>
            <input
              id="member-name"
              type="text"
              required
              value={name}
              onChange={(e) => onNameChange(e.target.value)}
              placeholder="Contoh: Ibu, Kakak, Adik"
              className="input"
            />
          </div>

          <div>
            <label htmlFor="member-email" className="label">
              Email
            </label>
            <input
              id="member-email"
              type="email"
              required
              value={email}
              onChange={(e) => onEmailChange(e.target.value)}
              placeholder="nama@email.com"
              className="input"
            />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="member-role" className="label">
                Peran
              </label>
              <select
                id="member-role"
                value={role}
                onChange={(e) => onRoleChange(e.target.value as "member" | "admin")}
                className="select"
              >
                <option value="member">Anggota (akses biasa)</option>
                <option value="admin">Admin (boleh kelola anggota)</option>
              </select>
            </div>

            <div>
              <label htmlFor="member-quota" className="label">
                Batas penyimpanan
              </label>
              <select
                id="member-quota"
                value={quotaGB}
                onChange={(e) => onQuotaChange(parseInt(e.target.value))}
                className="select"
              >
                <option value={50}>50 GB</option>
                <option value={100}>100 GB</option>
                <option value={250}>250 GB</option>
                <option value={500}>500 GB</option>
              </select>
            </div>
          </div>

          <p className="rounded-xl bg-surface-2 px-3 py-2 text-[11px] leading-relaxed text-subtle">
            Anggota mendapat ruang pribadi sendiri dan tetap bisa membuka folder bersama keluarga.
          </p>
        </form>
      )}
    </Modal>
  );
}
