// Public, unauthenticated storefront endpoints.
//
// `wakelab.co/{username}` and `wakelab.co/{username}/{programId}` consume
// these. CDN-cached aggressively so high traffic from IG bio links does not
// translate to Firestore reads.
//
// Strict response shaping — never spread the raw doc. Drafts and unpublished
// programs MUST be filtered out before they leave the function.

import {Router} from "express";
import type {Request, Response} from "express";
import * as functions from "firebase-functions";
import {Preference, PreApproval} from "mercadopago";
import {db, FieldValue} from "../firestore.js";
import {validateAuth} from "../middleware/auth.js";
import {checkRateLimit, checkIpRateLimit} from "../middleware/rateLimit.js";
import {validateBody} from "../middleware/validate.js";
import {safeErrorPayload, redactEmailForLog} from "../middleware/securityHelpers.js";
import {WakeApiServerError} from "../errors.js";
import {
  EMAIL_RE,
  buildExternalReference,
  getClient,
  type MercadoPagoPreapproval,
} from "../services/paymentHelpers.js";
import {getCourseAvailability, assertCourseHasSeat} from "../services/capacity.js";

const router = Router();

const USERNAME_RE = /^[a-z0-9_-]{1,50}$/;
const COURSE_ID_RE = /^[A-Za-z0-9_-]{1,128}$/;
// Second-segment keywords the landing app routes to dedicated screens. A
// course whose ID collides with one of these would be unreachable via the
// public storefront URL (`/:username/:programId`), so refuse to serve or
// sell them rather than 404-ing post-checkout. Keep this list minimal — only
// real route collisions. Mirror apps/landing/src/App.jsx Route paths.
const RESERVED_COURSE_IDS = new Set(["comprado"]);
// MP preapproval IDs are short alphanumerics; assert the shape before using as a
// Firestore doc ID so a malformed value can't traverse subcollection paths.
const MP_RESULT_ID_RE = /^[A-Za-z0-9_-]{6,128}$/;
// Single 404 message for every storefront miss — no creator vs no-published-
// programs vs program-not-owned must be indistinguishable to defeat
// enumeration oracles.
const STOREFRONT_NOT_FOUND = "No encontramos esta página";

const STOREFRONT_CACHE_HEADER =
  "public, max-age=60, s-maxage=300, stale-while-revalidate=86400";

function setStorefrontCache(res: Response): void {
  res.setHeader("Cache-Control", STOREFRONT_CACHE_HEADER);
  // Vary on Origin so CORS responses cache per origin. Don't vary on Accept —
  // the response is JSON regardless of the request's Accept header, and adding
  // it shreds the CDN hit rate.
  res.setHeader("Vary", "Origin");
}

interface PublicCreator {
  username: string;
  displayName: string;
  bio: string | null;
  profilePictureUrl: string | null;
  websiteUrl: string | null;
  socialLinks: Record<string, string> | null;
  city: string | null;
  country: string | null;
}

function shapePublicCreator(
  data: Record<string, unknown>,
  username: string
): PublicCreator | null {
  const displayName = (data.displayName as string) ??
    (data.name as string) ?? null;
  if (!displayName) return null;
  const social = data.socialLinks;
  const cityRaw = typeof data.city === "string" ? data.city.trim() : "";
  const countryRaw = typeof data.country === "string" ? data.country.trim() : "";
  return {
    username,
    displayName,
    bio: (data.bio as string) ?? null,
    profilePictureUrl:
      (data.profilePictureUrl as string) ??
      (data.profile_picture_url as string) ??
      null,
    websiteUrl: (data.websiteUrl as string) ?? null,
    socialLinks:
      social && typeof social === "object" && !Array.isArray(social) ?
        (social as Record<string, string>) :
        null,
    city: cityRaw || null,
    country: countryRaw || null,
  };
}

interface PublicProgramCard {
  id: string;
  title: string;
  imageUrl: string | null;
  deliveryType: string;
  discipline: string | null;
  durationWeeks: number | null;
  price: number | null;
  subscriptionPrice: number | null;
  currency: string | null;
  freeTrial: boolean;
  // What the program includes — drives the storefront card pills.
  // hasTraining: every general/low-ticket program ships with a workout
  //   structure, so this is true by default. Carved out as a flag so a future
  //   "nutrition-only" deliveryType can opt out without reshaping the card.
  // hasNutrition: a non-empty `content_plan_id` means a nutrition plan is
  //   bundled with the program.
  hasTraining: boolean;
  hasNutrition: boolean;
}

function shapePublicProgramCard(
  id: string,
  data: Record<string, unknown>
): PublicProgramCard {
  const contentPlanId = data.content_plan_id;
  const hasNutrition =
    typeof contentPlanId === "string" && contentPlanId.trim().length > 0;
  return {
    id,
    title: (data.title as string) ?? "Programa",
    imageUrl: (data.image_url as string) ?? null,
    deliveryType: (data.deliveryType as string) ?? "general",
    discipline: (data.discipline as string) ?? null,
    durationWeeks:
      typeof data.duration_weeks === "number" ?
        (data.duration_weeks as number) :
        null,
    price: typeof data.price === "number" ? (data.price as number) : null,
    subscriptionPrice:
      typeof data.subscription_price === "number" ?
        (data.subscription_price as number) :
        null,
    currency: (data.currency as string) ?? null,
    freeTrial: data.free_trial === true,
    hasTraining: true,
    hasNutrition,
  };
}

