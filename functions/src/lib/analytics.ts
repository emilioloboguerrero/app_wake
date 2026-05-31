// Server-side analytics — posthog-node singleton.
// Used by Express analytics middleware, cost events (FatSecret/email/storage),
// purchase webhook completion, and scheduled abandonment detection.
//
// Safe to import anywhere: capture() / identify() silently no-op when
// POSTHOG_API_KEY is absent (local dev, tests, staging without the secret bound).

import {PostHog} from "posthog-node";
import * as functions from "firebase-functions";

let client: PostHog | null = null;
let initFailed = false;

function getClient(): PostHog | null {
  if (client) return client;
  if (initFailed) return null;
  const key = process.env.POSTHOG_API_KEY;
  if (!key) {
    initFailed = true;
    return null;
  }
  const host = process.env.POSTHOG_HOST || "https://us.i.posthog.com";
  try {
    client = new PostHog(key, {
      host,
      flushAt: 20,
      flushInterval: 10_000,
    });
  } catch (err) {
    initFailed = true;
    functions.logger.warn("analytics:init-failed", {error: String(err)});
    return null;
  }
  return client;
}

export function envName(): string {
  // Project ID is the most reliable production/staging discriminator inside a
  // Cloud Function runtime; GCP exposes it as GCLOUD_PROJECT.
  const project = process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT;
  if (project === "wake-staging") return "staging";
  if (process.env.FUNCTIONS_EMULATOR === "true") return "development";
  return "production";
}

export interface CaptureProps {
  distinctId: string;
  event: string;
  properties?: Record<string, unknown>;
  // Group keys by group type (e.g. {coach: "<coachUid>"}). Lets events roll up
  // by group in PostHog group analytics.
  groups?: Record<string, string>;
}

export function capture({distinctId, event, properties, groups}: CaptureProps): void {
  const c = getClient();
  if (!c || !distinctId || !event) return;
  try {
    c.capture({
      distinctId,
      event,
      properties: {
        app: "functions",
        platform: "server",
        env: envName(),
        ...(properties ?? {}),
      },
      ...(groups ? {groups} : {}),
    });
  } catch (err) {
    functions.logger.warn("analytics:capture-failed", {
      error: String(err),
      event,
    });
  }
}

export function identify(
  userId: string,
  properties: Record<string, unknown>
): void {
  const c = getClient();
  if (!c || !userId) return;
  try {
    c.identify({distinctId: userId, properties});
  } catch (err) {
    functions.logger.warn("analytics:identify-failed", {error: String(err)});
  }
}

export async function flushAnalytics(): Promise<void> {
  const c = getClient();
  if (!c) return;
  try {
    await c.flush();
  } catch {
    // Swallow — flush is best-effort.
  }
}
