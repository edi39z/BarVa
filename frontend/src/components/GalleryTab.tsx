"use client";

import React from "react";
import { Heart, Image as ImageIcon, Play } from "lucide-react";
import type { DisplayItem } from "@/lib/nasDisplay";
import ThumbnailImage from "@/components/ThumbnailImage";

export type GalleryCategory = "all" | "image" | "video" | "favorite";

interface GalleryTabProps {
  items: DisplayItem[];
  category: GalleryCategory;
  onCategoryChange: (category: GalleryCategory) => void;
  onOpen: (item: DisplayItem) => void;
  /** URL pratinjau server; null bila item tidak punya pratinjau. */
  thumbnailUrl: (item: DisplayItem) => string | null;
}

const CATEGORY_FILTERS: Record<GalleryCategory, (item: DisplayItem) => boolean> = {
  all: (item) => item.type === "image" || item.type === "video",
  image: (item) => item.type === "image",
  video: (item) => item.type === "video",
  favorite: (item) => (item.type === "image" || item.type === "video") && Boolean(item.isFavorite),
};

export default function GalleryTab({
  items,
  category,
  onCategoryChange,
  onOpen,
  thumbnailUrl,
}: GalleryTabProps) {
  const visible = items.filter(CATEGORY_FILTERS[category]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-zinc-800 pb-4">
        <div>
          <h2 className="text-base font-semibold text-zinc-100">Galeri Media Keluarga</h2>
          <p className="text-xs text-zinc-400">
            Foto & video Anda • Streaming instan via HTTP 206 Partial Content
          </p>
        </div>
        <div className="flex items-center gap-1.5 p-1 bg-zinc-900 border border-zinc-800 rounded-lg text-xs w-fit">
          <button
            onClick={() => onCategoryChange("all")}
            className={`px-3 py-1.5 rounded-md font-medium transition-colors cursor-pointer ${
              category === "all" ? "bg-blue-600 text-white" : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            Semua
          </button>
          <button
            onClick={() => onCategoryChange("image")}
            className={`px-3 py-1.5 rounded-md font-medium transition-colors cursor-pointer ${
              category === "image" ? "bg-blue-600 text-white" : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            Foto
          </button>
          <button
            onClick={() => onCategoryChange("video")}
            className={`px-3 py-1.5 rounded-md font-medium transition-colors cursor-pointer ${
              category === "video" ? "bg-blue-600 text-white" : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            Video
          </button>
          <button
            onClick={() => onCategoryChange("favorite")}
            className={`px-3 py-1.5 rounded-md font-medium transition-colors cursor-pointer flex items-center gap-1 ${
              category === "favorite" ? "bg-rose-600 text-white" : "text-zinc-400 hover:text-rose-400"
            }`}
          >
            <Heart className="h-3 w-3" />
            <span>Favorit</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
        {visible.map((photo) => (
          <div
            key={photo.id}
            onClick={() => onOpen(photo)}
            className="group relative aspect-square bg-zinc-900 rounded-xl overflow-hidden cursor-pointer border border-zinc-800/80 hover:border-blue-500/50 transition-all"
          >
            {/* Lapisan dasar: tampil saat thumbnail belum ada atau gagal dimuat */}
            <div className="absolute inset-0 bg-gradient-to-br from-zinc-800 via-zinc-900 to-zinc-950 flex flex-col items-center justify-center p-3 text-center">
              {photo.type === "video" ? (
                <Play className="h-8 w-8 text-blue-400" />
              ) : (
                <ImageIcon className="h-8 w-8 text-zinc-600" />
              )}
              <p className="text-[11px] text-zinc-300 font-medium mt-2 line-clamp-1">{photo.name}</p>
              <p className="text-[10px] text-zinc-500 font-mono">{photo.sizeStr}</p>
            </div>

            <ThumbnailImage
              blob={photo.blob}
              src={thumbnailUrl(photo)}
              alt={photo.name}
              className="absolute inset-0 h-full w-full object-cover group-hover:scale-105 transition-transform duration-300"
            />

            {photo.type === "video" && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="h-10 w-10 rounded-full bg-blue-600/80 text-white flex items-center justify-center shadow-lg">
                  <Play className="h-5 w-5 ml-0.5" />
                </div>
              </div>
            )}

            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/40 to-transparent px-2 pb-1.5 pt-6">
              <p className="text-[11px] text-white font-medium line-clamp-1">{photo.name}</p>
              <p className="text-[10px] text-zinc-300 font-mono">{photo.sizeStr}</p>
            </div>

            <div className="absolute top-2 left-2 right-2 flex items-center justify-between">
              <span className="text-[10px] bg-black/70 backdrop-blur-md px-1.5 py-0.5 rounded text-zinc-300 font-mono">
                {photo.dimensions || photo.duration || "Media"}
              </span>
              {photo.isFavorite && <Heart className="h-3.5 w-3.5 fill-rose-500 text-rose-500" />}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
