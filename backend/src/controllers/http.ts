import type { Response } from "express";
import { objectIdSchema } from "../validators/common.js";

/** Consistent 400 body: { error, details: [{ field, message }] }. */
export function validationError(response: Response, issues: { path: PropertyKey[]; message: string }[]) {
  return response.status(400).json({
    error: "Validation failed",
    details: issues.map((issue) => ({ field: issue.path.join("."), message: issue.message })),
  });
}

export function validId(value: string | undefined, response: Response): value is string {
  const result = objectIdSchema.safeParse(value);
  if (!result.success) {
    validationError(response, result.error.issues);
    return false;
  }
  return true;
}

export function routeParam(value: string | string[] | undefined): string | undefined {
  return typeof value === "string" ? value : undefined;
}
