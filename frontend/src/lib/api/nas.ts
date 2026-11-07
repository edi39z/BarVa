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
	parentId?: string,
	onProgress?: (percent: number) => void
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

export function getDownloadUrl(fileId: string): string {
	const base = getStoredServerUrl();
	const token = getStoredToken();
	if (token) {
		return `${base}/api/v1/files/${fileId}/download?token=${encodeURIComponent(token)}`;
	}
	return `${base}/api/v1/files/${fileId}/download`;
}
