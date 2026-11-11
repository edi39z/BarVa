"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createShare, deleteShare, listShares } from "@/lib/api/cloud";
import type { NasUser } from "@/lib/api/nas";
import type { DisplayItem } from "@/lib/displayItem";
import { detectFileType } from "@/lib/fileTypes";
import type { ActiveShare } from "@/lib/nasDisplay";
import type { ConnectionMode, ShareExpiry, SharePermission } from "@/lib/types";

interface UseSharesOptions {
  connectionMode: ConnectionMode;
  currentUser: NasUser | null;
}

/**
 * State link berbagi: modal pembuatan, opsi masa berlaku/password/izin, dan
 * daftar link aktif milik pengguna.
 *
 * Pembuatan link hanya tersedia di mode NAS; di mode mandiri berkas tidak punya
 * ID server yang bisa dirujuk tautan publik.
 */
export function useShares({ connectionMode, currentUser }: UseSharesOptions) {
  const [modalFile, setModalFile] = useState<DisplayItem | null>(null);
  const [linkGenerated, setLinkGenerated] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [expiryOption, setExpiryOption] = useState<ShareExpiry>("7d");
  const [passwordInput, setPasswordInput] = useState("");
  const [permission, setPermission] = useState<SharePermission>("viewer");
  const [generatedUrl, setGeneratedUrl] = useState("");
  const [activeShares, setActiveShares] = useState<ActiveShare[]>([]);

  const reload = useCallback(async () => {
    try {
      const rows = await listShares();
      setActiveShares(
        rows.map((r) => ({
          id: r.ID,
          fileName: r.NodeName,
          fileType: detectFileType({
            mime: r.MimeType,
            name: r.NodeName,
            isDirectory: r.IsDirectory,
          }),
          rawToken: "",
          shareUrl: "",
          permission: r.Permission === "uploader" ? "uploader" : "viewer",
          expiresAtStr: r.ExpiresAt
            ? new Date(r.ExpiresAt).toLocaleDateString("id-ID", {
                day: "numeric",
                month: "short",
                year: "numeric",
              })
            : "Tanpa batas",
          hasPassword: Boolean(r.HasPassword),
        }))
      );
    } catch {
      setActiveShares([]);
    }
  }, []);

  useEffect(() => {
    // `reload` mengisi state dari API saat mode NAS aktif; pemicunya perubahan
    // koneksi/pengguna, bukan render.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (connectionMode === "nas" && currentUser) reload();
  }, [connectionMode, currentUser, reload]);

  /** Buka modal untuk satu item, selalu mulai dari formulir yang bersih. */
  const open = useCallback((item: DisplayItem) => {
    setModalFile(item);
    setLinkGenerated(false);
    setGeneratedUrl("");
    setPasswordInput("");
  }, []);

  const close = useCallback(() => {
    setModalFile(null);
    setLinkGenerated(false);
  }, []);

  const generate = useCallback(async () => {
    if (!modalFile) return;

    if (connectionMode !== "nas") {
      alert("Link berbagi hanya tersedia untuk berkas di server NAS.");
      return;
    }

    setGenerating(true);
    try {
      const created = await createShare({
        node_id: modalFile.id,
        permission: permission === "uploader" ? "uploader" : "viewer",
        password: passwordInput || undefined,
        expires_in: expiryOption === "never" ? undefined : expiryOption,
      });

      const origin = typeof window !== "undefined" ? window.location.origin : "";
      setGeneratedUrl(`${origin}/s/${created.raw_token}`);
      setLinkGenerated(true);
      await reload();
    } catch (err) {
      alert(`Gagal membuat link berbagi: ${(err as Error).message}`);
    } finally {
      setGenerating(false);
    }
  }, [modalFile, connectionMode, permission, passwordInput, expiryOption, reload]);

  const revoke = useCallback(
    async (id: string) => {
      if (
        !confirm(
          "Cabut link berbagi ini? Pengguna yang memegang link tidak akan bisa mengakses file lagi."
        )
      ) {
        return;
      }
      try {
        await deleteShare(id);
        await reload();
      } catch (err) {
        alert(`Gagal mencabut link: ${(err as Error).message}`);
      }
    },
    [reload]
  );

  return useMemo(
    () => ({
      modalFile,
      linkGenerated,
      generating,
      expiryOption,
      setExpiryOption,
      passwordInput,
      setPasswordInput,
      permission,
      setPermission,
      generatedUrl,
      activeShares,
      open,
      close,
      generate,
      revoke,
      reload,
    }),
    [
      modalFile,
      linkGenerated,
      generating,
      expiryOption,
      passwordInput,
      permission,
      generatedUrl,
      activeShares,
      open,
      close,
      generate,
      revoke,
      reload,
    ]
  );
}
