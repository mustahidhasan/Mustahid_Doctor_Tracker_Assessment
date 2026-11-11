import type { IncomingMessage, ServerResponse } from "node:http";
import { app } from "../src/app.js";
import { connectDB } from "../src/config/db.js";

/**
 * Vercel Function entry: reuse the cached MongoDB connection, then hand off to Express.
 * Runs before Express, so it uses only the plain Node response API (no res.status/res.json).
 */
export default async function handler(request: IncomingMessage, response: ServerResponse) {
  try {
    await connectDB();
  } catch (error) {
    console.error("Database connection failed:", error instanceof Error ? error.name : "Unknown error");
    response.statusCode = 503;
    response.setHeader("Content-Type", "application/json; charset=utf-8");
    response.setHeader("Cache-Control", "no-store");
    response.end(JSON.stringify({ error: "Service temporarily unavailable" }));
    return;
  }
  app(request as Parameters<typeof app>[0], response as Parameters<typeof app>[1]);
}
