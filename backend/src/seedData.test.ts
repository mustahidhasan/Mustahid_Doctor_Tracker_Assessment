import mongoose, { Types } from "mongoose";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  assertSeedAllowed, generateSeedData, main, resolveReferenceDate, SEED_DOCTOR_COUNT, SEED_PATIENT_COUNT,
  seedDevelopmentData, type SeedDoctor, type SeedPatient, type SeedRepository, validateSeedData,
} from "./scripts/seedData.js";
import { doctorInputSchema, patientInputSchema } from "./validators/doctor.validator.js";

// No test here connects to MongoDB: an in-memory repository mirrors the insert-only semantics.

const REFERENCE = new Date("2026-11-11T00:00:00.000Z");
const DAY_MS = 24 * 60 * 60 * 1000;
const allowedEnvironment = { NODE_ENV: "development", ALLOW_DEV_SEED: "true", SEED_REFERENCE_DATE: "2026-11-11" } as NodeJS.ProcessEnv;

type StoredRecord = Record<string, unknown> & { _id: Types.ObjectId };

/** In-memory stand-in for the doctors/patients collections with `$setOnInsert` + upsert behavior. */
function memoryRepository(initial: { doctors?: StoredRecord[]; patients?: StoredRecord[] } = {}) {
  const doctors = new Map((initial.doctors ?? []).map((record) => [String(record._id), structuredClone(record)]));
  const patients = new Map((initial.patients ?? []).map((record) => [String(record._id), structuredClone(record)]));
  const insertMissing = (store: Map<string, StoredRecord>, records: Array<SeedDoctor | SeedPatient>) => {
    let inserted = 0;
    for (const record of records) {
      if (store.has(String(record._id))) continue;
      store.set(String(record._id), { ...record });
      inserted += 1;
    }
    return inserted;
  };
  const repository: SeedRepository = {
    insertMissingDoctors: async (records) => insertMissing(doctors, records),
    insertMissingPatients: async (records) => insertMissing(patients, records),
    existingDoctorIds: async (ids) => ids.map(String).filter((id) => doctors.has(id)),
  };
  return { repository, doctors, patients };
}

afterEach(() => { vi.restoreAllMocks(); process.exitCode = undefined; });

