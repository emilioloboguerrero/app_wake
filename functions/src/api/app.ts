import express from "express";
import type { Request, Response, NextFunction } from "express";
import swaggerUi from "swagger-ui-express";
import { generateOpenApiSpec } from "../openapi.js";
import { WakeApiServerError } from "./errors.js";

import profileRouter from "./routes/profile.js";
import nutritionRouter from "./routes/nutrition.js";
import workoutRouter from "./routes/workout.js";
import progressRouter from "./routes/progress.js";
import creatorRouter from "./routes/creator.js";
import eventsRouter from "./routes/events.js";
import paymentsRouter from "./routes/payments.js";
import analyticsRouter from "./routes/analytics.js";
import apiKeysRouter from "./routes/apiKeys.js";
import appResourcesRouter from "./routes/appResources.js";

export const app = express();

// ─── Body parsing ──────────────────────────────────────────────────────────
app.use(express.json({ limit: "1mb" }));

// ─── CORS ──────────────────────────────────────────────────────────────────
app.use((req: Request, res: Response, next: NextFunction) => {
  res.setHeader(
    "Access-Control-Allow-Origin",
    req.headers.origin || "*"
  );
  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET,POST,PATCH,PUT,DELETE,OPTIONS"
  );
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Authorization,Content-Type,X-Wake-Client,X-Firebase-AppCheck"
  );
  res.setHeader("Access-Control-Max-Age", "3600");

  if (req.method === "OPTIONS") {
    res.status(204).send("");
    return;
  }
  next();
});

// ─── Health ────────────────────────────────────────────────────────────────
app.get("/v1/health", (_req: Request, res: Response) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// ─── Swagger UI ────────────────────────────────────────────────────────────
app.use("/docs", swaggerUi.serve, swaggerUi.setup(generateOpenApiSpec()));

// ─── Route mounting ────────────────────────────────────────────────────────
app.use("/v1", profileRouter);
app.use("/v1", nutritionRouter);
app.use("/v1", workoutRouter);
app.use("/v1", progressRouter);
app.use("/v1", creatorRouter);
app.use("/v1", eventsRouter);
app.use("/v1", paymentsRouter);
app.use("/v1", analyticsRouter);
app.use("/v1", apiKeysRouter);
app.use("/v1", appResourcesRouter);

// ─── 404 catch-all ─────────────────────────────────────────────────────────
app.use((_req: Request, res: Response) => {
  res.status(404).json({
    error: { code: "NOT_FOUND", message: "Ruta no encontrada" },
  });
});

// ─── Global error handler ──────────────────────────────────────────────────
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof WakeApiServerError) {
    if (err.status === 429) {
      const retryAfter = (err as WakeApiServerError & { retryAfter?: number }).retryAfter;
      if (retryAfter) {
        res.setHeader("Retry-After", String(retryAfter));
      }
    }

    res.status(err.status).json({
      error: {
        code: err.code,
        message: err.message,
        ...(err.field ? { field: err.field } : {}),
      },
    });
    return;
  }

  // Unexpected error
  console.error("Unhandled API error:", err);
  res.status(500).json({
    error: { code: "INTERNAL_ERROR", message: "Error interno del servidor" },
  });
});
