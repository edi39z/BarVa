"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Archive,
  FileText,
  Film,
  Folder,
  HardDrive,
  Image as ImageIcon,
  RefreshCw,
  User as UserIcon,
} from "lucide-react";
import Modal from "@/components/Modal";
import {
  fetchUsageSummary,
  type NasUsageKind,
  type NasUsageSummary,
  type NasUser,
} from "@/lib/api/nas";
import type { DisplayItem } from "@/lib/displayItem";
import { formatBytes } from "@/lib/nasDisplay";
import type { ConnectionMode } from "@/lib/types";

interface AccountSettingsModalProps {
  connectionMode: ConnectionMode;
  currentUser: NasUser | null;
  localItems: DisplayItem[];
  onClose: () => void;
}

const TYPE_ORDER: NasUsageKind[] = ["image", "video", "document", "archive"];

const TYPE_META: Record<NasUsageKind, { label: string; icon: typeof ImageIcon; bar: string }> = {
  image: { label: "Foto", icon: ImageIcon, bar: "bg-brand-solid" },
  video: { label: "Video", icon: Film, bar: "bg-info" },
  document: { label: "Dokumen", icon: FileText, bar: "bg-success" },
  archive: { label: "Arsip", icon: Archive, bar: "bg-warn" },
};

/** Rincian per jenis dari IndexedDB untuk mode standalone (tanpa server). */
function summarizeLocal(items: DisplayItem[]): NasUsageSummary {
  const sizes = new Map<NasUsageKind, { size: number; count: number }>(
    TYPE_ORDER.map((kind) => [kind, { size: 0, count: 0 }])
  );

  let total = 0;
  for (const item of items) {
    if (item.type === "folder") continue;
    const size = item.sizeBytes || 0;
    total += size;
    const entry = sizes.get(item.type as NasUsageKind);
    if (entry) {
      entry.size += size;
      entry.count += 1;
    }
  }

  return {
    quota_bytes: 0,
    used_bytes: total,
    by_type: TYPE_ORDER.map((kind) => {
      const entry = sizes.get(kind) ?? { size: 0, count: 0 };
      return { type: kind, size_bytes: entry.size, file_count: entry.count };
    }),
    by_folder: [],
  };
}

function ratio(part: number, whole: number): number {
  if (whole <= 0) return 0;
  return Math.min(100, Math.round((part / whole) * 100));
}

