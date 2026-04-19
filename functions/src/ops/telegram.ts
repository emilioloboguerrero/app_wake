// Thin Telegram client + channel routing.
//
// Channels:
//   - "digest" (default): synthesized summaries — the current wake_ops group.
//   - "raw": firehose / per-event posts — a separate group when
//     TELEGRAM_RAW_CHAT_ID is configured, otherwise falls back to "digest".
//
// All collectors post to "digest" today. The split exists so a future
// raw-firehose collector can be added without re-plumbing every caller.

export type Channel = "digest" | "raw";

export interface ChannelContext {
  botToken: string;
  chatId: string; // digest chat id (default)
  rawChatId?: string; // optional — if unset, raw messages route to chatId
}

export function resolveChatId(
  ctx: {chatId: string; rawChatId?: string},
  channel: Channel = "digest"
): string {
  if (channel === "raw" && ctx.rawChatId) return ctx.rawChatId;
  return ctx.chatId;
}

export async function sendTelegram(
  botToken: string,
  chatId: string,
  text: string
): Promise<void> {
  const res = await fetch(
    `https://api.telegram.org/bot${botToken}/sendMessage`,
    {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({chat_id: chatId, text}),
    }
  );
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Telegram API ${res.status}: ${body}`);
  }
}

// Convenience helper: send to a named channel, falling back to digest
// when the raw channel isn't configured.
export async function sendTo(
  ctx: ChannelContext,
  channel: Channel,
  text: string
): Promise<void> {
  const chat = resolveChatId(ctx, channel);
  await sendTelegram(ctx.botToken, chat, text);
}
