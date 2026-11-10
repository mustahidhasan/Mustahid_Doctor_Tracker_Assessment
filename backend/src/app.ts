import cors from "cors";
import express from "express";

export const app = express();

app.use(
  cors({
    origin: process.env.CORS_ORIGIN || "http://localhost:3000",
    credentials: true,
  }),
);
app.use(express.json());

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
