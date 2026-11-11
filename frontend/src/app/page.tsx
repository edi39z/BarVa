"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  getAllLocalFiles,
  deleteLocalFile,
  toggleFavorite,
} from "@/lib/storage/indexeddb";
import {
  getDownloadUrl,
  getThumbnailUrl,
  listNasFiles,
  createNasFolder,
  deleteNasFile,
  renameNasFile,
  moveNasFile,
} from "@/lib/api/nas";
import AccountSettingsModal from "@/components/AccountSettingsModal";
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
} from "@/lib/files/actions";
import { useBulkActions } from "@/hooks/useBulkActions";
import { useContentSearch, type SearchScope } from "@/hooks/useContentSearch";
import { useFamily } from "@/hooks/useFamily";
import { useFileSelection } from "@/hooks/useFileSelection";
import { useNasFiles } from "@/hooks/useNasFiles";
import { useNasSession } from "@/hooks/useNasSession";
import { useShares } from "@/hooks/useShares";
import { useStudio } from "@/hooks/useStudio";
import { useTrash } from "@/hooks/useTrash";
import { useUploads } from "@/hooks/useUploads";
import type { DisplayItem } from "@/lib/displayItem";
import { formatBytes, nasNodeToDisplay } from "@/lib/nasDisplay";

import GoogleDrivePanel from "@/components/GoogleDrivePanel";

