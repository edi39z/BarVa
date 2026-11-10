"use client";

import React from "react";
import { Activity, Check, RefreshCw, Server, Wifi, WifiOff } from "lucide-react";
import type { NasHealthResponse } from "@/lib/api/nas";
import Modal from "@/components/Modal";

export type ConnectionMode = "standalone" | "nas";

interface ServerSettingsModalProps {
  mode: ConnectionMode;
  onModeChange: (mode: ConnectionMode) => void;
  serverUrl: string;
  onServerUrlChange: (value: string) => void;
  adminKey: string;
  onAdminKeyChange: (value: string) => void;
  testing: boolean;
  pingMessage: string;
  status: "online" | "offline" | "checking";
  health: NasHealthResponse | null;
  onTestPing: () => void;
  onSave: () => void;
  onClose: () => void;
}

export default function ServerSettingsModal({
  mode,
  onModeChange,
  serverUrl,
  onServerUrlChange,
  adminKey,
  onAdminKeyChange,
  testing,
  pingMessage,
  status,
  health,
  onTestPing,
  onSave,
  onClose,
}: ServerSettingsModalProps) {
  return (
    <Modal
      title="Pengaturan server"
      description="Pilih tempat penyimpanan dan alamat server rumah Anda."
      icon={<Server className="h-4 w-4" aria-hidden />}
      size="lg"
      onClose={onClose}
      footer={
        <>
          <button onClick={onClose} className="btn btn-ghost">
            Batal
          </button>
          <button onClick={onSave} className="btn btn-primary">
            Simpan
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <fieldset>
          <legend className="label">Tempat penyimpanan</legend>
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => onModeChange("nas")}
              aria-pressed={mode === "nas"}
              className={`rounded-xl border p-3 text-left transition-colors ${
                mode === "nas"
                  ? "border-brand-border bg-brand-soft"
                  : "border-line bg-surface hover:border-line-strong"
              }`}
            >
              <span className="flex items-center justify-between">
                <span className="text-[12.5px] font-semibold text-fg">Server rumah (NAS)</span>
                {mode === "nas" && <Check className="h-3.5 w-3.5 text-brand" aria-hidden />}
              </span>
              <span className="mt-1 block text-[11px] leading-relaxed text-subtle">
                Kapasitas besar, bisa diakses semua anggota keluarga.
              </span>
            </button>

            <button
              type="button"
              onClick={() => onModeChange("standalone")}
              aria-pressed={mode === "standalone"}
              className={`rounded-xl border p-3 text-left transition-colors ${
                mode === "standalone"
                  ? "border-warn-border bg-warn-soft"
                  : "border-line bg-surface hover:border-line-strong"
              }`}
            >
              <span className="flex items-center justify-between">
                <span className="text-[12.5px] font-semibold text-fg">Hanya perangkat ini</span>
                {mode === "standalone" && <Check className="h-3.5 w-3.5 text-warn" aria-hidden />}
              </span>
              <span className="mt-1 block text-[11px] leading-relaxed text-subtle">
                Tanpa server. Berkas tersimpan di browser perangkat ini.
              </span>
            </button>
          </div>
        </fieldset>

        <div>
          <label htmlFor="server-url" className="label">
            Alamat server
          </label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              id="server-url"
              type="text"
              value={serverUrl}
              onChange={(e) => onServerUrlChange(e.target.value)}
              placeholder="http://192.168.18.10:8080"
              className="input font-mono"
            />
            <button onClick={onTestPing} disabled={testing} className="btn btn-secondary shrink-0">
              {testing ? (
                <RefreshCw className="h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <Activity className="h-4 w-4 text-brand" aria-hidden />
              )}
              Uji koneksi
            </button>
          </div>
          <p className="mt-1 text-[11px] text-subtle">
            Gunakan alamat IP rumah, nama Tailscale, atau domain VPN.
          </p>
        </div>

        <div>
          <label htmlFor="admin-key" className="label">
            Admin key (opsional)
          </label>
          <input
            id="admin-key"
            type="password"
            value={adminKey}
            onChange={(e) => onAdminKeyChange(e.target.value)}
            placeholder="Sama dengan NAS_ADMIN_KEY di server"
            className="input font-mono"
          />
          <p className="mt-1 text-[11px] text-subtle">
            Diperlukan untuk mengelola undangan dan Google Drive bila server memakai kunci admin.
          </p>
        </div>

        {pingMessage && (
          <div
            role="status"
            className={`flex items-start gap-2 rounded-xl border px-3 py-2.5 text-[12px] ${
              status === "online"
                ? "border-success-border bg-success-soft text-success"
                : "border-danger-border bg-danger-soft text-danger"
            }`}
          >
            {status === "online" ? (
              <Wifi className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            ) : (
              <WifiOff className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            )}
            <span>{pingMessage}</span>
          </div>
        )}

        {health && status === "online" && (
          <dl className="space-y-1.5 rounded-xl border border-line bg-surface-2 p-3 text-[11.5px]">
            <div className="flex justify-between gap-3">
              <dt className="text-subtle">Status</dt>
              <dd className="flex items-center gap-1 font-semibold text-success">
                <span className="h-1.5 w-1.5 rounded-full bg-success" aria-hidden /> Online
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-subtle">Versi</dt>
              <dd className="font-mono text-fg">{health.version}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-subtle">Folder data</dt>
              <dd className="max-w-[240px] truncate font-mono text-fg">{health.storage_path}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-subtle">Database</dt>
              <dd className={health.database ? "font-semibold text-success" : "font-semibold text-warn"}>
                {health.database ? "Terhubung" : "Tanpa database"}
              </dd>
            </div>
          </dl>
        )}
      </div>
    </Modal>
  );
}
