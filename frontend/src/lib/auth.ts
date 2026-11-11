export interface AdminUser {
  userId?: string;
  id?: string;
  name: string;
  email: string;
  role: "admin";
}

export async function getCurrentUser(): Promise<AdminUser | null> {
  const response = await fetch("/api/auth/me", { credentials: "same-origin", cache: "no-store" });
  if (response.status === 401) return null;
  if (!response.ok) throw new Error("Unable to verify your session");
  return (await response.json() as { user: AdminUser }).user;
}

export async function login(email: string, password: string): Promise<AdminUser> {
  const response = await fetch("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify({ email, password }),
  });
  const body = await response.json().catch(() => ({})) as { error?: string; user?: AdminUser };
  if (!response.ok || !body.user) throw new Error(body.error || "Unable to sign in");
  return body.user;
}

export async function logout(): Promise<void> {
  const response = await fetch("/api/auth/logout", { method: "POST", credentials: "same-origin" });
  if (!response.ok && response.status !== 401) throw new Error("Unable to sign out");
}

/** Clears a stale/expired HttpOnly session cookie (server-side), ignoring failures. */
export async function clearSession(): Promise<void> {
  await logout().catch(() => undefined);
}

/**
 * Only same-site relative paths are accepted as a post-login destination (no open redirects:
 * rejects absolute URLs, protocol-relative "//host", and backslash tricks).
 */
export function safeNextPath(value: string | null | undefined): string | null {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("\\") || /[\u0000-\u001f]/.test(value)) return null;
  if (value === "/login" || value.startsWith("/login?") || value.startsWith("/api/")) return null;
  return value;
}

/** Login URL used when a session has expired, preserving where the user was. */
export function expiredLoginUrl(currentPath?: string): string {
  const params = new URLSearchParams({ expired: "1" });
  const next = safeNextPath(currentPath);
  if (next) params.set("next", next);
  return `/login?${params}`;
}
