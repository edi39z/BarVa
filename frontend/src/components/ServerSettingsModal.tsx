"use client";

import React from "react";
import { Activity, Check, RefreshCw, Server, Wifi, WifiOff, X } from "lucide-react";
import type { NasHealthResponse } from "@/lib/api/nas";

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
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-lg p-6 space-y-5 shadow-2xl">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5 text-zinc-100 font-semibold text-sm">
            <Server className="h-4 w-4 text-blue-400" />
            <span>Pengaturan Server NAS Homelab</span>
          </div>
          <button onClick={onClose} className="text-zinc-500 hover:text-white cursor-pointer">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Mode Selector */}
        <div className="space-y-2">
          <label className="text-xs font-medium text-zinc-300">Mode Operasi Aplikasi</label>
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div
              onClick={() => onModeChange("nas")}
              className={`p-3 rounded-xl border cursor-pointer transition-all ${
                mode === "nas"
                  ? "border-blue-500 bg-blue-500/10 text-white"
                  : "border-zinc-800 bg-zinc-950 text-zinc-400 hover:border-zinc-700"
              }`}
            >
              <div className="flex items-center justify-between">
                <p className="font-semibold text-zinc-200">Private NAS Server</p>
                {mode === "nas" && <Check className="h-3.5 w-3.5 text-blue-400" />}
              </div>
              <p className="text-[11px] text-zinc-400 mt-1">
                Streaming video, deduplikasi CAS, & kapasitas besar ke server rumah.
              </p>
            </div>

            <div
              onClick={() => onModeChange("standalone")}
              className={`p-3 rounded-xl border cursor-pointer transition-all ${
                mode === "standalone"
                  ? "border-amber-500 bg-amber-500/10 text-white"
                  : "border-zinc-800 bg-zinc-950 text-zinc-400 hover:border-zinc-700"
              }`}
            >
              <div className="flex items-center justify-between">
                <p className="font-semibold text-zinc-200">Mode Standalone</p>
                {mode === "standalone" && <Check className="h-3.5 w-3.5 text-amber-400" />}
              </div>
              <p className="text-[11px] text-zinc-400 mt-1">
                100% offline di HP/laptop via IndexedDB & Studio WASM tanpa server.
              </p>
            </div>
          </div>
        </div>

        {/* Server Endpoint URL Input */}
        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium text-zinc-300 block mb-1">
              Alamat Endpoint Backend Server
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={serverUrl}
                onChange={(e) => onServerUrlChange(e.target.value)}
                placeholder="http://localhost:8080 atau http://192.168.18.10:8080"
                className="flex-1 bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs font-mono text-zinc-200 focus:outline-none focus:border-blue-500"
              />
              <button
                onClick={onTestPing}
                disabled={testing}
                className="bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-medium px-3.5 py-2 rounded-lg transition-colors cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
              >
                {testing ? (
                  <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Activity className="h-3.5 w-3.5 text-blue-400" />
                )}
                <span>Test Ping</span>
              </button>
            </div>
            <p className="text-[10px] text-zinc-500 mt-1">
              Gunakan IP lokal jaringan rumah, hostname Tailscale, atau domain VPN.
            </p>
          </div>

          {/* Admin Key untuk endpoint Google Drive & undangan */}
          <div>
            <label className="text-xs font-medium text-zinc-300 block mb-1">
              Admin Key (opsional)
            </label>
            <input
              type="password"
              value={adminKey}
              onChange={(e) => onAdminKeyChange(e.target.value)}
              placeholder="Samakan dengan env NAS_ADMIN_KEY di server"
              className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs font-mono text-zinc-200 focus:outline-none focus:border-blue-500"
            />
            <p className="text-[10px] text-zinc-500 mt-1">
              Wajib jika server disetel <code>NAS_ADMIN_KEY</code>. Tanpa key, endpoint hanya bisa
              diakses dari jaringan lokal.
            </p>
          </div>

          {/* Ping Message Status */}
          {pingMessage && (
            <div
              className={`p-3 rounded-xl text-xs flex items-center gap-2 ${
                status === "online"
                  ? "bg-emerald-500/10 border border-emerald-500/30 text-emerald-300"
                  : "bg-rose-500/10 border border-rose-500/30 text-rose-300"
              }`}
            >
              {status === "online" ? (
                <Wifi className="h-4 w-4 shrink-0 text-emerald-400" />
              ) : (
                <WifiOff className="h-4 w-4 shrink-0 text-rose-400" />
              )}
              <span>{pingMessage}</span>
            </div>
          )}

          {/* Server Diagnostics & Telemetry */}
          {health && status === "online" && (
            <div className="bg-zinc-950 border border-zinc-800/80 rounded-xl p-3.5 space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-zinc-500">Status Server:</span>
                <span className="text-emerald-400 font-medium flex items-center gap-1">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> Online
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-500">Versi Backend:</span>
                <span className="text-zinc-300 font-mono">{health.version}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-500">Direktori Fisik Disk:</span>
                <span className="text-zinc-300 font-mono truncate max-w-[240px]">
                  {health.storage_path}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-500">Mode Database:</span>
                <span
                  className={
                    health.database ? "text-emerald-400 font-medium" : "text-amber-400 font-medium"
                  }
                >
                  {health.database ? "PostgreSQL Terhubung" : "Storage-Only Mode"}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Modal Actions */}
        <div className="flex items-center justify-end gap-2 pt-2 border-t border-zinc-800">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-medium cursor-pointer"
          >
            Batal
          </button>
          <button
            onClick={onSave}
            className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium cursor-pointer shadow-sm shadow-blue-600/30"
          >
            Simpan & Terapkan
          </button>
        </div>
      </div>
    </div>
  );
}
