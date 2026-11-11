import { z } from "zod";
import {
  dateRangeFields, dateRangeIssue, emailSchema, objectIdSchema, optionalFilter, paginationFields, phoneSchema, requiredText, validDateRange,
} from "./common.js";
import { patientFields } from "./doctor.validator.js";

const doctorIdField = z.string({ error: "Assigned doctor is required" }).trim()
  .min(1, "Assigned doctor is required")
  .regex(/^[a-f\d]{24}$/i, "Select a valid doctor");

export const patientCreateSchema = z.object({ ...patientFields, doctorId: doctorIdField }).strict();

/**
 * PATCH: every field optional. For phone/email an empty string means "clear this value"
 * (returned as null so the service can $unset it).
 */
export const patientUpdateSchema = z.object({
  name: requiredText("Name", 120).optional(),
  condition: requiredText("Condition", 200).optional(),
  doctorId: doctorIdField.optional(),
  phone: z.union([z.literal(""), phoneSchema]).optional().transform((value) => value === "" ? null : value),
  email: z.union([z.literal(""), emailSchema]).optional().transform((value) => value === "" ? null : value),
}).strict().refine((value) => Object.values(value).some((field) => field !== undefined), { message: "Provide at least one field to update" });

export const patientListQuerySchema = z.object({
  ...paginationFields,
  search: optionalFilter(100),
  condition: optionalFilter(200),
  doctorId: z.string().trim().optional().transform((value) => value || undefined).pipe(objectIdSchema.optional()),
  ...dateRangeFields,
  sort: z.enum(["newest", "oldest", "name", "name_desc"], { error: "Sort must be newest, oldest, name, or name_desc" }).default("newest"),
}).refine(validDateRange, dateRangeIssue);

export type PatientCreate = z.infer<typeof patientCreateSchema>;
export type PatientUpdate = z.infer<typeof patientUpdateSchema>;
export type PatientListQuery = z.infer<typeof patientListQuerySchema>;
