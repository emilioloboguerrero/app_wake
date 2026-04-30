import {Router} from "express";
import * as functions from "firebase-functions";
import {db, FieldValue, Timestamp} from "../firestore.js";
import type {Query} from "../firestore.js";
import {validateAuth} from "../middleware/auth.js";
import {validateBody, pickFields, validateDateFormat} from "../middleware/validate.js";
import {checkRateLimit} from "../middleware/rateLimit.js";
import {WakeApiServerError} from "../errors.js";
import {updateStreak} from "../streak.js";

const router = Router();

// GET /nutrition/diary
router.get("/nutrition/diary", async (req, res) => {
  const auth = await validateAuth(req);
  await checkRateLimit(auth.userId, 200, "rate_limit_first_party");

  const {date, startDate, endDate} = req.query as Record<string, string>;

  // Validate date formats
  if (date) validateDateFormat(date, "date");
  if (startDate) validateDateFormat(startDate, "startDate");
  if (endDate) validateDateFormat(endDate, "endDate");

  let query: Query = db
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
    entryId: doc.id,
    ...doc.data(),
  }));

  res.json({data: entries});
});

// POST /nutrition/diary — accepts individual diary entry (one food item per call)
router.post("/nutrition/diary", async (req, res) => {
  const auth = await validateAuth(req);
  await checkRateLimit(auth.userId, 200, "rate_limit_first_party");

  const body = validateBody<{
    date: string;
    meal: string;
    food_id?: string;
    serving_id?: string;
    number_of_units?: number;
    name?: string;
    food_category?: string;
    calories?: number;
    protein?: number;
    carbs?: number;
    fat?: number;
    serving_unit?: string;
    grams_per_unit?: number;
    servings?: unknown[];
    recipe_video_url?: string;
    recipe_name?: string;
    lastKnownActivityDate?: string;
  }>(
    {
      date: "string",
      meal: "string",
      food_id: "optional_string",
      serving_id: "optional_string",
      number_of_units: "optional_number",
      name: "optional_string",
      food_category: "optional_string",
      calories: "optional_number",
      protein: "optional_number",
      carbs: "optional_number",
      fat: "optional_number",
      serving_unit: "optional_string",
      grams_per_unit: "optional_number",
      servings: "optional_array",
      recipe_video_url: "optional_string",
      recipe_name: "optional_string",
      lastKnownActivityDate: "optional_string",
    },
    req.body,
    {maxArrayLength: 100}
  );

  // Validate date format
  validateDateFormat(body.date, "date");

  const {lastKnownActivityDate, ...diaryFields} = body;

  const docRef = await db
    .collection("users")
    .doc(auth.userId)
    .collection("diary")
    .add({
      ...diaryFields,
      userId: auth.userId,
      createdAt: FieldValue.serverTimestamp(),
    });

  const streakResult = await updateStreak(auth.userId, body.date, lastKnownActivityDate);

  res.status(201).json({data: {id: docRef.id, entryId: docRef.id, streakUpdated: streakResult.updated}});
});

