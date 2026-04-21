// Telegram webhook for @agent_wake.
//
// Phase 3B scope: archive every incoming message into ops_group_messages.
// Phase 3E will extend this to detect @agent_wake mentions and dispatch
// them to runAgent("mention", ...).
//
// Security: validates the x-telegram-bot-api-secret-token header against
// TELEGRAM_AGENT_WEBHOOK_SECRET and enforces the allowlisted chat id.

import type {Request, Response} from "express";
import * as functions from "firebase-functions";
import {
  archiveMessage,
  extractTag,
  resolveTopic,
} from "./messageArchive.js";
import type {TopicMap} from "./telegram.js";

interface TelegramFrom {
  id?: number;
  is_bot?: boolean;
  username?: string;
}

interface TelegramMessage {
  message_id?: number;
  message_thread_id?: number;
  text?: string;
  caption?: string;
  from?: TelegramFrom;
  chat?: {id?: number};
}

interface TelegramUpdate {
  message?: TelegramMessage;
  edited_message?: TelegramMessage;
  channel_post?: TelegramMessage;
}

export interface AgentWebhookOptions {
  webhookSecret: string;
  allowedChatId: string;
  topics?: TopicMap;
  // Optional hook fired after archival with the parsed message. Phase 3E
  // wires an @mention dispatcher here; Phase 3B leaves it undefined.
  onMessage?: (msg: TelegramMessage) => Promise<void>;
}

function pickMessage(update: TelegramUpdate): TelegramMessage | null {
  return update.message ?? update.edited_message ?? update.channel_post ?? null;
}

export async function handleAgentWebhook(
  req: Request,
  res: Response,
  opts: AgentWebhookOptions
): Promise<void> {
  const provided = (req.header("x-telegram-bot-api-secret-token") ?? "").trim();
  const expected = (opts.webhookSecret ?? "").trim();
  if (!expected || provided !== expected) {
    res.status(403).send("forbidden");
    return;
  }

  const update = (req.body ?? {}) as TelegramUpdate;
  const message = pickMessage(update);
  if (!message) {
    res.status(200).send("ok");
    return;
  }

  const incomingChatId = String(message.chat?.id ?? "");
  if (incomingChatId !== opts.allowedChatId) {
    functions.logger.warn("agentWebhook: rejected chat", {incomingChatId});
    res.status(200).send("ok");
    return;
  }

  const text = (message.text ?? message.caption ?? "").toString();
  const threadId =
    typeof message.message_thread_id === "number" ?
      message.message_thread_id :
      null;
  const from = message.from ?? {};
  await archiveMessage({
    text,
    chatId: incomingChatId,
    messageId:
      typeof message.message_id === "number" ? message.message_id : null,
    threadId,
    topic: resolveTopic(threadId, opts.topics),
    direction: "in",
    sender: {
      type: from.is_bot ? "bot" : "user",
      username: typeof from.username === "string" ? from.username : null,
      userId: typeof from.id === "number" ? from.id : null,
    },
    tag: extractTag(text),
  });

  if (opts.onMessage) {
    try {
      await opts.onMessage(message);
    } catch (err) {
      functions.logger.error("agentWebhook onMessage failed", {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  res.status(200).send("ok");
}
