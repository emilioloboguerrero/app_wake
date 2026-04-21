import * as functions from "firebase-functions";
import {PreApproval} from "mercadopago";
import {db, FieldValue} from "../firestore.js";
import {WakeApiServerError} from "../errors.js";
import {getClient} from "./paymentHelpers.js";

export type LeaveReason =
  | "no_time"
  | "too_expensive"
  | "not_working"
  | "creator_mismatch"
  | "goals_changed"
  | "other";

export const LEAVE_REASONS: ReadonlyArray<LeaveReason> = [
  "no_time", "too_expensive", "not_working", "creator_mismatch", "goals_changed", "other",
];

export interface LeaveCascadeResult {
  cascade: {
    subscription: "cancelled" | "none" | "failed";
    nutritionAssignments: number;
    bookingsCancelled: number;
    oneOnOneClientFlipped: boolean;
  };
  endedAt: string;
}

/**
 * Look up an active MP subscription for a (user, course) pair, if any.
 * Returns the subscription doc id ("preapprovalId") or null.
 */
async function findActiveSubscription(userId: string, courseId: string): Promise<string | null> {
  // Users typically have a handful of subscriptions total; filter status in memory
  // to avoid requiring a (course_id, status) composite index on a subcollection.
  const snap = await db
    .collection("users").doc(userId)
    .collection("subscriptions")
    .where("course_id", "==", courseId)
    .get();

  for (const doc of snap.docs) {
    const s = (doc.data().status as string | undefined) ?? "";
    if (s === "authorized" || s === "pending") return doc.id;
  }
  return null;
}

/**
 * Cancel a MercadoPago subscription. Used both by the user-facing
 * /payments/subscriptions/:id/cancel endpoint and by the leave cascade.
 *
 * Best-effort: returns "failed" without throwing so the cascade can
 * complete the rest of its work. Caller logs.
 */
export async function cancelMpSubscription(
  userId: string,
  subscriptionId: string
): Promise<"cancelled" | "failed"> {
  const subscriptionRef = db
    .collection("users").doc(userId)
    .collection("subscriptions").doc(subscriptionId);

  try {
    const token = process.env.MERCADOPAGO_ACCESS_TOKEN;
    if (token) {
      const client = getClient(token);
      const preapproval = new PreApproval(client);
      await preapproval.update({id: subscriptionId, body: {status: "cancelled"}});
    }

    await subscriptionRef.set({
      status: "cancelled",
      last_action: "cancel",
      cancelled_at: FieldValue.serverTimestamp(),
      updated_at: FieldValue.serverTimestamp(),
    }, {merge: true});

    return "cancelled";
  } catch (err) {
    functions.logger.error("cancelMpSubscription failed", {
      userId, subscriptionId, error: String(err),
    });
    return "failed";
  }
}

/**
 * Free a previously-booked slot in creator_availability.
 * Best-effort, fire-and-forget pattern (matches existing bookings.ts helper).
 */
function freeSlot(creatorId: string, slotStartUtc: string, slotEndUtc: string): void {
  const slotDate = slotStartUtc.substring(0, 10);
  const availRef = db.collection("creator_availability").doc(creatorId);

  availRef.get().then((availDoc) => {
    if (!availDoc.exists) return;
    const days = (availDoc.data()?.days ?? {}) as Record<string, { slots?: Array<Record<string, unknown>> }>;
    const dayData = days[slotDate];
    if (!dayData?.slots) return;
    const slot = dayData.slots.find((s) => {
      const start = (s.startUtc ?? s.startLocal) as string | undefined;
      const end = (s.endUtc ?? s.endLocal) as string | undefined;
      return start === slotStartUtc && end === slotEndUtc;
    });
    if (slot) {
      slot.booked = false;
      availRef.update({
        [`days.${slotDate}`]: dayData,
        updated_at: FieldValue.serverTimestamp(),
      }).catch((e) => functions.logger.error("freeSlot update failed", {error: String(e)}));
    }
  }).catch((e) => functions.logger.error("freeSlot get failed", {error: String(e)}));
}

