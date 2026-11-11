import type { NextFunction, Request, Response } from "express";
import * as doctorService from "../services/doctor.service.js";
import { doctorInputSchema, doctorListQuerySchema, doctorUpdateSchema, patientInputSchema } from "../validators/doctor.validator.js";
import { routeParam, validationError, validId } from "./http.js";

export async function create(request: Request, response: Response, next: NextFunction) {
  const result = doctorInputSchema.safeParse(request.body);
  if (!result.success) return validationError(response, result.error.issues);
  try { return response.status(201).json({ data: await doctorService.createDoctor(result.data) }); } catch (error) { return next(error); }
}

export async function list(request: Request, response: Response, next: NextFunction) {
  const result = doctorListQuerySchema.safeParse(request.query);
  if (!result.success) return validationError(response, result.error.issues);
  try { return response.status(200).json(await doctorService.listDoctors(result.data)); } catch (error) { return next(error); }
}

export async function filterOptions(_request: Request, response: Response, next: NextFunction) {
  try { return response.status(200).json({ data: await doctorService.getDoctorFilterOptions() }); } catch (error) { return next(error); }
}

export async function details(request: Request, response: Response, next: NextFunction) {
  const id = routeParam(request.params.id);
  if (!validId(id, response)) return;
  try { return response.status(200).json({ data: await doctorService.getDoctor(id) }); } catch (error) { return next(error); }
}

export async function update(request: Request, response: Response, next: NextFunction) {
  const id = routeParam(request.params.id);
  if (!validId(id, response)) return;
  const result = doctorUpdateSchema.safeParse(request.body);
  if (!result.success) return validationError(response, result.error.issues);
  try { return response.status(200).json({ data: await doctorService.updateDoctor(id, result.data) }); } catch (error) { return next(error); }
}

export async function remove(request: Request, response: Response, next: NextFunction) {
  const id = routeParam(request.params.id);
  if (!validId(id, response)) return;
  try { await doctorService.deleteDoctor(id); return response.status(204).send(); } catch (error) { return next(error); }
}

export async function patients(request: Request, response: Response, next: NextFunction) {
  const id = routeParam(request.params.id);
  if (!validId(id, response)) return;
  try { return response.status(200).json(await doctorService.listDoctorPatients(id)); } catch (error) { return next(error); }
}

export async function addPatient(request: Request, response: Response, next: NextFunction) {
  const id = routeParam(request.params.id);
  if (!validId(id, response)) return;
  const result = patientInputSchema.safeParse(request.body);
  if (!result.success) return validationError(response, result.error.issues);
  try { return response.status(201).json({ data: await doctorService.createDoctorPatient(id, result.data) }); } catch (error) { return next(error); }
}

export async function removePatient(request: Request, response: Response, next: NextFunction) {
  const id = routeParam(request.params.id);
  const patientId = routeParam(request.params.patientId);
  if (!validId(id, response) || !validId(patientId, response)) return;
  try { await doctorService.deleteDoctorPatient(id, patientId); return response.status(204).send(); } catch (error) { return next(error); }
}
