import { api, buildQueryString } from "./api";

export type DashboardPeriod = "7d" | "30d" | "90d" | "12m";
export type Granularity = "day" | "week" | "month";
export type DashboardRange = { kind: "preset"; period: DashboardPeriod } | { kind: "custom"; from: string; to: string };

export interface RangeInfo { period: DashboardPeriod | "custom"; from: string; to: string; granularity: Granularity; timezone: "UTC"; }
export interface TopItem { label: string; count: number; }
export interface DashboardSummary {
  totalDoctors: number;
  totalPatients: number;
  newDoctors: number;
  newPatients: number;
  averagePatientsPerDoctor: number;
  topSpecialization: TopItem | null;
  topCondition: TopItem | null;
}
export interface SummaryResponse { data: DashboardSummary; range: RangeInfo; }
export interface DoctorCaseload { doctorId: string; name: string; specialization: string; patientCount: number; }
export interface PatientsPerDoctorResponse { data: DoctorCaseload[]; meta: { limit: number; totalDoctors: number; doctorsWithPatients: number; doctorsWithoutPatients: number }; }
export interface TrendBucket { key: string; start: string; end: string; count: number; }
export interface TrendResponse { data: TrendBucket[]; total: number; range: RangeInfo; }
export interface DistributionItem { label: string; count: number; percentage: number; }
export interface DistributionResponse { data: DistributionItem[]; total: number; categories: number; otherCategories: number; range?: RangeInfo; }

export interface DashboardData {
  summary: SummaryResponse;
  patientsPerDoctor: PatientsPerDoctorResponse;
  trends: TrendResponse;
  specializations: DistributionResponse;
  conditions: DistributionResponse;
}
export type DashboardSection = keyof DashboardData;
export const DASHBOARD_SECTIONS: DashboardSection[] = ["summary", "trends", "patientsPerDoctor", "specializations", "conditions"];

export const PERIOD_OPTIONS: Array<{ value: DashboardPeriod; label: string; short: string }> = [
  { value: "7d", label: "Last 7 days", short: "7D" },
  { value: "30d", label: "Last 30 days", short: "30D" },
  { value: "90d", label: "Last 90 days", short: "90D" },
  { value: "12m", label: "Last 12 months", short: "12M" },
];
export const MAX_CUSTOM_RANGE_DAYS = 1830;
export const TOP_DOCTORS_LIMIT = 10;
export const TOP_CONDITIONS_LIMIT = 8;
export const TOP_SPECIALIZATIONS_LIMIT = 10;

export function rangeParams(range: DashboardRange): Record<string, string> {
  return range.kind === "preset" ? { period: range.period } : { from: range.from, to: range.to };
}

/** Endpoint URLs for one dashboard view. All-time endpoints do not depend on the range. */
export function dashboardUrls(range: DashboardRange): Record<DashboardSection, string> {
  const params = rangeParams(range);
  return {
    summary: `/api/dashboard/summary?${buildQueryString(params)}`,
    trends: `/api/dashboard/patient-trends?${buildQueryString(params)}`,
    conditions: `/api/dashboard/conditions?${buildQueryString({ ...params, limit: TOP_CONDITIONS_LIMIT })}`,
    patientsPerDoctor: `/api/dashboard/patients-per-doctor?${buildQueryString({ limit: TOP_DOCTORS_LIMIT })}`,
    specializations: `/api/dashboard/specializations?${buildQueryString({ limit: TOP_SPECIALIZATIONS_LIMIT })}`,
  };
}

export type SectionResult<T> = { status: "fulfilled"; value: T } | { status: "rejected"; error: Error };
export type DashboardResults = { [K in DashboardSection]: SectionResult<DashboardData[K]> };

/**
 * Request cache scoped to one dashboard visit: identical URLs share one request (also while in
 * flight), so toggling back to a period is instant and range-independent sections are fetched
 * once. Failed requests are not cached, so Retry always hits the server.
 */
