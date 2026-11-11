import "dotenv/config";
import mongoose from "mongoose";
import { z } from "zod";
import { connectDB } from "../config/db.js";
import { User } from "../models/User.js";
import { hashPassword, normalizeEmail } from "../services/auth.js";

const seedEnvironmentSchema = z.object({
  ADMIN_EMAIL: z.string().trim().email(),
  ADMIN_PASSWORD: z.string().min(12),
});

export function validateSeedEnvironment(environment: NodeJS.ProcessEnv) {
  const result = seedEnvironmentSchema.safeParse(environment);
  if (!result.success) throw new Error("ADMIN_EMAIL must be valid and ADMIN_PASSWORD must be at least 12 characters");
  return { email: normalizeEmail(result.data.ADMIN_EMAIL), password: result.data.ADMIN_PASSWORD };
}

interface AdminSeedRepository {
  findByEmail(email: string): Promise<unknown>;
  create(input: { name: string; email: string; passwordHash: string; role: "admin" }): Promise<unknown>;
}

export async function ensureAdmin(email: string, password: string, repository: AdminSeedRepository) {
  if (await repository.findByEmail(email)) return false;
  await repository.create({ name: "Administrator", email, passwordHash: await hashPassword(password), role: "admin" });
  return true;
}

export async function seedAdmin() {
  const { email, password } = validateSeedEnvironment(process.env);
  await connectDB();
  const created = await ensureAdmin(email, password, {
    findByEmail: (candidate) => User.findOne({ email: candidate }).lean(),
    create: (input) => User.create(input),
  });
  if (!created) {
    console.log("Admin account already exists; no changes made");
    return false;
  }
  console.log("Admin account created successfully");
  return true;
}

async function main() {
  try {
    await seedAdmin();
  } catch (error) {
    console.error("Admin seed failed:", error instanceof Error ? error.message : "Unknown error");
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect().catch(() => undefined);
  }
}

if (process.argv[1] && import.meta.url === new URL(process.argv[1], "file:").href) void main();
