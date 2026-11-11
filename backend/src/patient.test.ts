import mongoose, { Types } from "mongoose";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { app } from "./app.js";
import { AppError } from "./errors/AppError.js";
import { Doctor } from "./models/Doctor.js";
import { Patient } from "./models/Patient.js";
import { User } from "./models/User.js";
import { generateSeedData } from "./scripts/seedData.js";
import * as doctorService from "./services/doctor.service.js";
import * as patientService from "./services/patient.service.js";
import { SESSION_COOKIE, signSession } from "./services/auth.js";
import { patientListQuerySchema } from "./validators/patient.validator.js";

// All tests use mocks or in-memory data; nothing here connects to or modifies MongoDB.

const userId = "507f1f77bcf86cd799439011";
const doctorId = "507f1f77bcf86cd799439012";
const patientId = "507f1f77bcf86cd799439013";
const otherDoctorId = "507f1f77bcf86cd799439014";
const doctorSummary = { _id: doctorId, name: "Dr. Ada", specialization: "Cardiology", hospital: "City Hospital" };
const patientView = { _id: patientId, doctorId, doctor: doctorSummary, name: "Pat Lee", condition: "Hypertension", createdAt: new Date(), updatedAt: new Date() };
const validBody = { name: "Pat Lee", condition: "Hypertension", doctorId, phone: "+1 555 0100 1234", email: "pat@example.com" };

function queryResult<T>(value: T) {
  return { select: () => ({ lean: async () => value }), lean: async () => value };
}

/** Chainable stand-in for Model.find()/findById()/findByIdAndUpdate() that records each call. */
function chain<T>(value: T) {
  const query = {
    select: vi.fn(() => query), sort: vi.fn(() => query), skip: vi.fn(() => query), limit: vi.fn(() => query),
    populate: vi.fn(() => query), lean: vi.fn(async () => value),
  };
  return query;
}

const cookie = () => `${SESSION_COOKIE}=${signSession(userId)}`;
const authed = {
  get: (url: string) => request(app).get(url).set("Cookie", cookie()),
  post: (url: string) => request(app).post(url).set("Cookie", cookie()),
  patch: (url: string) => request(app).patch(url).set("Cookie", cookie()),
  delete: (url: string) => request(app).delete(url).set("Cookie", cookie()),
};

beforeEach(() => {
  process.env.JWT_SECRET = "test-secret-that-is-at-least-thirty-two-characters";
  process.env.JWT_EXPIRES_IN = "1d";
  process.env.CORS_ORIGIN = "http://localhost:3000";
  vi.restoreAllMocks();
  vi.spyOn(User, "findById").mockReturnValue(queryResult({ _id: userId, name: "Admin", email: "admin@example.com", role: "admin" }) as never);
});

describe("patient API security", () => {
  it("rejects unauthenticated requests on every patient endpoint", async () => {
    const responses = await Promise.all([
      request(app).get("/api/patients"),
      request(app).get("/api/patients/filter-options"),
      request(app).post("/api/patients").send(validBody),
      request(app).get(`/api/patients/${patientId}`),
      request(app).patch(`/api/patients/${patientId}`).send({ name: "X" }),
      request(app).delete(`/api/patients/${patientId}`),
    ]);
    for (const response of responses) expect(response.status).toBe(401);
  });

  it("rejects sessions for accounts that are no longer admins", async () => {
    vi.spyOn(User, "findById").mockReturnValue(queryResult(null) as never);
    await authed.get("/api/patients").expect(401);
  });

  it("rejects writes from untrusted origins", async () => {
    const create = vi.spyOn(patientService, "createPatient");
    await authed.post("/api/patients").set("Origin", "https://evil.example").send(validBody).expect(403);
    await authed.patch(`/api/patients/${patientId}`).set("Sec-Fetch-Site", "cross-site").send({ name: "X" }).expect(403);
    await authed.delete(`/api/patients/${patientId}`).set("Origin", "https://evil.example").expect(403);
    expect(create).not.toHaveBeenCalled();
  });

  it("hides database errors behind generic responses", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.spyOn(patientService, "listPatients").mockRejectedValue(new Error("MongoServerError: connection to cluster0 secret"));
    expect((await authed.get("/api/patients").expect(500)).body).toEqual({ error: "Internal server error" });
    vi.spyOn(patientService, "getPatient").mockRejectedValue(new mongoose.Error.CastError("ObjectId", "x", "_id"));
    expect((await authed.get(`/api/patients/${patientId}`).expect(400)).body).toEqual({ error: "Invalid request data" });
  });
});

