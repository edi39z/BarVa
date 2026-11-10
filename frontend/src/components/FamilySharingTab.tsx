"use client";

import React, { useState } from "react";
import {
  Clock,
  Folder,
  Gauge,
  Globe,
  Image as ImageIcon,
  Link2,
  Lock,
  Plus,
  RefreshCw,
  ShieldCheck,
  Unlock,
  Users,
  X,
} from "lucide-react";
import type { Invite as ServerInvite } from "@/lib/api/cloud";
import type { ActiveShare, FamilyMember } from "@/lib/nasDisplay";
import { formatBytes } from "@/lib/nasDisplay";

export type FamilySubTab = "members" | "shares" | "remote";

interface FamilySharingTabProps {
  subTab: FamilySubTab;
  onSubTabChange: (tab: FamilySubTab) => void;
  members: FamilyMember[];
  invites: ServerInvite[];
  shares: ActiveShare[];
  onAddMember: () => void;
  onRefreshInvites: () => void;
  onRevokeInvite: (id: string) => void;
  onRevokeShare: (id: string) => void;
  onOpenFiles: () => void;
  /** Owner/admin boleh mengubah kuota anggota lain. */
  canManageQuota: boolean;
  /** Role pemakai saat ini; admin tidak boleh mengubah kuota owner. */
  viewerRole: string;
  onUpdateQuota: (id: string, quotaGB: number) => Promise<void>;
}

