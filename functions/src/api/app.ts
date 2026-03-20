import express from "express";
import type { Request, Response, NextFunction } from "express";
import swaggerUi from "swagger-ui-express";
import { generateOpenApiSpec } from "../openapi.js";
import { WakeApiServerError } from "./errors.js";
import { validateAuth, enforceScope } from "./middleware/auth.js";
import { checkDailyRateLimit } from "./middleware/rateLimit.js";

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
import bookingsRouter from "./routes/bookings.js";

export const app = express();

// ─── Body parsing ──────────────────────────────────────────────────────────
app.use(express.json({ limit: "1mb" }));

// ─── Security headers ─────────────────────────────────────────────────────
app.use((_req: Request, res: Response, next: NextFunction) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  next();
});

// ─── CORS ──────────────────────────────────────────────────────────────────
const ALLOWED_ORIGINS = new Set([
  "https://wakelab.co",
  "https://www.wakelab.co",
]);
const isEmulator = process.env.FUNCTIONS_EMULATOR === "true";

app.use((req: Request, res: Response, next: NextFunction) => {
  const origin = req.headers.origin;

  if (isEmulator) {
    // In emulator, allow any origin for local development
    res.setHeader("Access-Control-Allow-Origin", origin || "*");
  } else if (origin && ALLOWED_ORIGINS.has(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  }
  // If origin is not allowed, omit the header — browser will block the request

  res.setHeader("Vary", "Origin");
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

// ─── Swagger UI (emulator only — not exposed in production) ───────────────
if (isEmulator) {
  app.use("/docs", swaggerUi.serve, swaggerUi.setup(generateOpenApiSpec()));
}

// ─── Auth + Scope enforcement + Daily rate limit (all /v1/* except health) ─
app.use("/v1", async (req: Request, _res: Response, next: NextFunction) => {
  // Skip auth for health endpoint (already handled above) and OPTIONS
  if (req.path === "/health" || req.method === "OPTIONS") {
    next();
    return;
  }

  try {
    await validateAuth(req);

    // Scope enforcement: read-scoped API keys cannot make non-GET requests
    enforceScope(req);

    // Daily rate limit for API keys: 1,000 requests/day
    if (req.auth?.authType === "apikey" && req.auth.keyId) {
      await checkDailyRateLimit(req.auth.keyId, 1000);
    }

    next();
  } catch (err) {
    next(err);
  }
});

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
app.use("/v1", bookingsRouter);

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
      const retryAfter = err.retryAfter;
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