// Optional creator-authored "landing sections" on the buy page (like Jeff
// Nippard's "What's Included" / "What's New"). Stored on courses.landing_sections
// and edited via PATCH /creator/programs. Sanitized server-side before display.
type PublicLandingBlock =
  | {type: "text"; value: string}
  | {type: "image"; url: string}
  | {type: "youtube"; url: string}
  | {type: "video"; url: string}
  | {type: "faq"; items: {q: string; a: string}[]}
  | {type: "cta"; label: string}
  | {
      type: "compare";
      mineLabel: string;
      othersLabel: string;
      rows: {label: string; mine: boolean; others: boolean}[];
    };

interface PublicLandingSection {
  heading: string;
  blocks: PublicLandingBlock[];
}

// Sanitize the raw courses.landing_sections value into a display-safe shape.
// Drops malformed sections/blocks, trims strings, never leaks extra fields, and
// returns null (not []) when nothing valid survives so the client can check
// truthiness.
function sanitizeLandingSections(
  raw: unknown
): PublicLandingSection[] | null {
  if (!Array.isArray(raw)) return null;

  const sections: PublicLandingSection[] = [];

  for (const rawSection of raw) {
    if (
      typeof rawSection !== "object" ||
      rawSection === null ||
      Array.isArray(rawSection)
    ) {
      continue;
    }

    const section = rawSection as Record<string, unknown>;
    const heading = String(section.heading ?? "").trim();
    if (!heading) continue;

    if (!Array.isArray(section.blocks)) continue;

    const blocks: PublicLandingBlock[] = [];
    for (const rawBlock of section.blocks) {
      if (
        typeof rawBlock !== "object" ||
        rawBlock === null ||
        Array.isArray(rawBlock)
      ) {
        continue;
      }

      const block = rawBlock as Record<string, unknown>;
      if (block.type === "text") {
        const value = typeof block.value === "string" ? block.value.trim() : "";
        if (value) blocks.push({type: "text", value});
      } else if (
        block.type === "image" ||
        block.type === "youtube" ||
        block.type === "video"
      ) {
        const url = typeof block.url === "string" ? block.url.trim() : "";
        if (url) blocks.push({type: block.type, url});
      } else if (block.type === "faq") {
        if (!Array.isArray(block.items)) continue;
        const items: {q: string; a: string}[] = [];
        for (const rawItem of block.items) {
          if (
            typeof rawItem !== "object" ||
            rawItem === null ||
            Array.isArray(rawItem)
          ) {
            continue;
          }
          const item = rawItem as Record<string, unknown>;
          const q = typeof item.q === "string" ? item.q.trim() : "";
          const a = typeof item.a === "string" ? item.a.trim() : "";
          if (q && a) items.push({q, a});
          if (items.length >= 20) break;
        }
        if (items.length > 0) blocks.push({type: "faq", items});
      } else if (block.type === "cta") {
        const label = typeof block.label === "string" ? block.label.trim() : "";
        if (label) blocks.push({type: "cta", label: label.slice(0, 80)});
      } else if (block.type === "compare") {
        if (!Array.isArray(block.rows)) continue;
        const rows: {label: string; mine: boolean; others: boolean}[] = [];
        for (const rawRow of block.rows) {
          if (
            typeof rawRow !== "object" ||
            rawRow === null ||
            Array.isArray(rawRow)
          ) {
            continue;
          }
          const row = rawRow as Record<string, unknown>;
          const label = typeof row.label === "string" ? row.label.trim() : "";
          if (!label) continue;
          rows.push({
            label,
            mine: row.mine === true,
            others: row.others === true,
          });
          if (rows.length >= 20) break;
        }
        if (rows.length === 0) continue;
        const mineLabel =
          typeof block.mineLabel === "string" && block.mineLabel.trim() ?
            block.mineLabel.trim() :
            "Código ABS";
        const othersLabel =
          typeof block.othersLabel === "string" && block.othersLabel.trim() ?
            block.othersLabel.trim() :
            "Otros";
        blocks.push({type: "compare", mineLabel, othersLabel, rows});
      }
    }

    if (blocks.length === 0) continue;
    sections.push({heading, blocks});
  }

  return sections.length > 0 ? sections : null;
}

interface PublicProgramDetail extends PublicProgramCard {
  description: string | null;
  videoIntroUrl: string | null;
  storefrontVideoUrl: string | null;
  duration: string | null;
  tags: string[] | null;
  sections: PublicLandingSection[] | null;
  compareAtPrice: number | null;
  polar: {
    priceUsdMonthly: number | null;
    priceUsdOnetime: number | null;
    hasSubscription: boolean;
    hasOnetime: boolean;
  } | null;
}

