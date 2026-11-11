import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { app } from "./app.js";
import { Doctor } from "./models/Doctor.js";
import { Patient } from "./models/Patient.js";
import { User } from "./models/User.js";
import * as dashboard from "./services/dashboard.service.js";
import { SESSION_COOKIE, signSession } from "./services/auth.js";
import { dashboardRangeQuerySchema, describeRange, resolveRange } from "./validators/dashboard.validator.js";

// All tests use mocks; nothing here connects to MongoDB.

const userId = "507f1f77bcf86cd799439011";
const NOW = new Date("2026-11-11T15:30:00.000Z"); // a Wednesday

function queryResult<T>(value: T) {
  return { select: () => ({ lean: async () => value }), lean: async () => value };
}
function chain<T>(value: T) {
  const query = { select: vi.fn(() => query), sort: vi.fn(() => query), limit: vi.fn(() => query), lean: vi.fn(async () => value) };
  return query;
}
const cookie = () => `${SESSION_COOKIE}=${signSession(userId)}`;
const get = (url: string) => request(app).get(url).set("Cookie", cookie());
const range = (query: Parameters<typeof resolveRange>[0]) => resolveRange(query, NOW);
const groupedResult = (top: Array<{ label: string; count: number }>, total: number, groups: number) => [{ top, totals: total ? [{ total, groups }] : [] }];

beforeEach(() => {
  process.env.JWT_SECRET = "test-secret-that-is-at-least-thirty-two-characters";
  process.env.JWT_EXPIRES_IN = "1d";
  vi.restoreAllMocks();
  vi.useRealTimers();
  vi.spyOn(User, "findById").mockReturnValue(queryResult({ _id: userId, name: "Admin", email: "admin@example.com", role: "admin" }) as never);
});

describe("dashboard API security", () => {
  it("rejects unauthenticated requests on every dashboard endpoint", async () => {
    for (const path of ["summary", "patients-per-doctor", "patient-trends", "specializations", "conditions"]) {
      expect((await request(app).get(`/api/dashboard/${path}`)).status).toBe(401);
      expect((await request(app).get(`/api/dashboard/${path}`).set("Cookie", `${SESSION_COOKIE}=forged`)).status).toBe(401);
    }
  });

  it("rejects sessions whose account is no longer an admin", async () => {
    vi.spyOn(User, "findById").mockReturnValue(queryResult(null) as never);
    await get("/api/dashboard/summary").expect(401);
  });

  it("returns a generic 500 when an aggregation fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.spyOn(Patient, "aggregate").mockRejectedValue(new Error("PlanExecutor error: secret cluster detail"));
    const response = await get("/api/dashboard/patient-trends").expect(500);
    expect(response.body).toEqual({ error: "Internal server error" });
  });
});

describe("dashboard query validation", () => {
  it.each([
    ["period=1y", "period"],
    ["period=7D", "period"],
    ["from=2026-01-01", "to"],
    ["to=2026-01-01", "from"],
    ["from=2026-02-01&to=2026-01-01", "from"],
    ["from=2026-02-30&to=2026-03-01", "from"],
    ["from=yesterday&to=today", "from"],
    ["period=30d&from=2026-01-01&to=2026-01-31", "period"],
    ["from=2015-01-01&to=2026-01-01", "to"],
  ])("rejects %s", async (query, field) => {
    const response = await get(`/api/dashboard/summary?${query}`).expect(400);
    expect(response.body.details.map((detail: { field: string }) => detail.field)).toContain(field);
  });

  it.each(["limit=0", "limit=51", "limit=abc", "limit=2.5"])("rejects invalid patients-per-doctor %s", async (query) => {
    await get(`/api/dashboard/patients-per-doctor?${query}`).expect(400);
  });

  it("rejects invalid limits and ranges on distribution endpoints", async () => {
    await get("/api/dashboard/conditions?limit=21").expect(400);
    await get("/api/dashboard/conditions?period=2w").expect(400);
    await get("/api/dashboard/specializations?limit=-1").expect(400);
    await get("/api/dashboard/patient-trends?period=all").expect(400);
  });

  it("accepts a valid custom range", () => {
    expect(dashboardRangeQuerySchema.safeParse({ from: "2026-01-01", to: "2026-01-01" }).success).toBe(true);
  });
});

