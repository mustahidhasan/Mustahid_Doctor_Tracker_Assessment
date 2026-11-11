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
export interface Pagination { page: number; limit: number; total: number; totalPages: number; hasNextPage: boolean; hasPreviousPage: boolean; }
export interface DoctorList { data: Doctor[]; pagination: Pagination; }
export interface DoctorPatientList { data: Patient[]; total: number; limit: number; }
export interface DoctorFilterOptions { specializations: string[]; hospitals: string[]; }
export interface FieldError { field: string; message: string; }

export class ApiError extends Error {
  constructor(message: string, public readonly status: number, public readonly details?: FieldError[]) {
    super(message);
    this.name = "ApiError";
  }
}

/** Same-origin request through the Next.js `/api/*` proxy; the HttpOnly session cookie is sent automatically. */
async function api<T>(path: string, options?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, { credentials: "same-origin", cache: "no-store", ...options });
  } catch {
    throw new ApiError("Unable to reach the server. Check your connection and try again.", 0);
  }
  if (response.status === 401) {
    if (typeof window !== "undefined") window.location.replace(new URL("/login", window.location.origin));
    throw new ApiError("Your session has expired. Please sign in again.", 401);
  }
  if (response.status === 204) return undefined as T;
  const body = await response.json().catch(() => ({})) as { error?: string; details?: FieldError[] };
  if (!response.ok) throw new ApiError(body.error || "Something went wrong. Please try again.", response.status, body.details);
  return body as T;
}

const jsonRequest = (method: string, body: unknown): RequestInit => ({ method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
const doctorPath = (id: string) => `/api/doctors/${encodeURIComponent(id)}`;

export function buildDoctorQueryString(query: DoctorQuery): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== "") params.set(key, String(value).trim());
  }
  return params.toString();
}

export function listDoctors(query: DoctorQuery, signal?: AbortSignal) {
  return api<DoctorList>(`/api/doctors?${buildDoctorQueryString(query)}`, { signal });
}
export async function getDoctorFilterOptions() { return (await api<{ data: DoctorFilterOptions }>("/api/doctors/filter-options")).data; }
export async function getDoctor(id: string) { return (await api<{ data: Doctor }>(doctorPath(id))).data; }
export async function createDoctor(input: DoctorInput) { return (await api<{ data: Doctor }>("/api/doctors", jsonRequest("POST", input))).data; }
export async function updateDoctor(id: string, input: Partial<DoctorInput>) { return (await api<{ data: Doctor }>(doctorPath(id), jsonRequest("PATCH", input))).data; }
export async function deleteDoctor(id: string) { return api<void>(doctorPath(id), { method: "DELETE" }); }
export async function listDoctorPatients(id: string) { return api<DoctorPatientList>(`${doctorPath(id)}/patients`); }
export async function addDoctorPatient(id: string, input: PatientInput) { return (await api<{ data: Patient }>(`${doctorPath(id)}/patients`, jsonRequest("POST", input))).data; }
export async function deleteDoctorPatient(id: string, patientId: string) { return api<void>(`${doctorPath(id)}/patients/${encodeURIComponent(patientId)}`, { method: "DELETE" }); }

export function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

export function fieldErrors(error: unknown): Record<string, string> | null {
  if (!(error instanceof ApiError) || !error.details?.length) return null;
  return Object.fromEntries(error.details.map((detail) => [detail.field || "form", detail.message]));
}

export function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

// Client-side validation mirrors the backend rules so users get instant feedback.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_PATTERN = /^\+?[\d\s().-]+$/;

export function validatePhone(value: string): string | null {
  const phone = value.trim();
  if (!PHONE_PATTERN.test(phone)) return "Phone may contain only digits, spaces, and + ( ) - .";
  const digits = phone.replace(/\D/g, "").length;
  return digits >= 7 && digits <= 15 ? null : "Phone must contain 7 to 15 digits";
}

export function validateEmail(value: string): string | null {
  return EMAIL_PATTERN.test(value.trim()) ? null : "Enter a valid email address";
}

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

export function trimInput<T extends object>(input: T): T {
  return Object.fromEntries(Object.entries(input).map(([key, value]) => [key, typeof value === "string" ? value.trim() : value])) as T;
}
