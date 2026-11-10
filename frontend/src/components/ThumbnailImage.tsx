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
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!blob) {
      setUrl(src ?? null);
      return;
    }
    const objectUrl = URL.createObjectURL(blob);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [blob, src]);

  useEffect(() => {
    setFailed(false);
  }, [url]);

  if (!url || failed) return <>{fallback}</>;

  return (
    <img
      src={url}
      alt={alt}
      loading="lazy"
      className={className}
      onError={() => setFailed(true)}
    />
  );
}
