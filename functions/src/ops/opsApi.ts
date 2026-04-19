// Read-only HTTP API over the wake-ops data surface. Foundation for a
// future web dashboard. No UI code lives here — only the JSON endpoints
// a UI (or scripted analysis) would need.
//
// Auth: single shared API key via `OPS_API_KEY` secret, sent either as
// `x-wake-ops-key` header or `?key=` query param. No per-user identity —
// this is an internal tool endpoint.
//
// Versioning: `/v1/*` prefix so future evolution doesn't break callers.

import type {Request, Response} from "express";
import * as admin from "firebase-admin";
import * as functions from "firebase-functions";

const ALLOWED_ORIGINS = new Set([
  "http://localhost:3000",
  "http://localhost:5173",
  "http://127.0.0.1:3000",
  "http://127.0.0.1:5173",
  "https://wolf-20b8b.web.app",
  "https://wolf-20b8b.firebaseapp.com",
  "https://wakelab.co",
  "https://www.wakelab.co",
]);

const MAX_LIMIT = 200;
const DEFAULT_LIMIT = 50;

export interface OpsApiContext {
  apiKey: string; // required shared secret
  projectId: string;
}

function setCors(req: Request, res: Response): boolean {
  const origin = req.header("origin") || "";
  const allowed = ALLOWED_ORIGINS.has(origin);
  res.setHeader("Vary", "Origin");
  if (allowed) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "x-wake-ops-key, Content-Type");
    res.setHeader("Access-Control-Max-Age", "3600");
  }
  return allowed;
}

function checkAuth(req: Request, expected: string): boolean {
  const expectedTrim = (expected || "").trim();
  if (!expectedTrim) {
    functions.logger.warn("opsApi: expected key empty — secret not bound?");
    return false;
  }
  const header = (req.header("x-wake-ops-key") || "").trim();
  const query = (
    (req.query?.key as string | undefined) || ""
  ).toString().trim();
  const provided = header || query;
  const ok =
    provided.length === expectedTrim.length &&
    provided === expectedTrim;
  if (!ok) {
    functions.logger.info("opsApi: auth mismatch", {
      expectedLen: expectedTrim.length,
      providedLen: provided.length,
      hasHeader: header.length > 0,
      hasQuery: query.length > 0,
    });
  }
  return ok;
}

function parseLimit(req: Request): number {
  const raw = req.query.limit;
  if (typeof raw !== "string") return DEFAULT_LIMIT;
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_LIMIT;
  return Math.min(n, MAX_LIMIT);
}

async function serialiseDocs(
  query: FirebaseFirestore.Query
): Promise<unknown[]> {
  const snap = await query.get();
  return snap.docs.map((d) => ({id: d.id, ...d.data()}));
}

// GET /v1/state/:collector
// Returns the current state docs for a collector — fingerprints, counts
// per day, trend indicators. The raw material for trend-line charts.
async function handleState(req: Request, res: Response): Promise<void> {
  const collector = String(req.params.collector || "");
  const valid = new Set([
    "logs",
    "payments",
    "quota",
    "pwa_errors",
    "creator_errors",
  ]);
  if (!valid.has(collector)) {
    res.status(400).json({error: {code: "UNKNOWN_COLLECTOR"}});
    return;
  }

  const map: Record<string, string> = {
    logs: "ops_logs_state",
    payments: "ops_payments_state",
    quota: "ops_quota_state",
    pwa_errors: "ops_pwa_errors_state",
    creator_errors: "ops_creator_errors_state",
  };
  const collection = map[collector];
  const limit = parseLimit(req);
  const db = admin.firestore();
  try {
    const docs = await serialiseDocs(
      db.collection(collection).orderBy("lastSeen", "desc").limit(limit)
    );
    res.json({collector, collection, count: docs.length, items: docs});
  } catch (err) {
    res.status(500).json({
      error: {
        code: "INTERNAL_ERROR",
        message: err instanceof Error ? err.message : String(err),
      },
    });
  }
}

