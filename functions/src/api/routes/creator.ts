import { Router } from "express";
import * as admin from "firebase-admin";
import * as crypto from "node:crypto";
import { db, FieldValue } from "../firestore.js";
import type { Query } from "../firestore.js";
import { validateAuth } from "../middleware/auth.js";
import { validateBody, pickFields, validateStoragePath } from "../middleware/validate.js";
import { checkRateLimit } from "../middleware/rateLimit.js";
import { WakeApiServerError } from "../errors.js";

const router = Router();

function requireCreator(auth: { role: string }): void {
  if (auth.role !== "creator" && auth.role !== "admin") {
    throw new WakeApiServerError("FORBIDDEN", 403, "Acceso restringido a creadores");
  }
}

// GET /creator/clients — paginated 50/page, optional ?programId=X filter
router.get("/creator/clients", async (req, res) => {
  const auth = await validateAuth(req);
  requireCreator(auth);
  await checkRateLimit(auth.userId, 200, "rate_limit_first_party");

  const programId = req.query.programId as string | undefined;
  const pageToken = req.query.pageToken as string | undefined;

  if (programId) {
    // Server-side filtering: fetch all clients, look up each user's courses,
    // return only those enrolled in the requested program.
    let query: Query = db
      .collection("one_on_one_clients")
      .where("creatorId", "==", auth.userId)
      .orderBy("createdAt", "desc");

    const snapshot = await query.get();

    const results: Record<string, unknown>[] = [];
    for (const d of snapshot.docs) {
      const clientData = d.data();
      const userDoc = await db.collection("users").doc(clientData.clientUserId).get();
      const userData = userDoc.data();
      const courses = userData?.courses ?? {};
      const enrollment = courses[programId];
      if (enrollment && enrollment.deliveryType === "one_on_one") {
        results.push({
          id: d.id,
          ...clientData,
          clientName: userData?.displayName ?? userData?.name ?? null,
          clientEmail: userData?.email ?? null,
          avatarUrl: userData?.profilePictureUrl ?? userData?.photoURL ?? null,
          enrolledProgram: { courseId: programId, ...enrollment },
        });
      }
    }

    res.json({ data: results });
    return;
  }

  // Default: paginated list with enrolled programs enrichment
  const limit = 50;

  let query: Query = db
    .collection("one_on_one_clients")
    .where("creatorId", "==", auth.userId)
    .orderBy("createdAt", "desc")
    .limit(limit + 1);

  if (pageToken) {
    const cursor = await db.collection("one_on_one_clients").doc(pageToken).get();
    if (cursor.exists) query = query.startAfter(cursor);
  }

  const snapshot = await query.get();
  const docs = snapshot.docs.slice(0, limit);
  const hasMore = snapshot.docs.length > limit;

  // Enrich each client with their one_on_one enrolled programs
  const clientDocs = docs.map((d) => ({ id: d.id, ...d.data() }));
  const userIds = [...new Set(clientDocs.map((c) => (c as Record<string, unknown>).clientUserId as string).filter(Boolean))];

  const userDocsMap: Record<string, Record<string, unknown>> = {};
  if (userIds.length > 0) {
    const batchSize = 10;
    for (let i = 0; i < userIds.length; i += batchSize) {
      const batch = userIds.slice(i, i + batchSize);
      const userDocs = await db.getAll(...batch.map((uid) => db.collection("users").doc(uid)));
      for (const uDoc of userDocs) {
        if (uDoc.exists) {
          userDocsMap[uDoc.id] = uDoc.data() as Record<string, unknown>;
        }
      }
    }
  }

  const enriched = clientDocs.map((client) => {
    const userId = (client as Record<string, unknown>).clientUserId as string;
    const userData = userDocsMap[userId];
    const courses = (userData?.courses ?? {}) as Record<string, Record<string, unknown>>;
    const enrolledPrograms = Object.entries(courses)
      .filter(([, v]) => v.deliveryType === "one_on_one")
      .map(([courseId, v]) => ({ courseId, title: v.title, status: v.status }));

    return {
      ...client,
      clientName: userData?.displayName ?? userData?.name ?? null,
      clientEmail: userData?.email ?? null,
      avatarUrl: userData?.profilePictureUrl ?? userData?.photoURL ?? null,
      enrolledPrograms,
    };
  });

  res.json({
    data: enriched,
    nextPageToken: hasMore ? docs[docs.length - 1].id : null,
    hasMore,
  });
});

// POST /creator/clients/lookup
router.post("/creator/clients/lookup", async (req, res) => {
  const auth = await validateAuth(req);
  requireCreator(auth);
  await checkRateLimit(auth.userId, 200, "rate_limit_first_party");

  const { emailOrUsername } = req.body as { emailOrUsername?: string };
  if (!emailOrUsername?.trim()) {
    throw new WakeApiServerError("VALIDATION_ERROR", 400, "Email o username requerido");
  }

  const query = emailOrUsername.trim().toLowerCase();

  // Search by email first
  let userSnap = await db.collection("users")
    .where("email", "==", query)
    .limit(1)
    .get();

  // If not found, try by username
  if (userSnap.empty) {
    userSnap = await db.collection("users")
      .where("username", "==", query)
      .limit(1)
      .get();
  }

  if (userSnap.empty) {
    throw new WakeApiServerError("NOT_FOUND", 404, "No se encontró ningún usuario con ese email o username");
  }

  const userDoc = userSnap.docs[0];
  const userData = userDoc.data();

  res.json({
    data: {
      userId: userDoc.id,
      email: userData.email ?? null,
      displayName: userData.displayName ?? null,
      photoURL: userData.photoURL ?? null,
      username: userData.username ?? null,
    },
  });
});

