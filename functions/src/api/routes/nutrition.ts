import { Router } from "express";
import * as admin from "firebase-admin";
import { validateAuth } from "../middleware/auth.js";
import { validateBody } from "../middleware/validate.js";
import { checkRateLimit } from "../middleware/rateLimit.js";
import { WakeApiServerError } from "../errors.js";

const router = Router();
const db = admin.firestore();

// GET /nutrition/diary
router.get("/nutrition/diary", async (req, res) => {
  const auth = await validateAuth(req);
  await checkRateLimit(auth.userId, 200, "rate_limit_first_party");

  const { date, startDate, endDate } = req.query as Record<string, string>;

  let query: admin.firestore.Query = db
    .collection("users")
    .doc(auth.userId)
    .collection("diary");

  if (date) {
    query = query.where("date", "==", date);
  } else if (startDate && endDate) {
    query = query
      .where("date", ">=", startDate)
      .where("date", "<=", endDate);
  }

  query = query.orderBy("date", "desc").limit(30);
  const snapshot = await query.get();

  const entries = snapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
  }));

  res.json({ data: entries });
});

// POST /nutrition/diary
router.post("/nutrition/diary", async (req, res) => {
  const auth = await validateAuth(req);
  await checkRateLimit(auth.userId, 200, "rate_limit_first_party");

  const body = validateBody<{
    date: string;
    meal_type: string;
    foods: unknown[];
  }>(
    { date: "string", meal_type: "string", foods: "array" },
    req.body
  );

  const docRef = await db
    .collection("users")
    .doc(auth.userId)
    .collection("diary")
    .add({
      ...body,
      created_at: admin.firestore.FieldValue.serverTimestamp(),
      updated_at: admin.firestore.FieldValue.serverTimestamp(),
    });

  res.status(201).json({ data: { id: docRef.id } });
});

// PATCH /nutrition/diary/:entryId
router.patch("/nutrition/diary/:entryId", async (req, res) => {
  const auth = await validateAuth(req);
  await checkRateLimit(auth.userId, 200, "rate_limit_first_party");

  const docRef = db
    .collection("users")
    .doc(auth.userId)
    .collection("diary")
    .doc(req.params.entryId);

  const doc = await docRef.get();
  if (!doc.exists) {
    throw new WakeApiServerError("NOT_FOUND", 404, "Entrada no encontrada");
  }

  const updates = { ...req.body, updated_at: admin.firestore.FieldValue.serverTimestamp() };
  await docRef.update(updates);

  res.json({ data: { updated: true } });
});

// DELETE /nutrition/diary/:entryId
router.delete("/nutrition/diary/:entryId", async (req, res) => {
  const auth = await validateAuth(req);
  await checkRateLimit(auth.userId, 200, "rate_limit_first_party");

  const docRef = db
    .collection("users")
    .doc(auth.userId)
    .collection("diary")
    .doc(req.params.entryId);

  const doc = await docRef.get();
  if (!doc.exists) {
    throw new WakeApiServerError("NOT_FOUND", 404, "Entrada no encontrada");
  }

  await docRef.delete();
  res.status(204).send();
});

