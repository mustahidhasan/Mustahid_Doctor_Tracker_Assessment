import mongoose from "mongoose";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { app } from "./app.js";
import { AppError } from "./errors/AppError.js";
import { Doctor } from "./models/Doctor.js";
import { Patient } from "./models/Patient.js";
import { User } from "./models/User.js";
import * as doctorService from "./services/doctor.service.js";
import { SESSION_COOKIE, signSession } from "./services/auth.js";

// All tests use mocks; nothing here connects to or modifies MongoDB.

const userId = "507f1f77bcf86cd799439011";
const doctorId = "507f1f77bcf86cd799439012";
const patientId = "507f1f77bcf86cd799439013";
const otherDoctorId = "507f1f77bcf86cd799439014";
const doctor = { _id: doctorId, name: "Dr. Ada", specialization: "Cardiology", hospital: "City Hospital", phone: "+8801700000000", email: "ada@example.com", createdAt: new Date(), updatedAt: new Date() };
const validDoctorBody = { name: "Dr. Ada", specialization: "Cardiology", hospital: "City Hospital", phone: "+8801700000000", email: "ada@example.com" };

function queryResult<T>(value: T) {
  return { select: () => ({ lean: async () => value }), lean: async () => value };
}

/** Chainable stand-in for Model.find() that records each call. */
function findChain<T>(value: T) {
  const chain = {
    select: vi.fn(() => chain),
    sort: vi.fn(() => chain),
    skip: vi.fn(() => chain),
    limit: vi.fn(() => chain),
    lean: vi.fn(async () => value),
  };
  return chain;
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

describe("doctor API security", () => {
  it("rejects unauthenticated requests on every doctor endpoint", async () => {
    const calls = [
      request(app).get("/api/doctors"),
      request(app).post("/api/doctors").send(validDoctorBody),
      request(app).get("/api/doctors/filter-options"),
      request(app).get(`/api/doctors/${doctorId}`),
      request(app).patch(`/api/doctors/${doctorId}`).send({ name: "X" }),
      request(app).delete(`/api/doctors/${doctorId}`),
      request(app).get(`/api/doctors/${doctorId}/patients`),
      request(app).post(`/api/doctors/${doctorId}/patients`).send({ name: "P", condition: "C" }),
      request(app).delete(`/api/doctors/${doctorId}/patients/${patientId}`),
    ];
    for (const response of await Promise.all(calls)) expect(response.status).toBe(401);
  });

  it("rejects a session whose account is no longer an admin", async () => {
    vi.spyOn(User, "findById").mockReturnValue(queryResult(null) as never);
    await authed.get("/api/doctors").expect(401);
  });

  it("rejects state-changing requests from untrusted origins", async () => {
    const create = vi.spyOn(doctorService, "createDoctor");
    await authed.post("/api/doctors").set("Origin", "https://evil.example").send(validDoctorBody).expect(403);
    await authed.delete(`/api/doctors/${doctorId}`).set("Sec-Fetch-Site", "cross-site").expect(403);
    expect(create).not.toHaveBeenCalled();
  });

  it("does not leak raw database errors", async () => {
    vi.spyOn(doctorService, "getDoctor").mockRejectedValue(new Error("E11000 secret connection detail"));
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const response = await authed.get(`/api/doctors/${doctorId}`).expect(500);
    expect(response.body).toEqual({ error: "Internal server error" });
    vi.spyOn(doctorService, "getDoctor").mockRejectedValue(new mongoose.Error.CastError("ObjectId", "bad", "_id"));
    expect((await authed.get(`/api/doctors/${doctorId}`).expect(400)).body).toEqual({ error: "Invalid request data" });
  });
});

describe("doctor input validation", () => {
  it("rejects missing required fields with field-level details", async () => {
    const response = await authed.post("/api/doctors").send({ name: "  " }).expect(400);
    const fields = response.body.details.map((detail: { field: string }) => detail.field);
    expect(fields).toEqual(expect.arrayContaining(["name", "specialization", "hospital", "phone", "email"]));
  });

  it("rejects invalid email, phone, unknown fields, and over-long values", async () => {
    await authed.post("/api/doctors").send({ ...validDoctorBody, email: "invalid" }).expect(400);
    await authed.post("/api/doctors").send({ ...validDoctorBody, phone: "call me" }).expect(400);
    await authed.post("/api/doctors").send({ ...validDoctorBody, phone: "123" }).expect(400);
    await authed.post("/api/doctors").send({ ...validDoctorBody, role: "admin" }).expect(400);
    await authed.post("/api/doctors").send({ ...validDoctorBody, name: "x".repeat(121) }).expect(400);
    await authed.patch(`/api/doctors/${doctorId}`).send({}).expect(400);
  });

  it("rejects invalid ObjectIds", async () => {
    await authed.get("/api/doctors/not-an-id").expect(400);
    await authed.get("/api/doctors/not-an-id/patients").expect(400);
    await authed.delete(`/api/doctors/${doctorId}/patients/not-an-id`).expect(400);
    await authed.patch("/api/doctors/123").send({ name: "X" }).expect(400);
  });

  it("rejects invalid pagination, sort, and date filters", async () => {
    await authed.get("/api/doctors?page=0").expect(400);
    await authed.get("/api/doctors?limit=101").expect(400);
    await authed.get("/api/doctors?page=abc").expect(400);
    await authed.get("/api/doctors?sort=random").expect(400);
    await authed.get("/api/doctors?dateFrom=2026-12-10&dateTo=2026-01-01").expect(400);
    await authed.get("/api/doctors?dateFrom=2026-02-30").expect(400);
    await authed.get("/api/doctors?dateFrom=yesterday").expect(400);
    await authed.get(`/api/doctors?search=${"a".repeat(101)}`).expect(400);
  });
});

describe("doctor CRUD routes", () => {
  it("creates a normalized doctor", async () => {
    const spy = vi.spyOn(doctorService, "createDoctor").mockResolvedValue(doctor as never);
    const response = await authed.post("/api/doctors").send({ name: " Dr. Ada ", specialization: " Cardiology ", hospital: " City Hospital ", phone: " +880 1700-000000 ", email: " ADA@EXAMPLE.COM " }).expect(201);
    expect(response.body.data.name).toBe("Dr. Ada");
    expect(spy).toHaveBeenCalledWith({ name: "Dr. Ada", specialization: "Cardiology", hospital: "City Hospital", phone: "+880 1700-000000", email: "ada@example.com" });
  });

  it("lists with parsed search, filters, pagination, dates, and sorting", async () => {
    const result = { data: [doctor], pagination: { page: 2, limit: 5, total: 6, totalPages: 2, hasNextPage: false, hasPreviousPage: true } };
    const spy = vi.spyOn(doctorService, "listDoctors").mockResolvedValue(result as never);
    const response = await authed.get("/api/doctors?page=2&limit=5&search=ada&specialization=Cardiology&hospital=City%20Hospital&dateFrom=2026-01-01&dateTo=2026-12-31&sort=name").expect(200);
    expect(response.body.pagination).toEqual(result.pagination);
    expect(spy).toHaveBeenCalledWith({ page: 2, limit: 5, search: "ada", specialization: "Cardiology", hospital: "City Hospital", dateFrom: new Date("2026-01-01T00:00:00.000Z"), dateTo: new Date("2026-12-31T00:00:00.000Z"), sort: "name" });
  });

  it("applies default pagination and sort", async () => {
    const spy = vi.spyOn(doctorService, "listDoctors").mockResolvedValue({ data: [], pagination: {} } as never);
    await authed.get("/api/doctors").expect(200);
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ page: 1, limit: 10, sort: "newest" }));
  });

  it("serves filter options without treating the path as a doctor ID", async () => {
    vi.spyOn(doctorService, "getDoctorFilterOptions").mockResolvedValue({ specializations: ["Cardiology"], hospitals: ["City Hospital"] });
    const response = await authed.get("/api/doctors/filter-options").expect(200);
    expect(response.body.data.specializations).toEqual(["Cardiology"]);
  });

  it("gets, updates, and deletes a doctor", async () => {
    vi.spyOn(doctorService, "getDoctor").mockResolvedValue(doctor as never);
    const update = vi.spyOn(doctorService, "updateDoctor").mockResolvedValue({ ...doctor, hospital: "New Hospital" } as never);
    vi.spyOn(doctorService, "deleteDoctor").mockResolvedValue();
    expect((await authed.get(`/api/doctors/${doctorId}`).expect(200)).body.data.name).toBe("Dr. Ada");
    const updated = await authed.patch(`/api/doctors/${doctorId}`).send({ hospital: " New Hospital " }).expect(200);
    expect(updated.body.data.hospital).toBe("New Hospital");
    expect(update).toHaveBeenCalledWith(doctorId, { hospital: "New Hospital" });
    const removed = await authed.delete(`/api/doctors/${doctorId}`).expect(204);
    expect(removed.body).toEqual({});
  });

  it("returns safe 404 and 409 errors", async () => {
    vi.spyOn(doctorService, "getDoctor").mockRejectedValue(new AppError(404, "Doctor not found"));
    expect((await authed.get(`/api/doctors/${doctorId}`).expect(404)).body).toEqual({ error: "Doctor not found" });
    vi.spyOn(doctorService, "deleteDoctor").mockRejectedValue(new AppError(409, "This doctor has 1 associated patient."));
    await authed.delete(`/api/doctors/${doctorId}`).expect(409);
  });
});

