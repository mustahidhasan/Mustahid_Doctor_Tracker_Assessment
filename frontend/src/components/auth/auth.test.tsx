import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LoginForm } from "./LoginForm";
import { LogoutButton } from "./LogoutButton";
import { AuthGuard } from "./AuthGuard";
import * as auth from "@/lib/auth";

const replace = vi.fn();
const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace, refresh }) }));
vi.mock("@/lib/auth", async (original) => {
  const actual = await original<typeof import("@/lib/auth")>();
  return { ...actual, getCurrentUser: vi.fn(), login: vi.fn(), logout: vi.fn() };
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(auth.getCurrentUser).mockResolvedValue(null);
});

afterEach(cleanup);

describe("LoginForm", () => {
  it("redirects an existing authenticated session to the dashboard", async () => {
    vi.mocked(auth.getCurrentUser).mockResolvedValue({ id: "1", name: "Admin", email: "admin@example.com", role: "admin" });
    render(<LoginForm />);
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/dashboard"));
  });

  it("validates input before requesting login", async () => {
    render(<LoginForm />);
    await screen.findByRole("button", { name: "Sign in securely" });
    fireEvent.click(screen.getByRole("button", { name: "Sign in securely" }));
    expect(screen.getByRole("alert")).toHaveTextContent("valid email");
    expect(auth.login).not.toHaveBeenCalled();
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
  it("redirects an unauthenticated or expired session without rendering protected content", async () => {
    vi.mocked(auth.getCurrentUser).mockResolvedValue(null);
    render(<AuthGuard>{() => <p>Private dashboard</p>}</AuthGuard>);
    expect(screen.queryByText("Private dashboard")).not.toBeInTheDocument();
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/login"));
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
