import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import { errorHandler, notFound } from "./middleware/security.js";
import { authRouter } from "./routes/auth.js";
import { doctorRouter } from "./routes/doctor.routes.js";

export const app = express();

app.disable("x-powered-by");
app.set("trust proxy", 1);
app.use(
  cors({
    origin: (process.env.CORS_ORIGIN || "http://localhost:3000").split(",").map((value) => value.trim()),
    credentials: true,
  }),
);
app.use(express.json({ limit: "16kb" }));
app.use(cookieParser());

app.get("/", (_request, response) => {
  response.status(200).json({
    message: "Doctor Tracker API is running",
    health: "/health",
  });
});

app.get("/health", (_request, response) => {
  response.status(200).json({
    status: "ok",
    service: "doctor-tracker-backend",
  });
});

app.use("/api/auth", authRouter);
app.use("/api/doctors", doctorRouter);
app.use(notFound);
app.use(errorHandler);
