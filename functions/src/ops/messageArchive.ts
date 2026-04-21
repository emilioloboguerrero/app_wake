// Persistent archive of every message in the wake_ops Telegram group.
//
// Two write paths:
//   1. Outgoing: sendTo() in telegram.ts mirrors every message we post.
//   2. Incoming: wakeAgentWebhook archives every update it receives.
//
// Agent reads via readArchive(hours, filter?) to build context for both
// synthesis and @mention Q&A. 14-day TTL enforced via Firestore policy on
// the expiresAt field.
//
// Doc IDs are deterministic for incoming messages (chat_id + message_id)
// so Telegram webhook retries naturally dedupe. Outgoing messages use the
// same scheme when the Telegram sendMessage response surfaces the message
// id; if the response failed to parse we fall back to an auto-id (the
// message still landed in Telegram, archival is best-effort).

import * as admin from "firebase-admin";
import * as functions from "firebase-functions";
import type {Topic, TopicMap} from "./telegram.js";

const COLLECTION = "ops_group_messages";
const TTL_DAYS = 14;
const MAX_TEXT_BYTES = 8 * 1024;

export type Direction = "in" | "out";

export interface ArchiveSender {
  type: "bot" | "user";
  username: string | null;
  userId: number | null;
}

export interface ArchiveEntry {
  text: string;
  chatId: string;
  messageId: number | null;
  threadId: number | null;
  topic: Topic | null;
  direction: Direction;
  sender: ArchiveSender;
  tag: string | null;
}

export interface ArchivedMessage extends ArchiveEntry {
  receivedAt: admin.firestore.Timestamp;
  expiresAt: admin.firestore.Timestamp;
}

const TAG_RE = /^\s*\[([a-z0-9_-]+)\]/i;

export function extractTag(text: string): string | null {
  const m = TAG_RE.exec(text);
  return m ? m[1].toLowerCase() : null;
}

export function resolveTopic(
  threadId: number | null | undefined,
  topics: TopicMap | undefined
): Topic | null {
  if (!threadId || !topics) return null;
  for (const key of ["agent", "signals", "deploys"] as const) {
    if (topics[key] === threadId) return key;
  }
  return null;
}

function truncate(text: string): string {
  if (Buffer.byteLength(text, "utf8") <= MAX_TEXT_BYTES) return text;
  const buf = Buffer.from(text, "utf8").subarray(0, MAX_TEXT_BYTES);
  return buf.toString("utf8");
}

function docIdFor(entry: ArchiveEntry): string | null {
  if (!entry.messageId) return null;
  return `${entry.chatId}_${entry.messageId}`;
}

export async function archiveMessage(entry: ArchiveEntry): Promise<void> {
  try {
    const db = admin.firestore();
    const now = admin.firestore.Timestamp.now();
    const expiresAt = admin.firestore.Timestamp.fromMillis(
      Date.now() + TTL_DAYS * 86_400_000
    );
    const doc: ArchivedMessage = {
      ...entry,
      text: truncate(entry.text ?? ""),
      tag: entry.tag ?? extractTag(entry.text ?? ""),
      receivedAt: now,
      expiresAt,
    };
    const id = docIdFor(entry);
    const ref = id ?
      db.collection(COLLECTION).doc(id) :
      db.collection(COLLECTION).doc();
    await ref.set(doc, {merge: true});
  } catch (err) {
    functions.logger.warn("archiveMessage failed", {
      error: err instanceof Error ? err.message : String(err),
      direction: entry.direction,
      messageId: entry.messageId,
    });
  }
}

export interface ReadArchiveFilter {
  topic?: Topic;
  direction?: Direction;
  tag?: string;
  limit?: number;
}

export interface ArchiveRecord extends ArchiveEntry {
  receivedAt: Date;
}

export async function readArchive(
  hours: number,
  filter: ReadArchiveFilter = {}
): Promise<ArchiveRecord[]> {
  const db = admin.firestore();
  const cutoff = admin.firestore.Timestamp.fromMillis(
    Date.now() - hours * 3_600_000
  );
  const limit = Math.min(Math.max(filter.limit ?? 200, 1), 500);
  const snap = await db
    .collection(COLLECTION)
    .where("receivedAt", ">=", cutoff)
    .orderBy("receivedAt", "desc")
    .limit(limit)
    .get();
  const records: ArchiveRecord[] = [];
  for (const doc of snap.docs) {
    const d = doc.data() as ArchivedMessage;
    if (filter.topic && d.topic !== filter.topic) continue;
    if (filter.direction && d.direction !== filter.direction) continue;
    if (filter.tag && d.tag !== filter.tag) continue;
    records.push({
      text: d.text,
      chatId: d.chatId,
      messageId: d.messageId,
      threadId: d.threadId,
      topic: d.topic,
      direction: d.direction,
      sender: d.sender,
      tag: d.tag,
      receivedAt: d.receivedAt.toDate(),
    });
  }
  return records;
}