function shapePublicProgramDetail(
  id: string,
  data: Record<string, unknown>
): PublicProgramDetail {
  return {
    ...shapePublicProgramCard(id, data),
    description: (data.description as string) ?? null,
    videoIntroUrl: (data.video_intro_url as string) ?? null,
    storefrontVideoUrl: (data.storefront_video_url as string) ?? null,
    duration: (data.duration as string) ?? null,
    tags: Array.isArray(data.tags) ? (data.tags as string[]) : null,
    sections: sanitizeLandingSections(data.landing_sections),
    compareAtPrice:
      typeof data.compare_at_price === "number" &&
      Number.isInteger(data.compare_at_price) &&
      data.compare_at_price > 0 ?
        (data.compare_at_price as number) :
        null,
    polar: (() => {
      const p = data.polar as Record<string, unknown> | null | undefined;
      if (!p || typeof p !== "object") return null;
      const hasSubscription =
        typeof p.subscription_product_id === "string" && p.subscription_product_id.length > 0;
      const hasOnetime =
        typeof p.onetime_product_id === "string" && p.onetime_product_id.length > 0;
      if (!hasSubscription && !hasOnetime) return null;
      return {
        priceUsdMonthly: typeof p.price_usd_monthly === "number" ? p.price_usd_monthly : null,
        priceUsdOnetime: typeof p.price_usd_onetime === "number" ? p.price_usd_onetime : null,
        hasSubscription,
        hasOnetime,
      };
    })(),
  };
}

async function lookupCreatorByUsername(
  rawUsername: string
): Promise<{userId: string; data: Record<string, unknown>} | null> {
  const normalized = rawUsername.toLowerCase().trim();
  if (!USERNAME_RE.test(normalized)) return null;

  const snapshot = await db
    .collection("users")
    .where("username", "==", normalized)
    .limit(1)
    .get();

  if (snapshot.empty) return null;

  const doc = snapshot.docs[0];
  const data = doc.data();
  if (data.role !== "creator" && data.role !== "admin") return null;

  return {userId: doc.id, data};
}

// GET /public/creators/:username
//
// Returns the creator profile + grouped published programs. 404 if username
// not found, not a creator, or has zero published programs (no storefront
// without published content).
router.get(
  "/public/creators/:username",
  async (req: Request, res: Response) => {
    const usernameParam = req.params.username || "";
    const lookup = await lookupCreatorByUsername(usernameParam);
    if (!lookup) {
      throw new WakeApiServerError("NOT_FOUND", 404, STOREFRONT_NOT_FOUND);
    }

    const creator = shapePublicCreator(lookup.data, usernameParam.toLowerCase().trim());
    if (!creator) {
      throw new WakeApiServerError("NOT_FOUND", 404, STOREFRONT_NOT_FOUND);
    }

    const programsSnap = await db
      .collection("courses")
      .where("creator_id", "==", lookup.userId)
      .where("status", "==", "published")
      .limit(100)
      .get();

    const general: PublicProgramCard[] = [];
    const oneOnOne: PublicProgramCard[] = [];

    for (const doc of programsSnap.docs) {
      const card = shapePublicProgramCard(doc.id, doc.data());
      if (card.deliveryType === "one_on_one") {
        oneOnOne.push(card);
      } else {
        general.push(card);
      }
    }

    if (general.length === 0 && oneOnOne.length === 0) {
      throw new WakeApiServerError("NOT_FOUND", 404, STOREFRONT_NOT_FOUND);
    }

    setStorefrontCache(res);
    res.json({
      data: {
        creator,
        programs: {general, oneOnOne},
      },
    });
  }
);

// GET /public/creators/:username/programs/:programId
//
// Returns the creator + a single published program. Validates the program
// belongs to the creator AND is published — never returns drafts even if the
// caller knows the ID.
router.get(
  "/public/creators/:username/programs/:programId",
  async (req: Request, res: Response) => {
    const usernameParam = req.params.username || "";
    const programId = req.params.programId || "";

    if (!COURSE_ID_RE.test(programId) || RESERVED_COURSE_IDS.has(programId)) {
      // Use the same 404 message as a missing program — never reveal that the
      // ID was malformed vs nonexistent vs reserved.
      throw new WakeApiServerError("NOT_FOUND", 404, STOREFRONT_NOT_FOUND);
    }

    const lookup = await lookupCreatorByUsername(usernameParam);
    if (!lookup) {
      throw new WakeApiServerError("NOT_FOUND", 404, STOREFRONT_NOT_FOUND);
    }
    const creator = shapePublicCreator(lookup.data, usernameParam.toLowerCase().trim());
    if (!creator) {
      throw new WakeApiServerError("NOT_FOUND", 404, STOREFRONT_NOT_FOUND);
    }

    const programDoc = await db.collection("courses").doc(programId).get();
    if (!programDoc.exists) {
      throw new WakeApiServerError("NOT_FOUND", 404, STOREFRONT_NOT_FOUND);
    }
    const programData = programDoc.data() ?? {};

    if (programData.creator_id !== lookup.userId) {
      throw new WakeApiServerError("NOT_FOUND", 404, STOREFRONT_NOT_FOUND);
    }
    if (programData.status !== "published") {
      throw new WakeApiServerError("NOT_FOUND", 404, STOREFRONT_NOT_FOUND);
    }

    const availability = await getCourseAvailability(programDoc.id, programData);

    setStorefrontCache(res);
    res.json({
      data: {
        creator,
        program: {
          ...shapePublicProgramDetail(programDoc.id, programData),
          ...availability,
        },
      },
    });
  }
);

