import { api, buildQueryString, jsonRequest, OBJECT_ID_PATTERN, type Pagination, validateEmail, validatePhone } from "./api";

export interface PatientDoctorSummary { _id: string; name: string; specialization: string; hospital: string; }

/** A patient as returned by /api/patients, with a summary of the assigned doctor. */
export interface PatientRecord {
  _id: string;
  doctorId: string | null;
  doctor: PatientDoctorSummary | null;
  name: string;
  condition: string;
  phone?: string;
  email?: string;
  createdAt: string;
  updatedAt: string;
}

export type PatientSort = "newest" | "oldest" | "name" | "name_desc";
export interface PatientQuery { page: number; limit: number; search?: string; condition?: string; doctorId?: string; dateFrom?: string; dateTo?: string; sort?: PatientSort; }
export interface PatientList { data: PatientRecord[]; pagination: Pagination; }
export interface PatientDoctorOption { _id: string; name: string; specialization: string; }
export interface PatientFilterOptions { conditions: string[]; doctors: PatientDoctorOption[]; }
export interface PatientFormInput { name: string; condition: string; doctorId: string; phone: string; email: string; }

const patientPath = (id: string) => `/api/patients/${encodeURIComponent(id)}`;

export function listPatients(query: PatientQuery, signal?: AbortSignal) {
  return api<PatientList>(`/api/patients?${buildQueryString(query)}`, { signal });
}
export async function getPatientFilterOptions() { return (await api<{ data: PatientFilterOptions }>("/api/patients/filter-options")).data; }
export async function getPatient(id: string) { return (await api<{ data: PatientRecord }>(patientPath(id))).data; }
export async function createPatient(input: PatientFormInput) { return (await api<{ data: PatientRecord }>("/api/patients", jsonRequest("POST", input))).data; }
/** Empty phone/email strings clear those values on the server. */
export async function updatePatient(id: string, input: Partial<PatientFormInput>) { return (await api<{ data: PatientRecord }>(patientPath(id), jsonRequest("PATCH", input))).data; }
export async function deletePatient(id: string) { return api<void>(patientPath(id), { method: "DELETE" }); }

export const PATIENT_SORT_LABELS: Record<PatientSort, string> = { newest: "Newest first", oldest: "Oldest first", name: "Name A–Z", name_desc: "Name Z–A" };

export function isObjectId(value: string | undefined | null): value is string {
  return Boolean(value && OBJECT_ID_PATTERN.test(value));
}

/** Mirrors the backend patient rules. */
export function validatePatientForm(input: PatientFormInput): Record<string, string> {
  const errors: Record<string, string> = {};
  const name = input.name.trim();
  const condition = input.condition.trim();
  if (!name) errors.name = "Name is required";
  else if (name.length > 120) errors.name = "Name must be at most 120 characters";
  if (!condition) errors.condition = "Condition is required";
  else if (condition.length > 200) errors.condition = "Condition must be at most 200 characters";
  if (!input.doctorId) errors.doctorId = "Assigned doctor is required";
  else if (!isObjectId(input.doctorId)) errors.doctorId = "Select a valid doctor";
  if (input.phone.trim()) { const error = validatePhone(input.phone); if (error) errors.phone = error; }
  if (input.email.trim()) { const error = validateEmail(input.email); if (error) errors.email = error; }
  return errors;
}
