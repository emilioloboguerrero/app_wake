import {db, FieldValue} from "../firestore.js";
import type {Transaction} from "firebase-admin/firestore";

export interface CourseAssignmentOptions {
  isRenewal?: boolean;
  existingCourseData?: Record<string, unknown>;
  transaction?: Transaction;
}

/**
 * Assign a course to a user. Handles both new purchases and renewals.
 * Optionally accepts a Firestore transaction for atomic writes.
 *
 * The caller computes `expiresAt` because each scenario handles it differently
 * (new purchase: from now, renewal: from current expiration).
 */
export async function assignCourseToUser(
  userId: string,
  courseId: string,
  courseData: Record<string, unknown>,
  expiresAt: string,
  options: CourseAssignmentOptions = {}
): Promise<void> {
  const {isRenewal, existingCourseData, transaction} = options;
  const userRef = db.collection("users").doc(userId);

  const courseEntry = buildCourseEntry(courseData, expiresAt, isRenewal, existingCourseData);

  if (transaction) {
    const freshUserDoc = await transaction.get(userRef);
    if (!freshUserDoc.exists) throw new Error("User not found");

    const freshData = freshUserDoc.data()!;
    const courses = freshData.courses ?? {};

    // Idempotency: skip if already active and not expired
    if (
      !isRenewal &&
      courses[courseId]?.status === "active" &&
      new Date(courses[courseId].expires_at) > new Date()
    ) {
      return;
    }

    courses[courseId] = courseEntry;

    const updatePayload: Record<string, unknown> = {courses};
    if (!isRenewal) {
      updatePayload.purchased_courses = [
        ...new Set([...(freshData.purchased_courses || []), courseId]),
      ];
    }

    transaction.update(userRef, updatePayload);
  } else {
    // Non-transactional (free access, renewals without transaction)
    const updatePayload: Record<string, unknown> = {
      [`courses.${courseId}`]: courseEntry,
      updated_at: FieldValue.serverTimestamp(),
    };

    if (!isRenewal) {
      const userDoc = await userRef.get();
      const userData = userDoc.data() ?? {};
      updatePayload.purchased_courses = [
        ...new Set([...(userData.purchased_courses || []), courseId]),
      ];
    }

    await userRef.update(updatePayload);
  }
}

function buildCourseEntry(
  courseData: Record<string, unknown>,
  expiresAt: string,
  isRenewal?: boolean,
  existing?: Record<string, unknown>
): Record<string, unknown> {
  if (isRenewal && existing) {
    return {
      access_duration: existing.access_duration ?? courseData.access_duration,
      expires_at: expiresAt,
      status: "active",
      purchased_at: existing.purchased_at ?? new Date().toISOString(),
      deliveryType: existing.deliveryType ?? courseData.deliveryType ?? "low_ticket",
      title: existing.title ?? courseData.title ?? "Untitled Course",
      image_url: existing.image_url ?? courseData.image_url ?? null,
      discipline: existing.discipline ?? courseData.discipline ?? "General",
      creatorName: existing.creatorName ?? courseData.creatorName ?? courseData.creator_name ?? null,
      completedTutorials: existing.completedTutorials ?? {
        dailyWorkout: [], warmup: [], workoutExecution: [], workoutCompletion: [],
      },
    };
  }

  return {
    access_duration: courseData.access_duration,
    expires_at: expiresAt,
    status: "active",
    purchased_at: new Date().toISOString(),
    deliveryType: courseData.deliveryType ?? "low_ticket",
    title: courseData.title ?? "Untitled Course",
    image_url: courseData.image_url ?? null,
    discipline: courseData.discipline ?? "General",
    creatorName: courseData.creatorName ?? courseData.creator_name ?? null,
    completedTutorials: {
      dailyWorkout: [], warmup: [], workoutExecution: [], workoutCompletion: [],
    },
  };
}
