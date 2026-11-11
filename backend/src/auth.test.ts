import bcrypt from "bcryptjs";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { app } from "./app.js";
import { requireAdmin } from "./middleware/auth.js";
import { User } from "./models/User.js";
import { SESSION_COOKIE, signSession } from "./services/auth.js";
import { ensureAdmin, validateSeedEnvironment } from "./scripts/seedAdmin.js";

const id = "507f1f77bcf86cd799439011";
const password = "a-very-safe-password";
let passwordHash: string;

function queryResult<T>(value: T) {
  return { select: () => ({ lean: async () => value }), lean: async () => value };
}

beforeEach(async () => {
  process.env.JWT_SECRET = "test-secret-that-is-at-least-thirty-two-characters";
  process.env.JWT_EXPIRES_IN = "1d";
  process.env.NODE_ENV = "test";
  passwordHash = await bcrypt.hash(password, 4);
  vi.restoreAllMocks();
});

describe("admin seed", () => {
  it("validates and normalizes seed input", () => {
    expect(validateSeedEnvironment({ ADMIN_EMAIL: " Admin@Example.com ", ADMIN_PASSWORD: password } as NodeJS.ProcessEnv).email).toBe("admin@example.com");
    expect(() => validateSeedEnvironment({ ADMIN_EMAIL: "bad", ADMIN_PASSWORD: "short" } as NodeJS.ProcessEnv)).toThrow();
  });

  it("creates only a missing administrator and hashes the password", async () => {
    const create = vi.fn();
    const repository = { findByEmail: vi.fn().mockResolvedValue(null), create };
    expect(await ensureAdmin("admin@example.com", password, repository)).toBe(true);
    expect(await bcrypt.compare(password, create.mock.calls[0]![0].passwordHash)).toBe(true);
    repository.findByEmail.mockResolvedValueOnce({ id });
    expect(await ensureAdmin("admin@example.com", password, repository)).toBe(false);
    expect(create).toHaveBeenCalledTimes(1);
  });
});

describe("authentication API", () => {
  it("rejects invalid bodies and uses generic credential errors", async () => {
    await request(app).post("/api/auth/login").send({ email: "bad" }).expect(400);
    vi.spyOn(User, "findOne").mockReturnValue(queryResult(null) as never);
    const unknown = await request(app).post("/api/auth/login").send({ email: "nobody@example.com", password });
    expect(unknown.status).toBe(401);
    expect(unknown.body.error).toBe("Invalid email or password");
  });

  it("rejects a wrong password without leaking account details", async () => {
    vi.spyOn(User, "findOne").mockReturnValue(queryResult({ _id: id, name: "Admin", email: "admin@example.com", role: "admin", passwordHash }) as never);
    const response = await request(app).post("/api/auth/login").send({ email: "admin@example.com", password: "wrong-password" });
    expect(response.status).toBe(401);
    expect(response.body.error).toBe("Invalid email or password");
  });

  it("logs in, restores the session, and clears it on logout", async () => {
    const admin = { _id: id, name: "Admin", email: "admin@example.com", role: "admin", passwordHash };
    vi.spyOn(User, "findOne").mockReturnValue(queryResult(admin) as never);
    vi.spyOn(User, "findById").mockReturnValue(queryResult(admin) as never);
    const agent = request.agent(app);
    const login = await agent.post("/api/auth/login").send({ email: "ADMIN@example.com", password }).expect(200);
    expect(login.headers["set-cookie"]?.[0]).toContain(`${SESSION_COOKIE}=`);
    expect(login.headers["set-cookie"]?.[0]).toContain("HttpOnly");
    expect(login.body.user).not.toHaveProperty("passwordHash");
    await agent.get("/api/auth/me").expect(200);
    const logout = await agent.post("/api/auth/logout").expect(200);
    expect(logout.headers["set-cookie"]?.[0]).toContain(`${SESSION_COOKIE}=;`);
    await agent.get("/api/auth/me").expect(401);
  });

  it("rejects missing, invalid, expired, deleted, and unauthorized sessions", async () => {
    await request(app).get("/api/auth/me").expect(401);
    await request(app).get("/api/auth/me").set("Cookie", `${SESSION_COOKIE}=invalid`).expect(401);
    process.env.JWT_EXPIRES_IN = "-1s";
    await request(app).get("/api/auth/me").set("Cookie", `${SESSION_COOKIE}=${signSession(id)}`).expect(401);
    process.env.JWT_EXPIRES_IN = "1d";
    vi.spyOn(User, "findById").mockReturnValue(queryResult(null) as never);
    await request(app).get("/api/auth/me").set("Cookie", `${SESSION_COOKIE}=${signSession(id)}`).expect(401);
    vi.mocked(User.findById).mockReturnValue(queryResult({ _id: id, name: "User", email: "user@example.com", role: "user" }) as never);
    await request(app).get("/api/auth/me").set("Cookie", `${SESSION_COOKIE}=${signSession(id)}`).expect(401);
  });

  it("blocks untrusted browser origins", async () => {
    await request(app).post("/api/auth/login").set("Origin", "https://attacker.example").send({ email: "admin@example.com", password }).expect(403);
  });

  it("returns 403 when an authenticated identity lacks the admin role", () => {
    const request = { auth: { userId: id, role: "user", name: "User", email: "user@example.com" } };
    const status = vi.fn().mockReturnThis();
    const json = vi.fn();
    const next = vi.fn();
    requireAdmin(request as never, { status, json } as never, next);
    expect(status).toHaveBeenCalledWith(403);
    expect(json).toHaveBeenCalledWith({ error: "Administrator access required" });
    expect(next).not.toHaveBeenCalled();
  });

  it("rate limits repeated failed login attempts", async () => {
    vi.spyOn(User, "findOne").mockReturnValue(queryResult(null) as never);
    let response;
    for (let attempt = 0; attempt < 11; attempt += 1) {
      response = await request(app).post("/api/auth/login").set("X-Forwarded-For", "203.0.113.42").send({ email: "missing@example.com", password });
    }
    expect(response?.status).toBe(429);
  });
});
