import type { NextFunction, Request, Response } from "express";

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

export function notFound(_request: Request, response: Response) {
  response.status(404).json({ error: "Route not found" });
}

export function errorHandler(error: unknown, _request: Request, response: Response, _next: NextFunction) {
  if (error instanceof SyntaxError && "body" in error) return response.status(400).json({ error: "Malformed JSON request" });
  console.error("Request failed", error instanceof Error ? error.message : "Unknown error");
  return response.status(500).json({ error: "Internal server error" });
}
