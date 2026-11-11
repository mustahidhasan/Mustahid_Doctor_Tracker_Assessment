import type { Request, Response } from "express";
import { z } from "zod";
import { clearSessionCookieOptions, sessionCookieOptions } from "../config/cookies.js";
import { User } from "../models/User.js";
import { normalizeEmail, SESSION_COOKIE, signSession, verifyPassword } from "../services/auth.js";

const loginSchema = z.object({
  email: z.string().trim().email().max(254),
  password: z.string().min(1).max(1024),
}).strict();

export async function login(request: Request, response: Response) {
  const result = loginSchema.safeParse(request.body);
  if (!result.success) return response.status(400).json({ error: "Invalid login request" });

  const user = await User.findOne({ email: normalizeEmail(result.data.email) })
    .select("+passwordHash name email role")
    .lean();
  const valid = user?.role === "admin" && await verifyPassword(result.data.password, user.passwordHash);
  if (!valid || !user) return response.status(401).json({ error: "Invalid email or password" });

  response.cookie(SESSION_COOKIE, signSession(String(user._id)), sessionCookieOptions());
  return response.status(200).json({
    user: { id: String(user._id), name: user.name, email: user.email, role: user.role },
  });
}

export function me(request: Request, response: Response) {
  return response.status(200).json({ user: request.auth });
}

export function logout(_request: Request, response: Response) {
  response.clearCookie(SESSION_COOKIE, clearSessionCookieOptions());
  return response.status(200).json({ message: "Logged out successfully" });
}
