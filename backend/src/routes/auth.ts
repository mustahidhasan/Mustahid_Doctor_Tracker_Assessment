import type { Request } from "express";
import { Router } from "express";
import rateLimit from "express-rate-limit";
import { login, logout, me } from "../controllers/authController.js";
import { requireAuth } from "../middleware/auth.js";
import { requireTrustedOrigin } from "../middleware/security.js";
import { normalizeEmail } from "../services/auth.js";

export const authRouter = Router();

const FIFTEEN_MINUTES = 15 * 60 * 1000;
const tooMany = { error: "Too many login attempts. Please try again later" };

/** Login rate limit key for the targeted account; unaffected by client-controlled IP headers. */
export function loginAccountKey(request: Request): string {
  const email = (request.body as { email?: unknown } | undefined)?.email;
  return typeof email === "string" && email.trim() ? `account:${normalizeEmail(email).slice(0, 254)}` : "account:<invalid>";
}

/**
 * Two layers, both counting only failed attempts:
 * 1. Per account (normalized email): 10 / 15 min. This is the brute-force control. It cannot be
 *    bypassed by rotating X-Forwarded-For (which a client can send through the frontend proxy).
 * 2. Per client IP: 50 / 15 min, a coarser credential-stuffing brake across many accounts. Behind
 *    a proxy the IP may be shared or spoofed, so it is deliberately looser.
 * Both are in-memory per instance; a shared store (Redis/KV) is needed for global enforcement.
 */
const accountLimiter = rateLimit({
  windowMs: FIFTEEN_MINUTES,
  limit: 10,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  keyGenerator: loginAccountKey,
  message: tooMany,
});

const ipLimiter = rateLimit({
  windowMs: FIFTEEN_MINUTES,
  limit: 50,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: tooMany,
});

authRouter.post("/login", requireTrustedOrigin, accountLimiter, ipLimiter, login);
authRouter.get("/me", requireAuth, me);
authRouter.post("/logout", requireTrustedOrigin, logout);
