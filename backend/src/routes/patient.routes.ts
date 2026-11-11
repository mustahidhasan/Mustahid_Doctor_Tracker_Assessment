import { Router } from "express";
import * as controller from "../controllers/patient.controller.js";
import { requireAdmin, requireAuth } from "../middleware/auth.js";
import { requireTrustedOriginForWrites } from "../middleware/security.js";

export const patientRouter = Router();

patientRouter.use(requireAuth, requireAdmin, requireTrustedOriginForWrites);
patientRouter.route("/").get(controller.list).post(controller.create);
patientRouter.get("/filter-options", controller.filterOptions);
patientRouter.route("/:id").get(controller.details).patch(controller.update).delete(controller.remove);
