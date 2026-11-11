import type { NextFunction, Request, Response } from "express";
import { User } from "../models/User.js";
import { SESSION_COOKIE, verifySession } from "../services/auth.js";

export async function requireAuth(request: Request, response: Response, next: NextFunction) {
  try {
    const token = request.cookies?.[SESSION_COOKIE] as string | undefined;
    if (!token) return response.status(401).json({ error: "Authentication required" });
    const payload = verifySession(token);
    const user = await User.findById(payload.userId).select("name email role").lean();
    if (!user || user.role !== "admin") return response.status(401).json({ error: "Invalid or expired session" });
    request.auth = { userId: String(user._id), role: "admin", name: user.name, email: user.email };
    return next();
  } catch {
    return response.status(401).json({ error: "Invalid or expired session" });
  }
}

export function requireAdmin(request: Request, response: Response, next: NextFunction) {
  if (request.auth?.role !== "admin") return response.status(403).json({ error: "Administrator access required" });
  return next();
}
