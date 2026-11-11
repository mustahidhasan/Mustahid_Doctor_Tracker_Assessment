import mongoose from "mongoose";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import handler from "../api/index.js";
import { app } from "./app.js";
import * as db from "./config/db.js";
import { Doctor } from "./models/Doctor.js";
import { User } from "./models/User.js";
import * as doctorService from "./services/doctor.service.js";
import * as patientService from "./services/patient.service.js";
import { SESSION_COOKIE, sessionMaxAgeMs, signSession } from "./services/auth.js";

// Security regression tests. Everything is mocked; nothing connects to MongoDB.

const userId = "507f1f77bcf86cd799439011";
const queryResult = <T,>(value: T) => ({ select: () => ({ lean: async () => value }), lean: async () => value });
const cookie = () => `${SESSION_COOKIE}=${signSession(userId)}`;

beforeEach(() => {
  process.env.JWT_SECRET = "test-secret-that-is-at-least-thirty-two-characters";
  process.env.JWT_EXPIRES_IN = "1d";
  process.env.CORS_ORIGIN = "http://localhost:3000";
  vi.restoreAllMocks();
  vi.spyOn(User, "findById").mockReturnValue(queryResult({ _id: userId, name: "Admin", email: "admin@example.com", role: "admin" }) as never);
});
afterEach(() => { vi.unstubAllEnvs(); });

describe("login brute-force protection", () => {
  it("limits failed attempts per account even when X-Forwarded-For is rotated (regression)", async () => {
    vi.spyOn(User, "findOne").mockReturnValue(queryResult(null) as never);
    const statuses: number[] = [];
    for (let attempt = 0; attempt < 12; attempt += 1) {
      const response = await request(app).post("/api/auth/login").set("X-Forwarded-For", `203.0.113.${attempt}`)
        .send({ email: " Victim@Example.com ", password: "wrong-password" });
      statuses.push(response.status);
    }
    expect(statuses.slice(0, 10).every((status) => status === 401)).toBe(true);
    expect(statuses.slice(10)).toEqual([429, 429]);
  });

  it("keys accounts by normalized email so case and whitespace do not create new buckets", async () => {
    vi.spyOn(User, "findOne").mockReturnValue(queryResult(null) as never);
    const variants = ["other@example.com", "OTHER@example.com", " other@EXAMPLE.com "];
    let last = 0;
    for (let attempt = 0; attempt < 11; attempt += 1) {
      last = (await request(app).post("/api/auth/login").set("X-Forwarded-For", `198.51.100.${attempt}`).send({ email: variants[attempt % 3], password: "wrong-password" })).status;
    }
    expect(last).toBe(429);
  });

  it("returns the same generic message when limited", async () => {
    vi.spyOn(User, "findOne").mockReturnValue(queryResult(null) as never);
    let body: unknown;
    for (let attempt = 0; attempt < 11; attempt += 1) body = (await request(app).post("/api/auth/login").send({ email: "limited@example.com", password: "x" })).body;
    expect(body).toEqual({ error: "Too many login attempts. Please try again later" });
  });
});

describe("trusted origins (CORS_ORIGIN)", () => {
  it("normalizes trailing slashes, paths, quotes, and spaces to exact origins", async () => {
    const { allowedOrigins } = await import("./middleware/security.js");
    expect(allowedOrigins(' "https://doctor-tracker-web.vercel.app/" , https://admin.example.com/login ,http://localhost:3000 ')).toEqual([
      "https://doctor-tracker-web.vercel.app", "https://admin.example.com", "http://localhost:3000",
    ]);
    expect(allowedOrigins("not a url, ftp://files.example.com, ")).toEqual([]);
  });

  it("accepts the configured frontend even when CORS_ORIGIN has a trailing slash (regression)", async () => {
    vi.stubEnv("CORS_ORIGIN", "https://doctor-tracker-web.vercel.app/");
    vi.spyOn(User, "findOne").mockReturnValue(queryResult(null) as never);
    const response = await request(app).post("/api/auth/login").set("Origin", "https://doctor-tracker-web.vercel.app")
      .set("Sec-Fetch-Site", "same-origin").send({ email: "origin-check@example.com", password: "wrong-password" });
    expect(response.status).toBe(401); // reached the credential check, not blocked as 403
  });

  it("still rejects other origins and lookalike hosts, and logs the rejected origin", async () => {
    vi.stubEnv("CORS_ORIGIN", "https://doctor-tracker-web.vercel.app/");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    for (const origin of ["https://evil.example", "https://doctor-tracker-web.vercel.app.evil.example", "http://doctor-tracker-web.vercel.app", "https://doctor-tracker-web-a1b2c3.vercel.app"]) {
      await request(app).post("/api/auth/login").set("Origin", origin).send({ email: "a@b.co", password: "x" }).expect(403);
    }
    expect(warn.mock.calls.flat().join(" ")).toContain('Rejected request origin "https://evil.example"');
    expect(warn.mock.calls.flat().join(" ")).toContain("allowed: https://doctor-tracker-web.vercel.app");
  });
});

