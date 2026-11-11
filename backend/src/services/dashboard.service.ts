import type { PipelineStage } from "mongoose";
import { Doctor } from "../models/Doctor.js";
import { Patient } from "../models/Patient.js";
import { describeRange, type Granularity, type ResolvedRange, startOfUtcDay } from "../validators/dashboard.validator.js";

/**
 * Dashboard analytics. Every statistic is computed inside MongoDB (count queries and
 * aggregation pipelines) so only small, chart-ready summaries leave the database —
 * the frontend never downloads patient or doctor collections to count them.
 *
 * Date semantics (all UTC):
 * - "Period" statistics filter by the PATIENT's or DOCTOR's own `createdAt`
 *   (new patients/doctors, registration trend, condition distribution).
 * - All-time statistics ignore the period (totals, average caseload, patients per
 *   doctor, specialization distribution), because they describe the current state.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
export const UNSPECIFIED_LABEL = "Unspecified";
export const OTHER_LABEL = "Other";

const createdWithin = (range: ResolvedRange) => ({ createdAt: { $gte: range.from, $lt: range.toExclusive } });
const percentage = (count: number, total: number) => total > 0 ? Math.round((count / total) * 1000) / 10 : 0;
const isoDay = (date: Date) => date.toISOString().slice(0, 10);

// ---------------------------------------------------------------------------
// Time buckets
// ---------------------------------------------------------------------------

/** Start of the bucket containing `date`. Weeks start on Monday (ISO), matching $dateTrunc startOfWeek. */
export function truncateDate(date: Date, granularity: Granularity): Date {
  const day = startOfUtcDay(date);
  if (granularity === "day") return day;
  if (granularity === "week") return new Date(day.getTime() - ((day.getUTCDay() + 6) % 7) * DAY_MS);
  return new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), 1));
}

function nextBucket(start: Date, granularity: Granularity): Date {
  if (granularity === "day") return new Date(start.getTime() + DAY_MS);
  if (granularity === "week") return new Date(start.getTime() + 7 * DAY_MS);
  return new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1));
}

export interface TrendBucket { key: string; start: string; end: string; count: number; }

/**
 * Every bucket in the range, in chronological order. Edge buckets are clipped to the
 * range so `start`/`end` always describe the days actually counted (e.g. a partial first week).
 */
export function buildBuckets(range: ResolvedRange): TrendBucket[] {
  const buckets: TrendBucket[] = [];
  for (let cursor = truncateDate(range.from, range.granularity); cursor < range.toExclusive; cursor = nextBucket(cursor, range.granularity)) {
    const next = nextBucket(cursor, range.granularity);
    const start = cursor < range.from ? range.from : cursor;
    const endExclusive = next > range.toExclusive ? range.toExclusive : next;
    buckets.push({ key: isoDay(cursor), start: isoDay(start), end: isoDay(new Date(endExclusive.getTime() - DAY_MS)), count: 0 });
  }
  return buckets;
}

// ---------------------------------------------------------------------------
// Shared grouped-count aggregation
// ---------------------------------------------------------------------------

export interface DistributionItem { label: string; count: number; percentage: number; }
interface GroupedCounts { items: Array<{ label: string; count: number }>; total: number; groups: number; }

/**
 * Groups documents by a text field, normalized for counting only (trimmed, case-insensitive;
 * stored records are never modified). Missing or non-string values become "Unspecified".
 * A single $facet returns both the top N groups and the overall totals.
 */
export function groupedCountPipeline(field: string, match: Record<string, unknown>, limit: number): PipelineStage[] {
  const value = { $cond: [{ $eq: [{ $type: `$${field}` }, "string"] }, { $trim: { input: `$${field}` } }, ""] };
  return [
    ...(Object.keys(match).length ? [{ $match: match }] : []),
    { $project: { _id: 0, label: value } },
    { $group: { _id: { $toLower: "$label" }, count: { $sum: 1 }, label: { $min: "$label" } } },
    { $sort: { count: -1, _id: 1 } },
    { $facet: {
      top: [{ $limit: limit }, { $project: { _id: 0, label: 1, count: 1 } }],
      totals: [{ $group: { _id: null, total: { $sum: "$count" }, groups: { $sum: 1 } } }],
    } },
  ];
}

async function groupedCounts(model: typeof Doctor | typeof Patient, field: string, match: Record<string, unknown>, limit: number): Promise<GroupedCounts> {
  const [result] = await (model as typeof Patient).aggregate<{ top: Array<{ label: string; count: number }>; totals: Array<{ total: number; groups: number }> }>(groupedCountPipeline(field, match, limit));
  const totals = result?.totals[0];
  return {
    items: (result?.top ?? []).map((item) => ({ label: item.label || UNSPECIFIED_LABEL, count: item.count })),
    total: totals?.total ?? 0,
    groups: totals?.groups ?? 0,
  };
}

/** Top N items with percentages, plus an "Other" row so the parts still sum to the whole. */
function toDistribution(counts: GroupedCounts) {
  const data: DistributionItem[] = counts.items.map((item) => ({ ...item, percentage: percentage(item.count, counts.total) }));
  const shown = counts.items.reduce((sum, item) => sum + item.count, 0);
  const otherCount = counts.total - shown;
  if (otherCount > 0) data.push({ label: OTHER_LABEL, count: otherCount, percentage: percentage(otherCount, counts.total) });
  return { data, total: counts.total, categories: counts.groups, otherCategories: Math.max(0, counts.groups - counts.items.length) };
}

