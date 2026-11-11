import "dotenv/config";
import { createHash } from "node:crypto";
import mongoose, { Types } from "mongoose";
import { connectDB } from "../config/db.js";
import { Doctor } from "../models/Doctor.js";
import { Patient } from "../models/Patient.js";

/**
 * Development seed data: 30 fictional doctors and 150 fictional patients.
 *
 * Safety:
 * - Refuses to run when NODE_ENV=production, and requires ALLOW_DEV_SEED=true.
 * - Insert-only: each record has a stable, deterministic _id and is written with
 *   `$setOnInsert` + upsert, so existing records (seed or manual) are never modified,
 *   nothing is ever deleted, and re-running never creates duplicates.
 * - Only the doctors and patients collections are touched; user/admin accounts are not.
 *
 * All names, phone numbers (555-01xx fictional range), and emails (reserved
 * `.example` domain) are fictional.
 */

export const SEED_DOCTOR_COUNT = 30;
export const SEED_PATIENT_COUNT = 150;
/** Doctors at these indexes intentionally get no patients (useful for testing doctor deletion). */
const DOCTORS_WITHOUT_PATIENTS = new Set([SEED_DOCTOR_COUNT - 2, SEED_DOCTOR_COUNT - 1]);
const SEED_NAMESPACE = "doctor-tracker-dev-seed";
const PRNG_SEED = 20_260_101;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface SeedDoctor {
  _id: Types.ObjectId;
  name: string;
  specialization: string;
  hospital: string;
  phone: string;
  email: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface SeedPatient {
  _id: Types.ObjectId;
  doctorId: Types.ObjectId;
  name: string;
  condition: string;
  phone?: string;
  email?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface SeedData { doctors: SeedDoctor[]; patients: SeedPatient[]; }

const FIRST_NAMES = [
  "Amelia", "Arjun", "Beatriz", "Chen", "Daniel", "Elena", "Farah", "Gabriel", "Hana", "Ibrahim", "Isabel", "James",
  "Kavya", "Liam", "Mariam", "Mateo", "Nadia", "Noah", "Olivia", "Omar", "Priya", "Rafael", "Sara", "Samuel",
  "Tanvir", "Yuki", "Zara", "Lucas", "Fatima", "Ethan", "Aisha", "Henry", "Leila", "Victor", "Grace", "Ravi",
];
const LAST_NAMES = [
  "Ahmed", "Bennett", "Carvalho", "Das", "Edwards", "Fernandez", "Garcia", "Hassan", "Ito", "Johnson", "Khan", "Lee",
  "Morales", "Nakamura", "Okafor", "Patel", "Quinn", "Rahman", "Silva", "Thompson", "Usman", "Varga", "Walker", "Zhang",
  "Kim", "Murphy", "Rossi", "Chowdhury", "Novak", "Haddad",
];
const SPECIALIZATIONS = [
  "Cardiology", "Dermatology", "Endocrinology", "Gastroenterology", "General Medicine", "Neurology",
  "Obstetrics & Gynecology", "Oncology", "Orthopedics", "Pediatrics", "Psychiatry", "Pulmonology",
];
const HOSPITALS = [
  { name: "Riverside General Hospital", domain: "riverside-general.example" },
  { name: "Northgate Medical Center", domain: "northgate-medical.example" },
  { name: "Lakeview Community Hospital", domain: "lakeview-community.example" },
  { name: "St. Aurelia Hospital", domain: "st-aurelia.example" },
  { name: "Harbor City Clinic", domain: "harbor-city-clinic.example" },
  { name: "Greenfield University Hospital", domain: "greenfield-university.example" },
  { name: "Summit Heart Institute", domain: "summit-heart.example" },
  { name: "Westbrook Children's Hospital", domain: "westbrook-childrens.example" },
];
const CONDITIONS_BY_SPECIALIZATION: Record<string, string[]> = {
  "Cardiology": ["Hypertension", "Atrial fibrillation", "Coronary artery disease", "Heart failure follow-up", "Chest pain evaluation"],
  "Dermatology": ["Eczema", "Psoriasis", "Acne vulgaris", "Skin lesion biopsy follow-up", "Contact dermatitis"],
  "Endocrinology": ["Type 2 diabetes", "Hypothyroidism", "Hyperthyroidism", "Osteoporosis", "Prediabetes monitoring"],
  "Gastroenterology": ["GERD", "Irritable bowel syndrome", "Crohn's disease", "Fatty liver disease", "Peptic ulcer"],
  "General Medicine": ["Annual check-up", "Seasonal influenza", "Vitamin D deficiency", "Lower back pain", "Hyperlipidemia"],
  "Neurology": ["Migraine", "Epilepsy", "Peripheral neuropathy", "Post-concussion syndrome", "Parkinson's disease"],
  "Obstetrics & Gynecology": ["Prenatal care", "Polycystic ovary syndrome", "Endometriosis", "Postpartum follow-up", "Menopause management"],
  "Oncology": ["Breast cancer follow-up", "Lymphoma surveillance", "Colon cancer screening", "Chemotherapy monitoring", "Anemia of chronic disease"],
  "Orthopedics": ["Knee osteoarthritis", "ACL reconstruction rehab", "Rotator cuff tear", "Fracture follow-up", "Carpal tunnel syndrome"],
  "Pediatrics": ["Asthma", "Well-child visit", "Otitis media", "Childhood allergies", "Growth monitoring"],
  "Psychiatry": ["Generalized anxiety disorder", "Major depressive disorder", "ADHD", "Insomnia", "Bipolar disorder follow-up"],
  "Pulmonology": ["COPD", "Asthma", "Sleep apnea", "Chronic cough", "Pulmonary function follow-up"],
};

/** Deterministic PRNG (mulberry32) so the generated data set is reproducible. */
function createRandom(seed: number) {
  let state = seed >>> 0;
  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
  const integer = (minimum: number, maximum: number) => minimum + Math.floor(next() * (maximum - minimum + 1));
  const pick = <T>(values: readonly T[]): T => values[integer(0, values.length - 1)]!;
  return { next, integer, pick };
}

/** Stable ObjectId for the n-th seed record of a kind; identical on every run and machine. */
export function seedObjectId(kind: "doctor" | "patient", index: number): Types.ObjectId {
  return new Types.ObjectId(createHash("sha1").update(`${SEED_NAMESPACE}:${kind}:${index}`).digest("hex").slice(0, 24));
}

/** Midnight UTC of the given day; all generated dates are offsets from this reference. */
export function startOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

const slug = (value: string) => value.toLowerCase().replace(/[^a-z]+/g, "");
const fictionalPhone = (index: number) => `+1 555 01${String(index % 100).padStart(2, "0")} ${String(1000 + ((index * 7919) % 9000)).padStart(4, "0")}`;

/**
 * Generates the full seed data set. Output depends only on `referenceDate` (truncated to
 * the UTC day): the same day always yields identical records.
 */
export function generateSeedData(referenceDate: Date): SeedData {
  const reference = startOfUtcDay(referenceDate);
  const random = createRandom(PRNG_SEED);

  const usedNames = new Set<string>();
  const uniqueName = () => {
    for (;;) {
      const name = `${random.pick(FIRST_NAMES)} ${random.pick(LAST_NAMES)}`;
      if (!usedNames.has(name)) { usedNames.add(name); return name; }
    }
  };

  const doctors: SeedDoctor[] = Array.from({ length: SEED_DOCTOR_COUNT }, (_, index) => {
    const name = uniqueName();
    const [first = "", last = ""] = name.split(" ");
    // Cycle specializations/hospitals with different strides so every value is used and combinations vary.
    const specialization = SPECIALIZATIONS[index % SPECIALIZATIONS.length]!;
    const hospital = HOSPITALS[(index * 3) % HOSPITALS.length]!;
    // Spread doctor creation dates across the previous 12 months (10–360 days ago).
    const createdAt = new Date(reference.getTime() - random.integer(10, 360) * DAY_MS + random.integer(8, 17) * 60 * 60 * 1000);
    return {
      _id: seedObjectId("doctor", index + 1),
      name: `Dr. ${name}`,
      specialization,
      hospital: hospital.name,
      phone: fictionalPhone(index + 1),
      email: `${slug(first)}.${slug(last)}@${hospital.domain}`,
      createdAt,
      updatedAt: createdAt,
    };
  });

  // Weighted assignment gives doctors noticeably different patient counts; a few get none.
  const weights = doctors.map((_, index) => DOCTORS_WITHOUT_PATIENTS.has(index) ? 0 : 1 + ((index * 7) % 10));
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
  const chooseDoctor = () => {
    let target = random.next() * totalWeight;
    for (let index = 0; index < weights.length; index += 1) {
      target -= weights[index]!;
      if (target < 0) return index;
    }
    return weights.findLastIndex((weight) => weight > 0);
  };

  usedNames.clear();
  const patients: SeedPatient[] = Array.from({ length: SEED_PATIENT_COUNT }, (_, index) => {
    const doctor = doctors[chooseDoctor()]!;
    const name = uniqueName();
    // A patient is always registered after their doctor and no later than the reference day.
    const doctorAgeDays = Math.floor((reference.getTime() - doctor.createdAt.getTime()) / DAY_MS);
    const createdAt = new Date(doctor.createdAt.getTime() + random.integer(0, Math.max(0, doctorAgeDays - 1)) * DAY_MS + random.integer(1, 6) * 60 * 60 * 1000);
    const [first = "", last = ""] = name.split(" ");
    const hasPhone = random.next() < 0.8;
    const hasEmail = random.next() < 0.6;
    return {
      _id: seedObjectId("patient", index + 1),
      doctorId: doctor._id,
      name,
      condition: random.pick(CONDITIONS_BY_SPECIALIZATION[doctor.specialization] ?? ["General consultation"]),
      ...(hasPhone ? { phone: fictionalPhone(SEED_DOCTOR_COUNT + index + 1) } : {}),
      ...(hasEmail ? { email: `${slug(first)}.${slug(last)}${index + 1}@mail.example` } : {}),
      createdAt,
      updatedAt: createdAt,
    };
  });

  return { doctors, patients };
}

/** Throws unless seeding is explicitly allowed in a non-production environment. */
export function assertSeedAllowed(environment: NodeJS.ProcessEnv) {
  if (environment.NODE_ENV === "production") throw new Error("Refusing to seed development data when NODE_ENV=production");
  if (environment.ALLOW_DEV_SEED !== "true") throw new Error("Set ALLOW_DEV_SEED=true to confirm seeding development data");
}

/** Optional SEED_REFERENCE_DATE=YYYY-MM-DD pins the date range for fully reproducible output. */
export function resolveReferenceDate(environment: NodeJS.ProcessEnv, now = new Date()): Date {
  const value = environment.SEED_REFERENCE_DATE?.trim();
  if (!value) return startOfUtcDay(now);
  const date = new Date(`${value}T00:00:00.000Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new Error("SEED_REFERENCE_DATE must be a valid YYYY-MM-DD date");
  }
  return date;
}

export interface SeedRepository {
  /** Inserts records whose _id does not exist yet; never modifies existing ones. Returns the number inserted. */
  insertMissingDoctors(doctors: SeedDoctor[]): Promise<number>;
  insertMissingPatients(patients: SeedPatient[]): Promise<number>;
  /** Returns which of the given doctor IDs exist. */
  existingDoctorIds(ids: Types.ObjectId[]): Promise<string[]>;
}

export interface SeedResult { doctorsInserted: number; doctorsSkipped: number; patientsInserted: number; patientsSkipped: number; }

export async function seedDevelopmentData(repository: SeedRepository, data: SeedData): Promise<SeedResult> {
  const doctorsInserted = await repository.insertMissingDoctors(data.doctors);

  // Referential integrity: every doctor a seed patient points to must exist before patients are written.
  const referencedIds = [...new Map(data.patients.map((patient) => [String(patient.doctorId), patient.doctorId])).values()];
  const existing = new Set(await repository.existingDoctorIds(referencedIds));
  const missing = referencedIds.filter((id) => !existing.has(String(id)));
  if (missing.length) throw new Error(`Seed aborted: ${missing.length} referenced doctor(s) are missing; no patients were written`);

  const patientsInserted = await repository.insertMissingPatients(data.patients);
  return {
    doctorsInserted,
    doctorsSkipped: data.doctors.length - doctorsInserted,
    patientsInserted,
    patientsSkipped: data.patients.length - patientsInserted,
  };
}

/** Validates every record against the Mongoose schema before anything is written. */
export async function validateSeedData(data: SeedData) {
  const check = async (document: mongoose.Document, label: string) => {
    try { await document.validate(); } catch (error) { throw new Error(`Invalid seed record ${label}: ${error instanceof Error ? error.message : "validation failed"}`); }
  };
  await Promise.all([
    ...data.doctors.map((doctor) => check(new Doctor(doctor), doctor.name)),
    ...data.patients.map((patient) => check(new Patient(patient), patient.name)),
  ]);
}

function insertOnly<T extends { _id: Types.ObjectId }>(records: T[]) {
  // $setOnInsert + upsert: inserts when the _id is absent, otherwise leaves the stored document untouched.
  return records.map((record) => ({ updateOne: { filter: { _id: record._id }, update: { $setOnInsert: record }, upsert: true } }));
}

export const mongooseSeedRepository: SeedRepository = {
  // The native collection is used so the generated createdAt values are stored as-is
  // (Mongoose timestamps would otherwise overwrite them). Data is schema-validated first.
  async insertMissingDoctors(doctors) {
    return (await Doctor.collection.bulkWrite(insertOnly(doctors), { ordered: true })).upsertedCount;
  },
  async insertMissingPatients(patients) {
    return (await Patient.collection.bulkWrite(insertOnly(patients), { ordered: true })).upsertedCount;
  },
  async existingDoctorIds(ids) {
    const found = await Doctor.find({ _id: { $in: ids } }).select("_id").lean();
    return found.map((doctor) => String(doctor._id));
  },
};

export async function seedData(environment: NodeJS.ProcessEnv = process.env, repository: SeedRepository = mongooseSeedRepository, connect: () => Promise<void> = connectDB) {
  assertSeedAllowed(environment);
  const referenceDate = resolveReferenceDate(environment);
  const data = generateSeedData(referenceDate);
  await validateSeedData(data);
  await connect();
  const result = await seedDevelopmentData(repository, data);
  console.log(`Seed reference date: ${referenceDate.toISOString().slice(0, 10)}`);
  console.log(`Doctors:  ${result.doctorsInserted} inserted, ${result.doctorsSkipped} already present`);
  console.log(`Patients: ${result.patientsInserted} inserted, ${result.patientsSkipped} already present`);
  return result;
}

export async function main(environment: NodeJS.ProcessEnv = process.env, repository?: SeedRepository, connect?: () => Promise<void>) {
  try {
    await seedData(environment, repository, connect);
  } catch (error) {
    console.error("Development seed failed:", error instanceof Error ? error.message : "Unknown error");
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect().catch(() => undefined);
  }
}

if (process.argv[1] && import.meta.url === new URL(process.argv[1], "file:").href) void main();
