"use client";

import { useCallback, useEffect, useState } from "react";
import {
  fetchMe,
  getServerUrl,
  getStoredToken,
  getStoredUser,
  logoutNas,
  pingNasServer,
  setStoredServerUrl,
  type NasHealthResponse,
  type NasUser,
} from "@/lib/api/nas";
import { gdriveStatus, getAdminKey, setAdminKey } from "@/lib/api/cloud";
import type { AppTab, ConnectionMode } from "@/lib/types";

const DEFAULT_SERVER_URL = "http://localhost:8080";

interface UseNasSessionOptions {
  activeTab: AppTab;
}

/**
 * Sesi dan koneksi server: mode aktif, URL/admin key, pengguna yang masuk,
 * kesehatan server, status jaringan browser, dan status Google Drive.
 *
 * Konfigurasi server hanya ada di localStorage klien, jadi nilainya dimuat di
 * efek (bukan initializer `useState`) agar render pertama sama dengan hasil
 * prerender dan tidak memicu hydration mismatch.
 */
export function useNasSession({ activeTab }: UseNasSessionOptions) {
  const [connectionMode, setConnectionMode] = useState<ConnectionMode>("nas");
  const [serverUrl, setServerUrl] = useState(DEFAULT_SERVER_URL);
  const [inputServerUrl, setInputServerUrl] = useState(DEFAULT_SERVER_URL);
  const [inputAdminKey, setInputAdminKey] = useState("");
  const [currentUser, setCurrentUser] = useState<NasUser | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [nasHealth, setNasHealth] = useState<NasHealthResponse | null>(null);
  const [nasStatus, setNasStatus] = useState<"online" | "offline" | "checking">("checking");
  const [nasLatency, setNasLatency] = useState<number | null>(null);
  const [isOnline, setIsOnline] = useState(true);
  const [serverModalOpen, setServerModalOpen] = useState(false);
  const [isTestingPing, setIsTestingPing] = useState(false);
  const [pingTestMessage, setPingTestMessage] = useState("");
  const [isGdriveConnected, setIsGdriveConnected] = useState(false);

  // Konfigurasi server tersimpan di perangkat ini, bukan di server.
  useEffect(() => {
    const savedUrl = getServerUrl();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setServerUrl(savedUrl);
    setInputServerUrl(savedUrl);
    setInputAdminKey(getAdminKey());
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

  /** Uji koneksi ke URL yang sedang diketik, tanpa menyimpannya. */
  const testPing = useCallback(async () => {
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
  }, [inputServerUrl]);

  const saveServerConfig = useCallback(() => {
    setStoredServerUrl(inputServerUrl);
    setAdminKey(inputAdminKey);
    setServerUrl(inputServerUrl);
    setServerModalOpen(false);
  }, [inputServerUrl, inputAdminKey]);

  const logout = useCallback(async () => {
    await logoutNas();
    setCurrentUser(null);
  }, []);

  return {
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
  };
}