// POST /nutrition/diary/batch — add multiple diary entries at once
router.post("/nutrition/diary/batch", async (req, res) => {
  const auth = await validateAuth(req);
  await checkRateLimit(auth.userId, 200, "rate_limit_first_party");

  const {entries} = req.body;
  if (!Array.isArray(entries) || entries.length === 0) {
    throw new WakeApiServerError("VALIDATION_ERROR", 400, "entries debe ser un array no vacío", "entries");
  }
  if (entries.length > 30) {
    throw new WakeApiServerError("VALIDATION_ERROR", 400, "Máximo 30 entradas por lote", "entries");
  }

  const batch = db.batch();
  const ids: string[] = [];

  for (const entry of entries) {
    if (!entry.date || !entry.meal) continue;
    const ref = db.collection("users").doc(auth.userId).collection("diary").doc();
    batch.set(ref, {
      date: entry.date,
      meal: entry.meal,
      food_id: entry.food_id ?? null,
      serving_id: entry.serving_id ?? null,
      number_of_units: entry.number_of_units ?? 1,
      name: entry.name ?? "",
      food_category: entry.food_category ?? null,
      calories: entry.calories ?? null,
      protein: entry.protein ?? null,
      carbs: entry.carbs ?? null,
      fat: entry.fat ?? null,
      serving_unit: entry.serving_unit ?? null,
      grams_per_unit: entry.grams_per_unit ?? null,
      ...(Array.isArray(entry.servings) ? {servings: entry.servings} : {}),
      ...(entry.recipe_video_url ? {recipe_video_url: entry.recipe_video_url} : {}),
      ...(entry.recipe_name ? {recipe_name: entry.recipe_name} : {}),
      userId: auth.userId,
      createdAt: FieldValue.serverTimestamp(),
    });
    ids.push(ref.id);
  }

  await batch.commit();

  // Use date from first entry for streak
  const streakDate = entries[0]?.date;
  const lastKnownActivityDate = req.body.lastKnownActivityDate as string | undefined;
  const streakResult = streakDate ? await updateStreak(auth.userId, streakDate, lastKnownActivityDate) : null;

  res.status(201).json({data: {entryIds: ids, streakUpdated: streakResult?.updated ?? false}});
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

  // Allowlist fields instead of spreading req.body
  const allowedFields = ["date", "meal", "food_id", "serving_id", "number_of_units", "name", "calories", "protein", "carbs", "fat", "serving_unit", "grams_per_unit", "servings", "recipe_video_url", "recipe_name"];
  const updates = pickFields(req.body, allowedFields);

  if (Object.keys(updates).length === 0) {
    throw new WakeApiServerError("VALIDATION_ERROR", 400, "No se proporcionaron campos para actualizar");
  }

  // Validate date if provided
  if (typeof updates.date === "string") validateDateFormat(updates.date, "date");
  // Validate foods array length if provided
  if (Array.isArray(updates.foods) && updates.foods.length > 100) {
    throw new WakeApiServerError("VALIDATION_ERROR", 400, "foods excede el máximo de 100 elementos", "foods");
  }

  await docRef.update({
    ...updates,
    updated_at: FieldValue.serverTimestamp(),
  });

  res.json({data: {updated: true}});
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

  // Check Firestore cache first (cost optimization per COST_MODEL.md).
  // M-15: scope cache key with operation namespace + locale + version so a
  // future cache user (e.g., a per-user enrichment) can't collide with the
  // public FatSecret search response under the same hash.
  const crypto = await import("node:crypto");
  const cacheScope = "fs:search:v4:es";
  const cacheKey = `${cacheScope}__${crypto
    .createHash("md5")
    .update(`${q.trim().toLowerCase()}_${page}`)
    .digest("hex")}`;

  const cacheRef = db.collection("nutrition_food_cache").doc(cacheKey);
  const cached = await cacheRef.get();

  if (cached.exists) {
    const cacheData = cached.data()!;
    const expiresAt = cacheData.expires_at?.toDate?.() ?? new Date(0);
    if (expiresAt > new Date()) {
      res.json({data: cacheData.results, cached: true});
      return;
    }
  }


  // Call FatSecret via the existing Gen1 function's token logic
  const {FATSECRET_CLIENT_ID, FATSECRET_CLIENT_SECRET} = process.env;
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
    {headers: {Authorization: `Bearer ${fsToken}`}}
  );

  if (!fsRes.ok) {
    throw new WakeApiServerError(
      "SERVICE_UNAVAILABLE", 503, "Búsqueda de alimentos falló"
    );
  }

  const rawResults = await fsRes.json();

  // Transform raw FatSecret response into the shape clients expect
  const foodsArray = rawResults?.foods_search?.results?.food ?? rawResults?.foods ?? [];
  const totalResults = parseInt(rawResults?.foods_search?.total_results ?? "0", 10);
  const transformed = {
    foods: Array.isArray(foodsArray) ? foodsArray : [foodsArray],
    totalResults,
    pageNumber: page,
  };

  // Cache for 30 days
  const thirtyDays = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  cacheRef.set({
    results: transformed,
    query: q.trim().toLowerCase(),
    cached_at: FieldValue.serverTimestamp(),
    expires_at: Timestamp.fromDate(thirtyDays),
  }).catch((err) => functions.logger.warn("nutrition:search-cache-write-failed", err));

  res.json({data: transformed});
});

