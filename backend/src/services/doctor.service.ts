import type { QueryFilter } from "mongoose";
import { AppError } from "../errors/AppError.js";
import { Doctor, type IDoctor } from "../models/Doctor.js";
import { Patient } from "../models/Patient.js";
import { createdAtRange, escapeRegex } from "../validators/common.js";
import type { DoctorInput, DoctorListQuery, DoctorUpdate, PatientInput } from "../validators/doctor.validator.js";
import { createPatient, deletePatient } from "./patient.service.js";

export { escapeRegex };

const DOCTOR_FIELDS = "name specialization hospital phone email createdAt updatedAt";
const PATIENT_FIELDS = "name condition phone email doctorId createdAt updatedAt";
export const DOCTOR_PATIENT_LIMIT = 100;

const SORTS = {
  newest: { createdAt: -1, _id: -1 },
  oldest: { createdAt: 1, _id: 1 },
  name: { name: 1, _id: 1 },
} as const;

export function buildDoctorFilter(query: Pick<DoctorListQuery, "search" | "specialization" | "hospital" | "dateFrom" | "dateTo">): QueryFilter<IDoctor> {
  const filter: QueryFilter<IDoctor> = {};
  if (query.search) {
    // User input is escaped so it is always matched literally (no regex injection / ReDoS).
    const expression = new RegExp(escapeRegex(query.search), "i");
    filter.$or = [{ name: expression }, { specialization: expression }, { hospital: expression }, { email: expression }];
  }
  // Exact matches can use the single-field indexes. The UI supplies values from /filter-options.
  if (query.specialization) filter.specialization = query.specialization;
  if (query.hospital) filter.hospital = query.hospital;
  const createdAt = createdAtRange(query.dateFrom, query.dateTo);
  if (createdAt) filter.createdAt = createdAt;
  return filter;
}

export async function createDoctor(input: DoctorInput) {
  const doctor = await Doctor.create(input);
  return doctor.toObject();
}

export async function listDoctors(query: DoctorListQuery) {
  const filter = buildDoctorFilter(query);
  const skip = (query.page - 1) * query.limit;
  const [data, total] = await Promise.all([
    Doctor.find(filter).select(DOCTOR_FIELDS).sort(SORTS[query.sort]).skip(skip).limit(query.limit).lean(),
    Doctor.countDocuments(filter),
  ]);
  const totalPages = Math.ceil(total / query.limit);
  return {
    data,
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

export async function getDoctorFilterOptions() {
  const [specializations, hospitals] = await Promise.all([
    Doctor.distinct("specialization"),
    Doctor.distinct("hospital"),
  ]);
  const sorted = (values: unknown[]) => values.filter((value): value is string => typeof value === "string" && value.length > 0)
    .sort((left, right) => left.localeCompare(right));
  return { specializations: sorted(specializations), hospitals: sorted(hospitals) };
}

export async function getDoctor(id: string) {
  const doctor = await Doctor.findById(id).select(DOCTOR_FIELDS).lean();
  if (!doctor) throw new AppError(404, "Doctor not found");
  return doctor;
}

export async function updateDoctor(id: string, input: DoctorUpdate) {
  const doctor = await Doctor.findByIdAndUpdate(id, input, { returnDocument: "after", runValidators: true })
    .select(DOCTOR_FIELDS).lean();
  if (!doctor) throw new AppError(404, "Doctor not found");
  return doctor;
}

/**
 * Deletion policy: RESTRICT. A doctor who still has associated patients cannot be
 * deleted (409), so patient records are never orphaned or silently cascaded away.
 */
export async function deleteDoctor(id: string) {
  if (!await Doctor.exists({ _id: id })) throw new AppError(404, "Doctor not found");
  const patientCount = await Patient.countDocuments({ doctorId: id });
  if (patientCount > 0) {
    throw new AppError(409, `This doctor has ${patientCount} associated patient${patientCount === 1 ? "" : "s"}. Remove them before deleting the doctor.`);
  }
  await Doctor.deleteOne({ _id: id });
}

export async function listDoctorPatients(doctorId: string) {
  if (!await Doctor.exists({ _id: doctorId })) throw new AppError(404, "Doctor not found");
  const [data, total] = await Promise.all([
    Patient.find({ doctorId }).select(PATIENT_FIELDS).sort({ createdAt: -1, _id: -1 }).limit(DOCTOR_PATIENT_LIMIT).lean(),
    Patient.countDocuments({ doctorId }),
  ]);
  return { data, total, limit: DOCTOR_PATIENT_LIMIT };
}

/** Nested Module 4 endpoint; shares the creation logic with POST /api/patients. */
export async function createDoctorPatient(doctorId: string, input: PatientInput) {
  if (!await Doctor.exists({ _id: doctorId })) throw new AppError(404, "Doctor not found");
  return createPatient({ ...input, doctorId }, { doctorVerified: true });
}

export async function deleteDoctorPatient(doctorId: string, patientId: string) {
  if (!await Doctor.exists({ _id: doctorId })) throw new AppError(404, "Doctor not found");
  // Scoping by doctorId prevents deleting another doctor's patient through this endpoint.
  await deletePatient(patientId, { doctorId, notFoundMessage: "Patient not found for this doctor" });
}
