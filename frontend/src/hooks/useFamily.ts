"use client";

import { useCallback, useEffect, useState } from "react";
import {
  createInvite,
  listInvites,
  revokeInvite,
  type Invite as ServerInvite,
  type Member as ServerMember,
} from "@/lib/api/cloud";
import { listFamilyMembers, updateMemberQuota, type NasFamilyMember, type NasUser } from "@/lib/api/nas";
import type { FamilyMember } from "@/lib/nasDisplay";
import type { ConnectionMode } from "@/lib/types";

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

interface UseFamilyOptions {
  connectionMode: ConnectionMode;
  currentUser: NasUser | null;
}

/**
 * Anggota keluarga dan undangan: daftar, pembuatan undangan, pencabutan,
 * perubahan kuota, serta formulir tambah anggota.
 *
 * Undangan memakai admin key, sedangkan daftar anggota memakai sesi login.
 * Keduanya dimuat terpisah agar kegagalan salah satu tidak mengosongkan yang
 * lain.
 */
export function useFamily({ connectionMode, currentUser }: UseFamilyOptions) {
  const [subTab, setSubTab] = useState<"members" | "shares" | "remote">("members");
  const [modalOpen, setModalOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"member" | "admin">("member");
  const [quotaGB, setQuotaGB] = useState<number>(100);
  const [members, setMembers] = useState<FamilyMember[]>([]);
  const [invites, setInvites] = useState<ServerInvite[]>([]);
  const [generatedInviteUrl, setGeneratedInviteUrl] = useState("");

  // Muat undangan & anggota yang benar-benar tersimpan di server.
  const reload = useCallback(async () => {
    let inviteMembers: ServerMember[] = [];
    try {
      const data = await listInvites();
      setInvites(data.invites);
      inviteMembers = data.members || [];
    } catch {
      // backend belum jalan atau admin key tidak diisi
      setInvites([]);
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
      setMembers(
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
      setMembers(
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
  }, []);

  // Undangan dan anggota tersimpan di server, jadi tidak ada yang bisa dimuat
  // di mode mandiri — dulu tetap dipanggil dan menghasilkan dua request gagal.
  // Tanpa sesi pun server akan menolak, jadi ditunggu sampai pengguna masuk.
  useEffect(() => {
    if (connectionMode !== "nas" || !currentUser) return;
    // `reload` mengisi state dari API; pemicunya perubahan koneksi/pengguna,
    // bukan render.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    reload();
  }, [connectionMode, currentUser, reload]);

  /** Buat undangan baru lalu tampilkan tautannya. */
  const addMember = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!name || !email) return;

      const avatarBg = avatarColorFor(email);

      // Undangan disimpan di server (bukan hanya localStorage browser ini),
      // supaya pemilik bisa melihat status dan tautannya tetap berlaku.
      try {
        const res = await createInvite({
          name,
          email,
          role,
          quota_gb: quotaGB,
          expires_in_hours: 24 * 7,
        });

        const member: FamilyMember = {
          id: res.invite.id,
          name,
          email,
          role,
          usedBytes: 0,
          quotaBytes: quotaGB * 1024 * 1024 * 1024,
          avatarBg,
        };
        setMembers((prev) => [...prev, member]);

        // Tautan dibuka dari HP anggota keluarga, jadi pakai origin halaman ini
        // (sudah host LAN/Tailscale yang sedang dipakai pengunjung).
        setGeneratedInviteUrl(`${window.location.origin}/invite/${res.token}`);
        await reload();
      } catch (err) {
        alert(
          `Gagal membuat undangan: ${(err as Error).message}\n\nPastikan backend NAS berjalan di port 8080.`
        );
      }
    },
    [name, email, role, quotaGB, reload]
  );

  // Ubah kuota satu anggota lalu segarkan kartu agar pemakaian ikut terbarui.
  const updateQuota = useCallback(
    async (id: string, nextQuotaGB: number) => {
      await updateMemberQuota(id, nextQuotaGB);
      await reload();
    },
    [reload]
  );

  const revokeInviteById = useCallback(
    async (id: string) => {
      if (!confirm("Cabut undangan ini? Tautan akan langsung tidak berlaku.")) return;
      try {
        await revokeInvite(id);
        await reload();
      } catch (err) {
        alert(`Gagal mencabut undangan: ${(err as Error).message}`);
      }
    },
    [reload]
  );

  return {
    subTab,
    setSubTab,
    modalOpen,
    setModalOpen,
    name,
    setName,
    email,
    setEmail,
    role,
    setRole,
    quotaGB,
    setQuotaGB,
    members,
    invites,
    generatedInviteUrl,
    setGeneratedInviteUrl,
    addMember,
    reload,
    updateQuota,
    revokeInvite: revokeInviteById,
  };
}