describe("date range resolution (UTC)", () => {
  it("defaults to the last 30 days ending today, with daily buckets", () => {
    expect(describeRange(range({}))).toEqual({ period: "30d", from: "2026-10-13", to: "2026-11-11", granularity: "day", timezone: "UTC" });
  });

  it("resolves each preset period", () => {
    expect(describeRange(range({ period: "7d" }))).toMatchObject({ from: "2026-11-05", to: "2026-11-11", granularity: "day" });
    expect(describeRange(range({ period: "90d" }))).toMatchObject({ from: "2026-08-14", to: "2026-11-11", granularity: "week" });
    expect(describeRange(range({ period: "12m" }))).toMatchObject({ from: "2025-12-01", to: "2026-11-11", granularity: "month" });
  });

  it("uses an exclusive upper bound at the next UTC midnight", () => {
    const resolved = range({ period: "7d" });
    expect(resolved.from.toISOString()).toBe("2026-11-05T00:00:00.000Z");
    expect(resolved.toExclusive.toISOString()).toBe("2026-11-12T00:00:00.000Z");
  });

  it("picks granularity for custom ranges by length", () => {
    const custom = (from: string, to: string) => range({ from: new Date(`${from}T00:00:00Z`), to: new Date(`${to}T00:00:00Z`) });
    expect(custom("2026-01-01", "2026-01-31").granularity).toBe("day");
    expect(custom("2026-01-01", "2026-06-01").granularity).toBe("week");
    expect(custom("2025-01-01", "2026-06-01").granularity).toBe("month");
    expect(describeRange(custom("2026-03-01", "2026-03-01"))).toMatchObject({ period: "custom", from: "2026-03-01", to: "2026-03-01" });
  });
});

describe("trend buckets", () => {
  it("builds chronological, zero-filled daily buckets", () => {
    const buckets = dashboard.buildBuckets(range({ period: "7d" }));
    expect(buckets.map((bucket) => bucket.key)).toEqual(["2026-11-05", "2026-11-06", "2026-11-07", "2026-11-08", "2026-11-09", "2026-11-10", "2026-11-11"]);
    expect(buckets.every((bucket) => bucket.count === 0 && bucket.start === bucket.key && bucket.end === bucket.key)).toBe(true);
    expect(dashboard.buildBuckets(range({ period: "30d" }))).toHaveLength(30);
  });

  it("builds Monday-based weekly buckets clipped to the range", () => {
    const buckets = dashboard.buildBuckets(range({ period: "90d" }));
    expect(buckets[0]).toEqual({ key: "2026-08-10", start: "2026-08-14", end: "2026-08-16", count: 0 }); // partial first week
    expect(buckets.at(-1)).toEqual({ key: "2026-11-09", start: "2026-11-09", end: "2026-11-11", count: 0 }); // partial current week
    expect(buckets.every((bucket) => new Date(`${bucket.key}T00:00:00Z`).getUTCDay() === 1)).toBe(true);
    expect(buckets).toHaveLength(14);
  });

  it("builds monthly buckets across a year boundary", () => {
    const buckets = dashboard.buildBuckets(range({ period: "12m" }));
    expect(buckets.map((bucket) => bucket.key)).toEqual([
      "2025-12-01", "2026-01-01", "2026-02-01", "2026-03-01", "2026-04-01", "2026-05-01",
      "2026-06-01", "2026-07-01", "2026-08-01", "2026-09-01", "2026-10-01", "2026-11-01",
    ]);
    expect(buckets[2]).toMatchObject({ start: "2026-02-01", end: "2026-02-28" });
    expect(buckets.at(-1)).toMatchObject({ start: "2026-11-01", end: "2026-11-11" });
  });

  it("truncates dates to the bucket start", () => {
    expect(dashboard.truncateDate(new Date("2026-11-08T23:59:59Z"), "week").toISOString()).toBe("2026-11-02T00:00:00.000Z"); // Sunday -> Monday
    expect(dashboard.truncateDate(new Date("2026-11-09T00:00:00Z"), "week").toISOString()).toBe("2026-11-09T00:00:00.000Z");
    expect(dashboard.truncateDate(new Date("2026-02-28T23:59:59Z"), "month").toISOString()).toBe("2026-02-01T00:00:00.000Z");
  });
});

