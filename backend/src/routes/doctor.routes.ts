import { type NextFunction, type Request, type Response, Router } from "express";
import * as controller from "../controllers/doctor.controller.js";
import { requireAdmin, requireAuth } from "../middleware/auth.js";
import { requireTrustedOrigin } from "../middleware/security.js";

export const doctorRouter = Router();

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

// Cookie-authenticated state changes must come from a trusted browser origin (CSRF defence in depth).
function requireTrustedOriginForWrites(request: Request, response: Response, next: NextFunction) {
  if (SAFE_METHODS.has(request.method)) return next();
  return requireTrustedOrigin(request, response, next);
}

doctorRouter.use(requireAuth, requireAdmin, requireTrustedOriginForWrites);
doctorRouter.route("/").post(controller.create).get(controller.list);
doctorRouter.get("/filter-options", controller.filterOptions);
doctorRouter.route("/:id").get(controller.details).patch(controller.update).delete(controller.remove);
doctorRouter.route("/:id/patients").get(controller.patients).post(controller.addPatient);
doctorRouter.delete("/:id/patients/:patientId", controller.removePatient);
