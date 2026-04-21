/* eslint-disable max-len */
// GitHub webhook receiver — mirrors repo activity into the wake_ops bus
// so the human operator sees issue/PR/review/workflow events without
// context-switching out of Telegram.
//
// Inbound events filtered to the ones that matter for the ops loop:
//   - issues:            opened, closed, reopened, assigned
//   - issue_comment:     created
//   - pull_request:      opened, closed, reopened, ready_for_review
//   - pull_request_review: submitted
//   - workflow_run:      completed (for claude.yml / claude-code-review.yml)
//
// Auth: GitHub signs each payload with HMAC-SHA256 using the secret from
// GITHUB_WEBHOOK_SECRET. We reject if the signature doesn't match.
//
// Output: one condensed line per event posted to #signals with the
// [wake-github] tag.

import type {Request, Response} from "express";
import * as crypto from "node:crypto";
import * as functions from "firebase-functions";
import {sendTo, type ChannelContext} from "./telegram.js";

interface GithubWebhookOptions {
  webhookSecret: string;
  allowedRepo: string; // "owner/repo"
  telegram: ChannelContext;
}

interface RawRequest extends Request {
  rawBody?: Buffer;
}

function verifySignature(
  body: Buffer | string,
  secret: string,
  header: string | undefined
): boolean {
  if (!header || !header.startsWith("sha256=")) return false;
  const expected = crypto
    .createHmac("sha256", secret)
    .update(body)
    .digest("hex");
  const provided = header.slice("sha256=".length);
  const expectedBuf = Buffer.from(expected, "hex");
  const providedBuf = Buffer.from(provided, "hex");
  if (expectedBuf.length !== providedBuf.length) return false;
  return crypto.timingSafeEqual(expectedBuf, providedBuf);
}

function truncate(s: string | null | undefined, n: number): string {
  if (!s) return "";
  const trimmed = s.trim().replace(/\s+/g, " ");
  return trimmed.length > n ? `${trimmed.slice(0, n - 1)}…` : trimmed;
}

interface IssueEvent {
  action: string;
  issue: {
    number: number;
    title: string;
    html_url: string;
    state: string;
    user: {login: string};
    labels?: Array<{name: string}>;
  };
  sender: {login: string};
}

interface IssueCommentEvent {
  action: string;
  issue: {number: number; title: string; html_url: string};
  comment: {body: string; html_url: string; user: {login: string}};
  sender: {login: string};
}

interface PullRequestEvent {
  action: string;
  pull_request: {
    number: number;
    title: string;
    html_url: string;
    merged: boolean;
    draft: boolean;
    user: {login: string};
  };
  sender: {login: string};
}

interface PullRequestReviewEvent {
  action: string;
  review: {state: string; body: string | null; html_url: string; user: {login: string}};
  pull_request: {number: number; title: string};
  sender: {login: string};
}

interface WorkflowRunEvent {
  action: string;
  workflow_run: {
    name: string;
    conclusion: string | null;
    status: string;
    html_url: string;
    run_number: number;
    event: string;
  };
  sender: {login: string};
}

function renderIssue(e: IssueEvent): string | null {
  const {action, issue, sender} = e;
  const labels = (issue.labels ?? []).map((l) => l.name).join(", ");
  const labelPart = labels ? ` [${labels}]` : "";
  switch (action) {
  case "opened":
    return `issue #${issue.number} opened by ${sender.login}: "${truncate(issue.title, 120)}"${labelPart}\n${issue.html_url}`;
  case "closed":
    return `issue #${issue.number} closed by ${sender.login}: "${truncate(issue.title, 120)}"`;
  case "reopened":
    return `issue #${issue.number} reopened by ${sender.login}`;
  case "assigned":
    return `issue #${issue.number} assigned by ${sender.login}`;
  default:
    return null;
  }
}

function renderIssueComment(e: IssueCommentEvent): string | null {
  if (e.action !== "created") return null;
  const preview = truncate(e.comment.body, 160);
  return `comment on #${e.issue.number} by ${e.comment.user.login}: ${preview}`;
}

function renderPullRequest(e: PullRequestEvent): string | null {
  const {action, pull_request: pr, sender} = e;
  switch (action) {
  case "opened":
    return `PR #${pr.number} ${pr.draft ? "(draft) " : ""}opened by ${pr.user.login}: "${truncate(pr.title, 120)}"\n${pr.html_url}`;
  case "ready_for_review":
    return `PR #${pr.number} ready for review by ${sender.login}: "${truncate(pr.title, 100)}"`;
  case "closed":
    return pr.merged ?
      `PR #${pr.number} merged by ${sender.login}: "${truncate(pr.title, 100)}"` :
      `PR #${pr.number} closed without merge by ${sender.login}`;
  case "reopened":
    return `PR #${pr.number} reopened by ${sender.login}`;
  default:
    return null;
  }
}

function renderPullRequestReview(e: PullRequestReviewEvent): string | null {
  if (e.action !== "submitted") return null;
  const body = truncate(e.review.body, 160);
  const tail = body ? ` — ${body}` : "";
  return `review ${e.review.state.toLowerCase()} on PR #${e.pull_request.number} by ${e.review.user.login}${tail}`;
}

function renderWorkflowRun(e: WorkflowRunEvent): string | null {
  // Only notify on terminal states for the @claude workflows.
  if (e.action !== "completed") return null;
  const name = e.workflow_run.name;
  if (!/Claude/i.test(name)) return null;
  const outcome = e.workflow_run.conclusion ?? e.workflow_run.status;
  return `workflow "${name}" #${e.workflow_run.run_number}: ${outcome}\n${e.workflow_run.html_url}`;
}

export async function handleGithubWebhook(
  req: RawRequest,
  res: Response,
  opts: GithubWebhookOptions
): Promise<void> {
  const event = (req.header("x-github-event") ?? "").toLowerCase();
  const signature = req.header("x-hub-signature-256") ?? "";

  const body = req.rawBody ?? Buffer.from(JSON.stringify(req.body ?? {}));
  if (!verifySignature(body, opts.webhookSecret, signature)) {
    res.status(403).send("forbidden");
    return;
  }

  if (event === "ping") {
    res.status(200).send("pong");
    return;
  }

  const payload = (req.body ?? {}) as Record<string, unknown>;
  const repoFull =
    (payload.repository as {full_name?: string} | undefined)?.full_name ?? "";
  if (repoFull && repoFull !== opts.allowedRepo) {
    functions.logger.warn("githubWebhook: rejected repo", {repoFull});
    res.status(200).send("ok");
    return;
  }

  let line: string | null = null;
  try {
    switch (event) {
    case "issues":
      line = renderIssue(payload as unknown as IssueEvent);
      break;
    case "issue_comment":
      line = renderIssueComment(payload as unknown as IssueCommentEvent);
      break;
    case "pull_request":
      line = renderPullRequest(payload as unknown as PullRequestEvent);
      break;
    case "pull_request_review":
      line = renderPullRequestReview(
          payload as unknown as PullRequestReviewEvent
      );
      break;
    case "workflow_run":
      line = renderWorkflowRun(payload as unknown as WorkflowRunEvent);
      break;
    default:
      line = null;
    }
  } catch (err) {
    functions.logger.warn("githubWebhook: render failed", {
      event,
      error: err instanceof Error ? err.message : String(err),
    });
  }

  if (line) {
    try {
      await sendTo(opts.telegram, "signals", `[wake-github] ${line}`);
    } catch (err) {
      functions.logger.error("githubWebhook: send failed", {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  res.status(200).send("ok");
}