describe("generated seed data", () => {
  const data = generateSeedData(REFERENCE);

  it("contains 30 doctors and 150 patients with unique, valid ObjectIds", () => {
    expect(data.doctors).toHaveLength(SEED_DOCTOR_COUNT);
    expect(data.patients).toHaveLength(SEED_PATIENT_COUNT);
    expect(SEED_DOCTOR_COUNT).toBe(30);
    expect(SEED_PATIENT_COUNT).toBe(150);
    const ids = [...data.doctors, ...data.patients].map((record) => String(record._id));
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.every((id) => Types.ObjectId.isValid(id))).toBe(true);
  });

  it("is deterministic for the same reference day", () => {
    expect(generateSeedData(new Date("2026-11-11T18:30:00.000Z"))).toEqual(data);
    expect(generateSeedData(new Date("2026-06-01T00:00:00.000Z")).doctors.map((doctor) => String(doctor._id)))
      .toEqual(data.doctors.map((doctor) => String(doctor._id)));
  });

  it("references only seeded doctors and gives doctors varied patient counts", () => {
    const doctorIds = new Set(data.doctors.map((doctor) => String(doctor._id)));
    expect(data.patients.every((patient) => doctorIds.has(String(patient.doctorId)))).toBe(true);
    const counts = data.doctors.map((doctor) => data.patients.filter((patient) => String(patient.doctorId) === String(doctor._id)).length);
    expect(counts.reduce((sum, count) => sum + count, 0)).toBe(150);
    expect(counts.filter((count) => count === 0).length).toBeGreaterThanOrEqual(2);
    expect(new Set(counts).size).toBeGreaterThanOrEqual(6);
    expect(Math.max(...counts)).toBeGreaterThan(SEED_PATIENT_COUNT / SEED_DOCTOR_COUNT * 1.5);
  });

  it("supports search, filters, pagination, and date-range testing", () => {
    expect(new Set(data.doctors.map((doctor) => doctor.specialization)).size).toBeGreaterThanOrEqual(10);
    expect(new Set(data.doctors.map((doctor) => doctor.hospital)).size).toBeGreaterThanOrEqual(6);
    expect(new Set(data.doctors.map((doctor) => doctor.name)).size).toBe(30);
    expect(new Set(data.patients.map((patient) => patient.condition)).size).toBeGreaterThanOrEqual(25);
    expect(data.doctors.length).toBeGreaterThan(20); // three pages at the default page size of 10
    const yearAgo = REFERENCE.getTime() - 365 * DAY_MS;
    for (const record of [...data.doctors, ...data.patients]) {
      expect(record.createdAt.getTime()).toBeGreaterThanOrEqual(yearAgo);
      expect(record.createdAt.getTime()).toBeLessThan(REFERENCE.getTime());
      expect(record.updatedAt).toEqual(record.createdAt);
    }
    const months = new Set(data.doctors.map((doctor) => doctor.createdAt.toISOString().slice(0, 7)));
    expect(months.size).toBeGreaterThanOrEqual(8);
  });

  it("registers every patient after their doctor", () => {
    const doctors = new Map(data.doctors.map((doctor) => [String(doctor._id), doctor]));
    for (const patient of data.patients) expect(patient.createdAt.getTime()).toBeGreaterThan(doctors.get(String(patient.doctorId))!.createdAt.getTime());
  });

  it("passes the Mongoose schemas and the API validators", async () => {
    await expect(validateSeedData(data)).resolves.toBeUndefined();
    for (const doctor of data.doctors) {
      expect(doctorInputSchema.safeParse({ name: doctor.name, specialization: doctor.specialization, hospital: doctor.hospital, phone: doctor.phone, email: doctor.email }).success).toBe(true);
    }
    for (const patient of data.patients) {
      expect(patientInputSchema.safeParse({ name: patient.name, condition: patient.condition, phone: patient.phone, email: patient.email }).success).toBe(true);
    }
  });

  it("uses only fictional contact details", () => {
    for (const record of [...data.doctors, ...data.patients]) {
      if (record.email) expect(record.email).toMatch(/\.example$/);
      if (record.phone) expect(record.phone).toMatch(/^\+1 555 01\d{2} \d{4}$/);
    }
  });
});

describe("seed safety guards", () => {
  it("rejects production even with explicit permission", () => {
    expect(() => assertSeedAllowed({ NODE_ENV: "production", ALLOW_DEV_SEED: "true" } as NodeJS.ProcessEnv)).toThrow(/production/);
  });

  it("requires ALLOW_DEV_SEED=true", () => {
    expect(() => assertSeedAllowed({ NODE_ENV: "development" } as NodeJS.ProcessEnv)).toThrow(/ALLOW_DEV_SEED/);
    expect(() => assertSeedAllowed({ NODE_ENV: "development", ALLOW_DEV_SEED: "yes" } as NodeJS.ProcessEnv)).toThrow(/ALLOW_DEV_SEED/);
    expect(() => assertSeedAllowed({ NODE_ENV: "development", ALLOW_DEV_SEED: "true" } as NodeJS.ProcessEnv)).not.toThrow();
  });

  it("validates the optional reference date", () => {
    expect(resolveReferenceDate({} as NodeJS.ProcessEnv, new Date("2026-03-04T15:00:00Z"))).toEqual(new Date("2026-03-04T00:00:00.000Z"));
    expect(resolveReferenceDate({ SEED_REFERENCE_DATE: "2026-01-31" } as NodeJS.ProcessEnv)).toEqual(new Date("2026-01-31T00:00:00.000Z"));
    expect(() => resolveReferenceDate({ SEED_REFERENCE_DATE: "2026-02-30" } as NodeJS.ProcessEnv)).toThrow();
  });

  it.each([
    [{ NODE_ENV: "production", ALLOW_DEV_SEED: "true" }],
    [{ NODE_ENV: "development" }],
  ])("exits nonzero without connecting or writing when blocked (%o)", async (environment) => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.spyOn(mongoose, "disconnect").mockResolvedValue(undefined);
    const connect = vi.fn(async () => undefined);
    const { repository, doctors, patients } = memoryRepository();
    await main(environment as NodeJS.ProcessEnv, repository, connect);
    expect(process.exitCode).toBe(1);
    expect(connect).not.toHaveBeenCalled();
    expect(doctors.size + patients.size).toBe(0);
  });

  it("exits nonzero when a database write fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.spyOn(mongoose, "disconnect").mockResolvedValue(undefined);
    const { repository } = memoryRepository();
    repository.insertMissingDoctors = async () => { throw new Error("connection lost"); };
    await main(allowedEnvironment, repository, async () => undefined);
    expect(process.exitCode).toBe(1);
  });
});

