"use client";

function getCsrf(): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(/(?:^|; )scrm_csrf=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

export async function api<T = unknown>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const headers = new Headers(options.headers || {});
  if (!headers.has("Content-Type") && options.body) {
    headers.set("Content-Type", "application/json");
  }
  const method = (options.method || "GET").toUpperCase();
  if (["POST", "PUT", "PATCH", "DELETE"].includes(method)) {
    const csrf = getCsrf();
    if (csrf) headers.set("X-CSRF-Token", csrf);
  }

  const res = await fetch(path, {
    ...options,
    headers,
    credentials: "include",
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `Request failed (${res.status})`);
  }
  return data as T;
}
