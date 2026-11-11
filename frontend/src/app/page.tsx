"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  saveLocalFile,
  getAllLocalFiles,
  deleteLocalFile,
  toggleFavorite,
  enqueueUpload,
  countQueuedUploads,
} from "@/lib/storage/indexeddb";
import { flushUploadQueue } from "@/lib/uploadQueue";
import { imagesToPDF, mergePDFs } from "@/lib/studio/pdf";
import {
  createInvite,
  listInvites,
  revokeInvite,
  getAdminKey,
  setAdminKey,
  gdriveStatus,
  createShare,
  listShares,
  deleteShare,
  Invite as ServerInvite,
  Member as ServerMember,
} from "@/lib/api/cloud";
import { compressAndResizeImage, CompressionResult } from "@/lib/studio/image";
import {
  describeStudioError,
  type StudioErrorInfo,
} from "@/lib/studio/errors";
import {
  downloadBlob,
  makeImageOutput,
  makePdfOutput,
  persistStudioOutput,
  type StudioOutput,
} from "@/lib/studio/output";
import {
  BG_MODEL_READY_KEY,
  enhancePhoto,
  removeImageBackground,
  type BgProgress,
  type EnhanceResult,
} from "@/lib/studio/ai";
import { PANEL_TOOLS, type StudioToolId } from "@/lib/studio/tools";
import {
  pingNasServer,
  getServerUrl,
  setStoredServerUrl,
  uploadToNas,
  getDownloadUrl,
  getStoredToken,
  getThumbnailUrl,
  getStoredUser,
  fetchMe,
  logoutNas,
  listNasFiles,
  listNasMedia,
  createNasFolder,
  deleteNasFile,
  renameNasFile,
  moveNasFile,
  listNasTrash,
  restoreNasFile,
  purgeNasFile,
  listFamilyMembers,
  updateMemberQuota,
  TrashedNode,
  NasHealthResponse,
  NasUser,
  NasFamilyMember,
} from "@/lib/api/nas";
import AddMemberModal from "@/components/AddMemberModal";
import AuthGate from "@/components/AuthGate";
import FamilySharingTab from "@/components/FamilySharingTab";
import FileActionMenu from "@/components/FileActionMenu";
import FileExplorerTab from "@/components/FileExplorerTab";
import FileSelectionBar from "@/components/FileSelectionBar";
import GalleryTab from "@/components/GalleryTab";
import HomeDashboard from "@/components/HomeDashboard";
import MediaLightbox from "@/components/MediaLightbox";
import MobileNav from "@/components/MobileNav";
import MoveItemModal from "@/components/MoveItemModal";
import ServerSettingsModal from "@/components/ServerSettingsModal";
import Sidebar from "@/components/Sidebar";
import ShareLinkModal from "@/components/ShareLinkModal";
import SmartFolderModal from "@/components/SmartFolderModal";
import StoragePickerModal from "@/components/StoragePickerModal";
import StudioTab from "@/components/StudioTab";
import TrashTab from "@/components/TrashTab";
import WorkspaceHeader from "@/components/WorkspaceHeader";
import {
  actionsForItem,
  actionsForSelection,
  groupItems,
  type FileAction,
  type GroupMode,
} from "@/lib/files/actions";
import {
  FileTooLargeError,
  MAX_PROCESS_BYTES,
  itemToFile,
} from "@/lib/files/materialize";
import { useFileSelection } from "@/hooks/useFileSelection";
import type { DisplayItem } from "@/lib/displayItem";
import { detectFileType } from "@/lib/fileTypes";
import { ActiveShare, FamilyMember, formatBytes, nasNodeToDisplay } from "@/lib/nasDisplay";

import GoogleDrivePanel from "@/components/GoogleDrivePanel";

const AVATAR_PALETTE = [
  "bg-emerald-600",
  "bg-purple-600",
  "bg-amber-600",
  "bg-pink-600",
  "bg-teal-600",
];

/**
 * Warna avatar diturunkan dari identitas anggota, bukan diacak, supaya warnanya
 * tetap sama setiap kali kartu dirender ulang.
 */
function avatarColorFor(seed: string) {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return AVATAR_PALETTE[hash % AVATAR_PALETTE.length];
}