// ---------------------------------------------------------------------------
// Endpoints
// ---------------------------------------------------------------------------

export async function getSummary(range: ResolvedRange) {
  const [totalDoctors, totalPatients, newDoctors, newPatients, specializations, conditions] = await Promise.all([
    Doctor.countDocuments(),
    Patient.countDocuments(),
    Doctor.countDocuments(createdWithin(range)),
    Patient.countDocuments(createdWithin(range)),
    groupedCounts(Doctor, "specialization", {}, 1),
    groupedCounts(Patient, "condition", {}, 1),
  ]);
  return {
    data: {
      totalDoctors,
      totalPatients,
      newDoctors,
      newPatients,
      // All-time caseload; 0 (not NaN/Infinity) when there are no doctors.
      averagePatientsPerDoctor: totalDoctors > 0 ? Math.round((totalPatients / totalDoctors) * 10) / 10 : 0,
      topSpecialization: specializations.items[0] ? { label: specializations.items[0].label, count: specializations.items[0].count } : null,
      topCondition: conditions.items[0] ? { label: conditions.items[0].label, count: conditions.items[0].count } : null,
    },
    range: describeRange(range),
    scope: { totals: "all-time", newDoctors: "period", newPatients: "period", averagePatientsPerDoctor: "all-time", topSpecialization: "all-time", topCondition: "all-time" },
  };
}

interface DoctorCaseload { doctorId: string; name: string; specialization: string; patientCount: number; }

/**
 * Current (all-time) caseload per doctor. Patients are grouped by doctorId (one pass over the
 * patients collection), then a single $lookup joins the doctor's name/specialization — no N+1
 * queries. Orphaned doctorIds are dropped by the $unwind. If fewer than `limit` doctors have
 * patients, doctors with zero patients fill the remaining rows.
 */
export async function getPatientsPerDoctor(limit: number) {
  const [[result], totalDoctors] = await Promise.all([Patient.aggregate<{ top: DoctorCaseload[]; assigned: Array<{ count: number }> }>([
    { $group: { _id: "$doctorId", patientCount: { $sum: 1 } } },
    { $lookup: { from: Doctor.collection.name, localField: "_id", foreignField: "_id", as: "doctor", pipeline: [{ $project: { name: 1, specialization: 1 } }] } },
    { $unwind: "$doctor" },
    { $facet: {
      top: [
        { $sort: { patientCount: -1, "doctor.name": 1, _id: 1 } },
        { $limit: limit },
        { $project: { _id: 0, doctorId: { $toString: "$_id" }, name: "$doctor.name", specialization: "$doctor.specialization", patientCount: 1 } },
      ],
      assigned: [{ $count: "count" }],
    } },
  ]), Doctor.countDocuments()]);
  const top = result?.top ?? [];
  const doctorsWithPatients = result?.assigned[0]?.count ?? 0;
  const doctorsWithoutPatients = Math.max(0, totalDoctors - doctorsWithPatients);

  let data: DoctorCaseload[] = top;
  if (top.length < limit && doctorsWithoutPatients > 0) {
    // Only reached when the top list is short; distinct() uses the doctorId index.
    const assignedIds = await Patient.distinct("doctorId");
    const idle = await Doctor.find({ _id: { $nin: assignedIds } }).select("name specialization").sort({ name: 1, _id: 1 }).limit(limit - top.length).lean();
    data = [...top, ...idle.map((doctor) => ({ doctorId: String(doctor._id), name: doctor.name, specialization: doctor.specialization, patientCount: 0 }))];
  }
  return { data, meta: { limit, totalDoctors, doctorsWithPatients, doctorsWithoutPatients }, scope: "all-time" as const };
}

/** Patient registrations per day/week/month, zero-filled and in chronological order. */
export async function getPatientTrends(range: ResolvedRange) {
  const unit = range.granularity;
  const rows = await Patient.aggregate<{ _id: Date; count: number }>([
    { $match: createdWithin(range) },
    { $group: {
      _id: { $dateTrunc: { date: "$createdAt", unit, timezone: "UTC", ...(unit === "week" ? { startOfWeek: "monday" } : {}) } },
      count: { $sum: 1 },
    } },
    { $sort: { _id: 1 } },
  ]);
  const counts = new Map(rows.map((row) => [isoDay(new Date(row._id)), row.count]));
  const data = buildBuckets(range).map((bucket) => ({ ...bucket, count: counts.get(bucket.key) ?? 0 }));
  return { data, total: data.reduce((sum, bucket) => sum + bucket.count, 0), range: describeRange(range) };
}

/** Doctor specialization distribution across all doctors (all-time). */
export async function getSpecializations(limit: number) {
  return { ...toDistribution(await groupedCounts(Doctor, "specialization", {}, limit)), scope: "all-time" as const };
}

/** Condition distribution among patients registered within the range. */
export async function getConditions(range: ResolvedRange, limit: number) {
  return { ...toDistribution(await groupedCounts(Patient, "condition", createdWithin(range), limit)), range: describeRange(range), scope: "period" as const };
}
