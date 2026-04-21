import {Router} from "express";
import {db, FieldValue} from "../firestore.js";
import type {DocumentSnapshot} from "../firestore.js";
import {validateAuthAndRateLimit} from "../middleware/auth.js";
import {checkIpRateLimit} from "../middleware/rateLimit.js";
import {validateBody, pickFields} from "../middleware/validate.js";
import {WakeApiServerError} from "../errors.js";
import {COURSE_ID_RE} from "../services/paymentHelpers.js";

const router = Router();

const ALLOWED_BUNDLE_STATUSES = ["draft", "published", "archived"];

// Simplified pricing: one OTP price (grants 1 year) and one subscription price
// (billed monthly). Either can be null/omitted, but at least one must exist.
interface BundlePricing {
  otp?: number | null;
  subscription?: number | null;
}

// Adapter for legacy bundles stored with duration-keyed maps.
// Picks yearly OTP (or first positive value) and monthly sub (or first).
function normalizeLegacyPricing(raw: unknown): BundlePricing {
  if (!raw || typeof raw !== "object") return {};
  const p = raw as Record<string, unknown>;
  const result: BundlePricing = {};

  const coerceScalar = (value: unknown, preferredKey: string): number | null => {
    if (typeof value === "number" && Number.isFinite(value) && value > 0) return value;
    if (value && typeof value === "object" && !Array.isArray(value)) {
      const map = value as Record<string, unknown>;
      const pref = map[preferredKey];
      if (typeof pref === "number" && Number.isFinite(pref) && pref > 0) return pref;
      for (const v of Object.values(map)) {
        if (typeof v === "number" && Number.isFinite(v) && v > 0) return v;
      }
    }
    return null;
  };

  const otp = coerceScalar(p.otp, "yearly");
  if (otp !== null) result.otp = otp;
  const sub = coerceScalar(p.subscription, "monthly");
  if (sub !== null) result.subscription = sub;
  return result;
}

function requireCreator(auth: { role: string }): void {
  if (auth.role !== "creator" && auth.role !== "admin") {
    throw new WakeApiServerError("FORBIDDEN", 403, "Acceso restringido a creadores");
  }
}

function validateBundleId(bundleId: string): void {
  if (!COURSE_ID_RE.test(bundleId)) {
    throw new WakeApiServerError("VALIDATION_ERROR", 400, "bundleId inválido", "bundleId");
  }
}

function validateCourseIds(courseIds: unknown): string[] {
  if (!Array.isArray(courseIds)) {
    throw new WakeApiServerError("VALIDATION_ERROR", 400, "courseIds debe ser un array", "courseIds");
  }
  if (courseIds.length < 2) {
    throw new WakeApiServerError(
      "VALIDATION_ERROR", 400,
      "Un bundle debe incluir al menos 2 programas",
      "courseIds"
    );
  }
  const seen = new Set<string>();
  for (const id of courseIds) {
    if (typeof id !== "string" || !COURSE_ID_RE.test(id)) {
      throw new WakeApiServerError(
        "VALIDATION_ERROR", 400,
        "courseIds contiene un identificador inválido",
        "courseIds"
      );
    }
    if (seen.has(id)) {
      throw new WakeApiServerError(
        "VALIDATION_ERROR", 400,
        "courseIds no puede contener duplicados",
        "courseIds"
      );
    }
    seen.add(id);
  }
  return courseIds as string[];
}

// Basic ownership + shape check. Used at bundle create/patch time.
// Allows any program the creator owns, draft or published, bundle-only or not.
async function validateBundleConstituents(courseIds: string[], creatorId: string): Promise<void> {
  const refs = courseIds.map((id) => db.collection("courses").doc(id));
  const docs = await db.getAll(...refs);
  for (const doc of docs) {
    if (!doc.exists) {
      throw new WakeApiServerError(
        "VALIDATION_ERROR", 400,
        `El programa ${doc.id} no existe`,
        "courseIds"
      );
    }
    const data = doc.data()!;
    if (data.creator_id !== creatorId) {
      throw new WakeApiServerError(
        "VALIDATION_ERROR", 400,
        `El programa ${doc.id} no pertenece a este creador`,
        "courseIds"
      );
    }
    if (data.deliveryType === "one_on_one") {
      throw new WakeApiServerError(
        "VALIDATION_ERROR", 400,
        `El programa ${doc.id} es 1:1 y no puede incluirse en un bundle`,
        "courseIds"
      );
    }
  }
}

