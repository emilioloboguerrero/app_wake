// Thin Telegram client + topic routing.
//
// The wake_ops supergroup has Forum Mode enabled with three topics:
//   - "agent"   — smart synthesis + @mention Q&A (Phase 3)
//   - "signals" — all dumb collector output
//   - "deploys" — postdeploy notifications
//
// Thread IDs are carried in the ChannelContext.topics map, sourced from
// the TELEGRAM_TOPICS secret (JSON). If the map is missing or a topic
// key is absent, posts fall back to the group root — safe default that
// matches the pre-forum behavior.

export type Topic = "agent" | "signals" | "deploys";

export interface TopicMap {
  agent?: number;
  signals?: number;
  deploys?: number;
}

export interface ChannelContext {
  botToken: string;
  chatId: string;
  topics?: TopicMap;
}

export function parseTopicMap(raw: string | undefined): TopicMap {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const out: TopicMap = {};
    for (const key of ["agent", "signals", "deploys"] as const) {
      const v = parsed[key];
      if (typeof v === "number" && Number.isFinite(v)) out[key] = v;
    }
    return out;
  } catch {
    return {};
  }
}

export async function sendTelegram(
  botToken: string,
  chatId: string,
  text: string,
  messageThreadId?: number
): Promise<void> {
  const body: Record<string, unknown> = {chat_id: chatId, text};
  if (messageThreadId) body.message_thread_id = messageThreadId;
  const res = await fetch(
    `https://api.telegram.org/bot${botToken}/sendMessage`,
    {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify(body),
    }
  );
  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`Telegram API ${res.status}: ${errBody}`);
  }
}

export async function sendTo(
  ctx: ChannelContext,
  topic: Topic,
  text: string
): Promise<void> {
  await sendTelegram(ctx.botToken, ctx.chatId, text, ctx.topics?.[topic]);
}