describe("injection and input hardening", () => {
  it("rejects MongoDB operator objects in login and record bodies", async () => {
    const findOne = vi.spyOn(User, "findOne");
    await request(app).post("/api/auth/login").send({ email: { $ne: null }, password: { $ne: null } }).expect(400);
    expect(findOne).not.toHaveBeenCalled();
    const create = vi.spyOn(doctorService, "createDoctor");
    await request(app).post("/api/doctors").set("Cookie", cookie()).send({ name: { $gt: "" }, specialization: "A", hospital: "B", phone: "+1 555 0100 1234", email: "a@b.co" }).expect(400);
    await request(app).post("/api/patients").set("Cookie", cookie()).send({ name: "P", condition: "C", doctorId: { $ne: null } }).expect(400);
    expect(create).not.toHaveBeenCalled();
  });

  it("never passes object-shaped query parameters to MongoDB", async () => {
    const list = vi.spyOn(doctorService, "listDoctors").mockResolvedValue({ data: [], pagination: {} } as never);
    const patients = vi.spyOn(patientService, "listPatients").mockResolvedValue({ data: [], pagination: {} } as never);
    await request(app).get("/api/doctors?search[$ne]=x&specialization[$gt]=").set("Cookie", cookie()).expect(200);
    const doctorQuery = list.mock.calls[0]![0];
    for (const value of Object.values(doctorQuery)) expect(typeof value === "object" && !(value instanceof Date)).toBe(false);
    await request(app).get("/api/patients?doctorId[$ne]=507f1f77bcf86cd799439012").set("Cookie", cookie()).expect(200);
    expect(patients.mock.calls[0]![0]).not.toHaveProperty("doctorId");
    await request(app).get("/api/doctors?search=a&search=b").set("Cookie", cookie()).expect(400); // array values rejected
  });

  it("returns 413, not 500, for bodies over the 16 KB limit (regression)", async () => {
    const response = await request(app).post("/api/auth/login").set("Content-Type", "application/json")
      .send(JSON.stringify({ email: "a@b.co", password: "x".repeat(20_000) })).expect(413);
    expect(response.body).toEqual({ error: "Request body is too large" });
  });

  it("returns 400 for malformed JSON without echoing it", async () => {
    const response = await request(app).post("/api/auth/login").set("Content-Type", "application/json").send('{"email": "x", oops').expect(400);
    expect(response.body).toEqual({ error: "Malformed JSON request" });
  });
});

describe("response hardening", () => {
  it("sets security headers and disables caching on API responses", async () => {
    for (const path of ["/health", "/api/auth/me", "/api/nope"]) {
      const response = await request(app).get(path);
      expect(response.headers["x-content-type-options"]).toBe("nosniff");
      expect(response.headers["x-frame-options"]).toBe("DENY");
      expect(response.headers["referrer-policy"]).toBe("no-referrer");
      expect(response.headers["cache-control"]).toBe("no-store");
      expect(response.headers["x-powered-by"]).toBeUndefined();
    }
  });

  it("never returns stack traces or raw error details", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const failure = Object.assign(new Error("MongoServerError: user=admin password=hunter2 at cluster0"), { stack: "Error: secret\n    at file.ts:1:1" });
    vi.spyOn(doctorService, "listDoctors").mockRejectedValue(failure);
    const response = await request(app).get("/api/doctors").set("Cookie", cookie()).expect(500);
    expect(response.body).toEqual({ error: "Internal server error" });
    expect(JSON.stringify(response.body)).not.toMatch(/hunter2|stack|at file/);
  });

  it("does not expose password hashes through the session endpoint", async () => {
    vi.spyOn(User, "findById").mockReturnValue(queryResult({ _id: userId, name: "Admin", email: "admin@example.com", role: "admin", passwordHash: "$2a$12$secret" }) as never);
    const response = await request(app).get("/api/auth/me").set("Cookie", cookie()).expect(200);
    expect(JSON.stringify(response.body)).not.toContain("passwordHash");
    expect(JSON.stringify(response.body)).not.toContain("$2a$");
  });
});