// Strict check run only when transitioning a bundle to "published".
// A constituent must be ready to deliver: either published itself, or
// flagged bundle-only (meaning it's designed to ship only inside bundles).
async function validateConstituentsForPublish(courseIds: string[]): Promise<void> {
  const refs = courseIds.map((id) => db.collection("courses").doc(id));
  const docs = await db.getAll(...refs);
  for (const doc of docs) {
    if (!doc.exists) continue;
    const data = doc.data()!;
    const visibility = (data.visibility as string | undefined) ?? "both";
    const isBundleOnly = visibility === "bundle-only";
    if (data.status !== "published" && !isBundleOnly) {
      throw new WakeApiServerError(
        "VALIDATION_ERROR", 400,
        `El programa "${data.title ?? doc.id}" está en borrador. ` +
        "Publícalo o márcalo como \"Solo en bundles\" antes de publicar este bundle.",
        "courseIds"
      );
    }
  }
}

function validateScalarPrice(value: unknown, field: string): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    throw new WakeApiServerError(
      "VALIDATION_ERROR", 400,
      `${field} debe ser un número positivo o null`,
      "pricing",
    );
  }
  return value;
}

function validatePricing(pricing: unknown): BundlePricing {
  if (!pricing || typeof pricing !== "object" || Array.isArray(pricing)) {
    throw new WakeApiServerError(
      "VALIDATION_ERROR", 400,
      "pricing debe ser un objeto con otp y/o subscription",
      "pricing",
    );
  }
  const p = pricing as Record<string, unknown>;
  const result: BundlePricing = {};

  const otp = validateScalarPrice(p.otp, "pricing.otp");
  const sub = validateScalarPrice(p.subscription, "pricing.subscription");

  if (otp === null && sub === null) {
    throw new WakeApiServerError(
      "VALIDATION_ERROR", 400,
      "El bundle debe tener al menos un precio (pago único o suscripción mensual)",
      "pricing",
    );
  }
  if (otp !== null) result.otp = otp;
  if (sub !== null) result.subscription = sub;
  return result;
}

function normalizeBundleResponse(doc: DocumentSnapshot): Record<string, unknown> {
  const data = doc.data()!;
  return {
    id: doc.id,
    ...data,
    imageUrl: data.image_url ?? null,
    pricing: normalizeLegacyPricing(data.pricing),
  };
}

// Batched resolve of course image_urls for a set of bundles so consumer
// surfaces can render a fan-out cover without a per-bundle round trip.
async function enrichWithCoverImages(
  bundles: Record<string, unknown>[],
  maxPerBundle = 4,
): Promise<void> {
  if (bundles.length === 0) return;
  const unique = new Set<string>();
  for (const b of bundles) {
    const ids = Array.isArray(b.courseIds) ? (b.courseIds as string[]) : [];
    for (const id of ids.slice(0, maxPerBundle)) unique.add(id);
  }
  if (unique.size === 0) return;
  const refs = [...unique].map((id) => db.collection("courses").doc(id));
  const docs = await db.getAll(...refs);
  const imageById = new Map<string, string | null>();
  for (const d of docs) {
    imageById.set(d.id, d.exists ? ((d.data()?.image_url as string | undefined) ?? null) : null);
  }
  for (const b of bundles) {
    const ids = Array.isArray(b.courseIds) ? (b.courseIds as string[]) : [];
    b.coverImages = ids
      .slice(0, maxPerBundle)
      .map((id) => imageById.get(id) ?? null)
      .filter((url): url is string => !!url);
  }
}

function versionStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

// ─── Creator-owned endpoints ─────────────────────────────────────────────────

