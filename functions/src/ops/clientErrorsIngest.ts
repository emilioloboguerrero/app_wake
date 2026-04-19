import type {Request, Response} from "express";
import * as admin from "firebase-admin";
import * as functions from "firebase-functions";
import {fingerprintError} from "./fingerprint.js";

const ALLOWED_ORIGINS = new Set([
  "https://wakelab.co",
  "https://www.wakelab.co",
  "https://wolf-20b8b.web.app",
  "https://wolf-20b8b.firebaseapp.com",
  "https://wake-staging.web.app",
  "https://wake-staging.firebaseapp.com",
]);

const ALLOWED_SOURCES = new Set(["pwa", "creator"]);
const MAX_BATCH = 20;
const MAX_STACK_BYTES = 8 * 1024;
const MAX_MESSAGE_LEN = 500;
const MAX_URL_LEN = 500;
const MAX_UA_LEN = 400;

const RATE_LIMIT_PER_MIN = 60;
const RATE_WINDOW_MS = 60_000;
const ipBuckets = new Map<string, number[]>();

const TTL_DAYS = 14;

const PII_RULES: Array<{re: RegExp; replacement: string}> = [
  {re: /[\w.+-]+@[\w-]+\.[\w.-]+/g, replacement: "{email}"},
  {re: /\b\d{6,}\b/g, replacement: "{n}"},
  {re: /\b[A-Za-z0-9_-]{24,}\b/g, replacement: "{token}"},
];

function stripPii(input: string): string {
  let out = input;
  for (const rule of PII_RULES) {
    out = out.replace(rule.re, rule.replacement);
  }
  return out;
}

function clientIp(req: Request): string {
  const fwd = req.header("x-forwarded-for") || "";
  const first = fwd.split(",")[0]?.trim();
  return first || req.ip || "unknown";
}

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const bucket = ipBuckets.get(ip) ?? [];
  const fresh = bucket.filter((ts) => now - ts < RATE_WINDOW_MS);
  if (fresh.length >= RATE_LIMIT_PER_MIN) {
    ipBuckets.set(ip, fresh);
    return true;
  }
  fresh.push(now);
  ipBuckets.set(ip, fresh);
  return false;
}

function setCors(req: Request, res: Response): boolean {
  const origin = req.header("origin") || "";
  const allowed = ALLOWED_ORIGINS.has(origin);
  res.setHeader("Vary", "Origin");
  if (allowed) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    res.setHeader("Access-Control-Max-Age", "3600");
  }
  return allowed;
}

interface IncomingError {
  message?: string;
  stack?: string | null;
  url?: string;
  errorType?: string;
  count?: number;
}

interface IngestBody {
  source?: string;
  userId?: string | null;
  userAgent?: string;
  errors?: IncomingError[];
}

function inferErrorType(message: string): string {
  const m = /\b([A-Z][a-zA-Z]*(?:Error|Exception))\b/.exec(message);
  return m ? m[1] : "Error";
}

export async function handleClientErrorsIngest(
  req: Request,
  res: Response
): Promise<void> {
  const corsAllowed = setCors(req, res);

  if (req.method === "OPTIONS") {
    res.status(corsAllowed ? 204 : 403).send("");
    return;
  }

  if (!corsAllowed) {
    res.status(403).json({error: {code: "FORBIDDEN", message: "origin"}});
    return;
  }

  if (req.method !== "POST") {
    res.status(405).json({error: {code: "METHOD_NOT_ALLOWED"}});
    return;
  }

  const ip = clientIp(req);
  if (rateLimited(ip)) {
    res.setHeader("Retry-After", "60");
    res.status(429).json({error: {code: "RATE_LIMITED"}});
    return;
  }

  const body = (req.body ?? {}) as IngestBody;
  const source = body.source;
  if (!source || !ALLOWED_SOURCES.has(source)) {
    res.status(400).json({
      error: {code: "VALIDATION_ERROR", field: "source"},
    });
    return;
  }

  const incoming = Array.isArray(body.errors) ? body.errors : [];
  if (incoming.length === 0) {
    res.status(200).json({accepted: 0});
    return;
  }
  if (incoming.length > MAX_BATCH) {
    res.status(400).json({
      error: {code: "VALIDATION_ERROR", field: "errors", message: "batch too large"},
    });
    return;
  }

  const userAgent =
    typeof body.userAgent === "string" ?
      body.userAgent.slice(0, MAX_UA_LEN) :
      "";
  const userId =
    typeof body.userId === "string" && body.userId.length <= 128 ?
      body.userId :
      null;

  const db = admin.firestore();
  const now = admin.firestore.Timestamp.now();
  const expiresAt = admin.firestore.Timestamp.fromMillis(
    Date.now() + TTL_DAYS * 86_400_000
  );

  const batch = db.batch();
  let accepted = 0;

  for (const e of incoming) {
    const rawMessage = typeof e.message === "string" ? e.message : "";
    if (!rawMessage) continue;

    const message = stripPii(rawMessage).slice(0, MAX_MESSAGE_LEN);
    const rawStack = typeof e.stack === "string" ? e.stack : null;
    const stack = rawStack ?
      stripPii(rawStack).slice(0, MAX_STACK_BYTES) :
      null;
    const url =
      typeof e.url === "string" ? e.url.slice(0, MAX_URL_LEN) : "";
    const errorType =
      typeof e.errorType === "string" && e.errorType.length < 80 ?
        e.errorType :
        inferErrorType(message);
    const count =
      typeof e.count === "number" && e.count > 0 && e.count < 10_000 ?
        Math.floor(e.count) :
        1;

    const fingerprint = fingerprintError(source, errorType, message);

    const ref = db.collection("ops_client_errors").doc();
    batch.set(ref, {
      source,
      fingerprint,
      errorType,
      message,
      stack,
      url,
      userAgent,
      userId,
      count,
      createdAt: now,
      expiresAt,
    });
    accepted += 1;
  }

  if (accepted === 0) {
    res.status(200).json({accepted: 0});
    return;
  }

  try {
    await batch.commit();
  } catch (err) {
    functions.logger.error("wakeClientErrorsIngest: commit failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    res.status(500).json({error: {code: "INTERNAL_ERROR"}});
    return;
  }

  res.status(200).json({accepted});
}