// GET /nutrition/foods/:foodId
router.get("/nutrition/foods/:foodId", async (req, res) => {
  const auth = await validateAuth(req);
  await checkRateLimit(
    auth.authType === "apikey" ? auth.keyId! : auth.userId,
    auth.authType === "apikey" ? 60 : 200,
    auth.authType === "apikey" ? "rate_limit_windows" : "rate_limit_first_party"
  );

  const {FATSECRET_CLIENT_ID, FATSECRET_CLIENT_SECRET} = process.env;
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
    {headers: {Authorization: `Bearer ${fsToken}`}}
  );

  if (!fsRes.ok) {
    if (fsRes.status === 404) {
      throw new WakeApiServerError("NOT_FOUND", 404, "Alimento no encontrado");
    }
    throw new WakeApiServerError(
      "SERVICE_UNAVAILABLE", 503, "Detalle de alimento falló"
    );
  }

  const rawResult = await fsRes.json();
  // Return the food object directly (unwrap {food: {...}} wrapper)
  const foodData = rawResult?.food ?? rawResult;
  res.json({data: foodData});
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

  const {FATSECRET_CLIENT_ID, FATSECRET_CLIENT_SECRET} = process.env;
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
    {headers: {Authorization: `Bearer ${fsToken}`}}
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

  const rawResult = await fsRes.json();
  const foodData = rawResult?.food_id ? rawResult : rawResult?.food ?? rawResult;
  res.json({data: foodData});
});

// GET /nutrition/saved-foods — paginated with limit
router.get("/nutrition/saved-foods", async (req, res) => {
  const auth = await validateAuth(req);
  await checkRateLimit(auth.userId, 200, "rate_limit_first_party");

  const pageToken = req.query.pageToken as string | undefined;
  const limit = 200;

  let query: Query = db
    .collection("users")
    .doc(auth.userId)
    .collection("saved_foods")
    .orderBy("savedAt", "desc")
    .limit(limit + 1);

  if (pageToken) {
    const cursorDoc = await db
      .collection("users")
      .doc(auth.userId)
      .collection("saved_foods")
      .doc(pageToken)
      .get();
    if (cursorDoc.exists) {
      query = query.startAfter(cursorDoc);
    }
  }

  const snapshot = await query.get();
  const docs = snapshot.docs.slice(0, limit);
  const hasMore = snapshot.docs.length > limit;

  res.json({
    data: docs.map((doc) => ({id: doc.id, savedFoodId: doc.id, ...doc.data()})),
    nextPageToken: hasMore ? docs[docs.length - 1].id : null,
    hasMore,
  });
});

// POST /nutrition/saved-foods
router.post("/nutrition/saved-foods", async (req, res) => {
  const auth = await validateAuth(req);
  await checkRateLimit(auth.userId, 200, "rate_limit_first_party");

  // Validate and allowlist fields (snake_case to match Firestore schema)
  const body = validateBody<{
    name: string;
    food_id?: string;
    serving_id?: string;
    serving_description?: string;
    number_of_units?: number;
    food_category?: string;
    calories_per_unit?: number;
    protein_per_unit?: number;
    carbs_per_unit?: number;
    fat_per_unit?: number;
    grams_per_unit?: number;
    servings?: unknown[];
    brand?: string;
    barcode?: string;
  }>(
    {
      name: "string",
      food_id: "optional_string",
      serving_id: "optional_string",
      serving_description: "optional_string",
      number_of_units: "optional_number",
      food_category: "optional_string",
      calories_per_unit: "optional_number",
      protein_per_unit: "optional_number",
      carbs_per_unit: "optional_number",
      fat_per_unit: "optional_number",
      grams_per_unit: "optional_number",
      servings: "optional_array",
      brand: "optional_string",
      barcode: "optional_string",
    },
    req.body,
    {maxArrayLength: 100}
  );

  const docRef = await db
    .collection("users")
    .doc(auth.userId)
    .collection("saved_foods")
    .add({
      ...body,
      userId: auth.userId,
      savedAt: FieldValue.serverTimestamp(),
    });

  res.status(201).json({data: {id: docRef.id, savedFoodId: docRef.id}});
});

