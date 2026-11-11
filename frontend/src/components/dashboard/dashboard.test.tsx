import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "@/lib/api";
import {
  createDashboardClient, type DashboardPeriod, dashboardUrls, type DistributionResponse, type PatientsPerDoctorResponse,
  type SummaryResponse, toTrendPoints, type TrendResponse, trendSummary, validateCustomRange,
} from "@/lib/dashboard";
import { niceAxisMax } from "./barLayout";
import { truncateLabel } from "./chartTheme";
import { DashboardManager } from "./DashboardManager";
import { toDistributionRows } from "./DistributionChart";
import { toDoctorRows } from "./PatientsPerDoctorChart";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const ranges: Record<DashboardPeriod, TrendResponse["range"]> = {
  "7d": { period: "7d", from: "2026-11-05", to: "2026-11-11", granularity: "day", timezone: "UTC" },
  "30d": { period: "30d", from: "2026-10-13", to: "2026-11-11", granularity: "day", timezone: "UTC" },
  "90d": { period: "90d", from: "2026-08-14", to: "2026-11-11", granularity: "week", timezone: "UTC" },
  "12m": { period: "12m", from: "2025-12-01", to: "2026-11-11", granularity: "month", timezone: "UTC" },
};
const summary = (period: DashboardPeriod, newPatients: number): SummaryResponse => ({
  data: { totalDoctors: 31, totalPatients: 150, newDoctors: 3, newPatients, averagePatientsPerDoctor: 4.8, topSpecialization: { label: "Cardiology", count: 4 }, topCondition: { label: "Peptic ulcer", count: 6 } },
  range: ranges[period],
});
const trends = (period: DashboardPeriod, counts: number[]): TrendResponse => ({
  data: counts.map((count, index) => {
    const day = new Date(Date.UTC(2026, 10, 5 + index)).toISOString().slice(0, 10);
    return { key: day, start: day, end: day, count };
  }),
  total: counts.reduce((a, b) => a + b, 0),
  range: ranges[period],
});
const perDoctor: PatientsPerDoctorResponse = {
  data: [
    { doctorId: "d1", name: "Dr. Amelia Khan", specialization: "Cardiology", patientCount: 14 },
    { doctorId: "d2", name: "Dr. Leila Nakamura", specialization: "Neurology", patientCount: 11 },
  ],
  meta: { limit: 10, totalDoctors: 31, doctorsWithPatients: 25, doctorsWithoutPatients: 6 },
};
const specializations: DistributionResponse = { data: [{ label: "Cardiology", count: 4, percentage: 12.9 }, { label: "Other", count: 27, percentage: 87.1 }], total: 31, categories: 12, otherCategories: 11 };
const conditions = (total: number): DistributionResponse => total
  ? { data: [{ label: "Asthma", count: 3, percentage: 60 }, { label: "Migraine", count: 2, percentage: 40 }], total, categories: 2, otherCategories: 0 }
  : { data: [], total: 0, categories: 0, otherCategories: 0 };

function responseFor(url: string): unknown {
  const period = (new URL(url, "http://x").searchParams.get("period") ?? "30d") as DashboardPeriod;
  if (url.includes("/summary")) return summary(period, period === "7d" ? 5 : 29);
  if (url.includes("/patient-trends")) return trends(period, period === "7d" ? [0, 2, 0, 1, 0, 0, 2] : [1, 3, 2, 0, 4, 1, 2]);
  if (url.includes("/patients-per-doctor")) return perDoctor;
  if (url.includes("/specializations")) return specializations;
  return conditions(5);
}

/** Fake fetcher: records URLs and lets individual tests override, delay, or fail responses. */
function createFakeFetcher(override?: (url: string) => unknown) {
  const calls: string[] = [];
  const fetcher = vi.fn(async (url: string) => {
    calls.push(url);
    const custom = override?.(url);
    if (custom instanceof Promise) return custom;
    if (custom instanceof Error) throw custom;
    return custom ?? responseFor(url);
  }) as unknown as <T>(url: string) => Promise<T>;
  return { calls, fetcher };
}