// GET /nutrition/foods/search — FatSecret proxy with cache
router.get("/nutrition/foods/search", async (req, res) => {
  const auth = await validateAuth(req);
  await checkRateLimit(
    auth.authType === "apikey" ? auth.keyId! : auth.userId,
    auth.authType === "apikey" ? 60 : 200,
    auth.authType === "apikey" ? "rate_limit_windows" : "rate_limit_first_party"
  );

  const q = req.query.q as string;
  const page = parseInt(req.query.page as string) || 0;

  if (!q || typeof q !== "string") {
    throw new WakeApiServerError(
      "VALIDATION_ERROR", 400, "Parámetro q es requerido", "q"
    );
  }

  if (q.length > 200) {
    throw new WakeApiServerError(
      "VALIDATION_ERROR", 400,
      "Búsqueda demasiado larga (máx 200 caracteres)", "q"
    );
  }

  // Check Firestore cache first (cost optimization per COST_MODEL.md)
  const crypto = await import("node:crypto");
  const cacheKey = crypto
    .createHash("md5")
    .update(`${q.trim().toLowerCase()}_${page}`)
    .digest("hex");

  const cacheRef = db.collection("nutrition_food_cache").doc(cacheKey);
  const cached = await cacheRef.get();

  if (cached.exists) {
    const cacheData = cached.data()!;
    const expiresAt = cacheData.expires_at?.toDate?.() ?? new Date(0);
    if (expiresAt > new Date()) {
      res.json({ data: cacheData.results, cached: true });
      return;
    }
  }

  // Call FatSecret via the existing Gen1 function's token logic
  // We need FatSecret credentials from environment/secrets
  const { FATSECRET_CLIENT_ID, FATSECRET_CLIENT_SECRET } = process.env;
  if (!FATSECRET_CLIENT_ID || !FATSECRET_CLIENT_SECRET) {
    throw new WakeApiServerError(
      "SERVICE_UNAVAILABLE", 503,
      "Servicio de nutrición no configurado"
    );
  }

  const fsToken = await getFatSecretToken(
    FATSECRET_CLIENT_ID, FATSECRET_CLIENT_SECRET
  );

  const params = new URLSearchParams({
    search_expression: q.trim(),
    page_number: String(page),
    max_results: "20",
    format: "json",
    region: "ES",
    language: "es",
  });

  const fsRes = await fetch(
    `https://platform.fatsecret.com/rest/foods/search/v4?${params}`,
    { headers: { Authorization: `Bearer ${fsToken}` } }
  );

  if (!fsRes.ok) {
    throw new WakeApiServerError(
      "SERVICE_UNAVAILABLE", 503, "Búsqueda de alimentos falló"
    );
  }

  const results = await fsRes.json();

  // Cache for 30 days
  const thirtyDays = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  cacheRef.set({
    results,
    query: q.trim().toLowerCase(),
    cached_at: admin.firestore.FieldValue.serverTimestamp(),
    expires_at: admin.firestore.Timestamp.fromDate(thirtyDays),
  }).catch(() => {});

  res.json({ data: results });
});

// GET /nutrition/foods/:foodId
router.get("/nutrition/foods/:foodId", async (req, res) => {
  const auth = await validateAuth(req);
  await checkRateLimit(
    auth.authType === "apikey" ? auth.keyId! : auth.userId,
    auth.authType === "apikey" ? 60 : 200,
    auth.authType === "apikey" ? "rate_limit_windows" : "rate_limit_first_party"
  );

  const { FATSECRET_CLIENT_ID, FATSECRET_CLIENT_SECRET } = process.env;
  if (!FATSECRET_CLIENT_ID || !FATSECRET_CLIENT_SECRET) {
    throw new WakeApiServerError(
      "SERVICE_UNAVAILABLE", 503, "Servicio de nutrición no configurado"
    );
  }

  const fsToken = await getFatSecretToken(
    FATSECRET_CLIENT_ID, FATSECRET_CLIENT_SECRET
  );

  const params = new URLSearchParams({
    food_id: req.params.foodId,
    format: "json",
    region: "ES",
    language: "es",
  });

  const fsRes = await fetch(
    `https://platform.fatsecret.com/rest/food/v5?${params}`,
    { headers: { Authorization: `Bearer ${fsToken}` } }
  );

  if (!fsRes.ok) {
    if (fsRes.status === 404) {
      throw new WakeApiServerError("NOT_FOUND", 404, "Alimento no encontrado");
    }
    throw new WakeApiServerError(
      "SERVICE_UNAVAILABLE", 503, "Detalle de alimento falló"
    );
  }

  const result = await fsRes.json();
  res.json({ data: result });
});

// GET /nutrition/foods/barcode/:barcode
router.get("/nutrition/foods/barcode/:barcode", async (req, res) => {
  const auth = await validateAuth(req);
  await checkRateLimit(
    auth.authType === "apikey" ? auth.keyId! : auth.userId,
    auth.authType === "apikey" ? 60 : 200,
    auth.authType === "apikey" ? "rate_limit_windows" : "rate_limit_first_party"
  );

  const barcode = req.params.barcode;
  if (!/^\d{8,14}$/.test(barcode)) {
    throw new WakeApiServerError(
      "VALIDATION_ERROR", 400,
      "El código de barras debe contener entre 8 y 14 dígitos",
      "barcode"
    );
  }

  const { FATSECRET_CLIENT_ID, FATSECRET_CLIENT_SECRET } = process.env;
  if (!FATSECRET_CLIENT_ID || !FATSECRET_CLIENT_SECRET) {
    throw new WakeApiServerError(
      "SERVICE_UNAVAILABLE", 503, "Servicio de nutrición no configurado"
    );
  }

  const fsToken = await getFatSecretToken(
    FATSECRET_CLIENT_ID, FATSECRET_CLIENT_SECRET, "basic barcode"
  );

  const params = new URLSearchParams({
    barcode,
    format: "json",
    region: "ES",
    language: "es",
  });

  const fsRes = await fetch(
    `https://platform.fatsecret.com/rest/food/barcode/find-by-id/v2?${params}`,
    { headers: { Authorization: `Bearer ${fsToken}` } }
  );

  if (!fsRes.ok) {
    if (fsRes.status === 404) {
      throw new WakeApiServerError(
        "NOT_FOUND", 404,
        "Ningún alimento encontrado para ese código de barras"
      );
    }
    throw new WakeApiServerError(
      "SERVICE_UNAVAILABLE", 503,
      "Búsqueda por código de barras falló"
    );
  }

  const result = await fsRes.json();
  res.json({ data: result });
});

