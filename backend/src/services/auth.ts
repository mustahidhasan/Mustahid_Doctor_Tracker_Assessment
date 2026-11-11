import bcrypt from "bcryptjs";
import jwt, { type SignOptions } from "jsonwebtoken";
import { z } from "zod";

export const SESSION_COOKIE = "doctor_tracker_session";
export const BCRYPT_ROUNDS = 12;

const tokenPayloadSchema = z.object({ sub: z.string().min(1), role: z.literal("admin") });

function jwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 32) throw new Error("JWT_SECRET must contain at least 32 characters");
  return secret;
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

export function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function signSession(userId: string): string {
  const expiresIn = (process.env.JWT_EXPIRES_IN || "1d") as NonNullable<SignOptions["expiresIn"]>;
  return jwt.sign({ role: "admin" }, jwtSecret(), { algorithm: "HS256", expiresIn, subject: userId });
}

/** Remaining lifetime of a signed token in milliseconds (used to align the cookie's Max-Age). */
export function sessionMaxAgeMs(token: string, now = Date.now()): number | undefined {
  const decoded = jwt.decode(token);
  const exp = decoded && typeof decoded === "object" ? decoded.exp : undefined;
  return typeof exp === "number" ? Math.max(0, exp * 1000 - now) : undefined;
}

export function verifySession(token: string): { userId: string; role: "admin" } {
  const decoded = jwt.verify(token, jwtSecret(), { algorithms: ["HS256"] });
  const payload = tokenPayloadSchema.parse(decoded);
  return { userId: payload.sub, role: payload.role };
}
