// Mode A — daily synthesis orchestrator. Called from the
// wakeAgentSynthesisCron scheduled function.
//
// Flow:
// 1. Check pause flag. If paused, skip silently.
// 2. Check synthesis input-token budget. If exceeded, post a Telegram
//    notice and skip.
// 3. Run the deterministic resolution pre-pass (close-out notes for
//    fingerprints that have been quiet for resolutionQuietHours).
// 4. Run the agent in synthesis mode. The prompt tells it to post
//    "[wake-ops-agent] all quiet." if nothing notable, otherwise a
//    concise synthesis message.
// 5. Append a shadow-stats footer before sending.

import * as functions from "firebase-functions";
import {GithubClient} from "./github.js";
import {runAgent} from "./agent.js";
import {sendTo, type ChannelContext, type TopicMap} from "./telegram.js";
import {runResolutionPass} from "./resolutionCheck.js";
import {
  checkSynthesisInputBudget,
  isAgentPaused,
  recordAgentUsage,
} from "./agentState.js";
import {AGENT_AUTONOMY, AGENT_BUDGETS} from "./agentConfig.js";

export interface SynthesisOptions {
  agentBotUsername: string;
  agentBotToken: string;
  chatId: string;
  topics: TopicMap;
  anthropicApiKey: string;
  githubToken: string;
  githubOwner: string;
  githubRepo: string;
}

function shadowFooter(issuesOpenedToday: number, wouldAutoCount: number): string {
  return (
    `— Issues opened today: ${issuesOpenedToday}` +
    ` · Would have auto-@claude'd (shadow): ${wouldAutoCount}` +
    ` · Autonomy: ${AGENT_AUTONOMY}`
  );
}

export async function runSynthesis(opts: SynthesisOptions): Promise<void> {
  const telegram: ChannelContext = {
    botToken: opts.agentBotToken,
    chatId: opts.chatId,
    topics: opts.topics,
    botUsername: opts.agentBotUsername,
    botRole: "agent",
  };

  if (await isAgentPaused()) {
    functions.logger.info("synthesis skipped — agent paused");
    return;
  }

  const budget = await checkSynthesisInputBudget(
    AGENT_BUDGETS.modeAMaxInputTokensPerDay
  );
  if (!budget.allowed) {
    await sendTo(
      telegram,
      "agent",
      `[wake-ops-agent] synthesis skipped — input token budget exhausted (${budget.used}/${budget.limit}).`
    ).catch(() => undefined);
    return;
  }

  const github = new GithubClient({
    token: opts.githubToken,
    owner: opts.githubOwner,
    repo: opts.githubRepo,
  });

  const resolution = await runResolutionPass(github);

  const runtime = {github, telegram};
  try {
    const result = await runAgent({
      mode: "synthesis",
      input: "",
      runtime,
      anthropicApiKey: opts.anthropicApiKey,
      maxInputTokens: AGENT_BUDGETS.modeAMaxInputTokensPerDay - budget.used,
    });

    await recordAgentUsage(
      "synthesis",
      result.inputTokens,
      result.outputTokens
    );

    const issuesOpened = result.toolCalls.filter(
      (c) => c.name === "create_github_issue"
    ).length;
    // Shadow-stat count for the "would have auto-@claude'd" column lives
    // in the computed assessment objects the agent produced. In Phase 3G
    // we don't parse these back out of tool inputs — the agent includes
    // its own count in the message. The footer we add reports the
    // deterministic numbers (issues opened, resolution notes).
    const footer = shadowFooter(issuesOpened, 0);

    let text = result.finalText.trim();
    if (!text) {
      text = "all quiet.";
    }
    const prefixed = text.startsWith("[") ? text : `[wake-ops-agent] ${text}`;
    const suffix =
      resolution.resolvedCount > 0 ?
        `\nResolution notes posted: ${resolution.resolvedCount}` :
        "";
    const body = `${prefixed}${suffix}\n${footer}`.slice(0, 4000);
    await sendTo(telegram, "agent", body);
  } catch (err) {
    functions.logger.error("synthesis failed", {
      error: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
    });
    await sendTo(
      telegram,
      "agent",
      `[wake-ops-agent] synthesis error: ${
        err instanceof Error ? err.message : String(err)
      }`.slice(0, 500)
    ).catch(() => undefined);
  }
}
