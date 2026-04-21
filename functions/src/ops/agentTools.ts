/* eslint-disable max-len */
// Agent tool layer. Defines the tools the Claude tool-calling loop can
// invoke, plus their implementations. Each tool has a JSON schema for
// model-facing input validation and a pure/async implementation.
//
// Firestore-backed reads go direct (no HTTP self-call) — the agent
// runs in the same Cloud Functions codebase, so hitting wakeOpsApi over
// HTTP would add latency and cost without decoupling benefit. The data
// shapes returned mirror what the ops API exposes, so a future dashboard
// can consume the same JSON.

import * as admin from "firebase-admin";
import * as functions from "firebase-functions";
import {GithubClient} from "./github.js";
import {
  readArchive,
  type Direction,
  type ReadArchiveFilter,
} from "./messageArchive.js";
import type {Topic, ChannelContext} from "./telegram.js";
import {sendTo} from "./telegram.js";
import {
  createOpsIssue,
  getOpsIssue,
  listOpenOpsIssues,
  updateOpsIssue,
  type OpsIssueSource,
} from "./opsIssues.js";

export interface AgentRuntime {
  github: GithubClient;
  telegram: ChannelContext;
}

export interface ToolSpec {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
  execute: (runtime: AgentRuntime, input: unknown) => Promise<unknown>;
}

// ─── read_archive ────────────────────────────────────────────────────────
const readArchiveTool: ToolSpec = {
  name: "read_archive",
  description:
    "Read the wake_ops Telegram group message archive. Returns the most recent messages within the requested window, optionally filtered by topic, direction, or tag.",
  input_schema: {
    type: "object",
    properties: {
      hours: {type: "number", minimum: 1, maximum: 168},
      topic: {type: "string", enum: ["agent", "signals", "deploys"]},
      direction: {type: "string", enum: ["in", "out"]},
      tag: {type: "string"},
      limit: {type: "number", minimum: 1, maximum: 500},
    },
    required: ["hours"],
  },
  async execute(_runtime, input) {
    const {hours, topic, direction, tag, limit} = input as {
      hours: number;
      topic?: Topic;
      direction?: Direction;
      tag?: string;
      limit?: number;
    };
    const filter: ReadArchiveFilter = {topic, direction, tag, limit};
    const records = await readArchive(hours, filter);
    return {
      count: records.length,
      messages: records.map((r) => ({
        at: r.receivedAt.toISOString(),
        topic: r.topic,
        direction: r.direction,
        sender: r.sender.username ??
          (r.sender.type === "bot" ? "bot" : "user"),
        tag: r.tag,
        text: r.text,
      })),
    };
  },
};

// ─── get_ops_state ───────────────────────────────────────────────────────
const STATE_COLLECTIONS: Record<string, string> = {
  logs: "ops_logs_state",
  payments: "ops_payments_state",
  quota: "ops_quota_state",
  pwa_errors: "ops_pwa_errors_state",
  creator_errors: "ops_creator_errors_state",
};

const getOpsStateTool: ToolSpec = {
  name: "get_ops_state",
  description:
    "Read the per-fingerprint state docs for a given collector. Each doc includes firstSeen, lastSeen, countsByDay for up to 14 days.",
  input_schema: {
    type: "object",
    properties: {
      collector: {
        type: "string",
        enum: Object.keys(STATE_COLLECTIONS),
      },
      limit: {type: "number", minimum: 1, maximum: 200},
    },
    required: ["collector"],
  },
  async execute(_runtime, input) {
    const {collector, limit} = input as {
      collector: keyof typeof STATE_COLLECTIONS;
      limit?: number;
    };
    const coll = STATE_COLLECTIONS[collector];
    if (!coll) throw new Error(`unknown collector: ${collector}`);
    const db = admin.firestore();
    const snap = await db
      .collection(coll)
      .orderBy("lastSeen", "desc")
      .limit(Math.min(Math.max(limit ?? 50, 1), 200))
      .get();
    return {
      count: snap.size,
      states: snap.docs.map((d) => {
        const data = d.data() as Record<string, unknown>;
        const ts = (v: unknown): string | null =>
          v instanceof admin.firestore.Timestamp ?
            v.toDate().toISOString() :
            null;
        return {
          fingerprint: d.id,
          firstSeen: ts(data.firstSeen),
          lastSeen: ts(data.lastSeen),
          reportedAt: ts(data.reportedAt),
          countsByDay: (data.countsByDay as Record<string, number>) ?? {},
        };
      }),
    };
  },
};

