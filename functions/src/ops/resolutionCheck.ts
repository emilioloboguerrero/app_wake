// Deterministic resolution pre-pass for the synthesis cron.
//
// For each ops_issue in state=open: read the corresponding state doc,
// sum countsByDay over the last resolutionQuietHours. If the fingerprint
// has been quiet for the full window, comment on the issue and flip the
// mapping to resolved_pending_close. A human closes the issue.

import * as admin from "firebase-admin";
import * as functions from "firebase-functions";
import {GithubClient} from "./github.js";
import {
  listOpenOpsIssues,
  updateOpsIssue,
  type OpsIssue,
  type OpsIssueSource,
} from "./opsIssues.js";
import {ISSUE_THRESHOLDS} from "./agentConfig.js";

const STATE_COLLECTION_BY_SOURCE: Record<OpsIssueSource, string> = {
  logs: "ops_logs_state",
  payments: "ops_payments_state",
  quota: "ops_quota_state",
  pwa_errors: "ops_pwa_errors_state",
  creator_errors: "ops_creator_errors_state",
};

interface CountsByDay {
  [yyyyMmDd: string]: number;
}

function daysCoveringHours(hours: number): string[] {
  const out: string[] = [];
  const msPerDay = 86_400_000;
  const totalDays = Math.ceil(hours / 24) + 1;
  const now = Date.now();
  for (let i = 0; i < totalDays; i++) {
    const d = new Date(now - i * msPerDay);
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, "0");
    const day = String(d.getUTCDate()).padStart(2, "0");
    out.push(`${y}-${m}-${day}`);
  }
  return out;
}

async function hasBeenQuiet(issue: OpsIssue): Promise<boolean> {
  const coll = STATE_COLLECTION_BY_SOURCE[issue.source];
  if (!coll) return false;
  const db = admin.firestore();
  const snap = await db.collection(coll).doc(issue.fingerprint).get();
  if (!snap.exists) return true; // state doc gone — nothing seen recently
  const data = snap.data() as {
    lastSeen?: admin.firestore.Timestamp;
    countsByDay?: CountsByDay;
  };
  const cutoff = Date.now() - ISSUE_THRESHOLDS.resolutionQuietHours * 3_600_000;
  if (data.lastSeen && data.lastSeen.toMillis() >= cutoff) return false;
  const days = daysCoveringHours(ISSUE_THRESHOLDS.resolutionQuietHours);
  const counts = data.countsByDay ?? {};
  return days.every((d) => !counts[d] || counts[d] === 0);
}

export interface ResolutionPassResult {
  checked: number;
  resolvedCount: number;
  resolvedIssues: Array<{fingerprint: string; issueNumber: number}>;
}

export async function runResolutionPass(
  github: GithubClient
): Promise<ResolutionPassResult> {
  const open = await listOpenOpsIssues();
  const resolved: Array<{fingerprint: string; issueNumber: number}> = [];

  for (const issue of open) {
    try {
      const quiet = await hasBeenQuiet(issue);
      if (!quiet) continue;

      const hours = ISSUE_THRESHOLDS.resolutionQuietHours;
      const note =
        "Errors cleared — no occurrences in the last " +
        `${hours}h. Likely resolved. Feel free to close when satisfied. ` +
        "(ops-agent auto-note, autonomy: issue_only)";
      await github.commentOnIssue(issue.issueNumber, note);
      await updateOpsIssue(issue.fingerprint, {
        state: "resolved_pending_close",
        resolutionNoteAddedAt: admin.firestore.Timestamp.now(),
      });
      resolved.push({
        fingerprint: issue.fingerprint,
        issueNumber: issue.issueNumber,
      });
    } catch (err) {
      functions.logger.warn("resolution check failed for issue", {
        issueNumber: issue.issueNumber,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return {
    checked: open.length,
    resolvedCount: resolved.length,
    resolvedIssues: resolved,
  };
}
