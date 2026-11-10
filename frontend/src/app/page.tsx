"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  Image as ImageIcon,
  Home as HomeIcon,
  FolderInput
} from "lucide-react";
import {
  saveLocalFile,
  getAllLocalFiles,
  deleteLocalFile,
  toggleFavorite,
  enqueueUpload,
  countQueuedUploads,
  StoredFile,
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
import { compressAndResizeImage, createIDPhoto, CompressionResult } from "@/lib/studio/image";
import {
  pingNasServer,
  getStoredServerUrl,
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
import FileExplorerTab from "@/components/FileExplorerTab";
import GalleryTab from "@/components/GalleryTab";
import HomeDashboard from "@/components/HomeDashboard";
import MediaLightbox from "@/components/MediaLightbox";
import MoveItemModal from "@/components/MoveItemModal";
import ServerSettingsModal from "@/components/ServerSettingsModal";
import Sidebar from "@/components/Sidebar";
import ShareLinkModal from "@/components/ShareLinkModal";
import StoragePickerModal from "@/components/StoragePickerModal";
import StudioTab from "@/components/StudioTab";
import TrashTab from "@/components/TrashTab";
import WorkspaceHeader from "@/components/WorkspaceHeader";
import {
  ActiveShare,
  DisplayItem,
  FamilyMember,
  formatBytes,
  nasNodeToDisplay,
} from "@/lib/nasDisplay";

import GoogleDrivePanel from "@/components/GoogleDrivePanel";

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
  const [moveItem, setMoveItem] = useState<DisplayItem | null>(null);
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

  // Phase 5: PWA Installation State
  const [isPwaInstalled, setIsPwaInstalled] = useState(false);

  // Folder Drill-down & Breadcrumbs State
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [folderBreadcrumbs, setFolderBreadcrumbs] = useState<{ id: string | null; name: string }[]>([
    { id: null, name: "Semua File" },
  ]);

  // Generated Invitation Link for Family
  const [generatedInviteUrl, setGeneratedInviteUrl] = useState("");
  // Undangan & anggota yang tersimpan di server NAS
  const [serverInvites, setServerInvites] = useState<ServerInvite[]>([]);
  const [serverMembers, setServerMembers] = useState<ServerMember[]>([]);

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
  const [activeStudioTool, setActiveStudioTool] = useState<"img2pdf" | "mergepdf" | "idphoto" | "compress">("img2pdf");
  const [studioProcessing, setStudioProcessing] = useState(false);
  const [studioSuccessMsg, setStudioSuccessMsg] = useState("");

  // Unified Storage Picker for Studio Tools (Local / NAS / Drive)
  const [storagePickerOpen, setStoragePickerOpen] = useState(false);
  const [storagePickerTool, setStoragePickerTool] = useState<"img2pdf" | "mergepdf" | "idphoto" | "compress">("img2pdf");
  const [storagePickerTab, setStoragePickerTab] = useState<"local" | "nas" | "gdrive">("local");
  const [selectedStorageIds, setSelectedStorageIds] = useState<string[]>([]);

  // ID Photo settings
  const [idPhotoRatio, setIdPhotoRatio] = useState<"3x4" | "4x6">("3x4");
  const [idPhotoBg, setIdPhotoBg] = useState<string>("#dc2626"); // Red

  // Image compress settings
  const [compressQuality, setCompressQuality] = useState<number>(0.75);
  const [lastCompressResult, setLastCompressResult] = useState<CompressionResult | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const studioImg2PdfRef = useRef<HTMLInputElement>(null);
  const studioMergePdfRef = useRef<HTMLInputElement>(null);
  const studioIdPhotoRef = useRef<HTMLInputElement>(null);
  const studioCompressRef = useRef<HTMLInputElement>(null);

  // Load files from IndexedDB and Check NAS Server Health on mount
  useEffect(() => {
    const savedUrl = getStoredServerUrl();
    setServerUrl(savedUrl);
    setInputServerUrl(savedUrl);
    setInputAdminKey(getAdminKey());

    async function checkHealth() {
      try {
        const h = await pingNasServer(savedUrl);
        setNasHealth(h);
        setNasStatus("online");
        setNasLatency(h.latencyMs ?? null);
      } catch {
        setNasStatus("offline");
        setNasLatency(null);
      }
    }

    checkHealth();
    const pingInterval = setInterval(checkHealth, 10000);

    // Status Google Drive diambil dari server, bukan dari state lokal.
    async function checkGdrive() {
      try {
        const s = await gdriveStatus();
        setIsGdriveConnected(s.connected);
      } catch {
        setIsGdriveConnected(false);
      }
    }
    checkGdrive();

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

    return () => clearInterval(pingInterval);
  }, []);

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

  useEffect(() => {
    if (connectionMode !== "nas" || !currentUser) {
      setNasItems([]);
      return;
    }
    loadNasFiles(currentFolderId);
  }, [connectionMode, currentUser, currentFolderId, loadNasFiles]);

  // Galeri memuat media lintas folder setiap kali tabnya dibuka, supaya
  // unggahan/hapus terbaru langsung terlihat tanpa memuat seluruh pohon berkas.
  useEffect(() => {
    if (connectionMode !== "nas" || !currentUser) {
      setMediaItems([]);
      return;
    }
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
    loadTrash();
  }, [loadTrash]);

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
  // Drive punya state sendiri dan bisa berubah tanpa reload halaman.
  useEffect(() => {
    if (activeTab !== "home") return;
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
  }, [activeTab]);

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

    const colors = ["bg-emerald-600", "bg-purple-600", "bg-amber-600", "bg-pink-600", "bg-teal-600"];
    const randomBg = colors[Math.floor(Math.random() * colors.length)];

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
        avatarBg: randomBg,
      };
      setFamilyMembers((prev) => [...prev, member]);

      // Tautan harus bisa dibuka dari HP anggota keluarga di WiFi rumah.
      const host =
        typeof window !== "undefined" && window.location.hostname !== "localhost"
          ? window.location.origin
          : "http://192.168.18.22:3001";
      setGeneratedInviteUrl(`${host}/invite/${res.token}`);
      await refreshInvites();
    } catch (err) {
      alert(
        `Gagal membuat undangan: ${(err as Error).message}\n\nPastikan backend NAS berjalan di port 8080.`
      );
    }
  };

  // Muat undangan & anggota yang benar-benar tersimpan di server.
  const refreshInvites = async () => {
    try {
      const data = await listInvites();
      setServerInvites(data.invites);
      setServerMembers(data.members || []);

      // Anggota yang sudah terdaftar di database membawa kuota dan pemakaian
      // nyata; daftar undangan hanya dipakai sebagai cadangan.
      let accounts: NasFamilyMember[] = [];
      try {
        accounts = await listFamilyMembers();
      } catch {
        accounts = [];
      }

      const palette = ["bg-emerald-600", "bg-purple-600", "bg-amber-600", "bg-pink-600", "bg-teal-600"];
      if (accounts.length > 0) {
        setFamilyMembers(
          accounts.map((m, i) => ({
            id: m.id,
            name: m.username,
            email: m.email,
            role: m.role,
            usedBytes: m.quota_used_bytes || 0,
            quotaBytes: m.quota_bytes || 0,
            avatarBg: palette[i % palette.length],
          }))
        );
      } else if (data.members?.length) {
        // Tampilkan anggota yang sudah menerima undangan sebagai kartu keluarga.
        setFamilyMembers(
          data.members.map((m, i) => ({
            id: m.id,
            name: m.name,
            email: m.email,
            role: (m.role === "owner" || m.role === "admin" ? m.role : "member") as
              | "owner"
              | "admin"
              | "member",
            usedBytes: 0,
            quotaBytes: m.quota_gb * 1024 * 1024 * 1024,
            avatarBg: palette[i % palette.length],
          }))
        );
      }
    } catch {
      // backend belum jalan — biarkan state kosong, jangan tampilkan data palsu
      setServerInvites([]);
      setServerMembers([]);
    }
  };

  // Ubah kuota satu anggota lalu segarkan kartu agar pemakaian ikut terbarui.
  const handleUpdateMemberQuota = async (id: string, quotaGB: number) => {
    await updateMemberQuota(id, quotaGB);
    await refreshInvites();
  };

  useEffect(() => {
    let alive = true;
    refreshInvites();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
          const mime = (r.MimeType || "").toLowerCase();
          let fileType: DisplayItem["type"] = "document";
          if (r.IsDirectory) fileType = "folder";
          else if (mime.startsWith("image/")) fileType = "image";
          else if (mime.startsWith("video/") || mime.startsWith("audio/")) fileType = "video";

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
    alert("Untuk memasang NAS Cloud di HP/Laptop:\n1. Buka menu browser (titik tiga ⋮ di Chrome/Edge atau tombol Share di Safari iOS)\n2. Pilih 'Tambahkan ke Layar Utama' (Add to Home Screen / Install App).\n\nAplikasi akan terpasang sebagai aplikasi PWA berkecepatan native.");
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
      await loadNasFiles(currentFolderId);
    } catch (err) {
      alert(`Gagal mengganti nama: ${(err as Error).message}`);
    }
  };

  const loadMoveFolders = async (parentId: string | null, excludeId?: string) => {
    setMoveLoading(true);
    try {
      const nodes = await listNasFiles(parentId);
      setMoveFolders(
        nodes
          .filter((n) => n.IsDirectory)
          .map(nasNodeToDisplay)
          .filter((f) => f.id !== excludeId)
      );
    } catch (err) {
      alert(`Gagal memuat folder: ${(err as Error).message}`);
      setMoveFolders([]);
    } finally {
      setMoveLoading(false);
    }
  };

  const openMoveModal = (item: DisplayItem) => {
    if (connectionMode !== "nas") {
      alert("Pindah folder hanya tersedia untuk berkas di server NAS.");
      return;
    }
    setMoveItem(item);
    setMoveParentId(null);
    setMoveCrumbs([{ id: null, name: "Semua File" }]);
    loadMoveFolders(null, item.id);
  };

  const handleMoveNavigate = (id: string | null, name: string, crumbIndex?: number) => {
    if (!moveItem) return;
    setMoveParentId(id);
    setMoveCrumbs((prev) =>
      crumbIndex === undefined ? [...prev, { id, name }] : prev.slice(0, crumbIndex)
    );
    loadMoveFolders(id, moveItem.id);
  };

  const handleConfirmMove = async () => {
    if (!moveItem) return;
    setMoveBusy(true);
    try {
      await moveNasFile(moveItem.id, moveParentId);
      setMoveItem(null);
      await loadNasFiles(currentFolderId);
    } catch (err) {
      alert(`Gagal memindahkan: ${(err as Error).message}`);
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
      let type: StoredFile["type"] = "document";
      if (file.type.startsWith("image/")) type = "image";
      else if (file.type.startsWith("video/")) type = "video";
      else if (file.name.endsWith(".zip") || file.name.endsWith(".tar.gz") || file.name.endsWith(".rar")) type = "archive";

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

  // Unified Storage Picker Handlers for Studio
  const handleOpenStoragePicker = (tool: "img2pdf" | "mergepdf" | "idphoto" | "compress") => {
    setStoragePickerTool(tool);
    setSelectedStorageIds([]);
    setStoragePickerOpen(true);
  };

  const handleExecuteStorageSelection = async () => {
    if (selectedStorageIds.length === 0) {
      alert("Silakan pilih minimal 1 berkas dari penyimpanan.");
      return;
    }

    setStudioProcessing(true);
    setStudioSuccessMsg("");
    setStoragePickerOpen(false);

    try {
      const selectedItems = localItems.filter((i) => selectedStorageIds.includes(i.id));
      const files: File[] = [];

      for (const item of selectedItems) {
        if (item.blob) {
          const f = new File([item.blob], item.name, { type: item.blob.type || "application/octet-stream" });
          files.push(f);
        }
      }

      if (files.length === 0) {
        alert("Berkas fisik belum tersedia di memori perangkat.");
        setStudioProcessing(false);
        return;
      }

      if (storagePickerTool === "img2pdf") {
        const pdfBytes = await imagesToPDF(files);
        const blob = new Blob([pdfBytes as unknown as BlobPart], { type: "application/pdf" });
        const filename = `Foto_Dokumen_${Date.now()}.pdf`;
        await saveLocalFile(filename, blob, "document", "application/pdf");
        const newItem: DisplayItem = {
          id: crypto.randomUUID(),
          name: filename,
          type: "document",
          sizeStr: formatBytes(blob.size),
          sizeBytes: blob.size,
          updatedAt: "Baru saja (Studio)",
          parentId: currentFolderId,
          blob,
        };
        setLocalItems((prev) => [newItem, ...prev]);
        setStudioSuccessMsg(`Berhasil! ${files.length} foto dari penyimpanan berhasil digabung menjadi ${filename}.`);
      } else if (storagePickerTool === "mergepdf") {
        if (files.length < 2) {
          alert("Silakan pilih minimal 2 file PDF untuk digabungkan.");
          setStudioProcessing(false);
          return;
        }
        const mergedBytes = await mergePDFs(files);
        const blob = new Blob([mergedBytes as unknown as BlobPart], { type: "application/pdf" });
        const filename = `Merged_Document_${Date.now()}.pdf`;
        await saveLocalFile(filename, blob, "document", "application/pdf");
        const newItem: DisplayItem = {
          id: crypto.randomUUID(),
          name: filename,
          type: "document",
          sizeStr: formatBytes(blob.size),
          sizeBytes: blob.size,
          updatedAt: "Baru saja (Studio)",
          parentId: currentFolderId,
          blob,
        };
        setLocalItems((prev) => [newItem, ...prev]);
        setStudioSuccessMsg(`Berhasil! ${files.length} berkas PDF dari penyimpanan digabung menjadi ${filename}.`);
      } else if (storagePickerTool === "idphoto") {
        const blob = await createIDPhoto(files[0], idPhotoRatio, idPhotoBg);
        const filename = `Pasfoto_${idPhotoRatio}_${Date.now()}.jpg`;
        await saveLocalFile(filename, blob, "image", "image/jpeg");
        const newItem: DisplayItem = {
          id: crypto.randomUUID(),
          name: filename,
          type: "image",
          sizeStr: formatBytes(blob.size),
          sizeBytes: blob.size,
          dimensions: idPhotoRatio === "3x4" ? "354 × 472 px" : "472 × 709 px",
          updatedAt: "Baru saja (Studio)",
          parentId: currentFolderId,
          blob,
        };
        setLocalItems((prev) => [newItem, ...prev]);
        setStudioSuccessMsg(`Pasfoto ukuran ${idPhotoRatio} berhasil dibuat dari berkas penyimpanan lokal.`);
      } else if (storagePickerTool === "compress") {
        const result = await compressAndResizeImage(files[0], 1920, compressQuality, "image/jpeg");
        setLastCompressResult(result);
        const filename = `Compressed_${files[0].name.replace(/\.[^/.]+$/, "")}.jpg`;
        await saveLocalFile(filename, result.blob, "image", "image/jpeg");
        const newItem: DisplayItem = {
          id: crypto.randomUUID(),
          name: filename,
          type: "image",
          sizeStr: formatBytes(result.compressedSize),
          sizeBytes: result.compressedSize,
          dimensions: `${result.width} × ${result.height}`,
          updatedAt: "Baru saja (Studio)",
          parentId: currentFolderId,
          blob: result.blob,
        };
        setLocalItems((prev) => [newItem, ...prev]);
        setStudioSuccessMsg(`Kompresi selesai! Ukuran berkurang ${result.savingsPercent}% (dari ${formatBytes(result.originalSize)} menjadi ${formatBytes(result.compressedSize)}).`);
      }
    } catch (err) {
      console.error(err);
      alert("Gagal memproses berkas dari penyimpanan.");
    } finally {
      setStudioProcessing(false);
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
  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();

    if (connectionMode === "nas") {
      if (!confirm("Pindahkan item ini ke Trash? Kamu masih bisa memulihkannya nanti.")) return;
      try {
        await deleteNasFile(id);
        setNasItems((prev) => prev.filter((item) => item.id !== id));
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
    try {
      const pdfBytes = await imagesToPDF(Array.from(files));
      const blob = new Blob([pdfBytes as unknown as BlobPart], { type: "application/pdf" });
      const filename = `Foto_Dokumen_${Date.now()}.pdf`;

      await saveLocalFile(filename, blob, "document", "application/pdf");
      const newItem: DisplayItem = {
        id: crypto.randomUUID(),
        name: filename,
        type: "document",
        sizeStr: formatBytes(blob.size),
        sizeBytes: blob.size,
        updatedAt: "Baru saja (Studio)",
        blob,
      };
      setLocalItems((prev) => [newItem, ...prev]);

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);

      setStudioSuccessMsg(`Berhasil! ${files.length} foto digabung menjadi ${filename} dan tersimpan di penyimpanan lokal.`);
    } catch (err) {
      console.error(err);
      alert("Gagal membuat PDF dari gambar.");
    } finally {
      setStudioProcessing(false);
      if (studioImg2PdfRef.current) studioImg2PdfRef.current.value = "";
    }
  };

  // Studio: Merge PDFs
  const handleMergePDFs = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length < 2) {
      alert("Silakan pilih minimal 2 file PDF untuk digabungkan.");
      return;
    }

    setStudioProcessing(true);
    setStudioSuccessMsg("");
    try {
      const mergedBytes = await mergePDFs(Array.from(files));
      const blob = new Blob([mergedBytes as unknown as BlobPart], { type: "application/pdf" });
      const filename = `Merged_Document_${Date.now()}.pdf`;

      await saveLocalFile(filename, blob, "document", "application/pdf");
      const newItem: DisplayItem = {
        id: crypto.randomUUID(),
        name: filename,
        type: "document",
        sizeStr: formatBytes(blob.size),
        sizeBytes: blob.size,
        updatedAt: "Baru saja (Studio)",
        blob,
      };
      setLocalItems((prev) => [newItem, ...prev]);

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);

      setStudioSuccessMsg(`Berhasil! ${files.length} dokumen PDF telah digabung menjadi ${filename}.`);
    } catch (err) {
      console.error(err);
      alert("Gagal menggabungkan PDF. Pastikan file tidak terkunci password.");
    } finally {
      setStudioProcessing(false);
      if (studioMergePdfRef.current) studioMergePdfRef.current.value = "";
    }
  };

  // Studio: ID Photo (Pasfoto)
  const handleCreateIDPhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setStudioProcessing(true);
    setStudioSuccessMsg("");
    try {
      const file = files[0];
      const blob = await createIDPhoto(file, idPhotoRatio, idPhotoBg);
      const filename = `Pasfoto_${idPhotoRatio}_${Date.now()}.jpg`;

      await saveLocalFile(filename, blob, "image", "image/jpeg");
      const newItem: DisplayItem = {
        id: crypto.randomUUID(),
        name: filename,
        type: "image",
        sizeStr: formatBytes(blob.size),
        sizeBytes: blob.size,
        dimensions: idPhotoRatio === "3x4" ? "354 × 472 px" : "472 × 709 px",
        updatedAt: "Baru saja (Studio)",
        blob,
      };
      setLocalItems((prev) => [newItem, ...prev]);

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);

      setStudioSuccessMsg(`Pasfoto ukuran ${idPhotoRatio} berhasil dibuat dan diunduh.`);
    } catch (err) {
      console.error(err);
      alert("Gagal memproses pasfoto.");
    } finally {
      setStudioProcessing(false);
      if (studioIdPhotoRef.current) studioIdPhotoRef.current.value = "";
    }
  };

  // Studio: Compress Image
  const handleCompressImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setStudioProcessing(true);
    setStudioSuccessMsg("");
    try {
      const file = files[0];
      const result = await compressAndResizeImage(file, 1920, compressQuality, "image/jpeg");
      setLastCompressResult(result);

      const filename = `Compressed_${file.name.replace(/\.[^/.]+$/, "")}.jpg`;
      await saveLocalFile(filename, result.blob, "image", "image/jpeg");

      const newItem: DisplayItem = {
        id: crypto.randomUUID(),
        name: filename,
        type: "image",
        sizeStr: formatBytes(result.compressedSize),
        sizeBytes: result.compressedSize,
        dimensions: `${result.width} × ${result.height}`,
        updatedAt: "Baru saja (Studio)",
        blob: result.blob,
      };
      setLocalItems((prev) => [newItem, ...prev]);

      const url = URL.createObjectURL(result.blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);

      setStudioSuccessMsg(`Kompresi selesai! Ukuran berkurang ${result.savingsPercent}% (dari ${formatBytes(result.originalSize)} menjadi ${formatBytes(result.compressedSize)}).`);
    } catch (err) {
      console.error(err);
      alert("Gagal mengompresi gambar.");
    } finally {
      setStudioProcessing(false);
      if (studioCompressRef.current) studioCompressRef.current.value = "";
    }
  };

  // Sumber data UI: server NAS saat mode NAS, IndexedDB saat standalone.
  const activeItems = connectionMode === "nas" ? nasItems : localItems;

  // Galeri memakai media lintas folder di mode NAS; di standalone seluruh
  // item lokal memang sudah terkumpul di satu tempat.
  const galleryItems = connectionMode === "nas" ? mediaItems : localItems;

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
    <div className="flex h-screen w-full bg-zinc-950 text-zinc-100 font-sans overflow-hidden">
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
      <main className="flex-1 flex flex-col min-w-0 bg-zinc-950">
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
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
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
              onShare={(item) => {
                setShareModalFile(item);
                setShareLinkGenerated(false);
                setCurrentGeneratedUrl("");
                setSharePasswordInput("");
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
              idPhotoRef={studioIdPhotoRef}
              compressRef={studioCompressRef}
              onImagesToPDF={handleImagesToPDF}
              onMergePDFs={handleMergePDFs}
              onCreateIDPhoto={handleCreateIDPhoto}
              onCompressImage={handleCompressImage}
              onOpenStoragePicker={handleOpenStoragePicker}
              idPhotoRatio={idPhotoRatio}
              onIdPhotoRatioChange={setIdPhotoRatio}
              idPhotoBg={idPhotoBg}
              onIdPhotoBgChange={setIdPhotoBg}
              compressQuality={compressQuality}
              onCompressQualityChange={setCompressQuality}
              lastCompressResult={lastCompressResult}
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
      </main>

      {/* 3. LIGHTBOX / MEDIA DETAIL MODAL */}
      {selectedMedia && (
        <MediaLightbox
          item={selectedMedia}
          onClose={() => setSelectedMedia(null)}
          onDownload={handleDownload}
        />
      )}

      {/* 3b. MOVE ITEM MODAL */}
      {moveItem && (
        <MoveItemModal
          item={moveItem}
          crumbs={moveCrumbs}
          folders={moveFolders}
          loading={moveLoading}
          busy={moveBusy}
          onNavigate={handleMoveNavigate}
          onConfirm={handleConfirmMove}
          onClose={() => setMoveItem(null)}
        />
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