export function createDashboardClient(fetcher: <T>(url: string) => Promise<T> = api) {
  const cache = new Map<string, Promise<unknown>>();
  const load = <T,>(url: string): Promise<T> => {
    let request = cache.get(url) as Promise<T> | undefined;
    if (!request) {
      request = fetcher<T>(url);
      cache.set(url, request);
      request.catch(() => cache.delete(url));
    }
    return request;
  };
  return {
    /** Loads every section; one failing endpoint does not hide the others. */
    async load(range: DashboardRange): Promise<DashboardResults> {
      const urls = dashboardUrls(range);
      const settled = await Promise.allSettled(DASHBOARD_SECTIONS.map((section) => load(urls[section])));
      return Object.fromEntries(DASHBOARD_SECTIONS.map((section, index) => {
        const outcome = settled[index]!;
        return [section, outcome.status === "fulfilled"
          ? { status: "fulfilled", value: outcome.value }
          : { status: "rejected", error: outcome.reason instanceof Error ? outcome.reason : new Error("Request failed") }];
      })) as DashboardResults;
    },
    clear() { cache.clear(); },
    get size() { return cache.size; },
  };
}

// ---------------------------------------------------------------------------
// Presentation helpers (all dates are UTC calendar days)
// ---------------------------------------------------------------------------

const utc = (isoDay: string) => new Date(`${isoDay}T00:00:00.000Z`);
const format = (isoDay: string, options: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("en-US", { timeZone: "UTC", ...options }).format(utc(isoDay));

/** Short axis label for a bucket. */
export function bucketAxisLabel(bucket: TrendBucket, granularity: Granularity): string {
  if (granularity === "month") return format(bucket.key, { month: "short", year: "2-digit" });
  return format(bucket.start, { month: "short", day: "numeric" });
}

/** Full label for tooltips and the table view. */
export function bucketFullLabel(bucket: TrendBucket, granularity: Granularity): string {
  if (granularity === "day") return format(bucket.start, { weekday: "short", month: "short", day: "numeric", year: "numeric" });
  if (granularity === "month") return bucket.start === bucket.key && bucket.end === `${bucket.key.slice(0, 8)}${lastDayOfMonth(bucket.key)}`
    ? format(bucket.key, { month: "long", year: "numeric" })
    : `${format(bucket.start, { month: "short", day: "numeric" })} – ${format(bucket.end, { month: "short", day: "numeric", year: "numeric" })}`;
  return `${format(bucket.start, { month: "short", day: "numeric" })} – ${format(bucket.end, { month: "short", day: "numeric", year: "numeric" })}`;
}

function lastDayOfMonth(isoDay: string): string {
  const date = utc(isoDay);
  return String(new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate()).padStart(2, "0");
}

export function formatRange(range: Pick<RangeInfo, "from" | "to">): string {
  const sameYear = range.from.slice(0, 4) === range.to.slice(0, 4);
  return `${format(range.from, { month: "short", day: "numeric", ...(sameYear ? {} : { year: "numeric" }) })} – ${format(range.to, { month: "short", day: "numeric", year: "numeric" })}`;
}

export function periodLabel(range: DashboardRange): string {
  return range.kind === "preset" ? PERIOD_OPTIONS.find((option) => option.value === range.period)!.label : "Custom range";
}

export const formatNumber = (value: number) => new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 }).format(value);

export interface TrendPoint { key: string; axisLabel: string; fullLabel: string; count: number; }
/** API buckets -> chart rows. Pure, so components can memoize it. */
export function toTrendPoints(response: TrendResponse): TrendPoint[] {
  return response.data.map((bucket) => ({
    key: bucket.key,
    axisLabel: bucketAxisLabel(bucket, response.range.granularity),
    fullLabel: bucketFullLabel(bucket, response.range.granularity),
    count: bucket.count,
  }));
}

export function trendSummary(response: TrendResponse): string {
  if (response.total === 0) return `No patients were registered between ${formatRange(response.range)}.`;
  const peak = response.data.reduce((best, bucket) => bucket.count > best.count ? bucket : best, response.data[0]!);
  const unit = response.range.granularity === "day" ? "day" : response.range.granularity === "week" ? "week" : "month";
  return `${formatNumber(response.total)} patient${response.total === 1 ? "" : "s"} registered between ${formatRange(response.range)}. Busiest ${unit}: ${bucketFullLabel(peak, response.range.granularity)} with ${peak.count}.`;
}

/** Validates a custom range the same way the API does. Returns an error message or null. */
export function validateCustomRange(from: string, to: string): string | null {
  if (!from || !to) return "Choose both a start and an end date.";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) return "Use valid dates.";
  if (from > to) return "The start date must be on or before the end date.";
  const days = (utc(to).getTime() - utc(from).getTime()) / 86_400_000 + 1;
  if (days > MAX_CUSTOM_RANGE_DAYS) return `Custom ranges can span at most ${MAX_CUSTOM_RANGE_DAYS} days.`;
  return null;
}
