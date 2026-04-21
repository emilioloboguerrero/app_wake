// Agent autonomy config and issue thresholds. One const flip to ramp
// autonomy. See docs/WAKE_OPS.md § "Autonomy model".

export type AgentAutonomy =
  | "issue_only"
  | "high_confidence_auto"
  | "full_auto";

export const AGENT_AUTONOMY: AgentAutonomy = "issue_only";

export const ISSUE_THRESHOLDS = {
  minOccurrencesForNew: 5,
  spikingMultiplier: 3,
  deployCorrelationWindowMinutes: 360, // 6h
  resolutionQuietHours: 72,
};

// Hard daily cost caps. Breaches post a Telegram message and skip the call.
export const AGENT_BUDGETS = {
  modeAMaxInputTokensPerDay: 20_000,
  modeBMaxMentionsPerDay: 50,
};

export interface AgentAssessment {
  confidence: "high" | "medium" | "low";
  correlatedDeploy: {sha: string; minutesAgo: number} | null;
  touchesSensitivePaths: boolean;
  firstSeenHoursAgo: number;
  occurrenceCount: number;
  fingerprint: string;
  wouldAutoMention: boolean;
  reason: string;
}

export function shouldAutoMention(a: AgentAssessment): boolean {
  if (AGENT_AUTONOMY === "issue_only") return false;
  if (AGENT_AUTONOMY === "full_auto") return true;
  return (
    a.confidence === "high" &&
    !!a.correlatedDeploy &&
    !a.touchesSensitivePaths
  );
}
