import type {Request, Response} from "express";
import * as functions from "firebase-functions";
import {commands} from "./commands.js";
import {sendTo, type TopicMap} from "./telegram.js";

const COMMAND_RE = /^\/(\w+)(?:@\w+)?(?:\s+.*)?$/;

export async function handleSignalsWebhook(
  req: Request,
  res: Response,
  opts: {
    botToken: string;
    allowedChatId: string;
    webhookSecret: string;
    projectId: string;
    topics?: TopicMap;
  }
): Promise<void> {
  const provided = (req.header("x-telegram-bot-api-secret-token") ?? "").trim();
  const expected = (opts.webhookSecret ?? "").trim();
  if (!expected || provided !== expected) {
    res.status(403).send("forbidden");
    return;
  }

  const update = (req.body ?? {}) as {message?: {text?: string; chat?: {id?: number}}};
  const message = update.message;

  if (!message?.text) {
    res.status(200).send("ok");
    return;
  }

  const incomingChatId = String(message.chat?.id ?? "");
  if (incomingChatId !== opts.allowedChatId) {
    functions.logger.warn("signalsWebhook: rejected chat", {incomingChatId});
    res.status(200).send("ok");
    return;
  }

  const match = COMMAND_RE.exec(message.text.trim());
  if (!match) {
    res.status(200).send("ok");
    return;
  }

  const commandName = match[1];
  const handler = commands[commandName];
  const ctx = {
    botToken: opts.botToken,
    chatId: opts.allowedChatId,
    topics: opts.topics,
    projectId: opts.projectId,
  };

  // Cloud Run Gen2 throttles CPU after the response is sent, so we run the
  // command to completion *before* replying to Telegram's webhook. The
  // webhook waits ~75s before retrying, which is well above our 10s/query
  // budgets.
  if (!handler) {
    await sendTo(
      ctx,
      "signals",
      `[signals_wake] unknown command: /${commandName}. Try /help.`
    ).catch(() => undefined);
    res.status(200).send("ok");
    return;
  }

  try {
    await sendTo(
      ctx,
      "signals",
      `[signals_wake] running /${commandName}...`
    );
    await handler.run(ctx);
  } catch (err) {
    functions.logger.error("signalsWebhook command failed", {
      commandName,
      err,
    });
    const errMsg = err instanceof Error ? err.message : String(err);
    await sendTo(
      ctx,
      "signals",
      `[signals_wake] /${commandName} failed: ${errMsg.slice(0, 500)}`
    ).catch(() => undefined);
  }

  res.status(200).send("ok");
}
