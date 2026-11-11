"use client";

import React from "react";
import { Check, Heart, Image as ImageIcon, Play } from "lucide-react";
import type { DisplayItem } from "@/lib/nasDisplay";
import ThumbnailImage from "@/components/ThumbnailImage";
import { useLongPress, type LongPressPoint } from "@/hooks/useLongPress";
import type { SelectModifiers } from "@/hooks/useFileSelection";

export type GalleryCategory = "all" | "image" | "video" | "favorite";

interface GalleryTabProps {
  items: DisplayItem[];
  category: GalleryCategory;
  onCategoryChange: (category: GalleryCategory) => void;
  onOpen: (item: DisplayItem) => void;
  /** URL pratinjau server; null bila item tidak punya pratinjau. */
  thumbnailUrl: (item: DisplayItem) => string | null;
  onOpenMenu: (item: DisplayItem, anchor: LongPressPoint) => void;
  selectionMode: boolean;
  selectedIds: string[];
  onToggleSelect: (item: DisplayItem, modifiers: SelectModifiers) => void;
  onToggleSelectionMode: () => void;
}

const CATEGORY_FILTERS: Record<GalleryCategory, (item: DisplayItem) => boolean> = {
  all: (item) => item.type === "image" || item.type === "video",
  image: (item) => item.type === "image",
  video: (item) => item.type === "video",
  favorite: (item) => (item.type === "image" || item.type === "video") && Boolean(item.isFavorite),
};

const FILTERS: { id: GalleryCategory; label: string; icon?: React.ElementType }[] = [
  { id: "all", label: "Semua" },
  { id: "image", label: "Foto", icon: ImageIcon },
  { id: "video", label: "Video", icon: Play },
  { id: "favorite", label: "Favorit", icon: Heart },
];

