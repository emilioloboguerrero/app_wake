import {db, FieldValue} from "../firestore.js";
import {calculateExpirationDate} from "./paymentHelpers.js";

export interface AssignBundleOptions {
  userId: string;
  bundleId: string;
  accessDuration: string;
  paymentId: string;
  subscriptionId?: string | null;
  isRenewal: boolean;
}

export interface AssignBundleResult {
  courseIdsGranted: string[];
  courseIdsSkipped: string[];
  expiresAt: string;
  bundleSnapshot: string[];
  bundleTitle: string;
}

/**
 * Grant (or renew) access to every course in a bundle. Writes one entry per
 * constituent course into users/{userId}.courses with shared bundleId,
 * bundleSnapshot, bundlePurchaseId, and expires_at.
 *
 * Freeze guarantee on renewal: uses the user's existing bundleSnapshot rather
 * than the bundle's current courseIds, so later edits to the bundle never
 * affect existing buyers.
 *
 * Edge case: if the user already owns a course standalone (no bundleId) and
 * the standalone entry's expires_at is later than the bundle's computed
 * expires_at, the standalone entry is preserved untouched (standalone wins).
 */
export async function assignBundleToUser(
  opts: AssignBundleOptions
): Promise<AssignBundleResult> {
  const {userId, bundleId, accessDuration, paymentId, subscriptionId, isRenewal} = opts;

  const bundleDoc = await db.collection("bundles").doc(bundleId).get();
  if (!bundleDoc.exists) {
    throw new Error(`Bundle not found: ${bundleId}`);
  }
  const bundleData = bundleDoc.data()!;
  const bundleTitle = (bundleData.title as string) ?? "Bundle";

  const userRef = db.collection("users").doc(userId);
  const userDoc = await userRef.get();
  if (!userDoc.exists) {
    throw new Error(`User not found: ${userId}`);
  }
  const userData = userDoc.data()!;
  const existingCourses = (userData.courses ?? {}) as Record<string, Record<string, unknown>>;

  let courseIdsForGrant: string[];
  if (isRenewal) {
    const existingBundleEntry = Object.values(existingCourses).find(
      (entry) => entry.bundleId === bundleId
    );
    const snapshot = existingBundleEntry?.bundleSnapshot as string[] | undefined;
    if (Array.isArray(snapshot) && snapshot.length > 0) {
      courseIdsForGrant = snapshot;
    } else {
      courseIdsForGrant = (bundleData.courseIds as string[]) ?? [];
    }
  } else {
    courseIdsForGrant = (bundleData.courseIds as string[]) ?? [];
  }

  if (courseIdsForGrant.length === 0) {
    throw new Error(`Bundle ${bundleId} has no courseIds to grant`);
  }

  const courseRefs = courseIdsForGrant.map((id) => db.collection("courses").doc(id));
  const courseDocs = await db.getAll(...courseRefs);

  const now = new Date();
  const courseIdsGranted: string[] = [];
  const courseIdsSkipped: string[] = [];
  const bundleSnapshot = [...courseIdsForGrant];

  const updatePayload: Record<string, unknown> = {
    updated_at: FieldValue.serverTimestamp(),
  };

  const bundleExpiresAt = calculateExpirationDate(accessDuration);

  for (let i = 0; i < courseDocs.length; i++) {
    const courseDoc = courseDocs[i];
    const courseId = courseIdsForGrant[i];
    if (!courseDoc.exists) {
      courseIdsSkipped.push(courseId);
      continue;
    }
    const courseData = courseDoc.data()!;
    const existingEntry = existingCourses[courseId];

    const existingIsStandalone =
      existingEntry &&
      existingEntry.status === "active" &&
      !existingEntry.bundleId;
    const existingExpiresAt = existingEntry?.expires_at as string | undefined;

    if (existingIsStandalone && existingExpiresAt) {
      const existingExpiryDate = new Date(existingExpiresAt);
      const bundleExpiryDate = new Date(bundleExpiresAt);
      if (existingExpiryDate >= bundleExpiryDate) {
        courseIdsSkipped.push(courseId);
        continue;
      }
      updatePayload[`courses.${courseId}.expires_at`] = bundleExpiresAt;
      courseIdsGranted.push(courseId);
      continue;
    }

    const previousBundleEntry =
      existingEntry && existingEntry.bundleId === bundleId ?
        existingEntry :
        null;

    let entryExpiresAt = bundleExpiresAt;
    if (isRenewal && previousBundleEntry?.expires_at) {
      try {
        entryExpiresAt = calculateExpirationDate(
          accessDuration,
          previousBundleEntry.expires_at as string
        );
      } catch {
        entryExpiresAt = bundleExpiresAt;
      }
    }

    const entry: Record<string, unknown> = {
      access_duration: accessDuration,
      expires_at: entryExpiresAt,
      status: "active",
      purchased_at: (previousBundleEntry?.purchased_at as string) ?? now.toISOString(),
      deliveryType: courseData.deliveryType ?? "low_ticket",
      title: courseData.title ?? "Untitled Course",
      image_url: courseData.image_url ?? null,
      discipline: courseData.discipline ?? "General",
      creatorName:
        courseData.creatorName ??
        (courseData as Record<string, unknown>).creator_name ??
        null,
      completedTutorials: (previousBundleEntry?.completedTutorials as Record<string, unknown>) ?? {
        dailyWorkout: [], warmup: [], workoutExecution: [], workoutCompletion: [],
      },
      bundleId,
      bundleSnapshot,
      bundlePurchaseId: subscriptionId ?? paymentId,
      bundleTitle,
    };

    updatePayload[`courses.${courseId}`] = entry;
    courseIdsGranted.push(courseId);
  }

  if (!isRenewal) {
    const purchased = (userData.purchased_courses as string[]) ?? [];
    updatePayload.purchased_courses = Array.from(new Set([...purchased, ...courseIdsGranted]));
  }

  if (courseIdsGranted.length > 0) {
    await userRef.update(updatePayload);
  }

  return {
    courseIdsGranted,
    courseIdsSkipped,
    expiresAt: bundleExpiresAt,
    bundleSnapshot,
    bundleTitle,
  };
}

