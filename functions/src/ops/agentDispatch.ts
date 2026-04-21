// Mention dispatcher — the bridge between the Telegram webhook and the
// Claude tool-calling loop. Handles pause flag, dedupe, daily caps, and
// posts the final reply back to the #agent topic.

import * as functions from "firebase-functions";
import {GithubClient} from "./github.js";
import {runAgent} from "./agent.js";
import {sendTo, type ChannelContext, type TopicMap} from "./telegram.js";
import {
  isAgentPaused,
  markMentionProcessed,
  recordAgentUsage,
  tryConsumeMention,
} from "./agentState.js";
import {AGENT_BUDGETS} from "./agentConfig.js";

export interface MentionDispatchOptions {
  message: {
    message_id?: number;
    text?: string;
    caption?: string;
    from?: {id?: number; is_bot?: boolean; username?: string};
    chat?: {id?: number};
  };
  agentBotUsername: string; // e.g. "agent_wake_bot"
  agentBotToken: string;
  chatId: string;
  topics: TopicMap;
  anthropicApiKey: string;
  githubToken: string;
  githubOwner: string;
  githubRepo: string;
}

function containsMention(text: string, botUsername: string): boolean {
  const lower = text.toLowerCase();
  const uname = botUsername.toLowerCase();
  return (
    lower.includes(`@${uname}`) ||
    // Some clients strip the _bot suffix in display; accept both.
    lower.includes(`@${uname.replace(/_bot$/, "")}`)
  );
}

export async function dispatchMention(
  opts: MentionDispatchOptions
): Promise<void> {
  const text = (opts.message.text ?? opts.message.caption ?? "").toString();
  if (!text) return;
  if (!containsMention(text, opts.agentBotUsername)) return;

  // Ignore messages from bots (including our own) to avoid feedback loops.
  if (opts.message.from?.is_bot) return;

  const messageId = opts.message.message_id;
  if (typeof messageId !== "number") return;

  const telegram: ChannelContext = {
    botToken: opts.agentBotToken,
    chatId: opts.chatId,
    topics: opts.topics,
    botUsername: opts.agentBotUsername,
    botRole: "agent",
  };

  // Dedupe: Telegram may retry the webhook if our response is slow.
  const {firstTime} = await markMentionProcessed(opts.chatId, messageId);
  if (!firstTime) {
    functions.logger.info("mention already processed", {messageId});
    return;
  }

  if (await isAgentPaused()) {
    await sendTo(
      telegram,
      "agent",
      "[wake-ops-agent] paused (ops_agent_state/pause). Resume with /agent_resume to @signals_wake."
    ).catch(() => undefined);
    return;
  }

  const budget = await tryConsumeMention(AGENT_BUDGETS.modeBMaxMentionsPerDay);
  if (!budget.allowed) {
    await sendTo(
      telegram,
      "agent",
      `[wake-ops-agent] daily @mention cap reached (${budget.used}/${budget.limit}). Resets UTC midnight.`
    ).catch(() => undefined);
    return;
  }

  try {
    const runtime = {
      github: new GithubClient({
        token: opts.githubToken,
        owner: opts.githubOwner,
        repo: opts.githubRepo,
      }),
      telegram,
    };

    // Strip the @mention from the user text so the model sees just the ask.
    const stripped = text
      .replace(new RegExp(`@${opts.agentBotUsername}\\b`, "gi"), "")
      .replace(
        new RegExp(`@${opts.agentBotUsername.replace(/_bot$/, "")}\\b`, "gi"),
        ""
      )
      .trim();

    const result = await runAgent({
      mode: "mention",
      input: stripped || text,
      runtime,
      anthropicApiKey: opts.anthropicApiKey,
    });

    await recordAgentUsage(
      "mention",
      result.inputTokens,
      result.outputTokens
    );

    if (result.finalText.trim().length > 0) {
      const prefixed = result.finalText.startsWith("[") ?
        result.finalText :
        `[wake-ops-agent] ${result.finalText}`;
      await sendTo(telegram, "agent", prefixed.slice(0, 4000));
    }
  } catch (err) {
    functions.logger.error("agent mention dispatch failed", {
      error: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
    });
    await sendTo(
      telegram,
      "agent",
      `[wake-ops-agent] error: ${
        err instanceof Error ? err.message : String(err)
      }`.slice(0, 500)
    ).catch(() => undefined);
  }
}
