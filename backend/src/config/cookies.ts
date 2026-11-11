import type { CookieOptions } from "express";

export const DEFAULT_SESSION_MAX_AGE_MS = 24 * 60 * 60 * 1000;

/** HttpOnly session cookie. `maxAgeMs` should match the JWT lifetime so both expire together. */
export function sessionCookieOptions(maxAgeMs = DEFAULT_SESSION_MAX_AGE_MS): CookieOptions {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: maxAgeMs,
  };
}

export function clearSessionCookieOptions(): CookieOptions {
  const { maxAge: _maxAge, ...options } = sessionCookieOptions();
  return options;
}