export default function Home() {
  const [activeTab, setActiveTab] = useState<"home" | "files" | "trash" | "gallery" | "studio" | "gdrive" | "shares">("home");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [storageFilter, setStorageFilter] = useState<"local" | "gdrive">("local");
  const [galleryCategory, setGalleryCategory] = useState<"all" | "image" | "video" | "favorite">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchScope, setSearchScope] = useState<SearchScope>("name");
  const [accountModalOpen, setAccountModalOpen] = useState(false);
  const [selectedMedia, setSelectedMedia] = useState<DisplayItem | null>(null);

  // Rename & pindah folder (khusus mode NAS)
  const [moveItems, setMoveItems] = useState<DisplayItem[]>([]);
  const [moveParentId, setMoveParentId] = useState<string | null>(null);
  const [moveCrumbs, setMoveCrumbs] = useState<{ id: string | null; name: string }[]>([
    { id: null, name: "Semua File" },
  ]);
  const [moveFolders, setMoveFolders] = useState<DisplayItem[]>([]);
  const [moveLoading, setMoveLoading] = useState(false);
  const [moveBusy, setMoveBusy] = useState(false);

  // Sesi, koneksi server, dan status jaringan dikelola hook sendiri.
  const {
    connectionMode,
    setConnectionMode,
    serverUrl,
    inputServerUrl,
    setInputServerUrl,
    inputAdminKey,
    setInputAdminKey,
    currentUser,
    setCurrentUser,
    authReady,
    nasHealth,
    nasStatus,
    nasLatency,
    isOnline,
    serverModalOpen,
    setServerModalOpen,
    isTestingPing,
    pingTestMessage,
    isGdriveConnected,
    testPing,
    saveServerConfig,
    logout,
  } = useNasSession({ activeTab });

  // Anggota keluarga, undangan, dan formulir tambah anggota dikelola hook.
  const {
    subTab: familySubTab,
    setSubTab: setFamilySubTab,
    modalOpen: addMemberModalOpen,
    setModalOpen: setAddMemberModalOpen,
    name: newMemberName,
    setName: setNewMemberName,
    email: newMemberEmail,
    setEmail: setNewMemberEmail,
    role: newMemberRole,
    setRole: setNewMemberRole,
    quotaGB: newMemberQuotaGB,
    setQuotaGB: setNewMemberQuotaGB,
    members: familyMembers,
    invites: serverInvites,
    generatedInviteUrl,
    setGeneratedInviteUrl,
    addMember: handleAddFamilyMember,
    reload: refreshInvites,
    updateQuota: handleUpdateMemberQuota,
    revokeInvite: handleRevokeInvite,
  } = useFamily({ connectionMode, currentUser });

  // Local storage items from IndexedDB
  const [localItems, setLocalItems] = useState<DisplayItem[]>([]);

  // Menu aksi per berkas + seleksi banyak + smart foldering
  const selection = useFileSelection();

  // Isi IndexedDB tidak menyentuh jaringan, jadi tetap dimuat di mode apa pun.
  useEffect(() => {
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

  // Daftar berkas NAS, media galeri, dan navigasi folder dikelola hook sendiri.
  const files = useNasFiles({ connectionMode, currentUser, activeTab });
  const { currentFolderId, breadcrumbs: folderBreadcrumbs } = files;

  // Trash NAS: daftar, pemulihan, dan hapus permanen dikelola hook sendiri.
  const trash = useTrash({
    connectionMode,
    currentUser,
    onRestored: () => files.reload(),
  });

  // Link berbagi: modal, opsi, dan daftar link aktif dikelola hook sendiri.
  const shares = useShares({ connectionMode, currentUser });

  /** Segarkan daftar folder, galeri, dan trash setelah aksi yang mengubah data. */
  const refreshLibrary = useCallback(async () => {
    if (connectionMode !== "nas" || !currentUser) return;
    await files.reload();
    if (activeTab === "gallery") await files.reloadMedia();
    await trash.reload();
  }, [connectionMode, currentUser, activeTab, files, trash]);

  // Unggahan, antrean offline, dan progres unggah dikelola hook sendiri.
  const {
    isUploading,
    uploadProgress,
    uploadFileName,
    pendingUploads,
    flushingQueue,
    fileInputRef,
    uploadWithUniqueName,
    flushQueue: handleFlushQueue,
    handleFileInputChange: handleRealFileUpload,
  } = useUploads({
    connectionMode,
    currentUser,
    currentFolderId,
    setCurrentUser,
    setLocalItems,
    onUploaded: () => files.reload(),
  });

  // Phase 5: PWA Install & 3-2-1 Offsite Backup Handlers
  const handleInstallPwa = () => {
    alert("Untuk memasang Barva di HP/Laptop:\n1. Buka menu browser (titik tiga ⋮ di Chrome/Edge atau tombol Share di Safari iOS)\n2. Pilih 'Tambahkan ke Layar Utama' (Add to Home Screen / Install App).\n\nAplikasi akan terpasang sebagai aplikasi PWA berkecepatan native.");
  };

  // Navigasi folder memakai aksi dari hook daftar berkas.
  const handleOpenFolder = files.openFolder;
  const handleNavigateBreadcrumb = files.navigateBreadcrumb;
  const handleGoBackFolder = files.goBack;

  const handleCreateFolder = async () => {
    const folderName = prompt("Masukkan nama folder baru:");
    if (!folderName) return;

    if (connectionMode === "nas") {
      try {
        await createNasFolder(folderName, currentFolderId);
        await files.reload();
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

  // Studio: alat aktif, status proses, hasil olahan, dan penyimpanan hasil.
  const studio = useStudio({
    connectionMode,
    currentFolderId,
    localItems,
    setLocalItems,
    refreshLibrary,
    uploadWithUniqueName,
    setActiveTab,
  });

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
        files.removeLocally(id);
        if (selectedMedia?.id === id) setSelectedMedia(null);
        trash.reload();
      } catch (err) {
        alert(`Gagal menghapus: ${(err as Error).message}`);
      }
      return;
    }

    if (!confirm("Hapus file ini dari penyimpanan lokal?")) return;
    try {
      await deleteLocalFile(id);
      setLocalItems((prev) => prev.filter((item) => item.id !== id));
      files.removeLocally(id);
      if (selectedMedia?.id === id) setSelectedMedia(null);
    } catch (err) {
      console.error("Delete error:", err);
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

  // Sumber data UI: server NAS saat mode NAS, IndexedDB saat standalone.
  // Tanpa sesi NAS, daftar dari server tidak boleh ditampilkan meski datanya
  // masih tersisa di state — dulu ini ditangani dengan mereset state di efek.
  const activeItems = connectionMode === "nas" ? (currentUser ? files.items : []) : localItems;

  // Galeri memakai media lintas folder di mode NAS; di standalone seluruh
  // item lokal memang sudah terkumpul di satu tempat.
  const galleryItems = connectionMode === "nas" ? (currentUser ? files.mediaItems : []) : localItems;

  // Owner/admin bisa melihat berkas anggota lain; UI perlu menandainya agar
  // tidak tertukar dengan berkas sendiri.
  const isForeignItem = (item: DisplayItem) =>
    Boolean(currentUser && item.ownerId && item.ownerId !== currentUser.id);

  // Berkas lokal memakai blob sendiri; hanya berkas NAS yang punya thumbnail
  // dari server. Video belum punya poster, jadi memakai ikon.
  const thumbnailForItem = (item: DisplayItem) =>
    item.blob || item.type !== "image" ? null : getThumbnailUrl(item.id, "small");

  // Pencarian isi dokumen lintas folder; hook tidak menyentuh jaringan selama
  // cakupan masih "nama", jadi mode standalone tetap aman.
  const contentSearch = useContentSearch({
    connectionMode,
    currentUser,
    query: searchQuery,
    // Cakupan hanya berlaku di tab Berkas; tab lain tidak perlu menembak server.
    scope: activeTab === "files" ? searchScope : "name",
    localItems,
  });
  const resultsMode = searchScope === "content";

  // Mode "nama" menyaring folder aktif; mode "isi" memakai hasil lintas folder.
  const filteredFiles = resultsMode
    ? contentSearch.results.map((row) => row.item)
    : activeItems.filter((f) => f.name.toLowerCase().includes(searchQuery.toLowerCase()));

  // ---------------- Menu aksi berkas & seleksi banyak ----------------

  const selectionSource = activeTab === "gallery" ? galleryItems : activeItems;
  const visibleSelectionIds = resultsMode
    ? []
    : activeTab === "gallery"
      ? galleryItems.map((item) => item.id)
      : filteredFiles
          .filter((item) => (item.parentId || null) === currentFolderId)
          .map((item) => item.id);

  // Potongan teks dan folder asal hanya relevan di mode hasil pencarian isi.
  const searchSnippets = Object.fromEntries(
    contentSearch.results.map((row) => [row.item.id, row.snippet])
  );
  const searchFolderNames = Object.fromEntries(
    contentSearch.results.map((row) => [row.item.id, row.folderName])
  );

  const contentSearchNotice = !resultsMode
    ? ""
    : contentSearch.error
      ? `Pencarian isi gagal: ${contentSearch.error}`
      : searchQuery.trim().length < contentSearch.minQuery
        ? `Ketik minimal ${contentSearch.minQuery} karakter untuk mencari di isi dokumen.`
        : contentSearch.indexing
          ? "Sedang mengindeks berkas lokal. Hasil bisa bertambah setelah selesai."
          : "";

  // Menu aksi berkas dan operasi massal dikelola hook sendiri.
  const {
    actionMenuItem,
    actionMenuAnchor,
    openFileActionMenu,
    closeFileActionMenu,
    bulkBusy,
    bulkProgress,
    smartFolderOpen,
    setSmartFolderOpen,
    smartFolderMode,
    setSmartFolderMode,
    libraryNotice,
    setLibraryNotice,
    selectedItems,
    confirmAutoGroup: handleConfirmAutoGroup,
    bulkAction: handleBulkAction,
  } = useBulkActions({
    connectionMode,
    currentFolderId,
    activeItems,
    selectionSource,
    selectedIds: selection.selectedIds,
    setLocalItems,
    clearSelection: selection.clear,
    refreshLibrary,
    downloadItem: handleDownload,
    requestMove: openMoveModal,
    processItemsWithTool: studio.processItemsWithTool,
  });

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
      shares.open(item);
      return;
    }
    if (action.id === "delete") {
      await handleDelete(item.id);
      return;
    }
    if (action.tool) {
      const ok = await studio.processItemsWithTool(action.tool, [item], {
        download: true,
        parentId: item.parentId ?? currentFolderId,
      });
      if (ok) setLibraryNotice(`Selesai memproses “${item.name}”. Hasil tersimpan di folder asal.`);
    }
  };

  // Seleksi tidak boleh terbawa saat pindah folder atau tab.
  useEffect(() => {
    selection.clear();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, currentFolderId]);

  // Mode hasil pencarian isi tidak mendukung pemilihan banyak item.
  useEffect(() => {
    if (searchScope === "content") selection.clear();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchScope]);

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
        trashCount={trash.items.length}
        connectionMode={connectionMode}
        nasStatus={nasStatus}
        nasLatency={nasLatency}
        isGdriveConnected={isGdriveConnected}
        serverUrl={serverUrl}
        currentUser={currentUser}
        onOpenAccount={() => setAccountModalOpen(true)}
        onOpenServer={() => setServerModalOpen(true)}
        onInstallPwa={handleInstallPwa}
        onLogout={() => {
          setAccountModalOpen(false);
          logout();
        }}
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
              onOpenStudioTool={studio.setActiveTool}
              onUpload={() => fileInputRef.current?.click()}
              onDownload={handleDownload}
              onOpenMedia={setSelectedMedia}
              onOpenAccount={() => setAccountModalOpen(true)}
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
              nasFilesLoading={files.loading}
              nasFilesError={files.error}
              isForeign={isForeignItem}
              thumbnailUrl={thumbnailForItem}
              onFlushQueue={handleFlushQueue}
              onReload={() => files.reload()}
              onGoBack={handleGoBackFolder}
              onBreadcrumb={handleNavigateBreadcrumb}
              onOpenFolder={handleOpenFolder}
              onOpenFile={setSelectedMedia}
              onDelete={handleDelete}
              onFav={handleFav}
              onDownload={handleDownload}
              onRename={handleRename}
              onMove={openMoveModal}
              onShare={shares.open}
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
              searchScope={searchScope}
              onSearchScopeChange={setSearchScope}
              resultsMode={resultsMode}
              searching={contentSearch.searching}
              snippets={searchSnippets}
              folderNames={searchFolderNames}
              searchNotice={contentSearchNotice}
            />
          )}

          {/* TAB 1b: TRASH */}
          {activeTab === "trash" && (
            <TrashTab
              items={trash.items}
              loading={trash.loading}
              error={trash.error}
              busyId={trash.busyId}
              currentUserId={currentUser?.id}
              onReload={trash.reload}
              onRestore={trash.restore}
              onPurge={trash.purge}
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
              tool={studio.activeTool}
              onToolChange={studio.setActiveTool}
              processing={studio.processing}
              successMsg={studio.successMsg}
              img2PdfRef={studio.img2PdfRef}
              mergePdfRef={studio.mergePdfRef}
              compressRef={studio.compressRef}
              removeBgRef={studio.removeBgRef}
              enhanceRef={studio.enhanceRef}
              onImagesToPDF={studio.onImagesToPDF}
              onMergePDFs={studio.onMergePDFs}
              onCompressImage={studio.onCompressImage}
              onRemoveBackground={studio.onRemoveBackground}
              onEnhancePhoto={studio.onEnhancePhoto}
              onOpenStoragePicker={studio.openStoragePicker}
              compressQuality={studio.compressQuality}
              onCompressQualityChange={studio.setCompressQuality}
              lastCompressResult={studio.lastCompressResult}
              bgModelReady={studio.bgModelReady}
              bgConsentGranted={studio.bgConsentGranted}
              bgProgress={studio.bgProgress}
              bgTolerance={studio.bgTolerance}
              onBgToleranceChange={studio.setBgTolerance}
              bgDropShadow={studio.bgDropShadow}
              onBgDropShadowChange={studio.setBgDropShadow}
              onGrantBgConsent={() => studio.setBgConsentGranted(true)}
              lastEnhanceResult={studio.lastEnhanceResult}
              error={studio.error}
              onDismissError={() => studio.setError(null)}
              onSuccess={studio.setSuccessMsg}
              pickedFile={studio.pickedFile}
              onPickedFileHandled={() => studio.setPickedFile(null)}
              onCommitStudioOutput={studio.commitStudioOutput}
              onBgModelReady={studio.markBgModelReady}
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
              shares={shares.activeShares}
              onAddMember={() => setAddMemberModalOpen(true)}
              onRefreshInvites={refreshInvites}
              onRevokeInvite={handleRevokeInvite}
              onRevokeShare={shares.revoke}
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
        currentUser={currentUser}
        onOpenAccount={() => setAccountModalOpen(true)}
        onOpenServer={() => setServerModalOpen(true)}
        onInstallPwa={handleInstallPwa}
        onLogout={() => {
          setAccountModalOpen(false);
          logout();
        }}
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
      {shares.modalFile && (
        <ShareLinkModal
          item={shares.modalFile}
          expiry={shares.expiryOption}
          onExpiryChange={shares.setExpiryOption}
          permission={shares.permission}
          onPermissionChange={shares.setPermission}
          password={shares.passwordInput}
          onPasswordChange={shares.setPasswordInput}
          generatedUrl={shares.generatedUrl}
          generated={shares.linkGenerated}
          generating={shares.generating}
          onGenerate={shares.generate}
          onClose={shares.close}
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
          onTestPing={testPing}
          onSave={saveServerConfig}
          onClose={() => setServerModalOpen(false)}
        />
      )}

      {accountModalOpen && (
        <AccountSettingsModal
          connectionMode={connectionMode}
          currentUser={currentUser}
          localItems={localItems}
          onClose={() => setAccountModalOpen(false)}
        />
      )}

      {/* 7. STORAGE FILE PICKER MODAL (FOR STUDIO TOOLS) */}
      {studio.pickerOpen && (
        <StoragePickerModal
          tool={studio.pickerTool}
          localItems={localItems}
          selectedIds={studio.selectedStorageIds}
          onSelectedIdsChange={studio.setSelectedStorageIds}
          onClose={() => studio.closeStoragePicker()}
          onConfirm={studio.executeStorageSelection}
        />
      )}
    </div>
  );
}


