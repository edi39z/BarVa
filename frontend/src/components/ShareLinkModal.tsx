"use client";

import React from "react";
import { Copy, Share2 } from "lucide-react";
import type { DisplayItem } from "@/lib/displayItem";
import type { ShareExpiry, SharePermission } from "@/lib/types";
import Modal from "@/components/Modal";
import { useConfirm } from "@/components/ConfirmProvider";

interface ShareLinkModalProps {
  item: DisplayItem;
  expiry: ShareExpiry;
  onExpiryChange: (value: ShareExpiry) => void;
  permission: SharePermission;
  onPermissionChange: (value: SharePermission) => void;
  password: string;
  onPasswordChange: (value: string) => void;
  generatedUrl: string;
  generated: boolean;
  generating: boolean;
  onGenerate: () => void;
  onClose: () => void;
}

export default function ShareLinkModal({
  item,
  expiry,
  onExpiryChange,
  permission,
  onPermissionChange,
  password,
  onPasswordChange,
  generatedUrl,
  generated,
  generating,
  onGenerate,
  onClose,
}: ShareLinkModalProps) {
  const { notify } = useConfirm();
  return (
    <Modal
      title="Bagikan tautan"
      description={`Siapa pun yang memiliki tautan ini bisa membuka “${item.name}”.`}
      icon={<Share2 className="h-4 w-4" aria-hidden />}
      onClose={onClose}
      footer={
        generated ? (
          <button onClick={onClose} className="btn btn-primary">
            Selesai
          </button>
        ) : (
          <>
            <button onClick={onClose} className="btn btn-ghost">
              Batal
            </button>
            <button onClick={onGenerate} disabled={generating} className="btn btn-primary">
              {generating ? "Membuat tautan…" : "Buat tautan"}
            </button>
          </>
        )
      }
    >
      <div className="space-y-3">
        <div>
          <label htmlFor="share-expiry" className="label">
            Berlaku sampai
          </label>
          <select
            id="share-expiry"
            value={expiry}
            onChange={(e) => onExpiryChange(e.target.value as ShareExpiry)}
            className="select"
          >
            <option value="24h">24 jam (1 hari)</option>
            <option value="7d">7 hari</option>
            <option value="30d">30 hari</option>
            <option value="never">Tanpa batas waktu</option>
          </select>
        </div>

        <div>
          <label htmlFor="share-permission" className="label">
            Izin akses
          </label>
          <select
            id="share-permission"
            value={permission}
            onChange={(e) => onPermissionChange(e.target.value as SharePermission)}
            className="select"
          >
            <option value="viewer">Hanya melihat & mengunduh</option>
            <option value="uploader">Boleh mengunggah berkas tambahan</option>
          </select>
        </div>

        <div>
          <label htmlFor="share-password" className="label">
            Kata sandi (opsional)
          </label>
          <input
            id="share-password"
            type="password"
            value={password}
            onChange={(e) => onPasswordChange(e.target.value)}
            placeholder="Kosongkan jika tidak perlu"
            className="input"
          />
          <p className="mt-1 text-[11px] text-subtle">
            Disarankan untuk berkas pribadi seperti dokumen identitas.
          </p>
        </div>

        {generated && (
          <div className="rounded-xl border border-brand-border bg-brand-soft p-3">
            <p className="text-[10.5px] font-semibold uppercase tracking-wide text-brand">
              Tautan aktif
            </p>
            <div className="mt-1.5 flex items-center gap-2 rounded-lg bg-surface p-2">
              <span className="min-w-0 flex-1 truncate font-mono text-[11.5px] text-fg">{generatedUrl}</span>
              <button
                onClick={async () => {
                  if (typeof navigator !== "undefined" && navigator.clipboard) {
                    await navigator.clipboard.writeText(generatedUrl);
                  }
                  await notify({
                    title: "Tautan disalin",
                    message: "Sekarang kamu bisa mengirim tautan ini ke siapa pun yang kamu pilih.",
                    tone: "info",
                  });
                }}
                className="btn btn-sm btn-secondary shrink-0"
              >
                <Copy className="h-3.5 w-3.5" aria-hidden />
                Salin
              </button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