// GET /creator/bundles — list current creator's bundles (all statuses)
router.get("/creator/bundles", async (req, res) => {
  const auth = await validateAuthAndRateLimit(req);
  requireCreator(auth);

  const snapshot = await db.collection("bundles")
    .where("creatorId", "==", auth.userId)
    .limit(50)
    .get();

  const items = snapshot.docs.map(normalizeBundleResponse);
  items.sort((a, b) => {
    const aTs = (a.updated_at as {toMillis?: () => number} | undefined)?.toMillis?.() ?? 0;
    const bTs = (b.updated_at as {toMillis?: () => number} | undefined)?.toMillis?.() ?? 0;
    return bTs - aTs;
  });

  await enrichWithCoverImages(items);
  res.json({data: items});
});

// GET /creator/bundles/:bundleId — single bundle, creator ownership enforced
router.get("/creator/bundles/:bundleId", async (req, res) => {
  const auth = await validateAuthAndRateLimit(req);
  requireCreator(auth);
  validateBundleId(req.params.bundleId);

  const doc = await db.collection("bundles").doc(req.params.bundleId).get();
  if (!doc.exists || doc.data()?.creatorId !== auth.userId) {
    throw new WakeApiServerError("NOT_FOUND", 404, "Bundle no encontrado");
  }

  const normalized = normalizeBundleResponse(doc);
  await enrichWithCoverImages([normalized]);
  res.json({data: normalized});
});

// POST /creator/bundles — create draft bundle
router.post("/creator/bundles", async (req, res) => {
  const auth = await validateAuthAndRateLimit(req);
  requireCreator(auth);

  const body = validateBody<{
    title: string;
    description?: string;
    image_url?: string;
    image_path?: string;
    courseIds: unknown;
    pricing: unknown;
  }>({
    title: "string",
    description: "optional_string",
    image_url: "optional_string",
    image_path: "optional_string",
    courseIds: "array",
    pricing: "object",
  }, req.body);

  const courseIds = validateCourseIds(body.courseIds);
  await validateBundleConstituents(courseIds, auth.userId);
  const pricing = validatePricing(body.pricing);

  const docRef = await db.collection("bundles").add({
    creatorId: auth.userId,
    title: body.title,
    description: body.description ?? "",
    image_url: body.image_url ?? null,
    image_path: body.image_path ?? null,
    courseIds,
    pricing,
    status: "draft",
    version: versionStr(),
    created_at: FieldValue.serverTimestamp(),
    updated_at: FieldValue.serverTimestamp(),
  });

  res.status(201).json({data: {id: docRef.id}});
});

// PATCH /creator/bundles/:bundleId — update mutable fields
router.patch("/creator/bundles/:bundleId", async (req, res) => {
  const auth = await validateAuthAndRateLimit(req);
  requireCreator(auth);
  validateBundleId(req.params.bundleId);

  const docRef = db.collection("bundles").doc(req.params.bundleId);
  const doc = await docRef.get();
  if (!doc.exists || doc.data()?.creatorId !== auth.userId) {
    throw new WakeApiServerError("NOT_FOUND", 404, "Bundle no encontrado");
  }

  const allowedFields = ["title", "description", "image_url", "image_path", "courseIds", "pricing"];
  const updates = pickFields(req.body, allowedFields);

  if (Object.keys(updates).length === 0) {
    throw new WakeApiServerError("VALIDATION_ERROR", 400, "No se proporcionaron campos para actualizar");
  }

  if (updates.courseIds !== undefined) {
    const courseIds = validateCourseIds(updates.courseIds);
    await validateBundleConstituents(courseIds, auth.userId);
    updates.courseIds = courseIds;
  }

  if (updates.pricing !== undefined) {
    updates.pricing = validatePricing(updates.pricing);
  }

  if (updates.title !== undefined && (typeof updates.title !== "string" || updates.title.trim() === "")) {
    throw new WakeApiServerError("VALIDATION_ERROR", 400, "title no puede estar vacío", "title");
  }

  await docRef.update({
    ...updates,
    updated_at: FieldValue.serverTimestamp(),
  });

  res.json({data: {updated: true}});
});

