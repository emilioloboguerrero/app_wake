import type {Request, Response} from "express";
import * as functions from "firebase-functions";
import {sendTo, type TopicMap} from "./telegram.js";

// Receives PostHog error-tracking alert webhooks and mirrors them into the
// Telegram #signals topic. The request body shape is under our control — it
// is defined by the webhook destination template we configure in PostHog
// (see docs/superpowers/specs/2026-07-04-analytics-highest-standard-design.md):
//
//   {
//     "kind": "issue_created" | "issue_reopened" | "issue_spiking",
//     "issue": {
//       "name": "DOMException",
//       "description": "AbortError: ...",
//       "url": "https://us.posthog.com/project/.../error_tracking/<id>"
//     }
//   }
//
// The parser stays lenient anyway: a payload that drifts from this shape is
// still forwarded as compact JSON rather than dropped.

const KIND_LABELS: Record<string, string> = {
  issue_created: "nuevo error",
  issue_reopened: "error reabierto",
  issue_spiking: "error en spike",
};

interface AlertIssue {
  name?: string;
  description?: string;
  url?: string;
}

interface AlertPayload {
  kind?: string;
  issue?: AlertIssue;
}

function formatAlert(payload: AlertPayload, rawBody: unknown): string {
  const kind = payload.kind ?? "alert";
  const label = KIND_LABELS[kind] ?? kind;
  const lines = [`[posthog-alerts] ${label}`];

  const issue = payload.issue;
  if (issue && (issue.name || issue.description)) {
    const name = (issue.name ?? "").slice(0, 120);
    const description = (issue.description ?? "").slice(0, 300);
    lines.push("", [name, description].filter(Boolean).join(" — "));
    if (issue.url) lines.push(issue.url);
  } else {
    lines.push("", JSON.stringify(rawBody ?? {}).slice(0, 800));
  }

  return lines.join("\n");
}

export async function handlePosthogAlert(
  req: Request,
  res: Response,
  opts: {
    webhookSecret: string;
    botToken: string;
    chatId: string;
    topics?: TopicMap;
  }
): Promise<void> {
  if (req.method !== "POST") {
    res.status(405).send("method not allowed");
    return;
  }

  const provided = (req.header("x-wake-alerts-secret") ?? "").trim();
  const expected = (opts.webhookSecret ?? "").trim();
  if (!expected || provided !== expected) {
    functions.logger.warn("posthogAlerts: rejected request", {
      hasSecret: Boolean(provided),
    });
    res.status(401).send("unauthorized");
    return;
  }

  const payload = (req.body ?? {}) as AlertPayload;
  const message = formatAlert(payload, req.body);

  // Send before responding: Gen2 throttles CPU after the response is sent.
  try {
    await sendTo(
      {botToken: opts.botToken, chatId: opts.chatId, topics: opts.topics},
      "signals",
      message
    );
  } catch (err) {
    // Telegram failure must not make PostHog retry-loop the webhook; the
    // alert still exists in PostHog and reaches the email destination.
    functions.logger.error("posthogAlerts: telegram send failed", {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  res.status(200).send("ok");
}
