"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  Folder,
  FileText,
  Image as ImageIcon,
  Film,
  HardDrive,
  Cloud,
  Share2,
  Search,
  Upload,
  Plus,
  Grid,
  List,
  CheckCircle2,
  Download,
  Eye,
  Shield,
  Sparkles,
  X,
  Play,
  Heart,
  FileArchive,
  RefreshCw,
  Wand2,
  Layers,
  Scissors,
  Trash2,
  Server,
  Settings,
  Wifi,
  WifiOff,
  Activity,
  Check,
  Users,
  Link2,
  Copy,
  Lock,
  Unlock,
  LogOut,
  Globe,
  ArrowRight,
  ShieldCheck,
  DownloadCloud,
  Smartphone,
  CheckCheck,
  ChevronRight,
  ArrowLeft,
  ExternalLink,
  CornerLeftUp,
  Home as HomeIcon,
  Palette,
  Bell,
  ArrowUpRight,
  FolderOpen,
  Clock,
  PieChart,
  Pencil,
  FolderInput
} from "lucide-react";
import {
  saveLocalFile,
  getAllLocalFiles,
  deleteLocalFile,
  toggleFavorite,
  StoredFile,
} from "@/lib/storage/indexeddb";
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
  getStreamUrl,
  getDownloadUrl,
  getStoredToken,
  getStoredUser,
  fetchMe,
  logoutNas,
  listNasFiles,
  createNasFolder,
  deleteNasFile,
  renameNasFile,
  moveNasFile,
  listNasTrash,
  restoreNasFile,
  purgeNasFile,
  NasFileNode,
  TrashedNode,
  NasHealthResponse,
  NasUser,
} from "@/lib/api/nas";
import AuthGate from "@/components/AuthGate";

interface DisplayItem {
  id: string;
  name: string;
  type: "folder" | "image" | "video" | "document" | "archive";
  sizeStr: string;
  sizeBytes: number;
  updatedAt: string;
  parentId?: string | null;
  ownerId?: string | null;
  sha256?: string;
  isFavorite?: boolean;
  duration?: string;
  dimensions?: string;
  blob?: Blob;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

// Ubah node dari backend Go menjadi bentuk yang dipakai UI.
function nasNodeToDisplay(node: NasFileNode): DisplayItem {
  const mime = (node.MimeType || "").toLowerCase();
  const lowerName = node.Name.toLowerCase();

  let type: DisplayItem["type"] = "document";
  if (node.IsDirectory) {
    type = "folder";
  } else if (mime.startsWith("image/")) {
    type = "image";
  } else if (mime.startsWith("video/") || mime.startsWith("audio/")) {
    type = "video";
  } else if (
    mime.startsWith("application/zip") ||
    mime.startsWith("application/x-rar") ||
    mime.startsWith("application/x-7z") ||
    mime.startsWith("application/gzip") ||
    lowerName.endsWith(".zip") ||
    lowerName.endsWith(".rar") ||
    lowerName.endsWith(".7z") ||
    lowerName.endsWith(".tar.gz")
  ) {
    type = "archive";
  }

  const size = node.SizeBytes ?? 0;
  const timestamp = node.UpdatedAt || node.CreatedAt;

  return {
    id: node.ID,
    name: node.Name,
    type,
    sizeStr: node.IsDirectory ? "Folder" : formatBytes(size),
    sizeBytes: size,
    updatedAt: timestamp
      ? new Date(timestamp).toLocaleDateString("id-ID", {
          day: "numeric",
          month: "short",
          year: "numeric",
        })
      : "—",
    parentId: node.ParentID,
    ownerId: node.OwnerID,
  };
}

interface FamilyMember {
  id: string;
  name: string;
  email: string;
  role: "owner" | "admin" | "member";
  usedBytes: number;
  quotaBytes: number;
  avatarBg: string;
}

interface ActiveShare {
  id: string;
  fileName: string;
  fileType: DisplayItem["type"];
  rawToken: string;
  shareUrl: string;
  permission: "viewer" | "uploader";
  expiresAtStr: string;
  hasPassword: boolean;
  downloadsCount: number;
}

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

  // Trash NAS — item yang sudah di-soft-delete tapi belum dihapus permanen
  const [trashItems, setTrashItems] = useState<TrashedNode[]>([]);
  const [trashLoading, setTrashLoading] = useState(false);
  const [trashError, setTrashError] = useState("");
  const [trashBusyId, setTrashBusyId] = useState<string | null>(null);

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
      // Tampilkan anggota yang sudah menerima undangan sebagai kartu keluarga.
      if (data.members?.length) {
        const palette = ["bg-emerald-600", "bg-purple-600", "bg-amber-600", "bg-pink-600", "bg-teal-600"];
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
            downloadsCount: 0,
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
        const report = (percent: number) => setUploadProgress(Math.max(10, percent));
        try {
          await uploadToNas(file, currentFolderId, report);
        } catch (err) {
          const msg = (err as Error).message || "";
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

  // Owner/admin bisa melihat berkas anggota lain; UI perlu menandainya agar
  // tidak tertukar dengan berkas sendiri.
  const isForeignItem = (item: DisplayItem) =>
    Boolean(currentUser && item.ownerId && item.ownerId !== currentUser.id);

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
      <aside className="w-64 border-r border-zinc-800 bg-zinc-900/60 flex flex-col justify-between shrink-0 select-none">
        <div>
          {/* Logo & Server/Mode Indicator */}
          <div className="p-4 border-b border-zinc-800/80">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="h-9 w-9 rounded-xl bg-blue-600 flex items-center justify-center shadow-lg shadow-blue-500/20 font-bold text-lg text-white">
                  N
                </div>
                <div>
                  <h1 className="font-semibold text-sm tracking-wide text-zinc-100">NAS Cloud</h1>
                  <button
                    onClick={() => setServerModalOpen(true)}
                    className="flex items-center gap-1.5 text-[11px] font-medium transition-colors hover:underline text-left cursor-pointer"
                  >
                    {connectionMode === "nas" ? (
                      nasStatus === "online" ? (
                        <span className="flex items-center gap-1 text-emerald-400 font-mono">
                          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                          NAS: {nasLatency ? `${nasLatency}ms` : "Online"}
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-rose-400">
                          <span className="h-1.5 w-1.5 rounded-full bg-rose-400" />
                          NAS Offline (IDB)
                        </span>
                      )
                    ) : (
                      <span className="flex items-center gap-1 text-amber-400">
                        <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
                        Mode Standalone
                      </span>
                    )}
                  </button>
                </div>
              </div>

              <button
                onClick={() => setServerModalOpen(true)}
                className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors cursor-pointer"
                title="Konfigurasi Server NAS"
              >
                <Settings className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Navigation Links */}
          <nav className="p-3 space-y-1">
            <button
              onClick={() => setActiveTab("home")}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors cursor-pointer ${
                activeTab === "home"
                  ? "bg-blue-600 text-white shadow-sm"
                  : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60"
              }`}
            >
              <HomeIcon className="h-4 w-4" />
              <span>Home Dashboard</span>
            </button>

            <button
              onClick={() => setActiveTab("files")}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors cursor-pointer ${
                activeTab === "files"
                  ? "bg-blue-600 text-white shadow-sm"
                  : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60"
              }`}
            >
              <Folder className="h-4 w-4" />
              <span>Semua File</span>
              <span className="ml-auto text-[11px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400 font-mono">
                {activeItems.length}
              </span>
            </button>