describe("patient validation", () => {
  it("rejects missing required fields with field-level details", async () => {
    const response = await authed.post("/api/patients").send({}).expect(400);
    expect(response.body.details.map((detail: { field: string }) => detail.field)).toEqual(expect.arrayContaining(["name", "condition", "doctorId"]));
  });

  it("rejects invalid doctor IDs, emails, phones, unknown fields, and long values", async () => {
    await authed.post("/api/patients").send({ ...validBody, doctorId: "not-an-id" }).expect(400);
    await authed.post("/api/patients").send({ ...validBody, email: "nope" }).expect(400);
    await authed.post("/api/patients").send({ ...validBody, phone: "12" }).expect(400);
    await authed.post("/api/patients").send({ ...validBody, createdAt: "2020-01-01" }).expect(400);
    await authed.post("/api/patients").send({ ...validBody, condition: "x".repeat(201) }).expect(400);
    await authed.patch(`/api/patients/${patientId}`).send({}).expect(400);
    await authed.patch(`/api/patients/${patientId}`).send({ doctorId: "bad" }).expect(400);
    await authed.patch(`/api/patients/${patientId}`).send({ name: "" }).expect(400);
  });

  it("rejects invalid patient IDs", async () => {
    await authed.get("/api/patients/not-an-id").expect(400);
    await authed.patch("/api/patients/123").send({ name: "X" }).expect(400);
    await authed.delete("/api/patients/zzz").expect(400);
  });

  it("rejects invalid list queries", async () => {
    await authed.get("/api/patients?page=0").expect(400);
    await authed.get("/api/patients?limit=500").expect(400);
    await authed.get("/api/patients?sort=random").expect(400);
    await authed.get("/api/patients?doctorId=abc").expect(400);
    await authed.get("/api/patients?dateFrom=2026-05-01&dateTo=2026-04-01").expect(400);
    await authed.get("/api/patients?dateTo=2026-13-01").expect(400);
  });
});

describe("patient CRUD routes", () => {
  it("creates a normalized patient", async () => {
    const create = vi.spyOn(patientService, "createPatient").mockResolvedValue(patientView as never);
    await authed.post("/api/patients").send({ ...validBody, name: "  Pat Lee ", email: " PAT@EXAMPLE.COM ", phone: "" }).expect(201);
    expect(create).toHaveBeenCalledWith({ name: "Pat Lee", condition: "Hypertension", doctorId, email: "pat@example.com", phone: undefined });
  });

  it("returns a 400 with field details when the assigned doctor does not exist", async () => {
    vi.spyOn(patientService, "createPatient").mockRejectedValue(new AppError(400, "Assigned doctor does not exist", [{ field: "doctorId", message: "Select an existing doctor" }]));
    const response = await authed.post("/api/patients").send(validBody).expect(400);
    expect(response.body).toEqual({ error: "Assigned doctor does not exist", details: [{ field: "doctorId", message: "Select an existing doctor" }] });
  });

  it("lists with search, condition, doctor, dates, sort, and pagination", async () => {
    const result = { data: [patientView], pagination: { page: 2, limit: 5, total: 6, totalPages: 2, hasNextPage: false, hasPreviousPage: true } };
    const list = vi.spyOn(patientService, "listPatients").mockResolvedValue(result as never);
    const response = await authed.get(`/api/patients?page=2&limit=5&search=fever&condition=Asthma&doctorId=${doctorId}&dateFrom=2026-01-01&dateTo=2026-01-31&sort=name_desc`).expect(200);
    expect(response.body.pagination).toEqual(result.pagination);
    expect(response.body.data[0].doctor.name).toBe("Dr. Ada");
    expect(list).toHaveBeenCalledWith({ page: 2, limit: 5, search: "fever", condition: "Asthma", doctorId, dateFrom: new Date("2026-01-01T00:00:00.000Z"), dateTo: new Date("2026-01-31T00:00:00.000Z"), sort: "name_desc" });
  });

  it("applies default pagination and newest-first sort", async () => {
    const list = vi.spyOn(patientService, "listPatients").mockResolvedValue({ data: [], pagination: {} } as never);
    await authed.get("/api/patients").expect(200);
    expect(list).toHaveBeenCalledWith({ page: 1, limit: 10, sort: "newest" });
  });

  it("serves filter options without treating the path as a patient ID", async () => {
    vi.spyOn(patientService, "getPatientFilterOptions").mockResolvedValue({ conditions: ["Asthma"], doctors: [{ _id: doctorId, name: "Dr. Ada", specialization: "Cardiology" }] });
    expect((await authed.get("/api/patients/filter-options").expect(200)).body.data.conditions).toEqual(["Asthma"]);
  });

  it("gets, edits, reassigns, and deletes a patient", async () => {
    vi.spyOn(patientService, "getPatient").mockResolvedValue(patientView as never);
    const update = vi.spyOn(patientService, "updatePatient").mockResolvedValue({ ...patientView, doctorId: otherDoctorId } as never);
    const remove = vi.spyOn(patientService, "deletePatient").mockResolvedValue();
    expect((await authed.get(`/api/patients/${patientId}`).expect(200)).body.data.name).toBe("Pat Lee");
    await authed.patch(`/api/patients/${patientId}`).send({ condition: " Asthma " }).expect(200);
    expect(update).toHaveBeenLastCalledWith(patientId, { condition: "Asthma" });
    const reassigned = await authed.patch(`/api/patients/${patientId}`).send({ doctorId: otherDoctorId, email: "" }).expect(200);
    expect(reassigned.body.data.doctorId).toBe(otherDoctorId);
    expect(update).toHaveBeenLastCalledWith(patientId, { doctorId: otherDoctorId, email: null });
    await authed.delete(`/api/patients/${patientId}`).expect(204);
    expect(remove).toHaveBeenCalledWith(patientId);
  });

  it("returns 404 for missing patients", async () => {
    vi.spyOn(patientService, "getPatient").mockRejectedValue(new AppError(404, "Patient not found"));
    vi.spyOn(patientService, "updatePatient").mockRejectedValue(new AppError(404, "Patient not found"));
    vi.spyOn(patientService, "deletePatient").mockRejectedValue(new AppError(404, "Patient not found"));
    expect((await authed.get(`/api/patients/${patientId}`).expect(404)).body).toEqual({ error: "Patient not found" });
    await authed.patch(`/api/patients/${patientId}`).send({ name: "X" }).expect(404);
    await authed.delete(`/api/patients/${patientId}`).expect(404);
  });
});

