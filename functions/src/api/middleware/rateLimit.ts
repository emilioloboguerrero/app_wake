import * as admin from "firebase-admin";
import { WakeApiServerError } from "../errors.js";

const db = admin.firestore();

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
    (err as WakeApiServerError & { retryAfter: number }).retryAfter =
      secondsRemaining;
    throw err;
  }
}
