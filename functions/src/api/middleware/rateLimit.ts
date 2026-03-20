import type { Request } from "express";
import * as admin from "firebase-admin";
import { WakeApiServerError } from "../errors.js";

const db = admin.firestore();

// TODO: Configure Firestore TTL policies on `rate_limit_windows` and
// `rate_limit_first_party` collections using the `expires_at` field.
// Without TTL, rate-limit documents accumulate indefinitely.
// See: https://firebase.google.com/docs/firestore/ttl

export async function checkRateLimit(
  id: string,
  limitRpm: number,
  collection: "rate_limit_windows" | "rate_limit_first_party" = "rate_limit_windows"
): Promise<void> {
  const now = Date.now();
  const windowMinute = Math.floor(now / 60_000);
  const docId = `${id}_${windowMinute}`;
  const docRef = db.collection(collection).doc(docId);

  const count = await db.runTransaction(async (tx) => {
    const snap = await tx.get(docRef);

    if (!snap.exists) {
      tx.set(docRef, {
        count: 1,
        expires_at: windowMinute + 2,
      });
      return 1;
    }

    const current = (snap.data()?.count as number) || 0;
    const newCount = current + 1;
    tx.update(docRef, { count: newCount });
    return newCount;
  });

  if (count > limitRpm) {
    const secondsRemaining = 60 - Math.floor((now % 60_000) / 1000);
    const err = new WakeApiServerError(
      "RATE_LIMITED",
      429,
      "Demasiadas solicitudes. Intenta en un momento."
    );
    err.retryAfter = secondsRemaining;
    throw err;
  }
}

/**
 * IP-based rate limiting for unauthenticated/public endpoints.
 * Uses req.ip (respects X-Forwarded-For behind proxies).
 */
export async function checkIpRateLimit(
  req: Request,
  limitRpm: number
): Promise<void> {
  const ip = req.ip || req.socket.remoteAddress || "unknown";
  // Sanitize IP for use as Firestore doc ID (replace dots/colons)
  const safeIp = ip.replace(/[.:]/g, "_");
  await checkRateLimit(`ip_${safeIp}`, limitRpm, "rate_limit_windows");
}

export async function checkDailyRateLimit(
  keyId: string,
  limitPerDay: number
): Promise<void> {
  const now = Date.now();
  const windowDay = Math.floor(now / 86_400_000);
  const docId = `${keyId}_day_${windowDay}`;
  const docRef = db.collection("rate_limit_windows").doc(docId);

  const count = await db.runTransaction(async (tx) => {
    const snap = await tx.get(docRef);

    if (!snap.exists) {
      tx.set(docRef, {
        count: 1,
        expires_at: windowDay + 2,
      });
      return 1;
    }

    const current = (snap.data()?.count as number) || 0;
    const newCount = current + 1;
    tx.update(docRef, { count: newCount });
    return newCount;
  });

  if (count > limitPerDay) {
    const msInDay = 86_400_000;
    const secondsRemaining = Math.ceil((msInDay - (now % msInDay)) / 1000);
    const err = new WakeApiServerError(
      "RATE_LIMITED",
      429,
      "Límite diario de solicitudes excedido. Intenta mañana."
    );
    err.retryAfter = secondsRemaining;
    throw err;
  }
}
