import { Router } from "express";
import rateLimit from "express-rate-limit";
import { login, logout, me } from "../controllers/authController.js";
import { requireAuth } from "../middleware/auth.js";
import { requireTrustedOrigin } from "../middleware/security.js";

export const authRouter = Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: { error: "Too many login attempts. Please try again later" },
});

authRouter.post("/login", requireTrustedOrigin, loginLimiter, login);
authRouter.get("/me", requireAuth, me);
authRouter.post("/logout", requireTrustedOrigin, logout);
