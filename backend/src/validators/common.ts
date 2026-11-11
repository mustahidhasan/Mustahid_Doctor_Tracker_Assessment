import { z } from "zod";
import { normalizeEmail } from "../services/auth.js";

/** Shared Zod building blocks used by the doctor and patient validators. */

export const requiredText = (label: string, maximum: number) => z.string({ error: `${label} is required` }).trim()
  .min(1, `${label} is required`)
  .max(maximum, `${label} must be at most ${maximum} characters`);

// Digits with optional leading "+", spaces, dashes, dots, and parentheses; 7–15 digits total (E.164 maximum).
export const phoneSchema = requiredText("Phone", 30)
  .regex(/^\+?[\d\s().-]+$/, "Phone may contain only digits, spaces, and + ( ) - .")
  .refine((value) => { const digits = value.replace(/\D/g, "").length; return digits >= 7 && digits <= 15; }, "Phone must contain 7 to 15 digits");

export const emailSchema = z.string({ error: "Email is required" }).trim().min(1, "Email is required").max(254)
  .pipe(z.email("Enter a valid email address")).transform(normalizeEmail);

export const objectIdSchema = z.string().regex(/^[a-f\d]{24}$/i, "Invalid record ID");

/** Accepts calendar dates only (YYYY-MM-DD) and interprets them as UTC days. */
export const dateOnly = (label: string) => z.string().trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, `${label} must use the YYYY-MM-DD format`)
  .transform((value, context) => {
    const date = new Date(`${value}T00:00:00.000Z`);
    if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
      context.addIssue({ code: "custom", message: `${label} is not a valid date` });
      return z.NEVER;
    }
    return date;
  });

export const optionalFilter = (maximum: number) => z.string().trim().max(maximum).optional().transform((value) => value || undefined);

export const paginationFields = {
  page: z.coerce.number({ error: "Page must be a number" }).int("Page must be a whole number").min(1, "Page must be at least 1").max(10_000, "Page is too large").default(1),
  limit: z.coerce.number({ error: "Limit must be a number" }).int("Limit must be a whole number").min(1, "Limit must be at least 1").max(100, "Limit cannot exceed 100").default(10),
};

export const dateRangeFields = {
  dateFrom: dateOnly("Start date").optional(),
  dateTo: dateOnly("End date").optional(),
};

export const validDateRange = (query: { dateFrom?: Date | undefined; dateTo?: Date | undefined }) => !query.dateFrom || !query.dateTo || query.dateFrom <= query.dateTo;
export const dateRangeIssue = { message: "Start date must be on or before end date", path: ["dateFrom"] };

const DAY_MS = 24 * 60 * 60 * 1000;
/** Mongo createdAt condition for an inclusive UTC day range. */
export function createdAtRange(dateFrom?: Date, dateTo?: Date) {
  if (!dateFrom && !dateTo) return undefined;
  return {
    ...(dateFrom ? { $gte: dateFrom } : {}),
    // dateTo is inclusive: everything before the start of the following UTC day.
    ...(dateTo ? { $lt: new Date(dateTo.getTime() + DAY_MS) } : {}),
  };
}

/** Escapes user input so it is always matched literally (no regex injection / ReDoS). */
export function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