// GET /public/storefront/creators
//
// Public directory of every creator with at least one published program.
// Powers the wakelab.co/lab (and /tienda alias) landing page; each card links
// into the existing per-creator storefront at wakelab.co/{username}.
//
// Strategy: query published courses once, group by creator_id, then batch
// `db.getAll` the corresponding user docs in a single round-trip. Filtering
// upward from "has published programs" matches the per-creator endpoint's
// invariant — a creator with zero published content never appears.
router.get(
  "/public/storefront/creators",
  async (_req: Request, res: Response) => {
    const programsSnap = await db
      .collection("courses")
      .where("status", "==", "published")
      .select("creator_id")
      .limit(500)
      .get();

    const counts = new Map<string, number>();
    for (const doc of programsSnap.docs) {
      const creatorId = doc.get("creator_id");
      if (typeof creatorId !== "string" || !creatorId) continue;
      counts.set(creatorId, (counts.get(creatorId) ?? 0) + 1);
    }

    if (counts.size === 0) {
      setStorefrontCache(res);
      res.json({data: {creators: []}});
      return;
    }

    const refs = Array.from(counts.keys()).map((id) =>
      db.collection("users").doc(id)
    );
    const userDocs = await db.getAll(...refs);

    const creators: Array<PublicCreator & {programCount: number}> = [];
    for (const doc of userDocs) {
      if (!doc.exists) continue;
      const data = doc.data() ?? {};
      if (data.role !== "creator" && data.role !== "admin") continue;
      const username = data.username;
      if (typeof username !== "string" || !USERNAME_RE.test(username)) continue;
      const shaped = shapePublicCreator(data, username);
      if (!shaped) continue;
      creators.push({...shaped, programCount: counts.get(doc.id) ?? 0});
    }

    creators.sort((a, b) =>
      a.displayName.localeCompare(b.displayName, "es", {sensitivity: "base"})
    );

    setStorefrontCache(res);
    res.json({data: {creators}});
  }
);

// ─── Storefront checkout ───────────────────────────────────────────────────
//
// POST /public/checkout/start
//
// Auth required (Firebase ID token). The visitor just signed in / signed up
// in the landing app's auth modal; this endpoint:
//   1. Validates the program is published AND owned by the named creator.
//   2. Bootstraps the user doc with storefront-acquisition flags so the PWA
//      can defer onboarding on first entry.
//   3. Initiates MercadoPago checkout (one-time or subscription) and returns
//      the init_point URL.

const STOREFRONT_REDIRECT_ALLOWED_ORIGINS = new Set([
  "https://wakelab.co",
  "https://www.wakelab.co",
  "https://wolf-20b8b.web.app",
  "https://wolf-20b8b.firebaseapp.com",
  "https://wake-staging.web.app",
  "https://wake-staging.firebaseapp.com",
]);
const STOREFRONT_REDIRECT_DEFAULT = "https://wakelab.co";

// Programs sold via the storefront. `one_on_one` is intentionally excluded —
// those go through booking, not direct checkout. Anything else (future
// `bundle`, `event`, etc.) must be opted in here explicitly.
const STOREFRONT_SELLABLE_DELIVERY_TYPES = new Set(["low_ticket", "general"]);

// Pending subscriptions younger than this window short-circuit to the existing
// init_point on retry instead of minting a new MP preapproval — defends
// against double-click double-charges.
const SUBSCRIPTION_DEDUPE_WINDOW_MS = 10 * 60 * 1000;

function resolveStorefrontBase(req: Request): string {
  const origin = req.get("origin");
  if (origin && STOREFRONT_REDIRECT_ALLOWED_ORIGINS.has(origin)) return origin;
  // Fall back to the request's host when the origin is missing/unknown
  // (mobile WebViews strip origin on same-origin POST). Only use the host if it
  // is itself one of our allowed origins; otherwise default to production.
  const host = req.get("host");
  if (host) {
    const candidate = `https://${host}`;
    if (STOREFRONT_REDIRECT_ALLOWED_ORIGINS.has(candidate)) return candidate;
  }
  return STOREFRONT_REDIRECT_DEFAULT;
}

function getMpClient() {
  const token = process.env.MERCADOPAGO_ACCESS_TOKEN;
  if (!token) {
    throw new WakeApiServerError(
      "SERVICE_UNAVAILABLE", 503, "Servicio de pagos no configurado"
    );
  }
  return getClient(token);
}

// MP rejects titles longer than ~256 chars with an opaque error; pre-truncate
// so we either succeed cleanly or surface a precise validation message.
function truncateMpTitle(raw: string | undefined, fallback: string): string {
  const value = (raw && raw.trim()) || fallback;
  return value.length > 200 ? value.slice(0, 197) + "…" : value;
}