// PATCH /creator/bundles/:bundleId/status — publish/archive/back-to-draft
router.patch("/creator/bundles/:bundleId/status", async (req, res) => {
  const auth = await validateAuthAndRateLimit(req);
  requireCreator(auth);
  validateBundleId(req.params.bundleId);

  const {status} = validateBody<{ status: string }>({status: "string"}, req.body);
  if (!ALLOWED_BUNDLE_STATUSES.includes(status)) {
    throw new WakeApiServerError(
      "VALIDATION_ERROR", 400,
      `Estado inválido. Valores permitidos: ${ALLOWED_BUNDLE_STATUSES.join(", ")}`,
      "status"
    );
  }

  const docRef = db.collection("bundles").doc(req.params.bundleId);
  const doc = await docRef.get();
  if (!doc.exists || doc.data()?.creatorId !== auth.userId) {
    throw new WakeApiServerError("NOT_FOUND", 404, "Bundle no encontrado");
  }

  if (status === "published") {
    const data = doc.data()!;
    const courseIds = validateCourseIds(data.courseIds);
    await validateBundleConstituents(courseIds, auth.userId);
    await validateConstituentsForPublish(courseIds);
    validatePricing(data.pricing);
  }

  await docRef.update({
    status,
    updated_at: FieldValue.serverTimestamp(),
  });

  res.json({data: {status}});
});

// GET /creator/bundles/:bundleId/analytics — usage summary for the detail screen
router.get("/creator/bundles/:bundleId/analytics", async (req, res) => {
  const auth = await validateAuthAndRateLimit(req);
  requireCreator(auth);
  validateBundleId(req.params.bundleId);

  const bundleDoc = await db.collection("bundles").doc(req.params.bundleId).get();
  if (!bundleDoc.exists || bundleDoc.data()?.creatorId !== auth.userId) {
    throw new WakeApiServerError("NOT_FOUND", 404, "Bundle no encontrado");
  }

  const paymentsSnap = await db.collection("processed_payments")
    .where("bundle_id", "==", req.params.bundleId)
    .get();

  const approved = paymentsSnap.docs
    .map((d) => d.data() as Record<string, unknown>)
    .filter((p) => p.status === "approved" || p.state === "completed");

  const uniqueUsers = new Set<string>();
  let revenueTotal = 0;
  let otpCount = 0;
  let subCount = 0;
  type Purchase = {
    userId: string;
    amount: number;
    kind: "otp" | "sub";
    date: string | null;
    paymentId: string | null;
  };
  const purchases: Purchase[] = [];

  for (const p of approved) {
    const userId = p.userId as string | undefined;
    if (userId) uniqueUsers.add(userId);
    const amount = typeof p.amount === "number" ? p.amount : 0;
    revenueTotal += amount;
    const isSub = p.isSubscription === true || p.payment_type === "bundle-sub";
    if (isSub) subCount++;
    else otpCount++;
    const ts = p.processed_at as {toMillis?: () => number} | undefined;
    const millis = ts?.toMillis?.() ?? null;
    purchases.push({
      userId: userId ?? "",
      amount,
      kind: isSub ? "sub" : "otp",
      date: millis ? new Date(millis).toISOString() : null,
      paymentId: (p.paymentId as string | undefined) ?? null,
    });
  }

  purchases.sort((a, b) => {
    const ad = a.date ? Date.parse(a.date) : 0;
    const bd = b.date ? Date.parse(b.date) : 0;
    return bd - ad;
  });
  const recent = purchases.slice(0, 10);

  // Fetch display names for the recent 10 only, single batched read.
  const recentUserIds = [...new Set(recent.map((r) => r.userId).filter(Boolean))];
  const userNames = new Map<string, string>();
  if (recentUserIds.length > 0) {
    const refs = recentUserIds.map((id) => db.collection("users").doc(id));
    const userDocs = await db.getAll(...refs);
    for (const d of userDocs) {
      if (!d.exists) continue;
      const data = d.data()!;
      const name = (data.displayName as string | undefined) ||
        (data.name as string | undefined) ||
        (data.email as string | undefined) ||
        null;
      if (name) userNames.set(d.id, name);
    }
  }

  const recentWithNames = recent.map((r) => ({
    ...r,
    userName: userNames.get(r.userId) ?? null,
  }));

  res.json({data: {
    enrollments: uniqueUsers.size,
    revenueTotal,
    otpCount,
    subCount,
    recentPurchases: recentWithNames,
  }});
});

