import type { Request, Response } from "express";
import { app } from "../src/app.js";
import { connectDB } from "../src/config/db.js";

/** Vercel Function entry: reuse the cached MongoDB connection, then hand off to Express. */
export default async function handler(request: Request, response: Response) {
  try {
    await connectDB();
  } catch (error) {
    console.error("Database connection failed:", error instanceof Error ? error.name : "Unknown error");
    response.setHeader("Cache-Control", "no-store");
    return response.status(503).json({ error: "Service temporarily unavailable" });
  }
  return app(request, response);
}