describe("patient service", () => {
  it("builds an escaped search, exact filters, and an inclusive UTC date range", () => {
    const filter = patientService.buildPatientFilter({ search: "flu (a)*", condition: "Asthma", doctorId, dateFrom: new Date("2026-03-01T00:00:00Z"), dateTo: new Date("2026-03-31T00:00:00Z") });
    const clauses = filter.$or as Array<Record<string, RegExp>>;
    expect(clauses.map((clause) => Object.keys(clause)[0])).toEqual(["name", "condition", "email"]);
    expect(clauses[0]!.name!.source).toBe("flu \\(a\\)\\*");
    expect(clauses[0]!.name!.flags).toBe("i");
    expect(filter.condition).toBe("Asthma");
    expect(filter.doctorId).toBe(doctorId);
    expect(filter.createdAt).toEqual({ $gte: new Date("2026-03-01T00:00:00Z"), $lt: new Date("2026-04-01T00:00:00Z") });
    expect(patientService.buildPatientFilter({})).toEqual({});
  });

  it("paginates at the database level and populates only doctor summary fields", async () => {
    const raw = [{ _id: new Types.ObjectId(patientId), name: "Pat", condition: "Flu", doctorId: { _id: new Types.ObjectId(doctorId), name: "Dr. Ada", specialization: "Cardiology", hospital: "City" } }];
    const query = chain(raw);
    const find = vi.spyOn(Patient, "find").mockReturnValue(query as never);
    vi.spyOn(Patient, "countDocuments").mockResolvedValue(23 as never);
    const result = await patientService.listPatients({ page: 3, limit: 10, sort: "name_desc", doctorId });
    expect(find).toHaveBeenCalledWith({ doctorId });
    expect(query.sort).toHaveBeenCalledWith({ name: -1, _id: -1 });
    expect(query.skip).toHaveBeenCalledWith(20);
    expect(query.limit).toHaveBeenCalledWith(10);
    expect(query.populate).toHaveBeenCalledWith({ path: "doctorId", select: "name specialization hospital" });
    expect(query.lean).toHaveBeenCalled();
    expect(result.pagination).toEqual({ page: 3, limit: 10, total: 23, totalPages: 3, hasNextPage: false, hasPreviousPage: true });
    expect(result.data[0]).toMatchObject({ doctorId, doctor: { _id: doctorId, name: "Dr. Ada", specialization: "Cardiology", hospital: "City" } });
  });

  it.each([["newest", { createdAt: -1, _id: -1 }], ["oldest", { createdAt: 1, _id: 1 }], ["name", { name: 1, _id: 1 }]] as const)("sorts %s", async (sort, expected) => {
    const query = chain([]);
    vi.spyOn(Patient, "find").mockReturnValue(query as never);
    vi.spyOn(Patient, "countDocuments").mockResolvedValue(0 as never);
    const result = await patientService.listPatients({ page: 1, limit: 10, sort });
    expect(query.sort).toHaveBeenCalledWith(expected);
    expect(result.pagination).toMatchObject({ total: 0, totalPages: 0, hasNextPage: false, hasPreviousPage: false });
  });

  it("refuses to create a patient for a nonexistent doctor", async () => {
    vi.spyOn(Doctor, "exists").mockResolvedValue(null as never);
    const create = vi.spyOn(Patient, "create");
    await expect(patientService.createPatient({ name: "P", condition: "C", doctorId })).rejects.toMatchObject({ statusCode: 400, details: [{ field: "doctorId" }] });
    expect(create).not.toHaveBeenCalled();
  });

  it("creates a patient for an existing doctor without empty optional fields", async () => {
    vi.spyOn(Doctor, "exists").mockResolvedValue({ _id: doctorId } as never);
    const create = vi.spyOn(Patient, "create").mockResolvedValue({ toObject: () => ({ _id: patientId }) } as never);
    await patientService.createPatient({ name: "P", condition: "C", doctorId, phone: undefined, email: undefined });
    expect(create).toHaveBeenCalledWith({ doctorId, name: "P", condition: "C" });
  });

  it("reassigns a patient only to an existing doctor", async () => {
    const exists = vi.spyOn(Doctor, "exists").mockResolvedValue(null as never);
    const update = vi.spyOn(Patient, "findByIdAndUpdate");
    await expect(patientService.updatePatient(patientId, { doctorId: otherDoctorId })).rejects.toMatchObject({ statusCode: 400 });
    expect(update).not.toHaveBeenCalled();

    exists.mockResolvedValue({ _id: otherDoctorId } as never);
    update.mockReturnValue(chain({ _id: new Types.ObjectId(patientId), name: "P", condition: "C", doctorId: { _id: new Types.ObjectId(otherDoctorId), name: "Dr. B", specialization: "S", hospital: "H" } }) as never);
    const result = await patientService.updatePatient(patientId, { doctorId: otherDoctorId, email: null, name: "New" });
    expect(update).toHaveBeenCalledWith(patientId, { $set: { doctorId: otherDoctorId, name: "New" }, $unset: { email: "" } }, { returnDocument: "after", runValidators: true });
    expect(result.doctorId).toBe(otherDoctorId);
  });

  it("returns 404 when updating or getting a missing patient", async () => {
    vi.spyOn(Patient, "findByIdAndUpdate").mockReturnValue(chain(null) as never);
    vi.spyOn(Patient, "findById").mockReturnValue(chain(null) as never);
    await expect(patientService.updatePatient(patientId, { name: "X" })).rejects.toMatchObject({ statusCode: 404 });
    await expect(patientService.getPatient(patientId)).rejects.toMatchObject({ statusCode: 404 });
  });

  it("deletes a patient and reports a missing one", async () => {
    const remove = vi.spyOn(Patient, "deleteOne").mockResolvedValue({ deletedCount: 1 } as never);
    await patientService.deletePatient(patientId);
    expect(remove).toHaveBeenCalledWith({ _id: patientId });
    remove.mockResolvedValue({ deletedCount: 0 } as never);
    await expect(patientService.deletePatient(patientId)).rejects.toMatchObject({ statusCode: 404, message: "Patient not found" });
  });

  it("returns sorted conditions and a bounded doctor list for filters", async () => {
    vi.spyOn(Patient, "distinct").mockResolvedValue(["Migraine", "Asthma", ""] as never);
    const doctors = chain([{ _id: new Types.ObjectId(doctorId), name: "Dr. Ada", specialization: "Cardiology" }]);
    vi.spyOn(Doctor, "find").mockReturnValue(doctors as never);
    expect(await patientService.getPatientFilterOptions()).toEqual({ conditions: ["Asthma", "Migraine"], doctors: [{ _id: doctorId, name: "Dr. Ada", specialization: "Cardiology" }] });
    expect(doctors.limit).toHaveBeenCalledWith(patientService.DOCTOR_OPTION_LIMIT);
  });

  it("keeps a usable view when a referenced doctor is missing", () => {
    const view = patientService.toPatientView({ _id: new Types.ObjectId(patientId), name: "P", condition: "C", doctorId: null, createdAt: new Date(), updatedAt: new Date() });
    expect(view).toMatchObject({ doctorId: null, doctor: null });
  });
});