/**
 * Find the user's active one-on-one enrollment, if any.
 * Returns { courseId, creatorId } or null.
 *
 * Used by the library filter and the rival-purchase guard.
 */
export async function getActiveOneOnOneLock(
  userId: string
): Promise<{ courseId: string; creatorId: string } | null> {
  const userDoc = await db.collection("users").doc(userId).get();
  if (!userDoc.exists) return null;

  const courses = (userDoc.data()?.courses ?? {}) as Record<string, Record<string, unknown>>;
  const now = new Date();

  for (const [courseId, entry] of Object.entries(courses)) {
    if (entry.deliveryType !== "one_on_one") continue;
    if (entry.status !== "active") continue;
    const expiresAt = entry.expires_at as string | undefined;
    if (expiresAt && new Date(expiresAt) <= now) continue;

    const courseDoc = await db.collection("courses").doc(courseId).get();
    if (!courseDoc.exists) continue;
    const creatorId = courseDoc.data()?.creator_id as string | undefined;
    if (!creatorId) continue;

    return {courseId, creatorId};
  }

  return null;
}

/**
 * Cascade: end a user's one-on-one program enrollment.
 *
 * Order:
 *   1. Validate the enrollment exists, is active, and is one_on_one
 *   2. Write program_leave_feedback (cheap, kept even on partial failure)
 *   3. Batched write — users.courses[courseId], one_on_one_clients,
 *      nutrition_assignments, call_bookings
 *   4. Free booking slots back to creator_availability (best-effort)
 *   5. Cancel MP subscription if active (best-effort)
 *
 * Idempotent: if the enrollment is already ended-by-user, returns success
 * without re-running the cascade.
 */
