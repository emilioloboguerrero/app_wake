// Express middleware: per-request cost telemetry.
//
// Emits ONE `api.request_completed` event per request — sampled at
// REQUEST_SAMPLE_RATE (5xx always captured). Counters in
// `req.analyticsCounters` are incremented by route handlers / services that
// touch external-cost resources (FatSecret, email, signed-URL storage).
//
// Also identifies the requesting user with their coach attribution so client
// behavioral events inherit `primaryCoachId` / `coachIds` via PostHog person
// properties. Dedup'd per function instance (TTL 10 min).

import type {Request, Response, NextFunction} from "express";
import {capture, identify} from "../../lib/analytics.js";
import {resolveCoachAttribution} from "../services/coachAttribution.js";

const REQUEST_SAMPLE_RATE = 0.1;

const identifiedCache = new Map<string, number>();
const IDENTIFY_TTL_MS = 10 * 60 * 1000;
const IDENTIFY_MAX = 200;

function shouldIdentify(userId: string): boolean {
  const now = Date.now();
  const last = identifiedCache.get(userId);
  if (last && now - last < IDENTIFY_TTL_MS) return false;
  if (identifiedCache.size >= IDENTIFY_MAX) {
    const firstKey = identifiedCache.keys().next().value;
    if (firstKey) identifiedCache.delete(firstKey);
  }
  identifiedCache.set(userId, now);
  return true;
}

export interface AnalyticsCounters {
  fatsecretCalls: number;
  emailsSent: number;
  storageUploadsIssued: number;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      analyticsCounters?: AnalyticsCounters;
    }
  }
}

export function analyticsMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const startMs = Date.now();
  req.analyticsCounters = {
    fatsecretCalls: 0,
    emailsSent: 0,
    storageUploadsIssued: 0,
  };

  res.on("finish", () => {
    const auth = req.auth;
    if (!auth?.userId) return;

    const status = res.statusCode;
    const isError = status >= 500;
    const shouldSample = isError || Math.random() < REQUEST_SAMPLE_RATE;
    const needsIdentify = shouldIdentify(auth.userId);

    if (!shouldSample && !needsIdentify) return;

    const counters = req.analyticsCounters || {
      fatsecretCalls: 0,
      emailsSent: 0,
      storageUploadsIssued: 0,
    };
    const route = req.route?.path || req.path || "unknown";
    const durationMs = Date.now() - startMs;

    resolveCoachAttribution(auth.userId, auth.role)
      .then((coach) => {
        if (needsIdentify) {
          identify(auth.userId, {
            role: auth.role,
            primaryCoachId: coach.primaryCoachId,
            coachIds: coach.coachIds,
            coachCount: coach.coachIds.length,
          });
        }
        if (!shouldSample) return;
        capture({
          distinctId: auth.userId,
          event: "api.request_completed",
          properties: {
            route,
            method: req.method,
            status,
            duration_ms: durationMs,
            sampled: !isError,
            fatsecret_calls: counters.fatsecretCalls,
            emails_sent: counters.emailsSent,
            storage_uploads_issued: counters.storageUploadsIssued,
            auth_type: auth.authType,
            role: auth.role,
            primary_coach_id: coach.primaryCoachId,
            coach_ids: coach.coachIds,
          },
        });
      })
      .catch(() => {
        // Swallow — best effort.
      });
  });

  next();
}
