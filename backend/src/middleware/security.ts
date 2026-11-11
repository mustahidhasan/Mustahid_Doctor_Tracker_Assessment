import type { NextFunction, Request, Response } from "express";
import mongoose from "mongoose";
import { AppError } from "../errors/AppError.js";

function trustedOrigins(): Set<string> {
  return new Set((process.env.CORS_ORIGIN || "http://localhost:3000").split(",").map((value) => value.trim()).filter(Boolean));
}

export function requireTrustedOrigin(request: Request, response: Response, next: NextFunction) {
  const fetchSite = request.get("sec-fetch-site");
  const origin = request.get("origin");
  if (fetchSite === "cross-site" || (origin && !trustedOrigins().has(origin))) {
    return response.status(403).json({ error: "Untrusted request origin" });
  }
  return next();
}

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/** Cookie-authenticated state changes must come from a trusted browser origin (CSRF defence in depth). */
export function requireTrustedOriginForWrites(request: Request, response: Response, next: NextFunction) {
  if (SAFE_METHODS.has(request.method)) return next();
  return requireTrustedOrigin(request, response, next);
}

export function notFound(_request: Request, response: Response) {
  response.status(404).json({ error: "Route not found" });
}

export function errorHandler(error: unknown, _request: Request, response: Response, _next: NextFunction) {
  if (error instanceof SyntaxError && "body" in error) return response.status(400).json({ error: "Malformed JSON request" });
  if (error instanceof AppError) return response.status(error.statusCode).json({ error: error.message, ...(error.details ? { details: error.details } : {}) });
  // Never expose raw MongoDB/Mongoose errors; map known input-related failures to a generic 400.
  if (error instanceof mongoose.Error.CastError || error instanceof mongoose.Error.ValidationError) {
    return response.status(400).json({ error: "Invalid request data" });
  }
  console.error("Request failed", error instanceof Error ? error.message : "Unknown error");
  return response.status(500).json({ error: "Internal server error" });
}