// ─── get_client_errors ───────────────────────────────────────────────────
const getClientErrorsTool: ToolSpec = {
  name: "get_client_errors",
  description:
    "Read raw client errors from ops_client_errors for a source (pwa|creator) within a time window. Returns top fingerprints by count plus sample entries.",
  input_schema: {
    type: "object",
    properties: {
      source: {type: "string", enum: ["pwa", "creator"]},
      hours: {type: "number", minimum: 1, maximum: 168},
      limit: {type: "number", minimum: 1, maximum: 200},
    },
    required: ["source", "hours"],
  },
  async execute(_runtime, input) {
    const {source, hours, limit} = input as {
      source: "pwa" | "creator";
      hours: number;
      limit?: number;
    };
    const cutoff = admin.firestore.Timestamp.fromMillis(
      Date.now() - hours * 3_600_000
    );
    const db = admin.firestore();
    const snap = await db
      .collection("ops_client_errors")
      .where("source", "==", source)
      .where("createdAt", ">=", cutoff)
      .orderBy("createdAt", "desc")
      .limit(Math.min(Math.max(limit ?? 100, 1), 200))
      .get();
    const byFp = new Map<
      string,
      {
        fingerprint: string;
        errorType: string;
        message: string;
        count: number;
        sample: {stack: string | null; url: string; at: string};
      }
    >();
    for (const d of snap.docs) {
      const data = d.data() as {
        fingerprint: string;
        errorType: string;
        message: string;
        stack: string | null;
        url: string;
        count: number;
        createdAt: admin.firestore.Timestamp;
      };
      const entry = byFp.get(data.fingerprint);
      const contribution = Math.max(1, data.count ?? 1);
      if (entry) {
        entry.count += contribution;
      } else {
        byFp.set(data.fingerprint, {
          fingerprint: data.fingerprint,
          errorType: data.errorType,
          message: data.message,
          count: contribution,
          sample: {
            stack: data.stack,
            url: data.url,
            at: data.createdAt.toDate().toISOString(),
          },
        });
      }
    }
    const fingerprints = Array.from(byFp.values()).sort(
      (a, b) => b.count - a.count
    );
    return {totalEntries: snap.size, fingerprints};
  },
};

// ─── get_recent_commits ──────────────────────────────────────────────────
const getRecentCommitsTool: ToolSpec = {
  name: "get_recent_commits",
  description:
    "Read the most recent commits on the default branch. Used to correlate errors with deploys (commit messages starting with 'deploy(' are from the postdeploy hook).",
  input_schema: {
    type: "object",
    properties: {
      count: {type: "number", minimum: 1, maximum: 50},
    },
  },
  async execute(runtime, input) {
    const {count} = (input ?? {}) as {count?: number};
    const commits = await runtime.github.getRecentCommits(count ?? 15);
    return {
      count: commits.length,
      commits: commits.map((c) => ({
        sha: c.sha.slice(0, 7),
        fullSha: c.sha,
        message: c.message.split("\n")[0].slice(0, 200),
        author: c.authorName,
        date: c.authorDate,
      })),
    };
  },
};

// ─── find_issue_by_fingerprint ───────────────────────────────────────────
const findIssueByFingerprintTool: ToolSpec = {
  name: "find_issue_by_fingerprint",
  description:
    "Look up the GitHub issue (if any) already tracking a given fingerprint. Checks the ops_issues Firestore mapping and then fetches the GitHub issue to return its current state.",
  input_schema: {
    type: "object",
    properties: {fingerprint: {type: "string"}},
    required: ["fingerprint"],
  },
  async execute(runtime, input) {
    const {fingerprint} = input as {fingerprint: string};
    const mapping = await getOpsIssue(fingerprint);
    if (!mapping) return {found: false};
    const issue = await runtime.github.getIssue(mapping.issueNumber);
    return {
      found: true,
      fingerprint,
      issueNumber: mapping.issueNumber,
      issueUrl: mapping.issueUrl,
      state: mapping.state,
      firstOpened: mapping.firstOpened.toDate().toISOString(),
      occurrenceCount: mapping.occurrenceCount,
      github: issue ?
        {
          state: issue.state,
          title: issue.title,
          labels: issue.labels,
        } :
        null,
    };
  },
};

