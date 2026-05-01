/**
 * Shared email helpers — used by email routes, bookings, index.ts senders.
 */

import * as crypto from "node:crypto";
import {db} from "../firestore.js";

export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * F-FUNCS-20: HMAC-SHA-256 over `email:creatorId` with a server-side secret.
 *
 * Previously the token was an unkeyed SHA-256 over the same payload, so any
 * attacker who knew an email + creatorId pair could regenerate the token
 * (both values are non-secret; the email is in every email header). HMAC
 * binds the token to a server secret only the function process holds.
 *
 * The secret is read from UNSUBSCRIBE_SECRET (Firebase Secret Manager) and
 * cached for the function lifetime. In emulator / development we accept a
 * test default so the suite runs without secrets configured. Verification
 * uses crypto.timingSafeEqual.
 */
function unsubscribeSecret(): string {
  const secret = process.env.UNSUBSCRIBE_SECRET;
  if (secret && secret.length >= 16) return secret;
  if (process.env.FUNCTIONS_EMULATOR === "true") {
    return "wake-emulator-only-do-not-use-in-prod";
  }
  // Refusing to mint or verify a token in prod without the secret is
  // safer than silently degrading to the previous unkeyed scheme.
  throw new Error("UNSUBSCRIBE_SECRET not configured");
}

export function generateUnsubscribeToken(email: string, creatorId: string): string {
  const secret = unsubscribeSecret();
  return crypto.createHmac("sha256", secret).update(`${email}:${creatorId}`).digest("hex");
}

export function verifyUnsubscribeToken(
  token: string,
  email: string,
  creatorId: string
): boolean {
  if (typeof token !== "string" || token.length !== 64) return false;
  let expected: string;
  try {
    expected = generateUnsubscribeToken(email, creatorId);
  } catch {
    return false;
  }
  const a = Buffer.from(token, "hex");
  const b = Buffer.from(expected, "hex");
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export function unsubscribeDocId(email: string, creatorId: string): string {
  return crypto.createHash("sha256").update(`${email}:${creatorId}`).digest("hex").slice(0, 40);
}

/**
 * F-NEW-02: system-wide daily email budget.
 *
 * Decremented in a transaction before every Resend send across F-FUNCS-17
 * (event confirmations), F-FUNCS-04 (subscription receipts), F-API2-07
 * (creator broadcast batches), F-API2-09 (creator broadcast resolver),
 * and F-API2-16 (booking emails). Hard-stops at the daily ceiling pinned
 * in docs/SECURITY_FIX_DECISIONS.md §4 (5,000/day).
 *
 * Counter doc id is YYYYMMDD (UTC). Caller specifies `count` to reserve
 * (always positive). On budget exhaustion, throws so the caller can fail
 * the send and surface to telemetry — never silently drop.
 */
const EMAIL_DAILY_CEILING = 5000;

function todayKey(): string {
  const d = new Date();
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}${m}${day}`;
}

export class EmailBudgetExhaustedError extends Error {
  constructor(public readonly day: string, public readonly remaining: number) {
    super(`Email budget exhausted for ${day} (remaining ${remaining})`);
    this.name = "EmailBudgetExhaustedError";
  }
}

export async function reserveEmailBudget(count: number): Promise<void> {
  if (!Number.isInteger(count) || count <= 0) return;
  const day = todayKey();
  const ref = db.collection("system_email_budget").doc(day);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const used = (snap.exists ? (snap.data()?.sent_count as number | undefined) : 0) ?? 0;
    if (used + count > EMAIL_DAILY_CEILING) {
      throw new EmailBudgetExhaustedError(day, Math.max(0, EMAIL_DAILY_CEILING - used));
    }
    if (snap.exists) {
      tx.update(ref, {sent_count: used + count, updated_at: new Date().toISOString()});
    } else {
      tx.set(ref, {
        sent_count: count,
        ceiling: EMAIL_DAILY_CEILING,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
    }
  });
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