describe("doctor–patient consistency", () => {
  it("routes the Module 4 nested create through the shared patient creation logic", async () => {
    vi.spyOn(Doctor, "exists").mockResolvedValue({ _id: doctorId } as never);
    const create = vi.spyOn(Patient, "create").mockResolvedValue({ toObject: () => ({ _id: patientId, doctorId }) } as never);
    await doctorService.createDoctorPatient(doctorId, { name: "P", condition: "C", phone: undefined, email: undefined });
    expect(create).toHaveBeenCalledWith({ doctorId, name: "P", condition: "C" });
  });

  it("filters the patients list by the same doctorId field the doctor page uses", () => {
    expect(patientService.buildPatientFilter({ doctorId })).toEqual({ doctorId });
  });

  it("keeps the nested delete scoped to the doctor", async () => {
    vi.spyOn(Doctor, "exists").mockResolvedValue({ _id: doctorId } as never);
    const remove = vi.spyOn(Patient, "deleteOne").mockResolvedValue({ deletedCount: 0 } as never);
    await expect(doctorService.deleteDoctorPatient(doctorId, patientId)).rejects.toMatchObject({ statusCode: 404, message: "Patient not found for this doctor" });
    expect(remove).toHaveBeenCalledWith({ _id: patientId, doctorId });
  });
});

