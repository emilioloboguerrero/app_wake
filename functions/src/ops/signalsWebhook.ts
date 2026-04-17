import type {Request, Response} from "express";
import * as functions from "firebase-functions";
import {commands} from "./commands.js";
import {sendTelegram} from "./telegram.js";

const COMMAND_RE = /^\/(\w+)(?:@\w+)?(?:\s+.*)?$/;

export async function handleSignalsWebhook(
  req: Request,
  res: Response,
  opts: {
    botToken: string;
    allowedChatId: string;
    webhookSecret: string;
    projectId: string;
  }
): Promise<void> {
  const provided = req.header("x-telegram-bot-api-secret-token");
  if (provided !== opts.webhookSecret) {
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
  const botToken = opts.botToken;
  const chatId = opts.allowedChatId;

  res.status(200).send("ok");

  if (!handler) {
    await sendTelegram(
      botToken,
      chatId,
      `[signals_wake] unknown command: /${commandName}. Try /help.`
    ).catch(() => undefined);
    return;
  }

  try {
    await sendTelegram(
      botToken,
      chatId,
      `[signals_wake] running /${commandName}...`
    );
    await handler.run({
      botToken,
      chatId,
      projectId: opts.projectId,
    });
  } catch (err) {
    functions.logger.error("signalsWebhook command failed", {
      commandName,
      err,
    });
    const errMsg = err instanceof Error ? err.message : String(err);
    await sendTelegram(
      botToken,
      chatId,
      `[signals_wake] /${commandName} failed: ${errMsg.slice(0, 500)}`
    ).catch(() => undefined);
  }
}
