import type {Request, Response} from "express";
import * as functions from "firebase-functions";
import {Resend} from "resend";
import {sendTo, type TopicMap} from "./telegram.js";

// Receives PostHog error-tracking alert webhooks and fans them out to the
// Telegram #signals topic and a backup email. The request body shape is under
// our control — it is defined by the webhook destination we configure in
// PostHog. PostHog's webhook template cannot set custom headers, so the
// shared secret arrives as a `?secret=` query param (header also accepted
// for manual/test calls). The parser stays lenient: a payload that drifts
// from the expected shape is still forwarded as compact JSON, never dropped.

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

function formatAlert(payload: AlertPayload, rawBody: unknown): {subject: string; body: string} {
  const kind = payload.kind ?? "alert";
  const label = KIND_LABELS[kind] ?? kind;
  const lines = [`[posthog-alerts] ${label}`];
  let subject = `[posthog-alerts] ${label}`;

  const issue = payload.issue;
  if (issue && (issue.name || issue.description)) {
    const name = (issue.name ?? "").slice(0, 120);
    const description = (issue.description ?? "").slice(0, 300);
    const headline = [name, description].filter(Boolean).join(" — ");
    subject = `[posthog-alerts] ${label}: ${name || description}`.slice(0, 160);
    lines.push("", headline);
    if (issue.url) lines.push(issue.url);
  } else {
    lines.push("", JSON.stringify(rawBody ?? {}).slice(0, 800));
  }

  return {subject, body: lines.join("\n")};
}

export async function handlePosthogAlert(
  req: Request,
  res: Response,
  opts: {
    webhookSecret: string;
    botToken: string;
    chatId: string;
    topics?: TopicMap;
    resendApiKey?: string;
    alertEmail?: string;
  }
): Promise<void> {
  if (req.method !== "POST") {
    res.status(405).send("method not allowed");
    return;
  }

  const provided = (
    req.header("x-wake-alerts-secret") ??
    (typeof req.query.secret === "string" ? req.query.secret : "")
  ).trim();
  const expected = (opts.webhookSecret ?? "").trim();
  if (!expected || provided !== expected) {
    functions.logger.warn("posthogAlerts: rejected request", {
      hasSecret: Boolean(provided),
    });
    res.status(401).send("unauthorized");
    return;
  }

  const payload = (req.body ?? {}) as AlertPayload;
  const {subject, body} = formatAlert(payload, req.body);

  // Both channels fire independently; one failing must not block the other,
  // and neither may make PostHog retry-loop the webhook (always 200 after
  // auth). Send before responding: Gen2 throttles CPU post-response.
  const telegramSend = sendTo(
    {botToken: opts.botToken, chatId: opts.chatId, topics: opts.topics},
    "signals",
    body
  ).catch((err) => {
    functions.logger.error("posthogAlerts: telegram send failed", {
      error: err instanceof Error ? err.message : String(err),
    });
  });

  const emailSend = (async () => {
    if (!opts.resendApiKey || !opts.alertEmail) return;
    const resend = new Resend(opts.resendApiKey);
    const {error} = await resend.emails.send({
      from: "Wake Ops <no-reply@wakelab.co>",
      to: opts.alertEmail,
      subject,
      text: body,
    });
    if (error) throw new Error(error.message);
  })().catch((err) => {
    functions.logger.error("posthogAlerts: email send failed", {
      error: err instanceof Error ? err.message : String(err),
    });
  });

  await Promise.all([telegramSend, emailSend]);
  res.status(200).send("ok");
}
