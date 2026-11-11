import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import axe from "axe-core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as auth from "@/lib/auth";
import * as doctorsApi from "@/lib/doctors";
import * as patientsApi from "@/lib/patients";
import { createDashboardClient } from "@/lib/dashboard";
import { LoginForm } from "@/components/auth/LoginForm";
import { ProtectedShell } from "@/components/auth/ProtectedShell";
import { DashboardManager } from "@/components/dashboard/DashboardManager";
import { DoctorsManager } from "@/components/doctors/DoctorsManager";
import { PatientsManager } from "@/components/patients/PatientsManager";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Modal } from "@/components/ui/Modal";
import { Breadcrumbs } from "./PageHeader";

let pathname = "/doctors";
const replace = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace, push: vi.fn(), refresh: vi.fn() }), usePathname: () => pathname }));
vi.mock("@/lib/auth", async (original) => ({ ...(await original<typeof import("@/lib/auth")>()), getCurrentUser: vi.fn(), logout: vi.fn(), clearSession: vi.fn() }));
vi.mock("@/lib/doctors", async (original) => ({ ...(await original<typeof import("@/lib/doctors")>()), listDoctors: vi.fn(), getDoctorFilterOptions: vi.fn() }));
vi.mock("@/lib/patients", async (original) => ({ ...(await original<typeof import("@/lib/patients")>()), listPatients: vi.fn(), getPatientFilterOptions: vi.fn() }));

const admin: auth.AdminUser = { id: "1", name: "Ada Admin", email: "admin@example.com", role: "admin" };
const pagination = { page: 1, limit: 10, total: 1, totalPages: 1, hasNextPage: false, hasPreviousPage: false };

