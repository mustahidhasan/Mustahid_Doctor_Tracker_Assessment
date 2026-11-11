import type { QueryFilter, Types } from "mongoose";
import { AppError } from "../errors/AppError.js";
import { Doctor } from "../models/Doctor.js";
import { type IPatient, Patient } from "../models/Patient.js";
import { createdAtRange, escapeRegex } from "../validators/common.js";
import type { PatientCreate, PatientListQuery, PatientUpdate } from "../validators/patient.validator.js";

const PATIENT_FIELDS = "name condition phone email doctorId createdAt updatedAt";
/** Only the doctor fields the patient views need. */
const DOCTOR_SUMMARY_FIELDS = "name specialization hospital";
export const DOCTOR_OPTION_LIMIT = 1000;

const SORTS = {
  newest: { createdAt: -1, _id: -1 },
  oldest: { createdAt: 1, _id: 1 },
  name: { name: 1, _id: 1 },
  name_desc: { name: -1, _id: -1 },
} as const;

export interface DoctorSummary { _id: Types.ObjectId; name: string; specialization: string; hospital: string; }
interface PopulatedPatient extends Omit<IPatient, "doctorId"> { _id: Types.ObjectId; doctorId: DoctorSummary | Types.ObjectId | null; }

const ASSIGNED_DOCTOR_MISSING = new AppError(400, "Assigned doctor does not exist", [{ field: "doctorId", message: "Select an existing doctor" }]);

function isDoctorSummary(value: PopulatedPatient["doctorId"]): value is DoctorSummary {
  return Boolean(value && typeof value === "object" && "name" in value);
}

/** Flattens a populated patient into { ...patient, doctorId: string, doctor: summary | null }. */
export function toPatientView(patient: PopulatedPatient) {
  const { doctorId, ...rest } = patient;
  const doctor = isDoctorSummary(doctorId) ? doctorId : null;
  return {
    ...rest,
    doctorId: doctor ? String(doctor._id) : doctorId ? String(doctorId) : null,
    doctor: doctor ? { _id: String(doctor._id), name: doctor.name, specialization: doctor.specialization, hospital: doctor.hospital } : null,
  };
}

export function buildPatientFilter(query: Pick<PatientListQuery, "search" | "condition" | "doctorId" | "dateFrom" | "dateTo">): QueryFilter<IPatient> {
  const filter: QueryFilter<IPatient> = {};
  if (query.search) {
    const expression = new RegExp(escapeRegex(query.search), "i");
    filter.$or = [{ name: expression }, { condition: expression }, { email: expression }];
  }
  // Exact matches use the { condition: 1 } and { doctorId: 1, createdAt: -1 } indexes.
  if (query.condition) filter.condition = query.condition;
  if (query.doctorId) filter.doctorId = query.doctorId;
  const createdAt = createdAtRange(query.dateFrom, query.dateTo);
  if (createdAt) filter.createdAt = createdAt;
  return filter;
}

async function assertDoctorExists(doctorId: string) {
  if (!await Doctor.exists({ _id: doctorId })) throw ASSIGNED_DOCTOR_MISSING;
}

export async function listPatients(query: PatientListQuery) {
  const filter = buildPatientFilter(query);
  const skip = (query.page - 1) * query.limit;
  const [patients, total] = await Promise.all([
    Patient.find(filter).select(PATIENT_FIELDS).sort(SORTS[query.sort]).skip(skip).limit(query.limit)
      .populate({ path: "doctorId", select: DOCTOR_SUMMARY_FIELDS }).lean(),
    Patient.countDocuments(filter),
  ]);
  const totalPages = Math.ceil(total / query.limit);
  return {
    data: (patients as unknown as PopulatedPatient[]).map(toPatientView),
    pagination: {
      page: query.page,
      limit: query.limit,
      total,
      totalPages,
      hasNextPage: query.page < totalPages,
      hasPreviousPage: query.page > 1 && totalPages > 0,
    },
  };
}

export async function getPatientFilterOptions() {
  const [conditions, doctors] = await Promise.all([
    Patient.distinct("condition"),
    Doctor.find().select("name specialization").sort({ name: 1, _id: 1 }).limit(DOCTOR_OPTION_LIMIT).lean(),
  ]);
  return {
    conditions: (conditions as unknown[]).filter((value): value is string => typeof value === "string" && value.length > 0).sort((left, right) => left.localeCompare(right)),
    doctors: doctors.map((doctor) => ({ _id: String(doctor._id), name: doctor.name, specialization: doctor.specialization })),
  };
}

export async function getPatient(id: string) {
  const patient = await Patient.findById(id).select(PATIENT_FIELDS).populate({ path: "doctorId", select: DOCTOR_SUMMARY_FIELDS }).lean();
  if (!patient) throw new AppError(404, "Patient not found");
  return toPatientView(patient as unknown as PopulatedPatient);
}

/** Creates a patient. Every patient must reference an existing doctor. */
export async function createPatient(input: PatientCreate, options: { doctorVerified?: boolean } = {}) {
  if (!options.doctorVerified) await assertDoctorExists(input.doctorId);
  const patient = await Patient.create({
    doctorId: input.doctorId,
    name: input.name,
    condition: input.condition,
    ...(input.phone ? { phone: input.phone } : {}),
    ...(input.email ? { email: input.email } : {}),
  });
  return patient.toObject();
}

/** Partial update. Reassignment is a doctorId change; phone/email null means "clear". */
export async function updatePatient(id: string, input: PatientUpdate) {
  if (input.doctorId) await assertDoctorExists(input.doctorId);
  const $set: Record<string, string> = {};
  const $unset: Record<string, ""> = {};
  for (const field of ["name", "condition", "doctorId", "phone", "email"] as const) {
    const value = input[field];
    if (value === null) $unset[field] = "";
    else if (value !== undefined) $set[field] = value;
  }
  const patient = await Patient.findByIdAndUpdate(id, { ...(Object.keys($set).length ? { $set } : {}), ...(Object.keys($unset).length ? { $unset } : {}) },
    { returnDocument: "after", runValidators: true })
    .select(PATIENT_FIELDS).populate({ path: "doctorId", select: DOCTOR_SUMMARY_FIELDS }).lean();
  if (!patient) throw new AppError(404, "Patient not found");
  return toPatientView(patient as unknown as PopulatedPatient);
}

export async function deletePatient(id: string, scope: { doctorId?: string; notFoundMessage?: string } = {}) {
  const result = await Patient.deleteOne({ _id: id, ...(scope.doctorId ? { doctorId: scope.doctorId } : {}) });
  if (result.deletedCount === 0) throw new AppError(404, scope.notFoundMessage ?? "Patient not found");
}