export default function GalleryTab({
  items,
  category,
  onCategoryChange,
  onOpen,
  thumbnailUrl,
  onOpenMenu,
  selectionMode,
  selectedIds,
  onToggleSelect,
  onToggleSelectionMode,
}: GalleryTabProps) {
  const visible = items.filter(CATEGORY_FILTERS[category]);

  const pressedItem = React.useRef<DisplayItem | null>(null);
  // Tekan lama memilih media dan menyalakan mode pilih, seperti galeri ponsel.
  // Menu aksi tetap terbuka lewat klik kanan atau tombol ⋮.
  const longPress = useLongPress(() => {
    const item = pressedItem.current;
    if (!item || selectedIds.includes(item.id)) return;
    onToggleSelect(item, {});
  });

  const pressProps = (item: DisplayItem) => ({
    onPointerDown: (event: React.PointerEvent) => {
      pressedItem.current = item;
      longPress.onPointerDown(event);
    },
    onPointerMove: longPress.onPointerMove,
    onPointerUp: longPress.onPointerUp,
    onPointerLeave: longPress.onPointerLeave,
    onPointerCancel: longPress.onPointerCancel,
  });

  const activate = (item: DisplayItem, event: React.MouseEvent) => {
    if (longPress.consumeLongPress()) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    if (selectionMode) {
      onToggleSelect(item, event);
      return;
    }
    onOpen(item);
  };

  return (
    <div className="mx-auto max-w-7xl space-y-4 pb-24 lg:pb-6">
      <div className="flex flex-col gap-3 border-b border-line pb-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-[17px] font-bold text-fg">Galeri Foto & Video</h1>
          <p className="mt-0.5 text-[12.5px] text-subtle">
            {visible.length} media · ketuk untuk melihat, tekan lama untuk memilih, klik kanan untuk aksi
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onToggleSelectionMode}
            aria-pressed={selectionMode}
            className={`btn btn-sm ${selectionMode ? "btn-primary" : "btn-secondary"}`}
          >
            {selectionMode ? "Selesai" : "Pilih"}
          </button>
          <div
            className="flex w-fit items-center gap-1 rounded-xl border border-line bg-surface p-1 text-[12.5px]"
            role="group"
            aria-label="Saring galeri"
          >
            {FILTERS.map(({ id, label, icon: Icon }) => {
              const active = category === id;
              return (
                <button
                  key={id}
                  onClick={() => onCategoryChange(id)}
                  aria-pressed={active}
                  className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 font-semibold transition-colors ${
                    active
                      ? id === "favorite"
                        ? "bg-danger-soft text-danger"
                        : "bg-brand-soft text-brand"
                      : "text-muted hover:text-fg"
                  }`}
                >
                  {Icon && <Icon className="h-3.5 w-3.5" aria-hidden />}
                  {label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {visible.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-line-strong bg-surface px-4 py-16 text-center">
          <ImageIcon className="h-10 w-10 text-subtle" aria-hidden />
          <p className="text-[13.5px] font-semibold text-fg">
            {category === "favorite" ? "Belum ada media favorit" : "Belum ada foto atau video"}
          </p>
          <p className="max-w-sm text-[12px] leading-relaxed text-subtle">
            {category === "favorite"
              ? "Tandai foto dengan ikon hati di menu Semua Berkas agar muncul di sini."
              : "Unggah foto atau video lewat tombol Unggah Berkas, lalu media akan tampil di galeri ini."}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {visible.map((photo) => {
            const selected = selectedIds.includes(photo.id);
            return (
              <div
                key={photo.id}
                role="button"
                tabIndex={0}
                {...pressProps(photo)}
                onContextMenu={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  onOpenMenu(photo, { x: event.clientX, y: event.clientY });
                }}
                onClick={(event) => activate(photo, event)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    if (selectionMode) {
                      onToggleSelect(photo, event);
                    } else {
                      onOpen(photo);
                    }
                  }
                }}
                className={`group relative aspect-square cursor-pointer overflow-hidden rounded-xl border bg-surface-2 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-brand ${
                  selected ? "border-brand-border ring-2 ring-brand/40" : "border-line"
                }`}
                aria-label={`Buka ${photo.name}`}
                aria-pressed={selectionMode ? selected : undefined}
              >
                <span className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-gradient-to-br from-surface-2 to-surface-3 p-3 text-center">
                  {photo.type === "video" ? (
                    <Play className="h-7 w-7 text-brand" aria-hidden />
                  ) : (
                    <ImageIcon className="h-7 w-7 text-subtle" aria-hidden />
                  )}
                  <span className="line-clamp-1 text-[11.5px] font-medium text-muted">{photo.name}</span>
                  <span className="text-[10.5px] text-subtle">{photo.sizeStr}</span>
                </span>

                <ThumbnailImage
                  blob={photo.blob}
                  src={thumbnailUrl(photo)}
                  alt={photo.name}
                  className="absolute inset-0 h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                />

                {photo.type === "video" && (
                  <span className="pointer-events-none absolute inset-0 flex items-center justify-center">
                    <span className="flex h-10 w-10 items-center justify-center rounded-full bg-black/55 text-white backdrop-blur-sm">
                      <Play className="ml-0.5 h-5 w-5" aria-hidden />
                    </span>
                  </span>
                )}

                <span className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/35 to-transparent px-2 pb-1.5 pt-6">
                  <span className="line-clamp-1 text-[11px] font-medium text-white">{photo.name}</span>
                </span>

                {photo.isFavorite && (
                  <Heart
                    className="pointer-events-none absolute right-2 top-2 h-4 w-4 fill-white text-white drop-shadow"
                    aria-label="Favorit"
                  />
                )}

                {selectionMode && (
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      onToggleSelect(photo, event);
                    }}
                    className={`absolute left-2 top-2 flex h-6 w-6 items-center justify-center rounded-md border-2 transition-colors ${
                      selected
                        ? "border-brand bg-brand text-white"
                        : "border-white/80 bg-black/30 text-transparent"
                    }`}
                    aria-pressed={selected}
                    aria-label={selected ? `Batalkan pilihan ${photo.name}` : `Pilih ${photo.name}`}
                  >
                    <Check className="h-3.5 w-3.5" aria-hidden />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
