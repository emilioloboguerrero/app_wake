import {db} from "../firestore.js";
import {WakeApiServerError} from "../errors.js";

// Distinct code so clients can tell "program is sold out → show waitlist" apart
// from other 409s (e.g. the one-on-one lock).
export const CAPACITY_FULL_CODE = "CAPACITY_FULL";

// A program opts into a beta cap by setting `capacity` (max unique lifetime
// purchasers). Returns null when uncapped so callers skip the count query
// entirely — uncapped programs pay nothing.
export function resolveCapacity(course: Record<string, unknown>): number | null {
  const cap = course.capacity;
  return typeof cap === "number" && Number.isInteger(cap) && cap > 0 ? cap : null;
}

// Seats taken = unique users who have ever been granted this course. We count
// `purchased_courses array-contains courseId` — that array is written on every
// genuine grant (one-time, subscription, trial) and never on renewal, so it is
// the lifetime-acquisition count. Set semantics mean a lapsed-then-repurchasing
// user is not double-counted. Cheap aggregation query (only runs for capped
// programs, which by definition hold ≤ capacity purchasers).
export async function countCourseSeatsTaken(courseId: string): Promise<number> {
  const snap = await db
    .collection("users")
    .where("purchased_courses", "array-contains", courseId)
    .count()
    .get();
  return snap.data().count;
}

export interface CourseAvailability {
  capacity: number | null;
  seatsRemaining: number | null;
  isFull: boolean;
}

export async function getCourseAvailability(
  courseId: string,
  course: Record<string, unknown>
): Promise<CourseAvailability> {
  const capacity = resolveCapacity(course);
  if (capacity === null) {
    return {capacity: null, seatsRemaining: null, isFull: false};
  }
  const taken = await countCourseSeatsTaken(courseId);
  return {
    capacity,
    seatsRemaining: Math.max(0, capacity - taken),
    isFull: taken >= capacity,
  };
}

// Server-side gate enforced at checkout. The UI also hides the buy button when
// full, but this is the real lock — a client can call checkout directly. There
// is a small oversell window (people mid-checkout when the last seat fills);
// acceptable for a beta cap.
export async function assertCourseHasSeat(
  courseId: string,
  course: Record<string, unknown>
): Promise<void> {
  const capacity = resolveCapacity(course);
  if (capacity === null) return;
  const taken = await countCourseSeatsTaken(courseId);
  if (taken >= capacity) {
    throw new WakeApiServerError(CAPACITY_FULL_CODE, 409, "Cupos agotados", "capacity");
  }
}