            <button
              onClick={() => setActiveTab("gallery")}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors cursor-pointer ${
                activeTab === "gallery"
                  ? "bg-blue-600 text-white shadow-sm"
                  : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60"
              }`}
            >
              <ImageIcon className="h-4 w-4" />
              <span>Galeri Media</span>
              <span className="ml-auto text-[11px] px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-300 font-mono">
                {activeItems.filter((i) => i.type === "image" || i.type === "video").length}
              </span>
            </button>

            {connectionMode === "nas" && (
              <button
                onClick={() => setActiveTab("trash")}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors cursor-pointer ${
                  activeTab === "trash"
                    ? "bg-blue-600 text-white shadow-sm"
                    : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60"
                }`}
              >
                <Trash2 className="h-4 w-4" />
                <span>Trash</span>
                <span className="ml-auto text-[11px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400 font-mono">
                  {trashItems.length}
                </span>
              </button>
            )}

            {/* Studio Tools (Client-Side WASM) */}
            <button
              onClick={() => setActiveTab("studio")}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors cursor-pointer ${
                activeTab === "studio"
                  ? "bg-blue-600 text-white shadow-sm"
                  : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60"
              }`}
            >
              <Wand2 className="h-4 w-4 text-amber-400" />
              <span>Studio Tools</span>
              <span className="ml-auto text-[10px] bg-amber-500/20 text-amber-300 px-1.5 py-0.5 rounded font-medium">
                WASM
              </span>
            </button>

            <button
              onClick={() => setActiveTab("gdrive")}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors cursor-pointer ${
                activeTab === "gdrive"
                  ? "bg-blue-600 text-white shadow-sm"
                  : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60"
              }`}
            >
              <Cloud className="h-4 w-4 text-emerald-400" />
              <span>Google Drive</span>
              <span
                className={`ml-auto text-[10px] px-1.5 py-0.5 rounded ${
                  isGdriveConnected ? "bg-emerald-500/20 text-emerald-300" : "bg-zinc-800 text-zinc-400"
                }`}
              >
                {isGdriveConnected ? "Aktif" : "Hubungkan"}
              </span>
            </button>

            <button
              onClick={() => setActiveTab("shares")}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors cursor-pointer ${
                activeTab === "shares"
                  ? "bg-blue-600 text-white shadow-sm"
                  : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60"
              }`}
            >
              <Share2 className="h-4 w-4" />
              <span>Family Sharing</span>
            </button>

            <div className="pt-3 pb-1 px-3 text-[11px] font-semibold text-zinc-500 uppercase tracking-wider">
              Koleksi
            </div>

            <button
              onClick={() => setActiveTab("gallery")}
              className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/40 cursor-pointer"
            >
              <Heart className="h-3.5 w-3.5 text-rose-400" />
              <span>Foto Favorit</span>
            </button>
            <button
              onClick={() => setActiveTab("files")}
              className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/40 cursor-pointer"
            >
              <FileArchive className="h-3.5 w-3.5 text-amber-400" />
              <span>Backup & Arsip</span>
            </button>

            {/* PWA Install Button */}
            <div className="pt-2">
              <button
                onClick={handleInstallPwa}
                className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-blue-600/20 to-indigo-600/20 hover:from-blue-600/30 hover:to-indigo-600/30 border border-blue-500/30 text-blue-300 text-xs font-medium py-2 px-3 rounded-xl transition-all cursor-pointer shadow-sm"
              >
                <Smartphone className="h-3.5 w-3.5" />
                <span>Pasang Aplikasi PWA</span>
              </button>
            </div>
          </nav>
        </div>

        {/* Storage Health & User Info */}
        <div className="p-4 border-t border-zinc-800 space-y-4">
          <div className="bg-zinc-950/60 border border-zinc-800/80 rounded-xl p-3 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-zinc-400 flex items-center gap-1.5">
                <HardDrive className="h-3.5 w-3.5 text-blue-400" />
                {connectionMode === "nas" ? "Penyimpanan NAS" : "Local Storage (IDB)"}
              </span>
              <span className="font-mono text-zinc-300 font-medium">
                {formatBytes(activeItems.reduce((acc, curr) => acc + (curr.sizeBytes || 0), 0))}
              </span>
            </div>
            <div className="h-1.5 w-full bg-zinc-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-blue-500 to-indigo-500 rounded-full transition-all duration-300"
                style={{
                  width: `${Math.min(
                    100,
                    Math.max(
                      activeItems.length > 0 ? 5 : 0,
                      Math.round(
                        (activeItems.reduce((acc, curr) => acc + (curr.sizeBytes || 0), 0) /
                          (50 * 1024 * 1024 * 1024)) *
                          100
                      )
                    )
                  )}%`,
                }}
              />
            </div>
            <p className="text-[11px] text-zinc-500">
              {connectionMode === "nas"
                ? `Server NAS • ${activeItems.length} item di folder ini`
                : `IndexedDB Client Aktif • ${activeItems.length} File Tersimpan`}
            </p>
          </div>

          {currentUser && (
            <div className="flex items-center justify-between bg-zinc-950/60 border border-zinc-800/80 rounded-xl px-3 py-2">
              <div className="min-w-0">
                <p className="text-xs font-medium text-zinc-200 truncate">
                  {currentUser.username}
                </p>
                <p className="text-[10px] text-zinc-500 truncate">
                  {currentUser.email}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-[9px] uppercase font-semibold px-1.5 py-0.5 rounded bg-blue-500/15 text-blue-300 border border-blue-500/30">
                  {currentUser.role}
                </span>
                <button
                  onClick={handleLogout}
                  title="Keluar"
                  className="text-zinc-500 hover:text-rose-300 transition-colors cursor-pointer"
                >
                  <LogOut className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          )}

          <div className="flex items-center justify-between pt-1">
            <div className="flex items-center gap-2.5">
              <div className="h-8 w-8 rounded-full bg-gradient-to-tr from-blue-600 to-teal-400 flex items-center justify-center text-xs font-bold text-white">
                {connectionMode === "nas" ? "NAS" : "LCL"}
              </div>
              <div>
                <p className="text-xs font-medium text-zinc-200">
                  {connectionMode === "nas"
                    ? nasStatus === "online"
                      ? "NAS Homelab"
                      : "NAS (Offline)"
                    : "Penyimpanan Lokal"}
                </p>
                <p className="text-[10px] text-zinc-400 font-mono">
                  {connectionMode === "nas"
                    ? nasStatus === "online"
                      ? serverUrl.replace(/^https?:\/\//, "")
                      : "Cache Offline"
                    : "Standalone Mode"}
                </p>
              </div>
            </div>
            <span
              className={`h-2 w-2 rounded-full ${
                connectionMode === "nas"
                  ? nasStatus === "online"
                    ? "bg-emerald-400"
                    : "bg-rose-400"
                  : "bg-amber-400"
              }`}
              title="Status Jaringan"
            />
          </div>
        </div>
      </aside>

      {/* 2. MAIN WORKSPACE */}
      <main className="flex-1 flex flex-col min-w-0 bg-zinc-950">
        {/* Top Navbar */}
        <header className="h-16 border-b border-zinc-800/80 px-6 flex items-center justify-between shrink-0 bg-zinc-950/80 backdrop-blur-md">
          {/* Search Bar */}
          <div className="relative w-96">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
            <input
              type="text"
              placeholder="Cari foto, dokumen, video..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-zinc-900 border border-zinc-800 rounded-lg pl-10 pr-4 py-2 text-xs text-zinc-200 placeholder:text-zinc-500 focus:outline-none focus:border-blue-500/80 transition-colors"
            />
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => setServerModalOpen(true)}
              className="hidden sm:flex items-center gap-1.5 px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-800 text-xs font-medium text-zinc-300 hover:text-white hover:border-zinc-700 transition-colors cursor-pointer"
              title="Status Server NAS Homelab"
            >
              {nasStatus === "online" ? (
                <>
                  <Wifi className="h-3.5 w-3.5 text-emerald-400" />
                  <span>NAS {nasLatency ? `${nasLatency}ms` : "Online"}</span>
                </>
              ) : (
                <>
                  <WifiOff className="h-3.5 w-3.5 text-rose-400" />
                  <span>NAS Offline</span>
                </>
              )}
            </button>

            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium px-3.5 py-2 rounded-lg transition-all shadow-sm shadow-blue-600/30 active:scale-95 cursor-pointer"
            >
              <Upload className="h-3.5 w-3.5" />
              <span>Upload File Asli</span>
            </button>

            <button
              onClick={handleCreateFolder}
              className="flex items-center gap-2 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-200 text-xs font-medium px-3.5 py-2 rounded-lg transition-colors cursor-pointer"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Folder Baru</span>
            </button>
          </div>
        </header>

        {/* Offline Browser Alert Banner */}
        {!isOnline && (
          <div className="bg-rose-950/60 border-b border-rose-800/60 px-6 py-2.5 flex items-center justify-between text-xs animate-in slide-in-from-top duration-200">
            <div className="flex items-center gap-2.5 text-rose-200">
              <WifiOff className="h-4 w-4 text-rose-400 shrink-0" />
              <span>
                <strong>Kamu sedang offline.</strong> Berkas di server NAS tidak dapat dibuka sampai
                koneksi kembali; berkas mode standalone (IndexedDB) tetap tersedia.
              </span>
            </div>
          </div>
        )}

        {/* Offline Fallback Alert Banner */}
        {connectionMode === "nas" && nasStatus === "offline" && (
          <div className="bg-amber-950/60 border-b border-amber-800/60 px-6 py-2.5 flex items-center justify-between text-xs animate-in slide-in-from-top duration-200">
            <div className="flex items-center gap-2.5 text-amber-300">
              <WifiOff className="h-4 w-4 text-amber-400 shrink-0" />
              <span>
                <strong>NAS Server Offline:</strong> Tidak dapat terhubung ke <code>{serverUrl}</code>. Sistem otomatis mengalihkan penyimpanan ke cache offline (IndexedDB).
              </span>
            </div>
            <button
              onClick={() => setServerModalOpen(true)}
              className="text-amber-400 hover:text-white underline font-medium cursor-pointer"
            >
              Konfigurasi Server
            </button>
          </div>
        )}

        {/* Upload Progress Bar */}
        {isUploading && (
          <div className="bg-blue-950/60 border-b border-blue-800/50 px-6 py-2.5 flex items-center justify-between text-xs animate-in slide-in-from-top duration-200">
            <div className="flex items-center gap-3">
              <RefreshCw className="h-3.5 w-3.5 text-blue-400 animate-spin" />
              <span className="text-blue-200">
                Menyimpan file & verifikasi SHA-256: <code className="font-mono text-white">{uploadFileName}</code> ({uploadProgress}%)
              </span>
            </div>
            <div className="w-48 bg-blue-900/40 h-2 rounded-full overflow-hidden border border-blue-700/50">
              <div
                className="bg-blue-400 h-full transition-all duration-200"
                style={{ width: `${uploadProgress}%` }}
              />
            </div>
          </div>
        )}

        {/* Content Body Based on Tab */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* TAB 0: HOME BENTO DASHBOARD (MATCHING REFERENCE UI) */}
          {activeTab === "home" && (
            <div className="space-y-6 max-w-7xl mx-auto">
              {/* 1. Hero Welcome Banner */}
              <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-blue-950 via-zinc-900 to-indigo-950 border border-blue-900/40 p-6 md:p-8 shadow-2xl">
                <div className="absolute top-0 right-0 -mr-16 -mt-16 w-80 h-80 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />
                <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
                  <div className="space-y-2 max-w-2xl">
                    <div className="flex items-center gap-2">
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-medium bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                        {connectionMode === "nas" ? (nasStatus === "online" ? "NAS Homelab Terlindungi (Online)" : "NAS Mode Offline") : "Local Standalone Active"}
                      </span>
                      <span className="text-zinc-500 text-xs">• v1.0.0 Production</span>
                    </div>
                    <h1 className="text-xl md:text-2xl font-bold text-white tracking-tight">
                      Selamat Datang di NAS Project! 🚀
                    </h1>
                    <p className="text-xs md:text-sm text-zinc-300 leading-relaxed">
                      Pusat digital terpadu untuk berkas pribadi, album kenangan foto, dan alat studio dokumen — tanpa ketergantungan cloud pihak ketiga.
                    </p>
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    <button
                      onClick={() => setActiveTab("files")}
                      className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold px-4 py-2.5 rounded-xl shadow-lg shadow-blue-600/30 transition-all hover:scale-[1.02] cursor-pointer"
                    >
                      <span>Jelajahi Berkas</span>
                      <ArrowRight className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => setActiveTab("studio")}
                      className="bg-zinc-800/80 hover:bg-zinc-700/80 border border-zinc-700/80 text-zinc-200 text-xs font-semibold px-4 py-2.5 rounded-xl transition-all cursor-pointer"
                    >
                      Buka Studio Tools
                    </button>
                  </div>
                </div>
              </div>

              {/* 2. Six Category Shortcuts */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                <div
                  onClick={() => setActiveTab("gallery")}
                  className="bg-zinc-900/60 hover:bg-zinc-900 border border-zinc-800/80 hover:border-purple-500/50 rounded-2xl p-4 cursor-pointer transition-all hover:scale-[1.02] group shadow-sm flex flex-col justify-between"
                >
                  <div className="h-10 w-10 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400 group-hover:bg-purple-600 group-hover:text-white transition-colors mb-3">
                    <ImageIcon className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="text-xs font-semibold text-zinc-100 group-hover:text-purple-400 transition-colors">Galeri Media</h3>
                    <p className="text-[10px] text-zinc-500 mt-0.5">Lihat foto & video</p>
                  </div>
                </div>

                <div
                  onClick={() => setActiveTab("files")}
                  className="bg-zinc-900/60 hover:bg-zinc-900 border border-zinc-800/80 hover:border-blue-500/50 rounded-2xl p-4 cursor-pointer transition-all hover:scale-[1.02] group shadow-sm flex flex-col justify-between"
                >
                  <div className="h-10 w-10 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400 group-hover:bg-blue-600 group-hover:text-white transition-colors mb-3">
                    <Folder className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="text-xs font-semibold text-zinc-100 group-hover:text-blue-400 transition-colors">File Manager</h3>
                    <p className="text-[10px] text-zinc-500 mt-0.5">Kelola direktori & berkas</p>
                  </div>
                </div>

                <div
                  onClick={() => { setActiveTab("studio"); setActiveStudioTool("idphoto"); }}
                  className="bg-zinc-900/60 hover:bg-zinc-900 border border-zinc-800/80 hover:border-emerald-500/50 rounded-2xl p-4 cursor-pointer transition-all hover:scale-[1.02] group shadow-sm flex flex-col justify-between"
                >
                  <div className="h-10 w-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 group-hover:bg-emerald-600 group-hover:text-white transition-colors mb-3">
                    <Palette className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="text-xs font-semibold text-zinc-100 group-hover:text-emerald-400 transition-colors">Image Studio</h3>
                    <p className="text-[10px] text-zinc-500 mt-0.5">Pasfoto & kompresi</p>
                  </div>
                </div>

                <div
                  onClick={() => { setActiveTab("studio"); setActiveStudioTool("img2pdf"); }}
                  className="bg-zinc-900/60 hover:bg-zinc-900 border border-zinc-800/80 hover:border-rose-500/50 rounded-2xl p-4 cursor-pointer transition-all hover:scale-[1.02] group shadow-sm flex flex-col justify-between"
                >
                  <div className="h-10 w-10 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-400 group-hover:bg-rose-600 group-hover:text-white transition-colors mb-3">
                    <FileText className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="text-xs font-semibold text-zinc-100 group-hover:text-rose-400 transition-colors">Document Studio</h3>
                    <p className="text-[10px] text-zinc-500 mt-0.5">Gabung & olah PDF</p>
                  </div>
                </div>

                <div
                  onClick={() => setActiveTab("gdrive")}
                  className="bg-zinc-900/60 hover:bg-zinc-900 border border-zinc-800/80 hover:border-teal-500/50 rounded-2xl p-4 cursor-pointer transition-all hover:scale-[1.02] group shadow-sm flex flex-col justify-between"
                >
                  <div className="h-10 w-10 rounded-xl bg-teal-500/10 border border-teal-500/20 flex items-center justify-center text-teal-400 group-hover:bg-teal-600 group-hover:text-white transition-colors mb-3">
                    <Cloud className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="text-xs font-semibold text-zinc-100 group-hover:text-teal-400 transition-colors">Google Drive</h3>
                    <p className="text-[10px] text-zinc-500 mt-0.5">Integrasi cloud storage</p>
                  </div>
                </div>

                <div
                  onClick={() => setActiveTab("shares")}
                  className="bg-zinc-900/60 hover:bg-zinc-900 border border-zinc-800/80 hover:border-cyan-500/50 rounded-2xl p-4 cursor-pointer transition-all hover:scale-[1.02] group shadow-sm flex flex-col justify-between"
                >
                  <div className="h-10 w-10 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400 group-hover:bg-cyan-600 group-hover:text-white transition-colors mb-3">
                    <Users className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="text-xs font-semibold text-zinc-100 group-hover:text-cyan-400 transition-colors">Family Space</h3>
                    <p className="text-[10px] text-zinc-500 mt-0.5">Berbagi & kuota aman</p>
                  </div>
                </div>
              </div>

              {/* 3. Middle Bento Row: Memories & Quick Actions */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                {/* Memories Section (7 Cols) */}
                <div className="lg:col-span-7 bg-zinc-900/60 border border-zinc-800/80 rounded-2xl p-5 space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className="text-sm font-semibold text-zinc-100">Kenangan Anda (Your Memories)</h2>
                      <p className="text-[11px] text-zinc-400">Momen foto dan media yang Anda simpan di perangkat</p>
                    </div>
                    <button
                      onClick={() => setActiveTab("gallery")}
                      className="text-xs text-blue-400 hover:text-blue-300 font-medium flex items-center gap-1 cursor-pointer"
                    >
                      <span>Lihat Semua</span>
                      <ArrowRight className="h-3 w-3" />
                    </button>
                  </div>

                  {activeItems.filter((i) => i.type === "image" || i.type === "video").length === 0 ? (
                    <div
                      onClick={() => fileInputRef.current?.click()}
                      className="text-center py-10 border-2 border-dashed border-zinc-800 hover:border-blue-500/50 rounded-xl bg-zinc-950/40 cursor-pointer transition-colors"
                    >
                      <ImageIcon className="h-10 w-10 text-zinc-600 mx-auto mb-2" />
                      <p className="text-xs font-semibold text-zinc-300">Belum Ada Foto Kenangan</p>
                      <p className="text-[11px] text-zinc-500 mt-0.5">Klik di sini untuk mengunggah foto pertama Anda ke album pribadi.</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                      {localItems
                        .filter((i) => i.type === "image" || i.type === "video")
                        .slice(0, 4)
                        .map((media) => (
                          <div
                            key={media.id}
                            onClick={() => setSelectedMedia(media)}
                            className="group relative aspect-square rounded-xl overflow-hidden bg-zinc-950 border border-zinc-800 cursor-pointer hover:border-blue-500/50 transition-all"
                          >
                            {media.blob && media.type === "image" ? (
                              <img
                                src={URL.createObjectURL(media.blob)}
                                alt={media.name}
                                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                              />
                            ) : (
                              <div className="w-full h-full flex flex-col items-center justify-center p-2 text-center">
                                {media.type === "video" ? (
                                  <Play className="h-6 w-6 text-blue-400 mb-1" />
                                ) : (
                                  <ImageIcon className="h-6 w-6 text-purple-400 mb-1" />
                                )}
                                <span className="text-[10px] text-zinc-400 truncate max-w-full">{media.name}</span>
                              </div>
                            )}
                            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-2">
                              <span className="text-[10px] text-white font-medium truncate">{media.name}</span>
                            </div>
                          </div>
                        ))}
                    </div>
                  )}
                </div>

                {/* Quick Actions (5 Cols) */}
                <div className="lg:col-span-5 bg-zinc-900/60 border border-zinc-800/80 rounded-2xl p-5 space-y-4">
                  <div>
                    <h2 className="text-sm font-semibold text-zinc-100">Aksi Cepat (Quick Actions)</h2>
                    <p className="text-[11px] text-zinc-400">Pintasan alat pemrosesan instan client-side</p>
                  </div>

                  <div className="grid grid-cols-2 gap-2.5">
                    <button
                      onClick={() => { setActiveTab("studio"); setActiveStudioTool("idphoto"); }}
                      className="p-3 rounded-xl bg-zinc-950/60 hover:bg-zinc-800/80 border border-zinc-800/80 hover:border-rose-500/40 text-left transition-all cursor-pointer group"
                    >
                      <Scissors className="h-4 w-4 text-rose-400 mb-1.5 group-hover:scale-110 transition-transform" />
                      <p className="text-xs font-semibold text-zinc-200">Pasfoto 3x4 / 4x6</p>
                      <p className="text-[10px] text-zinc-500">Standar resmi 300 DPI</p>
                    </button>

                    <button
                      onClick={() => { setActiveTab("studio"); setActiveStudioTool("compress"); }}
                      className="p-3 rounded-xl bg-zinc-950/60 hover:bg-zinc-800/80 border border-zinc-800/80 hover:border-emerald-500/40 text-left transition-all cursor-pointer group"
                    >
                      <Sparkles className="h-4 w-4 text-emerald-400 mb-1.5 group-hover:scale-110 transition-transform" />
                      <p className="text-xs font-semibold text-zinc-200">Kompres Gambar</p>
                      <p className="text-[10px] text-zinc-500">Hemat ruang disk</p>
                    </button>

                    <button
                      onClick={() => { setActiveTab("studio"); setActiveStudioTool("img2pdf"); }}
                      className="p-3 rounded-xl bg-zinc-950/60 hover:bg-zinc-800/80 border border-zinc-800/80 hover:border-blue-500/40 text-left transition-all cursor-pointer group"
                    >
                      <Layers className="h-4 w-4 text-blue-400 mb-1.5 group-hover:scale-110 transition-transform" />
                      <p className="text-xs font-semibold text-zinc-200">Foto ke PDF</p>
                      <p className="text-[10px] text-zinc-500">Kompilasi jadi 1 berkas</p>
                    </button>

                    <button
                      onClick={() => { setActiveTab("studio"); setActiveStudioTool("mergepdf"); }}
                      className="p-3 rounded-xl bg-zinc-950/60 hover:bg-zinc-800/80 border border-zinc-800/80 hover:border-indigo-500/40 text-left transition-all cursor-pointer group"
                    >
                      <FileText className="h-4 w-4 text-indigo-400 mb-1.5 group-hover:scale-110 transition-transform" />
                      <p className="text-xs font-semibold text-zinc-200">Gabung PDF</p>
                      <p className="text-[10px] text-zinc-500">Merge berkas dokumen</p>
                    </button>

                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="p-3 rounded-xl bg-zinc-950/60 hover:bg-zinc-800/80 border border-zinc-800/80 hover:border-amber-500/40 text-left transition-all cursor-pointer group"
                    >
                      <Upload className="h-4 w-4 text-amber-400 mb-1.5 group-hover:scale-110 transition-transform" />
                      <p className="text-xs font-semibold text-zinc-200">Upload Berkas</p>
                      <p className="text-[10px] text-zinc-500">Simpan ke device / NAS</p>
                    </button>

                    <button
                      onClick={async () => {
                        await handleCreateFolder();
                        setActiveTab("files");
                      }}
                      className="p-3 rounded-xl bg-zinc-950/60 hover:bg-zinc-800/80 border border-zinc-800/80 hover:border-teal-500/40 text-left transition-all cursor-pointer group"
                    >
                      <Plus className="h-4 w-4 text-teal-400 mb-1.5 group-hover:scale-110 transition-transform" />
                      <p className="text-xs font-semibold text-zinc-200">Folder Baru</p>
                      <p className="text-[10px] text-zinc-500">Buat direktori baru</p>
                    </button>
                  </div>
                </div>
              </div>

              {/* 4. Bottom Bento Row: Recent Files (4 Cols) + Storage Overview (4 Cols) + Family/System Feed (4 Cols) */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Col 1: Recent Files */}
                <div className="bg-zinc-900/60 border border-zinc-800/80 rounded-2xl p-5 flex flex-col justify-between space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-semibold text-zinc-200 uppercase tracking-wider">Berkas Terbaru</h3>
                    <button
                      onClick={() => setActiveTab("files")}
                      className="text-[11px] text-blue-400 hover:text-blue-300 font-medium cursor-pointer"
                    >
                      Lihat Semua →
                    </button>
                  </div>

                  {activeItems.filter((i) => i.type !== "folder").length === 0 ? (
                    <div className="text-center py-8">
                      <FileText className="h-8 w-8 text-zinc-600 mx-auto mb-2" />
                      <p className="text-xs text-zinc-400">Belum ada berkas tersimpan</p>
                      <button
                        onClick={() => fileInputRef.current?.click()}
                        className="mt-2 text-[11px] text-blue-400 hover:underline cursor-pointer font-medium"
                      >
                        + Upload berkas sekarang
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-2.5">
                      {localItems
                        .filter((i) => i.type !== "folder")
                        .slice(0, 4)
                        .map((file) => (
                          <div
                            key={file.id}
                            className="flex items-center justify-between p-2 rounded-xl bg-zinc-950/60 border border-zinc-800/60 hover:border-zinc-700 transition-colors"
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              <div className="h-8 w-8 rounded-lg bg-zinc-800 flex items-center justify-center shrink-0">
                                {file.type === "document" && <FileText className="h-4 w-4 text-blue-400" />}
                                {file.type === "video" && <Film className="h-4 w-4 text-emerald-400" />}
                                {file.type === "image" && <ImageIcon className="h-4 w-4 text-purple-400" />}
                                {file.type === "archive" && <FileArchive className="h-4 w-4 text-amber-400" />}
                              </div>
                              <div className="truncate">
                                <p className="text-xs font-medium text-zinc-200 truncate">{file.name}</p>
                                <p className="text-[10px] text-zinc-500">{file.sizeStr} • {file.updatedAt}</p>
                              </div>
                            </div>
                            <button
                              onClick={() => handleDownload(file)}
                              className="text-zinc-500 hover:text-white p-1 cursor-pointer"
                              title="Download"
                            >
                              <Download className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        ))}
                    </div>
                  )}

                  <div className="pt-2 border-t border-zinc-800/60 text-[10px] text-zinc-500 flex items-center justify-between">
                    <span>Total Berkas: {activeItems.filter((i) => i.type !== "folder").length} item</span>
                    <span className="text-emerald-400 flex items-center gap-1 font-mono">
                      <ShieldCheck className="h-3 w-3" /> SHA-256 Integritas
                    </span>
                  </div>
                </div>

                {/* Col 2: Storage Overview Donut */}
                <div className="bg-zinc-900/60 border border-zinc-800/80 rounded-2xl p-5 flex flex-col justify-between space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-semibold text-zinc-200 uppercase tracking-wider">Ringkasan Penyimpanan</h3>
                    <span className="text-[10px] font-mono text-zinc-400">IndexedDB Client</span>
                  </div>

                  <div className="flex items-center justify-center py-2">
                    <div className="relative h-28 w-28 flex items-center justify-center">
                      <svg className="w-full h-full transform -rotate-90" viewBox="0 0 36 36">
                        <path
                          className="text-zinc-800"
                          strokeWidth="3.5"
                          stroke="currentColor"
                          fill="none"
                          d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                        />
                        <path
                          className="text-blue-500 transition-all duration-500"
                          strokeDasharray={`${Math.min(100, Math.max(activeItems.length > 0 ? 8 : 0, Math.round((activeItems.reduce((acc, curr) => acc + (curr.sizeBytes || 0), 0) / (10 * 1024 * 1024 * 1024)) * 100)))}, 100`}
                          strokeWidth="3.5"
                          strokeLinecap="round"
                          stroke="currentColor"
                          fill="none"
                          d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                        />
                      </svg>
                      <div className="absolute flex flex-col items-center justify-center text-center">
                        <span className="text-sm font-bold font-mono text-zinc-100">
                          {formatBytes(activeItems.reduce((acc, curr) => acc + (curr.sizeBytes || 0), 0))}
                        </span>
                        <span className="text-[9px] text-zinc-500">Terpakai</span>
                      </div>
                    </div>
                  </div>

                  {/* Storage Breakdown Legend */}
                  <div className="space-y-1.5 text-[11px]">
                    <div className="flex items-center justify-between">
                      <span className="text-zinc-400 flex items-center gap-1.5">
                        <span className="h-2 w-2 rounded-full bg-purple-500" /> Foto & Media
                      </span>
                      <span className="font-mono text-zinc-300">
                        {activeItems.filter((i) => i.type === "image").length} file
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-zinc-400 flex items-center gap-1.5">
                        <span className="h-2 w-2 rounded-full bg-blue-500" /> Dokumen & PDF
                      </span>
                      <span className="font-mono text-zinc-300">
                        {activeItems.filter((i) => i.type === "document").length} file
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-zinc-400 flex items-center gap-1.5">
                        <span className="h-2 w-2 rounded-full bg-emerald-500" /> Video Rekaman
                      </span>
                      <span className="font-mono text-zinc-300">
                        {activeItems.filter((i) => i.type === "video").length} file
                      </span>
                    </div>
                  </div>

                  <button
                    onClick={() => setActiveTab("files")}
                    className="w-full text-center text-xs text-blue-400 hover:text-blue-300 pt-2 border-t border-zinc-800/60 font-medium cursor-pointer"
                  >
                    Kelola Penyimpanan →
                  </button>
                </div>

                {/* Col 3: System Status & Activity Feed */}
                <div className="bg-zinc-900/60 border border-zinc-800/80 rounded-2xl p-5 flex flex-col justify-between space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-semibold text-zinc-200 uppercase tracking-wider">Status & Aktivitas</h3>
                    <span className="text-[10px] text-emerald-400 font-mono">Live Telemetry</span>
                  </div>

                  <div className="space-y-3 text-xs">
                    <div className="flex items-start gap-2.5 p-2 rounded-xl bg-zinc-950/60 border border-zinc-800/60">
                      <div className="h-7 w-7 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-400 shrink-0">
                        <Wifi className="h-3.5 w-3.5" />
                      </div>
                      <div>
                        <p className="font-medium text-zinc-200 text-xs">
                          {connectionMode === "nas" ? (nasStatus === "online" ? `NAS Backend Aktif (${nasLatency ?? 0}ms)` : "NAS Server Terputus") : "Mode Mandiri (Offline)"}
                        </p>
                        <p className="text-[10px] text-zinc-500">
                          {connectionMode === "nas" ? `Endpoint: ${serverUrl}` : "Data tersimpan di memori perangkat"}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-start gap-2.5 p-2 rounded-xl bg-zinc-950/60 border border-zinc-800/60">
                      <div className="h-7 w-7 rounded-lg bg-blue-500/10 flex items-center justify-center text-blue-400 shrink-0">
                        <Wand2 className="h-3.5 w-3.5" />
                      </div>
                      <div>
                        <p className="font-medium text-zinc-200 text-xs">Studio WASM Siap Digunakan</p>
                        <p className="text-[10px] text-zinc-500">Pasfoto, kompresi, dan merge PDF di browser</p>
                      </div>
                    </div>

                    <div className="flex items-start gap-2.5 p-2 rounded-xl bg-zinc-950/60 border border-zinc-800/60">
                      <div className="h-7 w-7 rounded-lg bg-teal-500/10 flex items-center justify-center text-teal-400 shrink-0">
                        <Cloud className="h-3.5 w-3.5" />
                      </div>
                      <div>
                        <p className="font-medium text-zinc-200 text-xs">
                          {isGdriveConnected ? "Google Drive Pro Terhubung" : "Google Drive Siap Dihubungkan"}
                        </p>
                        <p className="text-[10px] text-zinc-500">
                          {isGdriveConnected ? "Cadangan offsite 3-2-1 aktif" : "Koneksi cloud opsional"}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="pt-2 border-t border-zinc-800/60 text-[10px] text-zinc-500 flex items-center justify-between">
                    <span>Platform: PWA Next.js 16</span>
                    <button onClick={() => setServerModalOpen(true)} className="text-zinc-400 hover:text-white underline cursor-pointer">
                      Detail Server
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 1: FILE EXPLORER */}
          {activeTab === "files" && (
            <div className="space-y-6">
              {/* Storage Source Switcher & Stats */}
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-center p-1 bg-zinc-900 border border-zinc-800 rounded-lg w-fit text-xs">
                  <button
                    onClick={() => setStorageFilter("local")}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-md font-medium transition-all cursor-pointer ${
                      storageFilter === "local"
                        ? "bg-zinc-800 text-white shadow-sm"
                        : "text-zinc-400 hover:text-zinc-200"
                    }`}
                  >
                    <HardDrive className="h-3.5 w-3.5 text-blue-400" />
                    <span>Lokal Device (IndexedDB)</span>
                  </button>
                  <button
                    onClick={() => setStorageFilter("gdrive")}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-md font-medium transition-all cursor-pointer ${
                      storageFilter === "gdrive"
                        ? "bg-zinc-800 text-white shadow-sm"
                        : "text-zinc-400 hover:text-zinc-200"
                    }`}
                  >
                    <Cloud className="h-3.5 w-3.5 text-emerald-400" />
                    <span>Google Drive</span>
                    {!isGdriveConnected && (
                      <span className="text-[10px] bg-amber-500/20 text-amber-300 px-1 rounded">off</span>
                    )}
                  </button>
                </div>

                <div className="flex items-center gap-1 bg-zinc-900 border border-zinc-800 p-1 rounded-lg">
                  <button
                    onClick={() => setViewMode("grid")}
                    className={`p-1.5 rounded cursor-pointer ${
                      viewMode === "grid" ? "bg-zinc-800 text-white" : "text-zinc-400"
                    }`}
                    title="Grid View"
                  >
                    <Grid className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => setViewMode("list")}
                    className={`p-1.5 rounded cursor-pointer ${
                      viewMode === "list" ? "bg-zinc-800 text-white" : "text-zinc-400"
                    }`}
                    title="List View"
                  >
                    <List className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              {/* Breadcrumbs Navigation Bar */}
              <div className="bg-zinc-900/60 border border-zinc-800/80 rounded-xl px-4 py-2.5 flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs flex-wrap">
                  {currentFolderId && (
                    <button
                      onClick={handleGoBackFolder}
                      className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 transition-colors mr-1 cursor-pointer font-medium"
                      title="Kembali ke folder sebelumnya"
                    >
                      <ArrowLeft className="h-3.5 w-3.5" />
                      <span>Kembali</span>
                    </button>
                  )}

                  <div className="flex items-center gap-1.5">
                    {folderBreadcrumbs.map((crumb, idx) => {
                      const isLast = idx === folderBreadcrumbs.length - 1;
                      return (
                        <React.Fragment key={idx}>
                          {idx > 0 && <ChevronRight className="h-3.5 w-3.5 text-zinc-600 shrink-0" />}
                          <button
                            onClick={() => handleNavigateBreadcrumb(crumb.id, idx)}
                            className={`transition-colors cursor-pointer ${
                              isLast
                                ? "text-blue-400 font-semibold cursor-default pointer-events-none"
                                : "text-zinc-400 hover:text-zinc-200 hover:underline"
                            }`}
                          >
                            {crumb.name}
                          </button>
                        </React.Fragment>
                      );
                    })}
                  </div>
                </div>

                <span className="text-[11px] text-zinc-500 font-mono hidden sm:inline">
                  {filteredFiles.filter((f) => (f.parentId || null) === currentFolderId).length} item di direktori ini
                </span>
              </div>

              {/* Status pemuatan dari server NAS */}
              {connectionMode === "nas" && (nasFilesLoading || nasFilesError) && (
                <div
                  className={`rounded-xl px-4 py-2.5 text-xs flex items-center gap-2 ${
                    nasFilesError
                      ? "bg-rose-950/50 border border-rose-800/60 text-rose-300"
                      : "bg-zinc-900/60 border border-zinc-800/80 text-zinc-400"
                  }`}
                >
                  {nasFilesError ? (
                    <>
                      <WifiOff className="h-3.5 w-3.5 shrink-0" />
                      <span>Gagal memuat dari server: {nasFilesError}</span>
                      <button
                        onClick={() => loadNasFiles(currentFolderId)}
                        className="ml-auto underline hover:text-white cursor-pointer shrink-0"
                      >
                        Coba lagi
                      </button>
                    </>
                  ) : (
                    <>
                      <RefreshCw className="h-3.5 w-3.5 animate-spin shrink-0" />
                      <span>Memuat isi folder dari server...</span>
                    </>
                  )}
                </div>
              )}

              {/* Folders Section in Current Directory */}
              {(() => {
                const currentFolderItems = filteredFiles.filter((f) => (f.parentId || null) === currentFolderId);
                const currentFolders = currentFolderItems.filter((f) => f.type === "folder");
                const currentFiles = currentFolderItems.filter((f) => f.type !== "folder");

                return (
                  <>
                    {currentFolders.length > 0 && (
                      <div className="space-y-3">
                        <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                          Folder ({currentFolders.length})
                        </h2>
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                          {currentFolders.map((folder) => {
                            const childCount = activeItems.filter((i) => (i.parentId || null) === folder.id).length;
                            return (
                              <div
                                key={folder.id}
                                onClick={() => handleOpenFolder(folder)}
                                className="bg-zinc-900/40 hover:bg-zinc-900 border border-zinc-800/80 hover:border-blue-500/50 rounded-xl p-3.5 flex items-center justify-between cursor-pointer transition-all group shadow-sm hover:scale-[1.01]"
                              >
                                <div className="flex items-center gap-3 min-w-0">
                                  <div className="h-9 w-9 rounded-lg bg-blue-500/10 flex items-center justify-center text-blue-400 shrink-0 group-hover:bg-blue-600 group-hover:text-white transition-colors">
                                    <Folder className="h-5 w-5 fill-current" />
                                  </div>
                                  <div className="truncate">
                                    <p className="text-xs font-medium text-zinc-200 group-hover:text-blue-400 transition-colors truncate">
                                      {folder.name}
                                    </p>
                                    <p className="text-[11px] text-zinc-500">
                                      {isForeignItem(folder)
                                        ? "Milik anggota lain • Klik untuk buka"
                                        : connectionMode === "nas"
                                        ? "Klik untuk buka"
                                        : `${childCount} item • Klik untuk buka`}
                                    </p>
                                  </div>
                                </div>
                                <div className="flex items-center gap-0.5">
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleRename(folder);
                                    }}
                                    className="text-zinc-600 hover:text-blue-400 p-1 cursor-pointer"
                                    title="Ganti Nama Folder"
                                  >
                                    <Pencil className="h-3.5 w-3.5" />
                                  </button>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      openMoveModal(folder);
                                    }}
                                    className="text-zinc-600 hover:text-amber-400 p-1 cursor-pointer"
                                    title="Pindahkan Folder"
                                  >
                                    <FolderInput className="h-3.5 w-3.5" />
                                  </button>
                                  <button
                                    onClick={(e) => handleDelete(folder.id, e)}
                                    className="text-zinc-600 hover:text-rose-400 p-1 cursor-pointer"
                                    title="Hapus Folder"
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Files Section in Current Directory */}
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                          File ({currentFiles.length})
                        </h2>
                        <span className="text-[11px] text-zinc-500">
                          {connectionMode === "nas" ? "Tersimpan di server NAS" : "Tersimpan lokal & aman di browser"}
                        </span>
                      </div>

                      {currentFiles.length === 0 && currentFolders.length === 0 ? (
                        <div className="text-center py-12 border-2 border-dashed border-zinc-800/80 rounded-2xl bg-zinc-900/20">
                          <Folder className="h-12 w-12 text-zinc-600 mx-auto mb-3" />
                          <p className="text-sm font-semibold text-zinc-300">Folder ini masih kosong</p>
                          <p className="text-xs text-zinc-500 mt-1">
                            Gunakan tombol <strong>"Upload File Asli"</strong> atau <strong>"Folder Baru"</strong> di kanan atas untuk mengisi direktori ini.
                          </p>
                        </div>
                      ) : viewMode === "grid" ? (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                          {currentFiles.map((file) => (
                            <div
                              key={file.id}
                              className="bg-zinc-900/40 border border-zinc-800/80 rounded-xl p-4 flex flex-col justify-between hover:border-zinc-700 hover:bg-zinc-900/80 transition-all group"
                            >
                              <div className="flex items-start justify-between">
                                <div className="h-10 w-10 rounded-lg bg-zinc-800 flex items-center justify-center">
                                  {file.type === "document" && <FileText className="h-5 w-5 text-blue-400" />}
                                  {file.type === "video" && <Film className="h-5 w-5 text-emerald-400" />}
                                  {file.type === "image" && <ImageIcon className="h-5 w-5 text-purple-400" />}
                                  {file.type === "archive" && <FileArchive className="h-5 w-5 text-amber-400" />}
                                </div>

                                <div className="flex items-center gap-1">
                                  <button
                                    onClick={(e) => handleFav(file.id, e)}
                                    className={`p-1 cursor-pointer transition-colors ${
                                      file.isFavorite ? "text-rose-500 fill-rose-500" : "text-zinc-500 hover:text-rose-400"
                                    }`}
                                    title="Favorit"
                                  >
                                    <Heart className={`h-3.5 w-3.5 ${file.isFavorite ? "fill-rose-500" : ""}`} />
                                  </button>
                                  {!isForeignItem(file) && (
                                    <button
                                      onClick={() => {
                                        setShareModalFile(file);
                                        setShareLinkGenerated(false);
                                        setCurrentGeneratedUrl("");
                                        setSharePasswordInput("");
                                      }}
                                      className="text-zinc-500 hover:text-blue-400 p-1 cursor-pointer"
                                      title="Bagikan Link"
                                    >
                                      <Share2 className="h-3.5 w-3.5" />
                                    </button>
                                  )}
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleRename(file);
                                    }}
                                    className="text-zinc-500 hover:text-blue-400 p-1 cursor-pointer"
                                    title="Ganti Nama"
                                  >
                                    <Pencil className="h-3.5 w-3.5" />
                                  </button>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      openMoveModal(file);
                                    }}
                                    className="text-zinc-500 hover:text-amber-400 p-1 cursor-pointer"
                                    title="Pindahkan ke Folder"
                                  >
                                    <FolderInput className="h-3.5 w-3.5" />
                                  </button>
                                  <button
                                    onClick={(e) => handleDelete(file.id, e)}
                                    className="text-zinc-500 hover:text-rose-400 p-1 cursor-pointer"
                                    title="Hapus File"
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </button>
                                </div>
                              </div>

                              <div className="mt-3">
                                <p className="text-xs font-medium text-zinc-200 line-clamp-1 group-hover:text-blue-400 transition-colors">
                                  {file.name}
                                </p>
                                {isForeignItem(file) && (
                                  <span className="inline-flex items-center gap-1 mt-1 text-[10px] px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30">
                                    <Users className="h-2.5 w-2.5" />
                                    Milik anggota lain
                                  </span>
                                )}
                                <div className="flex items-center justify-between text-[11px] text-zinc-500 mt-1">
                                  <span>{file.sizeStr}</span>
                                  <span>{file.updatedAt}</span>
                                </div>
                              </div>

                              <div className="mt-3 pt-3 border-t border-zinc-800/60 flex items-center justify-between text-[10px]">
                                <span className="font-mono text-zinc-500 flex items-center gap-1">
                                  <Shield className="h-3 w-3 text-emerald-500" /> {file.sha256 ? "SHA-256 Valid" : "Verified"}
                                </span>
                                <div className="flex items-center gap-2">
                                  <button
                                    onClick={() => setSelectedMedia(file)}
                                    className="text-zinc-400 hover:text-white cursor-pointer"
                                    title="Lihat Detail"
                                  >
                                    <Eye className="h-3.5 w-3.5" />
                                  </button>
                                  <button
                                    onClick={() => handleDownload(file)}
                                    className="text-zinc-400 hover:text-white cursor-pointer"
                                    title="Download File Asli"
                                  >
                                    <Download className="h-3.5 w-3.5" />
                                  </button>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="border border-zinc-800 rounded-xl overflow-hidden bg-zinc-900/20">
                          <table className="w-full text-left text-xs text-zinc-300">
                            <thead className="bg-zinc-900 border-b border-zinc-800 text-zinc-400">
                              <tr>
                                <th className="py-2.5 px-4 font-medium">Nama File</th>
                                <th className="py-2.5 px-4 font-medium">Ukuran</th>
                                <th className="py-2.5 px-4 font-medium">Waktu</th>
                                <th className="py-2.5 px-4 font-medium">Integritas</th>
                                <th className="py-2.5 px-4 text-right font-medium">Aksi</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-zinc-800/60">
                              {currentFiles.map((file) => (
                                <tr key={file.id} className="hover:bg-zinc-900/60 transition-colors">
                                  <td className="py-2.5 px-4 font-medium text-zinc-200 flex items-center gap-2">
                                    {file.type === "document" && <FileText className="h-4 w-4 text-blue-400" />}
                                    {file.type === "video" && <Film className="h-4 w-4 text-emerald-400" />}
                                    {file.type === "image" && <ImageIcon className="h-4 w-4 text-purple-400" />}
                                    {file.type === "archive" && <FileArchive className="h-4 w-4 text-amber-400" />}
                                    <span className="truncate max-w-xs">{file.name}</span>
                                    {isForeignItem(file) && (
                                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30 shrink-0">
                                        Milik anggota lain
                                      </span>
                                    )}
                                  </td>
                                  <td className="py-2.5 px-4 font-mono text-zinc-400">{file.sizeStr}</td>
                                  <td className="py-2.5 px-4 text-zinc-400">{file.updatedAt}</td>
                                  <td className="py-2.5 px-4 font-mono text-[11px] text-zinc-500">{file.sha256 || "Valid"}</td>
                                  <td className="py-2.5 px-4 text-right">
                                    <button
                                      onClick={(e) => handleFav(file.id, e)}
                                      className={`p-1 mr-1 cursor-pointer ${
                                        file.isFavorite ? "text-rose-500" : "text-zinc-500 hover:text-rose-400"
                                      }`}
                                    >
                                      <Heart className="h-3.5 w-3.5" />
                                    </button>
                                    <button
                                      onClick={() => handleDownload(file)}
                                      className="text-zinc-400 hover:text-white p-1 mr-1 cursor-pointer"
                                      title="Download"
                                    >
                                      <Download className="h-3.5 w-3.5" />
                                    </button>
                                    <button
                                      onClick={(e) => handleDelete(file.id, e)}
                                      className="text-zinc-500 hover:text-rose-400 p-1 cursor-pointer"
                                      title="Hapus"
                                    >
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </button>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  </>
                );
              })()}
            </div>
          )}

          {/* TAB 1b: TRASH */}
          {activeTab === "trash" && (
            <div className="space-y-5 max-w-5xl mx-auto">
              <div className="rounded-xl border border-amber-900/50 bg-amber-950/30 px-4 py-3 flex items-start gap-3">
                <Trash2 className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-amber-200">Item di Trash belum benar-benar dihapus</p>
                  <p className="text-[11px] text-amber-300/80 mt-0.5 leading-relaxed">
                    Pulihkan untuk mengembalikan item ke folder asalnya. Hapus permanen membebaskan ruang
                    penyimpanan dan tidak bisa dibatalkan.
                  </p>
                </div>
                <button
                  onClick={loadTrash}
                  disabled={trashLoading}
                  className="ml-auto shrink-0 flex items-center gap-1.5 text-[11px] px-2.5 py-1.5 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-300 hover:text-white hover:border-zinc-700 transition-colors cursor-pointer disabled:opacity-50"
                >
                  <RefreshCw className={`h-3 w-3 ${trashLoading ? "animate-spin" : ""}`} />
                  <span>Muat ulang</span>
                </button>
              </div>

              {trashError && (
                <div className="rounded-xl px-4 py-2.5 text-xs flex items-center gap-2 bg-rose-950/50 border border-rose-800/60 text-rose-300">
                  <WifiOff className="h-3.5 w-3.5 shrink-0" />
                  <span>Gagal memuat trash: {trashError}</span>
                </div>
              )}

              {trashItems.length === 0 ? (
                <div className="text-center py-16 border-2 border-dashed border-zinc-800/80 rounded-2xl bg-zinc-900/20">
                  <Trash2 className="h-12 w-12 text-zinc-600 mx-auto mb-3" />
                  <p className="text-sm font-semibold text-zinc-300">Trash kosong</p>
                  <p className="text-xs text-zinc-500 mt-1">
                    Item yang kamu hapus dari file manager akan muncul di sini dan bisa dipulihkan.
                  </p>
                </div>
              ) : (
                <div className="border border-zinc-800 rounded-xl overflow-hidden bg-zinc-900/20">
                  <table className="w-full text-left text-xs text-zinc-300">
                    <thead className="bg-zinc-900 border-b border-zinc-800 text-zinc-400">
                      <tr>
                        <th className="py-2.5 px-4 font-medium">Nama</th>
                        <th className="py-2.5 px-4 font-medium">Lokasi Asal</th>
                        <th className="py-2.5 px-4 font-medium">Ukuran</th>
                        <th className="py-2.5 px-4 font-medium">Dihapus</th>
                        <th className="py-2.5 px-4 text-right font-medium">Aksi</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-800/60">
                      {trashItems.map((node) => {
                        const mime = (node.MimeType || "").toLowerCase();
                        const busy = trashBusyId === node.ID;
                        return (
                          <tr key={node.ID} className="hover:bg-zinc-900/60 transition-colors">
                            <td className="py-2.5 px-4 font-medium text-zinc-200">
                              <div className="flex items-center gap-2 min-w-0">
                                {node.IsDirectory ? (
                                  <Folder className="h-4 w-4 text-blue-400 shrink-0" />
                                ) : mime.startsWith("image/") ? (
                                  <ImageIcon className="h-4 w-4 text-purple-400 shrink-0" />
                                ) : mime.startsWith("video/") || mime.startsWith("audio/") ? (
                                  <Film className="h-4 w-4 text-emerald-400 shrink-0" />
                                ) : (
                                  <FileText className="h-4 w-4 text-zinc-400 shrink-0" />
                                )}
                                <span className="truncate max-w-[18rem]" title={node.Name}>
                                  {node.Name}
                                </span>
                                {currentUser && node.OwnerID !== currentUser.id && (
                                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30 shrink-0">
                                    Milik anggota lain
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="py-2.5 px-4 text-zinc-400">
                              {node.ParentName || "Semua File"}
                            </td>
                            <td className="py-2.5 px-4 font-mono text-zinc-400">
                              {node.IsDirectory ? "Folder" : formatBytes(node.SizeBytes ?? 0)}
                            </td>
                            <td className="py-2.5 px-4 text-zinc-400">
                              {node.DeletedAt
                                ? new Date(node.DeletedAt).toLocaleString("id-ID", {
                                    day: "numeric",
                                    month: "short",
                                    year: "numeric",
                                    hour: "2-digit",
                                    minute: "2-digit",
                                  })
                                : "—"}
                            </td>
                            <td className="py-2.5 px-4">
                              <div className="flex items-center justify-end gap-2">
                                <button
                                  onClick={() => handleRestoreTrash(node)}
                                  disabled={busy}
                                  className="flex items-center gap-1 px-2 py-1 rounded-md bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/20 transition-colors cursor-pointer disabled:opacity-40"
                                  title="Pulihkan ke folder asal"
                                >
                                  <CornerLeftUp className="h-3 w-3" />
                                  <span>Pulihkan</span>
                                </button>
                                <button
                                  onClick={() => handlePurgeTrash(node)}
                                  disabled={busy}
                                  className="flex items-center gap-1 px-2 py-1 rounded-md bg-rose-500/10 border border-rose-500/30 text-rose-300 hover:bg-rose-500/20 transition-colors cursor-pointer disabled:opacity-40"
                                  title="Hapus permanen"
                                >
                                  <Trash2 className="h-3 w-3" />
                                  <span>Hapus permanen</span>
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: GALLERY VIEW */}
          {activeTab === "gallery" && (
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
                    onClick={() => setGalleryCategory("all")}
                    className={`px-3 py-1.5 rounded-md font-medium transition-colors cursor-pointer ${
                      galleryCategory === "all" ? "bg-blue-600 text-white" : "text-zinc-400 hover:text-zinc-200"
                    }`}
                  >
                    Semua
                  </button>
                  <button
                    onClick={() => setGalleryCategory("image")}
                    className={`px-3 py-1.5 rounded-md font-medium transition-colors cursor-pointer ${
                      galleryCategory === "image" ? "bg-blue-600 text-white" : "text-zinc-400 hover:text-zinc-200"
                    }`}
                  >
                    Foto
                  </button>
                  <button
                    onClick={() => setGalleryCategory("video")}
                    className={`px-3 py-1.5 rounded-md font-medium transition-colors cursor-pointer ${
                      galleryCategory === "video" ? "bg-blue-600 text-white" : "text-zinc-400 hover:text-zinc-200"
                    }`}
                  >
                    Video
                  </button>
                  <button
                    onClick={() => setGalleryCategory("favorite")}
                    className={`px-3 py-1.5 rounded-md font-medium transition-colors cursor-pointer flex items-center gap-1 ${
                      galleryCategory === "favorite" ? "bg-rose-600 text-white" : "text-zinc-400 hover:text-rose-400"
                    }`}
                  >
                    <Heart className="h-3 w-3" />
                    <span>Favorit</span>
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                {localItems
                  .filter((item) => {
                    if (galleryCategory === "all") return item.type === "image" || item.type === "video";
                    if (galleryCategory === "image") return item.type === "image";
                    if (galleryCategory === "video") return item.type === "video";
                    if (galleryCategory === "favorite") return (item.type === "image" || item.type === "video") && item.isFavorite;
                    return false;
                  })
                  .map((photo) => (
                    <div
                      key={photo.id}
                      onClick={() => setSelectedMedia(photo)}
                      className="group relative aspect-square bg-zinc-900 rounded-xl overflow-hidden cursor-pointer border border-zinc-800/80 hover:border-blue-500/50 transition-all"
                    >
                      <div className="w-full h-full bg-gradient-to-br from-zinc-800 via-zinc-900 to-zinc-950 flex flex-col items-center justify-center p-3 text-center group-hover:scale-105 transition-transform duration-300">
                        {photo.type === "video" ? (
                          <div className="h-10 w-10 rounded-full bg-blue-600/80 text-white flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform">
                            <Play className="h-5 w-5 ml-0.5" />
                          </div>
                        ) : (
                          <ImageIcon className="h-8 w-8 text-zinc-600 group-hover:text-blue-400 transition-colors" />
                        )}
                        <p className="text-[11px] text-zinc-300 font-medium mt-2 line-clamp-1">{photo.name}</p>
                        <p className="text-[10px] text-zinc-500 font-mono">{photo.sizeStr}</p>
                      </div>

                      <div className="absolute top-2 left-2 right-2 flex items-center justify-between">
                        <span className="text-[10px] bg-black/70 backdrop-blur-md px-1.5 py-0.5 rounded text-zinc-300 font-mono">
                          {photo.dimensions || photo.duration || "Media"}
                        </span>
                        {photo.isFavorite && (
                          <Heart className="h-3.5 w-3.5 fill-rose-500 text-rose-500" />
                        )}
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          )}

          {/* TAB 3: CLIENT-SIDE STUDIO TOOLS (WASM & CANVAS) */}
          {activeTab === "studio" && (
            <div className="space-y-6 max-w-4xl mx-auto">
              <div>
                <h2 className="text-lg font-semibold text-zinc-100 flex items-center gap-2">
                  <Wand2 className="h-5 w-5 text-amber-400" />
                  <span>Media & Document Studio (Client-Side WASM)</span>
                </h2>
                <p className="text-xs text-zinc-400">
                  Semua proses manipulasi PDF dan gambar berjalan 100% di browser HP/Laptop Anda tanpa perlu server atau kuota internet.
                </p>
              </div>

              {/* Tool Navigation */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <button
                  onClick={() => setActiveStudioTool("img2pdf")}
                  className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer ${
                    activeStudioTool === "img2pdf"
                      ? "border-blue-500 bg-blue-500/10 text-white"
                      : "border-zinc-800 bg-zinc-900/60 text-zinc-400 hover:border-zinc-700"
                  }`}
                >
                  <Layers className="h-5 w-5 mb-2 text-blue-400" />
                  <p className="text-xs font-semibold text-zinc-200">Foto ke PDF</p>
                  <p className="text-[10px] text-zinc-500">Gabung foto jadi 1 PDF</p>
                </button>

                <button
                  onClick={() => setActiveStudioTool("mergepdf")}
                  className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer ${
                    activeStudioTool === "mergepdf"
                      ? "border-blue-500 bg-blue-500/10 text-white"
                      : "border-zinc-800 bg-zinc-900/60 text-zinc-400 hover:border-zinc-700"
                  }`}
                >
                  <FileText className="h-5 w-5 mb-2 text-indigo-400" />
                  <p className="text-xs font-semibold text-zinc-200">Gabung PDF</p>
                  <p className="text-[10px] text-zinc-500">Merge banyak file PDF</p>
                </button>

                <button
                  onClick={() => setActiveStudioTool("idphoto")}
                  className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer ${
                    activeStudioTool === "idphoto"
                      ? "border-blue-500 bg-blue-500/10 text-white"
                      : "border-zinc-800 bg-zinc-900/60 text-zinc-400 hover:border-zinc-700"
                  }`}
                >
                  <Scissors className="h-5 w-5 mb-2 text-rose-400" />
                  <p className="text-xs font-semibold text-zinc-200">Pasfoto 3x4 / 4x6</p>
                  <p className="text-[10px] text-zinc-500">Latar merah/biru/putih</p>
                </button>

                <button
                  onClick={() => setActiveStudioTool("compress")}
                  className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer ${
                    activeStudioTool === "compress"
                      ? "border-blue-500 bg-blue-500/10 text-white"
                      : "border-zinc-800 bg-zinc-900/60 text-zinc-400 hover:border-zinc-700"
                  }`}
                >
                  <Sparkles className="h-5 w-5 mb-2 text-emerald-400" />
                  <p className="text-xs font-semibold text-zinc-200">Kompres Gambar</p>
                  <p className="text-[10px] text-zinc-500">Kecilkan ukuran file foto</p>
                </button>
              </div>

              {/* Status Message */}
              {studioSuccessMsg && (
                <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-xs text-emerald-300 flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 shrink-0" />
                  <span>{studioSuccessMsg}</span>
                </div>
              )}

              {/* Tool Workspace Panels */}
              <div className="bg-zinc-900/80 border border-zinc-800 rounded-2xl p-6">
                {/* 1. Image to PDF */}
                {activeStudioTool === "img2pdf" && (
                  <div className="space-y-4">
                    <input
                      type="file"
                      ref={studioImg2PdfRef}
                      onChange={handleImagesToPDF}
                      multiple
                      accept="image/*"
                      className="hidden"
                    />
                    <div className="text-center py-8 border-2 border-dashed border-zinc-800 rounded-xl bg-zinc-950/40 p-4">
                      <Layers className="h-10 w-10 text-blue-400 mx-auto mb-3" />
                      <p className="text-xs font-semibold text-zinc-200">Pilih Satu atau Beberapa Foto</p>
                      <p className="text-[11px] text-zinc-500 mt-1">
                        Mendukung format JPG, PNG, WEBP dari perangkat, server NAS, atau Google Drive
                      </p>
                      <div className="flex flex-wrap items-center justify-center gap-2.5 mt-4">
                        <button
                          disabled={studioProcessing}
                          onClick={() => studioImg2PdfRef.current?.click()}
                          className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs font-medium px-4 py-2.5 rounded-lg cursor-pointer transition-colors"
                        >
                          {studioProcessing ? "Memproses..." : "Pilih dari HP / Laptop"}
                        </button>
                        <button
                          disabled={studioProcessing}
                          onClick={() => handleOpenStoragePicker("img2pdf")}
                          className="bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 text-zinc-200 border border-zinc-700 text-xs font-medium px-4 py-2.5 rounded-lg cursor-pointer flex items-center gap-1.5 transition-colors"
                        >
                          <Folder className="h-3.5 w-3.5 text-blue-400" />
                          <span>Pilih dari Penyimpanan (Lokal / NAS / Cloud)</span>
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* 2. Merge PDF */}
                {activeStudioTool === "mergepdf" && (
                  <div className="space-y-4">
                    <input
                      type="file"
                      ref={studioMergePdfRef}
                      onChange={handleMergePDFs}
                      multiple
                      accept="application/pdf"
                      className="hidden"
                    />
                    <div className="text-center py-8 border-2 border-dashed border-zinc-800 rounded-xl bg-zinc-950/40 p-4">
                      <FileText className="h-10 w-10 text-indigo-400 mx-auto mb-3" />
                      <p className="text-xs font-semibold text-zinc-200">Pilih Minimal 2 File PDF</p>
                      <p className="text-[11px] text-zinc-500 mt-1">
                        Gabung berkas ijazah, formulir, atau invoice dari penyimpanan lokal, NAS, atau Google Drive
                      </p>
                      <div className="flex flex-wrap items-center justify-center gap-2.5 mt-4">
                        <button
                          disabled={studioProcessing}
                          onClick={() => studioMergePdfRef.current?.click()}
                          className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-medium px-4 py-2.5 rounded-lg cursor-pointer transition-colors"
                        >
                          {studioProcessing ? "Memproses..." : "Pilih dari HP / Laptop"}
                        </button>
                        <button
                          disabled={studioProcessing}
                          onClick={() => handleOpenStoragePicker("mergepdf")}
                          className="bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 text-zinc-200 border border-zinc-700 text-xs font-medium px-4 py-2.5 rounded-lg cursor-pointer flex items-center gap-1.5 transition-colors"
                        >
                          <Folder className="h-3.5 w-3.5 text-indigo-400" />
                          <span>Pilih dari Penyimpanan (Lokal / NAS / Cloud)</span>
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* 3. Pasfoto 3x4 / 4x6 */}
                {activeStudioTool === "idphoto" && (
                  <div className="space-y-4">
                    <input
                      type="file"
                      ref={studioIdPhotoRef}
                      onChange={handleCreateIDPhoto}
                      accept="image/*"
                      className="hidden"
                    />
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                      <div>
                        <label className="text-xs font-medium text-zinc-300 block mb-1.5">Ukuran Pasfoto</label>
                        <div className="flex gap-2">
                          <button
                            onClick={() => setIdPhotoRatio("3x4")}
                            className={`flex-1 py-2 text-xs rounded-lg font-medium border cursor-pointer ${
                              idPhotoRatio === "3x4"
                                ? "bg-blue-600 text-white border-blue-500"
                                : "bg-zinc-800 text-zinc-400 border-zinc-700"
                            }`}
                          >
                            3 × 4 cm (354×472 px)
                          </button>
                          <button
                            onClick={() => setIdPhotoRatio("4x6")}
                            className={`flex-1 py-2 text-xs rounded-lg font-medium border cursor-pointer ${
                              idPhotoRatio === "4x6"
                                ? "bg-blue-600 text-white border-blue-500"
                                : "bg-zinc-800 text-zinc-400 border-zinc-700"
                            }`}
                          >
                            4 × 6 cm (472×709 px)
                          </button>
                        </div>
                      </div>

                      <div>
                        <label className="text-xs font-medium text-zinc-300 block mb-1.5">Warna Latar Belakang</label>
                        <div className="flex gap-2">
                          <button
                            onClick={() => setIdPhotoBg("#dc2626")}
                            className={`flex-1 py-2 text-xs rounded-lg font-medium border flex items-center justify-center gap-1.5 cursor-pointer ${
                              idPhotoBg === "#dc2626" ? "border-white ring-1 ring-white" : "border-zinc-700"
                            }`}
                            style={{ backgroundColor: "#dc2626" }}
                          >
                            <span className="text-white drop-shadow">Merah</span>
                          </button>
                          <button
                            onClick={() => setIdPhotoBg("#2563eb")}
                            className={`flex-1 py-2 text-xs rounded-lg font-medium border flex items-center justify-center gap-1.5 cursor-pointer ${
                              idPhotoBg === "#2563eb" ? "border-white ring-1 ring-white" : "border-zinc-700"
                            }`}
                            style={{ backgroundColor: "#2563eb" }}
                          >
                            <span className="text-white drop-shadow">Biru</span>
                          </button>
                          <button
                            onClick={() => setIdPhotoBg("#ffffff")}
                            className={`flex-1 py-2 text-xs rounded-lg font-medium border flex items-center justify-center gap-1.5 cursor-pointer ${
                              idPhotoBg === "#ffffff" ? "border-blue-500 ring-1 ring-blue-500" : "border-zinc-700"
                            }`}
                            style={{ backgroundColor: "#ffffff" }}
                          >
                            <span className="text-zinc-900 font-semibold">Putih</span>
                          </button>
                        </div>
                      </div>
                    </div>

                    <div className="text-center py-6 border-2 border-dashed border-zinc-800 rounded-xl bg-zinc-950/40 p-4">
                      <Scissors className="h-8 w-8 text-rose-400 mx-auto mb-2" />
                      <p className="text-xs font-semibold text-zinc-200">Pilih Foto untuk Pasfoto</p>
                      <p className="text-[11px] text-zinc-500 mt-0.5">Otomatis dipotong & disesuaikan ke resolusi 300 DPI standar resmi</p>
                      <div className="flex flex-wrap items-center justify-center gap-2.5 mt-3">
                        <button
                          disabled={studioProcessing}
                          onClick={() => studioIdPhotoRef.current?.click()}
                          className="bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white text-xs font-medium px-4 py-2 rounded-lg cursor-pointer transition-colors"
                        >
                          {studioProcessing ? "Memproses..." : "Pilih dari HP / Laptop"}
                        </button>
                        <button
                          disabled={studioProcessing}
                          onClick={() => handleOpenStoragePicker("idphoto")}
                          className="bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 text-zinc-200 border border-zinc-700 text-xs font-medium px-4 py-2 rounded-lg cursor-pointer flex items-center gap-1.5 transition-colors"
                        >
                          <Folder className="h-3.5 w-3.5 text-rose-400" />
                          <span>Pilih dari Penyimpanan (Lokal / NAS)</span>
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* 4. Compress Image */}
                {activeStudioTool === "compress" && (
                  <div className="space-y-4">
                    <input
                      type="file"
                      ref={studioCompressRef}
                      onChange={handleCompressImage}
                      accept="image/*"
                      className="hidden"
                    />

                    <div>
                      <div className="flex justify-between text-xs text-zinc-300 mb-2">
                        <span>Target Kualitas Kompresi</span>
                        <span className="font-mono font-semibold text-emerald-400">{Math.round(compressQuality * 100)}%</span>
                      </div>
                      <input
                        type="range"
                        min="0.3"
                        max="0.95"
                        step="0.05"
                        value={compressQuality}
                        onChange={(e) => setCompressQuality(parseFloat(e.target.value))}
                        className="w-full h-2 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-emerald-500"
                      />
                      <div className="flex justify-between text-[10px] text-zinc-500 mt-1">
                        <span>Ukuran Lebih Kecil (Hemat Ruang)</span>
                        <span>Kualitas Lebih Tinggi (Lebih Tajam)</span>
                      </div>
                    </div>

                    <div className="text-center py-6 border-2 border-dashed border-zinc-800 rounded-xl bg-zinc-950/40 p-4">
                      <Sparkles className="h-8 w-8 text-emerald-400 mx-auto mb-2" />
                      <p className="text-xs font-semibold text-zinc-200">Pilih Foto yang Ingin Dikompresi</p>
                      <div className="flex flex-wrap items-center justify-center gap-2.5 mt-3">
                        <button
                          disabled={studioProcessing}
                          onClick={() => studioCompressRef.current?.click()}
                          className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-medium px-4 py-2 rounded-lg cursor-pointer transition-colors"
                        >
                          {studioProcessing ? "Sedang Mengompresi..." : "Pilih dari HP / Laptop"}
                        </button>
                        <button
                          disabled={studioProcessing}
                          onClick={() => handleOpenStoragePicker("compress")}
                          className="bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 text-zinc-200 border border-zinc-700 text-xs font-medium px-4 py-2 rounded-lg cursor-pointer flex items-center gap-1.5 transition-colors"
                        >
                          <Folder className="h-3.5 w-3.5 text-emerald-400" />
                          <span>Pilih dari Penyimpanan (Lokal / NAS)</span>
                        </button>
                      </div>
                    </div>

                    {lastCompressResult && (
                      <div className="bg-zinc-950 border border-emerald-500/30 rounded-xl p-3 flex items-center justify-between text-xs">
                        <div>
                          <p className="text-zinc-200 font-medium">Hasil Kompresi Terakhir:</p>
                          <p className="text-[11px] text-zinc-400">
                            {formatBytes(lastCompressResult.originalSize)} ➔{" "}
                            <span className="text-emerald-400 font-semibold">{formatBytes(lastCompressResult.compressedSize)}</span>
                          </p>
                        </div>
                        <span className="bg-emerald-500/20 text-emerald-300 px-2 py-1 rounded text-xs font-mono font-bold">
                          Hemat {lastCompressResult.savingsPercent}%
                        </span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 4: GOOGLE DRIVE (dihandle komponen terpisah) */}
          {activeTab === "gdrive" && <GoogleDrivePanel />}

          {/* TAB 5: FAMILY SHARING & REMOTE ACCESS */}
          {activeTab === "shares" && (
            <div className="space-y-6">
              {/* Header */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-zinc-800 pb-4">
                <div>
                  <h2 className="text-base font-semibold text-zinc-100 flex items-center gap-2">
                    <Users className="h-4 w-4 text-blue-400" />
                    <span>Family Hub & Akses Jarak Jauh</span>
                  </h2>
                  <p className="text-xs text-zinc-400">
                    Kelola akun anggota keluarga, kuota penyimpanan, tautan berbagi publik, dan jaringan VPN Tailscale.
                  </p>
                </div>
                <button
                  onClick={() => setAddMemberModalOpen(true)}
                  className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium px-3.5 py-2 rounded-lg transition-all shadow-sm shadow-blue-600/30 active:scale-95 cursor-pointer w-fit"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>Tambah Anggota Keluarga</span>
                </button>
              </div>

              {/* Sub-Navigation Tabs */}
              <div className="flex items-center gap-1.5 p-1 bg-zinc-900 border border-zinc-800 rounded-xl w-fit text-xs">
                <button
                  onClick={() => setFamilySubTab("members")}
                  className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg font-medium transition-all cursor-pointer ${
                    familySubTab === "members"
                      ? "bg-zinc-800 text-white shadow-sm"
                      : "text-zinc-400 hover:text-zinc-200"
                  }`}
                >
                  <Users className="h-3.5 w-3.5 text-blue-400" />
                  <span>Anggota Keluarga ({familyMembers.length})</span>
                </button>
                <button
                  onClick={() => setFamilySubTab("shares")}
                  className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg font-medium transition-all cursor-pointer ${
                    familySubTab === "shares"
                      ? "bg-zinc-800 text-white shadow-sm"
                      : "text-zinc-400 hover:text-zinc-200"
                  }`}
                >
                  <Link2 className="h-3.5 w-3.5 text-purple-400" />
                  <span>Tautan Publik ({activeShares.length})</span>
                </button>
                <button
                  onClick={() => setFamilySubTab("remote")}
                  className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg font-medium transition-all cursor-pointer ${
                    familySubTab === "remote"
                      ? "bg-zinc-800 text-white shadow-sm"
                      : "text-zinc-400 hover:text-zinc-200"
                  }`}
                >
                  <Globe className="h-3.5 w-3.5 text-emerald-400" />
                  <span>Akses Jarak Jauh (Tailscale)</span>
                </button>
              </div>

              {/* 1. Family Members Sub-tab */}
              {familySubTab === "members" && (
                <div className="space-y-4">
                  {/* Undangan yang menunggu diterima — data nyata dari server */}
                  {serverInvites.filter((i) => i.status === "pending").length > 0 && (
                    <div className="bg-zinc-900/60 border border-amber-500/25 rounded-2xl p-4 space-y-2">
                      <div className="flex items-center justify-between">
                        <h3 className="text-xs font-semibold text-amber-300 flex items-center gap-1.5">
                          <Clock className="h-3.5 w-3.5" />
                          <span>
                            Undangan Menunggu Diterima (
                            {serverInvites.filter((i) => i.status === "pending").length})
                          </span>
                        </h3>
                        <button
                          onClick={refreshInvites}
                          className="text-[11px] text-zinc-400 hover:text-zinc-200 flex items-center gap-1 cursor-pointer"
                        >
                          <RefreshCw className="h-3 w-3" />
                          <span>Muat ulang</span>
                        </button>
                      </div>
                      <div className="divide-y divide-zinc-800/70">
                        {serverInvites
                          .filter((i) => i.status === "pending")
                          .map((inv) => (
                            <div
                              key={inv.id}
                              className="flex items-center justify-between gap-3 py-2"
                            >
                              <div className="min-w-0">
                                <p className="text-xs text-zinc-200 truncate">
                                  {inv.name}{" "}
                                  <span className="text-zinc-500">• {inv.email}</span>
                                </p>
                                <p className="text-[10px] text-zinc-500">
                                  Kuota {inv.quota_gb} GB • berlaku s/d{" "}
                                  {new Date(inv.expires_at).toLocaleDateString("id-ID", {
                                    day: "2-digit",
                                    month: "short",
                                    year: "numeric",
                                  })}
                                </p>
                              </div>
                              <button
                                onClick={() => handleRevokeInvite(inv.id)}
                                className="shrink-0 text-[11px] text-rose-400 hover:text-rose-300 px-2 py-1 rounded-lg hover:bg-rose-500/10 transition-colors cursor-pointer"
                              >
                                Cabut
                              </button>
                            </div>
                          ))}
                      </div>
                    </div>
                  )}

                  {familyMembers.length === 0 ? (
                    <div className="text-center py-12 border-2 border-dashed border-zinc-800 rounded-2xl bg-zinc-900/20">
                      <Users className="h-10 w-10 text-zinc-600 mx-auto mb-2" />
                      <p className="text-sm font-semibold text-zinc-300">Belum Ada Anggota Keluarga Terdaftar</p>
                      <p className="text-xs text-zinc-500 mt-1 max-w-sm mx-auto">
                        Gunakan tombol <strong>"+ Tambah Anggota Keluarga"</strong> di atas untuk mendaftarkan akun keluarga dengan isolasi kuota penyimpanan.
                      </p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      {familyMembers.map((member) => {
                        const percent = Math.min(100, Math.round((member.usedBytes / member.quotaBytes) * 100));
                        return (
                          <div
                            key={member.id}
                            className="bg-zinc-900/60 border border-zinc-800/80 rounded-2xl p-5 flex flex-col justify-between space-y-4 hover:border-zinc-700 transition-all"
                          >
                            <div className="flex items-start justify-between">
                              <div className="flex items-center gap-3">
                                <div
                                  className={`h-11 w-11 rounded-xl ${member.avatarBg} text-white font-bold flex items-center justify-center text-sm shadow-md`}
                                >
                                  {member.name.substring(0, 2).toUpperCase()}
                                </div>
                                <div>
                                  <h3 className="text-sm font-semibold text-zinc-100">{member.name}</h3>
                                  <p className="text-xs text-zinc-400 truncate max-w-[160px]">{member.email}</p>
                                </div>
                              </div>
                              <span
                                className={`text-[10px] px-2 py-0.5 rounded-full font-semibold uppercase tracking-wider ${
                                  member.role === "owner"
                                    ? "bg-blue-500/20 text-blue-300 border border-blue-500/30"
                                    : member.role === "admin"
                                    ? "bg-purple-500/20 text-purple-300 border border-purple-500/30"
                                    : "bg-zinc-800 text-zinc-400 border border-zinc-700"
                                }`}
                              >
                                {member.role}
                              </span>
                            </div>

                            {/* Quota Progress */}
                            <div className="space-y-1.5">
                              <div className="flex justify-between text-[11px]">
                                <span className="text-zinc-400">Penggunaan Kuota:</span>
                                <span className="font-mono text-zinc-200">
                                  {formatBytes(member.usedBytes)} / {formatBytes(member.quotaBytes)} ({percent}%)
                                </span>
                              </div>
                              <div className="h-2 w-full bg-zinc-800 rounded-full overflow-hidden">
                                <div
                                  className={`h-full rounded-full transition-all duration-300 ${
                                    percent > 85 ? "bg-rose-500" : percent > 60 ? "bg-amber-500" : "bg-blue-500"
                                  }`}
                                  style={{ width: `${percent}%` }}
                                />
                              </div>
                            </div>

                            <div className="pt-2 border-t border-zinc-800/60 flex items-center justify-between text-xs text-zinc-500">
                              <span className="flex items-center gap-1">
                                <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
                                Folder Privat Aman
                              </span>
                              <span className="text-blue-400 hover:text-blue-300 font-medium cursor-pointer">
                                Detail & Izin
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Family Shared Drive Banner */}
                  <div className="bg-gradient-to-r from-blue-950/30 to-indigo-950/30 border border-blue-800/40 rounded-2xl p-5 flex flex-col md:flex-row items-center justify-between gap-4">
                    <div className="flex items-center gap-3.5">
                      <div className="h-10 w-10 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400 shrink-0">
                        <Folder className="h-5 w-5 fill-blue-500/20" />
                      </div>
                      <div>
                        <h4 className="text-xs font-semibold text-zinc-100">Folder Bersama Keluarga (Shared Drive)</h4>
                        <p className="text-[11px] text-zinc-400">
                          Foto liburan, dokumen penting rumah tangga, dan arsip keluarga otomatis dapat diakses oleh seluruh anggota keluarga yang terdaftar.
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() => setActiveTab("files")}
                      className="bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium px-4 py-2 rounded-lg transition-colors shrink-0 cursor-pointer"
                    >
                      Buka Shared Drive
                    </button>
                  </div>
                </div>
              )}

              {/* 2. Active External Shares Sub-tab */}
              {familySubTab === "shares" && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-zinc-400">
                      Tautan berbagi publik untuk orang di luar keluarga • Proteksi password & batas waktu aktif
                    </span>
                  </div>

                  {activeShares.length === 0 ? (
                    <div className="text-center py-12 border-2 border-dashed border-zinc-800 rounded-2xl bg-zinc-900/20">
                      <Link2 className="h-10 w-10 text-zinc-600 mx-auto mb-2" />
                      <p className="text-sm font-semibold text-zinc-300">Belum Ada Tautan Berbagi Aktif</p>
                      <p className="text-xs text-zinc-500 mt-1 max-w-sm mx-auto">
                        Pilih file atau folder pada menu <strong>Semua File</strong> lalu klik ikon Bagikan untuk membuat link download terenkripsi.
                      </p>
                    </div>
                  ) : (
                    <div className="border border-zinc-800 rounded-xl overflow-hidden bg-zinc-900/20">
                      <table className="w-full text-left text-xs text-zinc-300">
                        <thead className="bg-zinc-900 border-b border-zinc-800 text-zinc-400">
                          <tr>
                            <th className="py-3 px-4 font-medium">Nama File / Folder</th>
                            <th className="py-3 px-4 font-medium">Izin</th>
                            <th className="py-3 px-4 font-medium">Kedaluwarsa</th>
                            <th className="py-3 px-4 font-medium">Keamanan</th>
                            <th className="py-3 px-4 text-right font-medium">Aksi</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-800/60">
                          {activeShares.map((share) => (
                            <tr key={share.id} className="hover:bg-zinc-900/60 transition-colors">
                              <td className="py-3 px-4 font-medium text-zinc-200 flex items-center gap-2">
                                {share.fileType === "folder" ? (
                                  <Folder className="h-4 w-4 text-blue-400" />
                                ) : (
                                  <ImageIcon className="h-4 w-4 text-purple-400" />
                                )}
                                <span className="truncate max-w-xs">{share.fileName}</span>
                              </td>
                              <td className="py-3 px-4">
                                <span className="text-[11px] px-2 py-0.5 rounded bg-zinc-800 text-zinc-300 uppercase font-mono">
                                  {share.permission}
                                </span>
                              </td>
                              <td className="py-3 px-4 text-zinc-400">{share.expiresAtStr}</td>
                              <td className="py-3 px-4">
                                {share.hasPassword ? (
                                  <span className="flex items-center gap-1 text-emerald-400 text-[11px]">
                                    <Lock className="h-3.5 w-3.5" /> Password Aktif
                                  </span>
                                ) : (
                                  <span className="flex items-center gap-1 text-zinc-500 text-[11px]">
                                    <Unlock className="h-3.5 w-3.5" /> Publik
                                  </span>
                                )}
                              </td>
                              <td className="py-3 px-4 text-right">
                                <button
                                  onClick={() => handleRevokeShare(share.id)}
                                  className="text-rose-400 hover:text-rose-300 text-xs font-medium cursor-pointer"
                                >
                                  Cabut Akses
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {/* 3. Remote Access (Tailscale) Sub-tab */}
              {familySubTab === "remote" && (
                <div className="max-w-3xl space-y-5">
                  <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 space-y-4">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <div className="h-12 w-12 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
                          <Globe className="h-6 w-6" />
                        </div>
                        <div>
                          <h3 className="text-sm font-semibold text-zinc-100">Akses Jarak Jauh Aman (Tailscale Mesh VPN)</h3>
                          <p className="text-xs text-zinc-400">
                            Akses seluruh isi NAS dari luar rumah (kantor, kampus, atau saat bepergian) tanpa perlu membuka port router atau langganan IP publik.
                          </p>
                        </div>
                      </div>
                      <span className="text-xs px-2.5 py-1 rounded-full bg-emerald-500/20 text-emerald-300 font-medium shrink-0">
                        Mesh Aktif
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                      <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-3.5 space-y-1">
                        <span className="text-[10px] text-zinc-500 uppercase font-semibold">IP Server di Rumah (Lokal)</span>
                        <p className="font-mono text-sm text-zinc-200">192.168.18.10:8080</p>
                        <p className="text-[10px] text-zinc-500">Hanya bisa diakses saat terhubung ke WiFi rumah</p>
                      </div>

                      <div className="bg-zinc-950 border border-emerald-500/30 rounded-xl p-3.5 space-y-1">
                        <span className="text-[10px] text-emerald-400 uppercase font-semibold">IP Tailscale Mesh (Global)</span>
                        <p className="font-mono text-sm text-emerald-300">100.84.21.10:8080</p>
                        <p className="text-[10px] text-emerald-400/80">Dapat diakses dari seluruh dunia dengan aman</p>
                      </div>
                    </div>

                    <div className="pt-2 border-t border-zinc-800 space-y-3">
                      <h4 className="text-xs font-semibold text-zinc-300 uppercase tracking-wider">
                        Langkah Mudah Menghubungkan HP Keluarga dari Luar Rumah:
                      </h4>
                      <ol className="text-xs text-zinc-400 space-y-2 list-decimal list-inside">
                        <li>Install aplikasi <strong>Tailscale</strong> di HP Android / iPhone anggota keluarga.</li>
                        <li>Login menggunakan akun keluarga yang telah diizinkan.</li>
                        <li>Buka aplikasi NAS Cloud, arahkan endpoint ke <code className="font-mono text-white bg-zinc-800 px-1 py-0.5 rounded">http://100.84.21.10:8080</code>. Selesai!</li>
                      </ol>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </main>

      {/* 3. LIGHTBOX / MEDIA DETAIL MODAL */}
      {selectedMedia && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-3xl overflow-hidden shadow-2xl flex flex-col md:flex-row">
            {/* Media Area */}
            <div className="flex-1 bg-black flex items-center justify-center p-4 min-h-[340px]">
              {selectedMedia.type === "video" ? (
                <div className="w-full h-full flex flex-col items-center justify-center">
                  <video
                    controls
                    autoPlay
                    playsInline
                    className="w-full max-h-[360px] rounded-xl bg-zinc-950 shadow-2xl border border-zinc-800"
                    src={
                      selectedMedia.blob
                        ? URL.createObjectURL(selectedMedia.blob)
                        : getStreamUrl(selectedMedia.id)
                    }
                  >
                    Format video tidak didukung oleh browser Anda.
                  </video>
                  <div className="flex items-center gap-2 mt-2.5 text-[11px] text-zinc-400 font-mono">
                    <Activity className="h-3.5 w-3.5 text-blue-400 animate-pulse" />
                    <span>HTTP 206 Partial Content Stream • Scrubbing Aktif</span>
                  </div>
                </div>
              ) : selectedMedia.type === "image" ? (
                <div className="w-full h-full flex items-center justify-center p-2">
                  <img
                    src={
                      selectedMedia.blob
                        ? URL.createObjectURL(selectedMedia.blob)
                        : getStreamUrl(selectedMedia.id)
                    }
                    alt={selectedMedia.name}
                    className="max-h-[380px] w-auto max-w-full rounded-xl object-contain shadow-lg"
                  />
                </div>
              ) : (
                <div className="text-center space-y-2">
                  <ImageIcon className="h-16 w-16 text-zinc-600 mx-auto" />
                  <p className="text-xs text-zinc-500 font-mono">Pratinjau Resolusi Penuh</p>
                </div>
              )}
            </div>

            {/* Metadata & Actions Sidebar */}
            <div className="w-full md:w-80 p-5 flex flex-col justify-between border-t md:border-t-0 md:border-l border-zinc-800 space-y-4">
              <div>
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-semibold text-zinc-200 truncate">{selectedMedia.name}</h3>
                  <button onClick={() => setSelectedMedia(null)} className="text-zinc-500 hover:text-white cursor-pointer">
                    <X className="h-4 w-4" />
                  </button>
                </div>

                <div className="mt-4 space-y-2.5 text-xs">
                  <div>
                    <span className="text-zinc-500 block text-[10px] uppercase font-semibold">Ukuran File</span>
                    <span className="text-zinc-200 font-mono">{selectedMedia.sizeStr}</span>
                  </div>
                  {selectedMedia.dimensions && (
                    <div>
                      <span className="text-zinc-500 block text-[10px] uppercase font-semibold">Dimensi / Resolusi</span>
                      <span className="text-zinc-200 font-mono">{selectedMedia.dimensions}</span>
                    </div>
                  )}
                  <div>
                    <span className="text-zinc-500 block text-[10px] uppercase font-semibold">Waktu</span>
                    <span className="text-zinc-200">{selectedMedia.updatedAt}</span>
                  </div>
                  <div>
                    <span className="text-zinc-500 block text-[10px] uppercase font-semibold">Status Integritas</span>
                    <span className="text-emerald-400 flex items-center gap-1 font-mono text-[11px]">
                      <CheckCircle2 className="h-3 w-3" /> SHA-256 Validated
                    </span>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <button
                  onClick={() => handleDownload(selectedMedia)}
                  className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium py-2 rounded-lg transition-colors cursor-pointer"
                >
                  <Download className="h-3.5 w-3.5" />
                  <span>Download File Asli</span>
                </button>
                <button
                  onClick={() => setSelectedMedia(null)}
                  className="w-full bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-medium py-2 rounded-lg transition-colors cursor-pointer"
                >
                  Tutup
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 4. SHARE LINK MODAL */}
      {moveItem && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-md p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-zinc-100 font-semibold text-sm">
                <FolderInput className="h-4 w-4 text-amber-400" />
                <span>Pindahkan Item</span>
              </div>
              <button
                onClick={() => setMoveItem(null)}
                className="text-zinc-500 hover:text-white cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <p className="text-xs text-zinc-400">
              Pilih folder tujuan untuk{" "}
              <span className="text-zinc-200 font-medium">{moveItem.name}</span>.
            </p>

            <div className="flex items-center gap-1.5 text-[11px] text-zinc-400 flex-wrap bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2">
              {moveCrumbs.map((c, i) => (
                <React.Fragment key={`${c.id}-${i}`}>
                  {i > 0 && <ChevronRight className="h-3 w-3 text-zinc-600" />}
                  <button
                    onClick={() => {
                      setMoveParentId(c.id);
                      setMoveCrumbs((prev) => prev.slice(0, i + 1));
                      loadMoveFolders(c.id, moveItem.id);
                    }}
                    className="hover:text-white cursor-pointer"
                  >
                    {c.name}
                  </button>
                </React.Fragment>
              ))}
            </div>

            <div className="max-h-60 overflow-y-auto space-y-1.5">
              {moveLoading ? (
                <div className="py-8 flex items-center justify-center gap-2 text-zinc-400 text-xs">
                  <RefreshCw className="h-4 w-4 animate-spin" />
                  <span>Memuat folder...</span>
                </div>
              ) : moveFolders.length === 0 ? (
                <p className="py-8 text-center text-xs text-zinc-500">
                  Tidak ada subfolder di sini.
                </p>
              ) : (
                moveFolders.map((f) => (
                  <button
                    key={f.id}
                    onClick={() => {
                      setMoveParentId(f.id);
                      setMoveCrumbs((prev) => [...prev, { id: f.id, name: f.name }]);
                      loadMoveFolders(f.id, moveItem.id);
                    }}
                    className="w-full flex items-center gap-2 px-3 py-2 rounded-lg bg-zinc-950 hover:bg-zinc-800 border border-zinc-800 text-left cursor-pointer"
                  >
                    <Folder className="h-4 w-4 text-blue-400 shrink-0" />
                    <span className="text-xs text-zinc-200 truncate">{f.name}</span>
                    <ChevronRight className="h-3.5 w-3.5 text-zinc-600 ml-auto" />
                  </button>
                ))
              )}
            </div>

            <div className="flex items-center gap-2 pt-1">
              <button
                onClick={() => setMoveItem(null)}
                className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-medium py-2.5 rounded-xl transition-colors cursor-pointer"
              >
                Batal
              </button>
              <button
                onClick={handleConfirmMove}
                disabled={moveBusy}
                className="flex-1 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white text-xs font-semibold py-2.5 rounded-xl transition-colors cursor-pointer"
              >
                {moveBusy ? "Memindahkan..." : "Pindahkan ke Sini"}
              </button>
            </div>
          </div>
        </div>
      )}

      {shareModalFile && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-md p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-zinc-100 font-semibold text-sm">
                <Share2 className="h-4 w-4 text-blue-400" />
                <span>Bagikan Link Aman</span>
              </div>
              <button
                onClick={() => {
                  setShareModalFile(null);
                  setShareLinkGenerated(false);
                }}
                className="text-zinc-500 hover:text-white cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <p className="text-xs text-zinc-400">
              Buat link unduh publik untuk file <span className="text-zinc-200 font-medium">{shareModalFile.name}</span>.
            </p>

            <div className="space-y-3 text-xs">
              <div>
                <label className="text-zinc-400 block mb-1 font-medium">Batas Waktu Kedaluwarsa</label>
                <select
                  value={shareExpiryOption}
                  onChange={(e) => setShareExpiryOption(e.target.value as "24h" | "7d" | "30d" | "never")}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-zinc-200 focus:outline-none focus:border-blue-500 cursor-pointer"
                >
                  <option value="24h">24 Jam (1 Hari)</option>
                  <option value="7d">7 Hari</option>
                  <option value="30d">30 Hari</option>
                  <option value="never">Tanpa Batas Waktu</option>
                </select>
              </div>

              <div>
                <label className="text-zinc-400 block mb-1 font-medium">Izin Akses</label>
                <select
                  value={sharePermission}
                  onChange={(e) => setSharePermission(e.target.value as "viewer" | "uploader")}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-zinc-200 focus:outline-none focus:border-blue-500 cursor-pointer"
                >
                  <option value="viewer">Viewer (Hanya Melihat & Unduh)</option>
                  <option value="uploader">Uploader (Bisa Unggah File Tambahan)</option>
                </select>
              </div>

              <div>
                <label className="text-zinc-400 block mb-1 font-medium">Proteksi Password (Opsional)</label>
                <input
                  type="password"
                  value={sharePasswordInput}
                  onChange={(e) => setSharePasswordInput(e.target.value)}
                  placeholder="Masukkan password jika diperlukan..."
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-blue-500"
                />
              </div>

              {shareLinkGenerated ? (
                <div className="bg-zinc-950 border border-blue-500/40 p-3 rounded-xl space-y-2">
                  <span className="text-[10px] text-blue-400 font-semibold uppercase">Link Publik Terenkripsi Aktif</span>
                  <div className="flex items-center justify-between bg-zinc-900 p-2 rounded-lg font-mono text-[11px] text-zinc-300">
                    <span className="truncate">{currentGeneratedUrl}</span>
                    <button
                      onClick={() => {
                        if (typeof navigator !== "undefined" && navigator.clipboard) {
                          navigator.clipboard.writeText(currentGeneratedUrl);
                        }
                        alert("Link berhasil disalin ke clipboard!");
                      }}
                      className="text-blue-400 hover:text-blue-300 ml-2 font-sans font-medium cursor-pointer"
                    >
                      Salin
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={handleGenerateShare}
                  disabled={shareGenerating}
                  className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-medium py-2.5 rounded-xl transition-colors mt-2 cursor-pointer shadow-sm shadow-blue-600/30"
                >
                  {shareGenerating ? "Membuat link..." : "Generate Link Berbagi"}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 6. ADD FAMILY MEMBER MODAL */}
      {addMemberModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-md p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-zinc-100 font-semibold text-sm">
                <Users className="h-4 w-4 text-blue-400" />
                <span>Tambah Anggota Keluarga Baru</span>
              </div>
              <button
                onClick={() => {
                  setAddMemberModalOpen(false);
                  setGeneratedInviteUrl("");
                }}
                className="text-zinc-500 hover:text-white cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {generatedInviteUrl ? (
              <div className="space-y-4 pt-1">
                <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-left space-y-2.5">
                  <div className="flex items-center gap-2 text-emerald-400 font-semibold text-xs">
                    <CheckCircle2 className="h-4 w-4" />
                    <span>Anggota Berhasil Didaftarkan!</span>
                  </div>
                  <p className="text-[11px] text-zinc-300">
                    Kirimkan tautan undangan ini ke HP keluarga via WhatsApp atau Telegram. Saat mereka mengklik link ini di HP mereka, mereka langsung bergabung:
                  </p>
                  <div className="bg-zinc-950 p-2.5 rounded-xl border border-zinc-800 text-[11px] font-mono text-zinc-200 break-all select-all">
                    {generatedInviteUrl}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      if (typeof navigator !== "undefined" && navigator.clipboard) {
                        navigator.clipboard.writeText(generatedInviteUrl);
                      }
                      alert("Tautan undangan berhasil disalin! Silakan kirimkan ke HP anggota keluarga Anda.");
                    }}
                    className="flex-1 bg-blue-600 hover:bg-blue-500 text-white font-medium py-2.5 rounded-xl text-xs cursor-pointer flex items-center justify-center gap-1.5 shadow-sm shadow-blue-600/30"
                  >
                    <Copy className="h-3.5 w-3.5" />
                    <span>Salin Link Undangan</span>
                  </button>
                  <button
                    onClick={() => {
                      setGeneratedInviteUrl("");
                      setNewMemberName("");
                      setNewMemberEmail("");
                      setAddMemberModalOpen(false);
                    }}
                    className="px-4 py-2.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-xl text-xs font-medium cursor-pointer"
                  >
                    Selesai
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleAddFamilyMember} className="space-y-3.5 text-xs">
                <div>
                  <label className="text-zinc-400 block mb-1 font-medium">Nama Lengkap</label>
                  <input
                    type="text"
                    required
                    value={newMemberName}
                    onChange={(e) => setNewMemberName(e.target.value)}
                    placeholder="Misal: Ibu, Kakak, atau Adik"
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="text-zinc-400 block mb-1 font-medium">Alamat Email</label>
                  <input
                    type="email"
                    required
                    value={newMemberEmail}
                    onChange={(e) => setNewMemberEmail(e.target.value)}
                    placeholder="ibu@nas.local atau email asli"
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-zinc-400 block mb-1 font-medium">Peran (Role)</label>
                    <select
                      value={newMemberRole}
                      onChange={(e) => setNewMemberRole(e.target.value as "member" | "admin")}
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-zinc-200 focus:outline-none focus:border-blue-500 cursor-pointer"
                    >
                      <option value="member">Member (Akses Biasa)</option>
                      <option value="admin">Admin (Kelola User)</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-zinc-400 block mb-1 font-medium">Batas Kuota</label>
                    <select
                      value={newMemberQuotaGB}
                      onChange={(e) => setNewMemberQuotaGB(parseInt(e.target.value))}
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-zinc-200 focus:outline-none focus:border-blue-500 cursor-pointer"
                    >
                      <option value={50}>50 GB</option>
                      <option value={100}>100 GB</option>
                      <option value={250}>250 GB</option>
                      <option value={500}>500 GB</option>
                    </select>
                  </div>
                </div>

                <p className="text-[11px] text-zinc-500 pt-1">
                  Anggota keluarga akan mendapatkan tautan khusus untuk membuka akun privat mereka dan otomatis mengakses folder bersama keluarga.
                </p>

                <div className="flex items-center justify-end gap-2 pt-2 border-t border-zinc-800">
                  <button
                    type="button"
                    onClick={() => setAddMemberModalOpen(false)}
                    className="px-4 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-medium cursor-pointer"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium cursor-pointer shadow-sm shadow-blue-600/30"
                  >
                    Daftarkan & Buat Link
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* 5. SERVER CONNECTION MODAL (DUAL-MODE HYBRID SWITCHER) */}
      {serverModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-lg p-6 space-y-5 shadow-2xl">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5 text-zinc-100 font-semibold text-sm">
                <Server className="h-4 w-4 text-blue-400" />
                <span>Pengaturan Server NAS Homelab</span>
              </div>
              <button
                onClick={() => setServerModalOpen(false)}
                className="text-zinc-500 hover:text-white cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Mode Selector */}
            <div className="space-y-2">
              <label className="text-xs font-medium text-zinc-300">Mode Operasi Aplikasi</label>
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div
                  onClick={() => setConnectionMode("nas")}
                  className={`p-3 rounded-xl border cursor-pointer transition-all ${
                    connectionMode === "nas"
                      ? "border-blue-500 bg-blue-500/10 text-white"
                      : "border-zinc-800 bg-zinc-950 text-zinc-400 hover:border-zinc-700"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <p className="font-semibold text-zinc-200">Private NAS Server</p>
                    {connectionMode === "nas" && <Check className="h-3.5 w-3.5 text-blue-400" />}
                  </div>
                  <p className="text-[11px] text-zinc-400 mt-1">
                    Streaming video, deduplikasi CAS, & kapasitas besar ke server rumah.
                  </p>
                </div>

                <div
                  onClick={() => setConnectionMode("standalone")}
                  className={`p-3 rounded-xl border cursor-pointer transition-all ${
                    connectionMode === "standalone"
                      ? "border-amber-500 bg-amber-500/10 text-white"
                      : "border-zinc-800 bg-zinc-950 text-zinc-400 hover:border-zinc-700"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <p className="font-semibold text-zinc-200">Mode Standalone</p>
                    {connectionMode === "standalone" && <Check className="h-3.5 w-3.5 text-amber-400" />}
                  </div>
                  <p className="text-[11px] text-zinc-400 mt-1">
                    100% offline di HP/laptop via IndexedDB & Studio WASM tanpa server.
                  </p>
                </div>
              </div>
            </div>

            {/* Server Endpoint URL Input */}
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-zinc-300 block mb-1">
                  Alamat Endpoint Backend Server
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={inputServerUrl}
                    onChange={(e) => setInputServerUrl(e.target.value)}
                    placeholder="http://localhost:8080 atau http://192.168.18.10:8080"
                    className="flex-1 bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs font-mono text-zinc-200 focus:outline-none focus:border-blue-500"
                  />
                  <button
                    onClick={handleTestPing}
                    disabled={isTestingPing}
                    className="bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-medium px-3.5 py-2 rounded-lg transition-colors cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
                  >
                    {isTestingPing ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Activity className="h-3.5 w-3.5 text-blue-400" />}
                    <span>Test Ping</span>
                  </button>
                </div>
                <p className="text-[10px] text-zinc-500 mt-1">
                  Gunakan IP lokal jaringan rumah, hostname Tailscale, atau domain VPN.
                </p>
              </div>

              {/* Admin Key untuk endpoint Google Drive & undangan */}
              <div>
                <label className="text-xs font-medium text-zinc-300 block mb-1">
                  Admin Key (opsional)
                </label>
                <input
                  type="password"
                  value={inputAdminKey}
                  onChange={(e) => setInputAdminKey(e.target.value)}
                  placeholder="Samakan dengan env NAS_ADMIN_KEY di server"
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs font-mono text-zinc-200 focus:outline-none focus:border-blue-500"
                />
                <p className="text-[10px] text-zinc-500 mt-1">
                  Wajib jika server disetel <code>NAS_ADMIN_KEY</code>. Tanpa key, endpoint hanya bisa diakses dari jaringan lokal.
                </p>
              </div>

              {/* Ping Message Status */}
              {pingTestMessage && (
                <div
                  className={`p-3 rounded-xl text-xs flex items-center gap-2 ${
                    nasStatus === "online"
                      ? "bg-emerald-500/10 border border-emerald-500/30 text-emerald-300"
                      : "bg-rose-500/10 border border-rose-500/30 text-rose-300"
                  }`}
                >
                  {nasStatus === "online" ? (
                    <Wifi className="h-4 w-4 shrink-0 text-emerald-400" />
                  ) : (
                    <WifiOff className="h-4 w-4 shrink-0 text-rose-400" />
                  )}
                  <span>{pingTestMessage}</span>
                </div>
              )}

              {/* Server Diagnostics & Telemetry */}
              {nasHealth && nasStatus === "online" && (
                <div className="bg-zinc-950 border border-zinc-800/80 rounded-xl p-3.5 space-y-2 text-xs">
                  <div className="flex justify-between">
                    <span className="text-zinc-500">Status Server:</span>
                    <span className="text-emerald-400 font-medium flex items-center gap-1">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> Online
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-500">Versi Backend:</span>
                    <span className="text-zinc-300 font-mono">{nasHealth.version}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-500">Direktori Fisik Disk:</span>
                    <span className="text-zinc-300 font-mono truncate max-w-[240px]">{nasHealth.storage_path}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-500">Mode Database:</span>
                    <span className={nasHealth.database ? "text-emerald-400 font-medium" : "text-amber-400 font-medium"}>
                      {nasHealth.database ? "PostgreSQL Terhubung" : "Storage-Only Mode"}
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* Modal Actions */}
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-zinc-800">
              <button
                onClick={() => setServerModalOpen(false)}
                className="px-4 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-medium cursor-pointer"
              >
                Batal
              </button>
              <button
                onClick={handleSaveServerConfig}
                className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium cursor-pointer shadow-sm shadow-blue-600/30"
              >
                Simpan & Terapkan
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 7. STORAGE FILE PICKER MODAL (FOR STUDIO TOOLS) */}
      {storagePickerOpen && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-2xl p-6 space-y-4 shadow-2xl flex flex-col max-h-[85vh]">
            <div className="flex items-center justify-between pb-2 border-b border-zinc-800 shrink-0">
              <div className="flex items-center gap-2.5 text-zinc-100 font-semibold text-sm">
                <Folder className="h-4 w-4 text-blue-400" />
                <span>Pilih Berkas dari Penyimpanan untuk Studio</span>
              </div>
              <button
                onClick={() => setStoragePickerOpen(false)}
                className="text-zinc-500 hover:text-white cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Storage Tabs */}
            <div className="flex items-center gap-1.5 p-1 bg-zinc-950 border border-zinc-800 rounded-xl text-xs shrink-0 w-fit">
              <button
                onClick={() => setStoragePickerTab("local")}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg font-medium transition-all cursor-pointer ${
                  storagePickerTab === "local" ? "bg-zinc-800 text-white shadow-sm" : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                <HardDrive className="h-3.5 w-3.5 text-blue-400" />
                <span>Lokal Device (IndexedDB)</span>
              </button>
              <button
                onClick={() => setStoragePickerTab("nas")}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg font-medium transition-all cursor-pointer ${
                  storagePickerTab === "nas" ? "bg-zinc-800 text-white shadow-sm" : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                <Server className="h-3.5 w-3.5 text-emerald-400" />
                <span>Server NAS ({nasStatus === "online" ? "Online" : "Offline"})</span>
              </button>
              <button
                onClick={() => setStoragePickerTab("gdrive")}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg font-medium transition-all cursor-pointer ${
                  storagePickerTab === "gdrive" ? "bg-zinc-800 text-white shadow-sm" : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                <Cloud className="h-3.5 w-3.5 text-teal-400" />
                <span>Google Drive Pro</span>
              </button>
            </div>

            {/* File List in Modal */}
            <div className="flex-1 overflow-y-auto space-y-2 pr-1 min-h-[220px]">
              {storagePickerTab === "local" &&
                (() => {
                  const eligibleItems = localItems.filter((i) => {
                    if (
                      storagePickerTool === "img2pdf" ||
                      storagePickerTool === "idphoto" ||
                      storagePickerTool === "compress"
                    ) {
                      return i.type === "image";
                    }
                    if (storagePickerTool === "mergepdf") {
                      return i.type === "document" && i.name.toLowerCase().endsWith(".pdf");
                    }
                    return true;
                  });

                  if (eligibleItems.length === 0) {
                    return (
                      <div className="text-center py-10 border border-dashed border-zinc-800 rounded-xl bg-zinc-950/30">
                        <FileText className="h-8 w-8 text-zinc-600 mx-auto mb-2" />
                        <p className="text-xs font-semibold text-zinc-300">
                          Belum ada berkas yang sesuai di penyimpanan lokal
                        </p>
                        <p className="text-[11px] text-zinc-500 mt-1">
                          Unggah {storagePickerTool === "mergepdf" ? "file PDF" : "foto"} terlebih dahulu melalui menu
                          Semua File.
                        </p>
                      </div>
                    );
                  }

                  return (
                    <div className="space-y-1.5">
                      {eligibleItems.map((item) => {
                        const isSelected = selectedStorageIds.includes(item.id);
                        return (
                          <div
                            key={item.id}
                            onClick={() => {
                              if (storagePickerTool === "idphoto" || storagePickerTool === "compress") {
                                setSelectedStorageIds([item.id]);
                              } else {
                                setSelectedStorageIds((prev) =>
                                  isSelected ? prev.filter((id) => id !== item.id) : [...prev, item.id]
                                );
                              }
                            }}
                            className={`flex items-center justify-between p-3 rounded-xl border cursor-pointer transition-all ${
                              isSelected
                                ? "border-blue-500 bg-blue-500/10 text-white"
                                : "border-zinc-800 bg-zinc-950/60 text-zinc-300 hover:border-zinc-700"
                            }`}
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              <div
                                className={`h-5 w-5 rounded flex items-center justify-center border text-xs ${
                                  isSelected
                                    ? "bg-blue-600 border-blue-500 text-white"
                                    : "border-zinc-700 bg-zinc-900"
                                }`}
                              >
                                {isSelected && <Check className="h-3.5 w-3.5" />}
                              </div>
                              <div className="truncate">
                                <p className="text-xs font-medium truncate">{item.name}</p>
                                <p className="text-[10px] text-zinc-500">
                                  {item.sizeStr} • {item.updatedAt}
                                </p>
                              </div>
                            </div>
                            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-zinc-800 text-zinc-400 uppercase">
                              {item.type}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}

              {storagePickerTab === "nas" && (
                <div className="text-center py-10 border border-dashed border-zinc-800 rounded-xl bg-zinc-950/30">
                  <Server className="h-8 w-8 text-zinc-600 mx-auto mb-2" />
                  <p className="text-xs font-semibold text-zinc-300">
                    {nasStatus === "online" ? "Server NAS Terhubung" : "Server NAS Offline"}
                  </p>
                  <p className="text-[11px] text-zinc-500 mt-1 max-w-sm mx-auto">
                    {nasStatus === "online"
                      ? "File yang diunggah ke NAS otomatis tersimpan dengan hash SHA-256 untuk pemrosesan instan."
                      : "Hubungkan backend NAS di menu Settings untuk menarik berkas langsung dari server."}
                  </p>
                </div>
              )}

              {storagePickerTab === "gdrive" && (
                <div className="text-center py-10 border border-dashed border-zinc-800 rounded-xl bg-zinc-950/30">
                  <Cloud className="h-8 w-8 text-zinc-600 mx-auto mb-2" />
                  <p className="text-xs font-semibold text-zinc-300">
                    {isGdriveConnected ? "Google Drive Pro Terhubung" : "Google Drive Belum Dihubungkan"}
                  </p>
                  <p className="text-[11px] text-zinc-500 mt-1 max-w-sm mx-auto">
                    {isGdriveConnected
                      ? "Gunakan tab Google Drive di sidebar untuk membuka atau mengunduh file Pro Anda ke penyimpanan lokal."
                      : "Buka tab Google Drive di sidebar dan hubungkan akun Anda untuk memilih berkas dari cloud."}
                  </p>
                </div>
              )}
            </div>

            {/* Modal Actions */}
            <div className="flex items-center justify-between pt-3 border-t border-zinc-800 shrink-0">
              <span className="text-xs text-zinc-400">{selectedStorageIds.length} berkas dipilih</span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setStoragePickerOpen(false)}
                  className="px-4 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-medium cursor-pointer"
                >
                  Batal
                </button>
                <button
                  onClick={handleExecuteStorageSelection}
                  disabled={selectedStorageIds.length === 0}
                  className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs font-medium cursor-pointer shadow-sm shadow-blue-600/30"
                >
                  Gunakan Berkas Terpilih
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