/**
 * Applies the real patient filters to the generated seed data with a tiny evaluator covering the
 * operators the service emits ($or of regexes, equality, createdAt $gte/$lt). This checks that the
 * seed data supports search, condition/doctor/date filters, and pagination.
 */
describe("seed data works with patient queries", () => {
  const seed = generateSeedData(new Date("2026-11-11T00:00:00.000Z"));
  type SeedPatient = (typeof seed.patients)[number];

  function matches(patient: SeedPatient, filter: Record<string, unknown>): boolean {
    return Object.entries(filter).every(([key, condition]) => {
      if (key === "$or") return (condition as Array<Record<string, RegExp>>).some((clause) => Object.entries(clause).every(([field, regex]) => regex.test(String(patient[field as keyof SeedPatient] ?? ""))));
      if (key === "createdAt") {
        const range = condition as { $gte?: Date; $lt?: Date };
        return (!range.$gte || patient.createdAt >= range.$gte) && (!range.$lt || patient.createdAt < range.$lt);
      }
      return String(patient[key as keyof SeedPatient]) === String(condition);
    });
  }
  const run = (query: Record<string, string>) => {
    const parsed = patientListQuerySchema.parse(query);
    const results = seed.patients.filter((patient) => matches(patient, patientService.buildPatientFilter(parsed) as Record<string, unknown>));
    return { parsed, results };
  };

  it("lists and paginates all 150 seeded patients", () => {
    const { parsed, results } = run({ limit: "10", page: "15" });
    expect(results).toHaveLength(150);
    expect(Math.ceil(results.length / parsed.limit)).toBe(15);
  });

  it("searches seeded patients by name and condition", () => {
    const sample = seed.patients[0]!;
    expect(run({ search: sample.name.split(" ")[0]!.toLowerCase() }).results).toContainEqual(sample);
    const conditionResults = run({ search: sample.condition.slice(0, 5) }).results;
    expect(conditionResults.length).toBeGreaterThan(0);
    expect(conditionResults.length).toBeLessThan(150);
  });

  it("filters seeded patients by condition, doctor, and date range", () => {
    const sample = seed.patients[0]!;
    const byCondition = run({ condition: sample.condition }).results;
    expect(byCondition.length).toBeGreaterThan(0);
    expect(byCondition.every((patient) => patient.condition === sample.condition)).toBe(true);

    const byDoctor = run({ doctorId: String(sample.doctorId) }).results;
    expect(byDoctor.length).toBeGreaterThan(0);
    expect(byDoctor.every((patient) => String(patient.doctorId) === String(sample.doctorId))).toBe(true);

    const byDate = run({ dateFrom: "2026-08-01", dateTo: "2026-10-31" }).results;
    expect(byDate.length).toBeGreaterThan(0);
    expect(byDate.length).toBeLessThan(150);
  });
});