describe("patient trends service", () => {
  it("matches the range with an exclusive upper bound and groups by UTC day", async () => {
    const aggregate = vi.spyOn(Patient, "aggregate").mockResolvedValue([
      { _id: new Date("2026-11-06T00:00:00Z"), count: 2 },
      { _id: new Date("2026-11-11T00:00:00Z"), count: 1 },
    ] as never);
    const result = await dashboard.getPatientTrends(range({ period: "7d" }));
    const pipeline = aggregate.mock.calls[0]![0] as Array<Record<string, any>>;
    expect(pipeline[0]).toEqual({ $match: { createdAt: { $gte: new Date("2026-11-05T00:00:00Z"), $lt: new Date("2026-11-12T00:00:00Z") } } });
    expect(pipeline[1]!.$group._id.$dateTrunc).toEqual({ date: "$createdAt", unit: "day", timezone: "UTC" });
    expect(result.data.map((bucket) => bucket.count)).toEqual([0, 2, 0, 0, 0, 0, 1]);
    expect(result.total).toBe(3);
    expect(result.range).toMatchObject({ period: "7d", granularity: "day" });
  });

  it("uses Monday weeks for weekly trends and months for monthly trends", async () => {
    const aggregate = vi.spyOn(Patient, "aggregate").mockResolvedValue([{ _id: new Date("2026-11-09T00:00:00Z"), count: 4 }] as never);
    const weekly = await dashboard.getPatientTrends(range({ period: "90d" }));
    expect((aggregate.mock.calls[0]![0] as any[])[1].$group._id.$dateTrunc).toEqual({ date: "$createdAt", unit: "week", timezone: "UTC", startOfWeek: "monday" });
    expect(weekly.data.at(-1)!.count).toBe(4);

    aggregate.mockResolvedValue([{ _id: new Date("2026-01-01T00:00:00Z"), count: 7 }, { _id: new Date("2025-12-01T00:00:00Z"), count: 3 }] as never);
    const monthly = await dashboard.getPatientTrends(range({ period: "12m" }));
    expect((aggregate.mock.calls[1]![0] as any[])[1].$group._id.$dateTrunc.unit).toBe("month");
    expect(monthly.data.slice(0, 3).map((bucket) => bucket.count)).toEqual([3, 7, 0]); // chronological regardless of row order
  });

  it("returns all-zero buckets when there is no data", async () => {
    vi.spyOn(Patient, "aggregate").mockResolvedValue([] as never);
    const result = await dashboard.getPatientTrends(range({ period: "30d" }));
    expect(result.data).toHaveLength(30);
    expect(result.total).toBe(0);
  });
});