export default function FamilySharingTab({
  subTab,
  onSubTabChange,
  members,
  invites,
  shares,
  onAddMember,
  onRefreshInvites,
  onRevokeInvite,
  onRevokeShare,
  onOpenFiles,
  canManageQuota,
  viewerRole,
  onUpdateQuota,
}: FamilySharingTabProps) {
  const pendingInvites = invites.filter((invite) => invite.status === "pending");
  const [quotaTarget, setQuotaTarget] = useState<FamilyMember | null>(null);
  const [quotaInput, setQuotaInput] = useState("");
  const [quotaError, setQuotaError] = useState("");
  const [quotaSaving, setQuotaSaving] = useState(false);

  const openQuotaModal = (member: FamilyMember) => {
    setQuotaTarget(member);
    setQuotaInput(
      member.quotaBytes > 0 ? String(member.quotaBytes / 1024 / 1024 / 1024) : "0"
    );
    setQuotaError("");
  };

  const submitQuota = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!quotaTarget) return;
    const value = Number(quotaInput.replace(",", "."));
    if (!Number.isFinite(value) || value < 0) {
      setQuotaError("Masukkan angka 0 atau lebih.");
      return;
    }
    setQuotaSaving(true);
    setQuotaError("");
    try {
      await onUpdateQuota(quotaTarget.id, value);
      setQuotaTarget(null);
    } catch (err) {
      setQuotaError((err as Error).message);
    } finally {
      setQuotaSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-zinc-800 pb-4">
        <div>
          <h2 className="text-base font-semibold text-zinc-100 flex items-center gap-2">
            <Users className="h-4 w-4 text-blue-400" />
            <span>Family Hub & Akses Jarak Jauh</span>
          </h2>
          <p className="text-xs text-zinc-400">
            Kelola akun anggota keluarga, kuota penyimpanan, tautan berbagi publik, dan jaringan VPN
            Tailscale.
          </p>
        </div>
        <button
          onClick={onAddMember}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium px-3.5 py-2 rounded-lg transition-all shadow-sm shadow-blue-600/30 active:scale-95 cursor-pointer w-fit"
        >
          <Plus className="h-3.5 w-3.5" />
          <span>Tambah Anggota Keluarga</span>
        </button>
      </div>

      {/* Sub-Navigation Tabs */}
      <div className="flex items-center gap-1.5 p-1 bg-zinc-900 border border-zinc-800 rounded-xl w-fit text-xs">
        <button
          onClick={() => onSubTabChange("members")}
          className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg font-medium transition-all cursor-pointer ${
            subTab === "members" ? "bg-zinc-800 text-white shadow-sm" : "text-zinc-400 hover:text-zinc-200"
          }`}
        >
          <Users className="h-3.5 w-3.5 text-blue-400" />
          <span>Anggota Keluarga ({members.length})</span>
        </button>
        <button
          onClick={() => onSubTabChange("shares")}
          className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg font-medium transition-all cursor-pointer ${
            subTab === "shares" ? "bg-zinc-800 text-white shadow-sm" : "text-zinc-400 hover:text-zinc-200"
          }`}
        >
          <Link2 className="h-3.5 w-3.5 text-purple-400" />
          <span>Tautan Publik ({shares.length})</span>
        </button>
        <button
          onClick={() => onSubTabChange("remote")}
          className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg font-medium transition-all cursor-pointer ${
            subTab === "remote" ? "bg-zinc-800 text-white shadow-sm" : "text-zinc-400 hover:text-zinc-200"
          }`}
        >
          <Globe className="h-3.5 w-3.5 text-emerald-400" />
          <span>Akses Jarak Jauh (Tailscale)</span>
        </button>
      </div>

      {/* 1. Family Members Sub-tab */}
      {subTab === "members" && (
        <div className="space-y-4">
          {/* Undangan yang menunggu diterima — data nyata dari server */}
          {pendingInvites.length > 0 && (
            <div className="bg-zinc-900/60 border border-amber-500/25 rounded-2xl p-4 space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-semibold text-amber-300 flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5" />
                  <span>Undangan Menunggu Diterima ({pendingInvites.length})</span>
                </h3>
                <button
                  onClick={onRefreshInvites}
                  className="text-[11px] text-zinc-400 hover:text-zinc-200 flex items-center gap-1 cursor-pointer"
                >
                  <RefreshCw className="h-3 w-3" />
                  <span>Muat ulang</span>
                </button>
              </div>
              <div className="divide-y divide-zinc-800/70">
                {pendingInvites.map((inv) => (
                  <div key={inv.id} className="flex items-center justify-between gap-3 py-2">
                    <div className="min-w-0">
                      <p className="text-xs text-zinc-200 truncate">
                        {inv.name} <span className="text-zinc-500">• {inv.email}</span>
                      </p>
                      <p className="text-[10px] text-zinc-500">
                        Kuota {inv.quota_gb} GB • berlaku s/d{" "}
                        {new Date(inv.expires_at).toLocaleDateString("id-ID", {
                          day: "2-digit",
                          month: "short",
                          year: "numeric",
                        })}
                      </p>
                    </div>
                    <button
                      onClick={() => onRevokeInvite(inv.id)}
                      className="shrink-0 text-[11px] text-rose-400 hover:text-rose-300 px-2 py-1 rounded-lg hover:bg-rose-500/10 transition-colors cursor-pointer"
                    >
                      Cabut
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {members.length === 0 ? (
            <div className="text-center py-12 border-2 border-dashed border-zinc-800 rounded-2xl bg-zinc-900/20">
              <Users className="h-10 w-10 text-zinc-600 mx-auto mb-2" />
              <p className="text-sm font-semibold text-zinc-300">Belum Ada Anggota Keluarga Terdaftar</p>
              <p className="text-xs text-zinc-500 mt-1 max-w-sm mx-auto">
                Gunakan tombol <strong>&quot;+ Tambah Anggota Keluarga&quot;</strong> di atas untuk
                mendaftarkan akun keluarga dengan isolasi kuota penyimpanan.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {members.map((member) => {
                const unlimited = member.quotaBytes <= 0;
                const percent = unlimited
                  ? 0
                  : Math.min(100, Math.round((member.usedBytes / member.quotaBytes) * 100));
                const canEdit =
                  canManageQuota && !(member.role === "owner" && viewerRole !== "owner");
                return (
                  <div
                    key={member.id}
                    className="bg-zinc-900/60 border border-zinc-800/80 rounded-2xl p-5 flex flex-col justify-between space-y-4 hover:border-zinc-700 transition-all"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <div
                          className={`h-11 w-11 rounded-xl ${member.avatarBg} text-white font-bold flex items-center justify-center text-sm shadow-md`}
                        >
                          {member.name.substring(0, 2).toUpperCase()}
                        </div>
                        <div>
                          <h3 className="text-sm font-semibold text-zinc-100">{member.name}</h3>
                          <p className="text-xs text-zinc-400 truncate max-w-[160px]">{member.email}</p>
                        </div>
                      </div>
                      <span
                        className={`text-[10px] px-2 py-0.5 rounded-full font-semibold uppercase tracking-wider ${
                          member.role === "owner"
                            ? "bg-blue-500/20 text-blue-300 border border-blue-500/30"
                            : member.role === "admin"
                            ? "bg-purple-500/20 text-purple-300 border border-purple-500/30"
                            : "bg-zinc-800 text-zinc-400 border border-zinc-700"
                        }`}
                      >
                        {member.role}
                      </span>
                    </div>

                    {/* Quota Progress */}
                    <div className="space-y-1.5">
                      <div className="flex justify-between text-[11px]">
                        <span className="text-zinc-400">Penggunaan Kuota:</span>
                        <span className="font-mono text-zinc-200">
                          {formatBytes(member.usedBytes)} /{" "}
                          {unlimited ? "Tanpa batas" : formatBytes(member.quotaBytes)}
                          {unlimited ? "" : ` (${percent}%)`}
                        </span>
                      </div>
                      <div className="h-2 w-full bg-zinc-800 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-300 ${
                            unlimited
                              ? "bg-zinc-700"
                              : percent > 85
                              ? "bg-rose-500"
                              : percent > 60
                              ? "bg-amber-500"
                              : "bg-blue-500"
                          }`}
                          style={{ width: `${unlimited ? 100 : percent}%` }}
                        />
                      </div>
                    </div>

                    <div className="pt-2 border-t border-zinc-800/60 flex items-center justify-between text-xs text-zinc-500">
                      <span className="flex items-center gap-1">
                        <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
                        Folder Privat Aman
                      </span>
                      {canEdit ? (
                        <button
                          onClick={() => openQuotaModal(member)}
                          className="flex items-center gap-1 text-blue-400 hover:text-blue-300 font-medium cursor-pointer"
                        >
                          <Gauge className="h-3.5 w-3.5" />
                          <span>Atur Kuota</span>
                        </button>
                      ) : (
                        <span className="text-zinc-600">Kelola oleh Owner</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Family Shared Drive Banner */}
          <div className="bg-gradient-to-r from-blue-950/30 to-indigo-950/30 border border-blue-800/40 rounded-2xl p-5 flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3.5">
              <div className="h-10 w-10 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400 shrink-0">
                <Folder className="h-5 w-5 fill-blue-500/20" />
              </div>
              <div>
                <h4 className="text-xs font-semibold text-zinc-100">
                  Folder Bersama Keluarga (Shared Drive)
                </h4>
                <p className="text-[11px] text-zinc-400">
                  Foto liburan, dokumen penting rumah tangga, dan arsip keluarga otomatis dapat diakses
                  oleh seluruh anggota keluarga yang terdaftar.
                </p>
              </div>
            </div>
            <button
              onClick={onOpenFiles}
              className="bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium px-4 py-2 rounded-lg transition-colors shrink-0 cursor-pointer"
            >
              Buka Shared Drive
            </button>
          </div>
        </div>
      )}

      {/* 2. Active External Shares Sub-tab */}
      {subTab === "shares" && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs text-zinc-400">
              Tautan berbagi publik untuk orang di luar keluarga • Proteksi password & batas waktu aktif
            </span>
          </div>

          {shares.length === 0 ? (
            <div className="text-center py-12 border-2 border-dashed border-zinc-800 rounded-2xl bg-zinc-900/20">
              <Link2 className="h-10 w-10 text-zinc-600 mx-auto mb-2" />
              <p className="text-sm font-semibold text-zinc-300">Belum Ada Tautan Berbagi Aktif</p>
              <p className="text-xs text-zinc-500 mt-1 max-w-sm mx-auto">
                Pilih file atau folder pada menu <strong>Semua File</strong> lalu klik ikon Bagikan untuk
                membuat link download terenkripsi.
              </p>
            </div>
          ) : (
            <div className="border border-zinc-800 rounded-xl overflow-hidden bg-zinc-900/20">
              <table className="w-full text-left text-xs text-zinc-300">
                <thead className="bg-zinc-900 border-b border-zinc-800 text-zinc-400">
                  <tr>
                    <th className="py-3 px-4 font-medium">Nama File / Folder</th>
                    <th className="py-3 px-4 font-medium">Izin</th>
                    <th className="py-3 px-4 font-medium">Kedaluwarsa</th>
                    <th className="py-3 px-4 font-medium">Keamanan</th>
                    <th className="py-3 px-4 text-right font-medium">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/60">
                  {shares.map((share) => (
                    <tr key={share.id} className="hover:bg-zinc-900/60 transition-colors">
                      <td className="py-3 px-4 font-medium text-zinc-200 flex items-center gap-2">
                        {share.fileType === "folder" ? (
                          <Folder className="h-4 w-4 text-blue-400" />
                        ) : (
                          <ImageIcon className="h-4 w-4 text-purple-400" />
                        )}
                        <span className="truncate max-w-xs">{share.fileName}</span>
                      </td>
                      <td className="py-3 px-4">
                        <span className="text-[11px] px-2 py-0.5 rounded bg-zinc-800 text-zinc-300 uppercase font-mono">
                          {share.permission}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-zinc-400">{share.expiresAtStr}</td>
                      <td className="py-3 px-4">
                        {share.hasPassword ? (
                          <span className="flex items-center gap-1 text-emerald-400 text-[11px]">
                            <Lock className="h-3.5 w-3.5" /> Password Aktif
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 text-zinc-500 text-[11px]">
                            <Unlock className="h-3.5 w-3.5" /> Publik
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <button
                          onClick={() => onRevokeShare(share.id)}
                          className="text-rose-400 hover:text-rose-300 text-xs font-medium cursor-pointer"
                        >
                          Cabut Akses
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* 3. Remote Access (Tailscale) Sub-tab */}
      {subTab === "remote" && (
        <div className="max-w-3xl space-y-5">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 space-y-4">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="h-12 w-12 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
                  <Globe className="h-6 w-6" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-zinc-100">
                    Akses Jarak Jauh Aman (Tailscale Mesh VPN)
                  </h3>
                  <p className="text-xs text-zinc-400">
                    Akses seluruh isi NAS dari luar rumah (kantor, kampus, atau saat bepergian) tanpa perlu
                    membuka port router atau langganan IP publik.
                  </p>
                </div>
              </div>
              <span className="text-xs px-2.5 py-1 rounded-full bg-emerald-500/20 text-emerald-300 font-medium shrink-0">
                Mesh Aktif
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
              <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-3.5 space-y-1">
                <span className="text-[10px] text-zinc-500 uppercase font-semibold">
                  IP Server di Rumah (Lokal)
                </span>
                <p className="font-mono text-sm text-zinc-200">192.168.18.10:8080</p>
                <p className="text-[10px] text-zinc-500">Hanya bisa diakses saat terhubung ke WiFi rumah</p>
              </div>

              <div className="bg-zinc-950 border border-emerald-500/30 rounded-xl p-3.5 space-y-1">
                <span className="text-[10px] text-emerald-400 uppercase font-semibold">
                  IP Tailscale Mesh (Global)
                </span>
                <p className="font-mono text-sm text-emerald-300">100.84.21.10:8080</p>
                <p className="text-[10px] text-emerald-400/80">
                  Dapat diakses dari seluruh dunia dengan aman
                </p>
              </div>
            </div>

            <div className="pt-2 border-t border-zinc-800 space-y-3">
              <h4 className="text-xs font-semibold text-zinc-300 uppercase tracking-wider">
                Langkah Mudah Menghubungkan HP Keluarga dari Luar Rumah:
              </h4>
              <ol className="text-xs text-zinc-400 space-y-2 list-decimal list-inside">
                <li>
                  Install aplikasi <strong>Tailscale</strong> di HP Android / iPhone anggota keluarga.
                </li>
                <li>Login menggunakan akun keluarga yang telah diizinkan.</li>
                <li>
                  Buka aplikasi NAS Cloud, arahkan endpoint ke{" "}
                  <code className="font-mono text-white bg-zinc-800 px-1 py-0.5 rounded">
                    http://100.84.21.10:8080
                  </code>
                  . Selesai!
                </li>
              </ol>
            </div>
          </div>
        </div>
      )}

      {/* Modal pengaturan kuota anggota */}
      {quotaTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <form
            onSubmit={submitQuota}
            className="w-full max-w-sm bg-zinc-900 border border-zinc-800 rounded-2xl p-5 space-y-4"
          >
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
                  <Gauge className="h-4 w-4 text-blue-400" />
                  <span>Atur Kuota Penyimpanan</span>
                </h3>
                <p className="text-[11px] text-zinc-400 mt-1">
                  {quotaTarget.name} • {quotaTarget.email}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setQuotaTarget(null)}
                className="text-zinc-500 hover:text-zinc-300 cursor-pointer"
                aria-label="Tutup"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <p className="text-[11px] text-zinc-400">
              Terpakai saat ini: <span className="font-mono text-zinc-200">{formatBytes(quotaTarget.usedBytes)}</span>
            </p>

            <label className="block space-y-1.5">
              <span className="text-[11px] font-medium text-zinc-300">Kuota (GB)</span>
              <input
                type="number"
                min="0"
                step="0.5"
                value={quotaInput}
                onChange={(e) => setQuotaInput(e.target.value)}
                autoFocus
                className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-blue-500"
              />
              <span className="text-[10px] text-zinc-500">
                Isi 0 untuk memberi akses tanpa batas. Kuota tidak boleh lebih kecil dari pemakaian.
              </span>
            </label>

            {quotaError && (
              <p className="text-[11px] text-rose-400 bg-rose-500/10 border border-rose-500/30 rounded-lg px-3 py-2">
                {quotaError}
              </p>
            )}

            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setQuotaTarget(null)}
                className="text-xs text-zinc-400 hover:text-zinc-200 px-3 py-2 rounded-lg cursor-pointer"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={quotaSaving}
                className="bg-blue-600 hover:bg-blue-500 disabled:opacity-60 text-white text-xs font-medium px-4 py-2 rounded-lg transition-colors cursor-pointer"
              >
                {quotaSaving ? "Menyimpan..." : "Simpan"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
