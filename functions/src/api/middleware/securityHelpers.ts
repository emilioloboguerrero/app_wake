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

// ─── Deletion path validator (audit C-03 / C-04) ─────────────────────────────
// Used by plan-content PUTs that walk client-supplied paths under a parent doc
// to delete sessions/exercises/sets subdocuments. The prior `startsWith` +
// length-of-segments-array check was insufficient; an attacker could supply
// arbitrary collection/document segments to traverse to siblings of the parent.
//
// Returns the validated segments. Throws WakeApiServerError on rejection.
const DELETION_SEGMENT_RE = /^[A-Za-z0-9_-]{1,128}$/;
const DELETION_ALLOWED_COLLECTIONS = new Set(["sessions", "exercises", "sets"]);

export interface ValidateDeletionPathOptions {
  maxDepth?: number; // max number of (collection, docId) pairs (default 3)
}

export function validateDeletionPath(
  path: unknown,
  options: ValidateDeletionPathOptions = {}
): string[] {
  const maxDepth = options.maxDepth ?? 3;

  if (typeof path !== "string" || path.length === 0 || path.length > 1024) {
    throw new WakeApiServerError(
      "VALIDATION_ERROR",
      400,
      "deletions[*] debe ser un string no vacío",
      "deletions"
    );
  }
  const segments = path.split("/");
  if (segments.length < 2 || segments.length % 2 !== 0 || segments.length > maxDepth * 2) {
    throw new WakeApiServerError(
      "VALIDATION_ERROR",
      400,
      "deletions[*] formato inválido",
      "deletions"
    );
  }
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    if (!DELETION_SEGMENT_RE.test(seg)) {
      throw new WakeApiServerError(
        "VALIDATION_ERROR",
        400,
        "deletions[*] contiene segmento inválido",
        "deletions"
      );
    }
    if (i % 2 === 0 && !DELETION_ALLOWED_COLLECTIONS.has(seg)) {
      throw new WakeApiServerError(
        "VALIDATION_ERROR",
        400,
        "deletions[*] colección no permitida",
        "deletions"
      );
    }
  }
  return segments;
}

// ─── HTTPS URL scheme validator (Tier 2 — used by Tier 0 too) ────────────────
// Rejects javascript:, data:, file:, and other non-http(s) schemes that can
// be exploited when a stored URL is later rendered as an <a href> or <img src>.
export function assertHttpsUrl(value: string, field: string): URL {
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
  return parsed;
}

// ─── Call-link domain allowlist (audit M-42) ─────────────────────────────────
// Creators can attach an external meeting URL to a booking; we ship that URL
// in branded reminder emails. Restrict to the handful of vendor domains we
// recognize so a creator can't redirect Wake-branded mail to a phishing site
// or javascript: scheme. Match suffixes only (zoom.us, *.zoom.us etc).
const CALL_LINK_DOMAIN_SUFFIXES = [
  "zoom.us",
  "meet.google.com",
  "meet.jit.si",
  "daily.co",
  "whereby.com",
  "teams.microsoft.com",
  "teams.live.com",
  "wakelab.co",
];

export function assertAllowedCallLinkUrl(value: string, field = "callLink"): void {
  const parsed = assertHttpsUrl(value, field);
  const host = parsed.hostname.toLowerCase();
  const ok = CALL_LINK_DOMAIN_SUFFIXES.some(
    (suffix) => host === suffix || host.endsWith(`.${suffix}`)
  );
  if (!ok) {
    throw new WakeApiServerError(
      "VALIDATION_ERROR",
      400,
      `${field} debe apuntar a un proveedor permitido (Zoom, Meet, Jitsi, Daily, Whereby, Teams)`,
      field
    );
  }
}

// ─── Length caps for creator-controlled text (audit M-39) ────────────────────
// Creators can write 1MiB into a single Firestore field; clients that fetch
// the doc pay bandwidth and storage. Cap by field role.
export const TEXT_CAP_TITLE = 200;
export const TEXT_CAP_DESCRIPTION = 5000;
export const TEXT_CAP_NOTE = 2000;

export function assertTextLength(
  value: unknown,
  field: string,
  max: number,
  options: { allowEmpty?: boolean } = {}
): string {
  if (typeof value !== "string") {
    throw new WakeApiServerError(
      "VALIDATION_ERROR",
      400,
      `${field} debe ser texto`,
      field
    );
  }
  if (!options.allowEmpty && value.trim().length === 0) {
    throw new WakeApiServerError(
      "VALIDATION_ERROR",
      400,
      `${field} no puede estar vacío`,
      field
    );
  }
  if (value.length > max) {
    throw new WakeApiServerError(
      "VALIDATION_ERROR",
      400,
      `${field} no puede exceder ${max} caracteres`,
      field
    );
  }
  return value;
}

// ─── Email masking for enumeration responses (audit M-45) ────────────────────
// Reveals enough of the email for a creator to confirm they reached the right
// person without disclosing a full harvestable address.
//   alex@example.com → al***@example.com
//   ab@example.com   → a***@example.com
export function maskEmail(email: unknown): string | null {
  if (typeof email !== "string") return null;
  const trimmed = email.trim();
  const at = trimmed.indexOf("@");
  if (at <= 0 || at === trimmed.length - 1) return null;
  const local = trimmed.slice(0, at);
  const domain = trimmed.slice(at + 1);
  const visible = local.length <= 2 ? local.slice(0, 1) : local.slice(0, 2);
  return `${visible}***@${domain}`;
}

// ─── Creator-owned course IDs (audit M-44) ───────────────────────────────────
// Returns the set of course IDs a creator owns, used to scope cross-tenant
// reads (e.g., a shared client's sessionHistory) to programs the caller has
// legitimate authority over.
export interface CreatorCourseIdsLoader {
  load(creatorId: string): Promise<Set<string>>;
}

export async function loadCreatorOwnedCourseIds(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: { collection: (path: string) => any },
  creatorId: string
): Promise<Set<string>> {
  const snap = await db.collection("courses")
    .where("creator_id", "==", creatorId)
    .select()
    .get();
  return new Set<string>(snap.docs.map((d: { id: string }) => d.id));
}