// Mirror of payments.ts logCheckout: full-fidelity checkout-step logging under
// `checkout.<step>` so storefront subscriptions can also be reconstructed from
// Cloud Logging. MP payloads are logged verbatim (no card data, no secrets).
function logCheckout(step: string, data: Record<string, unknown>): void {
  functions.logger.info(`checkout.${step}`, {flow: "checkout", step, ...data});
}

router.post("/public/checkout/start", async (req, res) => {
  const auth = await validateAuth(req);
  await checkRateLimit(auth.userId, 30, "rate_limit_first_party");

  const body = validateBody<{
    username: string;
    courseId: string;
    mode: "one_time" | "subscription";
    payerEmail?: string;
    surface?: string;
  }>(
    {
      username: "string",
      courseId: "string",
      mode: "string",
      // CR-5: must be declared in the schema or validateBody strips it,
      // breaking the alternate-email retry flow.
      payerEmail: "optional_string",
      surface: "optional_string",
    },
    req.body
  );
  const surface = typeof body.surface === "string" ? body.surface : "storefront";

  const username = (body.username || "").toLowerCase().trim();
  if (!USERNAME_RE.test(username)) {
    throw new WakeApiServerError("VALIDATION_ERROR", 400, "username inválido", "username");
  }
  if (!COURSE_ID_RE.test(body.courseId) || RESERVED_COURSE_IDS.has(body.courseId)) {
    throw new WakeApiServerError("VALIDATION_ERROR", 400, "courseId inválido", "courseId");
  }
  if (body.mode !== "one_time" && body.mode !== "subscription") {
    throw new WakeApiServerError("VALIDATION_ERROR", 400, "mode debe ser one_time o subscription", "mode");
  }

  // Resolve creator
  const creatorLookup = await lookupCreatorByUsername(username);
  if (!creatorLookup) {
    throw new WakeApiServerError("NOT_FOUND", 404, STOREFRONT_NOT_FOUND);
  }

  // Resolve course; must be published AND owned by the named creator
  const courseDoc = await db.collection("courses").doc(body.courseId).get();
  if (!courseDoc.exists) {
    throw new WakeApiServerError("NOT_FOUND", 404, STOREFRONT_NOT_FOUND);
  }
  const course = courseDoc.data() ?? {};
  if (course.creator_id !== creatorLookup.userId || course.status !== "published") {
    throw new WakeApiServerError("NOT_FOUND", 404, STOREFRONT_NOT_FOUND);
  }
  // Allowlist of delivery types the storefront sells. `!== one_on_one` was
  // wrong: any future delivery type would silently fall through to checkout.
  // Match the listing endpoint's default ("general") so a program missing the
  // field — which still appears on the storefront card — doesn't fail checkout.
  const courseDeliveryType =
    typeof course.deliveryType === "string" && course.deliveryType.trim() ?
      course.deliveryType :
      "general";
  if (!STOREFRONT_SELLABLE_DELIVERY_TYPES.has(courseDeliveryType)) {
    throw new WakeApiServerError(
      "VALIDATION_ERROR", 400, "Este programa no se vende por la tienda"
    );
  }
  // Fail fast if the course is misconfigured: without access_duration the
  // payment webhook can't compute expires_at and silently records
  // error_type:"missing_access_duration" — the user pays but never gets
  // access. Better to refuse the checkout than surface support tickets.
  if (typeof course.access_duration !== "string" || !course.access_duration.trim()) {
    functions.logger.error("storefront.checkout.course_missing_access_duration", {
      courseId: body.courseId,
      creatorId: creatorLookup.userId,
    });
    throw new WakeApiServerError(
      "VALIDATION_ERROR", 400, "Este programa no está disponible para compra ahora"
    );
  }

  // Resolve buyer email from the verified ID-token claims. Avoids a separate
  // admin.auth().getUser() round-trip — the token already carries email/name,
  // and the lookup also breaks local dev (functions emulator + auth emulator
  // can't see users created against production Firebase Auth).
  const buyerEmail = (auth.email || "").trim().toLowerCase();
  if (!buyerEmail || !EMAIL_RE.test(buyerEmail)) {
    throw new WakeApiServerError(
      "VALIDATION_ERROR", 400, "Tu cuenta debe tener un correo válido", "email"
    );
  }

  // Already-purchased guard: if this buyer already has an active enrollment in
  // the course, short-circuit with 409 and a redirect-to-PWA URL. Avoids the
  // common "I forgot I bought this" double-charge support ticket.
  const existingUserDoc = await db.collection("users").doc(auth.userId).get();
  const existingCourses = (
    existingUserDoc.data()?.courses ?? {}
  ) as Record<string, {status?: string; expires_at?: string | null}>;
  const existingEntry = existingCourses[body.courseId];
  if (existingEntry?.status === "active") {
    const expiresAt = existingEntry.expires_at;
    const stillValid =
      !expiresAt || (typeof expiresAt === "string" && Date.parse(expiresAt) > Date.now());
    if (stillValid) {
      res.status(409).json({
        error: {
          code: "CONFLICT",
          message: "Ya tienes acceso a este programa",
        },
        alreadyPurchased: true,
        appUrl: "/app/",
      });
      return;
    }
  }

  // Beta cap: refuse checkout once the program is full. Real lock — the public
  // buy page also hides the button, but a client could call this directly.
  await assertCourseHasSeat(body.courseId, course);

  // Bootstrap user doc with storefront-acquisition flags. Include displayName
  // from the ID-token claims so a race with onUserCreated doesn't leave the
  // doc with no display name during the window between writes.
  const bootstrapDisplayName = auth.displayName ?? null;
  const userDocSeed: Record<string, unknown> = {
    email: buyerEmail,
    updated_at: FieldValue.serverTimestamp(),
  };
  // Acquisition attribution is first-touch only — retries (or buying a
  // second program later) must not overwrite where the user originally came
  // from. Set on first attempt, then never again.
  const existingUserData = existingUserDoc.data() ?? {};
  if (!existingUserData.acquiredVia) {
    userDocSeed.acquiredVia = "creator_storefront";
    userDocSeed.acquisitionCreator = creatorLookup.userId;
    userDocSeed.acquisitionCourse = body.courseId;
    userDocSeed.onboardingDeferred = true;
  }
  // Only seed displayName/role/created_at if the user doc didn't exist before
  // — never overwrite an existing displayName the user may have edited.
  if (!existingUserDoc.exists) {
    userDocSeed.displayName = bootstrapDisplayName;
    userDocSeed.role = "user";
    userDocSeed.created_at = FieldValue.serverTimestamp();
  }
  await db.collection("users").doc(auth.userId).set(userDocSeed, {merge: true});

  const base = resolveStorefrontBase(req);
  const successUrl = `${base}/${encodeURIComponent(username)}/comprado?course=${encodeURIComponent(body.courseId)}`;
  // Subscription back URL signals the post-payment screen to render the
  // "subscription authorized — first charge pending" variant. MP does not
  // append `?status` for subscription preapproval back_url, so this is the
  // only signal the SPA gets.
  const subscriptionSuccessUrl = `${successUrl}&mode=subscription`;

  if (body.mode === "one_time") {
    const price = course.price;
    if (typeof price !== "number" || !Number.isInteger(price) || price <= 0) {
      throw new WakeApiServerError(
        "VALIDATION_ERROR", 400, "Este programa no ofrece pago único"
      );
    }

    const externalReference = buildExternalReference(auth.userId, body.courseId, "otp");
    const client = getMpClient();
    const preference = new Preference(client);

    let result;
    try {
      result = await preference.create({
        body: {
          binary_mode: true,
          items: [{
            id: body.courseId,
            title: truncateMpTitle(course.title as string | undefined, "Programa"),
            quantity: 1,
            unit_price: price,
          }],
          external_reference: externalReference,
          back_urls: {
            // binary_mode:true makes MP only return approved/rejected — pending
            // never fires, so omit the pending URL entirely.
            success: successUrl,
            failure: successUrl,
          },
          // auto_return:"all" so a rejected payment also redirects back to
          // /comprado (with status=rejected) instead of stranding the user on
          // MP's failure page. binary_mode:true already ensures no pending.
          auto_return: "all",
        },
      });
    } catch (err) {
      functions.logger.error("storefront one_time preference failed", {
        userId: auth.userId,
        courseId: body.courseId,
        ...safeErrorPayload(err),
      });
      throw new WakeApiServerError("INTERNAL_ERROR", 500, "No se pudo crear el pago");
    }

    if (!result.init_point) {
      throw new WakeApiServerError("INTERNAL_ERROR", 500, "No se pudo crear el pago");
    }

    res.json({data: {initPoint: result.init_point, mode: "one_time"}});
    return;
  }

  // ─── Subscription mode ───────────────────────────────────────────────────
  const monthlyPrice =
    typeof course.subscription_price === "number" &&
    Number.isInteger(course.subscription_price) &&
    course.subscription_price > 0 ?
      course.subscription_price :
      null;
  if (monthlyPrice === null) {
    throw new WakeApiServerError(
      "VALIDATION_ERROR", 400, "Este programa no ofrece suscripción"
    );
  }

  // MP requires payer_email match the buyer's MP account. Default to the
  // Firebase Auth email; allow override (some users have a different MP email)
  // via body.payerEmail when the first attempt errors.
  const payerEmailRaw = (body.payerEmail || buyerEmail).trim().toLowerCase();
  if (!EMAIL_RE.test(payerEmailRaw)) {
    throw new WakeApiServerError("VALIDATION_ERROR", 400, "Email de pago inválido", "payerEmail");
  }
  if (payerEmailRaw !== buyerEmail) {
    // H-11: log alt-email overrides for fraud review without exposing the
    // address itself.
    functions.logger.info("storefront.payer_email.override", {
      userId: auth.userId,
      courseId: body.courseId,
      payerEmail: redactEmailForLog(payerEmailRaw),
      buyerEmail: redactEmailForLog(buyerEmail),
    });
  }

  // CR-6: subscription idempotency. If a recent pending row exists for the
  // same user+course, return its existing init_point instead of creating a
  // second MP preapproval. Authorized rows hit the already-purchased guard
  // above, so we only need to dedupe pending here.
  const subsCol = db
    .collection("users")
    .doc(auth.userId)
    .collection("subscriptions");
  const recentPendingSnap = await subsCol
    .where("course_id", "==", body.courseId)
    .where("status", "==", "pending")
    .limit(5)
    .get();
  const cutoff = Date.now() - SUBSCRIPTION_DEDUPE_WINDOW_MS;
  for (const d of recentPendingSnap.docs) {
    const sd = d.data();
    const initPoint = sd.init_point as string | undefined;
    const createdAt = sd.created_at as FirebaseFirestore.Timestamp | undefined;
    if (!initPoint) continue;
    const createdMs = createdAt ? createdAt.toMillis() : 0;
    if (createdMs >= cutoff) {
      res.json({
        data: {
          initPoint,
          subscriptionId: sd.subscription_id ?? d.id,
          mode: "subscription",
          deduped: true,
        },
      });
      return;
    }
  }

  const externalRef = buildExternalReference(auth.userId, body.courseId, "sub");
  const emailType: "account" | "custom" =
    payerEmailRaw === buyerEmail ? "account" : "custom";
  const client = getMpClient();
  const preapproval = new PreApproval(client);
  const startDate = new Date(Date.now() + 5 * 60 * 1000);

  logCheckout("subscription.create.attempt", {
    userId: auth.userId,
    courseId: body.courseId,
    externalReference: externalRef,
    surface,
    emailType,
    payerEmail: payerEmailRaw,
    accountEmail: buyerEmail,
    monthlyPrice,
  });

  let result;
  try {
    result = await preapproval.create({
      body: {
        payer_email: payerEmailRaw,
        reason: truncateMpTitle(course.title as string | undefined, "Suscripción"),
        external_reference: externalRef,
        auto_recurring: {
          frequency: 1,
          frequency_type: "months",
          transaction_amount: monthlyPrice,
          currency_id: "COP",
          start_date: startDate.toISOString(),
        },
        status: "pending",
        back_url: subscriptionSuccessUrl,
      },
    });
  } catch (error: unknown) {
    const rawMsg = error instanceof Error ? error.message : String(error);
    const msg = rawMsg.toLowerCase();
    const needsAltEmail =
      msg.includes("cannot operate between different") ||
      msg.includes("payer_email") ||
      msg.includes("belongs to another user") ||
      msg.includes("must belong to this site");

    logCheckout("subscription.create.fail", {
      userId: auth.userId,
      courseId: body.courseId,
      externalReference: externalRef,
      surface,
      emailType,
      payerEmail: payerEmailRaw,
      needsAltEmail,
      mpMessage: rawMsg,
      mp: error instanceof Error ? {name: error.name, message: error.message} : error,
    });

    if (needsAltEmail) {
      res.status(409).json({
        error: {code: "CONFLICT", message: "Por favor ingresa tu correo de Mercado Pago"},
        requireAlternateEmail: true,
      });
      return;
    }
    functions.logger.error("storefront subscription failed", {
      userId: auth.userId,
      courseId: body.courseId,
      ...safeErrorPayload(error),
    });
    throw new WakeApiServerError("INTERNAL_ERROR", 500, "No se pudo crear la suscripción");
  }

  if (!result.init_point || !result.id) {
    throw new WakeApiServerError("INTERNAL_ERROR", 500, "No se pudo crear la suscripción");
  }

  // M-9: never trust an upstream value as a Firestore doc ID without
  // shape-asserting it first — a malformed value could traverse subcollections.
  if (!MP_RESULT_ID_RE.test(result.id)) {
    functions.logger.error("storefront.subscription.malformed_result_id", {
      userId: auth.userId,
      courseId: body.courseId,
    });
    throw new WakeApiServerError("INTERNAL_ERROR", 500, "No se pudo crear la suscripción");
  }

  // Capture next_billing_date upfront so the PWA's subscription UI shows the
  // first-charge date without waiting for the subscription_preapproval webhook
  // to round-trip. Mirrors Gen1 createSubscriptionCheckout. Failure to read
  // here is non-fatal — start_date is the safe fallback.
  let nextBillingDate: string | null = null;
  try {
    const preapprovalDetails =
      await preapproval.get({id: result.id}) as MercadoPagoPreapproval;
    nextBillingDate =
      preapprovalDetails?.next_payment_date ||
      preapprovalDetails?.auto_recurring?.next_payment_date ||
      preapprovalDetails?.auto_recurring?.start_date ||
      null;
  } catch (detailsErr) {
    functions.logger.warn("storefront.subscription.next_billing_date_fetch_failed", {
      preapprovalId: result.id,
      ...safeErrorPayload(detailsErr),
    });
  }
  if (!nextBillingDate) nextBillingDate = startDate.toISOString();

  await subsCol
    .doc(result.id)
    .set({
      subscription_id: result.id,
      user_id: auth.userId,
      course_id: body.courseId,
      course_title: course.title || "Suscripción",
      status: "pending",
      payer_email: payerEmailRaw,
      transaction_amount: monthlyPrice,
      access_duration: "monthly",
      currency_id: "COP",
      // Persist init_point so retries can short-circuit (CR-6).
      init_point: result.init_point,
      management_url: `https://www.mercadopago.com.co/subscriptions/management?preapproval_id=${result.id}`,
      next_billing_date: nextBillingDate,
      created_at: FieldValue.serverTimestamp(),
      updated_at: FieldValue.serverTimestamp(),
    }, {merge: true});

  logCheckout("subscription.create.ok", {
    userId: auth.userId,
    courseId: body.courseId,
    externalReference: externalRef,
    subscriptionId: result.id,
    surface,
    emailType,
    status: result.status ?? null,
    nextBillingDate,
    mp: result,
  });

  res.json({
    data: {
      initPoint: result.init_point,
      subscriptionId: result.id,
      mode: "subscription",
    },
  });
});