const renderDashboard = (override?: (url: string) => unknown) => {
  const fake = createFakeFetcher(override);
  const client = createDashboardClient(fake.fetcher);
  render(<DashboardManager client={client} />);
  return { ...fake, client };
};
const kpi = (title: string) => screen.getByRole("heading", { name: title, level: 3 }).closest("article")!;

beforeEach(() => {
  vi.restoreAllMocks();
  // jsdom has no layout engine; give elements a desktop-sized box so Recharts draws real SVG.
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({ x: 0, y: 0, top: 0, left: 0, right: 640, bottom: 320, width: 640, height: 320, toJSON: () => ({}) } as DOMRect);
});
/** Waits until the first full load has rendered. */
const loaded = async () => { await within(await waitFor(() => kpi("Total doctors"))).findByText("31"); };
afterEach(cleanup);

// ---------------------------------------------------------------------------
// Data layer
// ---------------------------------------------------------------------------

describe("dashboard data layer", () => {
  it("builds relative /api/dashboard URLs; all-time sections do not depend on the range", () => {
    const week = dashboardUrls({ kind: "preset", period: "7d" });
    const custom = dashboardUrls({ kind: "custom", from: "2026-01-01", to: "2026-01-31" });
    expect(week.summary).toBe("/api/dashboard/summary?period=7d");
    expect(week.conditions).toBe("/api/dashboard/conditions?period=7d&limit=8");
    expect(custom.trends).toBe("/api/dashboard/patient-trends?from=2026-01-01&to=2026-01-31");
    expect(week.patientsPerDoctor).toBe(custom.patientsPerDoctor);
    expect(week.specializations).toBe(custom.specializations);
    expect(Object.values(week).every((url) => url.startsWith("/api/dashboard/"))).toBe(true);
  });

  it("deduplicates identical requests and never caches failures", async () => {
    let fail = true;
    const fetcher = vi.fn(async (url: string) => { if (fail && url.includes("summary")) throw new Error("boom"); return responseFor(url); }) as unknown as <T>(url: string) => Promise<T>;
    const client = createDashboardClient(fetcher);
    const first = await client.load({ kind: "preset", period: "30d" });
    expect(first.summary.status).toBe("rejected");
    expect(first.trends.status).toBe("fulfilled");
    expect(fetcher).toHaveBeenCalledTimes(5);
    fail = false;
    const second = await client.load({ kind: "preset", period: "30d" });
    expect(second.summary.status).toBe("fulfilled");
    expect(fetcher).toHaveBeenCalledTimes(6); // only the failed summary was refetched
    await client.load({ kind: "preset", period: "7d" });
    expect(fetcher).toHaveBeenCalledTimes(9); // 3 period-based endpoints; all-time sections reused
    client.clear();
    expect(client.size).toBe(0);
  });

  it("sends same-origin credentials and redirects to login on 401", async () => {
    const replace = vi.fn();
    vi.stubGlobal("location", { ...window.location, origin: "http://localhost:3000", pathname: "/dashboard", search: "", replace });
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ error: "Authentication required" }), { status: 401 }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(api("/api/dashboard/summary?period=30d")).rejects.toMatchObject({ status: 401 });
    expect(fetchMock).toHaveBeenCalledWith("/api/dashboard/summary?period=30d", expect.objectContaining({ credentials: "same-origin" }));
    expect(fetchMock).toHaveBeenCalledWith("/api/auth/logout", expect.objectContaining({ method: "POST" })); // stale cookie cleared
    expect(replace).toHaveBeenCalledWith(new URL("/login?expired=1&next=%2Fdashboard", "http://localhost:3000"));
    vi.unstubAllGlobals();
  });

  it("surfaces 403 as an error message", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: "Administrator access required" }), { status: 403 })));
    await expect(api("/api/dashboard/summary")).rejects.toMatchObject({ status: 403, message: "Administrator access required" });
    vi.unstubAllGlobals();
  });

  it("transforms trend buckets into chart points for each granularity", () => {
    const daily = toTrendPoints(trends("7d", [1, 0, 0, 0, 0, 0, 2]));
    expect(daily[0]).toEqual({ key: "2026-11-05", axisLabel: "Nov 5", fullLabel: "Thu, Nov 5, 2026", count: 1 });
    const weekly = toTrendPoints({ data: [{ key: "2026-08-10", start: "2026-08-14", end: "2026-08-16", count: 2 }], total: 2, range: ranges["90d"] });
    expect(weekly[0]).toMatchObject({ axisLabel: "Aug 14", fullLabel: "Aug 14 – Aug 16, 2026" });
    const monthly = toTrendPoints({ data: [
      { key: "2026-02-01", start: "2026-02-01", end: "2026-02-28", count: 3 },
      { key: "2026-11-01", start: "2026-11-01", end: "2026-11-11", count: 1 },
    ], total: 4, range: ranges["12m"] });
    expect(monthly.map((point) => [point.axisLabel, point.fullLabel])).toEqual([["Feb 26", "February 2026"], ["Nov 26", "Nov 1 – Nov 11, 2026"]]);
  });

  it("summarizes trends, including the busiest bucket and empty data", () => {
    expect(trendSummary(trends("7d", [0, 2, 0, 5, 0, 0, 1]))).toBe("8 patients registered between Nov 5 – Nov 11, 2026. Busiest day: Sun, Nov 8, 2026 with 5.");
    expect(trendSummary(trends("7d", [0, 0, 0, 0, 0, 0, 0]))).toBe("No patients were registered between Nov 5 – Nov 11, 2026.");
  });

  it("maps distribution and caseload responses to bar rows", () => {
    expect(toDistributionRows(specializations)).toEqual([
      { key: "Cardiology", label: "Cardiology", value: 4, valueLabel: "12.9%", detail: "4 of 31", muted: false },
      { key: "Other", label: "Other (11)", value: 27, valueLabel: "87.1%", detail: "27 of 31", muted: true },
    ]);
    expect(toDoctorRows(perDoctor)[0]).toEqual({ key: "d1", label: "Dr. Amelia Khan", value: 14, valueLabel: "14", detail: "Cardiology" });
  });

  it("validates custom ranges like the API", () => {
    expect(validateCustomRange("2026-01-01", "2026-01-31")).toBeNull();
    expect(validateCustomRange("", "2026-01-31")).toMatch(/both/);
    expect(validateCustomRange("2026-02-01", "2026-01-01")).toMatch(/on or before/);
    expect(validateCustomRange("2010-01-01", "2026-01-01")).toMatch(/at most/);
  });

  it("rounds axis maxima to whole-number nice values", () => {
    expect([0, 1, 3, 5, 7, 11, 14, 22, 48, 150].map(niceAxisMax)).toEqual([1, 1, 3, 5, 8, 15, 15, 25, 50, 150]);
  });

  it("shortens long labels for narrow screens", () => {
    expect(truncateLabel("Dr. Leila Nakamura-Fernandez", 14)).toBe("Dr. Leila Nak…");
    expect(truncateLabel("Dr. Ada", 14)).toBe("Dr. Ada");
  });
});