describe("summary service", () => {
  it("combines all-time totals, period counts, average, and top categories", async () => {
    const count = vi.spyOn(Doctor, "countDocuments").mockImplementation(((filter?: object) => Promise.resolve(filter && Object.keys(filter).length ? 4 : 30)) as never);
    vi.spyOn(Patient, "countDocuments").mockImplementation(((filter?: object) => Promise.resolve(filter && Object.keys(filter).length ? 22 : 151)) as never);
    vi.spyOn(Doctor, "aggregate").mockResolvedValue(groupedResult([{ label: "Cardiology", count: 4 }], 30, 12) as never);
    vi.spyOn(Patient, "aggregate").mockResolvedValue(groupedResult([{ label: "Asthma", count: 9 }], 151, 50) as never);
    const resolved = range({ period: "30d" });
    const result = await dashboard.getSummary(resolved);
    expect(result.data).toEqual({
      totalDoctors: 30, totalPatients: 151, newDoctors: 4, newPatients: 22, averagePatientsPerDoctor: 5,
      topSpecialization: { label: "Cardiology", count: 4 }, topCondition: { label: "Asthma", count: 9 },
    });
    expect(count).toHaveBeenCalledWith({ createdAt: { $gte: resolved.from, $lt: resolved.toExclusive } });
    expect(result.scope).toMatchObject({ totals: "all-time", newPatients: "period", averagePatientsPerDoctor: "all-time" });
  });

  it("rounds the average to one decimal", async () => {
    vi.spyOn(Doctor, "countDocuments").mockResolvedValue(31 as never);
    vi.spyOn(Patient, "countDocuments").mockResolvedValue(150 as never);
    vi.spyOn(Doctor, "aggregate").mockResolvedValue(groupedResult([], 0, 0) as never);
    vi.spyOn(Patient, "aggregate").mockResolvedValue(groupedResult([], 0, 0) as never);
    expect((await dashboard.getSummary(range({}))).data.averagePatientsPerDoctor).toBe(4.8);
  });

  it("handles an empty database without dividing by zero", async () => {
    vi.spyOn(Doctor, "countDocuments").mockResolvedValue(0 as never);
    vi.spyOn(Patient, "countDocuments").mockResolvedValue(0 as never);
    vi.spyOn(Doctor, "aggregate").mockResolvedValue([] as never);
    vi.spyOn(Patient, "aggregate").mockResolvedValue([] as never);
    expect((await dashboard.getSummary(range({}))).data).toEqual({
      totalDoctors: 0, totalPatients: 0, newDoctors: 0, newPatients: 0, averagePatientsPerDoctor: 0, topSpecialization: null, topCondition: null,
    });
  });

  it("is served by GET /api/dashboard/summary with the resolved range", async () => {
    vi.useFakeTimers({ now: NOW, toFake: ["Date"] });
    const summary = vi.spyOn(dashboard, "getSummary").mockResolvedValue({ data: { totalDoctors: 1 } } as never);
    await get("/api/dashboard/summary?period=7d").expect(200);
    expect(summary.mock.calls[0]![0]).toMatchObject({ period: "7d", from: new Date("2026-11-05T00:00:00Z"), granularity: "day" });
    await get("/api/dashboard/summary?from=2026-01-01&to=2026-01-10").expect(200);
    expect(summary.mock.calls[1]![0]).toMatchObject({ period: "custom", from: new Date("2026-01-01T00:00:00Z"), toExclusive: new Date("2026-01-11T00:00:00Z") });
  });
});

describe("patients per doctor service", () => {
  const top = [
    { doctorId: "d1", name: "Dr. A", specialization: "Cardiology", patientCount: 12 },
    { doctorId: "d2", name: "Dr. B", specialization: "Neurology", patientCount: 7 },
  ];

  it("groups, joins doctors in one $lookup, sorts by count, and limits", async () => {
    const aggregate = vi.spyOn(Patient, "aggregate").mockResolvedValue([{ top, assigned: [{ count: 2 }] }] as never);
    vi.spyOn(Doctor, "countDocuments").mockResolvedValue(2 as never);
    const result = await dashboard.getPatientsPerDoctor(2);
    const pipeline = aggregate.mock.calls[0]![0] as Array<Record<string, any>>;
    expect(pipeline[0]).toEqual({ $group: { _id: "$doctorId", patientCount: { $sum: 1 } } });
    expect(pipeline[1]!.$lookup).toMatchObject({ localField: "_id", foreignField: "_id", as: "doctor" });
    expect(pipeline[3]!.$facet.top).toEqual(expect.arrayContaining([{ $sort: { patientCount: -1, "doctor.name": 1, _id: 1 } }, { $limit: 2 }]));
    expect(result.data).toEqual(top);
    expect(result.meta).toEqual({ limit: 2, totalDoctors: 2, doctorsWithPatients: 2, doctorsWithoutPatients: 0 });
  });

  it("fills short lists with doctors who have zero patients", async () => {
    vi.spyOn(Patient, "aggregate").mockResolvedValue([{ top, assigned: [{ count: 2 }] }] as never);
    vi.spyOn(Doctor, "countDocuments").mockResolvedValue(5 as never);
    vi.spyOn(Patient, "distinct").mockResolvedValue(["d1", "d2"] as never);
    const idle = chain([{ _id: "d3", name: "Dr. C", specialization: "Oncology" }]);
    const find = vi.spyOn(Doctor, "find").mockReturnValue(idle as never);
    const result = await dashboard.getPatientsPerDoctor(3);
    expect(find).toHaveBeenCalledWith({ _id: { $nin: ["d1", "d2"] } });
    expect(idle.limit).toHaveBeenCalledWith(1);
    expect(result.data.at(-1)).toEqual({ doctorId: "d3", name: "Dr. C", specialization: "Oncology", patientCount: 0 });
    expect(result.meta.doctorsWithoutPatients).toBe(3);
  });

  it("does not query for idle doctors when the list is already full", async () => {
    vi.spyOn(Patient, "aggregate").mockResolvedValue([{ top, assigned: [{ count: 20 }] }] as never);
    vi.spyOn(Doctor, "countDocuments").mockResolvedValue(30 as never);
    const find = vi.spyOn(Doctor, "find");
    await dashboard.getPatientsPerDoctor(2);
    expect(find).not.toHaveBeenCalled();
  });

  it("handles an empty database", async () => {
    vi.spyOn(Patient, "aggregate").mockResolvedValue([{ top: [], assigned: [] }] as never);
    vi.spyOn(Doctor, "countDocuments").mockResolvedValue(0 as never);
    expect(await dashboard.getPatientsPerDoctor(10)).toEqual({ data: [], meta: { limit: 10, totalDoctors: 0, doctorsWithPatients: 0, doctorsWithoutPatients: 0 }, scope: "all-time" });
  });

  it("is served with the default limit of 10", async () => {
    const service = vi.spyOn(dashboard, "getPatientsPerDoctor").mockResolvedValue({ data: [] } as never);
    await get("/api/dashboard/patients-per-doctor").expect(200);
    expect(service).toHaveBeenCalledWith(10);
  });
});

