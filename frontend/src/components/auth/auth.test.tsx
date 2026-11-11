import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextRequest } from "next/server";
import { proxy } from "@/proxy";
import { api } from "@/lib/api";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LoginForm } from "./LoginForm";
import { LogoutButton } from "./LogoutButton";
import { AuthGuard } from "./AuthGuard";
import * as auth from "@/lib/auth";

const replace = vi.fn();
const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace, refresh }), usePathname: () => "/patients" }));
vi.mock("@/lib/auth", async (original) => {
  const actual = await original<typeof import("@/lib/auth")>();
  return { ...actual, getCurrentUser: vi.fn(), login: vi.fn(), logout: vi.fn(), clearSession: vi.fn(async () => undefined) };
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(auth.getCurrentUser).mockResolvedValue(null);
});

afterEach(() => { cleanup(); window.history.replaceState(null, "", "/"); });

describe("LoginForm", () => {
  it("does not call the session API on render (the proxy handles signed-in users)", () => {
    render(<LoginForm />);
    expect(auth.getCurrentUser).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Email address")).toHaveFocus();
  });

  it("validates input before requesting login", async () => {
    render(<LoginForm />);
    await screen.findByRole("button", { name: "Sign in securely" });
    fireEvent.click(screen.getByRole("button", { name: "Sign in securely" }));
    expect(screen.getByRole("alert")).toHaveTextContent("valid email");
    expect(auth.login).not.toHaveBeenCalled();
  });

  it("marks the first invalid field and moves focus to it", () => {
    render(<LoginForm />);
    fireEvent.change(screen.getByLabelText("Email address"), { target: { value: "admin@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Sign in securely" }));
    const password = screen.getByLabelText("Password");
    expect(password).toHaveFocus();
    expect(password).toHaveAttribute("aria-invalid", "true");
    expect(password).toHaveAccessibleDescription("Enter your password.");
    expect(screen.getByLabelText("Email address")).toHaveAttribute("aria-invalid", "false");
  });

  it("toggles password visibility with an accessible pressed state", () => {
    render(<LoginForm />);
    const toggle = screen.getByRole("button", { name: "Show password" });
    expect(toggle).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(toggle);
    expect(screen.getByLabelText("Password")).toHaveAttribute("type", "text");
    expect(screen.getByRole("button", { name: "Hide password" })).toHaveAttribute("aria-pressed", "true");
  });

  it("explains an expired session and returns to the requested page after login", async () => {
    window.history.replaceState(null, "", "/login?expired=1&next=%2Fpatients%3Fpage%3D2");
    vi.mocked(auth.login).mockResolvedValue({ id: "1", name: "Admin", email: "admin@example.com", role: "admin" });
    render(<LoginForm />);
    expect(screen.getByRole("status")).toHaveTextContent("Your session has expired");
    fireEvent.change(screen.getByLabelText("Email address"), { target: { value: "admin@example.com" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "safe-password" } });
    fireEvent.click(screen.getByRole("button", { name: "Sign in securely" }));
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/patients?page=2"));
  });

  it("ignores unsafe next destinations", async () => {
    window.history.replaceState(null, "", "/login?next=%2F%2Fevil.example");
    vi.mocked(auth.login).mockResolvedValue({ id: "1", name: "Admin", email: "admin@example.com", role: "admin" });
    render(<LoginForm />);
    fireEvent.change(screen.getByLabelText("Email address"), { target: { value: "admin@example.com" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "safe-password" } });
    fireEvent.click(screen.getByRole("button", { name: "Sign in securely" }));
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/dashboard"));
  });

  it("shows authentication errors", async () => {
    vi.mocked(auth.login).mockRejectedValue(new Error("Invalid email or password"));
    render(<LoginForm />);
    await screen.findByRole("button", { name: "Sign in securely" });
    fireEvent.change(screen.getByLabelText("Email address"), { target: { value: "admin@example.com" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "bad-password" } });
    fireEvent.click(screen.getByRole("button", { name: "Sign in securely" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Invalid email or password");
  });

  it("shows loading and navigates after successful login", async () => {
    let resolveLogin: ((value: auth.AdminUser) => void) | undefined;
    vi.mocked(auth.login).mockImplementation(() => new Promise((resolve) => { resolveLogin = resolve; }));
    render(<LoginForm />);
    await screen.findByRole("button", { name: "Sign in securely" });
    fireEvent.change(screen.getByLabelText("Email address"), { target: { value: "admin@example.com" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "safe-password" } });
    fireEvent.click(screen.getByRole("button", { name: "Sign in securely" }));
    expect(screen.getByRole("button", { name: "Signing in…" })).toBeDisabled();
    resolveLogin?.({ id: "1", name: "Admin", email: "admin@example.com", role: "admin" });
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/dashboard"));
  });
});

describe("AuthGuard", () => {
  it("clears an expired session and redirects to login with a return path, without rendering protected content", async () => {
    vi.mocked(auth.getCurrentUser).mockResolvedValue(null);
    render(<AuthGuard>{() => <p>Private dashboard</p>}</AuthGuard>);
    expect(screen.queryByText("Private dashboard")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Verifying secure session");
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/login?expired=1&next=%2Fpatients"));
    expect(auth.clearSession).toHaveBeenCalled();
  });

  it("offers a retry instead of signing out when the session check fails", async () => {
    vi.mocked(auth.getCurrentUser).mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce({ id: "1", name: "Admin", email: "admin@example.com", role: "admin" });
    render(<AuthGuard>{(user) => <p>Welcome {user.name}</p>}</AuthGuard>);
    fireEvent.click(await screen.findByRole("button", { name: "Try again" }));
    expect(await screen.findByText("Welcome Admin")).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });

  it("restores a valid session and renders protected content", async () => {
    vi.mocked(auth.getCurrentUser).mockResolvedValue({ id: "1", name: "Admin", email: "admin@example.com", role: "admin" });
    render(<AuthGuard>{(user) => <p>Welcome {user.name}</p>}</AuthGuard>);
    expect(await screen.findByText("Welcome Admin")).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalledWith("/login");
  });
});

it("logs out and returns to login", async () => {
  vi.mocked(auth.logout).mockResolvedValue();
  render(<LogoutButton />);
  fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
  await waitFor(() => expect(replace).toHaveBeenCalledWith("/login"));
});

describe("session helpers", () => {
  it("accepts only same-site relative return paths", () => {
    expect(auth.safeNextPath("/doctors/abc?tab=1")).toBe("/doctors/abc?tab=1");
    for (const unsafe of ["https://evil.example", "//evil.example", "/\\evil.example", "javascript:alert(1)", "/login", "/api/auth/me", "", null]) expect(auth.safeNextPath(unsafe)).toBeNull();
    expect(auth.expiredLoginUrl("/patients?page=2")).toBe("/login?expired=1&next=%2Fpatients%3Fpage%3D2");
    expect(auth.expiredLoginUrl("//evil")).toBe("/login?expired=1");
  });

  it("on a 401 API response clears the stale cookie and sends the user to login with a return path", async () => {
    const replaceLocation = vi.fn();
    vi.stubGlobal("location", { ...window.location, origin: "http://localhost:3000", pathname: "/doctors", search: "?page=3", replace: replaceLocation });
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: "Invalid or expired session" }), { status: 401 })));
    await expect(api("/api/doctors")).rejects.toMatchObject({ status: 401, message: "Your session has expired. Please sign in again." });
    expect(auth.clearSession).toHaveBeenCalled();
    expect(replaceLocation).toHaveBeenCalledWith(new URL("/login?expired=1&next=%2Fdoctors%3Fpage%3D3", "http://localhost:3000"));
    vi.unstubAllGlobals();
  });
});

describe("route proxy", () => {
  const request = (path: string, cookie = false) => new NextRequest(new URL(path, "http://localhost:3000"), { headers: cookie ? { cookie: "doctor_tracker_session=token" } : {} });

  it("sends visitors without a session to login with a return path", () => {
    const response = proxy(request("/patients/abc?tab=1"));
    expect(response.headers.get("location")).toBe("http://localhost:3000/login?next=%2Fpatients%2Fabc%3Ftab%3D1");
  });

  it("lets signed-in users through and redirects them away from login", () => {
    expect(proxy(request("/doctors", true)).headers.get("location")).toBeNull();
    expect(proxy(request("/login", true)).headers.get("location")).toBe("http://localhost:3000/dashboard");
  });

  it("does not loop when the session expired", () => {
    expect(proxy(request("/login?expired=1", true)).headers.get("location")).toBeNull();
    expect(proxy(request("/login")).headers.get("location")).toBeNull();
  });
});