// POST /creator/clients/invite — lookup by email + create client in one step
router.post("/creator/clients/invite", async (req, res) => {
  const auth = await validateAuth(req);
  requireCreator(auth);
  await checkRateLimit(auth.userId, 200, "rate_limit_first_party");

  const { email } = req.body as { email?: string };
  if (!email?.trim()) {
    throw new WakeApiServerError("VALIDATION_ERROR", 400, "Email requerido");
  }

  const query = email.trim().toLowerCase();

  // Look up user by email
  let userSnap = await db.collection("users")
    .where("email", "==", query)
    .limit(1)
    .get();

  // Try by username as fallback
  if (userSnap.empty) {
    userSnap = await db.collection("users")
      .where("username", "==", query)
      .limit(1)
      .get();
  }

  if (userSnap.empty) {
    throw new WakeApiServerError("NOT_FOUND", 404, "No se encontró ningún usuario con ese email");
  }

  const userDoc = userSnap.docs[0];
  const userId = userDoc.id;

  // Check if already a client
  const existing = await db.collection("one_on_one_clients")
    .where("creatorId", "==", auth.userId)
    .where("clientUserId", "==", userId)
    .limit(1)
    .get();

  if (!existing.empty) {
    const existingDoc = existing.docs[0];
    res.status(200).json({
      data: {
        clientId: existingDoc.id,
        userId,
        alreadyExisted: true,
      },
    });
    return;
  }

  const invitedUserData = userDoc.data();
  const docRef = await db.collection("one_on_one_clients").add({
    creatorId: auth.userId,
    clientUserId: userId,
    clientName: invitedUserData?.displayName ?? invitedUserData?.name ?? null,
    clientEmail: invitedUserData?.email ?? null,
    courseId: [],
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  res.status(201).json({
    data: {
      clientId: docRef.id,
      userId,
    },
  });
});

// POST /creator/clients
router.post("/creator/clients", async (req, res) => {
  const auth = await validateAuth(req);
  requireCreator(auth);
  await checkRateLimit(auth.userId, 200, "rate_limit_first_party");

  const body = validateBody<{ userId: string }>(
    { userId: "string" },
    req.body
  );

  // Verify target user exists
  const userDoc = await db.collection("users").doc(body.userId).get();
  if (!userDoc.exists) {
    throw new WakeApiServerError("NOT_FOUND", 404, "Usuario no encontrado");
  }

  const targetUserData = userDoc.data();
  const docRef = await db.collection("one_on_one_clients").add({
    creatorId: auth.userId,
    clientUserId: body.userId,
    clientName: targetUserData?.displayName ?? targetUserData?.name ?? null,
    clientEmail: targetUserData?.email ?? null,
    courseId: [],
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  res.status(201).json({ data: { id: docRef.id, clientId: docRef.id } });
});

// GET /creator/clients/:clientId — single client detail
router.get("/creator/clients/:clientId", async (req, res) => {
  const auth = await validateAuth(req);
  requireCreator(auth);
  await checkRateLimit(auth.userId, 200, "rate_limit_first_party");

  const docRef = db.collection("one_on_one_clients").doc(req.params.clientId);
  const doc = await docRef.get();

  if (!doc.exists || doc.data()?.creatorId !== auth.userId) {
    throw new WakeApiServerError("NOT_FOUND", 404, "Cliente no encontrado");
  }

  const clientData = doc.data()!;
  const clientUserId = clientData.clientUserId ?? clientData.userId;

  // Enrich with user data
  const userDoc = await db.collection("users").doc(clientUserId).get();
  const userData = userDoc.exists ? userDoc.data()! : {};
  const courses = (userData.courses ?? {}) as Record<string, Record<string, unknown>>;
  const enrolledPrograms = Object.entries(courses)
    .filter(([, v]) => v.deliveryType === "one_on_one")
    .map(([courseId, v]) => ({ courseId, title: v.title, status: v.status }));

  res.json({
    data: {
      id: doc.id,
      clientId: doc.id,
      ...clientData,
      clientName: userData.displayName ?? userData.name ?? clientData.clientName ?? null,
      clientEmail: userData.email ?? clientData.clientEmail ?? null,
      avatarUrl: userData.profilePictureUrl ?? userData.photoURL ?? null,
      enrolledPrograms,
      country: userData.country ?? null,
      city: userData.city ?? null,
      gender: userData.gender ?? null,
    },
  });
});

// DELETE /creator/clients/:clientId
router.delete("/creator/clients/:clientId", async (req, res) => {
  const auth = await validateAuth(req);
  requireCreator(auth);
  await checkRateLimit(auth.userId, 200, "rate_limit_first_party");

  const docRef = db.collection("one_on_one_clients").doc(req.params.clientId);
  const doc = await docRef.get();

  if (!doc.exists || doc.data()?.creatorId !== auth.userId) {
    throw new WakeApiServerError("NOT_FOUND", 404, "Cliente no encontrado");
  }

  await docRef.delete();
  res.status(204).send();
});

// GET /creator/programs — paginated
router.get("/creator/programs", async (req, res) => {
  const auth = await validateAuth(req);
  requireCreator(auth);
  await checkRateLimit(auth.userId, 200, "rate_limit_first_party");

  const pageToken = req.query.pageToken as string | undefined;
  const limit = 100;

  let query: Query = db
    .collection("courses")
    .where("creator_id", "==", auth.userId)
    .orderBy("created_at", "desc")
    .limit(limit + 1);

  if (pageToken) {
    const cursor = await db.collection("courses").doc(pageToken).get();
    if (cursor.exists) query = query.startAfter(cursor);
  }

  const snapshot = await query.get();
  const docs = snapshot.docs.slice(0, limit);
  const hasMore = snapshot.docs.length > limit;

  const programs = docs.map((d) => {
    const data = d.data();
    return {
      id: d.id,
      ...data,
      imageUrl: data.image_url ?? null,
    };
  });

  res.json({
    data: programs,
    nextPageToken: hasMore ? docs[docs.length - 1].id : null,
    hasMore,
  });
});

// GET /creator/programs/:programId
router.get("/creator/programs/:programId", async (req, res) => {
  const auth = await validateAuth(req);
  requireCreator(auth);
  await checkRateLimit(auth.userId, 200, "rate_limit_first_party");

  const doc = await db.collection("courses").doc(req.params.programId).get();

  if (!doc.exists || doc.data()?.creator_id !== auth.userId) {
    throw new WakeApiServerError("NOT_FOUND", 404, "Programa no encontrado");
  }

  const programData = doc.data()!;
  res.json({ data: { id: doc.id, ...programData, imageUrl: programData.image_url ?? null } });
});

// POST /creator/programs
router.post("/creator/programs", async (req, res) => {
  const auth = await validateAuth(req);
  requireCreator(auth);
  await checkRateLimit(auth.userId, 200, "rate_limit_first_party");

  // Only destructure validated fields
  const body = validateBody<{
    title: string;
    deliveryType: string;
    description?: string;
    weekly?: boolean;
    price?: number;
    access_duration?: string;
    discipline?: string;
    weight_suggestions?: boolean;
    duration?: string;
  }>(
    {
      title: "string",
      deliveryType: "string",
      description: "optional_string",
      weekly: "optional_boolean",
      price: "optional_number",
      access_duration: "optional_string",
      discipline: "optional_string",
      weight_suggestions: "optional_boolean",
      duration: "optional_string",
    },
    req.body
  );

  const userDoc = await db.collection("users").doc(auth.userId).get();
  const creatorName = userDoc.data()?.displayName || userDoc.data()?.name || "";

  const docRef = await db.collection("courses").add({
    title: body.title,
    deliveryType: body.deliveryType,
    ...(body.description !== undefined && { description: body.description }),
    ...(body.weekly !== undefined && { weekly: body.weekly }),
    ...(body.price !== undefined && { price: body.price }),
    ...(body.access_duration !== undefined && { access_duration: body.access_duration }),
    ...(body.discipline !== undefined && { discipline: body.discipline }),
    ...(body.weight_suggestions !== undefined && { weight_suggestions: body.weight_suggestions }),
    ...(body.duration !== undefined && { duration: body.duration }),
    availableLibraries: Array.isArray(req.body.availableLibraries)
      ? req.body.availableLibraries.filter((id: unknown) => typeof id === "string")
      : [],
    creator_id: auth.userId,
    creatorName,
    status: "draft",
    image_url: null,
    image_path: null,
    video_intro_url: null,
    tutorials: {},
    free_trial: req.body.free_trial && typeof req.body.free_trial === "object"
      ? { active: !!req.body.free_trial.active, duration_days: Math.max(0, parseInt(req.body.free_trial.duration_days, 10) || 0) }
      : { active: false, duration_days: 0 },
    version: `${new Date().getFullYear()}-01`,
    created_at: FieldValue.serverTimestamp(),
    updated_at: FieldValue.serverTimestamp(),
  });

  res.status(201).json({ data: { id: docRef.id } });
});

// PATCH /creator/programs/:programId
router.patch("/creator/programs/:programId", async (req, res) => {
  const auth = await validateAuth(req);
  requireCreator(auth);
  await checkRateLimit(auth.userId, 200, "rate_limit_first_party");

  const docRef = db.collection("courses").doc(req.params.programId);
  const doc = await docRef.get();

  if (!doc.exists || doc.data()?.creator_id !== auth.userId) {
    throw new WakeApiServerError("NOT_FOUND", 404, "Programa no encontrado");
  }

  // Allowlist fields — never allow creator_id, status overwrite
  const allowedFields = [
    "title", "description", "deliveryType", "weekly", "price",
    "access_duration", "discipline", "image_url", "image_path",
    "creatorName", "weight_suggestions", "free_trial", "duration",
    "video_intro_url", "tutorials", "availableLibraries",
  ];
  const updates = pickFields(req.body, allowedFields);

  if (Object.keys(updates).length === 0) {
    throw new WakeApiServerError("VALIDATION_ERROR", 400, "No se proporcionaron campos para actualizar");
  }

  await docRef.update({
    ...updates,
    updated_at: FieldValue.serverTimestamp(),
  });

  res.json({ data: { updated: true } });
});

// PATCH /creator/programs/:programId/status
router.patch("/creator/programs/:programId/status", async (req, res) => {
  const auth = await validateAuth(req);
  requireCreator(auth);
  await checkRateLimit(auth.userId, 200, "rate_limit_first_party");

  const { status } = validateBody<{ status: string }>(
    { status: "string" },
    req.body
  );

  // Validate status against allowlist
  const allowedStatuses = ["draft", "published", "active", "archived"];
  if (!allowedStatuses.includes(status)) {
    throw new WakeApiServerError(
      "VALIDATION_ERROR", 400,
      `Estado inválido. Valores permitidos: ${allowedStatuses.join(", ")}`,
      "status"
    );
  }

  const docRef = db.collection("courses").doc(req.params.programId);
  const doc = await docRef.get();

  if (!doc.exists || doc.data()?.creator_id !== auth.userId) {
    throw new WakeApiServerError("NOT_FOUND", 404, "Programa no encontrado");
  }

  await docRef.update({
    status,
    updated_at: FieldValue.serverTimestamp(),
  });

  res.json({ data: { status } });
});

// DELETE /creator/programs/:programId
router.delete("/creator/programs/:programId", async (req, res) => {
  const auth = await validateAuth(req);
  requireCreator(auth);
  await checkRateLimit(auth.userId, 200, "rate_limit_first_party");

  const docRef = db.collection("courses").doc(req.params.programId);
  const doc = await docRef.get();

  if (!doc.exists || doc.data()?.creator_id !== auth.userId) {
    throw new WakeApiServerError("NOT_FOUND", 404, "Programa no encontrado");
  }

  await docRef.delete();
  res.status(204).send();
});

// POST /creator/programs/:programId/duplicate
router.post("/creator/programs/:programId/duplicate", async (req, res) => {
  const auth = await validateAuth(req);
  requireCreator(auth);
  await checkRateLimit(auth.userId, 200, "rate_limit_first_party");

  const sourceDoc = await db.collection("courses").doc(req.params.programId).get();
  if (!sourceDoc.exists || sourceDoc.data()?.creator_id !== auth.userId) {
    throw new WakeApiServerError("NOT_FOUND", 404, "Programa no encontrado");
  }

  const sourceData = sourceDoc.data()!;
  const newDoc = await db.collection("courses").add({
    ...sourceData,
    title: `${sourceData.title} (copia)`,
    status: "draft",
    created_at: FieldValue.serverTimestamp(),
    updated_at: FieldValue.serverTimestamp(),
  });

  res.status(201).json({ data: { id: newDoc.id } });
});

// POST /creator/programs/:programId/image/upload-url
router.post("/creator/programs/:programId/image/upload-url", async (req, res) => {
  const auth = await validateAuth(req);
  requireCreator(auth);
  await checkRateLimit(auth.userId, 200, "rate_limit_first_party");

  const { contentType } = validateBody<{ contentType: string }>(
    { contentType: "string" },
    req.body
  );

  const storagePath = `course_images/${req.params.programId}/cover.${contentType.split("/")[1] === "jpeg" ? "jpg" : contentType.split("/")[1]}`;
  const bucket = admin.storage().bucket();
  const file = bucket.file(storagePath);

  const [url] = await file.getSignedUrl({
    version: "v4",
    action: "write",
    expires: Date.now() + 15 * 60 * 1000,
    contentType,
  });

  res.json({ data: { uploadUrl: url, storagePath } });
});

// POST /creator/programs/:programId/image/confirm
router.post("/creator/programs/:programId/image/confirm", async (req, res) => {
  const auth = await validateAuth(req);
  requireCreator(auth);
  await checkRateLimit(auth.userId, 200, "rate_limit_first_party");

  const { storagePath } = validateBody<{ storagePath: string }>(
    { storagePath: "string" },
    req.body
  );

  // CRITICAL: Validate storage path prefix to prevent path traversal
  validateStoragePath(storagePath, `course_images/${req.params.programId}/`);

  const bucket = admin.storage().bucket();
  const [exists] = await bucket.file(storagePath).exists();
  if (!exists) {
    throw new WakeApiServerError("NOT_FOUND", 404, "Archivo no encontrado");
  }

  const publicUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(storagePath)}?alt=media`;

  await db.collection("courses").doc(req.params.programId).update({
    image_url: publicUrl,
    image_path: storagePath,
    updated_at: FieldValue.serverTimestamp(),
  });

  res.json({ data: { image_url: publicUrl, image_path: storagePath } });
});

// GET /creator/clients/:clientId/sessions
router.get("/creator/clients/:clientId/sessions", async (req, res) => {
  const auth = await validateAuth(req);
  requireCreator(auth);
  await checkRateLimit(auth.userId, 200, "rate_limit_first_party");

  // Verify creator owns this client
  const clientDoc = await db.collection("one_on_one_clients").doc(req.params.clientId).get();
  if (!clientDoc.exists || clientDoc.data()?.creatorId !== auth.userId) {
    throw new WakeApiServerError("NOT_FOUND", 404, "Cliente no encontrado");
  }

  const clientUserId = clientDoc.data()!.clientUserId ?? clientDoc.data()!.userId;

  const snapshot = await db
    .collection("users")
    .doc(clientUserId)
    .collection("sessionHistory")
    .orderBy("completed_at", "desc")
    .limit(20)
    .get();

  res.json({
    data: snapshot.docs.map((d) => ({ id: d.id, ...d.data() })),
  });
});

// GET /creator/clients/:clientId/activity
router.get("/creator/clients/:clientId/activity", async (req, res) => {
  const auth = await validateAuth(req);
  requireCreator(auth);
  await checkRateLimit(auth.userId, 200, "rate_limit_first_party");

  const clientDoc = await db.collection("one_on_one_clients").doc(req.params.clientId).get();
  if (!clientDoc.exists || clientDoc.data()?.creatorId !== auth.userId) {
    throw new WakeApiServerError("NOT_FOUND", 404, "Cliente no encontrado");
  }

  const clientUserId = clientDoc.data()!.clientUserId ?? clientDoc.data()!.userId;
  const userDoc = await db.collection("users").doc(clientUserId).get();
  const userData = userDoc.data() ?? {};

  res.json({
    data: {
      lastSessionDate: userData.lastSessionDate ?? null,
      currentStreak: userData.currentStreak ?? 0,
      courses: userData.courses ?? {},
    },
  });
});

// ─── Instagram Feed (Behold.so) ───────────────────────────────────────────

const instagramCache: Record<string, { data: unknown; expiresAt: number }> = {};
const INSTAGRAM_CACHE_TTL = 15 * 60 * 1000; // 15 minutes

// GET /creator/instagram-feed
router.get("/creator/instagram-feed", async (req, res) => {
  const auth = await validateAuth(req);
  requireCreator(auth);
  await checkRateLimit(auth.userId, 200, "rate_limit_first_party");

  const userDoc = await db.collection("users").doc(auth.userId).get();
  const beholdFeedId = userDoc.data()?.beholdFeedId;

  if (!beholdFeedId || typeof beholdFeedId !== "string") {
    throw new WakeApiServerError(
      "NOT_FOUND", 404, "No se encontró un feed de Instagram configurado"
    );
  }

  // Check in-memory cache
  const cached = instagramCache[auth.userId];
  if (cached && cached.expiresAt > Date.now()) {
    res.json({ data: cached.data });
    return;
  }

  const feedUrl = `https://feeds.behold.so/${encodeURIComponent(beholdFeedId)}`;
  const response = await fetch(feedUrl);

  if (!response.ok) {
    throw new WakeApiServerError(
      "SERVICE_UNAVAILABLE", 503, "No se pudo obtener el feed de Instagram"
    );
  }

  const feedData = await response.json();

  instagramCache[auth.userId] = {
    data: feedData,
    expiresAt: Date.now() + INSTAGRAM_CACHE_TTL,
  };

  res.json({ data: feedData });
});

// ─── Creator Nutrition Library ─────────────────────────────────────────────

// GET /creator/nutrition/meals
router.get("/creator/nutrition/meals", async (req, res) => {
  const auth = await validateAuth(req);
  requireCreator(auth);
  await checkRateLimit(auth.userId, 200, "rate_limit_first_party");

  const snapshot = await db
    .collection("creator_nutrition_library")
    .doc(auth.userId)
    .collection("meals")
    .orderBy("created_at", "desc")
    .get();

  res.json({
    data: snapshot.docs.map((d) => ({ id: d.id, mealId: d.id, ...d.data() })),
  });
});

// GET /creator/nutrition/meals/:mealId
router.get("/creator/nutrition/meals/:mealId", async (req, res) => {
  const auth = await validateAuth(req);
  requireCreator(auth);
  await checkRateLimit(auth.userId, 200, "rate_limit_first_party");

  const doc = await db
    .collection("creator_nutrition_library")
    .doc(auth.userId)
    .collection("meals")
    .doc(req.params.mealId)
    .get();

  if (!doc.exists) {
    throw new WakeApiServerError("NOT_FOUND", 404, "Comida no encontrada");
  }

  res.json({ data: { id: doc.id, mealId: doc.id, ...doc.data() } });
});

// POST /creator/nutrition/meals
router.post("/creator/nutrition/meals", async (req, res) => {
  const auth = await validateAuth(req);
  requireCreator(auth);
  await checkRateLimit(auth.userId, 200, "rate_limit_first_party");

  // Validate and allowlist meal fields
  const body = validateBody<{
    name: string;
    description?: string;
    calories?: number;
    protein?: number;
    carbs?: number;
    fat?: number;
    items?: unknown[];
    category?: string;
  }>(
    {
      name: "string",
      description: "optional_string",
      calories: "optional_number",
      protein: "optional_number",
      carbs: "optional_number",
      fat: "optional_number",
      items: "optional_array",
      category: "optional_string",
    },
    req.body
  );

  const docRef = await db
    .collection("creator_nutrition_library")
    .doc(auth.userId)
    .collection("meals")
    .add({
      ...body,
      created_at: FieldValue.serverTimestamp(),
      updated_at: FieldValue.serverTimestamp(),
    });

  res.status(201).json({ data: { id: docRef.id, mealId: docRef.id } });
});

// PATCH /creator/nutrition/meals/:mealId
router.patch("/creator/nutrition/meals/:mealId", async (req, res) => {
  const auth = await validateAuth(req);
  requireCreator(auth);
  await checkRateLimit(auth.userId, 200, "rate_limit_first_party");

  const docRef = db
    .collection("creator_nutrition_library")
    .doc(auth.userId)
    .collection("meals")
    .doc(req.params.mealId);

  const doc = await docRef.get();
  if (!doc.exists) {
    throw new WakeApiServerError("NOT_FOUND", 404, "Comida no encontrada");
  }

  // Allowlist meal fields
  const allowedFields = ["name", "description", "calories", "protein", "carbs", "fat", "items", "category"];
  const updates = pickFields(req.body, allowedFields);

  if (Object.keys(updates).length === 0) {
    throw new WakeApiServerError("VALIDATION_ERROR", 400, "No se proporcionaron campos para actualizar");
  }

  await docRef.update({
    ...updates,
    updated_at: FieldValue.serverTimestamp(),
  });

  res.json({ data: { updated: true } });
});

// DELETE /creator/nutrition/meals/:mealId
router.delete("/creator/nutrition/meals/:mealId", async (req, res) => {
  const auth = await validateAuth(req);
  requireCreator(auth);
  await checkRateLimit(auth.userId, 200, "rate_limit_first_party");

  const docRef = db
    .collection("creator_nutrition_library")
    .doc(auth.userId)
    .collection("meals")
    .doc(req.params.mealId);

  const doc = await docRef.get();
  if (!doc.exists) {
    throw new WakeApiServerError("NOT_FOUND", 404, "Comida no encontrada");
  }

  await docRef.delete();
  res.status(204).send();
});

// GET /creator/nutrition/plans
router.get("/creator/nutrition/plans", async (req, res) => {
  const auth = await validateAuth(req);
  requireCreator(auth);
  await checkRateLimit(auth.userId, 200, "rate_limit_first_party");

  const snapshot = await db
    .collection("creator_nutrition_library")
    .doc(auth.userId)
    .collection("plans")
    .orderBy("created_at", "desc")
    .get();

  res.json({
    data: snapshot.docs.map((d) => ({ id: d.id, planId: d.id, ...d.data() })),
  });
});

// POST /creator/nutrition/plans
router.post("/creator/nutrition/plans", async (req, res) => {
  const auth = await validateAuth(req);
  requireCreator(auth);
  await checkRateLimit(auth.userId, 200, "rate_limit_first_party");

  // Validate and allowlist plan fields
  const body = validateBody<{
    name: string;
    description?: string;
    dailyCalories?: number;
    dailyProteinG?: number;
    dailyCarbsG?: number;
    dailyFatG?: number;
    categories?: unknown[];
  }>(
    {
      name: "string",
      description: "optional_string",
      dailyCalories: "optional_number",
      dailyProteinG: "optional_number",
      dailyCarbsG: "optional_number",
      dailyFatG: "optional_number",
      categories: "optional_array",
    },
    req.body
  );

  const docRef = await db
    .collection("creator_nutrition_library")
    .doc(auth.userId)
    .collection("plans")
    .add({
      ...body,
      creatorId: auth.userId,
      created_at: FieldValue.serverTimestamp(),
      updated_at: FieldValue.serverTimestamp(),
    });

  res.status(201).json({ data: { id: docRef.id, planId: docRef.id } });
});

// GET /creator/nutrition/plans/:planId
router.get("/creator/nutrition/plans/:planId", async (req, res) => {
  const auth = await validateAuth(req);
  requireCreator(auth);
  await checkRateLimit(auth.userId, 200, "rate_limit_first_party");

  const doc = await db
    .collection("creator_nutrition_library")
    .doc(auth.userId)
    .collection("plans")
    .doc(req.params.planId)
    .get();

  if (!doc.exists) {
    throw new WakeApiServerError("NOT_FOUND", 404, "Plan no encontrado");
  }

  res.json({ data: { id: doc.id, planId: doc.id, ...doc.data() } });
});

// PATCH /creator/nutrition/plans/:planId
router.patch("/creator/nutrition/plans/:planId", async (req, res) => {
  const auth = await validateAuth(req);
  requireCreator(auth);
  await checkRateLimit(auth.userId, 200, "rate_limit_first_party");

  const docRef = db
    .collection("creator_nutrition_library")
    .doc(auth.userId)
    .collection("plans")
    .doc(req.params.planId);

  const doc = await docRef.get();
  if (!doc.exists) {
    throw new WakeApiServerError("NOT_FOUND", 404, "Plan no encontrado");
  }

  // Allowlist plan fields
  const allowedFields = ["name", "description", "dailyCalories", "dailyProteinG", "dailyCarbsG", "dailyFatG", "categories"];
  const updates = pickFields(req.body, allowedFields);

  if (Object.keys(updates).length === 0) {
    throw new WakeApiServerError("VALIDATION_ERROR", 400, "No se proporcionaron campos para actualizar");
  }

  await docRef.update({
    ...updates,
    updated_at: FieldValue.serverTimestamp(),
  });

  res.json({ data: { updated: true } });
});

// DELETE /creator/nutrition/plans/:planId
router.delete("/creator/nutrition/plans/:planId", async (req, res) => {
  const auth = await validateAuth(req);
  requireCreator(auth);
  await checkRateLimit(auth.userId, 200, "rate_limit_first_party");

  const docRef = db
    .collection("creator_nutrition_library")
    .doc(auth.userId)
    .collection("plans")
    .doc(req.params.planId);

  const doc = await docRef.get();
  if (!doc.exists) {
    throw new WakeApiServerError("NOT_FOUND", 404, "Plan no encontrado");
  }

  await docRef.delete();
  res.status(204).send();
});

// POST /creator/nutrition/plans/:planId/propagate
router.post("/creator/nutrition/plans/:planId/propagate", async (req, res) => {
  const auth = await validateAuth(req);
  requireCreator(auth);
  await checkRateLimit(auth.userId, 200, "rate_limit_first_party");

  const planDoc = await db
    .collection("creator_nutrition_library")
    .doc(auth.userId)
    .collection("plans")
    .doc(req.params.planId)
    .get();

  if (!planDoc.exists) {
    throw new WakeApiServerError("NOT_FOUND", 404, "Plan no encontrado");
  }

  const planData = planDoc.data()!;
  const assignmentsSnap = await db
    .collection("nutrition_assignments")
    .where("planId", "==", req.params.planId)
    .where("assignedBy", "==", auth.userId)
    .get();

  let copiesDeleted = 0;
  const batchSize = 450;
  let batch = db.batch();
  let batchCount = 0;

  for (const assignDoc of assignmentsSnap.docs) {
    const contentRef = db.collection("client_nutrition_plan_content").doc(assignDoc.id);
    batch.set(contentRef, { ...planData, refreshed_at: FieldValue.serverTimestamp() });
    copiesDeleted++;
    batchCount++;
    if (batchCount >= batchSize) {
      await batch.commit();
      batch = db.batch();
      batchCount = 0;
    }
  }
  if (batchCount > 0) await batch.commit();

  res.json({ data: { clientsAffected: assignmentsSnap.size, copiesDeleted } });
});

// ─── Client Nutrition Assignments ─────────────────────────────────────────

// Helper to verify creator-client relationship
async function verifyClientAccess(
  creatorId: string,
  clientId: string
): Promise<string> {
  const snap = await db
    .collection("one_on_one_clients")
    .where("creatorId", "==", creatorId)
    .where("clientUserId", "==", clientId)
    .limit(1)
    .get();
  if (snap.empty) {
    throw new WakeApiServerError("FORBIDDEN", 403, "No tienes acceso a este cliente");
  }
  return clientId;
}

// GET /creator/clients/:clientId/nutrition/assignments
router.get("/creator/clients/:clientId/nutrition/assignments", async (req, res) => {
  const auth = await validateAuth(req);
  requireCreator(auth);
  await checkRateLimit(auth.userId, 200, "rate_limit_first_party");
  await verifyClientAccess(auth.userId, req.params.clientId);

  const snap = await db
    .collection("nutrition_assignments")
    .where("userId", "==", req.params.clientId)
    .where("assignedBy", "==", auth.userId)
    .orderBy("createdAt", "desc")
    .get();

  res.json({ data: snap.docs.map((d) => ({ id: d.id, assignmentId: d.id, ...d.data() })) });
});

// POST /creator/clients/:clientId/nutrition/assignments
router.post("/creator/clients/:clientId/nutrition/assignments", async (req, res) => {
  const auth = await validateAuth(req);
  requireCreator(auth);
  await checkRateLimit(auth.userId, 200, "rate_limit_first_party");
  await verifyClientAccess(auth.userId, req.params.clientId);

  const body = validateBody<{ planId: string; startDate?: string; endDate?: string }>(
    { planId: "string", startDate: "optional_string", endDate: "optional_string" },
    req.body
  );

  const planDoc = await db
    .collection("creator_nutrition_library")
    .doc(auth.userId)
    .collection("plans")
    .doc(body.planId)
    .get();

  if (!planDoc.exists) {
    throw new WakeApiServerError("NOT_FOUND", 404, "Plan no encontrado");
  }

  const planData = planDoc.data()!;
  const assignmentRef = await db.collection("nutrition_assignments").add({
    userId: req.params.clientId,
    assignedBy: auth.userId,
    planId: body.planId,
    planName: planData.name ?? "",
    plan: planData,
    startDate: body.startDate ?? null,
    endDate: body.endDate ?? null,
    status: "active",
    createdAt: FieldValue.serverTimestamp(),
  });

  // Snapshot plan content
  await db.collection("client_nutrition_plan_content").doc(assignmentRef.id).set({
    source_plan_id: body.planId,
    assignment_id: assignmentRef.id,
    name: planData.name ?? "",
    description: planData.description ?? "",
    daily_calories: planData.dailyCalories ?? planData.daily_calories ?? null,
    daily_protein_g: planData.dailyProteinG ?? planData.daily_protein_g ?? null,
    daily_carbs_g: planData.dailyCarbsG ?? planData.daily_carbs_g ?? null,
    daily_fat_g: planData.dailyFatG ?? planData.daily_fat_g ?? null,
    categories: planData.categories ?? [],
    snapshot_at: FieldValue.serverTimestamp(),
  });

  // Pin on user if no existing pinned assignment
  const userDoc = await db.collection("users").doc(req.params.clientId).get();
  if (!userDoc.data()?.pinnedNutritionAssignmentId) {
    await db.collection("users").doc(req.params.clientId).update({
      pinnedNutritionAssignmentId: assignmentRef.id,
    });
  }

  res.status(201).json({ data: { assignmentId: assignmentRef.id } });
});

// PATCH /creator/clients/:clientId/nutrition/assignments/:assignmentId
router.patch("/creator/clients/:clientId/nutrition/assignments/:assignmentId", async (req, res) => {
  const auth = await validateAuth(req);
  requireCreator(auth);
  await checkRateLimit(auth.userId, 200, "rate_limit_first_party");
  await verifyClientAccess(auth.userId, req.params.clientId);

  const assignRef = db.collection("nutrition_assignments").doc(req.params.assignmentId);
  const assignDoc = await assignRef.get();
  if (!assignDoc.exists || assignDoc.data()?.assignedBy !== auth.userId) {
    throw new WakeApiServerError("NOT_FOUND", 404, "Asignación no encontrada");
  }

  const allowedFields = ["status", "startDate", "endDate", "planId", "planName"];
  const updates = pickFields(req.body, allowedFields);

  if (Object.keys(updates).length === 0) {
    throw new WakeApiServerError("VALIDATION_ERROR", 400, "No se proporcionaron campos para actualizar");
  }

  // If status is provided, validate it
  if (updates.status !== undefined) {
    const allowedStatuses = ["active", "paused", "completed"];
    if (!allowedStatuses.includes(updates.status as string)) {
      throw new WakeApiServerError(
        "VALIDATION_ERROR", 400,
        `Estado inválido. Valores permitidos: ${allowedStatuses.join(", ")}`,
        "status"
      );
    }
  }

  await assignRef.update({
    ...updates,
    updatedAt: FieldValue.serverTimestamp(),
  });

  res.json({ data: { updated: true } });
});

// DELETE /creator/clients/:clientId/nutrition/assignments/:assignmentId
router.delete("/creator/clients/:clientId/nutrition/assignments/:assignmentId", async (req, res) => {
  const auth = await validateAuth(req);
  requireCreator(auth);
  await checkRateLimit(auth.userId, 200, "rate_limit_first_party");
  await verifyClientAccess(auth.userId, req.params.clientId);

  const assignRef = db.collection("nutrition_assignments").doc(req.params.assignmentId);
  const assignDoc = await assignRef.get();
  if (!assignDoc.exists || assignDoc.data()?.assignedBy !== auth.userId) {
    throw new WakeApiServerError("NOT_FOUND", 404, "Asignación no encontrada");
  }

  const batch = db.batch();
  batch.delete(assignRef);
  batch.delete(db.collection("client_nutrition_plan_content").doc(req.params.assignmentId));
  await batch.commit();

  res.status(204).send();
});

// GET /creator/clients/:clientId/nutrition/diary
router.get("/creator/clients/:clientId/nutrition/diary", async (req, res) => {
  const auth = await validateAuth(req);
  requireCreator(auth);
  await checkRateLimit(auth.userId, 200, "rate_limit_first_party");
  await verifyClientAccess(auth.userId, req.params.clientId);

  const { date, startDate, endDate } = req.query as Record<string, string>;
  let query: Query = db
    .collection("users")
    .doc(req.params.clientId)
    .collection("diary");

  if (date) {
    query = query.where("date", "==", date);
  } else if (startDate && endDate) {
    query = query.where("date", ">=", startDate).where("date", "<=", endDate);
  }

  query = query.orderBy("date", "desc").limit(30);
  const snapshot = await query.get();
  res.json({ data: snapshot.docs.map((d) => ({ id: d.id, ...d.data() })) });
});

// ─── Creator Plans Hierarchy (modules/sessions/exercises/sets) ────────────

// POST /creator/plans
router.post("/creator/plans", async (req, res) => {
  const auth = await validateAuth(req);
  requireCreator(auth);
  await checkRateLimit(auth.userId, 200, "rate_limit_first_party");

  const { title, description, discipline } = req.body as {
    title?: string;
    description?: string;
    discipline?: string;
  };
  if (!title || typeof title !== "string") {
    throw new WakeApiServerError("VALIDATION_ERROR", 400, "title es requerido");
  }

  // Look up creator's displayName
  const creatorDoc = await db.collection("users").doc(auth.userId).get();
  const creatorName = creatorDoc.data()?.displayName ?? "";

  const planData: Record<string, unknown> = {
    title,
    creator_id: auth.userId,
    creatorName,
    created_at: FieldValue.serverTimestamp(),
    updated_at: FieldValue.serverTimestamp(),
  };
  if (description) planData.description = description;
  if (discipline) planData.discipline = discipline;

  const planRef = await db.collection("plans").add(planData);

  // Auto-create first module
  const moduleRef = await db
    .collection("plans")
    .doc(planRef.id)
    .collection("modules")
    .add({
      title: "Semana 1",
      order: 0,
      created_at: FieldValue.serverTimestamp(),
    });

  res.status(201).json({ data: { id: planRef.id, firstModuleId: moduleRef.id } });
});

// GET /creator/plans
router.get("/creator/plans", async (req, res) => {
  const auth = await validateAuth(req);
  requireCreator(auth);
  await checkRateLimit(auth.userId, 200, "rate_limit_first_party");

  const snap = await db
    .collection("plans")
    .where("creator_id", "==", auth.userId)
    .orderBy("created_at", "desc")
    .get();

  res.json({ data: snap.docs.map((d) => ({ id: d.id, ...d.data() })) });
});

// GET /creator/plans/:planId
router.get("/creator/plans/:planId", async (req, res) => {
  const auth = await validateAuth(req);
  requireCreator(auth);
  await checkRateLimit(auth.userId, 200, "rate_limit_first_party");

  const planDoc = await db.collection("plans").doc(req.params.planId).get();
  if (!planDoc.exists || planDoc.data()?.creator_id !== auth.userId) {
    throw new WakeApiServerError("NOT_FOUND", 404, "Plan no encontrado");
  }

  const modulesSnap = await db
    .collection("plans")
    .doc(req.params.planId)
    .collection("modules")
    .orderBy("order", "asc")
    .get();

  const modules = await Promise.all(
    modulesSnap.docs.map(async (mDoc) => {
      const sessionsSnap = await db
        .collection("plans")
        .doc(req.params.planId)
        .collection("modules")
        .doc(mDoc.id)
        .collection("sessions")
        .orderBy("order", "asc")
        .get();

      return {
        moduleId: mDoc.id,
        ...mDoc.data(),
        sessions: sessionsSnap.docs.map((s) => ({
          sessionId: s.id,
          ...s.data(),
        })),
      };
    })
  );

  res.json({ data: { id: planDoc.id, ...planDoc.data(), modules } });
});

// PATCH /creator/plans/:planId
router.patch("/creator/plans/:planId", async (req, res) => {
  const auth = await validateAuth(req);
  requireCreator(auth);
  await checkRateLimit(auth.userId, 200, "rate_limit_first_party");

  const docRef = db.collection("plans").doc(req.params.planId);
  const doc = await docRef.get();
  if (!doc.exists || doc.data()?.creator_id !== auth.userId) {
    throw new WakeApiServerError("NOT_FOUND", 404, "Plan no encontrado");
  }

  // Allowlist fields
  const allowedFields = ["title", "description", "status"];
  const updates = pickFields(req.body, allowedFields);

  if (Object.keys(updates).length === 0) {
    throw new WakeApiServerError("VALIDATION_ERROR", 400, "No se proporcionaron campos para actualizar");
  }

  await docRef.update({ ...updates, updated_at: FieldValue.serverTimestamp() });
  res.json({ data: { planId: doc.id, updated: true } });
});

// DELETE /creator/plans/:planId
router.delete("/creator/plans/:planId", async (req, res) => {
  const auth = await validateAuth(req);
  requireCreator(auth);
  await checkRateLimit(auth.userId, 200, "rate_limit_first_party");

  const docRef = db.collection("plans").doc(req.params.planId);
  const doc = await docRef.get();
  if (!doc.exists || doc.data()?.creator_id !== auth.userId) {
    throw new WakeApiServerError("NOT_FOUND", 404, "Plan no encontrado");
  }

  // Cascading delete in batches
  const modulesSnap = await docRef.collection("modules").get();
  let batch = db.batch();
  let count = 0;
  for (const mDoc of modulesSnap.docs) {
    const sessionsSnap = await mDoc.ref.collection("sessions").get();
    for (const sDoc of sessionsSnap.docs) {
      const exSnap = await sDoc.ref.collection("exercises").get();
      for (const eDoc of exSnap.docs) {
        const setsSnap = await eDoc.ref.collection("sets").get();
        for (const setDoc of setsSnap.docs) {
          batch.delete(setDoc.ref);
          count++;
          if (count >= 450) { await batch.commit(); batch = db.batch(); count = 0; }
        }
        batch.delete(eDoc.ref);
        count++;
        if (count >= 450) { await batch.commit(); batch = db.batch(); count = 0; }
      }
      batch.delete(sDoc.ref);
      count++;
      if (count >= 450) { await batch.commit(); batch = db.batch(); count = 0; }
    }
    batch.delete(mDoc.ref);
    count++;
    if (count >= 450) { await batch.commit(); batch = db.batch(); count = 0; }
  }
  batch.delete(docRef);
  count++;
  await batch.commit();

  res.status(204).send();
});

// POST /creator/plans/:planId/modules
router.post("/creator/plans/:planId/modules", async (req, res) => {
  const auth = await validateAuth(req);
  requireCreator(auth);
  await checkRateLimit(auth.userId, 200, "rate_limit_first_party");

  const planDoc = await db.collection("plans").doc(req.params.planId).get();
  if (!planDoc.exists || planDoc.data()?.creator_id !== auth.userId) {
    throw new WakeApiServerError("NOT_FOUND", 404, "Plan no encontrado");
  }

  const body = validateBody<{ title: string; order: number }>(
    { title: "string", order: "number" },
    req.body
  );

  const ref = await db.collection("plans").doc(req.params.planId).collection("modules").add({
    title: body.title,
    order: body.order,
    created_at: FieldValue.serverTimestamp(),
  });

  res.status(201).json({ data: { moduleId: ref.id } });
});

// PATCH /creator/plans/:planId/modules/:moduleId
router.patch("/creator/plans/:planId/modules/:moduleId", async (req, res) => {
  const auth = await validateAuth(req);
  requireCreator(auth);
  await checkRateLimit(auth.userId, 200, "rate_limit_first_party");

  const planDoc = await db.collection("plans").doc(req.params.planId).get();
  if (!planDoc.exists || planDoc.data()?.creator_id !== auth.userId) {
    throw new WakeApiServerError("NOT_FOUND", 404, "Plan no encontrado");
  }

  const ref = db.collection("plans").doc(req.params.planId).collection("modules").doc(req.params.moduleId);
  const doc = await ref.get();
  if (!doc.exists) throw new WakeApiServerError("NOT_FOUND", 404, "Módulo no encontrado");

  // Allowlist: title, order
  const allowedFields = ["title", "order"];
  const updates = pickFields(req.body, allowedFields);

  if (Object.keys(updates).length === 0) {
    throw new WakeApiServerError("VALIDATION_ERROR", 400, "No se proporcionaron campos para actualizar");
  }

  await ref.update({ ...updates, updated_at: FieldValue.serverTimestamp() });
  res.json({ data: { moduleId: doc.id, updated: true } });
});

// DELETE /creator/plans/:planId/modules/:moduleId
router.delete("/creator/plans/:planId/modules/:moduleId", async (req, res) => {
  const auth = await validateAuth(req);
  requireCreator(auth);
  await checkRateLimit(auth.userId, 200, "rate_limit_first_party");

  const planDoc = await db.collection("plans").doc(req.params.planId).get();
  if (!planDoc.exists || planDoc.data()?.creator_id !== auth.userId) {
    throw new WakeApiServerError("NOT_FOUND", 404, "Plan no encontrado");
  }

  const moduleRef = db.collection("plans").doc(req.params.planId).collection("modules").doc(req.params.moduleId);
  const sessionsSnap = await moduleRef.collection("sessions").get();
  let batch = db.batch();
  let count = 0;
  for (const sDoc of sessionsSnap.docs) {
    batch.delete(sDoc.ref);
    count++;
    if (count >= 450) { await batch.commit(); batch = db.batch(); count = 0; }
  }
  batch.delete(moduleRef);
  await batch.commit();
  res.status(204).send();
});

// POST /creator/plans/:planId/modules/:moduleId/sessions
router.post("/creator/plans/:planId/modules/:moduleId/sessions", async (req, res) => {
  const auth = await validateAuth(req);
  requireCreator(auth);
  await checkRateLimit(auth.userId, 200, "rate_limit_first_party");

  const planDoc = await db.collection("plans").doc(req.params.planId).get();
  if (!planDoc.exists || planDoc.data()?.creator_id !== auth.userId) {
    throw new WakeApiServerError("NOT_FOUND", 404, "Plan no encontrado");
  }

  const body = validateBody<{ title: string; order: number; isRestDay?: boolean }>(
    { title: "string", order: "number", isRestDay: "optional_boolean" },
    req.body
  );

  const ref = await db
    .collection("plans")
    .doc(req.params.planId)
    .collection("modules")
    .doc(req.params.moduleId)
    .collection("sessions")
    .add({
      title: body.title,
      order: body.order,
      ...(body.isRestDay !== undefined && { isRestDay: body.isRestDay }),
      created_at: FieldValue.serverTimestamp(),
    });

  res.status(201).json({ data: { sessionId: ref.id } });
});

// GET /creator/plans/:planId/modules/:moduleId/sessions/:sessionId
router.get("/creator/plans/:planId/modules/:moduleId/sessions/:sessionId", async (req, res) => {
  const auth = await validateAuth(req);
  requireCreator(auth);
  await checkRateLimit(auth.userId, 200, "rate_limit_first_party");

  const planDoc = await db.collection("plans").doc(req.params.planId).get();
  if (!planDoc.exists || planDoc.data()?.creator_id !== auth.userId) {
    throw new WakeApiServerError("NOT_FOUND", 404, "Plan no encontrado");
  }

  const sessionRef = db
    .collection("plans")
    .doc(req.params.planId)
    .collection("modules")
    .doc(req.params.moduleId)
    .collection("sessions")
    .doc(req.params.sessionId);

  const sessionDoc = await sessionRef.get();
  if (!sessionDoc.exists) throw new WakeApiServerError("NOT_FOUND", 404, "Sesión no encontrada");

  const exercisesSnap = await sessionRef.collection("exercises").orderBy("order", "asc").get();
  const exercises = await Promise.all(
    exercisesSnap.docs.map(async (eDoc) => {
      const setsSnap = await eDoc.ref.collection("sets").orderBy("order", "asc").get();
      return {
        exerciseId: eDoc.id,
        ...eDoc.data(),
        sets: setsSnap.docs.map((s) => ({ setId: s.id, ...s.data() })),
      };
    })
  );

  res.json({ data: { sessionId: sessionDoc.id, ...sessionDoc.data(), exercises } });
});

// PATCH /creator/plans/:planId/modules/:moduleId/sessions/:sessionId
router.patch("/creator/plans/:planId/modules/:moduleId/sessions/:sessionId", async (req, res) => {
  const auth = await validateAuth(req);
  requireCreator(auth);
  await checkRateLimit(auth.userId, 200, "rate_limit_first_party");

  const planDoc = await db.collection("plans").doc(req.params.planId).get();
  if (!planDoc.exists || planDoc.data()?.creator_id !== auth.userId) {
    throw new WakeApiServerError("NOT_FOUND", 404, "Plan no encontrado");
  }

  const ref = db
    .collection("plans")
    .doc(req.params.planId)
    .collection("modules")
    .doc(req.params.moduleId)
    .collection("sessions")
    .doc(req.params.sessionId);

  const doc = await ref.get();
  if (!doc.exists) throw new WakeApiServerError("NOT_FOUND", 404, "Sesión no encontrada");

  // Allowlist: title, order, isRestDay
  const allowedFields = ["title", "order", "isRestDay"];
  const updates = pickFields(req.body, allowedFields);

  if (Object.keys(updates).length === 0) {
    throw new WakeApiServerError("VALIDATION_ERROR", 400, "No se proporcionaron campos para actualizar");
  }

  await ref.update({ ...updates, updated_at: FieldValue.serverTimestamp() });
  res.json({ data: { sessionId: doc.id, updated: true } });
});

// DELETE /creator/plans/:planId/modules/:moduleId/sessions/:sessionId
router.delete("/creator/plans/:planId/modules/:moduleId/sessions/:sessionId", async (req, res) => {
  const auth = await validateAuth(req);
  requireCreator(auth);
  await checkRateLimit(auth.userId, 200, "rate_limit_first_party");

  const planDoc = await db.collection("plans").doc(req.params.planId).get();
  if (!planDoc.exists || planDoc.data()?.creator_id !== auth.userId) {
    throw new WakeApiServerError("NOT_FOUND", 404, "Plan no encontrado");
  }

  const sessionRef = db
    .collection("plans")
    .doc(req.params.planId)
    .collection("modules")
    .doc(req.params.moduleId)
    .collection("sessions")
    .doc(req.params.sessionId);

  const exSnap = await sessionRef.collection("exercises").get();
  let batch = db.batch();
  let count = 0;
  for (const eDoc of exSnap.docs) {
    const setsSnap = await eDoc.ref.collection("sets").get();
    for (const sDoc of setsSnap.docs) {
      batch.delete(sDoc.ref);
      count++;
      if (count >= 450) { await batch.commit(); batch = db.batch(); count = 0; }
    }
    batch.delete(eDoc.ref);
    count++;
    if (count >= 450) { await batch.commit(); batch = db.batch(); count = 0; }
  }
  batch.delete(sessionRef);
  await batch.commit();
  res.status(204).send();
});

// POST exercises for plan sessions — with validateBody
router.post("/creator/plans/:planId/modules/:moduleId/sessions/:sessionId/exercises", async (req, res) => {
  const auth = await validateAuth(req);
  requireCreator(auth);
  await checkRateLimit(auth.userId, 200, "rate_limit_first_party");

  const planDoc = await db.collection("plans").doc(req.params.planId).get();
  if (!planDoc.exists || planDoc.data()?.creator_id !== auth.userId) {
    throw new WakeApiServerError("NOT_FOUND", 404, "Plan no encontrado");
  }

  const body = validateBody<{
    name: string;
    order: number;
    libraryId?: string;
    primaryMuscles?: unknown[];
    notes?: string;
  }>(
    {
      name: "string",
      order: "number",
      libraryId: "optional_string",
      primaryMuscles: "optional_array",
      notes: "optional_string",
    },
    req.body
  );

  const ref = await db
    .collection("plans")
    .doc(req.params.planId)
    .collection("modules")
    .doc(req.params.moduleId)
    .collection("sessions")
    .doc(req.params.sessionId)
    .collection("exercises")
    .add({ ...body, created_at: FieldValue.serverTimestamp() });

  res.status(201).json({ data: { exerciseId: ref.id } });
});

router.patch("/creator/plans/:planId/modules/:moduleId/sessions/:sessionId/exercises/:exerciseId", async (req, res) => {
  const auth = await validateAuth(req);
  requireCreator(auth);
  await checkRateLimit(auth.userId, 200, "rate_limit_first_party");

  const planDoc = await db.collection("plans").doc(req.params.planId).get();
  if (!planDoc.exists || planDoc.data()?.creator_id !== auth.userId) {
    throw new WakeApiServerError("NOT_FOUND", 404, "Plan no encontrado");
  }

  const ref = db
    .collection("plans").doc(req.params.planId)
    .collection("modules").doc(req.params.moduleId)
    .collection("sessions").doc(req.params.sessionId)
    .collection("exercises").doc(req.params.exerciseId);

  // Allowlist exercise fields
  const allowedFields = ["name", "order", "libraryId", "primaryMuscles", "notes", "videoUrl", "thumbnailUrl"];
  const updates = pickFields(req.body, allowedFields);

  if (Object.keys(updates).length === 0) {
    throw new WakeApiServerError("VALIDATION_ERROR", 400, "No se proporcionaron campos para actualizar");
  }

  await ref.update({ ...updates, updated_at: FieldValue.serverTimestamp() });
  res.json({ data: { exerciseId: req.params.exerciseId, updated: true } });
});

router.delete("/creator/plans/:planId/modules/:moduleId/sessions/:sessionId/exercises/:exerciseId", async (req, res) => {
  const auth = await validateAuth(req);
  requireCreator(auth);
  await checkRateLimit(auth.userId, 200, "rate_limit_first_party");

  const planDoc = await db.collection("plans").doc(req.params.planId).get();
  if (!planDoc.exists || planDoc.data()?.creator_id !== auth.userId) {
    throw new WakeApiServerError("NOT_FOUND", 404, "Plan no encontrado");
  }

  const exRef = db
    .collection("plans").doc(req.params.planId)
    .collection("modules").doc(req.params.moduleId)
    .collection("sessions").doc(req.params.sessionId)
    .collection("exercises").doc(req.params.exerciseId);

  const setsSnap = await exRef.collection("sets").get();
  const batch = db.batch();
  for (const s of setsSnap.docs) batch.delete(s.ref);
  batch.delete(exRef);
  await batch.commit();
  res.status(204).send();
});

// POST sets — with validateBody
router.post("/creator/plans/:planId/modules/:moduleId/sessions/:sessionId/exercises/:exerciseId/sets", async (req, res) => {
  const auth = await validateAuth(req);
  requireCreator(auth);
  await checkRateLimit(auth.userId, 200, "rate_limit_first_party");

  const planDoc = await db.collection("plans").doc(req.params.planId).get();
  if (!planDoc.exists || planDoc.data()?.creator_id !== auth.userId) {
    throw new WakeApiServerError("NOT_FOUND", 404, "Plan no encontrado");
  }

  const body = validateBody<{
    order: number;
    reps?: number;
    weight?: number;
    intensity?: string;
    rir?: number;
    restSeconds?: number;
    type?: string;
  }>(
    {
      order: "number",
      reps: "optional_number",
      weight: "optional_number",
      intensity: "optional_string",
      rir: "optional_number",
      restSeconds: "optional_number",
      type: "optional_string",
    },
    req.body
  );

  const ref = await db
    .collection("plans").doc(req.params.planId)
    .collection("modules").doc(req.params.moduleId)
    .collection("sessions").doc(req.params.sessionId)
    .collection("exercises").doc(req.params.exerciseId)
    .collection("sets")
    .add({ ...body, created_at: FieldValue.serverTimestamp() });

  res.status(201).json({ data: { setId: ref.id } });
});

router.patch("/creator/plans/:planId/modules/:moduleId/sessions/:sessionId/exercises/:exerciseId/sets/:setId", async (req, res) => {
  const auth = await validateAuth(req);
  requireCreator(auth);
  await checkRateLimit(auth.userId, 200, "rate_limit_first_party");

  const planDoc = await db.collection("plans").doc(req.params.planId).get();
  if (!planDoc.exists || planDoc.data()?.creator_id !== auth.userId) {
    throw new WakeApiServerError("NOT_FOUND", 404, "Plan no encontrado");
  }

  const ref = db
    .collection("plans").doc(req.params.planId)
    .collection("modules").doc(req.params.moduleId)
    .collection("sessions").doc(req.params.sessionId)
    .collection("exercises").doc(req.params.exerciseId)
    .collection("sets").doc(req.params.setId);

  // Allowlist set fields
  const allowedFields = ["order", "reps", "weight", "intensity", "rir", "restSeconds", "type"];
  const updates = pickFields(req.body, allowedFields);

  if (Object.keys(updates).length === 0) {
    throw new WakeApiServerError("VALIDATION_ERROR", 400, "No se proporcionaron campos para actualizar");
  }

  await ref.update({ ...updates, updated_at: FieldValue.serverTimestamp() });
  res.json({ data: { setId: req.params.setId, updated: true } });
});

router.delete("/creator/plans/:planId/modules/:moduleId/sessions/:sessionId/exercises/:exerciseId/sets/:setId", async (req, res) => {
  const auth = await validateAuth(req);
  requireCreator(auth);
  await checkRateLimit(auth.userId, 200, "rate_limit_first_party");

  const planDoc = await db.collection("plans").doc(req.params.planId).get();
  if (!planDoc.exists || planDoc.data()?.creator_id !== auth.userId) {
    throw new WakeApiServerError("NOT_FOUND", 404, "Plan no encontrado");
  }

  await db
    .collection("plans").doc(req.params.planId)
    .collection("modules").doc(req.params.moduleId)
    .collection("sessions").doc(req.params.sessionId)
    .collection("exercises").doc(req.params.exerciseId)
    .collection("sets").doc(req.params.setId)
    .delete();

  res.status(204).send();
});

// ─── Library Sessions CRUD ──────────────────────────────────────────────

// GET /creator/library/exercises — deduplicated exercises across all library sessions
router.get("/creator/library/exercises", async (req, res) => {
  const auth = await validateAuth(req);
  requireCreator(auth);
  await checkRateLimit(auth.userId, 200, "rate_limit_first_party");

  const sessionsSnap = await db
    .collection("creator_libraries")
    .doc(auth.userId)
    .collection("sessions")
    .get();

  const seen = new Map<string, Record<string, unknown>>();

  await Promise.all(
    sessionsSnap.docs.map(async (sessionDoc) => {
      const exercisesSnap = await sessionDoc.ref
        .collection("exercises")
        .orderBy("order", "asc")
        .get();

      for (const eDoc of exercisesSnap.docs) {
        const data = eDoc.data();
        const key = data.name || eDoc.id;
        if (key && !seen.has(key)) {
          seen.set(key, {
            id: eDoc.id,
            name: data.name || "",
            primaryMuscles: data.primaryMuscles || [],
            video_url: data.videoUrl || data.video_url || null,
            muscle_activation: data.muscle_activation || null,
            implements: data.implements || null,
          });
        }
      }
    })
  );

  res.json({ data: Array.from(seen.values()) });
});

// GET /creator/library/sessions
router.get("/creator/library/sessions", async (req, res) => {
  const auth = await validateAuth(req);
  requireCreator(auth);
  await checkRateLimit(auth.userId, 200, "rate_limit_first_party");

  const snap = await db
    .collection("creator_libraries")
    .doc(auth.userId)
    .collection("sessions")
    .orderBy("created_at", "desc")
    .get();

  res.json({ data: snap.docs.map((d) => ({ sessionId: d.id, ...d.data() })) });
});

// POST /creator/library/sessions
router.post("/creator/library/sessions", async (req, res) => {
  const auth = await validateAuth(req);
  requireCreator(auth);
  await checkRateLimit(auth.userId, 200, "rate_limit_first_party");

  const body = validateBody<{ title: string }>({ title: "string" }, req.body);
  const ref = await db
    .collection("creator_libraries")
    .doc(auth.userId)
    .collection("sessions")
    .add({ title: body.title, created_at: FieldValue.serverTimestamp(), updated_at: FieldValue.serverTimestamp() });

  res.status(201).json({ data: { sessionId: ref.id } });
});

// GET /creator/library/sessions/:sessionId
router.get("/creator/library/sessions/:sessionId", async (req, res) => {
  const auth = await validateAuth(req);
  requireCreator(auth);
  await checkRateLimit(auth.userId, 200, "rate_limit_first_party");

  const sessionRef = db.collection("creator_libraries").doc(auth.userId).collection("sessions").doc(req.params.sessionId);
  const doc = await sessionRef.get();
  if (!doc.exists) throw new WakeApiServerError("NOT_FOUND", 404, "Sesión no encontrada");

  const exercisesSnap = await sessionRef.collection("exercises").orderBy("order", "asc").get();
  const exercises = await Promise.all(
    exercisesSnap.docs.map(async (eDoc) => {
      const setsSnap = await eDoc.ref.collection("sets").orderBy("order", "asc").get();
      return { exerciseId: eDoc.id, ...eDoc.data(), sets: setsSnap.docs.map((s) => ({ setId: s.id, ...s.data() })) };
    })
  );

  res.json({ data: { sessionId: doc.id, ...doc.data(), exercises } });
});

// PATCH /creator/library/sessions/:sessionId
router.patch("/creator/library/sessions/:sessionId", async (req, res) => {
  const auth = await validateAuth(req);
  requireCreator(auth);
  await checkRateLimit(auth.userId, 200, "rate_limit_first_party");

  const ref = db.collection("creator_libraries").doc(auth.userId).collection("sessions").doc(req.params.sessionId);
  const doc = await ref.get();
  if (!doc.exists) throw new WakeApiServerError("NOT_FOUND", 404, "Sesión no encontrada");

  const allowedFields = ["title", "order", "isRestDay"];
  const updates = pickFields(req.body, allowedFields);

  if (Object.keys(updates).length === 0) {
    throw new WakeApiServerError("VALIDATION_ERROR", 400, "No se proporcionaron campos para actualizar");
  }

  await ref.update({ ...updates, updated_at: FieldValue.serverTimestamp() });
  res.json({ data: { updated: true } });
});

// DELETE /creator/library/sessions/:sessionId
router.delete("/creator/library/sessions/:sessionId", async (req, res) => {
  const auth = await validateAuth(req);
  requireCreator(auth);
  await checkRateLimit(auth.userId, 200, "rate_limit_first_party");

  const ref = db.collection("creator_libraries").doc(auth.userId).collection("sessions").doc(req.params.sessionId);
  const doc = await ref.get();
  if (!doc.exists) throw new WakeApiServerError("NOT_FOUND", 404, "Sesión no encontrada");

  await ref.delete();
  res.status(204).send();
});

// Library session exercise/set CRUD — with allowlisted fields
router.post("/creator/library/sessions/:sessionId/exercises", async (req, res) => {
  const auth = await validateAuth(req);
  requireCreator(auth);
  await checkRateLimit(auth.userId, 200, "rate_limit_first_party");

  const body = validateBody<{ name: string; order: number; libraryId?: string; primaryMuscles?: unknown[]; notes?: string }>(
    { name: "string", order: "number", libraryId: "optional_string", primaryMuscles: "optional_array", notes: "optional_string" },
    req.body
  );

  const ref = await db
    .collection("creator_libraries").doc(auth.userId)
    .collection("sessions").doc(req.params.sessionId)
    .collection("exercises")
    .add({ ...body, created_at: FieldValue.serverTimestamp() });

  res.status(201).json({ data: { exerciseId: ref.id } });
});

router.patch("/creator/library/sessions/:sessionId/exercises/:exerciseId", async (req, res) => {
  const auth = await validateAuth(req);
  requireCreator(auth);
  await checkRateLimit(auth.userId, 200, "rate_limit_first_party");

  const ref = db
    .collection("creator_libraries").doc(auth.userId)
    .collection("sessions").doc(req.params.sessionId)
    .collection("exercises").doc(req.params.exerciseId);

  const allowedFields = ["name", "order", "libraryId", "primaryMuscles", "notes", "videoUrl", "thumbnailUrl"];
  const updates = pickFields(req.body, allowedFields);

  if (Object.keys(updates).length === 0) {
    throw new WakeApiServerError("VALIDATION_ERROR", 400, "No se proporcionaron campos para actualizar");
  }

  await ref.update({ ...updates, updated_at: FieldValue.serverTimestamp() });
  res.json({ data: { exerciseId: req.params.exerciseId, updated: true } });
});

router.delete("/creator/library/sessions/:sessionId/exercises/:exerciseId", async (req, res) => {
  const auth = await validateAuth(req);
  requireCreator(auth);
  await checkRateLimit(auth.userId, 200, "rate_limit_first_party");

  const exRef = db
    .collection("creator_libraries").doc(auth.userId)
    .collection("sessions").doc(req.params.sessionId)
    .collection("exercises").doc(req.params.exerciseId);

  const setsSnap = await exRef.collection("sets").get();
  const batch = db.batch();
  for (const s of setsSnap.docs) batch.delete(s.ref);
  batch.delete(exRef);
  await batch.commit();
  res.status(204).send();
});

router.post("/creator/library/sessions/:sessionId/exercises/:exerciseId/sets", async (req, res) => {
  const auth = await validateAuth(req);
  requireCreator(auth);
  await checkRateLimit(auth.userId, 200, "rate_limit_first_party");

  const body = validateBody<{ order: number; reps?: number; weight?: number; intensity?: string; rir?: number; restSeconds?: number; type?: string }>(
    { order: "number", reps: "optional_number", weight: "optional_number", intensity: "optional_string", rir: "optional_number", restSeconds: "optional_number", type: "optional_string" },
    req.body
  );

  const ref = await db
    .collection("creator_libraries").doc(auth.userId)
    .collection("sessions").doc(req.params.sessionId)
    .collection("exercises").doc(req.params.exerciseId)
    .collection("sets")
    .add({ ...body, created_at: FieldValue.serverTimestamp() });

  res.status(201).json({ data: { setId: ref.id } });
});

router.patch("/creator/library/sessions/:sessionId/exercises/:exerciseId/sets/:setId", async (req, res) => {
  const auth = await validateAuth(req);
  requireCreator(auth);
  await checkRateLimit(auth.userId, 200, "rate_limit_first_party");

  const ref = db
    .collection("creator_libraries").doc(auth.userId)
    .collection("sessions").doc(req.params.sessionId)
    .collection("exercises").doc(req.params.exerciseId)
    .collection("sets").doc(req.params.setId);

  const allowedFields = ["order", "reps", "weight", "intensity", "rir", "restSeconds", "type"];
  const updates = pickFields(req.body, allowedFields);

  if (Object.keys(updates).length === 0) {
    throw new WakeApiServerError("VALIDATION_ERROR", 400, "No se proporcionaron campos para actualizar");
  }

  await ref.update({ ...updates, updated_at: FieldValue.serverTimestamp() });
  res.json({ data: { setId: req.params.setId, updated: true } });
});

router.delete("/creator/library/sessions/:sessionId/exercises/:exerciseId/sets/:setId", async (req, res) => {
  const auth = await validateAuth(req);
  requireCreator(auth);
  await checkRateLimit(auth.userId, 200, "rate_limit_first_party");

  await db
    .collection("creator_libraries").doc(auth.userId)
    .collection("sessions").doc(req.params.sessionId)
    .collection("exercises").doc(req.params.exerciseId)
    .collection("sets").doc(req.params.setId)
    .delete();

  res.status(204).send();
});

// ─── Library Modules CRUD ──────────────────────────────────────────────

router.get("/creator/library/modules", async (req, res) => {
  const auth = await validateAuth(req);
  requireCreator(auth);
  await checkRateLimit(auth.userId, 200, "rate_limit_first_party");

  const snap = await db
    .collection("creator_libraries")
    .doc(auth.userId)
    .collection("modules")
    .orderBy("created_at", "desc")
    .get();

  res.json({ data: snap.docs.map((d) => ({ moduleId: d.id, ...d.data() })) });
});

router.post("/creator/library/modules", async (req, res) => {
  const auth = await validateAuth(req);
  requireCreator(auth);
  await checkRateLimit(auth.userId, 200, "rate_limit_first_party");

  const body = validateBody<{ title: string }>({ title: "string" }, req.body);
  const ref = await db
    .collection("creator_libraries")
    .doc(auth.userId)
    .collection("modules")
    .add({ title: body.title, created_at: FieldValue.serverTimestamp(), updated_at: FieldValue.serverTimestamp() });

  res.status(201).json({ data: { moduleId: ref.id } });
});

router.get("/creator/library/modules/:moduleId", async (req, res) => {
  const auth = await validateAuth(req);
  requireCreator(auth);
  await checkRateLimit(auth.userId, 200, "rate_limit_first_party");

  const doc = await db.collection("creator_libraries").doc(auth.userId).collection("modules").doc(req.params.moduleId).get();
  if (!doc.exists) throw new WakeApiServerError("NOT_FOUND", 404, "Módulo no encontrado");

  res.json({ data: { moduleId: doc.id, ...doc.data() } });
});

router.patch("/creator/library/modules/:moduleId", async (req, res) => {
  const auth = await validateAuth(req);
  requireCreator(auth);
  await checkRateLimit(auth.userId, 200, "rate_limit_first_party");

  const ref = db.collection("creator_libraries").doc(auth.userId).collection("modules").doc(req.params.moduleId);
  const doc = await ref.get();
  if (!doc.exists) throw new WakeApiServerError("NOT_FOUND", 404, "Módulo no encontrado");

  const allowedFields = ["title", "order"];
  const updates = pickFields(req.body, allowedFields);

  if (Object.keys(updates).length === 0) {
    throw new WakeApiServerError("VALIDATION_ERROR", 400, "No se proporcionaron campos para actualizar");
  }

  await ref.update({ ...updates, updated_at: FieldValue.serverTimestamp() });
  res.json({ data: { updated: true } });
});

router.delete("/creator/library/modules/:moduleId", async (req, res) => {
  const auth = await validateAuth(req);
  requireCreator(auth);
  await checkRateLimit(auth.userId, 200, "rate_limit_first_party");

  const ref = db.collection("creator_libraries").doc(auth.userId).collection("modules").doc(req.params.moduleId);
  const doc = await ref.get();
  if (!doc.exists) throw new WakeApiServerError("NOT_FOUND", 404, "Módulo no encontrado");

  await ref.delete();
  res.status(204).send();
});

// ─── Library Propagation ──────────────────────────────────────────────────

// GET /creator/library/sessions/:sessionId/affected
router.get("/creator/library/sessions/:sessionId/affected", async (req, res) => {
  const auth = await validateAuth(req);
  requireCreator(auth);
  await checkRateLimit(auth.userId, 200, "rate_limit_first_party");

  const sessionId = req.params.sessionId;
  const wantDetails = req.query.details === "true";

  // Check plans that reference this library session
  const plansSnap = await db
    .collection("plans")
    .where("creator_id", "==", auth.userId)
    .limit(100)
    .get();

  let programCount = 0;
  const affectedUserIdSet = new Set<string>();

  for (const planDoc of plansSnap.docs) {
    const modulesSnap = await planDoc.ref.collection("modules").get();
    let planHasRef = false;
    for (const moduleDoc of modulesSnap.docs) {
      const sessionsSnap = await moduleDoc.ref.collection("sessions")
        .where("libraryRef", "==", sessionId)
        .limit(1)
        .get();
      if (!sessionsSnap.empty) {
        planHasRef = true;
        break;
      }
    }
    if (planHasRef) programCount++;
  }

  // Check programs (courses) that reference this library session
  const coursesSnap = await db
    .collection("courses")
    .where("creator_id", "==", auth.userId)
    .limit(100)
    .get();

  for (const courseDoc of coursesSnap.docs) {
    const modulesSnap = await courseDoc.ref.collection("modules").get();
    for (const moduleDoc of modulesSnap.docs) {
      const sessionsSnap = await moduleDoc.ref.collection("sessions")
        .where("librarySessionRef", "==", sessionId)
        .limit(1)
        .get();
      if (!sessionsSnap.empty) {
        programCount++;
        break;
      }
    }
  }

  // Find affected users (users enrolled in programs/plans referencing this session)
  for (const courseDoc of coursesSnap.docs) {
    const usersSnap = await db
      .collection("users")
      .where(`courses.${courseDoc.id}.status`, "==", "active")
      .limit(200)
      .get();
    for (const userDoc of usersSnap.docs) {
      affectedUserIdSet.add(userDoc.id);
    }
  }

  const affectedUserIds = Array.from(affectedUserIdSet);

  if (wantDetails && affectedUserIds.length > 0) {
    const userDocs = await Promise.all(
      affectedUserIds.slice(0, 50).map((uid) => db.collection("users").doc(uid).get())
    );
    const detailedUsers = userDocs
      .filter((d) => d.exists)
      .map((d) => ({
        userId: d.id,
        displayName: d.data()?.displayName || d.data()?.email || d.id,
      }));
    res.json({ data: { users: detailedUsers } });
    return;
  }

  res.json({ data: { affectedUserIds, programCount } });
});

// POST /creator/library/sessions/:sessionId/propagate
router.post("/creator/library/sessions/:sessionId/propagate", async (req, res) => {
  const auth = await validateAuth(req);
  requireCreator(auth);
  await checkRateLimit(auth.userId, 200, "rate_limit_first_party");

  const libSessionRef = db
    .collection("creator_libraries")
    .doc(auth.userId)
    .collection("sessions")
    .doc(req.params.sessionId);

  const libSessionDoc = await libSessionRef.get();
  if (!libSessionDoc.exists) {
    throw new WakeApiServerError("NOT_FOUND", 404, "Sesión de librería no encontrada");
  }

  const libSessionData = libSessionDoc.data()!;

  // Fetch exercises + sets from the library session
  const exercisesSnap = await libSessionRef.collection("exercises").orderBy("order", "asc").get();
  const exercises = await Promise.all(
    exercisesSnap.docs.map(async (eDoc) => {
      const setsSnap = await eDoc.ref.collection("sets").orderBy("order", "asc").get();
      return {
        data: eDoc.data(),
        sets: setsSnap.docs.map((s) => s.data()),
      };
    })
  );

  // Find all plan sessions that reference this library session — guard at 100 plans max
  const plansSnap = await db
    .collection("plans")
    .where("creator_id", "==", auth.userId)
    .limit(100)
    .get();

  if (plansSnap.size >= 100) {
    console.warn(`Creator ${auth.userId} has 100+ plans; propagation capped.`);
  }

  let updatedCount = 0;
  const batchSize = 450;
  let batch = db.batch();
  let batchCount = 0;

  for (const planDoc of plansSnap.docs) {
    const modulesSnap = await planDoc.ref.collection("modules").get();
    for (const moduleDoc of modulesSnap.docs) {
      const sessionsSnap = await moduleDoc.ref.collection("sessions")
        .where("libraryRef", "==", req.params.sessionId)
        .get();

      for (const sessionDoc of sessionsSnap.docs) {
        batch.update(sessionDoc.ref, {
          title: libSessionData.title ?? sessionDoc.data().title,
          updated_at: FieldValue.serverTimestamp(),
        });
        batchCount++;
        if (batchCount >= batchSize) { await batch.commit(); batch = db.batch(); batchCount = 0; }

        const existingExSnap = await sessionDoc.ref.collection("exercises").get();
        for (const exDoc of existingExSnap.docs) {
          const existingSetsSnap = await exDoc.ref.collection("sets").get();
          for (const setDoc of existingSetsSnap.docs) {
            batch.delete(setDoc.ref);
            batchCount++;
            if (batchCount >= batchSize) { await batch.commit(); batch = db.batch(); batchCount = 0; }
          }
          batch.delete(exDoc.ref);
          batchCount++;
          if (batchCount >= batchSize) { await batch.commit(); batch = db.batch(); batchCount = 0; }
        }

        for (const ex of exercises) {
          const newExRef = sessionDoc.ref.collection("exercises").doc();
          batch.set(newExRef, { ...ex.data, created_at: FieldValue.serverTimestamp() });
          batchCount++;
          if (batchCount >= batchSize) { await batch.commit(); batch = db.batch(); batchCount = 0; }

          for (const setData of ex.sets) {
            const newSetRef = newExRef.collection("sets").doc();
            batch.set(newSetRef, { ...setData, created_at: FieldValue.serverTimestamp() });
            batchCount++;
            if (batchCount >= batchSize) { await batch.commit(); batch = db.batch(); batchCount = 0; }
          }
        }

        updatedCount++;
      }
    }
  }

  if (batchCount > 0) await batch.commit();

  res.json({ data: { updatedCount } });
});

// POST /creator/library/modules/:moduleId/propagate
router.post("/creator/library/modules/:moduleId/propagate", async (req, res) => {
  const auth = await validateAuth(req);
  requireCreator(auth);
  await checkRateLimit(auth.userId, 200, "rate_limit_first_party");

  const libModuleRef = db
    .collection("creator_libraries")
    .doc(auth.userId)
    .collection("modules")
    .doc(req.params.moduleId);

  const libModuleDoc = await libModuleRef.get();
  if (!libModuleDoc.exists) {
    throw new WakeApiServerError("NOT_FOUND", 404, "Módulo de librería no encontrado");
  }

  const libModuleData = libModuleDoc.data()!;

  const libSessionsSnap = await libModuleRef.collection("sessions").orderBy("order", "asc").get();
  const libSessions = await Promise.all(
    libSessionsSnap.docs.map(async (sDoc) => {
      const exSnap = await sDoc.ref.collection("exercises").orderBy("order", "asc").get();
      const exercises = await Promise.all(
        exSnap.docs.map(async (eDoc) => {
          const setsSnap = await eDoc.ref.collection("sets").orderBy("order", "asc").get();
          return { data: eDoc.data(), sets: setsSnap.docs.map((s) => s.data()) };
        })
      );
      return { data: sDoc.data(), exercises };
    })
  );

  // Guard at 100 plans max
  const plansSnap = await db
    .collection("plans")
    .where("creator_id", "==", auth.userId)
    .limit(100)
    .get();

  if (plansSnap.size >= 100) {
    console.warn(`Creator ${auth.userId} has 100+ plans; propagation capped.`);
  }

  let updatedCount = 0;
  const batchSize = 450;
  let batch = db.batch();
  let batchCount = 0;

  for (const planDoc of plansSnap.docs) {
    const modulesSnap = await planDoc.ref.collection("modules")
      .where("libraryRef", "==", req.params.moduleId)
      .get();

    for (const moduleDoc of modulesSnap.docs) {
      batch.update(moduleDoc.ref, {
        title: libModuleData.title ?? moduleDoc.data().title,
        updated_at: FieldValue.serverTimestamp(),
      });
      batchCount++;
      if (batchCount >= batchSize) { await batch.commit(); batch = db.batch(); batchCount = 0; }

      const existingSessionsSnap = await moduleDoc.ref.collection("sessions").get();
      for (const sDoc of existingSessionsSnap.docs) {
        const exSnap = await sDoc.ref.collection("exercises").get();
        for (const eDoc of exSnap.docs) {
          const setsSnap = await eDoc.ref.collection("sets").get();
          for (const setDoc of setsSnap.docs) {
            batch.delete(setDoc.ref);
            batchCount++;
            if (batchCount >= batchSize) { await batch.commit(); batch = db.batch(); batchCount = 0; }
          }
          batch.delete(eDoc.ref);
          batchCount++;
          if (batchCount >= batchSize) { await batch.commit(); batch = db.batch(); batchCount = 0; }
        }
        batch.delete(sDoc.ref);
        batchCount++;
        if (batchCount >= batchSize) { await batch.commit(); batch = db.batch(); batchCount = 0; }
      }

      for (const libSession of libSessions) {
        const newSessionRef = moduleDoc.ref.collection("sessions").doc();
        batch.set(newSessionRef, { ...libSession.data, created_at: FieldValue.serverTimestamp() });
        batchCount++;
        if (batchCount >= batchSize) { await batch.commit(); batch = db.batch(); batchCount = 0; }

        for (const ex of libSession.exercises) {
          const newExRef = newSessionRef.collection("exercises").doc();
          batch.set(newExRef, { ...ex.data, created_at: FieldValue.serverTimestamp() });
          batchCount++;
          if (batchCount >= batchSize) { await batch.commit(); batch = db.batch(); batchCount = 0; }

          for (const setData of ex.sets) {
            const newSetRef = newExRef.collection("sets").doc();
            batch.set(newSetRef, { ...setData, created_at: FieldValue.serverTimestamp() });
            batchCount++;
            if (batchCount >= batchSize) { await batch.commit(); batch = db.batch(); batchCount = 0; }
          }
        }
      }

      updatedCount++;
    }
  }

  if (batchCount > 0) await batch.commit();

  res.json({ data: { updatedCount } });
});

// ─── Client Programs (One-on-One Scheduling) ──────────────────────────────

// GET /creator/clients/:clientId/programs
router.get("/creator/clients/:clientId/programs", async (req, res) => {
  const auth = await validateAuth(req);
  requireCreator(auth);
  await checkRateLimit(auth.userId, 200, "rate_limit_first_party");
  await verifyClientAccess(auth.userId, req.params.clientId);

  const userDoc = await db.collection("users").doc(req.params.clientId).get();
  const courses = userDoc.data()?.courses ?? {};

  const programs = Object.entries(courses)
    .filter(([, v]) => (v as Record<string, unknown>).deliveryType === "one_on_one")
    .map(([courseId, v]) => ({ courseId, ...(v as Record<string, unknown>) }));

  res.json({ data: programs });
});

// POST /creator/clients/:clientId/programs/:programId
router.post("/creator/clients/:clientId/programs/:programId", async (req, res) => {
  const auth = await validateAuth(req);
  requireCreator(auth);
  await checkRateLimit(auth.userId, 200, "rate_limit_first_party");
  await verifyClientAccess(auth.userId, req.params.clientId);

  const courseDoc = await db.collection("courses").doc(req.params.programId).get();
  if (!courseDoc.exists || courseDoc.data()?.creator_id !== auth.userId) {
    throw new WakeApiServerError("NOT_FOUND", 404, "Programa no encontrado");
  }

  const userRef = db.collection("users").doc(req.params.clientId);
  const userDoc = await userRef.get();
  const courses = userDoc.data()?.courses ?? {};

  if (courses[req.params.programId]) {
    throw new WakeApiServerError("CONFLICT", 409, "Programa ya asignado a este cliente");
  }

  await userRef.update({
    [`courses.${req.params.programId}`]: {
      status: "active",
      deliveryType: "one_on_one",
      title: courseDoc.data()!.title ?? "",
      image_url: courseDoc.data()!.image_url ?? null,
      purchased_at: new Date().toISOString(),
      expires_at: req.body.expiresAt ?? null,
    },
  });

  res.status(201).json({ data: { assignedAt: new Date().toISOString() } });
});

// DELETE /creator/clients/:clientId/programs/:programId
router.delete("/creator/clients/:clientId/programs/:programId", async (req, res) => {
  const auth = await validateAuth(req);
  requireCreator(auth);
  await checkRateLimit(auth.userId, 200, "rate_limit_first_party");
  await verifyClientAccess(auth.userId, req.params.clientId);

  await db.collection("users").doc(req.params.clientId).update({
    [`courses.${req.params.programId}`]: FieldValue.delete(),
  });

  res.status(204).send();
});

// PUT /creator/clients/:clientId/programs/:programId/schedule/:weekKey
router.put("/creator/clients/:clientId/programs/:programId/schedule/:weekKey", async (req, res) => {
  const auth = await validateAuth(req);
  requireCreator(auth);
  await checkRateLimit(auth.userId, 200, "rate_limit_first_party");
  await verifyClientAccess(auth.userId, req.params.clientId);

  const body = validateBody<{ planId: string; moduleId: string }>(
    { planId: "string", moduleId: "string" },
    req.body
  );

  const courseRef = db.collection("courses").doc(req.params.programId);
  await courseRef.update({
    [`planAssignments.${req.params.weekKey}`]: {
      planId: body.planId,
      moduleId: body.moduleId,
      assignedAt: new Date().toISOString(),
    },
  });

  res.json({ data: { weekKey: req.params.weekKey, assignedAt: new Date().toISOString() } });
});

// DELETE /creator/clients/:clientId/programs/:programId/schedule/:weekKey
router.delete("/creator/clients/:clientId/programs/:programId/schedule/:weekKey", async (req, res) => {
  const auth = await validateAuth(req);
  requireCreator(auth);
  await checkRateLimit(auth.userId, 200, "rate_limit_first_party");
  await verifyClientAccess(auth.userId, req.params.clientId);

  await db.collection("courses").doc(req.params.programId).update({
    [`planAssignments.${req.params.weekKey}`]: FieldValue.delete(),
  });

  res.status(204).send();
});

// GET /creator/username-check?username=... — check if username is available
router.get("/creator/username-check", async (req, res) => {
  const auth = await validateAuth(req);
  requireCreator(auth);
  await checkRateLimit(auth.userId, 200, "rate_limit_first_party");

  const username = req.query.username as string | undefined;
  if (!username || !username.trim()) {
    throw new WakeApiServerError("VALIDATION_ERROR", 400, "El parámetro username es requerido");
  }

  const snapshot = await db
    .collection("users")
    .where("username", "==", username.trim())
    .limit(1)
    .get();

  const taken = snapshot.docs.some((doc) => doc.id !== auth.userId);

  res.json({ data: { available: !taken } });
});

// ---------------------------------------------------------------------------
// Creator Media Folder
// ---------------------------------------------------------------------------

// GET /creator/media — list all media files for the authenticated creator
router.get("/creator/media", async (req, res) => {
  const auth = await validateAuth(req);
  requireCreator(auth);
  await checkRateLimit(auth.userId, 200, "rate_limit_first_party");

  const snapshot = await db
    .collection("creator_media")
    .doc(auth.userId)
    .collection("files")
    .orderBy("created_at", "desc")
    .limit(200)
    .get();

  const bucket = admin.storage().bucket();
  const data = snapshot.docs.map((d) => {
    const file = d.data();
    let publicUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(file.storagePath)}?alt=media`;
    if (file.downloadToken) {
      publicUrl += `&token=${file.downloadToken}`;
    }
    return {
      fileId: d.id,
      name: file.name,
      contentType: file.contentType,
      storagePath: file.storagePath,
      url: publicUrl,
      created_at: file.created_at,
    };
  });

  res.json({ data });
});

// POST /creator/media/upload-url — generate upload target for direct Storage upload
router.post("/creator/media/upload-url", async (req, res) => {
  const auth = await validateAuth(req);
  requireCreator(auth);
  await checkRateLimit(auth.userId, 200, "rate_limit_first_party");

  const { filename, contentType } = validateBody<{
    filename: string;
    contentType: string;
  }>(
    { filename: "string", contentType: "string" },
    req.body
  );

  if (!contentType.startsWith("image/") && !contentType.startsWith("video/")) {
    throw new WakeApiServerError("VALIDATION_ERROR", 400, "Solo se permiten imágenes y videos");
  }

  const ext = filename.split(".").pop() || "bin";
  const uniqueName = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const storagePath = `creator_media/${auth.userId}/${uniqueName}`;
  const downloadToken = crypto.randomUUID();

  const bucket = admin.storage().bucket();
  const uploadUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o?uploadType=media&name=${encodeURIComponent(storagePath)}`;

  res.json({
    data: {
      uploadUrl,
      storagePath,
      downloadToken,
      contentType,
    },
  });
});

// POST /creator/media/upload-url/confirm — confirm upload and save metadata
router.post("/creator/media/upload-url/confirm", async (req, res) => {
  const auth = await validateAuth(req);
  requireCreator(auth);
  await checkRateLimit(auth.userId, 200, "rate_limit_first_party");

  const { storagePath, filename, contentType, downloadToken } = validateBody<{
    storagePath: string;
    filename: string;
    contentType: string;
    downloadToken: string;
  }>(
    { storagePath: "string", filename: "string", contentType: "string", downloadToken: "string" },
    req.body
  );

  // Validate the path belongs to this creator
  const expectedPrefix = `creator_media/${auth.userId}/`;
  validateStoragePath(storagePath, expectedPrefix);

  // Verify the file exists in Storage and set download token
  const bucket = admin.storage().bucket();
  const file = bucket.file(storagePath);
  const [exists] = await file.exists();
  if (!exists) {
    throw new WakeApiServerError("NOT_FOUND", 404, "El archivo no se encontró en almacenamiento");
  }

  await file.setMetadata({
    metadata: { firebaseStorageDownloadTokens: downloadToken },
  });

  const docRef = await db
    .collection("creator_media")
    .doc(auth.userId)
    .collection("files")
    .add({
      name: filename,
      contentType,
      storagePath,
      downloadToken,
      created_at: FieldValue.serverTimestamp(),
    });

  const publicUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(storagePath)}?alt=media&token=${downloadToken}`;

  res.status(201).json({
    data: {
      storagePath,
      fileId: docRef.id,
      url: publicUrl,
      name: filename,
      contentType,
    },
  });
});

// DELETE /creator/media/:fileId — delete a media file
router.delete("/creator/media/:fileId", async (req, res) => {
  const auth = await validateAuth(req);
  requireCreator(auth);
  await checkRateLimit(auth.userId, 200, "rate_limit_first_party");

  const fileDoc = await db
    .collection("creator_media")
    .doc(auth.userId)
    .collection("files")
    .doc(req.params.fileId)
    .get();

  if (!fileDoc.exists) {
    throw new WakeApiServerError("NOT_FOUND", 404, "Archivo no encontrado");
  }

  const fileData = fileDoc.data()!;

  // Delete from Storage
  const bucket = admin.storage().bucket();
  try {
    await bucket.file(fileData.storagePath).delete();
  } catch {
    // File may already be deleted from storage — continue
  }

  // Delete Firestore record
  await db
    .collection("creator_media")
    .doc(auth.userId)
    .collection("files")
    .doc(req.params.fileId)
    .delete();

  res.json({ data: { deleted: true } });
});

// GET /creator/programs/:programId/demographics
router.get("/creator/programs/:programId/demographics", async (req, res) => {
  const auth = await validateAuth(req);
  requireCreator(auth);
  await checkRateLimit(auth.userId, 200, "rate_limit_first_party");

  const { programId } = req.params;

  // Verify creator owns this program
  const programDoc = await db.collection("courses").doc(programId).get();
  if (!programDoc.exists || programDoc.data()?.creator_id !== auth.userId) {
    throw new WakeApiServerError("NOT_FOUND", 404, "Programa no encontrado");
  }

  // Find all users who purchased this program
  const usersSnap = await db
    .collection("users")
    .where("purchased_courses", "array-contains", programId)
    .get();

  const ageBuckets: Record<string, number> = {
    "18-24": 0, "25-34": 0, "35-44": 0, "45-54": 0, "55+": 0, "desconocido": 0,
  };
  const genderCounts: Record<string, number> = {};
  const cityCounts: Record<string, number> = {};
  const goalCounts: Record<string, number> = {};
  const experienceCounts: Record<string, number> = {};
  const equipmentCounts: Record<string, number> = {};
  let totalEnrolled = 0;
  let activeCount = 0;

  const now = new Date();

  for (const userDoc of usersSnap.docs) {
    const data = userDoc.data();
    totalEnrolled++;

    // Check if still active
    const courseData = data.courses?.[programId];
    if (courseData?.status === "active") activeCount++;

    // Age from birthDate
    if (data.birthDate) {
      try {
        const birth = new Date(data.birthDate);
        let age = now.getFullYear() - birth.getFullYear();
        const monthDiff = now.getMonth() - birth.getMonth();
        if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < birth.getDate())) age--;
        if (age >= 18 && age <= 24) ageBuckets["18-24"]++;
        else if (age >= 25 && age <= 34) ageBuckets["25-34"]++;
        else if (age >= 35 && age <= 44) ageBuckets["35-44"]++;
        else if (age >= 45 && age <= 54) ageBuckets["45-54"]++;
        else if (age >= 55) ageBuckets["55+"]++;
        else ageBuckets["desconocido"]++;
      } catch {
        ageBuckets["desconocido"]++;
      }
    } else {
      ageBuckets["desconocido"]++;
    }

    // Gender
    const gender = data.gender || "no_especificado";
    genderCounts[gender] = (genderCounts[gender] || 0) + 1;

    // City
    const city = data.city;
    if (city) cityCounts[city] = (cityCounts[city] || 0) + 1;

    // Onboarding data
    const onboarding = data.onboardingData;
    if (onboarding?.primaryGoal) {
      goalCounts[onboarding.primaryGoal] = (goalCounts[onboarding.primaryGoal] || 0) + 1;
    }
    if (onboarding?.trainingExperience) {
      experienceCounts[onboarding.trainingExperience] = (experienceCounts[onboarding.trainingExperience] || 0) + 1;
    }
    if (onboarding?.equipment) {
      equipmentCounts[onboarding.equipment] = (equipmentCounts[onboarding.equipment] || 0) + 1;
    }
  }

  // Sort cities by count descending, top 10
  const topCities = Object.entries(cityCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([city, count]) => ({ city, count }));

  res.json({
    data: {
      totalEnrolled,
      activeCount,
      age: ageBuckets,
      gender: genderCounts,
      cities: topCities,
      goals: goalCounts,
      experience: experienceCounts,
      equipment: equipmentCounts,
    },
  });
});

export default router;