describe("session cookie", () => {
  it("matches the cookie lifetime to the JWT expiry (regression)", async () => {
    vi.stubEnv("JWT_EXPIRES_IN", "2h");
    const bcrypt = await import("bcryptjs");
    const passwordHash = await bcrypt.hash("a-very-safe-password", 4);
    vi.spyOn(User, "findOne").mockReturnValue(queryResult({ _id: userId, name: "Admin", email: "cookie@example.com", role: "admin", passwordHash }) as never);
    const response = await request(app).post("/api/auth/login").send({ email: "cookie@example.com", password: "a-very-safe-password" }).expect(200);
    const setCookie = String(response.headers["set-cookie"]);
    const maxAge = Number(/Max-Age=(\d+)/.exec(setCookie)?.[1]);
    expect(maxAge).toBeGreaterThan(7190);
    expect(maxAge).toBeLessThanOrEqual(7200);
    expect(setCookie).toMatch(/HttpOnly/);
    expect(setCookie).toMatch(/SameSite=Lax/);
    expect(JSON.stringify(response.body)).not.toContain(setCookie.split(";")[0]!.split("=")[1]!); // token never in the body
  });

  it("computes remaining token lifetime", () => {
    vi.stubEnv("JWT_EXPIRES_IN", "1h");
    const token = signSession(userId);
    expect(sessionMaxAgeMs(token)).toBeGreaterThan(3_590_000);
    expect(sessionMaxAgeMs("not-a-jwt")).toBeUndefined();
  });

  it("marks the cookie Secure in production", async () => {
    const { sessionCookieOptions } = await import("./config/cookies.js");
    vi.stubEnv("NODE_ENV", "production");
    expect(sessionCookieOptions()).toMatchObject({ httpOnly: true, secure: true, sameSite: "lax" });
  });

  it("rejects tampered and wrongly signed tokens", async () => {
    const valid = signSession(userId);
    const [header, payload] = valid.split(".");
    const forgedPayload = Buffer.from(JSON.stringify({ role: "admin", sub: userId, exp: 9_999_999_999 })).toString("base64url");
    await request(app).get("/api/auth/me").set("Cookie", `${SESSION_COOKIE}=${header}.${forgedPayload}.invalidsig`).expect(401);
    const noneAlg = `${Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url")}.${payload}.`;
    await request(app).get("/api/auth/me").set("Cookie", `${SESSION_COOKIE}=${noneAlg}`).expect(401);
  });
});

describe("serverless database connection", () => {
  it("shares one connection attempt across concurrent calls and reuses an open connection", async () => {
    vi.stubEnv("MONGODB_URI", "mongodb://example.invalid/test");
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    let resolve!: () => void;
    const connect = vi.spyOn(mongoose, "connect").mockImplementation((() => new Promise((done) => { resolve = () => done(mongoose); })) as never);
    const pending = Promise.all([db.connectDB(), db.connectDB(), db.connectDB()]);
    resolve();
    await pending;
    expect(connect).toHaveBeenCalledTimes(1);
    vi.spyOn(mongoose.connection, "readyState", "get").mockReturnValue(1 as never);
    await db.connectDB();
    expect(connect).toHaveBeenCalledTimes(1);
  });

  it("retries after a failed attempt instead of caching the failure", async () => {
    vi.stubEnv("MONGODB_URI", "mongodb://example.invalid/test");
    vi.spyOn(mongoose.connection, "readyState", "get").mockReturnValue(0 as never);
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    const connect = vi.spyOn(mongoose, "connect").mockRejectedValueOnce(new Error("timeout")).mockResolvedValueOnce(mongoose as never);
    await expect(db.connectDB()).rejects.toThrow("timeout");
    await db.connectDB();
    expect(connect).toHaveBeenCalledTimes(2);
  });

  it("reconnects after the connection was closed (regression)", async () => {
    vi.stubEnv("MONGODB_URI", "mongodb://example.invalid/test");
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    const state = vi.spyOn(mongoose.connection, "readyState", "get").mockReturnValue(0 as never);
    const connect = vi.spyOn(mongoose, "connect").mockResolvedValue(mongoose as never);
    await db.connectDB();
    state.mockReturnValue(1 as never);
    await db.connectDB(); // open: no new attempt
    state.mockReturnValue(0 as never); // connection closed later
    await db.connectDB();
    expect(connect).toHaveBeenCalledTimes(2);
  });

  it("the Vercel handler answers 503 JSON over a real HTTP response when the database is unreachable (regression)", async () => {
    // Uses a real Node HTTP server (not a mocked res): the handler runs before Express, so it must not
    // rely on Express helpers such as res.status()/res.json().
    vi.spyOn(db, "connectDB").mockRejectedValue(new Error("querySrv ENOTFOUND cluster0.secret.mongodb.net"));
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const response = await request(handler as never).get("/api/doctors").expect(503);
    expect(response.body).toEqual({ error: "Service temporarily unavailable" });
    expect(response.headers["content-type"]).toMatch(/application\/json/);
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain("secret.mongodb.net");
  });

  it("the Vercel handler serves requests through Express once connected", async () => {
    vi.spyOn(db, "connectDB").mockResolvedValue();
    vi.spyOn(Doctor, "countDocuments");
    const response = await request(handler as never).get("/health").expect(200);
    expect(response.body).toEqual({ status: "ok", service: "doctor-tracker-backend", environment: "local" });
  });

  it("reports the deployment environment at /health and /api/health (for proxy checks)", async () => {
    vi.stubEnv("VERCEL_ENV", "preview");
    for (const path of ["/health", "/api/health"]) {
      const response = await request(app).get(path).expect(200);
      expect(response.body).toEqual({ status: "ok", service: "doctor-tracker-backend", environment: "preview" });
    }
  });
});