beforeEach(() => {
  vi.clearAllMocks();
  pathname = "/doctors";
  vi.mocked(auth.getCurrentUser).mockResolvedValue(admin);
  vi.mocked(doctorsApi.listDoctors).mockResolvedValue({ data: [{ _id: "d1", name: "Dr. Ada", specialization: "Cardiology", hospital: "City", phone: "+1 555 0100 1234", email: "ada@example.com", createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z" }], pagination });
  vi.mocked(doctorsApi.getDoctorFilterOptions).mockResolvedValue({ specializations: ["Cardiology"], hospitals: ["City"] });
  vi.mocked(patientsApi.listPatients).mockResolvedValue({ data: [{ _id: "p1", doctorId: "d1", doctor: { _id: "d1", name: "Dr. Ada", specialization: "Cardiology", hospital: "City" }, name: "Pat Lee", condition: "Asthma", createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z" }], pagination });
  vi.mocked(patientsApi.getPatientFilterOptions).mockResolvedValue({ conditions: ["Asthma"], doctors: [{ _id: "d1", name: "Dr. Ada", specialization: "Cardiology" }] });
});
afterEach(() => { cleanup(); document.body.style.overflow = ""; });

/** Runs axe-core on the rendered DOM. Color contrast is excluded because jsdom does not compute styles (Lighthouse covers it in the browser). */
async function expectNoAxeViolations(container: Element = document.body) {
  const results = await axe.run(container, { rules: { "color-contrast": { enabled: false } } });
  const summary = results.violations.map((violation) => `${violation.id}: ${violation.nodes.map((node) => node.target.join(" ")).join(", ")}`);
  expect(summary).toEqual([]);
}

const renderShell = async (content = <main><h1>Page content</h1></main>) => {
  render(<ProtectedShell>{content}</ProtectedShell>);
  await screen.findByText("Page content");
};

describe("application shell", () => {
  it("provides a skip link, labelled navigation, active page state, and the signed-in user", async () => {
    await renderShell();
    expect(screen.getByRole("link", { name: "Skip to main content" })).toHaveAttribute("href", "#main-content");
    expect(document.getElementById("main-content")).toHaveAttribute("tabindex", "-1");
    const sidebar = screen.getByRole("navigation", { name: "Main navigation" });
    expect(within(sidebar).getByRole("link", { name: "Doctors" })).toHaveAttribute("aria-current", "page");
    expect(within(sidebar).getByRole("link", { name: "Dashboard" })).not.toHaveAttribute("aria-current");
    expect(screen.getByText("admin@example.com")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sign out" })).toBeInTheDocument();
  });

  it("marks nested routes as active", async () => {
    pathname = "/patients/abc";
    await renderShell();
    expect(within(screen.getByRole("navigation", { name: "Main navigation" })).getByRole("link", { name: "Patients" })).toHaveAttribute("aria-current", "page");
  });

  it("opens the mobile drawer as a focus-trapped dialog and closes it with Escape", async () => {
    await renderShell();
    const menuButton = screen.getByRole("button", { name: "Open navigation menu" });
    expect(menuButton).toHaveAttribute("aria-expanded", "false");
    menuButton.focus();
    fireEvent.click(menuButton);
    const drawer = screen.getByRole("dialog", { name: "Navigation menu" });
    expect(drawer).toHaveAttribute("aria-modal", "true");
    expect(menuButton).toHaveAttribute("aria-expanded", "true");
    expect(drawer.contains(document.activeElement)).toBe(true);

    // Tab from the last focusable element wraps to the first one.
    const focusables = within(drawer).getAllByRole("link").concat(within(drawer).getAllByRole("button"));
    const signOut = within(drawer).getByRole("button", { name: "Sign out" });
    signOut.focus();
    fireEvent.keyDown(document, { key: "Tab" });
    expect(drawer.contains(document.activeElement)).toBe(true);
    expect(document.activeElement).not.toBe(signOut);
    expect(focusables.length).toBeGreaterThan(3);

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "Navigation menu" })).not.toBeInTheDocument();
    expect(menuButton).toHaveFocus(); // focus returns to the trigger
  });

  it("closes the drawer when a destination is chosen or the overlay is clicked", async () => {
    await renderShell();
    fireEvent.click(screen.getByRole("button", { name: "Open navigation menu" }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("link", { name: "Patients" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Open navigation menu" }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Close navigation menu" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("has no automatically detectable accessibility violations", async () => {
    await renderShell();
    await expectNoAxeViolations();
  });
});

describe("dialogs", () => {
  it("traps focus inside a modal and restores it on close", () => {
    const opener = document.createElement("button");
    opener.textContent = "Open";
    document.body.appendChild(opener);
    opener.focus();
    const onClose = vi.fn();
    const { unmount } = render(<Modal title="Edit record" onClose={onClose}><input aria-label="Name" /><button type="button">Save</button></Modal>);
    expect(screen.getByLabelText("Name")).toHaveFocus();
    screen.getByRole("button", { name: "Save" }).focus();
    fireEvent.keyDown(document, { key: "Tab" });
    expect(screen.getByRole("dialog").contains(document.activeElement)).toBe(true);
    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
    expect(screen.getByRole("dialog").contains(document.activeElement)).toBe(true);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
    expect(document.body.style.overflow).toBe("hidden");
    unmount();
    expect(opener).toHaveFocus();
    expect(document.body.style.overflow).toBe("");
    opener.remove();
  });

  it("keeps a confirm dialog open, announces the failure, and blocks double submission", async () => {
    let reject!: (error: Error) => void;
    const onConfirm = vi.fn(() => new Promise<void>((_, fail) => { reject = fail; }));
    render(<ConfirmDialog title="Delete Dr. Ada?" message="This cannot be undone." confirmLabel="Delete doctor" onConfirm={onConfirm} onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Delete doctor" }));
    expect(screen.getByRole("button", { name: "Working…" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Working…" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    await act(async () => reject(new Error("This doctor has 2 associated patients.")));
    expect(screen.getByRole("alert")).toHaveTextContent("2 associated patients");
    expect(screen.getByRole("dialog", { name: "Delete Dr. Ada?" })).toHaveAccessibleDescription("This cannot be undone.");
    await expectNoAxeViolations();
  });
});

describe("shared controls", () => {
  it("renders buttons with type=button by default and a busy state while loading", () => {
    render(<><Button>Plain</Button><Button loading loadingText="Saving…">Save</Button></>);
    expect(screen.getByRole("button", { name: "Plain" })).toHaveAttribute("type", "button");
    const saving = screen.getByRole("button", { name: "Saving…" });
    expect(saving).toBeDisabled();
    expect(saving).toHaveAttribute("aria-busy", "true");
  });

  it("renders breadcrumbs with the current page marked", () => {
    render(<Breadcrumbs items={[{ label: "Doctors", href: "/doctors" }, { label: "Dr. Ada" }]} />);
    const nav = screen.getByRole("navigation", { name: "Breadcrumb" });
    expect(within(nav).getByRole("link", { name: "Doctors" })).toHaveAttribute("href", "/doctors");
    expect(within(nav).getByText("Dr. Ada")).toHaveAttribute("aria-current", "page");
  });
});

describe("page-level accessibility (axe-core)", () => {
  it("login form", async () => {
    render(<main><h1>Welcome back</h1><LoginForm /></main>);
    await expectNoAxeViolations();
    fireEvent.click(screen.getByRole("button", { name: "Sign in securely" }));
    await expectNoAxeViolations(); // including the error state
  });

  it("doctors page", async () => {
    render(<DoctorsManager />);
    await screen.findAllByText("Dr. Ada");
    await waitFor(() => expect(doctorsApi.getDoctorFilterOptions).toHaveBeenCalled());
    await expectNoAxeViolations();
  });

  it("patients page with the add-patient dialog open", async () => {
    render(<PatientsManager />);
    await screen.findAllByText("Pat Lee");
    await expectNoAxeViolations();
    fireEvent.click(screen.getByRole("button", { name: /Add patient/ }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Add patient" }));
    await expectNoAxeViolations(); // dialog with inline validation errors
  });

  it("dashboard", async () => {
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({ x: 0, y: 0, top: 0, left: 0, right: 640, bottom: 320, width: 640, height: 320, toJSON: () => ({}) } as DOMRect);
    const range = { period: "30d", from: "2026-10-13", to: "2026-11-11", granularity: "day", timezone: "UTC" };
    const responses: Record<string, unknown> = {
      summary: { data: { totalDoctors: 2, totalPatients: 3, newDoctors: 1, newPatients: 2, averagePatientsPerDoctor: 1.5, topSpecialization: { label: "Cardiology", count: 2 }, topCondition: { label: "Asthma", count: 2 } }, range },
      "patient-trends": { data: [{ key: "2026-11-10", start: "2026-11-10", end: "2026-11-10", count: 1 }, { key: "2026-11-11", start: "2026-11-11", end: "2026-11-11", count: 1 }], total: 2, range },
      "patients-per-doctor": { data: [{ doctorId: "d1", name: "Dr. Ada", specialization: "Cardiology", patientCount: 3 }], meta: { limit: 10, totalDoctors: 2, doctorsWithPatients: 1, doctorsWithoutPatients: 1 } },
      specializations: { data: [{ label: "Cardiology", count: 2, percentage: 100 }], total: 2, categories: 1, otherCategories: 0 },
      conditions: { data: [{ label: "Asthma", count: 2, percentage: 100 }], total: 2, categories: 1, otherCategories: 0 },
    };
    const client = createDashboardClient((async (url: string) => responses[url.split("/api/dashboard/")[1]!.split("?")[0]!]) as never);
    render(<DashboardManager client={client} />);
    await screen.findByText(/Dr\. Ada has the most patients/);
    await waitFor(() => expect(document.querySelectorAll(".recharts-surface").length).toBeGreaterThanOrEqual(4));
    await expectNoAxeViolations();
  });
});