// GET /public/checkout/status?course={courseId}
//
// Auth required (Firebase ID token). Returns whether the buyer has active
// access to a given program. /comprado polls this until the webhook lands so
// the UI can confirm "your program is ready" before sending the user into the
// PWA — closes the race window between MP redirect and webhook processing.
router.get("/public/checkout/status", async (req, res) => {
  const auth = await validateAuth(req);
  await checkRateLimit(auth.userId, 60, "rate_limit_first_party");

  const courseId = String(req.query.course || "");
  if (!COURSE_ID_RE.test(courseId)) {
    throw new WakeApiServerError("VALIDATION_ERROR", 400, "courseId inválido", "course");
  }

  const userDoc = await db.collection("users").doc(auth.userId).get();
  const courses = (userDoc.data()?.courses ?? {}) as Record<
    string,
    {status?: string; expires_at?: string | null}
  >;
  const entry = courses[courseId];
  const expiresAt = entry?.expires_at ?? null;
  const stillValid =
    !expiresAt || (typeof expiresAt === "string" && Date.parse(expiresAt) > Date.now());
  const active = entry?.status === "active" && stillValid;

  res.json({data: {active, expiresAt}});
});

// ─── Beta capacity + waitlist ──────────────────────────────────────────────

// GET /public/programs/:programId/availability
//
// Public, unauthenticated. Returns {capacity, seatsRemaining, isFull} so a buy
// page can render the "Cupos agotados → lista de espera" state before the user
// clicks. The checkout endpoint is the real gate; this is just for UX.
router.get("/public/programs/:programId/availability", async (req, res) => {
  const programId = req.params.programId || "";
  if (!COURSE_ID_RE.test(programId) || RESERVED_COURSE_IDS.has(programId)) {
    throw new WakeApiServerError("NOT_FOUND", 404, STOREFRONT_NOT_FOUND);
  }
  const programDoc = await db.collection("courses").doc(programId).get();
  if (!programDoc.exists || programDoc.data()?.status !== "published") {
    throw new WakeApiServerError("NOT_FOUND", 404, STOREFRONT_NOT_FOUND);
  }
  const availability = await getCourseAvailability(programId, programDoc.data() ?? {});
  // Short cache: seat counts change, but a 30s window protects Firestore from
  // bursts without making the sold-out signal feel stale.
  res.setHeader("Cache-Control", "public, max-age=30, s-maxage=30");
  res.json({data: availability});
});

