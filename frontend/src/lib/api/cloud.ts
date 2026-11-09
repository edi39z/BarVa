// Klien API untuk fitur cloud yang disimpan di backend Go (bukan browser):
// Google Drive OAuth, undangan keluarga, dan share link.
//
// Kenapa lewat backend: refresh token Google tidak boleh disimpan di browser,
// dan supaya token tidak kedaluwarsa tiap 1 jam maka server yang me-refresh.

import { getStoredToken } from "./nas";

const PORT = "8080";

export function backendBase(): string {
  if (typeof window === "undefined") return `http://localhost:${PORT}`;
  const override = window.localStorage.getItem("nas_backend_url");
  if (override) return override.replace(/\/$/, "");
  // Pakai hostname yang sama dengan halaman supaya HP lain di rumah juga bisa.
  const host = window.location.hostname || "localhost";
  return `http://${host}:${PORT}`;
}

const STORAGE_KEY_ADMIN = "nas_admin_key";

// Admin key dikirim ke backend untuk endpoint sensitif (Google Drive &
// undangan). Disimpan hanya di localStorage perangkat ini.
export function getAdminKey(): string {
  if (typeof window === "undefined") return "";
  return window.localStorage.getItem(STORAGE_KEY_ADMIN) || "";
}

export function setAdminKey(key: string): void {
  if (typeof window === "undefined") return;
  const clean = key.trim();
  if (clean) window.localStorage.setItem(STORAGE_KEY_ADMIN, clean);
  else window.localStorage.removeItem(STORAGE_KEY_ADMIN);
}

async function parseResponse<T>(res: Response): Promise<T> {
  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { error: text };
  }
  if (!res.ok) {
    const msg =
      (data as { error?: string })?.error || `Permintaan gagal (${res.status})`;
    throw new Error(msg);
  }
  return data as T;
}

async function j<T>(path: string, init?: RequestInit): Promise<T> {
  const adminKey = getAdminKey();
  const res = await fetch(`${backendBase()}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(adminKey ? { "X-Admin-Key": adminKey } : {}),
      ...(init?.headers || {}),
    },
  });
  return parseResponse<T>(res);
}

// Endpoint yang butuh sesi login (Bearer token), bukan admin key.
async function jAuth<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getStoredToken();
  const res = await fetch(`${backendBase()}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers || {}),
    },
  });
  return parseResponse<T>(res);
}

// ---------------- Google Drive ----------------

export type GDriveStatus = {
  has_client: boolean;
  connected: boolean;
  email: string;
  scope: string;
  connected_at: string;
  redirect_uri: string;
  token_valid: boolean;
  expires_at: number;
  full_drive: boolean;
  server_time: string;
};

export type GDriveFile = {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  modifiedTime: string;
  thumbnailLink?: string;
  webViewLink?: string;
};

export type GDriveQuota = {
  user?: { displayName?: string; emailAddress?: string };
  storageQuota?: {
    limit?: string;
    usage?: string;
    usageInDrive?: string;
    usageInDriveTrash?: string;
  };
};

export function gdriveStatus() {
  return j<GDriveStatus>("/api/v1/gdrive/status");
}

export function gdriveSaveClient(
  clientId: string,
  clientSecret: string,
  redirectUri: string
) {
  return j<{ success: boolean; redirect_uri: string }>(
    "/api/v1/gdrive/client",
    {
      method: "POST",
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
      }),
    }
  );
}

export function gdriveAuthUrl() {
  return j<{ url: string; redirect_uri: string }>("/api/v1/gdrive/auth-url");
}

export function gdriveQuota() {
  return j<GDriveQuota>("/api/v1/gdrive/quota");
}

export function gdriveFiles(opts?: { q?: string; folder?: string; limit?: number }) {
  const p = new URLSearchParams();
  if (opts?.q) p.set("q", opts.q);
  if (opts?.folder) p.set("folder", opts.folder);
  if (opts?.limit) p.set("limit", String(opts.limit));
  return j<{ files: GDriveFile[] }>(`/api/v1/gdrive/files?${p.toString()}`);
}

export function gdriveDownloadUrl(id: string) {
  const key = getAdminKey();
  const suffix = key ? `?admin_key=${encodeURIComponent(key)}` : "";
  return `${backendBase()}/api/v1/gdrive/file/${id}/download${suffix}`;
}

export function gdriveDisconnect() {
  return j<{ success: boolean }>("/api/v1/gdrive/disconnect", { method: "POST" });
}

// ---------------- Undangan keluarga ----------------

export type Invite = {
  id: string;
  name: string;
  email: string;
  role: string;
  quota_gb: number;
  token_hint: string;
  status: "pending" | "accepted" | "revoked" | "expired";
  created_at: string;
  expires_at: string;
  accepted_at?: string;
};

export type Member = {
  id: string;
  name: string;
  email: string;
  role: string;
  quota_gb: number;
  joined_at: string;
  invite_id: string;
};

export function listInvites() {
  return j<{
    invites: Invite[];
    members: Member[];
    counts: { pending: number; accepted: number; expired: number; revoked: number };
  }>("/api/v1/invites");
}

export function createInvite(input: {
  name: string;
  email: string;
  role?: string;
  quota_gb?: number;
  expires_in_hours?: number;
}) {
  return j<{ invite: Invite; token: string; url: string; web_url: string }>(
    "/api/v1/invites",
    { method: "POST", body: JSON.stringify(input) }
  );
}

export function revokeInvite(id: string) {
  return j<{ success: boolean }>(`/api/v1/invites/${id}`, { method: "DELETE" });
}

export function peekInvite(token: string) {
  return j<{
    valid: boolean;
    status: string;
    name: string;
    email: string;
    role: string;
    quota_gb: number;
    expires_at: string;
  }>(`/api/v1/public/invites/${encodeURIComponent(token)}`);
}

export function acceptInvite(token: string) {
  return j<{ success: boolean; member: Member }>(
    `/api/v1/public/invites/${encodeURIComponent(token)}/accept`,
    { method: "POST" }
  );
}

// ---------------- Share link ----------------

// Baris dari GET /api/v1/shares memakai nama field PascalCase (struct Go).
export type ShareRecord = {
  ID: string;
  NodeID: string;
  Permission: string;
  ExpiresAt: string | null;
  CreatedAt: string;
  HasPassword: boolean | null;
  NodeName: string;
  IsDirectory: boolean;
  SizeBytes: number | null;
  MimeType: string | null;
};

export type CreatedShare = {
  id: string;
  permission: string;
  expires_at: string | null;
  created_at: string;
  raw_token: string;
  link_url: string;
};

export async function createShare(input: {
  node_id: string;
  permission?: "viewer" | "editor" | "uploader";
  password?: string;
  expires_in?: "24h" | "7d" | "30d";
}) {
  const res = await jAuth<{ data: CreatedShare }>("/api/v1/shares", {
    method: "POST",
    body: JSON.stringify(input),
  });
  return res.data;
}

export async function listShares() {
  const res = await jAuth<{ data: ShareRecord[] | null }>("/api/v1/shares");
  return res.data ?? [];
}

export async function deleteShare(id: string) {
  await jAuth<{ data: { message: string } }>(
    `/api/v1/shares/${encodeURIComponent(id)}`,
    { method: "DELETE" }
  );
}