// GET /v1/client-errors?source=pwa&limit=50
// Returns raw client error events. Useful for drilling into a spike.
async function handleClientErrors(
  req: Request,
  res: Response
): Promise<void> {
  const source = String(req.query.source || "");
  if (source !== "pwa" && source !== "creator") {
    res.status(400).json({error: {code: "VALIDATION_ERROR", field: "source"}});
    return;
  }
  const limit = parseLimit(req);
  const since24h =
    typeof req.query.windowHours === "string" ?
      Math.max(1, Math.min(168, parseInt(req.query.windowHours, 10) || 24)) :
      24;
  const sinceMs = Date.now() - since24h * 60 * 60 * 1000;

  const db = admin.firestore();
  try {
    const docs = await serialiseDocs(
      db
        .collection("ops_client_errors")
        .where("source", "==", source)
        .where(
          "createdAt",
          ">=",
          admin.firestore.Timestamp.fromMillis(sinceMs)
        )
        .orderBy("createdAt", "desc")
        .limit(limit)
    );
    res.json({source, windowHours: since24h, count: docs.length, items: docs});
  } catch (err) {
    res.status(500).json({
      error: {
        code: "INTERNAL_ERROR",
        message: err instanceof Error ? err.message : String(err),
      },
    });
  }
}

// GET /v1/health
// Cheap health check — confirms auth works, Firestore reachable.
async function handleHealth(_req: Request, res: Response): Promise<void> {
  try {
    await admin.firestore().collection("ops_logs_state").limit(1).get();
    res.json({ok: true, now: new Date().toISOString()});
  } catch (err) {
    res.status(500).json({
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

// GET /v1/summary
// Compact dashboard-style snapshot across collectors.
async function handleSummary(_req: Request, res: Response): Promise<void> {
  const db = admin.firestore();
  const since = admin.firestore.Timestamp.fromMillis(
    Date.now() - 86_400_000
  );

  async function countRecent(collection: string): Promise<number> {
    try {
      const snap = await db
        .collection(collection)
        .where("lastSeen", ">=", since)
        .count()
        .get();
      return snap.data().count;
    } catch (err) {
      functions.logger.warn("opsApi.summary: countRecent failed", {
        collection,
        error: err instanceof Error ? err.message : String(err),
      });
      return -1;
    }
  }
  async function countClientErrors(source: "pwa" | "creator"): Promise<number> {
    try {
      const snap = await db
        .collection("ops_client_errors")
        .where("source", "==", source)
        .where("createdAt", ">=", since)
        .count()
        .get();
      return snap.data().count;
    } catch (err) {
      functions.logger.warn("opsApi.summary: countClientErrors failed", {
        source,
        error: err instanceof Error ? err.message : String(err),
      });
      return -1;
    }
  }

  const [
    logsActive,
    paymentsActive,
    quotaActive,
    pwaActive,
    creatorActive,
    pwaEvents,
    creatorEvents,
  ] = await Promise.all([
    countRecent("ops_logs_state"),
    countRecent("ops_payments_state"),
    countRecent("ops_quota_state"),
    countRecent("ops_pwa_errors_state"),
    countRecent("ops_creator_errors_state"),
    countClientErrors("pwa"),
    countClientErrors("creator"),
  ]);

  res.json({
    window: "24h",
    activeFingerprints: {
      logs: logsActive,
      payments: paymentsActive,
      quota: quotaActive,
      pwa_errors: pwaActive,
      creator_errors: creatorActive,
    },
    clientErrorEvents: {
      pwa: pwaEvents,
      creator: creatorEvents,
    },
    generatedAt: new Date().toISOString(),
  });
}

// Simple router. Kept hand-rolled to avoid adding an Express app just
// for four routes.
export async function handleOpsApi(
  req: Request,
  res: Response,
  ctx: OpsApiContext
): Promise<void> {
  const corsAllowed = setCors(req, res);

  if (req.method === "OPTIONS") {
    res.status(corsAllowed ? 204 : 403).send("");
    return;
  }

  if (!corsAllowed && req.header("origin")) {
    res.status(403).json({error: {code: "FORBIDDEN", message: "origin"}});
    return;
  }

  if (req.method !== "GET") {
    res.status(405).json({error: {code: "METHOD_NOT_ALLOWED"}});
    return;
  }

  if (!checkAuth(req, ctx.apiKey)) {
    res.status(401).json({error: {code: "UNAUTHENTICATED"}});
    return;
  }

  // Route dispatch — strip /v1/ prefix then match.
  const path = (req.path || "/").replace(/^\/v1/, "") || "/";

  if (path === "/health") return handleHealth(req, res);
  if (path === "/summary") return handleSummary(req, res);
  if (path === "/client-errors") return handleClientErrors(req, res);

  const m = /^\/state\/([^/]+)$/.exec(path);
  if (m) {
    (req as unknown as {params: {collector: string}}).params = {
      collector: m[1],
    };
    return handleState(req, res);
  }

  res.status(404).json({error: {code: "NOT_FOUND", path}});
}