// POST /public/programs/:programId/waitlist
//
// Public, unauthenticated. Captures {email, name} when a program is sold out.
// Dedup by email so joining twice is a no-op. Mirrors the event waitlist.
router.post("/public/programs/:programId/waitlist", async (req, res) => {
  await checkIpRateLimit(req, 10);

  const programId = req.params.programId || "";
  if (!COURSE_ID_RE.test(programId) || RESERVED_COURSE_IDS.has(programId)) {
    throw new WakeApiServerError("NOT_FOUND", 404, STOREFRONT_NOT_FOUND);
  }

  const body = validateBody<{ email: string; name: string }>(
    {email: "string", name: "string"},
    req.body,
    {maxStringLength: 200}
  );
  const email = body.email.trim().toLowerCase();
  const name = body.name.trim();
  if (!EMAIL_RE.test(email)) {
    throw new WakeApiServerError("VALIDATION_ERROR", 400, "Email inválido", "email");
  }
  if (!name) {
    throw new WakeApiServerError("VALIDATION_ERROR", 400, "Ingresa tu nombre", "name");
  }

  const programDoc = await db.collection("courses").doc(programId).get();
  if (!programDoc.exists || programDoc.data()?.status !== "published") {
    throw new WakeApiServerError("NOT_FOUND", 404, STOREFRONT_NOT_FOUND);
  }

  const waitlistCol = db.collection("courses").doc(programId).collection("waitlist");
  const existing = await waitlistCol.where("email", "==", email).limit(1).get();
  if (!existing.empty) {
    res.status(200).json({data: {status: "waitlisted", alreadyOnList: true}});
    return;
  }

  await waitlistCol.add({
    email,
    name,
    created_at: FieldValue.serverTimestamp(),
  });
  res.status(201).json({data: {status: "waitlisted", alreadyOnList: false}});
});

export default router;