export default function Home() {
  const [activeTab, setActiveTab] = useState<"home" | "files" | "trash" | "gallery" | "studio" | "gdrive" | "shares">("home");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [storageFilter, setStorageFilter] = useState<"local" | "gdrive">("local");
  const [galleryCategory, setGalleryCategory] = useState<"all" | "image" | "video" | "favorite">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadFileName, setUploadFileName] = useState("");
  const [isGdriveConnected, setIsGdriveConnected] = useState(false);
  const [selectedMedia, setSelectedMedia] = useState<DisplayItem | null>(null);
  const [shareModalFile, setShareModalFile] = useState<DisplayItem | null>(null);
  const [shareLinkGenerated, setShareLinkGenerated] = useState(false);
  const [shareGenerating, setShareGenerating] = useState(false);

  // Rename & pindah folder (khusus mode NAS)
  const [moveItems, setMoveItems] = useState<DisplayItem[]>([]);
  const [moveParentId, setMoveParentId] = useState<string | null>(null);
  const [moveCrumbs, setMoveCrumbs] = useState<{ id: string | null; name: string }[]>([
    { id: null, name: "Semua File" },
  ]);
  const [moveFolders, setMoveFolders] = useState<DisplayItem[]>([]);
  const [moveLoading, setMoveLoading] = useState(false);
  const [moveBusy, setMoveBusy] = useState(false);

  // Phase 3: Dual-Mode Connection State
  const [connectionMode, setConnectionMode] = useState<"standalone" | "nas">("nas");
  const [serverUrl, setServerUrl] = useState<string>("http://localhost:8080");
  const [inputServerUrl, setInputServerUrl] = useState<string>("http://localhost:8080");
  const [inputAdminKey, setInputAdminKey] = useState<string>("");
  const [currentUser, setCurrentUser] = useState<NasUser | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [nasHealth, setNasHealth] = useState<NasHealthResponse | null>(null);
  const [nasStatus, setNasStatus] = useState<"online" | "offline" | "checking">("checking");
  const [nasLatency, setNasLatency] = useState<number | null>(null);
  const [isOnline, setIsOnline] = useState(true);
  const [serverModalOpen, setServerModalOpen] = useState(false);
  const [isTestingPing, setIsTestingPing] = useState(false);
  const [pingTestMessage, setPingTestMessage] = useState<string>("");

  // Phase 4: Family Sharing & Remote Access State
  const [familySubTab, setFamilySubTab] = useState<"members" | "shares" | "remote">("members");
  const [addMemberModalOpen, setAddMemberModalOpen] = useState(false);
  const [newMemberName, setNewMemberName] = useState("");
  const [newMemberEmail, setNewMemberEmail] = useState("");
  const [newMemberRole, setNewMemberRole] = useState<"member" | "admin">("member");
  const [newMemberQuotaGB, setNewMemberQuotaGB] = useState<number>(100);

  const [shareExpiryOption, setShareExpiryOption] = useState<"24h" | "7d" | "30d" | "never">("7d");
  const [sharePasswordInput, setSharePasswordInput] = useState("");
  const [sharePermission, setSharePermission] = useState<"viewer" | "uploader">("viewer");
  const [currentGeneratedUrl, setCurrentGeneratedUrl] = useState("");

  const [familyMembers, setFamilyMembers] = useState<FamilyMember[]>([]);

  const [activeShares, setActiveShares] = useState<ActiveShare[]>([]);

  // Folder Drill-down & Breadcrumbs State
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [folderBreadcrumbs, setFolderBreadcrumbs] = useState<{ id: string | null; name: string }[]>([
    { id: null, name: "Semua File" },
  ]);

  // Generated Invitation Link for Family
  const [generatedInviteUrl, setGeneratedInviteUrl] = useState("");
  // Undangan & anggota yang tersimpan di server NAS
  const [serverInvites, setServerInvites] = useState<ServerInvite[]>([]);

  // Local storage items from IndexedDB
  const [localItems, setLocalItems] = useState<DisplayItem[]>([]);

  // File manager NAS — daftar file yang benar-benar ada di server
  const [nasItems, setNasItems] = useState<DisplayItem[]>([]);
  const [nasFilesLoading, setNasFilesLoading] = useState(false);
  const [nasFilesError, setNasFilesError] = useState("");

  // Media NAS lintas folder untuk galeri. Dipisah dari nasItems karena
  // nasItems hanya berisi isi folder yang sedang dibuka.
  const [mediaItems, setMediaItems] = useState<DisplayItem[]>([]);

  // Trash NAS — item yang sudah di-soft-delete tapi belum dihapus permanen
  const [trashItems, setTrashItems] = useState<TrashedNode[]>([]);
  const [trashLoading, setTrashLoading] = useState(false);
  const [trashError, setTrashError] = useState("");
  const [trashBusyId, setTrashBusyId] = useState<string | null>(null);

  // Antrean upload offline
  const [pendingUploads, setPendingUploads] = useState(0);
  const [flushingQueue, setFlushingQueue] = useState(false);

  // Studio State
  const [activeStudioTool, setActiveStudioTool] = useState<StudioToolId>("img2pdf");
  const [studioProcessing, setStudioProcessing] = useState(false);
  const [studioSuccessMsg, setStudioSuccessMsg] = useState("");
  const [studioError, setStudioError] = useState<StudioErrorInfo | null>(null);
  // Berkas dari Storage Picker yang menunggu diolah panel alatnya sendiri.
  const [studioPickedFile, setStudioPickedFile] = useState<File | null>(null);

  // Unified Storage Picker for Studio Tools (Local / NAS / Drive)
  const [storagePickerOpen, setStoragePickerOpen] = useState(false);
  const [storagePickerTool, setStoragePickerTool] = useState<StudioToolId>("img2pdf");
  const [storagePickerTab, setStoragePickerTab] = useState<"local" | "nas" | "gdrive">("local");
  const [selectedStorageIds, setSelectedStorageIds] = useState<string[]>([]);

  // Image compress settings
  const [compressQuality, setCompressQuality] = useState<number>(0.75);
  const [lastCompressResult, setLastCompressResult] = useState<CompressionResult | null>(null);

  // AI tools: hapus latar belakang (model diunduh sekali) + peningkatan foto
  const [bgModelJustDownloaded, setBgModelJustDownloaded] = useState(false);
  const [bgConsentGranted, setBgConsentGranted] = useState(false);
  const [bgProgress, setBgProgress] = useState<BgProgress | null>(null);
  const [bgTolerance, setBgTolerance] = useState(15);
  const [bgDropShadow, setBgDropShadow] = useState(true);
  const [lastEnhanceResult, setLastEnhanceResult] = useState<EnhanceResult | null>(null);

  // Menu aksi per berkas + seleksi banyak + smart foldering
  const selection = useFileSelection();
  const [actionMenuItem, setActionMenuItem] = useState<DisplayItem | null>(null);
  const [actionMenuAnchor, setActionMenuAnchor] = useState<{ x: number; y: number } | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkProgress, setBulkProgress] = useState<{ current: number; total: number; label: string } | null>(null);
  const [smartFolderOpen, setSmartFolderOpen] = useState(false);
  const [smartFolderMode, setSmartFolderMode] = useState<GroupMode>("type");
  const [libraryNotice, setLibraryNotice] = useState("");

  // Model hapus latar belakang cukup diunduh sekali per perangkat.
  const bgModelStored = React.useSyncExternalStore(
    () => () => {},
    () => {
      try {
        return window.localStorage.getItem(BG_MODEL_READY_KEY) === "1";
      } catch {
        return false;
      }
    },
    () => false
  );
  const bgModelReady = bgModelStored || bgModelJustDownloaded;

  const fileInputRef = useRef<HTMLInputElement>(null);
  const studioImg2PdfRef = useRef<HTMLInputElement>(null);
  const studioMergePdfRef = useRef<HTMLInputElement>(null);
  const studioCompressRef = useRef<HTMLInputElement>(null);
  const studioRemoveBgRef = useRef<HTMLInputElement>(null);
  const studioEnhanceRef = useRef<HTMLInputElement>(null);

  // Baca konfigurasi lokal dan isi IndexedDB. Keduanya tidak menyentuh jaringan,
  // jadi tetap jalan di mode apa pun.
  useEffect(() => {
    const savedUrl = getServerUrl();
    // Konfigurasi server hanya ada di localStorage klien, jadi tidak bisa dibaca
    // lewat initializer useState tanpa memicu hydration mismatch saat prerender.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setServerUrl(savedUrl);
    setInputServerUrl(savedUrl);
    setInputAdminKey(getAdminKey());

    async function loadIndexedDB() {
      try {
        const stored = await getAllLocalFiles();
        if (stored.length > 0) {
          const mapped: DisplayItem[] = stored.map((s) => ({
            id: s.id,
            name: s.name,
            type: s.type,
            sizeStr: formatBytes(s.size),
            sizeBytes: s.size,
            updatedAt: new Date(s.updatedAt).toLocaleDateString("id-ID", {
              day: "numeric",
              month: "short",
              hour: "2-digit",
              minute: "2-digit",
            }),
            updatedAtISO: s.updatedAt,
            sha256: s.sha256 ? `${s.sha256.substring(0, 8)}...${s.sha256.substring(s.sha256.length - 8)}` : undefined,
            isFavorite: s.isFavorite,
            blob: s.blob,
          }));
          setLocalItems(mapped);
        }
      } catch (err) {
        console.error("IndexedDB load error:", err);
      }
    }
    loadIndexedDB();
  }, []);

  // Kesehatan server dan status Google Drive hanya ada artinya di mode NAS.
  // Dulu polling ini jalan tanpa syarat, sehingga di mode mandiri interval
  // 10 detik terus menembak localhost:8080 dan membanjiri konsol dengan
  // ERR_CONNECTION_REFUSED untuk server yang memang tidak dipakai.
  //
  // Gerbang `currentUser` penting: sebelum login aplikasi masih menampilkan
  // gerbang autentikasi yang tidak memakai status server sama sekali, jadi
  // probe di tahap itu hanya menghasilkan request gagal di konsol.
  useEffect(() => {
    if (connectionMode !== "nas" || !currentUser) return;

    async function checkHealth() {
      try {
        const h = await pingNasServer(serverUrl);
        setNasHealth(h);
        setNasStatus("online");
        setNasLatency(h.latencyMs ?? null);
      } catch {
        setNasStatus("offline");
        setNasLatency(null);
      }
    }

    // Status Google Drive diambil dari server, bukan dari state lokal.
    async function checkGdrive() {
      try {
        const s = await gdriveStatus();
        setIsGdriveConnected(s.connected);
      } catch {
        setIsGdriveConnected(false);
      }
    }

    checkHealth();
    checkGdrive();
    const pingInterval = setInterval(checkHealth, 10000);
    return () => clearInterval(pingInterval);
  }, [connectionMode, currentUser, serverUrl]);

  // Status jaringan browser. Berbeda dari nasStatus: NAS bisa mati walau
  // internet ada, dan sebaliknya.
  useEffect(() => {
    const sync = () => setIsOnline(navigator.onLine);
    sync();
    window.addEventListener("online", sync);
    window.addEventListener("offline", sync);
    return () => {
      window.removeEventListener("online", sync);
      window.removeEventListener("offline", sync);
    };
  }, []);

  // Muat isi folder aktif langsung dari server NAS.
  const loadNasFiles = useCallback(async (parentId: string | null) => {
    setNasFilesLoading(true);
    setNasFilesError("");
    try {
      const nodes = await listNasFiles(parentId);
      setNasItems(nodes.map(nasNodeToDisplay));
    } catch (err) {
      setNasItems([]);
      setNasFilesError((err as Error).message);
    } finally {
      setNasFilesLoading(false);
    }
  }, []);

  // Di luar mode NAS, `nasItems` yang tersisa tidak pernah dirender karena
  // `activeItems` memilih `localItems`. Jadi tidak perlu direset lewat setState.
  useEffect(() => {
    if (connectionMode !== "nas" || !currentUser) return;
    // Pemuat menyalakan indikator loading secara sinkron supaya UI langsung
    // bereaksi; itu bagian dari efek samping fetch, bukan state turunan.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadNasFiles(currentFolderId);
  }, [connectionMode, currentUser, currentFolderId, loadNasFiles]);

  // Galeri memuat media lintas folder setiap kali tabnya dibuka, supaya
  // unggahan/hapus terbaru langsung terlihat tanpa memuat seluruh pohon berkas.
  useEffect(() => {
    if (connectionMode !== "nas" || !currentUser) return;
    if (activeTab !== "gallery") return;

    let cancelled = false;
    listNasMedia()
      .then((nodes) => {
        if (!cancelled) setMediaItems(nodes.map(nasNodeToDisplay));
      })
      .catch(() => {
        if (!cancelled) setMediaItems([]);
      });

    return () => {
      cancelled = true;
    };
  }, [connectionMode, currentUser, activeTab]);

  // Muat isi trash dari server NAS.
  const loadTrash = useCallback(async () => {
    if (connectionMode !== "nas" || !currentUser) {
      setTrashItems([]);
      return;
    }
    setTrashLoading(true);
    setTrashError("");
    try {
      setTrashItems(await listNasTrash());
    } catch (err) {
      setTrashItems([]);
      setTrashError((err as Error).message);
    } finally {
      setTrashLoading(false);
    }
  }, [connectionMode, currentUser]);

  useEffect(() => {
    // Sama seperti pemuat lain: indikator loading dinyalakan sinkron oleh
    // `loadTrash`, jadi tidak ada state turunan yang bisa dipakai.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadTrash();
  }, [loadTrash]);

  /** Segarkan daftar folder, galeri, dan trash setelah aksi yang mengubah data. */
  const refreshLibrary = useCallback(async () => {
    if (connectionMode !== "nas" || !currentUser) return;
    await loadNasFiles(currentFolderId);
    if (activeTab === "gallery") {
      try {
        setMediaItems((await listNasMedia()).map(nasNodeToDisplay));
      } catch {
        // Biarkan daftar lama; galeri memuat ulang saat tabnya dibuka lagi.
      }
    }
    await loadTrash();
  }, [connectionMode, currentUser, currentFolderId, activeTab, loadNasFiles, loadTrash]);

  /**
   * Unggah hasil olahan tanpa menimpa berkas lain. Bila nama sudah dipakai,
   * coba lagi dengan akhiran " (2)", " (3)", dan seterusnya.
   */
  const uploadWithUniqueName = useCallback(async (file: File, parentId: string | null) => {
    try {
      return await uploadToNas(file, parentId, undefined, false);
    } catch (err) {
      if (!/sudah ada/i.test((err as Error).message)) throw err;

      const dot = file.name.lastIndexOf(".");
      const base = dot > 0 ? file.name.slice(0, dot) : file.name;
      const extension = dot > 0 ? file.name.slice(dot) : "";

      for (let attempt = 2; attempt <= 20; attempt += 1) {
        const candidate = new File([file], `${base} (${attempt})${extension}`, { type: file.type });
        try {
          return await uploadToNas(candidate, parentId, undefined, false);
        } catch (nextError) {
          if (!/sudah ada/i.test((nextError as Error).message)) throw nextError;
        }
      }

      throw new Error("Nama berkas hasil bentrok. Ganti nama berkas lalu coba lagi.");
    }
  }, []);

  // Kirim antrean upload begitu koneksi kembali, dan segarkan jumlah antrean.
  useEffect(() => {
    if (connectionMode !== "nas" || !currentUser) return;

    let alive = true;
    const syncCount = () =>
      countQueuedUploads()
        .then((n) => {
          if (alive) setPendingUploads(n);
        })
        .catch(() => undefined);

    const run = async () => {
      if (!navigator.onLine) {
        syncCount();
        return;
      }
      const result = await flushUploadQueue();
      if (!alive) return;
      setPendingUploads(result.pending);
      if (result.uploaded > 0) loadNasFiles(currentFolderId);
    };

    syncCount();
    run();
    window.addEventListener("online", run);
    return () => {
      alive = false;
      window.removeEventListener("online", run);
    };
  }, [connectionMode, currentUser, currentFolderId, loadNasFiles]);

  // Segarkan status Drive setiap kali kembali ke dashboard, karena panel
  // Drive punya state sendiri dan bisa berubah tanpa reload halaman. Status
  // ini milik akun yang sedang masuk, jadi tidak perlu diambil tanpa sesi.
  useEffect(() => {
    if (activeTab !== "home" || connectionMode !== "nas" || !currentUser) return;
    let alive = true;
    gdriveStatus()
      .then((s) => {
        if (alive) setIsGdriveConnected(s.connected);
      })
      .catch(() => {
        if (alive) setIsGdriveConnected(false);
      });
    return () => {
      alive = false;
    };
  }, [activeTab, connectionMode, currentUser]);

  // Ping Test Handler
  const handleTestPing = async () => {
    setIsTestingPing(true);
    setPingTestMessage("");
    try {
      const h = await pingNasServer(inputServerUrl);
      setNasHealth(h);
      setNasLatency(h.latencyMs ?? null);
      setNasStatus("online");
      setPingTestMessage(`Terhubung! Latensi: ${h.latencyMs} ms • Versi: ${h.version}`);
    } catch {
      setNasStatus("offline");
      setPingTestMessage("Gagal terhubung. Pastikan server aktif dan alamat URL benar.");
    } finally {
      setIsTestingPing(false);
    }
  };

  const handleSaveServerConfig = () => {
    setStoredServerUrl(inputServerUrl);
    setAdminKey(inputAdminKey);
    setServerUrl(inputServerUrl);
    setServerModalOpen(false);
  };

  // Phase 4: Family Member & Sharing Handlers
  const handleAddFamilyMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMemberName || !newMemberEmail) return;

    const avatarBg = avatarColorFor(newMemberEmail);

    // Undangan disimpan di server (bukan hanya localStorage browser ini),
    // supaya pemilik bisa melihat status dan tautannya tetap berlaku.
    try {
      const res = await createInvite({
        name: newMemberName,
        email: newMemberEmail,
        role: newMemberRole,
        quota_gb: newMemberQuotaGB,
        expires_in_hours: 24 * 7,
      });

      const member: FamilyMember = {
        id: res.invite.id,
        name: newMemberName,
        email: newMemberEmail,
        role: newMemberRole,
        usedBytes: 0,
        quotaBytes: newMemberQuotaGB * 1024 * 1024 * 1024,
        avatarBg,
      };
      setFamilyMembers((prev) => [...prev, member]);

      // Tautan dibuka dari HP anggota keluarga, jadi pakai origin halaman ini
      // (sudah host LAN/Tailscale yang sedang dipakai pengunjung).
      setGeneratedInviteUrl(`${window.location.origin}/invite/${res.token}`);
      await refreshInvites();
    } catch (err) {
      alert(
        `Gagal membuat undangan: ${(err as Error).message}\n\nPastikan backend NAS berjalan di port 8080.`
      );
    }
  };

  // Muat undangan & anggota yang benar-benar tersimpan di server.
  const refreshInvites = async () => {
    // Undangan memakai admin key; anggota memakai sesi login. Keduanya
    // dipisah agar kegagalan salah satu tidak mengosongkan yang lain.
    let inviteMembers: ServerMember[] = [];
    try {
      const data = await listInvites();
      setServerInvites(data.invites);
      inviteMembers = data.members || [];
    } catch {
      // backend belum jalan atau admin key tidak diisi
      setServerInvites([]);
    }

    // Anggota yang sudah terdaftar di database membawa kuota dan pemakaian
    // nyata; daftar undangan hanya dipakai sebagai cadangan.
    let accounts: NasFamilyMember[] = [];
    try {
      accounts = await listFamilyMembers();
    } catch {
      accounts = [];
    }

    if (accounts.length > 0) {
      setFamilyMembers(
        accounts.map((m, i) => ({
          id: m.id,
          name: m.username,
          email: m.email,
          role: m.role,
          usedBytes: m.quota_used_bytes || 0,
          quotaBytes: m.quota_bytes || 0,
          avatarBg: AVATAR_PALETTE[i % AVATAR_PALETTE.length],
        }))
      );
      return;
    }

    if (inviteMembers.length > 0) {
      // Tampilkan anggota yang sudah menerima undangan sebagai kartu keluarga.
      setFamilyMembers(
        inviteMembers.map((m, i) => ({
          id: m.id,
          name: m.name,
          email: m.email,
          role: (m.role === "owner" || m.role === "admin" ? m.role : "member") as
            | "owner"
            | "admin"
            | "member",
          usedBytes: 0,
          quotaBytes: m.quota_gb * 1024 * 1024 * 1024,
          avatarBg: AVATAR_PALETTE[i % AVATAR_PALETTE.length],
        }))
      );
    }
  };

  // Ubah kuota satu anggota lalu segarkan kartu agar pemakaian ikut terbarui.
  const handleUpdateMemberQuota = async (id: string, quotaGB: number) => {
    await updateMemberQuota(id, quotaGB);
    await refreshInvites();
  };

  // Undangan dan anggota tersimpan di server, jadi tidak ada yang bisa dimuat
  // di mode mandiri — dulu tetap dipanggil dan menghasilkan dua request gagal.
  // Tanpa sesi pun server akan menolak, jadi ditunggu sampai pengguna masuk.
  useEffect(() => {
    if (connectionMode !== "nas" || !currentUser) return;
    refreshInvites();
  }, [connectionMode, currentUser]);

  // Validasi token sesi NAS yang tersimpan saat aplikasi dibuka.
  useEffect(() => {
    let alive = true;
    (async () => {
      if (!getStoredToken()) {
        setAuthReady(true);
        return;
      }
      try {
        const user = await fetchMe();
        if (alive) setCurrentUser(user);
      } catch {
        // Server tidak terjangkau (offline). Pakai profil terakhir agar
        // aplikasi tetap terbuka; semua request API akan gagal sampai online.
        if (alive) setCurrentUser(getStoredUser());
      } finally {
        if (alive) setAuthReady(true);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const handleLogout = async () => {
    await logoutNas();
    setCurrentUser(null);
  };

  const handleRevokeInvite = async (id: string) => {
    if (!confirm("Cabut undangan ini? Tautan akan langsung tidak berlaku.")) return;
    try {
      await revokeInvite(id);
      await refreshInvites();
    } catch (err) {
      alert(`Gagal mencabut undangan: ${(err as Error).message}`);
    }
  };

  const refreshShares = useCallback(async () => {
    try {
      const rows = await listShares();
      setActiveShares(
        rows.map((r) => {
          const fileType = detectFileType({
            mime: r.MimeType,
            name: r.NodeName,
            isDirectory: r.IsDirectory,
          });

          return {
            id: r.ID,
            fileName: r.NodeName,
            fileType,
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
          };
        })
      );
    } catch {
      setActiveShares([]);
    }
  }, []);

  useEffect(() => {
    // `refreshShares` mengisi state dari API saat mode NAS aktif; pemicunya
    // perubahan koneksi/pengguna, bukan render.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (connectionMode === "nas" && currentUser) refreshShares();
  }, [connectionMode, currentUser, refreshShares]);

  const handleGenerateShare = async () => {
    if (!shareModalFile) return;

    if (connectionMode !== "nas") {
      alert("Link berbagi hanya tersedia untuk berkas di server NAS.");
      return;
    }

    setShareGenerating(true);
    try {
      const created = await createShare({
        node_id: shareModalFile.id,
        permission: sharePermission === "uploader" ? "uploader" : "viewer",
        password: sharePasswordInput || undefined,
        expires_in: shareExpiryOption === "never" ? undefined : shareExpiryOption,
      });

      const origin = typeof window !== "undefined" ? window.location.origin : "";
      setCurrentGeneratedUrl(`${origin}/s/${created.raw_token}`);
      setShareLinkGenerated(true);
      await refreshShares();
    } catch (err) {
      alert(`Gagal membuat link berbagi: ${(err as Error).message}`);
    } finally {
      setShareGenerating(false);
    }
  };

  const handleRevokeShare = async (id: string) => {
    if (!confirm("Cabut link berbagi ini? Pengguna yang memegang link tidak akan bisa mengakses file lagi.")) return;
    try {
      await deleteShare(id);
      await refreshShares();
    } catch (err) {
      alert(`Gagal mencabut link: ${(err as Error).message}`);
    }
  };

  // Phase 5: PWA Install & 3-2-1 Offsite Backup Handlers
  const handleInstallPwa = () => {
    alert("Untuk memasang Barva di HP/Laptop:\n1. Buka menu browser (titik tiga ⋮ di Chrome/Edge atau tombol Share di Safari iOS)\n2. Pilih 'Tambahkan ke Layar Utama' (Add to Home Screen / Install App).\n\nAplikasi akan terpasang sebagai aplikasi PWA berkecepatan native.");
  };

  // Folder Drill-down Handlers
  const handleOpenFolder = (folder: DisplayItem) => {
    setCurrentFolderId(folder.id);
    setFolderBreadcrumbs((prev) => [...prev, { id: folder.id, name: folder.name }]);
  };

  const handleNavigateBreadcrumb = (targetId: string | null, index: number) => {
    setCurrentFolderId(targetId);
    setFolderBreadcrumbs((prev) => prev.slice(0, index + 1));
  };

  const handleGoBackFolder = () => {
    if (folderBreadcrumbs.length <= 1) return;
    const newBreadcrumbs = folderBreadcrumbs.slice(0, -1);
    const parentTarget = newBreadcrumbs[newBreadcrumbs.length - 1];
    setFolderBreadcrumbs(newBreadcrumbs);
    setCurrentFolderId(parentTarget.id);
  };

  const handleCreateFolder = async () => {
    const folderName = prompt("Masukkan nama folder baru:");
    if (!folderName) return;

    if (connectionMode === "nas") {
      try {
        await createNasFolder(folderName, currentFolderId);
        await loadNasFiles(currentFolderId);
      } catch (err) {
        alert(`Gagal membuat folder: ${(err as Error).message}`);
      }
      return;
    }

    const newFolder: DisplayItem = {
      id: crypto.randomUUID(),
      name: folderName,
      type: "folder",
      sizeStr: "0 item",
      sizeBytes: 0,
      updatedAt: "Baru saja",
      updatedAtISO: new Date().toISOString(),
      parentId: currentFolderId,
    };
    setLocalItems((prev) => [newFolder, ...prev]);
  };

  const handleRename = async (item: DisplayItem) => {
    if (connectionMode !== "nas") {
      alert("Ganti nama hanya tersedia untuk berkas di server NAS.");
      return;
    }
    const next = prompt("Nama baru:", item.name);
    if (next === null) return;
    const name = next.trim();
    if (!name || name === item.name) return;

    try {
      await renameNasFile(item.id, name);
      await refreshLibrary();
    } catch (err) {
      alert(`Gagal mengganti nama: ${(err as Error).message}`);
    }
  };

  const loadMoveFolders = async (parentId: string | null, excludeIds: string[] = []) => {
    setMoveLoading(true);
    try {
      const nodes = await listNasFiles(parentId);
      setMoveFolders(
        nodes
          .filter((n) => n.IsDirectory)
          .map(nasNodeToDisplay)
          .filter((f) => !excludeIds.includes(f.id))
      );
    } catch (err) {
      alert(`Gagal memuat folder: ${(err as Error).message}`);
      setMoveFolders([]);
    } finally {
      setMoveLoading(false);
    }
  };

  const openMoveModal = (targets: DisplayItem | DisplayItem[]) => {
    const items = Array.isArray(targets) ? targets : [targets];
    if (items.length === 0) return;
    if (connectionMode !== "nas") {
      alert("Pindah folder hanya tersedia untuk berkas di server NAS.");
      return;
    }
    setMoveItems(items);
    setMoveParentId(null);
    setMoveCrumbs([{ id: null, name: "Semua File" }]);
    loadMoveFolders(
      null,
      items.filter((item) => item.type === "folder").map((item) => item.id)
    );
  };

  const handleMoveNavigate = (id: string | null, name: string, crumbIndex?: number) => {
    if (moveItems.length === 0) return;
    setMoveParentId(id);
    setMoveCrumbs((prev) =>
      crumbIndex === undefined ? [...prev, { id, name }] : prev.slice(0, crumbIndex)
    );
    loadMoveFolders(
      id,
      moveItems.filter((item) => item.type === "folder").map((item) => item.id)
    );
  };

  const handleConfirmMove = async () => {
    if (moveItems.length === 0) return;
    setMoveBusy(true);
    let failed = 0;
    try {
      for (const item of moveItems) {
        try {
          await moveNasFile(item.id, moveParentId);
        } catch {
          failed += 1;
        }
      }
      setMoveItems([]);
      selection.clear();
      await refreshLibrary();
      if (failed > 0) {
        alert(`${moveItems.length - failed} item dipindahkan, ${failed} gagal.`);
      }
    } finally {
      setMoveBusy(false);
    }
  };

  // Handle Real Upload (Dual-Mode: NAS Streaming + IndexedDB Fallback)
  // Simpan upload ke IndexedDB saat server tidak terjangkau, lalu kirim
  // otomatis lewat flushUploadQueue ketika online.
  const queueOfflineUpload = async (file: File) => {
    try {
      await enqueueUpload(file.name, file, currentFolderId, false, file.type);
      setPendingUploads(await countQueuedUploads());
      alert(
        `"${file.name}" disimpan di antrean dan akan diunggah otomatis saat koneksi ke server kembali.`
      );
    } catch (err) {
      alert(`Gagal menyimpan ke antrean offline: ${(err as Error).message}`);
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
    }
  };

  const handleFlushQueue = async () => {
    setFlushingQueue(true);
    try {
      const result = await flushUploadQueue();
      setPendingUploads(result.pending);
      if (result.uploaded > 0) await loadNasFiles(currentFolderId);
    } finally {
      setFlushingQueue(false);
    }
  };

  const handleRealFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const file = files[0];
    setUploadFileName(file.name);
    setIsUploading(true);
    setUploadProgress(10);

    try {
      const type = detectFileType({ mime: file.type, name: file.name });

      // Mode NAS: unggah ke server, lalu ambil ulang daftar dari server
      // supaya yang tampil adalah data nyata, bukan salinan lokal.
      if (connectionMode === "nas") {
        if (!navigator.onLine) {
          await queueOfflineUpload(file);
          return;
        }

        const report = (percent: number) => setUploadProgress(Math.max(10, percent));
        try {
          await uploadToNas(file, currentFolderId, report);
        } catch (err) {
          const msg = (err as Error).message || "";
          // Server tidak terjangkau (bukan penolakan validasi): antrekan.
          if (!/sudah ada/i.test(msg) && (err instanceof TypeError || /fetch|network|jaringan/i.test(msg))) {
            await queueOfflineUpload(file);
            return;
          }
          // Backend menolak nama duplikat; tawarkan ganti, jangan langsung gagal.
          if (!/sudah ada/i.test(msg)) throw err;
          if (!confirm(`"${file.name}" sudah ada di folder ini. Ganti dengan versi baru?`)) {
            setIsUploading(false);
            return;
          }
          await uploadToNas(file, currentFolderId, report, true);
        }
        setUploadProgress(100);
        await loadNasFiles(currentFolderId);
        // Segarkan pemakaian kuota yang tampil di sidebar.
        try {
          const me = await fetchMe();
          if (me) setCurrentUser(me);
        } catch {
          // Diabaikan: angka kuota boleh tertinggal, unggahan sudah berhasil.
        }
        setTimeout(() => {
          setIsUploading(false);
        }, 400);
        return;
      }

      // Mode standalone: simpan di IndexedDB browser.
      setUploadProgress(85);
      const saved = await saveLocalFile(file.name, file, type, file.type);
      setUploadProgress(100);

      const newItem: DisplayItem = {
        id: saved.id,
        name: saved.name,
        type: saved.type,
        sizeStr: formatBytes(saved.size),
        sizeBytes: saved.size,
        updatedAt: "Baru saja",
        updatedAtISO: saved.updatedAt,
        parentId: currentFolderId,
        sha256: saved.sha256 ? `${saved.sha256.substring(0, 8)}...${saved.sha256.substring(saved.sha256.length - 8)}` : undefined,
        isFavorite: false,
        blob: file,
      };

      setLocalItems((prev) => [newItem, ...prev]);
      setTimeout(() => {
        setIsUploading(false);
      }, 400);
    } catch (err) {
      console.error("Upload error:", err);
      alert(`Gagal menyimpan file: ${(err as Error).message}`);
      setIsUploading(false);
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  // Unduh hasil olahan Studio lalu simpan ke pustaka yang sedang aktif.
  //
  // Mode NAS: hasil diunggah balik ke folder asal. Mode standalone: disimpan ke
  // IndexedDB. Unduhan dilakukan lebih dulu supaya berkas tetap sampai ke
  // pengguna walau penyimpanan gagal.
  const commitStudioOutput = useCallback(
    async (
      output: StudioOutput,
      options: { download?: boolean; parentId?: string | null } = {}
    ): Promise<{ saved: boolean }> => {
      const download = options.download ?? true;
      const parentId = options.parentId ?? currentFolderId;

      if (download) downloadBlob(output.blob, output.filename);

      try {
        if (connectionMode === "nas") {
          const file = new File([output.blob], output.filename, {
            type: output.mimeType || "application/octet-stream",
          });
          await uploadWithUniqueName(file, parentId);
          await refreshLibrary();
        } else {
          const item = await persistStudioOutput(output, parentId);
          setLocalItems((prev) => [item, ...prev]);
        }
        return { saved: true };
      } catch (err) {
        setStudioError(describeStudioError(err));
        return { saved: false };
      }
    },
    [currentFolderId, connectionMode, refreshLibrary, uploadWithUniqueName]
  );

  // Model hapus latar sudah ada di perangkat: simpan penandanya supaya kartu
  // persetujuan unduhan tidak muncul lagi setelah halaman dimuat ulang.
  const markBgModelReady = useCallback(() => {
    try {
      window.localStorage.setItem(BG_MODEL_READY_KEY, "1");
    } catch {
      // abaikan: penanda ini hanya untuk kenyamanan antarmuka
    }
    setBgModelJustDownloaded(true);
  }, []);

  // Beberapa alat menolak berkas yang jumlahnya kurang. Pesannya sama polanya,
  // jadi disusun di satu tempat agar tidak muncul sebagai `alert()` terpisah.
  const notifyIncompleteInput = useCallback((message: string, hint?: string) => {
    setStudioError({ code: "INPUT_INCOMPLETE", title: "Berkas belum cukup", message, hint, tone: "warn" });
  }, []);

  // Unified Storage Picker Handlers for Studio
  const handleOpenStoragePicker = (tool: StudioToolId) => {
    setStoragePickerTool(tool);
    setSelectedStorageIds([]);
    setStoragePickerOpen(true);
  };

  /**
   * Jalankan satu alat Studio atas berkas yang sudah ada di memori.
   * Alat berpanel hanya dipindahkan ke tab Studio; alat one-shot langsung
   * menghasilkan berkas lalu menyimpannya lewat commitStudioOutput.
   */
  const runStudioTool = async (
    tool: StudioToolId,
    files: File[],
    options: { download?: boolean; parentId?: string | null } = {}
  ) => {
    const parentId = options.parentId ?? currentFolderId;
    const download = options.download ?? true;

    if (PANEL_TOOLS.includes(tool)) {
      setStudioPickedFile(files[0]);
      setActiveStudioTool(tool);
      setActiveTab("studio");
      return;
    }

    if (tool === "img2pdf") {
      const pdfBytes = await imagesToPDF(files);
      const filename = `Foto_Dokumen_${Date.now()}.pdf`;
      await commitStudioOutput(makePdfOutput(pdfBytes, filename), { parentId, download });
      setStudioSuccessMsg(`Berhasil! ${files.length} foto digabung menjadi ${filename}.`);
      return;
    }

    if (tool === "mergepdf") {
      if (files.length < 2) {
        notifyIncompleteInput(
          "Penggabungan butuh dua berkas PDF atau lebih.",
          "Pilih minimal dua berkas PDF."
        );
        return;
      }
      const mergedBytes = await mergePDFs(files);
      const filename = `Merged_Document_${Date.now()}.pdf`;
      await commitStudioOutput(makePdfOutput(mergedBytes, filename), { parentId, download });
      setStudioSuccessMsg(`Berhasil! ${files.length} berkas PDF digabung menjadi ${filename}.`);
      return;
    }

    if (tool === "compress") {
      const result = await compressAndResizeImage(files[0], 1920, compressQuality, "image/jpeg");
      setLastCompressResult(result);
      const filename = `Compressed_${files[0].name.replace(/\.[^/.]+$/, "")}.jpg`;
      await commitStudioOutput(
        makeImageOutput(result.blob, filename, `${result.width} × ${result.height}`),
        { parentId, download }
      );
      setStudioSuccessMsg(
        `Kompresi selesai! Ukuran berkurang ${result.savingsPercent}% (dari ${formatBytes(result.originalSize)} menjadi ${formatBytes(result.compressedSize)}).`
      );
      return;
    }

    if (tool === "removebg") {
      const result = await removeImageBackground(files[0], setBgProgress, {
        tolerance: bgTolerance,
        dropShadow: bgDropShadow,
      });
      const filename = `TanpaLatar_${files[0].name.replace(/\.[^/.]+$/, "")}.png`;
      await commitStudioOutput(
        makeImageOutput(result.blob, filename, `${result.width} × ${result.height}`),
        { parentId, download }
      );
      markBgModelReady();
      setStudioSuccessMsg(`Latar belakang ${files[0].name} berhasil dihapus sebagai ${filename}.`);
      return;
    }

    if (tool === "enhance") {
      const result = await enhancePhoto(files[0]);
      setLastEnhanceResult(result);
      const filename = `Diperjelas_${files[0].name.replace(/\.[^/.]+$/, "")}.jpg`;
      await commitStudioOutput(
        makeImageOutput(result.blob, filename, `${result.width} × ${result.height}`),
        { parentId, download }
      );
      setStudioSuccessMsg(`Foto diperjelas menjadi ${result.width} × ${result.height} px.`);
      return;
    }

    throw new Error("Alat Studio tidak dikenal.");
  };

  const handleExecuteStorageSelection = async () => {
    if (selectedStorageIds.length === 0) {
      notifyIncompleteInput("Pilih minimal satu berkas dari penyimpanan.");
      return;
    }

    setStudioProcessing(true);
    setStudioSuccessMsg("");
    setStudioError(null);
    setStoragePickerOpen(false);

    try {
      const selectedItems = localItems.filter((i) => selectedStorageIds.includes(i.id));
      const files: File[] = [];

      for (const item of selectedItems) {
        if (item.blob) {
          files.push(new File([item.blob], item.name, { type: item.blob.type || "application/octet-stream" }));
        }
      }

      if (files.length === 0) {
        setStudioError({
          code: "IMAGE_INVALID",
          title: "Berkas tidak bisa dibaca",
          message: "Isi berkas ini belum tersedia di memori perangkat.",
          hint: "Buka berkasnya sekali dari daftar utama, lalu ulangi.",
          tone: "danger",
        });
        return;
      }

      await runStudioTool(storagePickerTool, files);
    } catch (err) {
      console.error(err);
      setStudioError(describeStudioError(err));
    } finally {
      setStudioProcessing(false);
      setBgProgress(null);
    }
  };

  // Real Download Blob
  const handleDownload = (item: DisplayItem) => {
    // Mode NAS: unduh langsung dari server (endpoint menerima token lewat query).
    if (connectionMode === "nas" && item.type !== "folder") {
      window.open(getDownloadUrl(item.id), "_blank", "noopener");
      return;
    }
    if (item.blob) {
      const url = URL.createObjectURL(item.blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = item.name;
      a.click();
      URL.revokeObjectURL(url);
    } else {
      alert(`Mengunduh stream: ${item.name}`);
    }
  };

  // Real Delete
  const handleDelete = async (id: string, e?: React.MouseEvent) => {
    e?.stopPropagation();

    if (connectionMode === "nas") {
      if (!confirm("Pindahkan item ini ke Trash? Kamu masih bisa memulihkannya nanti.")) return;
      try {
        await deleteNasFile(id);
        setNasItems((prev) => prev.filter((item) => item.id !== id));
        setMediaItems((prev) => prev.filter((item) => item.id !== id));
        if (selectedMedia?.id === id) setSelectedMedia(null);
        loadTrash();
      } catch (err) {
        alert(`Gagal menghapus: ${(err as Error).message}`);
      }
      return;
    }

    if (!confirm("Hapus file ini dari penyimpanan lokal?")) return;
    try {
      await deleteLocalFile(id);
      setLocalItems((prev) => prev.filter((item) => item.id !== id));
      setMediaItems((prev) => prev.filter((item) => item.id !== id));
      if (selectedMedia?.id === id) setSelectedMedia(null);
    } catch (err) {
      console.error("Delete error:", err);
    }
  };

  // Trash: pulihkan item yang salah terhapus.
  const handleRestoreTrash = async (node: TrashedNode) => {
    setTrashBusyId(node.ID);
    try {
      await restoreNasFile(node.ID);
      await Promise.all([loadTrash(), loadNasFiles(currentFolderId)]);
    } catch (err) {
      alert(`Gagal memulihkan: ${(err as Error).message}`);
    } finally {
      setTrashBusyId(null);
    }
  };

  // Trash: hapus permanen. Tidak ada undo, jadi minta konfirmasi eksplisit.
  const handlePurgeTrash = async (node: TrashedNode) => {
    const kind = node.IsDirectory ? "folder ini beserta seluruh isinya" : `"${node.Name}"`;
    if (!confirm(`Hapus permanen ${kind}?\n\nTindakan ini tidak bisa dibatalkan.`)) return;

    setTrashBusyId(node.ID);
    try {
      await purgeNasFile(node.ID);
      await loadTrash();
    } catch (err) {
      alert(`Gagal menghapus permanen: ${(err as Error).message}`);
    } finally {
      setTrashBusyId(null);
    }
  };

  // Real Toggle Fav
  const handleFav = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();

    if (connectionMode === "nas") {
      alert("Favorit belum tersedia untuk file di server NAS.");
      return;
    }

    try {
      const isFav = await toggleFavorite(id);
      setLocalItems((prev) =>
        prev.map((item) => (item.id === id ? { ...item, isFavorite: isFav } : item))
      );
    } catch (err) {
      console.error("Fav toggle error:", err);
    }
  };

  // Studio: Images to PDF
  const handleImagesToPDF = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setStudioProcessing(true);
    setStudioSuccessMsg("");
    setStudioError(null);
    try {
      const pdfBytes = await imagesToPDF(Array.from(files));
      const filename = `Foto_Dokumen_${Date.now()}.pdf`;

      await commitStudioOutput(makePdfOutput(pdfBytes, filename));

      setStudioSuccessMsg(`Berhasil! ${files.length} foto digabung menjadi ${filename} dan tersimpan di penyimpanan lokal.`);
    } catch (err) {
      console.error(err);
      setStudioError(describeStudioError(err));
    } finally {
      setStudioProcessing(false);
      if (studioImg2PdfRef.current) studioImg2PdfRef.current.value = "";
    }
  };

  // Studio: Merge PDFs
  const handleMergePDFs = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length < 2) {
      notifyIncompleteInput(
        "Penggabungan butuh dua berkas PDF atau lebih.",
        "Tahan Ctrl (Windows) atau Shift saat memilih agar beberapa berkas ikut terpilih."
      );
      if (studioMergePdfRef.current) studioMergePdfRef.current.value = "";
      return;
    }

    setStudioProcessing(true);
    setStudioSuccessMsg("");
    setStudioError(null);
    try {
      const mergedBytes = await mergePDFs(Array.from(files));
      const filename = `Merged_Document_${Date.now()}.pdf`;

      await commitStudioOutput(makePdfOutput(mergedBytes, filename));

      setStudioSuccessMsg(`Berhasil! ${files.length} dokumen PDF telah digabung menjadi ${filename}.`);
    } catch (err) {
      console.error(err);
      setStudioError(describeStudioError(err));
    } finally {
      setStudioProcessing(false);
      if (studioMergePdfRef.current) studioMergePdfRef.current.value = "";
    }
  };

  // Studio: Compress Image
  const handleCompressImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setStudioProcessing(true);
    setStudioSuccessMsg("");
    setStudioError(null);
    try {
      const file = files[0];
      const result = await compressAndResizeImage(file, 1920, compressQuality, "image/jpeg");
      setLastCompressResult(result);

      const filename = `Compressed_${file.name.replace(/\.[^/.]+$/, "")}.jpg`;
      await commitStudioOutput(
        makeImageOutput(result.blob, filename, `${result.width} × ${result.height}`)
      );

      setStudioSuccessMsg(`Kompresi selesai! Ukuran berkurang ${result.savingsPercent}% (dari ${formatBytes(result.originalSize)} menjadi ${formatBytes(result.compressedSize)}).`);
    } catch (err) {
      console.error(err);
      setStudioError(describeStudioError(err));
    } finally {
      setStudioProcessing(false);
      if (studioCompressRef.current) studioCompressRef.current.value = "";
    }
  };

  // Studio: Hapus latar belakang (model ISNet, berjalan di perangkat)
  const handleRemoveBackground = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setStudioProcessing(true);
    setStudioSuccessMsg("");
    setStudioError(null);
    setBgProgress({ phase: "download", percent: 0 });

    try {
      const file = files[0];
      const result = await removeImageBackground(file, setBgProgress, {
        tolerance: bgTolerance,
        dropShadow: bgDropShadow,
      });
      const filename = `TanpaLatar_${file.name.replace(/\.[^/.]+$/, "")}.png`;

      await commitStudioOutput(
        makeImageOutput(result.blob, filename, `${result.width} × ${result.height}`)
      );

      markBgModelReady();
      setStudioSuccessMsg(`Latar belakang berhasil dihapus. Hasil disimpan sebagai ${filename}.`);
    } catch (err) {
      console.error(err);
      setStudioError(describeStudioError(err));
    } finally {
      setBgProgress(null);
      setStudioProcessing(false);
      if (studioRemoveBgRef.current) studioRemoveBgRef.current.value = "";
    }
  };

  // Studio: Naikkan kualitas foto (perbesar 2x + penajaman, tanpa model)
  const handleEnhancePhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setStudioProcessing(true);
    setStudioSuccessMsg("");
    setStudioError(null);

    try {
      const file = files[0];
      const result = await enhancePhoto(file);
      setLastEnhanceResult(result);

      const filename = `Diperjelas_${file.name.replace(/\.[^/.]+$/, "")}.jpg`;
      await commitStudioOutput(
        makeImageOutput(result.blob, filename, `${result.width} × ${result.height}`)
      );

      setStudioSuccessMsg(
        `Foto diperjelas menjadi ${result.width} × ${result.height} px (sebelumnya ${result.originalWidth} × ${result.originalHeight} px).`
      );
    } catch (err) {
      console.error(err);
      setStudioError(describeStudioError(err));
    } finally {
      setStudioProcessing(false);
      if (studioEnhanceRef.current) studioEnhanceRef.current.value = "";
    }
  };

  // Sumber data UI: server NAS saat mode NAS, IndexedDB saat standalone.
  // Tanpa sesi NAS, daftar dari server tidak boleh ditampilkan meski datanya
  // masih tersisa di state — dulu ini ditangani dengan mereset state di efek.
  const activeItems = connectionMode === "nas" ? (currentUser ? nasItems : []) : localItems;

  // Galeri memakai media lintas folder di mode NAS; di standalone seluruh
  // item lokal memang sudah terkumpul di satu tempat.
  const galleryItems = connectionMode === "nas" ? (currentUser ? mediaItems : []) : localItems;

  // Owner/admin bisa melihat berkas anggota lain; UI perlu menandainya agar
  // tidak tertukar dengan berkas sendiri.
  const isForeignItem = (item: DisplayItem) =>
    Boolean(currentUser && item.ownerId && item.ownerId !== currentUser.id);

  // Berkas lokal memakai blob sendiri; hanya berkas NAS yang punya thumbnail
  // dari server. Video belum punya poster, jadi memakai ikon.
  const thumbnailForItem = (item: DisplayItem) =>
    item.blob || item.type !== "image" ? null : getThumbnailUrl(item.id, "small");

  const filteredFiles = activeItems.filter((f) =>
    f.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // ---------------- Menu aksi berkas & seleksi banyak ----------------

  const selectionSource = activeTab === "gallery" ? galleryItems : activeItems;
  const selectedItems = selectionSource.filter((item) => selection.isSelected(item.id));
  const visibleSelectionIds =
    activeTab === "gallery"
      ? galleryItems.map((item) => item.id)
      : filteredFiles
          .filter((item) => (item.parentId || null) === currentFolderId)
          .map((item) => item.id);

  const openFileActionMenu = (item: DisplayItem, anchor: { x: number; y: number }) => {
    setActionMenuItem(item);
    setActionMenuAnchor(anchor);
  };

  const closeFileActionMenu = () => {
    setActionMenuItem(null);
    setActionMenuAnchor(null);
  };

  const openShareModal = (item: DisplayItem) => {
    setShareModalFile(item);
    setShareLinkGenerated(false);
    setCurrentGeneratedUrl("");
    setSharePasswordInput("");
  };

  /** Jalankan alat Studio untuk item yang mungkin masih di server. */
  const processItemsWithTool = async (
    tool: StudioToolId,
    items: DisplayItem[],
    options: { download?: boolean; parentId?: string | null } = {}
  ): Promise<boolean> => {
    setStudioProcessing(true);
    setStudioSuccessMsg("");
    setStudioError(null);

    try {
      const files: File[] = [];
      for (const item of items) {
        files.push(await itemToFile(item, connectionMode));
      }
      await runStudioTool(tool, files, options);
      return true;
    } catch (err) {
      if (err instanceof FileTooLargeError) {
        setStudioError({
          code: "UNKNOWN",
          title: "Berkas terlalu besar",
          message: `Batas pemrosesan di perangkat ini ${formatBytes(MAX_PROCESS_BYTES)} per berkas.`,
          hint: "Kompres atau pecah berkasnya lebih dulu, lalu coba lagi.",
          tone: "danger",
        });
      } else {
        const info = describeStudioError(err);
        setStudioError(
          info.code === "UNKNOWN" && err instanceof Error
            ? { ...info, message: err.message }
            : info
        );
      }
      return false;
    } finally {
      setStudioProcessing(false);
      setBgProgress(null);
    }
  };

  const handleFileAction = async (action: FileAction) => {
    const item = actionMenuItem;
    closeFileActionMenu();
    if (!item) return;

    if (action.id === "open") {
      if (item.type === "folder") handleOpenFolder(item);
      else setSelectedMedia(item);
      return;
    }
    if (action.id === "download") {
      handleDownload(item);
      return;
    }
    if (action.id === "rename") {
      await handleRename(item);
      return;
    }
    if (action.id === "move") {
      openMoveModal(item);
      return;
    }
    if (action.id === "share") {
      openShareModal(item);
      return;
    }
    if (action.id === "delete") {
      await handleDelete(item.id);
      return;
    }
    if (action.tool) {
      const ok = await processItemsWithTool(action.tool, [item], {
        download: true,
        parentId: item.parentId ?? currentFolderId,
      });
      if (ok) setLibraryNotice(`Selesai memproses “${item.name}”. Hasil tersimpan di folder asal.`);
    }
  };

  const handleBulkDelete = async (items: DisplayItem[]) => {
    if (!confirm(`Hapus ${items.length} item? Item akan masuk ke Trash.`)) return;

    setBulkBusy(true);
    let failed = 0;
    try {
      for (const item of items) {
        try {
          if (connectionMode === "nas") {
            await deleteNasFile(item.id);
          } else {
            await deleteLocalFile(item.id);
            setLocalItems((prev) => prev.filter((entry) => entry.id !== item.id));
          }
        } catch {
          failed += 1;
        }
      }
      selection.clear();
      await refreshLibrary();
      setLibraryNotice(
        failed > 0
          ? `${items.length - failed} item dihapus, ${failed} gagal.`
          : `${items.length} item dihapus.`
      );
    } finally {
      setBulkBusy(false);
    }
  };

  const handleCreateFolderFromSelection = async (items: DisplayItem[]) => {
    const name = prompt("Nama folder baru:");
    const folderName = name?.trim();
    if (!folderName) return;

    setBulkBusy(true);
    try {
      if (connectionMode === "nas") {
        const folder = await createNasFolder(folderName, currentFolderId);
        for (const item of items) {
          await moveNasFile(item.id, folder.ID);
        }
        await refreshLibrary();
      } else {
        const folderId = crypto.randomUUID();
        const folder: DisplayItem = {
          id: folderId,
          name: folderName,
          type: "folder",
          sizeStr: "0 item",
          sizeBytes: 0,
          updatedAt: "Baru saja",
          updatedAtISO: new Date().toISOString(),
          parentId: currentFolderId,
        };
        setLocalItems((prev) => [
          folder,
          ...prev.map((item) =>
            items.some((selected) => selected.id === item.id) ? { ...item, parentId: folderId } : item
          ),
        ]);
      }
      selection.clear();
      setLibraryNotice(`Folder “${folderName}” dibuat dan ${items.length} item dipindahkan.`);
    } catch (err) {
      alert(`Gagal membuat folder: ${(err as Error).message}`);
    } finally {
      setBulkBusy(false);
    }
  };

  const handleConfirmAutoGroup = async () => {
    const items = selectedItems;
    if (items.length === 0) return;

    const groups = groupItems(items, smartFolderMode);
    setBulkBusy(true);

    try {
      if (connectionMode === "nas") {
        for (const group of groups) {
          const existing = activeItems.find(
            (item) =>
              item.type === "folder" &&
              (item.parentId || null) === currentFolderId &&
              item.name === group.name
          );
          const folderId = existing ? existing.id : (await createNasFolder(group.name, currentFolderId)).ID;
          for (const item of group.items) {
            await moveNasFile(item.id, folderId);
          }
        }
        await refreshLibrary();
      } else {
        const created = groups.map<DisplayItem>((group) => ({
          id: crypto.randomUUID(),
          name: group.name,
          type: "folder",
          sizeStr: "0 item",
          sizeBytes: 0,
          updatedAt: "Baru saja",
          updatedAtISO: new Date().toISOString(),
          parentId: currentFolderId,
        }));
        const folderIdByGroup = new Map(groups.map((group, index) => [group.key, created[index].id]));

        setLocalItems((prev) => {
          const moved = prev.map((item) => {
            const group = groups.find((candidate) =>
              candidate.items.some((selected) => selected.id === item.id)
            );
            return group ? { ...item, parentId: folderIdByGroup.get(group.key) } : item;
          });
          return [...created, ...moved];
        });
      }

      setSmartFolderOpen(false);
      selection.clear();
      setLibraryNotice(`${items.length} item dikelompokkan ke ${groups.length} folder.`);
    } catch (err) {
      alert(`Gagal mengelompokkan: ${(err as Error).message}`);
    } finally {
      setBulkBusy(false);
    }
  };

  const handleBulkAction = async (action: FileAction) => {
    const items = selectedItems;
    if (items.length === 0) return;

    if (action.id === "delete") {
      await handleBulkDelete(items);
      return;
    }
    if (action.id === "move") {
      openMoveModal(items);
      return;
    }
    if (action.id === "download") {
      items.forEach((item) => handleDownload(item));
      selection.clear();
      return;
    }
    if (action.id === "newfolder") {
      await handleCreateFolderFromSelection(items);
      return;
    }
    if (action.id === "group-type") {
      setSmartFolderMode("type");
      setSmartFolderOpen(true);
      return;
    }
    if (action.id === "group-month") {
      setSmartFolderMode("month");
      setSmartFolderOpen(true);
      return;
    }

    if (!action.tool) return;

    setBulkBusy(true);
    setLibraryNotice("");
    try {
      if (action.tool === "img2pdf" || action.tool === "mergepdf") {
        setBulkProgress({ current: 1, total: 1, label: action.label });
        await processItemsWithTool(action.tool, items, {
          download: false,
          parentId: currentFolderId,
        });
      } else {
        let failed = 0;
        for (let index = 0; index < items.length; index += 1) {
          setBulkProgress({ current: index + 1, total: items.length, label: action.label });
          const ok = await processItemsWithTool(action.tool, [items[index]], {
            download: false,
            parentId: items[index].parentId ?? currentFolderId,
          });
          if (!ok) failed += 1;
        }
        if (failed > 0) {
          setLibraryNotice(`${items.length - failed} berhasil, ${failed} gagal.`);
        } else {
          setLibraryNotice(`${items.length} berkas selesai diproses.`);
        }
      }
      selection.clear();
    } finally {
      setBulkBusy(false);
      setBulkProgress(null);
    }
  };

  // Seleksi tidak boleh terbawa saat pindah folder atau tab.
  useEffect(() => {
    selection.clear();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, currentFolderId]);

  // Gerbang login: mode NAS wajib punya sesi; standalone tetap bebas.
  if (connectionMode === "nas" && authReady && !currentUser) {
    return (
      <AuthGate
        onAuthed={(user) => setCurrentUser(user)}
        onSkip={() => setConnectionMode("standalone")}
      />
    );
  }

  return (
    <div className="flex h-screen w-full overflow-hidden bg-canvas text-fg">
      {/* Hidden file input for real uploads */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleRealFileUpload}
        className="hidden"
      />

      {/* 1. LEFT SIDEBAR */}
      <Sidebar
        activeTab={activeTab}
        onTabChange={setActiveTab}
        activeItems={activeItems}
        localItems={localItems}
        trashCount={trashItems.length}
        connectionMode={connectionMode}
        nasStatus={nasStatus}
        nasLatency={nasLatency}
        isGdriveConnected={isGdriveConnected}
        serverUrl={serverUrl}
        currentUser={currentUser}
        onOpenServer={() => setServerModalOpen(true)}
        onInstallPwa={handleInstallPwa}
        onLogout={handleLogout}
      />

      {/* 2. MAIN WORKSPACE */}
      <main id="konten-utama" className="flex min-w-0 flex-1 flex-col bg-canvas">
        <WorkspaceHeader
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          nasStatus={nasStatus}
          nasLatency={nasLatency}
          connectionMode={connectionMode}
          serverUrl={serverUrl}
          isOnline={isOnline}
          isUploading={isUploading}
          uploadFileName={uploadFileName}
          uploadProgress={uploadProgress}
          onOpenServer={() => setServerModalOpen(true)}
          onUpload={() => fileInputRef.current?.click()}
          onCreateFolder={handleCreateFolder}
        />

        {/* Content Body Based on Tab */}
        <div className="scroll-area flex-1 px-4 py-5 md:px-6 md:py-6">
          <div className="space-y-5">
          {/* TAB 0: HOME BENTO DASHBOARD (MATCHING REFERENCE UI) */}
          {activeTab === "home" && (
            <HomeDashboard
              activeItems={activeItems}
              localItems={localItems}
              isGdriveConnected={isGdriveConnected}
              nasLatency={nasLatency}
              connectionMode={connectionMode}
              nasStatus={nasStatus}
              serverUrl={serverUrl}
              onCreateFolder={handleCreateFolder}
              onNavigate={setActiveTab}
              onOpenStudioTool={setActiveStudioTool}
              onUpload={() => fileInputRef.current?.click()}
              onDownload={handleDownload}
              onOpenMedia={setSelectedMedia}
              onOpenServer={() => setServerModalOpen(true)}
            />
          )}

          {/* TAB 1: FILE EXPLORER */}
          {activeTab === "files" && (
            <FileExplorerTab
              items={filteredFiles}
              allItems={activeItems}
              currentFolderId={currentFolderId}
              breadcrumbs={folderBreadcrumbs}
              connectionMode={connectionMode}
              isGdriveConnected={isGdriveConnected}
              viewMode={viewMode}
              onViewModeChange={setViewMode}
              storageFilter={storageFilter}
              onStorageFilterChange={setStorageFilter}
              pendingUploads={pendingUploads}
              isOnline={isOnline}
              flushingQueue={flushingQueue}
              nasFilesLoading={nasFilesLoading}
              nasFilesError={nasFilesError}
              isForeign={isForeignItem}
              thumbnailUrl={thumbnailForItem}
              onFlushQueue={handleFlushQueue}
              onReload={() => loadNasFiles(currentFolderId)}
              onGoBack={handleGoBackFolder}
              onBreadcrumb={handleNavigateBreadcrumb}
              onOpenFolder={handleOpenFolder}
              onOpenFile={setSelectedMedia}
              onDelete={handleDelete}
              onFav={handleFav}
              onDownload={handleDownload}
              onRename={handleRename}
              onMove={openMoveModal}
              onShare={openShareModal}
              onOpenMenu={openFileActionMenu}
              selectionMode={selection.mode}
              selectedIds={selection.selectedIds}
              onToggleSelect={(item, modifiers) => {
                if (modifiers.shiftKey && selection.anchorId) {
                  selection.selectRange(
                    activeItems
                      .filter((entry) => (entry.parentId || null) === currentFolderId)
                      .map((entry) => entry.id),
                    selection.anchorId,
                    item.id
                  );
                  return;
                }
                selection.toggle(item.id);
              }}
              onToggleSelectionMode={() => {
                if (selection.mode) selection.clear();
                else selection.start();
              }}
            />
          )}

          {/* TAB 1b: TRASH */}
          {activeTab === "trash" && (
            <TrashTab
              items={trashItems}
              loading={trashLoading}
              error={trashError}
              busyId={trashBusyId}
              currentUserId={currentUser?.id}
              onReload={loadTrash}
              onRestore={handleRestoreTrash}
              onPurge={handlePurgeTrash}
            />
          )}

          {/* TAB 2: GALLERY VIEW */}
          {activeTab === "gallery" && (
            <GalleryTab
              items={galleryItems}
              category={galleryCategory}
              onCategoryChange={setGalleryCategory}
              onOpen={setSelectedMedia}
              thumbnailUrl={thumbnailForItem}
              onOpenMenu={openFileActionMenu}
              selectionMode={selection.mode}
              selectedIds={selection.selectedIds}
              onToggleSelect={(item, modifiers) => {
                if (modifiers.shiftKey && selection.anchorId) {
                  selection.selectRange(
                    galleryItems.map((entry) => entry.id),
                    selection.anchorId,
                    item.id
                  );
                  return;
                }
                selection.toggle(item.id);
              }}
              onToggleSelectionMode={() => {
                if (selection.mode) selection.clear();
                else selection.start();
              }}
            />
          )}

          {/* TAB 3: CLIENT-SIDE STUDIO TOOLS (WASM & CANVAS) */}
          {activeTab === "studio" && (
            <StudioTab
              tool={activeStudioTool}
              onToolChange={setActiveStudioTool}
              processing={studioProcessing}
              successMsg={studioSuccessMsg}
              img2PdfRef={studioImg2PdfRef}
              mergePdfRef={studioMergePdfRef}
              compressRef={studioCompressRef}
              removeBgRef={studioRemoveBgRef}
              enhanceRef={studioEnhanceRef}
              onImagesToPDF={handleImagesToPDF}
              onMergePDFs={handleMergePDFs}
              onCompressImage={handleCompressImage}
              onRemoveBackground={handleRemoveBackground}
              onEnhancePhoto={handleEnhancePhoto}
              onOpenStoragePicker={handleOpenStoragePicker}
              compressQuality={compressQuality}
              onCompressQualityChange={setCompressQuality}
              lastCompressResult={lastCompressResult}
              bgModelReady={bgModelReady}
              bgConsentGranted={bgConsentGranted}
              bgProgress={bgProgress}
              bgTolerance={bgTolerance}
              onBgToleranceChange={setBgTolerance}
              bgDropShadow={bgDropShadow}
              onBgDropShadowChange={setBgDropShadow}
              onGrantBgConsent={() => setBgConsentGranted(true)}
              lastEnhanceResult={lastEnhanceResult}
              error={studioError}
              onDismissError={() => setStudioError(null)}
              onSuccess={setStudioSuccessMsg}
              pickedFile={studioPickedFile}
              onPickedFileHandled={() => setStudioPickedFile(null)}
              onCommitStudioOutput={commitStudioOutput}
              onBgModelReady={markBgModelReady}
            />
          )}

          {/* TAB 4: GOOGLE DRIVE (dihandle komponen terpisah) */}
          {activeTab === "gdrive" && <GoogleDrivePanel />}

          {/* TAB 5: FAMILY SHARING & REMOTE ACCESS */}
          {activeTab === "shares" && (
            <FamilySharingTab
              subTab={familySubTab}
              onSubTabChange={setFamilySubTab}
              members={familyMembers}
              invites={serverInvites}
              shares={activeShares}
              onAddMember={() => setAddMemberModalOpen(true)}
              onRefreshInvites={refreshInvites}
              onRevokeInvite={handleRevokeInvite}
              onRevokeShare={handleRevokeShare}
              onOpenFiles={() => setActiveTab("files")}
              canManageQuota={currentUser?.role === "owner" || currentUser?.role === "admin"}
              viewerRole={currentUser?.role || "member"}
              onUpdateQuota={handleUpdateMemberQuota}
            />
          )}
          </div>
        </div>
      </main>

      {/* Navigasi bawah untuk HP; sidebar disembunyikan di layar kecil */}
      <MobileNav
        activeTab={activeTab}
        onTabChange={setActiveTab}
        connectionMode={connectionMode}
        onOpenServer={() => setServerModalOpen(true)}
        onInstallPwa={handleInstallPwa}
        onLogout={handleLogout}
      />

      {/* 3. LIGHTBOX / MEDIA DETAIL MODAL */}
      {selectedMedia && (
        <MediaLightbox
          item={selectedMedia}
          onClose={() => setSelectedMedia(null)}
          onDownload={handleDownload}
        />
      )}

      {/* 3b. MOVE ITEM MODAL */}
      {moveItems.length > 0 && (
        <MoveItemModal
          items={moveItems}
          crumbs={moveCrumbs}
          folders={moveFolders}
          loading={moveLoading}
          busy={moveBusy}
          onNavigate={handleMoveNavigate}
          onConfirm={handleConfirmMove}
          onClose={() => setMoveItems([])}
        />
      )}

      {/* 3c. MENU AKSI BERKAS */}
      {actionMenuItem && actionMenuAnchor && (
        <FileActionMenu
          item={actionMenuItem}
          actions={actionsForItem(actionMenuItem, isForeignItem(actionMenuItem))}
          anchor={actionMenuAnchor}
          onAction={handleFileAction}
          onClose={closeFileActionMenu}
        />
      )}

      {/* 3d. BAR AKSI SELEKSI BANYAK */}
      <FileSelectionBar
        count={selection.count}
        actions={actionsForSelection(selectedItems, selectedItems.some(isForeignItem))}
        busy={bulkBusy}
        onAction={handleBulkAction}
        onSelectAll={() => selection.selectAll(visibleSelectionIds)}
        onClear={selection.clear}
      />

      {/* 3e. SMART FOLDER MODAL */}
      {smartFolderOpen && (
        <SmartFolderModal
          mode={smartFolderMode}
          groups={groupItems(selectedItems, smartFolderMode)}
          busy={bulkBusy}
          onModeChange={setSmartFolderMode}
          onConfirm={handleConfirmAutoGroup}
          onClose={() => setSmartFolderOpen(false)}
        />
      )}

      {/* 3f. PROGRES & PEMBERITAHUAN AKSI BERKAS */}
      {bulkProgress && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-32 left-1/2 z-50 -translate-x-1/2 rounded-xl border border-line bg-surface px-4 py-2.5 text-[12.5px] shadow-pop"
        >
          <span className="font-semibold text-fg">{bulkProgress.label}</span>{" "}
          <span className="tabular-nums text-muted">
            {bulkProgress.current}/{bulkProgress.total}
          </span>
        </div>
      )}

      {libraryNotice && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-20 left-1/2 z-50 flex max-w-[92vw] -translate-x-1/2 items-center gap-3 rounded-xl border border-success-border bg-success-soft px-4 py-2.5 text-[12.5px] text-success shadow-pop lg:bottom-6"
        >
          <span className="min-w-0">{libraryNotice}</span>
          <button
            type="button"
            onClick={() => setLibraryNotice("")}
            className="shrink-0 font-semibold underline"
          >
            Tutup
          </button>
        </div>
      )}

      {/* 4. SHARE LINK MODAL */}
      {shareModalFile && (
        <ShareLinkModal
          item={shareModalFile}
          expiry={shareExpiryOption}
          onExpiryChange={setShareExpiryOption}
          permission={sharePermission}
          onPermissionChange={setSharePermission}
          password={sharePasswordInput}
          onPasswordChange={setSharePasswordInput}
          generatedUrl={currentGeneratedUrl}
          generated={shareLinkGenerated}
          generating={shareGenerating}
          onGenerate={handleGenerateShare}
          onClose={() => {
            setShareModalFile(null);
            setShareLinkGenerated(false);
          }}
        />
      )}


      {/* 6. ADD FAMILY MEMBER MODAL */}
      {addMemberModalOpen && (
        <AddMemberModal
          generatedInviteUrl={generatedInviteUrl}
          name={newMemberName}
          onNameChange={setNewMemberName}
          email={newMemberEmail}
          onEmailChange={setNewMemberEmail}
          role={newMemberRole}
          onRoleChange={setNewMemberRole}
          quotaGB={newMemberQuotaGB}
          onQuotaChange={setNewMemberQuotaGB}
          onSubmit={handleAddFamilyMember}
          onClose={() => {
            setAddMemberModalOpen(false);
            setGeneratedInviteUrl("");
          }}
          onFinish={() => {
            setGeneratedInviteUrl("");
            setNewMemberName("");
            setNewMemberEmail("");
            setAddMemberModalOpen(false);
          }}
        />
      )}

      {/* 5. SERVER CONNECTION MODAL (DUAL-MODE HYBRID SWITCHER) */}
      {serverModalOpen && (
        <ServerSettingsModal
          mode={connectionMode}
          onModeChange={setConnectionMode}
          serverUrl={inputServerUrl}
          onServerUrlChange={setInputServerUrl}
          adminKey={inputAdminKey}
          onAdminKeyChange={setInputAdminKey}
          testing={isTestingPing}
          pingMessage={pingTestMessage}
          status={nasStatus}
          health={nasHealth}
          onTestPing={handleTestPing}
          onSave={handleSaveServerConfig}
          onClose={() => setServerModalOpen(false)}
        />
      )}

      {/* 7. STORAGE FILE PICKER MODAL (FOR STUDIO TOOLS) */}
      {storagePickerOpen && (
        <StoragePickerModal
          tool={storagePickerTool}
          tab={storagePickerTab}
          onTabChange={setStoragePickerTab}
          localItems={localItems}
          selectedIds={selectedStorageIds}
          onSelectedIdsChange={setSelectedStorageIds}
          nasStatus={nasStatus}
          isGdriveConnected={isGdriveConnected}
          onClose={() => setStoragePickerOpen(false)}
          onConfirm={handleExecuteStorageSelection}
        />
      )}
    </div>
  );
}


