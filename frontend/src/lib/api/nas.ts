"use client";

export interface NasHealthResponse {
	status: string;
	database: boolean;
	storage_path: string;
	version: string;
	time: string;
	latencyMs?: number;
}

const STORAGE_KEY_SERVER_URL = "nas_server_url";
const STORAGE_KEY_TOKEN = "nas_auth_token";
const STORAGE_KEY_USER = "nas_auth_user";
const DEFAULT_SERVER_URL = "http://localhost:8080";

export function getStoredServerUrl(): string {
	if (typeof window === "undefined") return DEFAULT_SERVER_URL;
	return localStorage.getItem(STORAGE_KEY_SERVER_URL) || DEFAULT_SERVER_URL;
}

export function setStoredServerUrl(url: string): void {
	if (typeof window === "undefined") return;
	const cleanUrl = url.replace(/\/+$/, "");
	localStorage.setItem(STORAGE_KEY_SERVER_URL, cleanUrl);
}

export function getStoredToken(): string | null {
	if (typeof window === "undefined") return null;
	return localStorage.getItem(STORAGE_KEY_TOKEN);
}

export function setStoredToken(token: string | null): void {
	if (typeof window === "undefined") return;
	if (token) {
		localStorage.setItem(STORAGE_KEY_TOKEN, token);
	} else {
		localStorage.removeItem(STORAGE_KEY_TOKEN);
	}
}

// Profil terakhir disimpan agar aplikasi tetap bisa dibuka saat offline.
// Isinya hanya data publik (id, email, username, role) — bukan kredensial.
export function getStoredUser(): NasUser | null {
	if (typeof window === "undefined") return null;
	const raw = localStorage.getItem(STORAGE_KEY_USER);
	if (!raw) return null;
	try {
		return JSON.parse(raw) as NasUser;
	} catch {
		return null;
	}
}

export function setStoredUser(user: NasUser | null): void {
	if (typeof window === "undefined") return;
	if (user) {
		localStorage.setItem(STORAGE_KEY_USER, JSON.stringify(user));
	} else {
		localStorage.removeItem(STORAGE_KEY_USER);
	}
}

export async function pingNasServer(serverUrl?: string): Promise<NasHealthResponse> {
	const base = serverUrl || getStoredServerUrl();
	const startTime = performance.now();

	const controller = new AbortController();
	const timeoutId = setTimeout(() => controller.abort(), 4000);

	try {
		const res = await fetch(`${base}/health`, {
			signal: controller.signal,
			headers: { "Cache-Control": "no-cache" },
		});
		clearTimeout(timeoutId);

		if (!res.ok) {
			throw new Error(`Server returned status: ${res.status}`);
		}

		const data: NasHealthResponse = await res.json();
		data.latencyMs = Math.round(performance.now() - startTime);
		return data;
	} catch (err: unknown) {
		clearTimeout(timeoutId);
		throw err;
	}
}

export async function uploadToNas(
	file: File,
	parentId?: string | null,
	onProgress?: (percent: number) => void,
	overwrite?: boolean
): Promise<unknown> {
	const base = getStoredServerUrl();
	const token = getStoredToken();

	return new Promise((resolve, reject) => {
		const xhr = new XMLHttpRequest();
		xhr.open("POST", `${base}/api/v1/files/upload`);

		if (token) {
			xhr.setRequestHeader("Authorization", `Bearer ${token}`);
		}

		xhr.upload.onprogress = (e) => {
			if (e.lengthComputable && onProgress) {
				const percent = Math.round((e.loaded / e.total) * 100);
				onProgress(percent);
			}
		};

		xhr.onload = () => {
			if (xhr.status >= 200 && xhr.status < 300) {
				try {
					const json = JSON.parse(xhr.responseText);
					resolve(json.data);
				} catch {
					resolve(null);
				}
			} else {
				try {
					const errJson = JSON.parse(xhr.responseText);
					reject(new Error(errJson.error?.message || `Upload failed with status ${xhr.status}`));
				} catch {
					reject(new Error(`Upload failed with status ${xhr.status}`));
				}
			}
		};

		xhr.onerror = () => reject(new Error("Network error during upload to NAS"));

		const formData = new FormData();
		formData.append("file", file);
		if (parentId && parentId !== "root") {
			formData.append("parent_id", parentId);
		}
		if (overwrite) {
			formData.append("overwrite", "true");
		}

		xhr.send(formData);
	});
}

