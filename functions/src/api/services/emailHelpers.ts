/**
 * Shared email helpers — used by email routes, bookings, index.ts senders.
 */

import * as crypto from "node:crypto";
import { db } from "../firestore.js";

export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function generateUnsubscribeToken(email: string, creatorId: string): string {
  const payload = `${email}:${creatorId}`;
  return crypto.createHash("sha256").update(payload).digest("hex");
}

export function unsubscribeDocId(email: string, creatorId: string): string {
  return crypto.createHash("sha256").update(`${email}:${creatorId}`).digest("hex").slice(0, 40);
}

/**
 * Filter out unsubscribed emails from a recipient list.
 * Chunks into batches of 500 to respect Firestore getAll() limit.
 */
export async function filterUnsubscribed<T extends { email: string }>(
  recipients: T[],
  creatorId: string
): Promise<T[]> {
  if (recipients.length === 0) return [];

  const CHUNK_SIZE = 500;
  const unsubscribedSet = new Set<string>();

  for (let i = 0; i < recipients.length; i += CHUNK_SIZE) {
    const chunk = recipients.slice(i, i + CHUNK_SIZE);
    const refs = chunk.map((r) =>
      db.collection("email_unsubscribes").doc(unsubscribeDocId(r.email, creatorId))
    );
    const docs = await db.getAll(...refs);
    docs.forEach((doc, j) => {
      if (doc.exists) unsubscribedSet.add(chunk[j].email);
    });
  }

  return recipients.filter((r) => !unsubscribedSet.has(r.email));
}