export async function leaveOneOnOneEnrollment(params: {
  userId: string;
  courseId: string;
  reason: LeaveReason;
  satisfaction: number | null;
  freeText: string | null;
}): Promise<LeaveCascadeResult> {
  const {userId, courseId, reason, satisfaction, freeText} = params;

  // 1. Read user + course state
  const userRef = db.collection("users").doc(userId);
  const userDoc = await userRef.get();
  if (!userDoc.exists) {
    throw new WakeApiServerError("NOT_FOUND", 404, "Usuario no encontrado");
  }

  const courses = (userDoc.data()?.courses ?? {}) as Record<string, Record<string, unknown>>;
  const enrollment = courses[courseId];
  if (!enrollment) {
    throw new WakeApiServerError("NOT_FOUND", 404, "No estás inscrito en este programa");
  }

  // Idempotency: already ended-by-user
  if (enrollment.status === "expired" && enrollment.endedByUser === true) {
    return {
      cascade: {
        subscription: "none",
        nutritionAssignments: 0,
        bookingsCancelled: 0,
        oneOnOneClientFlipped: false,
      },
      endedAt: (enrollment.endedAt as string) ?? new Date().toISOString(),
    };
  }

  if (enrollment.deliveryType !== "one_on_one") {
    throw new WakeApiServerError(
      "CONFLICT", 409,
      "Este programa no es uno-a-uno. Cancela tu suscripción si es de pago recurrente."
    );
  }

  if (enrollment.status !== "active") {
    throw new WakeApiServerError(
      "CONFLICT", 409,
      "Solo puedes terminar programas activos"
    );
  }

  // Resolve creatorId from the course doc (source of truth)
  const courseDoc = await db.collection("courses").doc(courseId).get();
  const creatorId = courseDoc.exists
    ? (courseDoc.data()?.creator_id as string | undefined)
    : (enrollment.creator_id as string | undefined);

  // creatorId may be undefined if the course was deleted — we still allow leaving
  const nowIso = new Date().toISOString();

  const expiresAt = enrollment.expires_at as string | undefined;
  const remainingDays = expiresAt
    ? Math.max(0, Math.ceil((new Date(expiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
    : null;

  // 2. Pre-find an active subscription before opening the batch
  const subscriptionId = await findActiveSubscription(userId, courseId);

  // 3. Pre-query everything that needs to be touched in the batch
  const [oneOnOneClientSnap, nutritionSnap, bookingsSnap] = await Promise.all([
    creatorId
      ? db.collection("one_on_one_clients")
        .where("creatorId", "==", creatorId)
        .where("clientUserId", "==", userId)
        .limit(1)
        .get()
      : Promise.resolve(null),
    // Uses existing (userId, assignedBy, createdAt DESC) index; status filtered in memory.
    creatorId
      ? db.collection("nutrition_assignments")
        .where("userId", "==", userId)
        .where("assignedBy", "==", creatorId)
        .get()
      : Promise.resolve(null),
    // Uses the existing (creatorId, slotStartUtc) index; we filter by
    // clientUserId + future in memory to avoid requiring a 3-field composite.
    creatorId
      ? db.collection("call_bookings")
        .where("creatorId", "==", creatorId)
        .where("slotStartUtc", ">", nowIso)
        .get()
      : Promise.resolve(null),
  ]);

  // 4. Write feedback first (kept even if rest of cascade fails)
  await db.collection("program_leave_feedback").add({
    userId,
    creatorId: creatorId ?? null,
    courseId,
    leftAt: FieldValue.serverTimestamp(),
    reason,
    satisfaction,
    freeText: freeText ? freeText.slice(0, 1000) : null,
    subscriptionWasActive: !!subscriptionId,
    remainingDays,
  });

  // 5. Cascade batch
  const batch = db.batch();

  batch.update(userRef, {
    [`courses.${courseId}.status`]: "expired",
    [`courses.${courseId}.expires_at`]: nowIso,
    [`courses.${courseId}.endedByUser`]: true,
    [`courses.${courseId}.endedAt`]: nowIso,
  });

  let oneOnOneFlipped = false;
  if (oneOnOneClientSnap && !oneOnOneClientSnap.empty) {
    const docRef = oneOnOneClientSnap.docs[0].ref;
    batch.update(docRef, {
      status: "inactive",
      endedAt: FieldValue.serverTimestamp(),
      endedReason: reason,
      updatedAt: FieldValue.serverTimestamp(),
    });
    oneOnOneFlipped = true;
  }

  let nutritionCount = 0;
  if (nutritionSnap) {
    for (const doc of nutritionSnap.docs) {
      const s = (doc.data().status as string | undefined) ?? "active";
      if (s !== "active") continue;
      batch.update(doc.ref, {
        status: "inactive",
        endedAt: FieldValue.serverTimestamp(),
        endedReason: "client_left",
        updatedAt: FieldValue.serverTimestamp(),
      });
      nutritionCount++;
    }
  }

  const bookingsToFree: Array<{ slotStartUtc: string; slotEndUtc: string }> = [];
  let bookingsCount = 0;
  if (bookingsSnap) {
    for (const doc of bookingsSnap.docs) {
      const data = doc.data();
      if (data.clientUserId !== userId) continue;
      if (data.status !== "scheduled" && data.status !== "confirmed") continue;

      batch.update(doc.ref, {
        status: "cancelled",
        cancelledAt: nowIso,
        cancelledReason: "client_left_program",
      });
      bookingsToFree.push({
        slotStartUtc: data.slotStartUtc as string,
        slotEndUtc: data.slotEndUtc as string,
      });
      bookingsCount++;
    }
  }

  await batch.commit();

  // 6. Free slots (best-effort, fire-and-forget)
  if (creatorId) {
    for (const {slotStartUtc, slotEndUtc} of bookingsToFree) {
      freeSlot(creatorId, slotStartUtc, slotEndUtc);
    }
  }

  // 7. Cancel MP subscription if any (best-effort)
  let subscriptionResult: "cancelled" | "none" | "failed" = "none";
  if (subscriptionId) {
    subscriptionResult = await cancelMpSubscription(userId, subscriptionId);
  }

  return {
    cascade: {
      subscription: subscriptionResult,
      nutritionAssignments: nutritionCount,
      bookingsCancelled: bookingsCount,
      oneOnOneClientFlipped: oneOnOneFlipped,
    },
    endedAt: nowIso,
  };
}
