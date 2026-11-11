import { z } from "zod";
import { dateOnly } from "./common.js";

export const DASHBOARD_PERIODS = ["7d", "30d", "90d", "12m"] as const;
export type DashboardPeriod = (typeof DASHBOARD_PERIODS)[number];
export type Granularity = "day" | "week" | "month";

/** Longest custom range accepted (≈5 years), which also bounds the number of trend buckets. */
export const MAX_CUSTOM_RANGE_DAYS = 1830;
const DAY_MS = 24 * 60 * 60 * 1000;

const rangeFields = {
  period: z.enum(DASHBOARD_PERIODS, { error: "Period must be one of 7d, 30d, 90d, or 12m" }).optional(),
  from: dateOnly("Start date").optional(),
  to: dateOnly("End date").optional(),
};

type RangeInput = { period?: DashboardPeriod | undefined; from?: Date | undefined; to?: Date | undefined };

function checkRange(query: RangeInput, context: z.RefinementCtx) {
  if (query.period && (query.from || query.to)) {
    context.addIssue({ code: "custom", message: "Use either period or a from/to date range, not both", path: ["period"] });
    return;
  }
  if (Boolean(query.from) !== Boolean(query.to)) {
    context.addIssue({ code: "custom", message: "Provide both from and to for a custom range", path: [query.from ? "to" : "from"] });
    return;
  }
  if (query.from && query.to) {
    if (query.from > query.to) context.addIssue({ code: "custom", message: "Start date must be on or before end date", path: ["from"] });
    else if ((query.to.getTime() - query.from.getTime()) / DAY_MS + 1 > MAX_CUSTOM_RANGE_DAYS) {
      context.addIssue({ code: "custom", message: `Custom ranges can span at most ${MAX_CUSTOM_RANGE_DAYS} days`, path: ["to"] });
    }
  }
}

const limit = (fallback: number, maximum: number) => z.coerce.number({ error: "Limit must be a number" })
  .int("Limit must be a whole number").min(1, "Limit must be at least 1").max(maximum, `Limit cannot exceed ${maximum}`).default(fallback);

export const dashboardRangeQuerySchema = z.object(rangeFields).superRefine(checkRange);
export const patientsPerDoctorQuerySchema = z.object({ limit: limit(10, 50) });
export const distributionQuerySchema = (fallback: number) => z.object({ ...rangeFields, limit: limit(fallback, 20) }).superRefine(checkRange);
export const specializationQuerySchema = z.object({ limit: limit(10, 20) });

export type DashboardRangeQuery = z.infer<typeof dashboardRangeQuerySchema>;

export interface ResolvedRange {
  /** "custom" when from/to were supplied. */
  period: DashboardPeriod | "custom";
  /** Inclusive start, 00:00 UTC. */
  from: Date;
  /** Exclusive end: 00:00 UTC of the day after the last included day. */
  toExclusive: Date;
  granularity: Granularity;
}

export const startOfUtcDay = (date: Date) => new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
const addDays = (date: Date, days: number) => new Date(date.getTime() + days * DAY_MS);

/**
 * Turns a period or custom range into concrete UTC bounds. Periods end today (inclusive):
 * 7d/30d/90d are the last N calendar days; 12m is the current month plus the previous 11.
 */
export function resolveRange(query: RangeInput, now = new Date()): ResolvedRange {
  const today = startOfUtcDay(now);
  const tomorrow = addDays(today, 1);
  if (query.from && query.to) {
    const days = Math.round((query.to.getTime() - query.from.getTime()) / DAY_MS) + 1;
    return { period: "custom", from: query.from, toExclusive: addDays(query.to, 1), granularity: days <= 31 ? "day" : days <= 183 ? "week" : "month" };
  }
  switch (query.period ?? "30d") {
    case "7d": return { period: "7d", from: addDays(today, -6), toExclusive: tomorrow, granularity: "day" };
    case "90d": return { period: "90d", from: addDays(today, -89), toExclusive: tomorrow, granularity: "week" };
    case "12m": return { period: "12m", from: new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 11, 1)), toExclusive: tomorrow, granularity: "month" };
    default: return { period: "30d", from: addDays(today, -29), toExclusive: tomorrow, granularity: "day" };
  }
}

const isoDay = (date: Date) => date.toISOString().slice(0, 10);

/** Range metadata returned to the client so every chart labels the same window. */
export function describeRange(range: ResolvedRange) {
  return { period: range.period, from: isoDay(range.from), to: isoDay(addDays(range.toExclusive, -1)), granularity: range.granularity, timezone: "UTC" as const };
}
