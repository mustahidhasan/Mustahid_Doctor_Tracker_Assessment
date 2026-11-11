import type { NextFunction, Request, Response } from "express";
import * as patientService from "../services/patient.service.js";
import { patientCreateSchema, patientListQuerySchema, patientUpdateSchema } from "../validators/patient.validator.js";
import { routeParam, validationError, validId } from "./http.js";

export async function list(request: Request, response: Response, next: NextFunction) {
  const result = patientListQuerySchema.safeParse(request.query);
  if (!result.success) return validationError(response, result.error.issues);
  try { return response.status(200).json(await patientService.listPatients(result.data)); } catch (error) { return next(error); }
}

export async function filterOptions(_request: Request, response: Response, next: NextFunction) {
  try { return response.status(200).json({ data: await patientService.getPatientFilterOptions() }); } catch (error) { return next(error); }
}

export async function create(request: Request, response: Response, next: NextFunction) {
  const result = patientCreateSchema.safeParse(request.body);
  if (!result.success) return validationError(response, result.error.issues);
  try { return response.status(201).json({ data: await patientService.createPatient(result.data) }); } catch (error) { return next(error); }
}

export async function details(request: Request, response: Response, next: NextFunction) {
  const id = routeParam(request.params.id);
  if (!validId(id, response)) return;
  try { return response.status(200).json({ data: await patientService.getPatient(id) }); } catch (error) { return next(error); }
}

export async function update(request: Request, response: Response, next: NextFunction) {
  const id = routeParam(request.params.id);
  if (!validId(id, response)) return;
  const result = patientUpdateSchema.safeParse(request.body);
  if (!result.success) return validationError(response, result.error.issues);
  try { return response.status(200).json({ data: await patientService.updatePatient(id, result.data) }); } catch (error) { return next(error); }
}

export async function remove(request: Request, response: Response, next: NextFunction) {
  const id = routeParam(request.params.id);
  if (!validId(id, response)) return;
  try { await patientService.deletePatient(id); return response.status(204).send(); } catch (error) { return next(error); }
}
