import type { NextFunction, Request, Response } from "express";
import * as dashboardService from "../services/dashboard.service.js";
import {
  dashboardRangeQuerySchema, distributionQuerySchema, patientsPerDoctorQuerySchema, resolveRange, specializationQuerySchema,
} from "../validators/dashboard.validator.js";
import { validationError } from "./http.js";

const conditionQuerySchema = distributionQuerySchema(8);

export async function summary(request: Request, response: Response, next: NextFunction) {
  const result = dashboardRangeQuerySchema.safeParse(request.query);
  if (!result.success) return validationError(response, result.error.issues);
  try { return response.status(200).json(await dashboardService.getSummary(resolveRange(result.data))); } catch (error) { return next(error); }
}

export async function patientsPerDoctor(request: Request, response: Response, next: NextFunction) {
  const result = patientsPerDoctorQuerySchema.safeParse(request.query);
  if (!result.success) return validationError(response, result.error.issues);
  try { return response.status(200).json(await dashboardService.getPatientsPerDoctor(result.data.limit)); } catch (error) { return next(error); }
}

export async function patientTrends(request: Request, response: Response, next: NextFunction) {
  const result = dashboardRangeQuerySchema.safeParse(request.query);
  if (!result.success) return validationError(response, result.error.issues);
  try { return response.status(200).json(await dashboardService.getPatientTrends(resolveRange(result.data))); } catch (error) { return next(error); }
}

export async function specializations(request: Request, response: Response, next: NextFunction) {
  const result = specializationQuerySchema.safeParse(request.query);
  if (!result.success) return validationError(response, result.error.issues);
  try { return response.status(200).json(await dashboardService.getSpecializations(result.data.limit)); } catch (error) { return next(error); }
}

export async function conditions(request: Request, response: Response, next: NextFunction) {
  const result = conditionQuerySchema.safeParse(request.query);
  if (!result.success) return validationError(response, result.error.issues);
  try { return response.status(200).json(await dashboardService.getConditions(resolveRange(result.data), result.data.limit)); } catch (error) { return next(error); }
}
