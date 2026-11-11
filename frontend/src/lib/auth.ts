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
