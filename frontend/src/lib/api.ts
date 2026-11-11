/** Shared same-origin API utilities for all admin modules. */

import { clearSession, expiredLoginUrl } from "./auth";

export interface FieldError { field: string; message: string; }
export interface Pagination { page: number; limit: number; total: number; totalPages: number; hasNextPage: boolean; hasPreviousPage: boolean; }

export class ApiError extends Error {
  constructor(message: string, public readonly status: number, public readonly details?: FieldError[]) {
    super(message);
    this.name = "ApiError";
  }
}

/** Same-origin request through the Next.js `/api/*` proxy; the HttpOnly session cookie is sent automatically. */
export async function api<T>(path: string, options?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, { credentials: "same-origin", cache: "no-store", ...options });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw new ApiError("Unable to reach the server. Check your connection and try again.", 0);
  }
  if (response.status === 401) {
    if (typeof window !== "undefined") {
      // Clear the stale HttpOnly cookie first so /login does not bounce back here, then return
      // the user to the page they were on after signing in again.
      await clearSession();
      window.location.replace(new URL(expiredLoginUrl(`${window.location.pathname}${window.location.search}`), window.location.origin));
    }
    throw new ApiError("Your session has expired. Please sign in again.", 401);
  }
  if (response.status === 204) return undefined as T;
  const body = await response.json().catch(() => ({})) as { error?: string; details?: FieldError[] };
  if (!response.ok) throw new ApiError(body.error || "Something went wrong. Please try again.", response.status, body.details);
  return body as T;
}

export const jsonRequest = (method: string, body: unknown): RequestInit => ({ method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

export function buildQueryString(query: object): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && value !== "") params.set(key, String(value).trim());
  }
  return params.toString();
}

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

export function formatDateTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString(undefined, { year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

// Client-side validation mirrors the backend rules so users get instant feedback.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_PATTERN = /^\+?[\d\s().-]+$/;
export const OBJECT_ID_PATTERN = /^[a-f\d]{24}$/i;

export function validatePhone(value: string): string | null {
  const phone = value.trim();
  if (!PHONE_PATTERN.test(phone)) return "Phone may contain only digits, spaces, and + ( ) - .";
  const digits = phone.replace(/\D/g, "").length;
  return digits >= 7 && digits <= 15 ? null : "Phone must contain 7 to 15 digits";
}

export function validateEmail(value: string): string | null {
  return EMAIL_PATTERN.test(value.trim()) ? null : "Enter a valid email address";
}

export function trimInput<T extends object>(input: T): T {
  return Object.fromEntries(Object.entries(input).map(([key, value]) => [key, typeof value === "string" ? value.trim() : value])) as T;
}

export function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}