// PATCH /nutrition/saved-foods/:savedFoodId
router.patch("/nutrition/saved-foods/:savedFoodId", async (req, res) => {
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

  const allowedFields = [
    "name", "food_id", "serving_id", "serving_description", "number_of_units",
    "food_category", "calories_per_unit", "protein_per_unit", "carbs_per_unit",
    "fat_per_unit", "grams_per_unit", "brand", "barcode",
  ];
  const updates = pickFields(req.body as Record<string, unknown>, allowedFields);

  if (Object.keys(updates).length === 0) {
    throw new WakeApiServerError(
      "VALIDATION_ERROR", 400, "No se proporcionaron campos para actualizar"
    );
  }

  await docRef.update({
    ...updates,
    updated_at: FieldValue.serverTimestamp(),
  });

  res.json({data: {updated: true}});
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

  const date = (req.query.date as string) || new Date().toISOString().slice(0, 10);
  if (req.query.date) validateDateFormat(date, "date");

  // Production assignments may not have a status field — query without status filter
  const assignmentQuery: Query = db
    .collection("nutrition_assignments")
    .where("userId", "==", auth.userId);

  const snapshot = await assignmentQuery.orderBy("createdAt", "desc").limit(20).get();

  // Filter to active-or-no-status in code (production docs lack status field)
  const activeDocs = snapshot.docs.filter((doc) => {
    const s = doc.data().status;
    return !s || s === "active";
  });

  // Filter by date range if assignment has startDate/endDate
  const matchingDocs = activeDocs.filter((doc) => {
    const d = doc.data();
    if (d.startDate && date < d.startDate) return false;
    if (d.endDate && date > d.endDate) return false;
    return true;
  });

  if (matchingDocs.length === 0) {
    res.json({data: null});
    return;
  }

  const assignment = matchingDocs[0];
  const assignmentData = assignment.data();

  // Resolve plan content: client copy → assignment snapshot → library plan
  const contentDoc = await db
    .collection("client_nutrition_plan_content")
    .doc(assignment.id)
    .get();

  const planContent = contentDoc.exists ? contentDoc.data() : assignmentData.planSnapshot ?? assignmentData.plan ?? null;

  // Build categories array from plan content
  const categories: unknown[] = [];
  if (planContent?.categories && Array.isArray(planContent.categories)) {
    for (const cat of planContent.categories) {
      const options: unknown[] = [];
      if (cat.options && Array.isArray(cat.options)) {
        for (const opt of cat.options) {
          const items: unknown[] = [];
          if (opt.items && Array.isArray(opt.items)) {
            for (const item of opt.items) {
              items.push({
                food_id: item.food_id ?? item.foodId ?? null,
                name: item.name ?? "",
                number_of_units: item.number_of_units ?? item.numberOfUnits ?? 1,
                serving_unit: item.serving_unit ?? item.servingUnit ?? null,
                serving_id: item.serving_id ?? item.servingId ?? null,
                grams_per_unit: item.grams_per_unit ?? item.gramsPerUnit ?? null,
                food_category: item.food_category ?? item.foodCategory ?? null,
                calories: item.calories ?? null,
                protein: item.protein ?? null,
                carbs: item.carbs ?? null,
                fat: item.fat ?? null,
                servings: Array.isArray(item.servings) ? item.servings : null,
              });
            }
          }
          options.push({
            id: opt.id ?? null,
            label: opt.label ?? "",
            recipe_name: opt.recipe_name ?? null,
            recipe_video_url: opt.recipe_video_url ?? null,
            items,
          });
        }
      }
      categories.push({
        id: cat.id ?? null,
        label: cat.label ?? "",
        order: cat.order ?? 0,
        options,
      });
    }
  }

  res.json({
    data: {
      assignmentId: assignment.id,
      startDate: assignmentData.startDate ?? null,
      endDate: assignmentData.endDate ?? null,
      plan: {
        name: planContent?.name ?? assignmentData.planName ?? "",
        daily_calories: planContent?.daily_calories ?? null,
        daily_protein_g: planContent?.daily_protein_g ?? null,
        daily_carbs_g: planContent?.daily_carbs_g ?? null,
        daily_fat_g: planContent?.daily_fat_g ?? null,
        categories,
      },
    },
  });
});