// ─── create_github_issue ─────────────────────────────────────────────────
const createGithubIssueTool: ToolSpec = {
  name: "create_github_issue",
  description:
    "Open a new GitHub issue for a fingerprint and persist the fingerprint→issue mapping in ops_issues. Fails if a mapping already exists (use comment_on_issue instead).",
  input_schema: {
    type: "object",
    properties: {
      title: {type: "string", minLength: 1, maxLength: 240},
      body: {type: "string", minLength: 1},
      labels: {type: "array", items: {type: "string"}},
      fingerprint: {type: "string", minLength: 1},
      source: {
        type: "string",
        enum: ["logs", "payments", "pwa_errors", "creator_errors", "quota"],
      },
      occurrenceCount: {type: "number", minimum: 0},
    },
    required: ["title", "body", "labels", "fingerprint", "source"],
  },
  async execute(runtime, input) {
    const {
      title,
      body,
      labels,
      fingerprint,
      source,
      occurrenceCount,
    } = input as {
      title: string;
      body: string;
      labels: string[];
      fingerprint: string;
      source: OpsIssueSource;
      occurrenceCount?: number;
    };
    const existing = await getOpsIssue(fingerprint);
    if (existing) {
      return {
        created: false,
        reason: "mapping already exists",
        fingerprint,
        issueNumber: existing.issueNumber,
        issueUrl: existing.issueUrl,
        state: existing.state,
      };
    }
    const issue = await runtime.github.createIssue({title, body, labels});
    await createOpsIssue({
      fingerprint,
      issueNumber: issue.number,
      issueUrl: issue.htmlUrl,
      source,
      occurrenceCount: occurrenceCount ?? 0,
    });
    return {
      created: true,
      fingerprint,
      issueNumber: issue.number,
      issueUrl: issue.htmlUrl,
      labels: issue.labels,
    };
  },
};

// ─── comment_on_issue ────────────────────────────────────────────────────
const commentOnIssueTool: ToolSpec = {
  name: "comment_on_issue",
  description:
    "Post a comment on a GitHub issue. Optionally marks the ops_issues mapping as resolved_pending_close when posting a resolution note.",
  input_schema: {
    type: "object",
    properties: {
      issueNumber: {type: "number", minimum: 1},
      body: {type: "string", minLength: 1},
      fingerprint: {type: "string"},
      markResolutionPending: {type: "boolean"},
      resolutionCommitSha: {type: "string"},
    },
    required: ["issueNumber", "body"],
  },
  async execute(runtime, input) {
    const {
      issueNumber,
      body,
      fingerprint,
      markResolutionPending,
      resolutionCommitSha,
    } = input as {
      issueNumber: number;
      body: string;
      fingerprint?: string;
      markResolutionPending?: boolean;
      resolutionCommitSha?: string;
    };
    const comment = await runtime.github.commentOnIssue(issueNumber, body);
    if (fingerprint && markResolutionPending) {
      await updateOpsIssue(fingerprint, {
        state: "resolved_pending_close",
        resolutionNoteAddedAt: admin.firestore.Timestamp.now(),
        ...(resolutionCommitSha ? {resolutionCommitSha} : {}),
      });
    }
    return {commented: true, htmlUrl: comment.htmlUrl};
  },
};

// ─── send_telegram ───────────────────────────────────────────────────────
const sendTelegramTool: ToolSpec = {
  name: "send_telegram",
  description:
    "Post a message to the wake_ops Telegram group, always into the #agent topic. Always prefix with the [wake-ops-agent] tag so history is parseable.",
  input_schema: {
    type: "object",
    properties: {text: {type: "string", minLength: 1, maxLength: 4000}},
    required: ["text"],
  },
  async execute(runtime, input) {
    const {text} = input as {text: string};
    const prefixed = text.startsWith("[") ? text : `[wake-ops-agent] ${text}`;
    await sendTo(runtime.telegram, "agent", prefixed);
    return {sent: true};
  },
};

// ─── list_open_issues ────────────────────────────────────────────────────
const listOpenIssuesTool: ToolSpec = {
  name: "list_open_ops_issues",
  description:
    "Read all open ops-agent-tracked issues from the ops_issues mapping, ordered by fingerprint. Useful to check what's already being worked on before opening a new issue.",
  input_schema: {type: "object", properties: {}},
  async execute() {
    const issues = await listOpenOpsIssues();
    return {
      count: issues.length,
      issues: issues.map((i) => ({
        fingerprint: i.fingerprint,
        issueNumber: i.issueNumber,
        issueUrl: i.issueUrl,
        source: i.source,
        state: i.state,
        occurrenceCount: i.occurrenceCount,
        firstOpened: i.firstOpened.toDate().toISOString(),
        lastOccurrence: i.lastOccurrence.toDate().toISOString(),
      })),
    };
  },
};

export const AGENT_TOOLS: ToolSpec[] = [
  readArchiveTool,
  getOpsStateTool,
  getClientErrorsTool,
  getRecentCommitsTool,
  findIssueByFingerprintTool,
  createGithubIssueTool,
  commentOnIssueTool,
  sendTelegramTool,
  listOpenIssuesTool,
];

export function toolDefinitionsForClaude(): Array<{
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}> {
  return AGENT_TOOLS.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.input_schema,
  }));
}

export async function runTool(
  runtime: AgentRuntime,
  name: string,
  input: unknown
): Promise<unknown> {
  const spec = AGENT_TOOLS.find((t) => t.name === name);
  if (!spec) throw new Error(`unknown tool: ${name}`);
  try {
    return await spec.execute(runtime, input);
  } catch (err) {
    functions.logger.error("agent tool error", {
      tool: name,
      error: err instanceof Error ? err.message : String(err),
    });
    return {
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
