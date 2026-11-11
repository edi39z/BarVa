"use client";

import React from "react";
import {
  Activity,
  CheckCircle2,
  Download,
  Image as ImageIcon,
} from "lucide-react";
import { getStreamUrl } from "@/lib/api/nas";
import type { DisplayItem } from "@/lib/displayItem";
import Modal from "@/components/Modal";

interface MediaLightboxProps {
  item: DisplayItem;
  onClose: () => void;
  onDownload: (item: DisplayItem) => void;
}

export default function MediaLightbox({ item, onClose, onDownload }: MediaLightboxProps) {
  const mediaSrc = item.blob ? URL.createObjectURL(item.blob) : getStreamUrl(item.id);

  return (
    <Modal
      title={item.name}
      description={`${item.sizeStr}${item.dimensions ? ` · ${item.dimensions}` : ""}`}
      icon={<ImageIcon className="h-4 w-4" aria-hidden />}
      size="xl"
      onClose={onClose}
      bodyClassName="bg-surface-2"
      footer={
        <>
          <button onClick={onClose} className="btn btn-secondary">
            Tutup
          </button>
          <button onClick={() => onDownload(item)} className="btn btn-primary">
            <Download className="h-4 w-4" aria-hidden />
            Unduh berkas
          </button>
        </>
      }
    >
      <div className="flex min-h-[260px] items-center justify-center rounded-xl bg-black/90 p-2">
        {item.type === "video" ? (
          <div className="flex w-full flex-col items-center">
            <video
              controls
              autoPlay
              playsInline
              className="max-h-[52vh] w-full rounded-lg bg-black"
              src={mediaSrc}
            >
              Format video tidak didukung browser ini.
            </video>
            <p className="mt-2 flex items-center gap-1.5 text-[11px] text-white/70">
              <Activity className="h-3.5 w-3.5" aria-hidden />
              Dapat diputar sambil diunduh
            </p>
          </div>
        ) : item.type === "image" ? (
          // Sumbernya object URL lokal atau endpoint media NAS, jadi tidak bisa
          // dioptimasi next/image. Ukurannya dibatasi CSS agar tidak meluber.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={mediaSrc}
            alt={item.name}
            className="max-h-[60vh] w-auto max-w-full rounded-lg object-contain"
          />
        ) : (
          <div className="flex flex-col items-center gap-2 py-10 text-center">
            <ImageIcon className="h-14 w-14 text-white/40" aria-hidden />
            <p className="text-[12px] text-white/70">Pratinjau tidak tersedia untuk jenis berkas ini.</p>
          </div>
        )}
      </div>

      <dl className="mt-3 grid grid-cols-2 gap-2 text-[11.5px]">
        <div className="rounded-xl border border-line bg-surface p-2.5">
          <dt className="text-subtle">Ukuran</dt>
          <dd className="font-semibold text-fg">{item.sizeStr}</dd>
        </div>
        <div className="rounded-xl border border-line bg-surface p-2.5">
          <dt className="text-subtle">Terakhir diubah</dt>
          <dd className="font-semibold text-fg">{item.updatedAt}</dd>
        </div>
        <div className="col-span-2 flex items-center gap-1.5 rounded-xl border border-success-border bg-success-soft p-2.5 text-success">
          <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
          <span>Berkas utuh dan tidak berubah</span>
        </div>
      </dl>
    </Modal>
  );
}