/**
 * Revoke a bundle purchase — sets status="cancelled" on every course granted
 * via the given bundleId. Used for refunds/chargebacks.
 */
export async function revokeBundleAccess(
  userId: string,
  bundleId: string
): Promise<string[]> {
  const userRef = db.collection("users").doc(userId);
  const userDoc = await userRef.get();
  if (!userDoc.exists) return [];

  const userData = userDoc.data()!;
  const courses = (userData.courses ?? {}) as Record<string, Record<string, unknown>>;

  const updatePayload: Record<string, unknown> = {
    updated_at: FieldValue.serverTimestamp(),
  };
  const revoked: string[] = [];

  for (const [courseId, entry] of Object.entries(courses)) {
    if (entry.bundleId === bundleId && entry.status === "active") {
      updatePayload[`courses.${courseId}.status`] = "cancelled";
      updatePayload[`courses.${courseId}.cancelled_at`] = new Date().toISOString();
      revoked.push(courseId);
    }
  }

  if (revoked.length > 0) {
    await userRef.update(updatePayload);
  }
  return revoked;
}

/**
 * Adjust expires_at for all courses in a bundle subscription. Used on
 * subscription cancellation (set to cycle end) or renewal (extend by cycle).
 */
export async function updateBundleAccessExpiry(
  userId: string,
  bundleId: string,
  newExpiresAt: string
): Promise<string[]> {
  const userRef = db.collection("users").doc(userId);
  const userDoc = await userRef.get();
  if (!userDoc.exists) return [];

  const userData = userDoc.data()!;
  const courses = (userData.courses ?? {}) as Record<string, Record<string, unknown>>;

  const updatePayload: Record<string, unknown> = {
    updated_at: FieldValue.serverTimestamp(),
  };
  const updated: string[] = [];

  for (const [courseId, entry] of Object.entries(courses)) {
    if (entry.bundleId === bundleId && entry.status === "active") {
      updatePayload[`courses.${courseId}.expires_at`] = newExpiresAt;
      updated.push(courseId);
    }
  }

  if (updated.length > 0) {
    await userRef.update(updatePayload);
  }
  return updated;
}