describe("distribution services", () => {
  it("normalizes labels for grouping without modifying records", () => {
    const pipeline = dashboard.groupedCountPipeline("specialization", {}, 5) as Array<Record<string, any>>;
    expect(pipeline[0]!.$project.label.$cond[0]).toEqual({ $eq: [{ $type: "$specialization" }, "string"] });
    expect(pipeline[1]!.$group._id).toEqual({ $toLower: "$label" });
    expect(pipeline.some((stage) => "$out" in stage || "$merge" in stage)).toBe(false);
  });

  it("computes specialization percentages with an Other row", async () => {
    vi.spyOn(Doctor, "aggregate").mockResolvedValue(groupedResult([{ label: "Cardiology", count: 4 }, { label: "", count: 2 }], 30, 12) as never);
    const result = await dashboard.getSpecializations(2);
    expect(result.data).toEqual([
      { label: "Cardiology", count: 4, percentage: 13.3 },
      { label: "Unspecified", count: 2, percentage: 6.7 },
      { label: "Other", count: 24, percentage: 80 },
    ]);
    expect(result).toMatchObject({ total: 30, categories: 12, otherCategories: 10, scope: "all-time" });
  });

  it("filters conditions by patient creation date", async () => {
    const aggregate = vi.spyOn(Patient, "aggregate").mockResolvedValue(groupedResult([{ label: "Asthma", count: 3 }, { label: "Migraine", count: 1 }], 4, 2) as never);
    const resolved = range({ period: "90d" });
    const result = await dashboard.getConditions(resolved, 8);
    expect((aggregate.mock.calls[0]![0] as any[])[0]).toEqual({ $match: { createdAt: { $gte: resolved.from, $lt: resolved.toExclusive } } });
    expect(result.data).toEqual([{ label: "Asthma", count: 3, percentage: 75 }, { label: "Migraine", count: 1, percentage: 25 }]);
    expect(result).toMatchObject({ total: 4, otherCategories: 0, scope: "period", range: { period: "90d" } });
  });

  it("returns empty distributions without dividing by zero", async () => {
    vi.spyOn(Patient, "aggregate").mockResolvedValue([] as never);
    vi.spyOn(Doctor, "aggregate").mockResolvedValue(groupedResult([], 0, 0) as never);
    expect(await dashboard.getConditions(range({}), 8)).toMatchObject({ data: [], total: 0, categories: 0 });
    expect(await dashboard.getSpecializations(10)).toMatchObject({ data: [], total: 0 });
  });

  it("serves conditions with default limit 8 and the requested period", async () => {
    const service = vi.spyOn(dashboard, "getConditions").mockResolvedValue({ data: [] } as never);
    await get("/api/dashboard/conditions?period=12m&limit=5").expect(200);
    expect(service.mock.calls[0]![0]).toMatchObject({ period: "12m", granularity: "month" });
    expect(service.mock.calls[0]![1]).toBe(5);
    await get("/api/dashboard/conditions").expect(200);
    expect(service.mock.calls[1]![1]).toBe(8);
  });
});