export default function AccountSettingsModal({
  connectionMode,
  currentUser,
  localItems,
  onClose,
}: AccountSettingsModalProps) {
  const [summary, setSummary] = useState<NasUsageSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (connectionMode !== "nas" || !currentUser) return;
    setLoading(true);
    setError("");
    try {
      setSummary(await fetchUsageSummary());
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [connectionMode, currentUser]);

  useEffect(() => {
    // Status loading dinyalakan sinkron oleh `load`; itu bagian dari efek
    // samping fetch, bukan state turunan yang bisa dipakai di render.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  const data = useMemo(
    () => (connectionMode === "nas" ? summary : summarizeLocal(localItems)),
    [connectionMode, summary, localItems]
  );

  const usedBytes = data?.used_bytes ?? 0;
  const quotaBytes = data?.quota_bytes ?? 0;
  const usedPercent = ratio(usedBytes, quotaBytes);
  const biggestFolder = data?.by_folder.reduce((max, folder) => Math.max(max, folder.size_bytes), 0) ?? 0;

  return (
    <Modal
      title="Pengaturan akun"
      description="Pemakaian penyimpanan akunmu dan rinciannya."
      icon={<UserIcon className="h-5 w-5" aria-hidden />}
      size="xl"
      onClose={onClose}
      footer={
        <button type="button" onClick={onClose} className="btn btn-secondary">
          Tutup
        </button>
      }
    >
      <div className="space-y-5">
        {/* Identitas */}
        <div className="flex items-center gap-3 rounded-xl border border-line bg-surface-2 p-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand-soft text-sm font-bold uppercase text-brand">
            {(currentUser?.username ?? "L").slice(0, 2)}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-fg">
              {currentUser?.username ?? "Mode mandiri"}
            </p>
            <p className="truncate text-[12px] text-subtle">
              {currentUser
                ? `${currentUser.email} · ${currentUser.role}`
                : "Penyimpanan lokal di perangkat ini"}
            </p>
          </div>
        </div>

        {/* Ringkasan kuota */}
        <section className="rounded-xl border border-line bg-surface-2 p-3">
          <div className="flex items-center justify-between text-[12.5px]">
            <span className="flex items-center gap-1.5 font-medium text-muted">
              <HardDrive className="h-4 w-4 text-brand" aria-hidden />
              Ruang terpakai
            </span>
            <span className="font-semibold tabular-nums text-fg">{formatBytes(usedBytes)}</span>
          </div>
          <div
            className="mt-2 h-2 w-full overflow-hidden rounded-full bg-surface-3"
            role="progressbar"
            aria-label="Pemakaian kuota"
            aria-valuenow={usedPercent}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div
              className={`h-full rounded-full transition-all duration-300 ${
                usedPercent > 85 ? "bg-danger" : usedPercent > 60 ? "bg-warn" : "bg-brand-solid"
              }`}
              style={{ width: `${usedBytes > 0 && quotaBytes > 0 ? Math.max(4, usedPercent) : 0}%` }}
            />
          </div>
          <p className="mt-1.5 text-[11.5px] text-subtle">
            {quotaBytes > 0
              ? `${formatBytes(usedBytes)} dari ${formatBytes(quotaBytes)} (${usedPercent}%)`
              : connectionMode === "nas"
                ? "Tanpa batas kuota"
                : "Tidak ada batas kuota di mode mandiri"}
          </p>
        </section>

        {loading && (
          <p className="flex items-center gap-2 text-[12.5px] text-muted">
            <RefreshCw className="h-4 w-4 animate-spin" aria-hidden />
            Menghitung pemakaian…
          </p>
        )}

        {error && (
          <div className="rounded-xl border border-danger-border bg-danger-soft p-3 text-[12.5px] text-danger">
            <p>{error}</p>
            <button type="button" onClick={load} className="btn btn-secondary btn-sm mt-2">
              Coba lagi
            </button>
          </div>
        )}

        {/* Per jenis berkas */}
        {!error && data && (
          <section>
            <h3 className="mb-2 text-[12.5px] font-semibold text-fg">Per jenis berkas</h3>
            <ul className="space-y-2.5">
              {TYPE_ORDER.map((kind) => {
                const entry = data.by_type.find((item) => item.type === kind);
                const size = entry?.size_bytes ?? 0;
                const count = entry?.file_count ?? 0;
                const meta = TYPE_META[kind];
                const Icon = meta.icon;
                return (
                  <li key={kind}>
                    <div className="flex items-center justify-between text-[12px]">
                      <span className="flex items-center gap-1.5 text-muted">
                        <Icon className="h-3.5 w-3.5" aria-hidden />
                        {meta.label}
                      </span>
                      <span className="tabular-nums text-fg">
                        {formatBytes(size)}
                        <span className="ml-1.5 text-subtle">· {count} berkas</span>
                      </span>
                    </div>
                    <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-surface-3">
                      <div
                        className={`h-full rounded-full ${meta.bar} transition-all duration-300`}
                        style={{ width: `${ratio(size, usedBytes)}%` }}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        {/* Folder terbesar */}
        {!error && data && connectionMode === "nas" && (
          <section>
            <h3 className="mb-2 text-[12.5px] font-semibold text-fg">Folder terbesar</h3>
            {data.by_folder.length === 0 ? (
              <p className="text-[12px] text-subtle">Belum ada berkas di folder mana pun.</p>
            ) : (
              <ul className="space-y-2">
                {data.by_folder.map((folder, index) => (
                  <li key={folder.id ?? `root-${index}`}>
                    <div className="flex items-center justify-between gap-2 text-[12px]">
                      <span className="flex min-w-0 items-center gap-1.5 text-muted">
                        <Folder className="h-3.5 w-3.5 shrink-0" aria-hidden />
                        <span className="truncate">{folder.id ? folder.name : "Di luar folder"}</span>
                      </span>
                      <span className="shrink-0 tabular-nums text-fg">
                        {formatBytes(folder.size_bytes)}
                        <span className="ml-1.5 text-subtle">· {folder.file_count} berkas</span>
                      </span>
                    </div>
                    <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-surface-3">
                      <div
                        className="h-full rounded-full bg-brand-solid transition-all duration-300"
                        style={{ width: `${ratio(folder.size_bytes, biggestFolder)}%` }}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            )}
            {data.by_folder.length >= 50 && (
              <p className="mt-2 text-[11.5px] text-subtle">Hanya folder terbesar yang ditampilkan.</p>
            )}
            <p className="mt-2 text-[11.5px] text-subtle">
              Ukuran folder dihitung sampai subfolder. Berkas yang sama di dua folder ikut
              terhitung di keduanya, jadi jumlah baris bisa melebihi total pemakaian.
            </p>
          </section>
        )}

        {connectionMode !== "nas" && (
          <p className="text-[11.5px] text-subtle">
            Rincian per folder hanya tersedia saat terhubung ke server NAS.
          </p>
        )}
      </div>
    </Modal>
  );
}
