import { app } from "../src/app.js";
import { connectDB } from "../src/config/db.js";
import type { Request, Response } from "express";

export default async function handler(request: Request, response: Response) {
  await connectDB();
  app(request, response);
}
