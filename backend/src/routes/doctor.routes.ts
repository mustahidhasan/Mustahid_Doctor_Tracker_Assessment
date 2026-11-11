import { Router } from "express";
import * as controller from "../controllers/doctor.controller.js";
import { requireAdmin, requireAuth } from "../middleware/auth.js";
import { requireTrustedOriginForWrites } from "../middleware/security.js";

export const doctorRouter = Router();

doctorRouter.use(requireAuth, requireAdmin, requireTrustedOriginForWrites);
doctorRouter.route("/").post(controller.create).get(controller.list);
doctorRouter.get("/filter-options", controller.filterOptions);
doctorRouter.route("/:id").get(controller.details).patch(controller.update).delete(controller.remove);
doctorRouter.route("/:id/patients").get(controller.patients).post(controller.addPatient);
doctorRouter.delete("/:id/patients/:patientId", controller.removePatient);
