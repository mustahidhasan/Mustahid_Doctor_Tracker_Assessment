import { Router } from "express";
import * as controller from "../controllers/dashboard.controller.js";
import { requireAdmin, requireAuth } from "../middleware/auth.js";

export const dashboardRouter = Router();

// Read-only analytics: admin session required on every route.
dashboardRouter.use(requireAuth, requireAdmin);
dashboardRouter.get("/summary", controller.summary);
dashboardRouter.get("/patients-per-doctor", controller.patientsPerDoctor);
dashboardRouter.get("/patient-trends", controller.patientTrends);
dashboardRouter.get("/specializations", controller.specializations);
dashboardRouter.get("/conditions", controller.conditions);