// ─── User Meals (PWA meal presets) ────────────────────────────────────────

// GET /nutrition/user-meals
router.get("/nutrition/user-meals", async (req, res) => {
  const auth = await validateAuth(req);
  await checkRateLimit(auth.userId, 200, "rate_limit_first_party");

  const snapshot = await db
    .collection("users")
    .doc(auth.userId)
    .collection("saved_meals")
    .orderBy("created_at", "desc")
    .get();

  res.json({
    data: snapshot.docs.map((d) => ({id: d.id, mealId: d.id, ...d.data()})),
  });
});

// POST /nutrition/user-meals
router.post("/nutrition/user-meals", async (req, res) => {
  const auth = await validateAuth(req);
  await checkRateLimit(auth.userId, 200, "rate_limit_first_party");

  const body = validateBody<{ name: string; items?: unknown[] }>(
    {name: "string", items: "optional_array"},
    req.body,
    {maxArrayLength: 50}
  );

  const docRef = await db
    .collection("users")
    .doc(auth.userId)
    .collection("saved_meals")
    .add({
      ...body,
      created_at: FieldValue.serverTimestamp(),
      updated_at: FieldValue.serverTimestamp(),
    });

  res.status(201).json({data: {id: docRef.id, mealId: docRef.id}});
});

// PATCH /nutrition/user-meals/:mealId
router.patch("/nutrition/user-meals/:mealId", async (req, res) => {
  const auth = await validateAuth(req);
  await checkRateLimit(auth.userId, 200, "rate_limit_first_party");

  const docRef = db
    .collection("users")
    .doc(auth.userId)
    .collection("saved_meals")
    .doc(req.params.mealId);

  const doc = await docRef.get();
  if (!doc.exists) {
    throw new WakeApiServerError("NOT_FOUND", 404, "Comida no encontrada");
  }

  const allowedFields = ["name", "items"];
  const updates = pickFields(req.body, allowedFields);
  if (Object.keys(updates).length === 0) {
    throw new WakeApiServerError("VALIDATION_ERROR", 400, "No se proporcionaron campos para actualizar");
  }

  await docRef.update({...updates, updated_at: FieldValue.serverTimestamp()});
  res.json({data: {updated: true}});
});

// DELETE /nutrition/user-meals/:mealId
router.delete("/nutrition/user-meals/:mealId", async (req, res) => {
  const auth = await validateAuth(req);
  await checkRateLimit(auth.userId, 200, "rate_limit_first_party");

  const docRef = db
    .collection("users")
    .doc(auth.userId)
    .collection("saved_meals")
    .doc(req.params.mealId);

  const doc = await docRef.get();
  if (!doc.exists) {
    throw new WakeApiServerError("NOT_FOUND", 404, "Comida no encontrada");
  }

  await docRef.delete();
  res.status(204).send();
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
  const body = new URLSearchParams({grant_type: "client_credentials", scope}).toString();

  const tokenRes = await fetch("https://oauth.fatsecret.com/connect/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "Authorization": `Basic ${auth}`,
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
  fsTokenCache.set(scope, {token: data.access_token, expiresAt});
  return data.access_token;
}

export default router;
