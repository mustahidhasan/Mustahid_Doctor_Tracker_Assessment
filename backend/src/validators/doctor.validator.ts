import { z } from "zod";
import { normalizeEmail } from "../services/auth.js";

const requiredText = (label: string, maximum: number) => z.string({ error: `${label} is required` }).trim()
  .min(1, `${label} is required`)
  .max(maximum, `${label} must be at most ${maximum} characters`);

// Digits with optional leading "+", spaces, dashes, dots, and parentheses; 7–15 digits total (E.164 maximum).
const phoneSchema = requiredText("Phone", 30)
  .regex(/^\+?[\d\s().-]+$/, "Phone may contain only digits, spaces, and + ( ) - .")
  .refine((value) => { const digits = value.replace(/\D/g, "").length; return digits >= 7 && digits <= 15; }, "Phone must contain 7 to 15 digits");

const emailSchema = z.string({ error: "Email is required" }).trim().min(1, "Email is required").max(254)
  .pipe(z.email("Enter a valid email address")).transform(normalizeEmail);

// Accept calendar dates only (YYYY-MM-DD) and interpret them as UTC days.
const dateOnly = (label: string) => z.string().trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, `${label} must use the YYYY-MM-DD format`)
  .transform((value, context) => {
    const date = new Date(`${value}T00:00:00.000Z`);
    if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
      context.addIssue({ code: "custom", message: `${label} is not a valid date` });
      return z.NEVER;
    }
    return date;
  });

const optionalFilter = (maximum: number) => z.string().trim().max(maximum).optional().transform((value) => value || undefined);

export const objectIdSchema = z.string().regex(/^[a-f\d]{24}$/i, "Invalid record ID");

export const doctorInputSchema = z.object({
  name: requiredText("Name", 120),
  specialization: requiredText("Specialization", 120),
  hospital: requiredText("Hospital", 160),
  phone: phoneSchema,
  email: emailSchema,
}).strict();

export const doctorUpdateSchema = doctorInputSchema.partial().refine((value) => Object.keys(value).length > 0, {
  message: "Provide at least one field to update",
});

export const patientInputSchema = z.object({
  name: requiredText("Name", 120),
  condition: requiredText("Condition", 200),
  phone: z.union([z.literal(""), phoneSchema]).optional().transform((value) => value || undefined),
  email: z.union([z.literal(""), emailSchema]).optional().transform((value) => value || undefined),
}).strict();

export const doctorListQuerySchema = z.object({
  page: z.coerce.number({ error: "Page must be a number" }).int("Page must be a whole number").min(1, "Page must be at least 1").max(10_000, "Page is too large").default(1),
  limit: z.coerce.number({ error: "Limit must be a number" }).int("Limit must be a whole number").min(1, "Limit must be at least 1").max(100, "Limit cannot exceed 100").default(10),
  search: optionalFilter(100),
  specialization: optionalFilter(120),
  hospital: optionalFilter(160),
  dateFrom: dateOnly("Start date").optional(),
  dateTo: dateOnly("End date").optional(),
  sort: z.enum(["newest", "oldest", "name"], { error: "Sort must be newest, oldest, or name" }).default("newest"),
}).refine((query) => !query.dateFrom || !query.dateTo || query.dateFrom <= query.dateTo, {
  message: "Start date must be on or before end date",
  path: ["dateFrom"],
});

export type DoctorInput = z.infer<typeof doctorInputSchema>;
export type DoctorUpdate = z.infer<typeof doctorUpdateSchema>;
export type DoctorListQuery = z.infer<typeof doctorListQuerySchema>;
export type PatientInput = z.infer<typeof patientInputSchema>;