describe("seeding", () => {
  const data = generateSeedData(REFERENCE);

  it("inserts all records on first run and nothing on a second run", async () => {
    const { repository, doctors, patients } = memoryRepository();
    expect(await seedDevelopmentData(repository, data)).toEqual({ doctorsInserted: 30, doctorsSkipped: 0, patientsInserted: 150, patientsSkipped: 0 });
    expect(await seedDevelopmentData(repository, generateSeedData(REFERENCE))).toEqual({ doctorsInserted: 0, doctorsSkipped: 30, patientsInserted: 0, patientsSkipped: 150 });
    expect(doctors.size).toBe(30);
    expect(patients.size).toBe(150);
  });

  it("stays idempotent when re-run on a later day", async () => {
    const { repository, doctors, patients } = memoryRepository();
    await seedDevelopmentData(repository, data);
    await seedDevelopmentData(repository, generateSeedData(new Date("2027-02-01T00:00:00.000Z")));
    expect(doctors.size).toBe(30);
    expect(patients.size).toBe(150);
  });

  it("preserves manually created records and edits to seeded records", async () => {
    const manualDoctor = { _id: new Types.ObjectId(), name: "Dr. Manual Entry", specialization: "Cardiology", hospital: "Real Hospital", phone: "+1 555 0199 0000", email: "manual@real.example" };
    const manualPatient = { _id: new Types.ObjectId(), doctorId: manualDoctor._id, name: "Manual Patient", condition: "Checkup" };
    const editedSeedDoctor = { ...data.doctors[0]!, hospital: "Edited By Admin" };
    const { repository, doctors, patients } = memoryRepository({ doctors: [manualDoctor, editedSeedDoctor], patients: [manualPatient] });

    const result = await seedDevelopmentData(repository, data);

    expect(result.doctorsInserted).toBe(29);
    expect(doctors.size).toBe(31);
    expect(patients.size).toBe(151);
    expect(doctors.get(String(manualDoctor._id))).toEqual(manualDoctor);
    expect(patients.get(String(manualPatient._id))).toEqual(manualPatient);
    expect(doctors.get(String(editedSeedDoctor._id))!.hospital).toBe("Edited By Admin");
  });

  it("writes only valid doctor-patient references", async () => {
    const { repository, doctors, patients } = memoryRepository();
    await seedDevelopmentData(repository, data);
    for (const patient of patients.values()) expect(doctors.has(String(patient.doctorId))).toBe(true);
  });

  it("restores a seeded doctor that was deleted before writing its patients", async () => {
    const { repository, doctors } = memoryRepository();
    await seedDevelopmentData(repository, data);
    doctors.delete(String(data.doctors[0]!._id));
    expect((await seedDevelopmentData(repository, data)).doctorsInserted).toBe(1);
  });

  it("writes no patients if referenced doctors cannot be confirmed", async () => {
    const { repository, patients } = memoryRepository();
    repository.existingDoctorIds = async () => [];
    await expect(seedDevelopmentData(repository, data)).rejects.toThrow(/no patients were written/);
    expect(patients.size).toBe(0);
  });
});