// GET /nutrition/saved-foods
router.get("/nutrition/saved-foods", async (req, res) => {
  const auth = await validateAuth(req);
  await checkRateLimit(auth.userId, 200, "rate_limit_first_party");

  const snapshot = await db
    .collection("users")
    .doc(auth.userId)
    .collection("saved_foods")
    .orderBy("created_at", "desc")
    .get();

  const foods = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  res.json({ data: foods });
});

// POST /nutrition/saved-foods
router.post("/nutrition/saved-foods", async (req, res) => {
  const auth = await validateAuth(req);
  await checkRateLimit(auth.userId, 200, "rate_limit_first_party");

  const docRef = await db
    .collection("users")
    .doc(auth.userId)
    .collection("saved_foods")
    .add({
      ...req.body,
      created_at: admin.firestore.FieldValue.serverTimestamp(),
    });

  res.status(201).json({ data: { id: docRef.id } });
});

// DELETE /nutrition/saved-foods/:savedFoodId
router.delete("/nutrition/saved-foods/:savedFoodId", async (req, res) => {
  const auth = await validateAuth(req);
  await checkRateLimit(auth.userId, 200, "rate_limit_first_party");

  const docRef = db
    .collection("users")
    .doc(auth.userId)
    .collection("saved_foods")
    .doc(req.params.savedFoodId);

  const doc = await docRef.get();
  if (!doc.exists) {
    throw new WakeApiServerError("NOT_FOUND", 404, "Alimento guardado no encontrado");
  }

  await docRef.delete();
  res.status(204).send();
});

// GET /nutrition/assignment
router.get("/nutrition/assignment", async (req, res) => {
  const auth = await validateAuth(req);
  await checkRateLimit(auth.userId, 200, "rate_limit_first_party");

  const snapshot = await db
    .collection("nutrition_assignments")
    .where("userId", "==", auth.userId)
    .where("status", "==", "active")
    .limit(1)
    .get();

  if (snapshot.empty) {
    res.json({ data: null });
    return;
  }

  const assignment = snapshot.docs[0];
  const contentDoc = await db
    .collection("client_nutrition_plan_content")
    .doc(assignment.id)
    .get();

  res.json({
    data: {
      id: assignment.id,
      ...assignment.data(),
      content: contentDoc.exists ? contentDoc.data() : null,
    },
  });
});

// ─── FatSecret token helper (mirrors Gen1 logic) ──────────────────────────
const FS_TOKEN_BUFFER_MS = 5 * 60 * 1000;
const fsTokenCache = new Map<string, { token: string; expiresAt: number }>();

async function getFatSecretToken(
  clientId: string,
  clientSecret: string,
  scope = "premier"
): Promise<string> {
  const cached = fsTokenCache.get(scope);
  if (cached && Date.now() < cached.expiresAt - FS_TOKEN_BUFFER_MS) {
    return cached.token;
  }

  const auth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const body = new URLSearchParams({ grant_type: "client_credentials", scope }).toString();

  const tokenRes = await fetch("https://oauth.fatsecret.com/connect/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${auth}`,
    },
    body,
  });

  if (!tokenRes.ok) {
    throw new Error("FatSecret auth failed");
  }

  const data = (await tokenRes.json()) as {
    access_token?: string;
    expires_in?: number;
  };

  if (!data?.access_token) {
    throw new Error("FatSecret auth failed");
  }

  const expiresAt =
    Date.now() +
    (typeof data.expires_in === "number" ? data.expires_in : 86400) * 1000;
  fsTokenCache.set(scope, { token: data.access_token, expiresAt });
  return data.access_token;
}

export default router;