describe("doctor-patient routes", () => {
  it("lists and creates patients for a doctor", async () => {
    const patient = { _id: patientId, doctorId, name: "Patient One", condition: "Follow-up" };
    vi.spyOn(doctorService, "listDoctorPatients").mockResolvedValue({ data: [patient], total: 1, limit: 100 } as never);
    const create = vi.spyOn(doctorService, "createDoctorPatient").mockResolvedValue(patient as never);
    const list = await authed.get(`/api/doctors/${doctorId}/patients`).expect(200);
    expect(list.body).toEqual({ data: [patient], total: 1, limit: 100 });
    await authed.post(`/api/doctors/${doctorId}/patients`).send({ name: "Patient One", condition: "Follow-up", email: "PATIENT@EXAMPLE.COM", phone: "" }).expect(201);
    expect(create).toHaveBeenCalledWith(doctorId, { name: "Patient One", condition: "Follow-up", email: "patient@example.com", phone: undefined });
  });

  it("validates patient input", async () => {
    await authed.post(`/api/doctors/${doctorId}/patients`).send({ name: "", condition: "" }).expect(400);
    await authed.post(`/api/doctors/${doctorId}/patients`).send({ name: "P", condition: "C", email: "nope" }).expect(400);
    await authed.post(`/api/doctors/${doctorId}/patients`).send({ name: "P", condition: "C", doctorId: otherDoctorId }).expect(400);
  });

  it("rejects patient creation under a missing doctor", async () => {
    vi.spyOn(doctorService, "createDoctorPatient").mockRejectedValue(new AppError(404, "Doctor not found"));
    await authed.post(`/api/doctors/${doctorId}/patients`).send({ name: "Patient", condition: "Checkup" }).expect(404);
  });

  it("deletes an associated patient and reports a foreign patient as not found", async () => {
    const remove = vi.spyOn(doctorService, "deleteDoctorPatient").mockResolvedValue();
    await authed.delete(`/api/doctors/${doctorId}/patients/${patientId}`).expect(204);
    expect(remove).toHaveBeenCalledWith(doctorId, patientId);
    remove.mockRejectedValueOnce(new AppError(404, "Patient not found for this doctor"));
    await authed.delete(`/api/doctors/${otherDoctorId}/patients/${patientId}`).expect(404);
  });
});

