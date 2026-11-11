import { api, buildQueryString, jsonRequest, type Pagination, validateEmail, validatePhone } from "./api";

// Shared utilities are re-exported so existing imports from "@/lib/doctors" keep working.
export {
  ApiError, buildQueryString, errorMessage, type FieldError, fieldErrors, formatDate, type Pagination, trimInput, validateEmail, validatePhone,
} from "./api";

export interface Doctor {
  _id: string;
  name: string;
  specialization: string;
  hospital: string;
  phone: string;
  email: string;
  createdAt: string;
  updatedAt: string;
}

export interface Patient {
  _id: string;
  doctorId: string;
  name: string;
  condition: string;
  phone?: string;
  email?: string;
  createdAt: string;
  updatedAt: string;
}

export type DoctorSort = "newest" | "oldest" | "name";
export type DoctorInput = Pick<Doctor, "name" | "specialization" | "hospital" | "phone" | "email">;
export type PatientInput = Pick<Patient, "name" | "condition"> & Pick<Patient, "phone" | "email">;
export interface DoctorQuery { page: number; limit: number; search?: string; specialization?: string; hospital?: string; dateFrom?: string; dateTo?: string; sort?: DoctorSort; }
export interface DoctorList { data: Doctor[]; pagination: Pagination; }
export interface DoctorPatientList { data: Patient[]; total: number; limit: number; }
export interface DoctorFilterOptions { specializations: string[]; hospitals: string[]; }

const doctorPath = (id: string) => `/api/doctors/${encodeURIComponent(id)}`;

export function listDoctors(query: DoctorQuery, signal?: AbortSignal) {
  return api<DoctorList>(`/api/doctors?${buildQueryString(query)}`, { signal });
}
export async function getDoctorFilterOptions() { return (await api<{ data: DoctorFilterOptions }>("/api/doctors/filter-options")).data; }
export async function getDoctor(id: string) { return (await api<{ data: Doctor }>(doctorPath(id))).data; }
export async function createDoctor(input: DoctorInput) { return (await api<{ data: Doctor }>("/api/doctors", jsonRequest("POST", input))).data; }
export async function updateDoctor(id: string, input: Partial<DoctorInput>) { return (await api<{ data: Doctor }>(doctorPath(id), jsonRequest("PATCH", input))).data; }
export async function deleteDoctor(id: string) { return api<void>(doctorPath(id), { method: "DELETE" }); }
export async function listDoctorPatients(id: string) { return api<DoctorPatientList>(`${doctorPath(id)}/patients`); }
export async function addDoctorPatient(id: string, input: PatientInput) { return (await api<{ data: Patient }>(`${doctorPath(id)}/patients`, jsonRequest("POST", input))).data; }
export async function deleteDoctorPatient(id: string, patientId: string) { return api<void>(`${doctorPath(id)}/patients/${encodeURIComponent(patientId)}`, { method: "DELETE" }); }

export const buildDoctorQueryString = (query: DoctorQuery) => buildQueryString(query);

const DOCTOR_LIMITS: Record<keyof DoctorInput, number> = { name: 120, specialization: 120, hospital: 160, phone: 30, email: 254 };
export const DOCTOR_LABELS: Record<keyof DoctorInput, string> = { name: "Name", specialization: "Specialization", hospital: "Hospital", phone: "Phone", email: "Email" };

export function validateDoctorInput(input: DoctorInput): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const field of Object.keys(DOCTOR_LIMITS) as Array<keyof DoctorInput>) {
    const value = input[field].trim();
    if (!value) errors[field] = `${DOCTOR_LABELS[field]} is required`;
    else if (value.length > DOCTOR_LIMITS[field]) errors[field] = `${DOCTOR_LABELS[field]} must be at most ${DOCTOR_LIMITS[field]} characters`;
  }
  if (!errors.phone) { const phoneError = validatePhone(input.phone); if (phoneError) errors.phone = phoneError; }
  if (!errors.email) { const emailError = validateEmail(input.email); if (emailError) errors.email = emailError; }
  return errors;
}

export function validatePatientInput(input: PatientInput): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!input.name.trim()) errors.name = "Name is required";
  else if (input.name.trim().length > 120) errors.name = "Name must be at most 120 characters";
  if (!input.condition.trim()) errors.condition = "Condition is required";
  else if (input.condition.trim().length > 200) errors.condition = "Condition must be at most 200 characters";
  if (input.phone?.trim()) { const phoneError = validatePhone(input.phone); if (phoneError) errors.phone = phoneError; }
  if (input.email?.trim()) { const emailError = validateEmail(input.email); if (emailError) errors.email = emailError; }
  return errors;
}
