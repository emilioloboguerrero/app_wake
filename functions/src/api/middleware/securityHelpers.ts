import {WakeApiServerError} from "../errors.js";

// ─── User course status enum (H-25) ──────────────────────────────────────────
// Allowed values for users/{userId}.courses[courseId].status when written
// through user-facing endpoints. The payment webhook may set additional
// internal states; this enum applies to user-mutable PATCH paths only.
export const ALLOWED_USER_COURSE_STATUSES = ["active", "expired", "cancelled"] as const;
export type AllowedUserCourseStatus = typeof ALLOWED_USER_COURSE_STATUSES[number];

export function assertAllowedUserCourseStatus(
  value: string,
  field = "status"
): asserts value is AllowedUserCourseStatus {
  if (!(ALLOWED_USER_COURSE_STATUSES as readonly string[]).includes(value)) {
    throw new WakeApiServerError(
      "VALIDATION_ERROR",
      400,
      `${field} debe ser uno de: ${ALLOWED_USER_COURSE_STATUSES.join(", ")}`,
      field
    );
  }
}

// ─── Trial duration clamp (C-06) ─────────────────────────────────────────────
// Maximum trial length any user can grant themselves. The actual cap should
// also be validated against the course's free_trial.duration_days config —
// this is the absolute backstop.
export const MAX_TRIAL_DURATION_DAYS = 14;
export const MIN_TRIAL_DURATION_DAYS = 1;

export function clampTrialDurationDays(
  requested: number,
  courseConfiguredDays?: number | null
): number {
  if (!Number.isFinite(requested) || requested <= 0) {
    throw new WakeApiServerError(
      "VALIDATION_ERROR",
      400,
      "durationInDays debe ser un número positivo",
      "durationInDays"
    );
  }
  // Round down to whole days; reject fractional
  const requestedInt = Math.floor(requested);
  if (requestedInt < MIN_TRIAL_DURATION_DAYS) {
    throw new WakeApiServerError(
      "VALIDATION_ERROR",
      400,
      `durationInDays mínimo es ${MIN_TRIAL_DURATION_DAYS}`,
      "durationInDays"
    );
  }
  const courseCap = (typeof courseConfiguredDays === "number" && courseConfiguredDays > 0) ?
    Math.min(courseConfiguredDays, MAX_TRIAL_DURATION_DAYS) :
    MAX_TRIAL_DURATION_DAYS;
  return Math.min(requestedInt, courseCap);
}

// ─── Storage path allowlist (C-09) ───────────────────────────────────────────
// Defense against /storage/download-url returning signed URLs for arbitrary
// paths. Each allowlisted prefix MUST embed the caller's userId so that a
// user can only request URLs scoped to their own namespace.
//
// Anything not in this list is denied. Add new prefixes here when a legitimate
// use case appears — never broaden existing prefixes.
export function buildAllowedDownloadPrefixes(userId: string): string[] {
  return [
    `progress_photos/${userId}/`,
    `body_log/${userId}/`,
    `profiles/${userId}/`,
    `users/${userId}/`,
  ];
}

export function assertAllowedDownloadPath(path: string, userId: string): void {
  if (!path || typeof path !== "string") {
    throw new WakeApiServerError(
      "VALIDATION_ERROR",
      400,
      "path es requerido",
      "path"
    );
  }
  if (path.includes("..") || path.startsWith("/") || path.includes("\0")) {
    throw new WakeApiServerError(
      "VALIDATION_ERROR",
      400,
      "Ruta inválida",
      "path"
    );
  }
  const allowed = buildAllowedDownloadPrefixes(userId);
  if (!allowed.some((prefix) => path.startsWith(prefix))) {
    throw new WakeApiServerError(
      "FORBIDDEN",
      403,
      "Sin acceso a esta ruta de almacenamiento",
      "path"
    );
  }
}

// ─── Free-grant authorization (audit C-01) ───────────────────────────────────
// Decides whether a user is allowed to call `/users/me/move-course` for a
// given course. Mirrors the client-side pre-check at
// apps/pwa/src/screens/CourseDetailScreen.js:730-734 — admins, creators of
// the course, draft programs (creator preview), and explicitly-free programs.
//
// This replaces the pre-patch behavior where ANY user could grant themselves
// ANY course (the audit-C-01 monetization bypass).
export interface FreeGrantContext {
  callerUserId: string;
  callerRole: "user" | "creator" | "admin";
  course: {
    creator_id?: string;
    creatorId?: string;
    status?: string;
    price?: number | null;
    subscription_price?: number | null;
  };
}

export function isFreeGrantAllowed(ctx: FreeGrantContext): boolean {
  // Admins always allowed
  if (ctx.callerRole === "admin") return true;

  // Creator who owns this course (preview / self-grant of own program)
  const courseCreatorId = ctx.course.creator_id ?? ctx.course.creatorId;
  if (courseCreatorId && courseCreatorId === ctx.callerUserId) return true;

  // Draft programs — anyone can preview (legitimate testing flow)
  // The actual "publish" gate is a creator action, not a security boundary.
  const status = ctx.course.status;
  if (status && status !== "published") return true;

  // Explicitly-free programs (price 0/null AND no subscription_price)
  const price = ctx.course.price;
  const subPrice = ctx.course.subscription_price;
  const isOneTimeFree = (price === 0 || price === null || price === undefined);
  const isSubFree = (subPrice === 0 || subPrice === null || subPrice === undefined);
  if (isOneTimeFree && isSubFree) return true;

  return false;
}

// ─── HTTPS URL scheme validator (Tier 2 — used by Tier 0 too) ────────────────
// Rejects javascript:, data:, file:, and other non-http(s) schemes that can
// be exploited when a stored URL is later rendered as an <a href> or <img src>.
export function assertHttpsUrl(value: string, field: string): void {
  if (typeof value !== "string" || value.length === 0) {
    throw new WakeApiServerError(
      "VALIDATION_ERROR",
      400,
      `${field} es requerido`,
      field
    );
  }
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new WakeApiServerError(
      "VALIDATION_ERROR",
      400,
      `${field} debe ser una URL válida`,
      field
    );
  }
  if (parsed.protocol !== "https:") {
    throw new WakeApiServerError(
      "VALIDATION_ERROR",
      400,
      `${field} debe usar https://`,
      field
    );
  }
}