describe("doctor service queries", () => {
  it("escapes search input and builds exact filters and an inclusive UTC date range", () => {
    const filter = doctorService.buildDoctorFilter({
      search: "a.b(c)*",
      specialization: "Cardiology",
      hospital: "City Hospital",
      dateFrom: new Date("2026-01-01T00:00:00.000Z"),
      dateTo: new Date("2026-01-31T00:00:00.000Z"),
    });
    const expression = (filter.$or as Array<{ name?: RegExp }>)[0]!.name!;
    expect(expression.source).toBe("a\\.b\\(c\\)\\*");
    expect(expression.flags).toBe("i");
    expect(expression.test("xA.B(C)*y")).toBe(true);
    expect(expression.test("aXb(c)")).toBe(false);
    expect((filter.$or as object[]).map((clause) => Object.keys(clause)[0])).toEqual(["name", "specialization", "hospital", "email"]);
    expect(filter.specialization).toBe("Cardiology");
    expect(filter.hospital).toBe("City Hospital");
    expect(filter.createdAt).toEqual({ $gte: new Date("2026-01-01T00:00:00.000Z"), $lt: new Date("2026-02-01T00:00:00.000Z") });
    expect(doctorService.buildDoctorFilter({})).toEqual({});
  });

  it("paginates and sorts at the database level with a lean projection", async () => {
    const chain = findChain([doctor]);
    const find = vi.spyOn(Doctor, "find").mockReturnValue(chain as never);
    const count = vi.spyOn(Doctor, "countDocuments").mockResolvedValue(21 as never);
    const result = await doctorService.listDoctors({ page: 2, limit: 10, sort: "name" });
    expect(find).toHaveBeenCalledWith({});
    expect(count).toHaveBeenCalledWith({});
    expect(chain.select).toHaveBeenCalledWith(expect.stringContaining("specialization"));
    expect(chain.sort).toHaveBeenCalledWith({ name: 1, _id: 1 });
    expect(chain.skip).toHaveBeenCalledWith(10);
    expect(chain.limit).toHaveBeenCalledWith(10);
    expect(chain.lean).toHaveBeenCalled();
    expect(result.pagination).toEqual({ page: 2, limit: 10, total: 21, totalPages: 3, hasNextPage: true, hasPreviousPage: true });
  });

  it("uses newest-first by default and supports oldest-first", async () => {
    const chain = findChain([]);
    vi.spyOn(Doctor, "find").mockReturnValue(chain as never);
    vi.spyOn(Doctor, "countDocuments").mockResolvedValue(0 as never);
    const empty = await doctorService.listDoctors({ page: 1, limit: 10, sort: "newest" });
    expect(chain.sort).toHaveBeenLastCalledWith({ createdAt: -1, _id: -1 });
    expect(empty.pagination).toEqual({ page: 1, limit: 10, total: 0, totalPages: 0, hasNextPage: false, hasPreviousPage: false });
    await doctorService.listDoctors({ page: 1, limit: 10, sort: "oldest" });
    expect(chain.sort).toHaveBeenLastCalledWith({ createdAt: 1, _id: 1 });
  });

  it("returns sorted distinct filter options", async () => {
    vi.spyOn(Doctor, "distinct").mockImplementation(((field: string) => Promise.resolve(field === "specialization" ? ["Neurology", "Cardiology", ""] : ["Zeta", "Alpha"])) as never);
    expect(await doctorService.getDoctorFilterOptions()).toEqual({ specializations: ["Cardiology", "Neurology"], hospitals: ["Alpha", "Zeta"] });
  });

  it("blocks doctor deletion while associated patients exist", async () => {
    vi.spyOn(Doctor, "exists").mockResolvedValue({ _id: doctorId } as never);
    vi.spyOn(Patient, "countDocuments").mockResolvedValue(2 as never);
    const remove = vi.spyOn(Doctor, "deleteOne");
    await expect(doctorService.deleteDoctor(doctorId)).rejects.toMatchObject({ statusCode: 409, message: expect.stringContaining("2 associated patients") });
    expect(remove).not.toHaveBeenCalled();
  });

  it("deletes a doctor without patients and 404s for a missing doctor", async () => {
    const exists = vi.spyOn(Doctor, "exists").mockResolvedValue({ _id: doctorId } as never);
    vi.spyOn(Patient, "countDocuments").mockResolvedValue(0 as never);
    const remove = vi.spyOn(Doctor, "deleteOne").mockResolvedValue({ deletedCount: 1 } as never);
    await doctorService.deleteDoctor(doctorId);
    expect(remove).toHaveBeenCalledWith({ _id: doctorId });
    exists.mockResolvedValue(null as never);
    await expect(doctorService.deleteDoctor(doctorId)).rejects.toMatchObject({ statusCode: 404 });
  });

  it("refuses to create a patient under a nonexistent doctor", async () => {
    vi.spyOn(Doctor, "exists").mockResolvedValue(null as never);
    const create = vi.spyOn(Patient, "create");
    await expect(doctorService.createDoctorPatient(doctorId, { name: "P", condition: "C" })).rejects.toMatchObject({ statusCode: 404 });
    expect(create).not.toHaveBeenCalled();
  });

  it("creates a patient linked to the doctor", async () => {
    vi.spyOn(Doctor, "exists").mockResolvedValue({ _id: doctorId } as never);
    const create = vi.spyOn(Patient, "create").mockResolvedValue({ toObject: () => ({ _id: patientId }) } as never);
    await doctorService.createDoctorPatient(doctorId, { name: "P", condition: "C", email: "p@example.com" });
    expect(create).toHaveBeenCalledWith({ doctorId, name: "P", condition: "C", email: "p@example.com" });
  });

  it("scopes patient deletion to the doctor and rejects cross-doctor deletion", async () => {
    vi.spyOn(Doctor, "exists").mockResolvedValue({ _id: otherDoctorId } as never);
    const remove = vi.spyOn(Patient, "deleteOne").mockResolvedValue({ deletedCount: 0 } as never);
    await expect(doctorService.deleteDoctorPatient(otherDoctorId, patientId)).rejects.toMatchObject({ statusCode: 404 });
    expect(remove).toHaveBeenCalledWith({ _id: patientId, doctorId: otherDoctorId });
    remove.mockResolvedValue({ deletedCount: 1 } as never);
    await expect(doctorService.deleteDoctorPatient(doctorId, patientId)).resolves.toBeUndefined();
  });

  it("lists a doctor's patients with a total count and bounded result size", async () => {
    vi.spyOn(Doctor, "exists").mockResolvedValue({ _id: doctorId } as never);
    const chain = findChain([{ _id: patientId }]);
    const find = vi.spyOn(Patient, "find").mockReturnValue(chain as never);
    vi.spyOn(Patient, "countDocuments").mockResolvedValue(150 as never);
    const result = await doctorService.listDoctorPatients(doctorId);
    expect(find).toHaveBeenCalledWith({ doctorId });
    expect(chain.limit).toHaveBeenCalledWith(doctorService.DOCTOR_PATIENT_LIMIT);
    expect(result).toEqual({ data: [{ _id: patientId }], total: 150, limit: 100 });
  });
});
