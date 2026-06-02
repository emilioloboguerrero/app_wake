// Resolve coach attribution for cost telemetry. Used by analytics middleware
// to stamp every server event with `coachIds[]` and `primaryCoachId`.
//
// Multi-coach: a user with multiple one-on-one coaches gets all of them in
// `coachIds`. `primaryCoachId` is the first (most recent indexed result).
// In-memory cache per function instance, TTL 10 min — abundant for analytics.

import {db} from "../firestore.js";

export interface CoachInfo {
  coachIds: string[];
  primaryCoachId: string | null;
}

const cache = new Map<string, {info: CoachInfo; expiresAt: number}>();
const TTL_MS = 10 * 60 * 1000;
const MAX_CACHE = 500;

export async function resolveCoachAttribution(
  userId: string,
  role: "user" | "creator" | "admin"
): Promise<CoachInfo> {
  const cached = cache.get(userId);
  if (cached && Date.now() < cached.expiresAt) return cached.info;

  let info: CoachInfo;

  if (role === "creator" || role === "admin") {
    // A creator's activity rolls up to their own coach bucket.
    info = {coachIds: [userId], primaryCoachId: userId};
  } else {
    try {
      const snap = await db
        .collection("one_on_one_clients")
        .where("clientId", "==", userId)
        .limit(20)
        .get();
      const coachIds = Array.from(
        new Set(
          snap.docs
            .map((d) => d.data().creatorId as string | undefined)
            .filter((x): x is string => !!x)
        )
      );
      info = {
        coachIds,
        primaryCoachId: coachIds.length ? coachIds[0] : null,
      };
    } catch {
      info = {coachIds: [], primaryCoachId: null};
    }
  }

  if (cache.size >= MAX_CACHE) {
    const firstKey = cache.keys().next().value;
    if (firstKey) cache.delete(firstKey);
  }
  cache.set(userId, {info, expiresAt: Date.now() + TTL_MS});
  return info;
}