// ---------------------------------------------------------------------------
// Dashboard UI
// ---------------------------------------------------------------------------

describe("DashboardManager", () => {
  it("shows loading states, then KPI cards with scope labels", async () => {
    renderDashboard();
    expect(screen.getByRole("status", { name: "Loading Total doctors" })).toBeInTheDocument();
    expect(screen.getByRole("status", { name: "Loading Patient registrations" })).toBeInTheDocument();

    expect(await within(await waitFor(() => kpi("Total doctors"))).findByText("31")).toBeInTheDocument();
    expect(within(kpi("Total patients")).getByText("150")).toBeInTheDocument();
    expect(within(kpi("New patients")).getByText("29")).toBeInTheDocument();
    expect(within(kpi("Avg. patients per doctor")).getByText("4.8")).toBeInTheDocument();
    expect(within(kpi("Most common specialization")).getByText("Cardiology")).toBeInTheDocument();
    expect(within(kpi("Total doctors")).getByText("All time")).toBeInTheDocument();
    expect(within(kpi("New patients")).getByText("Last 30 days")).toBeInTheDocument();
    expect(screen.queryByText(/growth|vs\. previous/i)).not.toBeInTheDocument();
  });

  it("renders every chart with an accessible summary", async () => {
    renderDashboard();
    expect(await screen.findByText(/patients registered between Oct 13 – Nov 11, 2026/)).toBeInTheDocument();
    expect(screen.getByText(/Dr\. Amelia Khan has the most patients \(14\)\. 25 of 31 doctors have at least one patient; 6 have none\./)).toBeInTheDocument();
    expect(screen.getByText(/31 doctors across 12 specialization categories/)).toBeInTheDocument();
    expect(screen.getByText(/5 patients across 2 condition categories\. Most common: Asthma/)).toBeInTheDocument();
    const figures = screen.getAllByRole("img");
    expect(figures).toHaveLength(4);
    // Plots load lazily (separate Recharts chunk); wait for all four SVGs.
    await waitFor(() => expect(document.querySelectorAll(".recharts-surface").length).toBeGreaterThanOrEqual(4));
    expect(screen.getByText("Showing", { exact: false })).toHaveTextContent("Showing Oct 13 – Nov 11, 2026 (UTC)");
  });

  it("switches a chart to its table view with exact values", async () => {
    renderDashboard();
    const card = (await screen.findByRole("heading", { name: "Patients per doctor" })).closest("section")!;
    await waitFor(() => expect(within(card).getByRole("button", { name: "Show table" })).toBeInTheDocument());
    fireEvent.click(within(card).getByRole("button", { name: "Show table" }));
    const table = within(card).getByRole("table", { name: "Patients per doctor" });
    expect(within(table).getByRole("rowheader", { name: "Dr. Amelia Khan" })).toBeInTheDocument();
    expect(within(table).getByText("14")).toBeInTheDocument();
    fireEvent.click(within(card).getByRole("button", { name: "Show chart" }));
    expect(within(card).queryByRole("table")).not.toBeInTheDocument();
  });

  it("changes the period, refetching only period-based endpoints", async () => {
    const { calls } = renderDashboard();
    await loaded();
    expect(calls).toHaveLength(5);
    fireEvent.click(screen.getByRole("radio", { name: "Last 7 days" }));
    expect(screen.getByRole("radio", { name: "Last 7 days" })).toHaveAttribute("aria-checked", "true");
    await waitFor(() => expect(within(kpi("New patients")).getByText("5")).toBeInTheDocument());
    expect(within(kpi("New patients")).getByText("Last 7 days")).toBeInTheDocument();
    expect(calls.slice(5).sort()).toEqual(["/api/dashboard/conditions?period=7d&limit=8", "/api/dashboard/patient-trends?period=7d", "/api/dashboard/summary?period=7d"]);

    fireEvent.click(screen.getByRole("radio", { name: "Last 30 days" }));
    await waitFor(() => expect(within(kpi("New patients")).getByText("29")).toBeInTheDocument());
    expect(calls).toHaveLength(8); // returning to 30d is served from the visit cache
  });

  it("keeps the newest selection when an older response arrives late", async () => {
    let releaseSlow!: () => void;
    const slow = new Promise<void>((resolve) => { releaseSlow = resolve; });
    renderDashboard((url) => url.includes("period=90d") && url.includes("/summary") ? slow.then(() => summary("90d", 72)) : undefined);
    await loaded();
    fireEvent.click(screen.getByRole("radio", { name: "Last 90 days" }));
    fireEvent.click(screen.getByRole("radio", { name: "Last 7 days" }));
    await waitFor(() => expect(within(kpi("New patients")).getByText("5")).toBeInTheDocument());
    await act(async () => { releaseSlow(); await slow; });
    expect(within(kpi("New patients")).getByText("5")).toBeInTheDocument();
    expect(within(kpi("New patients")).queryByText("72")).not.toBeInTheDocument();
  });

  it("shows the previous data with an updating indicator while refreshing", async () => {
    let release!: () => void;
    const pending = new Promise<void>((resolve) => { release = resolve; });
    renderDashboard((url) => url.includes("period=12m") ? pending.then(() => responseFor(url)) : undefined);
    await loaded();
    fireEvent.click(screen.getByRole("radio", { name: "Last 12 months" }));
    expect(await screen.findByText("Updating…")).toBeInTheDocument();
    expect(within(kpi("Total doctors")).getByText("31")).toBeInTheDocument(); // last good data still visible
    await act(async () => { release(); await pending; });
    await waitFor(() => expect(screen.queryByText("Updating…")).not.toBeInTheDocument());
  });

  it("shows a per-chart error and recovers on retry", async () => {
    let failing = true;
    renderDashboard((url) => failing && url.includes("/patient-trends") ? new Error("Aggregation timed out") : undefined);
    const card = (await screen.findByRole("heading", { name: "Patient registrations" })).closest("section")!;
    expect(await within(card).findByRole("alert")).toHaveTextContent("Aggregation timed out");
    expect(within(kpi("Total doctors")).getByText("31")).toBeInTheDocument(); // other sections unaffected
    failing = false;
    fireEvent.click(within(card).getByRole("button", { name: "Retry" }));
    expect(await screen.findByText(/patients registered between/)).toBeInTheDocument();
  });

  it("shows a statistics error with retry when the summary fails", async () => {
    let failing = true;
    renderDashboard((url) => failing && url.includes("/summary") ? new Error("Server unavailable") : undefined);
    expect(await screen.findByText("Key statistics could not be loaded")).toBeInTheDocument();
    failing = false;
    fireEvent.click(screen.getAllByRole("button", { name: "Retry" })[0]!);
    expect(await within(await waitFor(() => kpi("Total doctors"))).findByText("31")).toBeInTheDocument();
  });

  it("handles an empty database without errors", async () => {
    renderDashboard((url) => {
      if (url.includes("/summary")) return { data: { totalDoctors: 0, totalPatients: 0, newDoctors: 0, newPatients: 0, averagePatientsPerDoctor: 0, topSpecialization: null, topCondition: null }, range: ranges["30d"] };
      if (url.includes("/patient-trends")) return trends("30d", [0, 0, 0]);
      if (url.includes("/patients-per-doctor")) return { data: [], meta: { limit: 10, totalDoctors: 0, doctorsWithPatients: 0, doctorsWithoutPatients: 0 } };
      return conditions(0);
    });
    expect(await screen.findByText(/No patients were registered between Oct 13 – Nov 11, 2026/)).toBeInTheDocument();
    expect(screen.getByText("No doctors yet. Add doctors and assign patients to see caseloads.")).toBeInTheDocument();
    expect(screen.getByText("No doctors yet. Specializations appear once doctors are added.")).toBeInTheDocument();
    expect(within(kpi("Total doctors")).getByText("0")).toBeInTheDocument();
    expect(within(kpi("Avg. patients per doctor")).getByText("0")).toBeInTheDocument();
    expect(within(kpi("Most common condition")).getByText("No patients yet.")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("validates and applies a custom range", async () => {
    const { calls } = renderDashboard((url) => url.includes("from=") && url.includes("/summary") ? { ...summary("30d", 9), range: { period: "custom", from: "2026-03-01", to: "2026-03-31", granularity: "day", timezone: "UTC" } } : undefined);
    await loaded();
    fireEvent.click(screen.getByRole("radio", { name: "Custom" }));
    fireEvent.change(screen.getByLabelText("Custom start date"), { target: { value: "2026-04-01" } });
    fireEvent.change(screen.getByLabelText("Custom end date"), { target: { value: "2026-03-01" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply range" }));
    expect(screen.getByRole("alert")).toHaveTextContent("The start date must be on or before the end date.");
    expect(calls.some((url) => url.includes("from="))).toBe(false);
    fireEvent.change(screen.getByLabelText("Custom start date"), { target: { value: "2026-03-01" } });
    fireEvent.change(screen.getByLabelText("Custom end date"), { target: { value: "2026-03-31" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply range" }));
    await waitFor(() => expect(within(kpi("New patients")).getByText("9")).toBeInTheDocument());
    expect(calls).toContain("/api/dashboard/summary?from=2026-03-01&to=2026-03-31");
    expect(within(kpi("New patients")).getByText("Custom range")).toBeInTheDocument();
  });

  it("supports arrow-key navigation in the period selector", async () => {
    const { calls } = renderDashboard();
    await loaded();
    const thirty = screen.getByRole("radio", { name: "Last 30 days" });
    expect(thirty).toHaveAttribute("tabindex", "0");
    expect(screen.getByRole("radio", { name: "Last 7 days" })).toHaveAttribute("tabindex", "-1");
    thirty.focus();
    fireEvent.keyDown(thirty, { key: "ArrowRight" });
    const ninety = screen.getByRole("radio", { name: "Last 90 days" });
    expect(ninety).toHaveFocus();
    expect(ninety).toHaveAttribute("aria-checked", "true");
    await waitFor(() => expect(calls).toContain("/api/dashboard/summary?period=90d"));
    fireEvent.keyDown(ninety, { key: "Home" });
    expect(screen.getByRole("radio", { name: "Last 7 days" })).toHaveFocus();
  });

  it("refresh bypasses the visit cache", async () => {
    const { calls } = renderDashboard();
    await loaded();
    fireEvent.click(screen.getByRole("button", { name: "Refresh dashboard" }));
    await waitFor(() => expect(calls).toHaveLength(10));
  });

  it("uses compact period labels and a single-column KPI grid on small screens", async () => {
    renderDashboard();
    const radio = screen.getByRole("radio", { name: "Last 7 days" });
    expect(within(radio).getByText("7D")).toHaveClass("sm:hidden");
    await waitFor(() => kpi("Total doctors"));
    expect(kpi("Total doctors").parentElement).toHaveClass("grid-cols-1", "sm:grid-cols-2", "xl:grid-cols-4");
  });
});

describe("deferred chart drawing", () => {
  it("draws a chart only once it approaches the viewport", async () => {
    const observers: Array<{ callback: IntersectionObserverCallback; target?: Element }> = [];
    vi.stubGlobal("IntersectionObserver", class {
      private entry: { callback: IntersectionObserverCallback; target?: Element };
      constructor(callback: IntersectionObserverCallback) { this.entry = { callback }; observers.push(this.entry); }
      observe(target: Element) { this.entry.target = target; }
      disconnect() {}
      unobserve() {}
      takeRecords() { return []; }
    });
    renderDashboard();
    await loaded();
    await screen.findByText(/patients registered between/);
    expect(document.querySelectorAll(".recharts-surface")).toHaveLength(0); // nothing drawn off-screen
    const trendObserver = observers.find((observer) => observer.target?.closest("section")?.querySelector("h2")?.textContent === "Patient registrations")!;
    await act(async () => trendObserver.callback([{ isIntersecting: true, target: trendObserver.target! } as IntersectionObserverEntry], {} as IntersectionObserver));
    await waitFor(() => expect(document.querySelectorAll(".recharts-surface")).toHaveLength(1));
    vi.unstubAllGlobals();
  });
});
