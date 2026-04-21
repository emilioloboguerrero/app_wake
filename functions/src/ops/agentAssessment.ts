// Compute an AgentAssessment for a notable fingerprint. Used by both
// synthesis (Mode A) and @mention handling (Mode B) when the agent is
// about to open or reference an issue.
//
// Inputs are plain-data so this module stays pure and unit-testable.

import type {GithubCommit} from "./github.js";
import {
  type AgentAssessment,
  ISSUE_THRESHOLDS,
  shouldAutoMention,
} from "./agentConfig.js";

export interface AssessmentInputs {
  fingerprint: string;
  firstSeenAt: Date | null;
  occurrenceCount: number;
  todayCount: number;
  sevenDayAvg: number;
  recentCommits: GithubCommit[];
  // Paths changed by recent commits (best-effort — may be empty if the
  // agent didn't fetch commit details). Used only for sensitive-path
  // flagging. The advisory flag is shown in Option 1 and acts as a hard
  // gate under high_confidence_auto+.
  changedPaths?: string[];
  sensitivePaths: string[];
}

function earliestCommitWithin(
  commits: GithubCommit[],
  withinMinutes: number
): GithubCommit | null {
  const cutoff = Date.now() - withinMinutes * 60_000;
  for (const c of commits) {
    const t = Date.parse(c.authorDate);
    if (!Number.isFinite(t)) continue;
    if (t >= cutoff) return c;
  }
  return null;
}

function scoreConfidence(i: AssessmentInputs, correlated: boolean): {
  confidence: "high" | "medium" | "low";
  reason: string;
} {
  const spike =
    i.sevenDayAvg > 0 ?
      i.todayCount / i.sevenDayAvg :
      i.todayCount > 0 ? Number.POSITIVE_INFINITY : 0;
  const hoursSinceFirst = i.firstSeenAt ?
    (Date.now() - i.firstSeenAt.getTime()) / 3_600_000 :
    0;

  // High: strong spike AND correlated deploy — classic regression shape
  if (correlated && spike >= 3 && i.todayCount >= 10) {
    return {
      confidence: "high",
      reason: "deploy-correlated spike with meaningful volume",
    };
  }
  // High: large absolute volume, recent introduction
  if (i.todayCount >= 50 && hoursSinceFirst <= 24) {
    return {
      confidence: "high",
      reason: "large new-today volume",
    };
  }
  // Medium: correlated deploy OR clear spike
  if (correlated || spike >= 3) {
    return {
      confidence: "medium",
      reason: correlated ?
        "deploy correlation without clear spike" :
        "spike without deploy correlation",
    };
  }
  // Medium: chronic recurrence with meaningful volume
  if (hoursSinceFirst > 24 && i.todayCount >= 20) {
    return {
      confidence: "medium",
      reason: "chronic recurrence with meaningful daily volume",
    };
  }
  return {
    confidence: "low",
    reason: "no strong signal (low volume, no correlation, no spike)",
  };
}

export function computeAssessment(i: AssessmentInputs): AgentAssessment {
  const correlatedCommit = earliestCommitWithin(
    i.recentCommits,
    ISSUE_THRESHOLDS.deployCorrelationWindowMinutes
  );
  const correlatedDeploy = correlatedCommit ?
    {
      sha: correlatedCommit.sha.slice(0, 7),
      minutesAgo: Math.max(
        0,
        Math.round(
          (Date.now() - Date.parse(correlatedCommit.authorDate)) / 60_000
        )
      ),
    } :
    null;

  const changedSet = new Set((i.changedPaths ?? []).map((p) => p.trim()));
  const touchesSensitivePaths = i.sensitivePaths.some((p) =>
    changedSet.has(p)
  );

  const firstSeenHoursAgo = i.firstSeenAt ?
    Math.max(0, (Date.now() - i.firstSeenAt.getTime()) / 3_600_000) :
    0;

  const {confidence, reason} = scoreConfidence(i, !!correlatedDeploy);

  const assessment: AgentAssessment = {
    confidence,
    correlatedDeploy,
    touchesSensitivePaths,
    firstSeenHoursAgo,
    occurrenceCount: i.occurrenceCount,
    fingerprint: i.fingerprint,
    wouldAutoMention: false, // set below
    reason,
  };
  assessment.wouldAutoMention = shouldAutoMention({
    ...assessment,
    // force evaluation under 'full_auto' to produce shadow stat value
    // regardless of current autonomy — computed via plain fn not flag.
  });
  return assessment;
}

export function formatAssessmentBlock(a: AgentAssessment): string {
  const lines = [
    `- Confidence: ${a.confidence}`,
    `- Deploy correlation: ${
      a.correlatedDeploy ?
        `yes (${a.correlatedDeploy.sha}, ${a.correlatedDeploy.minutesAgo}m ago)` :
        "no"
    }`,
    `- Sensitive paths touched: ${a.touchesSensitivePaths ? "yes" : "no"}`,
    `- **Would auto-@claude if full_auto: ${a.wouldAutoMention ? "YES" : "NO"}** — ${a.reason}`,
  ];
  return lines.join("\n");
}
