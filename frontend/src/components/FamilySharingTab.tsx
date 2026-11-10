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

/** Byte → string GB ringkas untuk mengisi input (maksimal 4 desimal). */
function toGigabytes(bytes: number): string {
  return String(Number((bytes / 1024 ** 3).toFixed(4)));
}

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
    setQuotaInput(member.quotaBytes > 0 ? toGigabytes(member.quotaBytes) : "0");
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

  const tabs: { id: FamilySubTab; label: string; icon: React.ElementType; count?: number }[] = [
    { id: "members", label: "Anggota", icon: Users, count: members.length },
    { id: "shares", label: "Tautan Publik", icon: Link2, count: shares.length },
    { id: "remote", label: "Akses Jarak Jauh", icon: Globe },
  ];

  return (
    <div className="mx-auto max-w-5xl space-y-4 pb-24 lg:pb-6">
      <div className="flex flex-col gap-3 border-b border-line pb-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-[17px] font-bold text-fg">
            <Users className="h-[18px] w-[18px] text-brand" aria-hidden />
            Berbagi Keluarga
          </h1>
          <p className="mt-1 max-w-xl text-[12.5px] leading-relaxed text-subtle">
            Kelola akun anggota keluarga, batas penyimpanan, tautan berbagi, dan akses dari luar rumah.
          </p>
        </div>
        <button onClick={onAddMember} className="btn btn-primary w-fit">
          <Plus className="h-4 w-4" aria-hidden />
          Tambah anggota
        </button>
      </div>

      <div
        className="flex w-full items-center gap-1 overflow-x-auto rounded-xl border border-line bg-surface p-1 text-[12.5px] sm:w-fit"
        role="tablist"
        aria-label="Bagian berbagi keluarga"
      >
        {tabs.map(({ id, label, icon: Icon, count }) => {
          const active = subTab === id;
          return (
            <button
              key={id}
              role="tab"
              aria-selected={active}
              onClick={() => onSubTabChange(id)}
              className={`flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 font-semibold transition-colors ${
                active ? "bg-brand-soft text-brand" : "text-muted hover:text-fg"
              }`}
            >
              <Icon className="h-3.5 w-3.5" aria-hidden />
              {label}
              {typeof count === "number" && (
                <span className={`rounded px-1 text-[10.5px] ${active ? "bg-surface text-brand" : "bg-surface-3 text-subtle"}`}>
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {subTab === "members" && (
        <div className="space-y-4">
          {pendingInvites.length > 0 && (
            <div className="card border-warn-border bg-warn-soft p-3.5">
              <div className="mb-1.5 flex items-center justify-between">
                <h2 className="flex items-center gap-1.5 text-[12.5px] font-semibold text-warn">
                  <Clock className="h-3.5 w-3.5" aria-hidden />
                  Menunggu diterima ({pendingInvites.length})
                </h2>
                <button
                  onClick={onRefreshInvites}
                  className="flex items-center gap-1 rounded-lg px-2 py-1 text-[11.5px] font-semibold text-warn hover:bg-surface/40"
                >
                  <RefreshCw className="h-3 w-3" aria-hidden />
                  Muat ulang
                </button>
              </div>
              <ul className="divide-y divide-warn-border/60">
                {pendingInvites.map((inv) => (
                  <li key={inv.id} className="flex items-center justify-between gap-3 py-2">
                    <div className="min-w-0">
                      <p className="truncate text-[12px] text-fg">
                        {inv.name} <span className="text-subtle">· {inv.email}</span>
                      </p>
                      <p className="text-[11px] text-subtle">
                        Kuota {inv.quota_gb} GB · berlaku sampai{" "}
                        {new Date(inv.expires_at).toLocaleDateString("id-ID", {
                          day: "2-digit",
                          month: "short",
                          year: "numeric",
                        })}
                      </p>
                    </div>
                    <button onClick={() => onRevokeInvite(inv.id)} className="btn btn-sm btn-ghost shrink-0 text-danger">
                      Cabut
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {members.length === 0 ? (
            <div className="flex flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-line-strong bg-surface px-4 py-14 text-center">
              <Users className="h-10 w-10 text-subtle" aria-hidden />
              <p className="text-[13.5px] font-semibold text-fg">Belum ada anggota keluarga</p>
              <p className="max-w-sm text-[12px] leading-relaxed text-subtle">
                Gunakan tombol <strong className="font-semibold text-muted">Tambah anggota</strong> untuk
                membuat akun keluarga dengan batas penyimpanan masing-masing.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
              {members.map((member) => {
                const unlimited = member.quotaBytes <= 0;
                const percent = unlimited
                  ? 0
                  : Math.min(100, Math.round((member.usedBytes / member.quotaBytes) * 100));
                const canEdit = canManageQuota && !(member.role === "owner" && viewerRole !== "owner");
                return (
                  <div key={member.id} className="card flex flex-col gap-3 p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex min-w-0 items-center gap-3">
                        <div
                          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${member.avatarBg} text-[13px] font-bold text-white shadow-sm`}
                        >
                          {member.name.substring(0, 2).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <h3 className="truncate text-[13px] font-semibold text-fg">{member.name}</h3>
                          <p className="truncate text-[11.5px] text-subtle">{member.email}</p>
                        </div>
                      </div>
                      <span
                        className={`chip ${
                          member.role === "owner"
                            ? "chip-brand"
                            : member.role === "admin"
                            ? "chip-neutral"
                            : "chip-neutral"
                        }`}
                      >
                        {member.role === "owner" ? "Pemilik" : member.role === "admin" ? "Admin" : "Anggota"}
                      </span>
                    </div>

                    <div>
                      <div className="flex items-baseline justify-between text-[11.5px]">
                        <span className="text-muted">Terpakai</span>
                        <span className="font-semibold tabular-nums text-fg">
                          {formatBytes(member.usedBytes)}
                          <span className="font-normal text-subtle">
                            {" "}
                            / {unlimited ? "tanpa batas" : formatBytes(member.quotaBytes)}
                          </span>
                        </span>
                      </div>
                      <div
                        className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-surface-3"
                        role="progressbar"
                        aria-label={`Pemakaian kuota ${member.name}`}
                        aria-valuenow={unlimited ? 0 : percent}
                        aria-valuemin={0}
                        aria-valuemax={100}
                      >
                        <div
                          className={`h-full rounded-full transition-all duration-300 ${
                            unlimited
                              ? "bg-line-strong"
                              : percent > 85
                              ? "bg-danger"
                              : percent > 60
                              ? "bg-warn"
                              : "bg-brand-solid"
                          }`}
                          style={{ width: `${unlimited ? 100 : percent}%` }}
                        />
                      </div>
                    </div>

                    <div className="flex items-center justify-between border-t border-line pt-2.5 text-[11.5px]">
                      <span className="flex items-center gap-1 text-success">
                        <ShieldCheck className="h-3.5 w-3.5" aria-hidden />
                        Folder pribadi aman
                      </span>
                      {canEdit ? (
                        <button
                          onClick={() => openQuotaModal(member)}
                          className="flex items-center gap-1 rounded-lg px-1.5 py-1 font-semibold text-brand hover:bg-brand-soft"
                        >
                          <Gauge className="h-3.5 w-3.5" aria-hidden />
                          Atur kuota
                        </button>
                      ) : (
                        <span className="text-subtle">Dikelola pemilik</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <div className="flex flex-col items-start justify-between gap-3 rounded-2xl border border-brand-border bg-brand-soft p-4 sm:flex-row sm:items-center">
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-surface text-brand">
                <Folder className="h-5 w-5" aria-hidden />
              </span>
              <div>
                <h3 className="text-[13px] font-semibold text-fg">Folder bersama keluarga</h3>
                <p className="mt-0.5 max-w-lg text-[11.5px] leading-relaxed text-muted">
                  Foto liburan, dokumen rumah tangga, dan arsip keluarga bisa diakses semua anggota
                  yang terdaftar.
                </p>
              </div>
            </div>
            <button onClick={onOpenFiles} className="btn btn-primary shrink-0">
              Buka folder
            </button>
          </div>
        </div>
      )}

      {subTab === "shares" && (
        <div className="space-y-3">
          <p className="text-[12px] text-subtle">
            Tautan untuk orang di luar keluarga. Bisa dilindungi kata sandi dan dibatasi waktunya.
          </p>

          {shares.length === 0 ? (
            <div className="flex flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-line-strong bg-surface px-4 py-14 text-center">
              <Link2 className="h-10 w-10 text-subtle" aria-hidden />
              <p className="text-[13.5px] font-semibold text-fg">Belum ada tautan aktif</p>
              <p className="max-w-sm text-[12px] leading-relaxed text-subtle">
                Buka <strong className="font-semibold text-muted">Semua Berkas</strong>, pilih berkas, lalu
                ketuk ikon bagikan untuk membuat tautan.
              </p>
            </div>
          ) : (
            <ul className="space-y-2">
              {shares.map((share) => (
                <li key={share.id} className="card flex flex-col gap-2 p-3 sm:flex-row sm:items-center">
                  <div className="flex min-w-0 flex-1 items-center gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-surface-2">
                      {share.fileType === "folder" ? (
                        <Folder className="h-5 w-5 text-[var(--tile-blue-fg)]" aria-hidden />
                      ) : (
                        <ImageIcon className="h-5 w-5 text-[var(--tile-purple-fg)]" aria-hidden />
                      )}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-[12.5px] font-semibold text-fg">{share.fileName}</p>
                      <p className="flex flex-wrap items-center gap-x-2 text-[11.5px] text-subtle">
                        <span className="uppercase">{share.permission === "uploader" ? "Boleh unggah" : "Hanya lihat"}</span>
                        <span>·</span>
                        <span>Berlaku: {share.expiresAtStr}</span>
                        <span>·</span>
                        {share.hasPassword ? (
                          <span className="flex items-center gap-1 text-success">
                            <Lock className="h-3 w-3" aria-hidden /> Berkata sandi
                          </span>
                        ) : (
                          <span className="flex items-center gap-1">
                            <Unlock className="h-3 w-3" aria-hidden /> Tanpa sandi
                          </span>
                        )}
                      </p>
                    </div>
                  </div>
                  <button onClick={() => onRevokeShare(share.id)} className="btn btn-sm btn-danger shrink-0 self-start sm:self-auto">
                    Cabut akses
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {subTab === "remote" && (
        <div className="max-w-3xl space-y-4">
          <div className="card space-y-4 p-4 sm:p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-success-soft text-success">
                  <Globe className="h-5 w-5" aria-hidden />
                </span>
                <div>
                  <h3 className="text-[13.5px] font-semibold text-fg">Akses dari luar rumah</h3>
                  <p className="mt-0.5 max-w-lg text-[11.5px] leading-relaxed text-muted">
                    Dengan Tailscale, NAS bisa dibuka dari kantor atau saat bepergian tanpa membuka
                    port router atau membeli IP publik.
                  </p>
                </div>
              </div>
              <span className="chip chip-success">Aktif</span>
            </div>

            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              <div className="rounded-xl border border-line bg-surface-2 p-3">
                <span className="text-[10.5px] font-semibold uppercase tracking-wide text-subtle">
                  Alamat di rumah
                </span>
                <p className="font-mono text-[13px] text-fg">192.168.18.10:8080</p>
                <p className="text-[11px] text-subtle">Hanya saat tersambung WiFi rumah</p>
              </div>
              <div className="rounded-xl border border-success-border bg-success-soft p-3">
                <span className="text-[10.5px] font-semibold uppercase tracking-wide text-success">
                  Alamat Tailscale
                </span>
                <p className="font-mono text-[13px] text-success">100.84.21.10:8080</p>
                <p className="text-[11px] text-success/90">Bisa diakses dari mana saja</p>
              </div>
            </div>

            <div className="border-t border-line pt-3">
              <h4 className="mb-2 text-[12px] font-semibold text-fg">Cara menyambungkan HP anggota keluarga</h4>
              <ol className="list-inside list-decimal space-y-1.5 text-[12px] leading-relaxed text-muted">
                <li>Pasang aplikasi Tailscale di HP anggota keluarga.</li>
                <li>Masuk dengan akun keluarga yang sudah diizinkan.</li>
                <li>
                  Buka aplikasi ini, lalu isi alamat server{" "}
                  <code className="rounded bg-surface-3 px-1 py-0.5 font-mono text-[11.5px] text-fg">
                    http://100.84.21.10:8080
                  </code>
                  .
                </li>
              </ol>
            </div>
          </div>
        </div>
      )}

      {quotaTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <form
            onSubmit={submitQuota}
            role="dialog"
            aria-modal="true"
            aria-labelledby="quota-title"
            className="w-full max-w-sm space-y-4 rounded-2xl border border-line bg-surface p-5 shadow-pop"
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <h3 id="quota-title" className="flex items-center gap-2 text-[14px] font-bold text-fg">
                  <Gauge className="h-4 w-4 text-brand" aria-hidden />
                  Atur kuota penyimpanan
                </h3>
                <p className="mt-1 text-[11.5px] text-subtle">
                  {quotaTarget.name} · {quotaTarget.email}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setQuotaTarget(null)}
                className="icon-btn"
                aria-label="Tutup"
              >
                <X className="h-4 w-4" aria-hidden />
              </button>
            </div>

            <p className="text-[11.5px] text-muted">
              Terpakai saat ini{" "}
              <span className="font-semibold text-fg">{formatBytes(quotaTarget.usedBytes)}</span>
            </p>

            <div>
              <label htmlFor="quota-input" className="label">
                Kuota (GB)
              </label>
              <input
                id="quota-input"
                type="number"
                min="0"
                step="any"
                value={quotaInput}
                onChange={(e) => setQuotaInput(e.target.value)}
                autoFocus
                className="input"
              />
              <p className="mt-1 text-[11px] text-subtle">
                Isi 0 untuk tanpa batas. Kuota tidak boleh lebih kecil dari pemakaian saat ini.
              </p>
            </div>

            {quotaError && (
              <p className="rounded-xl border border-danger-border bg-danger-soft px-3 py-2 text-[11.5px] text-danger">
                {quotaError}
              </p>
            )}

            <div className="flex items-center justify-end gap-2 border-t border-line pt-3">
              <button type="button" onClick={() => setQuotaTarget(null)} className="btn btn-ghost">
                Batal
              </button>
              <button type="submit" disabled={quotaSaving} className="btn btn-primary">
                {quotaSaving ? "Menyimpan…" : "Simpan"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
