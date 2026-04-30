import sanitizeHtml from "sanitize-html";
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

// ─── Broadcast email body sanitizer (audit H-26) ─────────────────────────────
// Creators can submit arbitrary HTML to /creator/email/send which is then
// delivered with `from: notificaciones@wakelab.co`. Without sanitization a
// creator can phish recipients with Wake-branded mail containing <script>,
// CSS exfil tricks, on*= handlers, or hidden <form action="..."> targets.
//
// Allowlist marketing-shaped content; force target="_blank" rel="noopener
// noreferrer" on every link; require http/https/mailto/tel schemes.
export const BROADCAST_SAFE_TAGS = [
  "p", "br", "hr", "blockquote", "pre", "code",
  "h1", "h2", "h3", "h4", "h5", "h6",
  "strong", "em", "b", "i", "u", "s", "small", "sub", "sup", "span", "div",
  "ul", "ol", "li",
  "a", "img",
  "table", "thead", "tbody", "tfoot", "tr", "td", "th",
];

const BROADCAST_SAFE_STYLE_PROPS: Record<string, RegExp[]> = {
  "color": [/^#(?:[0-9a-f]{3}){1,2}$/i, /^rgb\(.+\)$/i, /^rgba\(.+\)$/i, /^[a-z]+$/i],
  "background-color": [/^#(?:[0-9a-f]{3}){1,2}$/i, /^rgb\(.+\)$/i, /^rgba\(.+\)$/i, /^[a-z]+$/i],
  "text-align": [/^(?:left|right|center|justify)$/i],
  "font-weight": [/^(?:normal|bold|\d{3})$/i],
  "font-style": [/^(?:normal|italic|oblique)$/i],
  "font-size": [/^\d+(?:\.\d+)?(?:px|em|rem|%)$/i],
  "line-height": [/^[\d.]+$/, /^\d+(?:\.\d+)?(?:px|em|rem|%)$/i],
  "letter-spacing": [/^-?\d+(?:\.\d+)?(?:px|em|rem)$/i],
  "margin": [/^[\d\s.-]+(?:px|em|rem|%)?$/i, /^auto$/i, /^0$/],
  "padding": [/^[\d\s.-]+(?:px|em|rem|%)?$/i, /^0$/],
  "width": [/^\d+(?:\.\d+)?(?:px|em|rem|%)$/i, /^auto$/i],
  "max-width": [/^\d+(?:\.\d+)?(?:px|em|rem|%)$/i, /^none$/i],
  "border-radius": [/^[\d\s.-]+(?:px|em|rem|%)?$/i],
  "border": [/^[\d\s.\-a-z#%]+$/i],
};

const BROADCAST_SANITIZE_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: BROADCAST_SAFE_TAGS,
  disallowedTagsMode: "discard",
  allowedAttributes: {
    a: ["href", "title", "target", "rel"],
    img: ["src", "alt", "title", "width", "height", "style"],
    span: ["style"],
    div: ["style"],
    p: ["style"],
    h1: ["style"],
    h2: ["style"],
    h3: ["style"],
    h4: ["style"],
    h5: ["style"],
    h6: ["style"],
    li: ["style"],
    td: ["style", "colspan", "rowspan"],
    th: ["style", "colspan", "rowspan"],
    table: ["style", "cellpadding", "cellspacing"],
    tr: ["style"],
    blockquote: ["style"],
  },
  allowedSchemes: ["http", "https", "mailto", "tel"],
  allowedSchemesByTag: {
    img: ["https", "data"], // data: only for inline marketing images
    a: ["http", "https", "mailto", "tel"],
  },
  allowProtocolRelative: false,
  allowedStyles: {
    "*": BROADCAST_SAFE_STYLE_PROPS,
  },
  transformTags: {
    a: (tagName, attribs) => ({
      tagName,
      attribs: {
        ...attribs,
        target: "_blank",
        rel: "noopener noreferrer",
      },
    }),
  },
};

export function sanitizeBroadcastHtml(html: string): string {
  if (typeof html !== "string") return "";
  return sanitizeHtml(html, BROADCAST_SANITIZE_OPTIONS);
}

// ─── Push notification senderName clamp (audit H-27) ─────────────────────────
// Cap senderName at 40 chars and surround with quotes so the rendered title
// remains "X te envió un mensaje" with X visibly bounded — prevents a creator
// from injecting a verb-like name ("Wake admin: tu cuenta fue suspendida").
export const PUSH_SENDER_NAME_MAX = 40;

export function clampPushSenderName(value: unknown): string {
  if (typeof value !== "string") return "Alguien";
  // Strip control chars (including bidi overrides) that could distort the
  // sender name rendering on iOS / Android push UIs.
  // eslint-disable-next-line no-control-regex
  const stripped = value.replace(/[ -‎‏‪-‮⁦-⁩]/g, "").trim();
  if (!stripped) return "Alguien";
  return stripped.length > PUSH_SENDER_NAME_MAX ?
    stripped.slice(0, PUSH_SENDER_NAME_MAX - 1) + "…" :
    stripped;
}

// ─── Safe error payload (audit M-25, L-41) ───────────────────────────────────
// MercadoPago SDK errors and similar third-party errors can contain payer
// emails, identification numbers, BIN, or full request bodies. Strip those
// before logging so Cloud Logging doesn't retain PII / PCI-adjacent data.
const SAFE_ERROR_DROP_KEYS = new Set([
  "payer", "card", "additional_info", "additionalInfo",
  "raw", "request", "response", "config", "headers",
  "metadata", "transaction_amount", "transactionAmount",
  "external_reference", "externalReference",
]);

export function safeErrorPayload(err: unknown): Record<string, unknown> {
  if (err instanceof Error) {
    return {
      message: err.message.slice(0, 500),
      name: err.name,
      // Stack is bounded — prevents giant logs; useful for grouping.
      stack: err.stack ? err.stack.split("\n").slice(0, 5).join("\n") : undefined,
    };
  }
  if (typeof err === "string") return {message: err.slice(0, 500)};
  if (!err || typeof err !== "object") return {message: String(err)};

  const e = err as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  if (typeof e.message === "string") out.message = (e.message as string).slice(0, 500);
  if (typeof e.name === "string") out.name = e.name;
  if (typeof e.code === "string" || typeof e.code === "number") out.code = e.code;
  if (typeof e.status === "number") out.status = e.status;
  if (typeof e.statusCode === "number") out.statusCode = e.statusCode;
  // Whitelist — never spread the full object.
  for (const k of Object.keys(e)) {
    if (SAFE_ERROR_DROP_KEYS.has(k)) continue;
  }
  return out;
}

// ─── Public course-doc field allowlist (audit H-11) ──────────────────────────
// `GET /workout/programs/:courseId` returns to any authenticated user. The
// previous `...courseDoc.data()` spread leaks any field present on the doc —
// today that includes pricing, but tomorrow it could include payout details,
// internal moderation flags, creator email, etc. Allowlist only what client
// surfaces (purchase flow, course detail, workout execution, calendar) need.
//
// Fields not listed here drop. Add a field deliberately, never by spread.
export const PUBLIC_COURSE_FIELDS = [
  // Identity / display
  "title", "description", "image_url", "image_path", "video_intro_url",
  // Pricing + purchase flow
  "price", "subscription_price", "currency", "access_duration",
  "free_trial",
  // Structure (consumed by workout execution + creator dashboard)
  "deliveryType", "visibility", "weekly", "discipline", "duration",
  "weight_suggestions", "availableLibraries", "tutorials",
  "planAssignments", "content_plan_id",
  // Status / version
  "status", "version", "published_version",
  // Authorship (display only — never email or payout fields)
  "creator_id", "creatorId", "creatorName",
  // Catalog metadata
  "tags",
  // Counts (computed at write time; safe)
  "modules_count", "sessions_count", "duration_weeks",
  // Timestamps
  "created_at", "updated_at",
];

export function pickPublicCourseFields(
  data: Record<string, unknown>
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of PUBLIC_COURSE_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(data, k)) out[k] = data[k];
  }
  return out;
}

// ─── Subscription state-machine guards (audit H-20) ──────────────────────────
// `updateSubscriptionStatus` previously called MP's preapproval.update without
// reading the on-disk status first, so cancel-after-cancel rewrote
// `cancelled_at` (audit-trail loss), pause-after-cancel + resume-after-cancel
// erased the original cancellation. Define legal transitions and reject
// anything else with a CONFLICT.
export const ALLOWED_SUBSCRIPTION_TRANSITIONS: Record<string, ReadonlySet<string>> = {
  pending: new Set(["authorized", "cancelled", "paused"]),
  authorized: new Set(["cancelled", "paused"]),
  paused: new Set(["authorized", "cancelled"]),
  cancelled: new Set([]), // terminal
};

export function assertAllowedSubscriptionTransition(
  currentStatus: string | null | undefined,
  targetStatus: string
): void {
  // Unknown / missing on-disk status — allow (lets the app self-heal legacy docs).
  if (!currentStatus) return;
  if (currentStatus === targetStatus) {
    throw new WakeApiServerError(
      "CONFLICT",
      409,
      `La suscripción ya está en estado ${targetStatus}`,
      "status"
    );
  }
  const allowed = ALLOWED_SUBSCRIPTION_TRANSITIONS[currentStatus];
  if (!allowed) {
    // Unknown current state (e.g., legacy "in_process") — let it through.
    return;
  }
  if (!allowed.has(targetStatus)) {
    throw new WakeApiServerError(
      "CONFLICT",
      409,
      `Transición no permitida: ${currentStatus} → ${targetStatus}`,
      "status"
    );
  }
}

// ─── Email redaction for logs (audit M-26 / M-27 / M-28) ─────────────────────
// Replace the local part with a domain-only marker so deliverability/error
// logs remain useful for debugging without harvestable email addresses.
export function redactEmailForLog(email: unknown): string {
  if (typeof email !== "string") return "";
  const at = email.indexOf("@");
  if (at <= 0 || at === email.length - 1) return "[invalid]";
  return `***@${email.slice(at + 1)}`;
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