// DELETE /creator/bundles/:bundleId — hard delete, blocked if any purchase exists
router.delete("/creator/bundles/:bundleId", async (req, res) => {
  const auth = await validateAuthAndRateLimit(req);
  requireCreator(auth);
  validateBundleId(req.params.bundleId);

  const docRef = db.collection("bundles").doc(req.params.bundleId);
  const doc = await docRef.get();
  if (!doc.exists || doc.data()?.creatorId !== auth.userId) {
    throw new WakeApiServerError("NOT_FOUND", 404, "Bundle no encontrado");
  }

  const purchaseProbe = await db.collection("processed_payments")
    .where("bundle_id", "==", req.params.bundleId)
    .limit(1)
    .get();

  if (!purchaseProbe.empty) {
    throw new WakeApiServerError(
      "CONFLICT", 409,
      "No se puede eliminar un bundle con compras registradas. Archívalo para " +
      "ocultarlo sin afectar a quienes ya compraron.",
    );
  }

  await docRef.delete();
  res.json({data: {deleted: true}});
});

// ─── Public endpoints (anon allowed) ─────────────────────────────────────────

// GET /bundles?creatorId=X — published bundles for a creator's public page
router.get("/bundles", async (req, res) => {
  await checkIpRateLimit(req, 60);

  const creatorId = req.query.creatorId;
  if (typeof creatorId !== "string" || !COURSE_ID_RE.test(creatorId)) {
    throw new WakeApiServerError("VALIDATION_ERROR", 400, "creatorId es requerido", "creatorId");
  }

  const snapshot = await db.collection("bundles")
    .where("creatorId", "==", creatorId)
    .where("status", "==", "published")
    .limit(50)
    .get();

  const items = snapshot.docs.map(normalizeBundleResponse);
  items.sort((a, b) => {
    const aTs = (a.updated_at as {toMillis?: () => number} | undefined)?.toMillis?.() ?? 0;
    const bTs = (b.updated_at as {toMillis?: () => number} | undefined)?.toMillis?.() ?? 0;
    return bTs - aTs;
  });

  await enrichWithCoverImages(items);
  res.json({data: items});
});

// GET /bundles/:bundleId — public detail for a published bundle, with resolved course summaries
router.get("/bundles/:bundleId", async (req, res) => {
  await checkIpRateLimit(req, 60);
  validateBundleId(req.params.bundleId);

  const doc = await db.collection("bundles").doc(req.params.bundleId).get();
  if (!doc.exists) {
    throw new WakeApiServerError("NOT_FOUND", 404, "Bundle no encontrado");
  }

  const data = doc.data()!;
  if (data.status !== "published") {
    throw new WakeApiServerError("NOT_FOUND", 404, "Bundle no encontrado");
  }

  const courseIds = Array.isArray(data.courseIds) ? (data.courseIds as string[]) : [];
  const refs = courseIds.map((id) => db.collection("courses").doc(id));
  const courseDocs = refs.length > 0 ? await db.getAll(...refs) : [];
  const courses = courseDocs
    .filter((cDoc) => cDoc.exists)
    .map((cDoc) => {
      const c = cDoc.data()!;
      return {
        id: cDoc.id,
        title: c.title ?? null,
        image_url: c.image_url ?? null,
        discipline: c.discipline ?? null,
        creatorName: c.creatorName ?? null,
      };
    });

  const coverImages = courses
    .map((c) => c.image_url)
    .filter((url): url is string => !!url)
    .slice(0, 4);

  res.json({data: {...normalizeBundleResponse(doc), courses, coverImages}});
});

export default router;
