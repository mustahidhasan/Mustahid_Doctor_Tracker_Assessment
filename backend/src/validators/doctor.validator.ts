import { z } from "zod";
import {
  dateRangeFields, dateRangeIssue, emailSchema, objectIdSchema, optionalFilter, paginationFields, phoneSchema, requiredText, validDateRange,
} from "./common.js";

export { objectIdSchema };

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

/** Patient fields shared by the nested doctor endpoint and the /api/patients endpoints. */
export const patientFields = {
  name: requiredText("Name", 120),
  condition: requiredText("Condition", 200),
  phone: z.union([z.literal(""), phoneSchema]).optional().transform((value) => value || undefined),
  email: z.union([z.literal(""), emailSchema]).optional().transform((value) => value || undefined),
};

export const patientInputSchema = z.object(patientFields).strict();

export const doctorListQuerySchema = z.object({
  ...paginationFields,
  search: optionalFilter(100),
  specialization: optionalFilter(120),
  hospital: optionalFilter(160),
  ...dateRangeFields,
  sort: z.enum(["newest", "oldest", "name"], { error: "Sort must be newest, oldest, or name" }).default("newest"),
}).refine(validDateRange, dateRangeIssue);

export type DoctorInput = z.infer<typeof doctorInputSchema>;
export type DoctorUpdate = z.infer<typeof doctorUpdateSchema>;
export type DoctorListQuery = z.infer<typeof doctorListQuerySchema>;
export type PatientInput = z.infer<typeof patientInputSchema>;