export function getStreamUrl(fileId: string): string {
	const base = getStoredServerUrl();
	const token = getStoredToken();
	if (token) {
		return `${base}/api/v1/files/${fileId}/stream?token=${encodeURIComponent(token)}`;
	}
	return `${base}/api/v1/files/${fileId}/stream`;
}

// URL pratinjau kecil untuk tag <img>. Token lewat query karena elemen gambar
// tidak bisa mengirim header Authorization.
export function getThumbnailUrl(fileId: string, size: "small" | "large" = "small"): string {
	const base = getStoredServerUrl();
	const token = getStoredToken();
	const params = new URLSearchParams({ size });
	if (token) params.set("token", token);
	return `${base}/api/v1/files/${fileId}/thumbnail?${params.toString()}`;
}

// ---------------- File manager NAS ----------------

// Backend mengembalikan nama field PascalCase (struct Go tanpa json tag).
export interface NasFileNode {
	ID: string;
	OwnerID: string;
	ParentID: string | null;
	Name: string;
	IsDirectory: boolean;
	ObjectID: string | null;
	SizeBytes: number | null;
	MimeType: string | null;
	CreatedAt: string;
	UpdatedAt: string;
}

function authHeaders(): HeadersInit {
	const token = getStoredToken();
	return token ? { Authorization: `Bearer ${token}` } : {};
}

async function nasFetch(path: string, init?: RequestInit): Promise<Response> {
	const res = await fetch(`${getStoredServerUrl()}${path}`, {
		...init,
		headers: { ...authHeaders(), ...(init?.headers || {}) },
	});
	if (res.status === 401) {
		setStoredToken(null);
		setStoredUser(null);
		throw new Error("Sesi berakhir. Silakan login ulang.");
	}
	return res;
}

export async function listNasFiles(parentId?: string | null): Promise<NasFileNode[]> {
	const query = parentId ? `?parent_id=${encodeURIComponent(parentId)}` : "";
	const res = await nasFetch(`/api/v1/files${query}`);
	if (!res.ok) throw new Error(await parseError(res));
	const json = (await res.json()) as { data: NasFileNode[] | null };
	return json.data ?? [];
}

/**
 * Seluruh foto & video lintas folder. Galeri memakai ini agar media di
 * subfolder tetap terlihat, bukan hanya isi folder yang sedang dibuka.
 */
export async function listNasMedia(limit?: number): Promise<NasFileNode[]> {
	const query = limit ? `?limit=${limit}` : "";
	const res = await nasFetch(`/api/v1/media${query}`);
	if (!res.ok) throw new Error(await parseError(res));
	const json = (await res.json()) as { data: NasFileNode[] | null };
	return json.data ?? [];
}

export async function createNasFolder(
	name: string,
	parentId?: string | null
): Promise<NasFileNode> {
	const res = await nasFetch("/api/v1/files/folder", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ name, parent_id: parentId || null }),
	});
	if (!res.ok) throw new Error(await parseError(res));
	const json = (await res.json()) as { data: NasFileNode };
	return json.data;
}

export async function deleteNasFile(id: string): Promise<void> {
	const res = await nasFetch(`/api/v1/files/${encodeURIComponent(id)}`, {
		method: "DELETE",
	});
	if (!res.ok) throw new Error(await parseError(res));
}

export async function renameNasFile(id: string, name: string): Promise<void> {
	const res = await nasFetch(`/api/v1/files/${encodeURIComponent(id)}`, {
		method: "PATCH",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ name }),
	});
	if (!res.ok) throw new Error(await parseError(res));
}

export async function moveNasFile(id: string, parentId: string | null): Promise<void> {
	const res = await nasFetch(`/api/v1/files/${encodeURIComponent(id)}/move`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ parent_id: parentId }),
	});
	if (!res.ok) throw new Error(await parseError(res));
}

