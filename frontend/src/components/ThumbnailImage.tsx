"use client";

import React, { useEffect, useState } from "react";

interface ThumbnailImageProps {
  /** URL pratinjau dari server. Diabaikan bila `blob` diisi. */
  src?: string | null;
  /** Berkas lokal dari IndexedDB. Dibuat object URL sementara. */
  blob?: Blob;
  alt: string;
  className?: string;
  /** Ditampilkan bila tidak ada sumber atau gambar gagal dimuat. */
  fallback?: React.ReactNode;
}

// Gambar pratinjau dengan dua sumber: berkas lokal (object URL yang dibersihkan
// saat unmount) atau URL thumbnail server. Bila gagal, fallback dirender.
export default function ThumbnailImage({
  src,
  blob,
  alt,
  className,
  fallback = null,
}: ThumbnailImageProps) {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  // URL yang gagal dimuat, bukan boolean. Dengan begitu status gagal otomatis
  // kembali normal ketika sumbernya berganti, tanpa perlu efek reset.
  const [failedUrl, setFailedUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    // Object URL hanya bisa dibuat setelah render dan wajib dibersihkan saat
    // unmount, jadi nilainya memang baru diketahui di dalam efek.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setObjectUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [blob]);

  const url = blob ? objectUrl : (src ?? null);
  const failed = url !== null && failedUrl === url;

  if (!url || failed) return <>{fallback}</>;

  return (
    // Object URL lokal dan endpoint thumbnail NAS tidak bisa dioptimasi next/image.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt={alt}
      loading="lazy"
      className={className}
      onError={() => setFailedUrl(url)}
    />
  );
}