export function getDownloadUrl(fileId: string): string {
	const base = getStoredServerUrl();
	const token = getStoredToken();
	if (token) {
		return `${base}/api/v1/files/${fileId}/download?token=${encodeURIComponent(token)}`;
	}
	return `${base}/api/v1/files/${fileId}/download`;
}

// ---------------- Trash (soft-delete recovery) ----------------

export interface TrashedNode {
	ID: string;
	OwnerID: string;
	ParentID: string | null;
	Name: string;
	IsDirectory: boolean;
	ObjectID: string | null;
	SizeBytes: number | null;
	MimeType: string | null;
	DeletedAt: string;
	CreatedAt: string;
	UpdatedAt: string;
	ParentName: string | null;
}

export async function listNasTrash(): Promise<TrashedNode[]> {
	const res = await nasFetch("/api/v1/trash");
	if (!res.ok) throw new Error(await parseError(res));
	const json = (await res.json()) as { data: TrashedNode[] | null };
	return json.data ?? [];
}

export async function restoreNasFile(id: string): Promise<void> {
	const res = await nasFetch(`/api/v1/trash/${encodeURIComponent(id)}/restore`, {
		method: "POST",
	});
	if (!res.ok) throw new Error(await parseError(res));
}

export async function purgeNasFile(id: string): Promise<void> {
	const res = await nasFetch(`/api/v1/trash/${encodeURIComponent(id)}`, {
		method: "DELETE",
	});
	if (!res.ok) throw new Error(await parseError(res));
}

// ---------------- Autentikasi NAS ----------------

export interface NasUser {
	id: string;
	email: string;
	username: string;
	role: "owner" | "admin" | "member";
	/** 0 berarti belum dibatasi. */
	quota_bytes?: number;
	created_at?: string;
}

interface ApiError {
	error?: { code?: string; message?: string };
}

async function parseError(res: Response): Promise<string> {
	try {
		const data = (await res.json()) as ApiError;
		return data.error?.message || `Permintaan gagal (${res.status})`;
	} catch {
		return `Permintaan gagal (${res.status})`;
	}
}

export async function registerNas(input: {
	email: string;
	username: string;
	password: string;
	/** Bila diisi, server memakai role & kuota dari undangan ini. */
	inviteToken?: string;
}): Promise<NasUser> {
	const { inviteToken, ...rest } = input;
	const res = await fetch(`${getStoredServerUrl()}/api/v1/auth/register`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(
			inviteToken ? { ...rest, invite_token: inviteToken } : rest
		),
	});
	if (!res.ok) throw new Error(await parseError(res));
	const json = (await res.json()) as { data: NasUser };
	return json.data;
}

export async function loginNas(input: {
	email: string;
	password: string;
}): Promise<{ token: string; user: NasUser }> {
	const res = await fetch(`${getStoredServerUrl()}/api/v1/auth/login`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(input),
	});
	if (!res.ok) throw new Error(await parseError(res));
	const json = (await res.json()) as {
		data: { token: string; user: NasUser };
	};
	setStoredToken(json.data.token);
	setStoredUser(json.data.user);
	return json.data;
}

export async function fetchMe(): Promise<NasUser | null> {
	const token = getStoredToken();
	if (!token) return null;

	const res = await fetch(`${getStoredServerUrl()}/api/v1/auth/me`, {
		headers: { Authorization: `Bearer ${token}` },
	});
	if (res.status === 401) {
		setStoredToken(null);
		setStoredUser(null);
		return null;
	}
	if (!res.ok) throw new Error(await parseError(res));
	const json = (await res.json()) as { data: NasUser };
	setStoredUser(json.data);
	return json.data;
}

export async function logoutNas(): Promise<void> {
	const token = getStoredToken();
	if (token) {
		try {
			await fetch(`${getStoredServerUrl()}/api/v1/auth/logout`, {
				method: "POST",
				headers: { Authorization: `Bearer ${token}` },
			});
		} catch {
			// tetap hapus token lokal meski server tidak terjangkau
		}
	}
	setStoredToken(null);
	setStoredUser(null);
}
