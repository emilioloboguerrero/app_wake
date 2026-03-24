import { Router } from "express";
import * as admin from "firebase-admin";
import * as crypto from "node:crypto";
import { db, FieldValue, FieldPath } from "../firestore.js";
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

  // Batch-fetch creator-wide data in parallel (one query each, not per-client)
  const now = new Date();
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - now.getDay());
  weekStart.setHours(0, 0, 0, 0);
  const weekStartIso = weekStart.toISOString().slice(0, 10);

  const [nutritionSnap, bookingsSnap] = await Promise.all([
    db.collection("nutrition_assignments")
      .where("assignedBy", "==", auth.userId)
      .where("status", "==", "active")
      .get(),
    db.collection("call_bookings")
      .where("creatorId", "==", auth.userId)
      .where("status", "==", "confirmed")
      .get(),
  ]);

  // Group nutrition assignments by client userId
  const nutritionByClient: Record<string, { planName: string; assignmentId: string }> = {};
  for (const nDoc of nutritionSnap.docs) {
    const nd = nDoc.data();
    const clientId = (nd.userId ?? nd.client_id) as string;
    if (clientId) {
      nutritionByClient[clientId] = { planName: nd.planName ?? nd.plan_name ?? "", assignmentId: nDoc.id };
    }
  }

  // Group upcoming bookings by client userId
  const callsByClient: Record<string, { bookingId: string; slotStartUtc: unknown }[]> = {};
  for (const bDoc of bookingsSnap.docs) {
    const bd = bDoc.data();
    const slotStart = bd.slotStartUtc ?? bd.startAt ?? bd.date;
    const clientId = (bd.clientUserId ?? bd.client_id) as string;
    if (clientId) {
      if (!callsByClient[clientId]) callsByClient[clientId] = [];
      callsByClient[clientId].push({ bookingId: bDoc.id, slotStartUtc: slotStart });
    }
  }

  // Per-client enrichment: session stats, weekly consistency, latest PR
  type ClientStats = {
    sessionsCompleted: number;
    lastSessionDate: string | null;
    weeklyConsistency: number;
    latestPR: { exercise: string; value: unknown; date: string | null } | null;
  };
  const statsMap: Record<string, ClientStats> = {};

  await Promise.all(userIds.map(async (uid) => {
    const [histSnap, countSnap, weekSnap, prSnap] = await Promise.all([
      db.collection("users").doc(uid).collection("sessionHistory")
        .orderBy("date", "desc").limit(1).get(),
      db.collection("users").doc(uid).collection("sessionHistory")
        .count().get(),
      db.collection("users").doc(uid).collection("sessionHistory")
        .where("date", ">=", weekStartIso).count().get(),
      db.collection("users").doc(uid).collection("exerciseLastPerformance")
        .orderBy("date", "desc").limit(1).get(),
    ]);

    let latestPR: ClientStats["latestPR"] = null;
    if (!prSnap.empty) {
      const prData = prSnap.docs[0].data();
      latestPR = {
        exercise: prData.exerciseName ?? prData.exercise_name ?? prSnap.docs[0].id,
        value: prData.weight ?? prData.value ?? null,
        date: prData.date ?? null,
      };
    }

    statsMap[uid] = {
      sessionsCompleted: countSnap.data().count,
      lastSessionDate: histSnap.empty ? null : (histSnap.docs[0].data().date ?? null),
      weeklyConsistency: weekSnap.data().count,
      latestPR,
    };
  }));

  const enriched = clientDocs.map((client) => {
    const userId = (client as Record<string, unknown>).clientUserId as string;
    const userData = userDocsMap[userId];
    const courses = (userData?.courses ?? {}) as Record<string, Record<string, unknown>>;
    const enrolledPrograms = Object.entries(courses)
      .filter(([, v]) => v.deliveryType === "one_on_one")
      .map(([courseId, v]) => ({ courseId, title: v.title, status: v.status }));

    // accessEndsAt: earliest expires_at among active one_on_one enrollments
    let accessEndsAt: string | null = null;
    for (const [, entry] of Object.entries(courses)) {
      if (entry.deliveryType === "one_on_one" && entry.status === "active" && entry.expires_at) {
        const ea = entry.expires_at as string;
        if (!accessEndsAt || ea < accessEndsAt) accessEndsAt = ea;
      }
    }

    const stats = statsMap[userId] ?? { sessionsCompleted: 0, lastSessionDate: null, weeklyConsistency: 0, latestPR: null };

    return {
      ...client,
      clientName: userData?.displayName ?? userData?.name ?? null,
      clientEmail: userData?.email ?? null,
      avatarUrl: userData?.profilePictureUrl ?? userData?.photoURL ?? null,
      enrolledPrograms,
      sessionsCompleted: stats.sessionsCompleted,
      lastSessionDate: stats.lastSessionDate,
      weeklyConsistency: stats.weeklyConsistency,
      latestPR: stats.latestPR,
      nutritionPlan: nutritionByClient[userId] ?? null,
      calls: callsByClient[userId] ?? [],
      accessEndsAt,
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

// GET /creator/courses — alias for /creator/programs (PWA apiService.getCoursesByCreatorId)
router.get("/creator/courses", async (req, res) => {
  const auth = await validateAuth(req);
  requireCreator(auth);
  await checkRateLimit(auth.userId, 200, "rate_limit_first_party");

  const snapshot = await db
    .collection("courses")
    .where("creator_id", "==", auth.userId)
    .orderBy("created_at", "desc")
    .limit(100)
    .get();

  res.json({
    data: snapshot.docs.map((d) => ({ id: d.id, ...d.data() })),
  });
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

  // Fetch clients once to compute per-program enrollment counts
  const clientsSnap = await db
    .collection("one_on_one_clients")
    .where("creatorId", "==", auth.userId)
    .get();
  const clientUserIds = clientsSnap.docs.map((d) => (d.data().clientUserId ?? d.data().userId) as string).filter(Boolean);

  // Batch-fetch user docs for course maps
  const enrollmentCounts: Record<string, number> = {};
  const batchSize = 10;
  for (let i = 0; i < clientUserIds.length; i += batchSize) {
    const batch = clientUserIds.slice(i, i + batchSize);
    const userDocs = await db.getAll(...batch.map((uid) => db.collection("users").doc(uid)));
    for (const uDoc of userDocs) {
      if (!uDoc.exists) continue;
      const courses = (uDoc.data()!.courses ?? {}) as Record<string, Record<string, unknown>>;
      for (const [courseId, entry] of Object.entries(courses)) {
        if (entry.status === "active") {
          enrollmentCounts[courseId] = (enrollmentCounts[courseId] ?? 0) + 1;
        }
      }
    }
  }

  const programs = docs.map((d) => {
    const data = d.data();
    return {
      id: d.id,
      ...data,
      imageUrl: data.image_url ?? null,
      enrollmentCount: enrollmentCounts[d.id] ?? 0,
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

  const versionStr = `${new Date().getFullYear()}-01`;
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
    content_plan_id: null,
    tutorials: {
      dailyWorkout: [],
      workoutCompletion: [],
      workoutExecution: [],
    },
    free_trial: req.body.free_trial && typeof req.body.free_trial === "object"
      ? { active: !!req.body.free_trial.active, duration_days: Math.max(0, parseInt(req.body.free_trial.duration_days, 10) || 0) }
      : { active: false, duration_days: 0 },
    version: versionStr,
    published_version: versionStr,
    created_at: FieldValue.serverTimestamp(),
    updated_at: FieldValue.serverTimestamp(),
    last_update: FieldValue.serverTimestamp(),
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
    "video_intro_url", "tutorials", "availableLibraries", "content_plan_id",
  ];
  const updates = pickFields(req.body, allowedFields);

  if (Object.keys(updates).length === 0) {
    throw new WakeApiServerError("VALIDATION_ERROR", 400, "No se proporcionaron campos para actualizar");
  }

  await docRef.update({
    ...updates,
    updated_at: FieldValue.serverTimestamp(),
    last_update: FieldValue.serverTimestamp(),
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
    last_update: FieldValue.serverTimestamp(),
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

  // Cascade delete: modules → sessions → exercises → sets
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
  await batch.commit();
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

  // Deep copy subcollections: modules → sessions → exercises → sets
  const sourceRef = db.collection("courses").doc(req.params.programId);
  const newRef = db.collection("courses").doc(newDoc.id);
  const modulesSnap = await sourceRef.collection("modules").get();
  let batch = db.batch();
  let count = 0;

  for (const mDoc of modulesSnap.docs) {
    const newModRef = newRef.collection("modules").doc();
    batch.set(newModRef, { ...mDoc.data(), created_at: FieldValue.serverTimestamp() });
    count++;
    if (count >= 450) { await batch.commit(); batch = db.batch(); count = 0; }

    const sessionsSnap = await mDoc.ref.collection("sessions").get();
    for (const sDoc of sessionsSnap.docs) {
      const newSessRef = newModRef.collection("sessions").doc();
      batch.set(newSessRef, { ...sDoc.data(), created_at: FieldValue.serverTimestamp() });
      count++;
      if (count >= 450) { await batch.commit(); batch = db.batch(); count = 0; }

      const exSnap = await sDoc.ref.collection("exercises").get();
      for (const eDoc of exSnap.docs) {
        const newExRef = newSessRef.collection("exercises").doc();
        batch.set(newExRef, { ...eDoc.data(), created_at: FieldValue.serverTimestamp() });
        count++;
        if (count >= 450) { await batch.commit(); batch = db.batch(); count = 0; }

        const setsSnap = await eDoc.ref.collection("sets").get();
        for (const setDoc of setsSnap.docs) {
          const newSetRef = newExRef.collection("sets").doc();
          batch.set(newSetRef, { ...setDoc.data(), created_at: FieldValue.serverTimestamp() });
          count++;
          if (count >= 450) { await batch.commit(); batch = db.batch(); count = 0; }
        }
      }
    }
  }
  if (count > 0) await batch.commit();

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

  const storagePath = `courses/${req.params.programId}/image.${contentType.split("/")[1] === "jpeg" ? "jpg" : contentType.split("/")[1]}`;
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
  validateStoragePath(storagePath, `courses/${req.params.programId}/`);

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
    videoUrl?: string;
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
      videoUrl: "optional_string",
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
  const allowedFields = ["name", "description", "calories", "protein", "carbs", "fat", "items", "category", "videoUrl"];
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

  // Use transaction for atomicity: assignment + content snapshot + optional pin
  const assignmentId = await db.runTransaction(async (tx) => {
    const assignmentRef = db.collection("nutrition_assignments").doc();
    tx.set(assignmentRef, {
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
    tx.set(db.collection("client_nutrition_plan_content").doc(assignmentRef.id), {
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
    const userRef = db.collection("users").doc(req.params.clientId);
    const userDoc = await tx.get(userRef);
    if (!userDoc.data()?.pinnedNutritionAssignmentId) {
      tx.update(userRef, { pinnedNutritionAssignmentId: assignmentRef.id });
    }

    return assignmentRef.id;
  });

  res.status(201).json({ data: { assignmentId } });
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

// GET /creator/clients/:clientId/nutrition/assignments/:assignmentId/content
router.get("/creator/clients/:clientId/nutrition/assignments/:assignmentId/content", async (req, res) => {
  const auth = await validateAuth(req);
  requireCreator(auth);
  await checkRateLimit(auth.userId, 200, "rate_limit_first_party");
  await verifyClientAccess(auth.userId, req.params.clientId);

  const assignDoc = await db.collection("nutrition_assignments").doc(req.params.assignmentId).get();
  if (!assignDoc.exists || assignDoc.data()?.assignedBy !== auth.userId) {
    throw new WakeApiServerError("NOT_FOUND", 404, "Asignación no encontrada");
  }

  const contentDoc = await db.collection("client_nutrition_plan_content").doc(req.params.assignmentId).get();
  if (!contentDoc.exists) {
    res.json({ data: null });
    return;
  }

  res.json({ data: contentDoc.data() });
});

// PUT /creator/clients/:clientId/nutrition/assignments/:assignmentId/content
router.put("/creator/clients/:clientId/nutrition/assignments/:assignmentId/content", async (req, res) => {
  const auth = await validateAuth(req);
  requireCreator(auth);
  await checkRateLimit(auth.userId, 200, "rate_limit_first_party");
  await verifyClientAccess(auth.userId, req.params.clientId);

  const assignDoc = await db.collection("nutrition_assignments").doc(req.params.assignmentId).get();
  if (!assignDoc.exists || assignDoc.data()?.assignedBy !== auth.userId) {
    throw new WakeApiServerError("NOT_FOUND", 404, "Asignación no encontrada");
  }

  const body = req.body ?? {};
  await db.collection("client_nutrition_plan_content").doc(req.params.assignmentId).set({
    source_plan_id: body.source_plan_id ?? null,
    assignment_id: req.params.assignmentId,
    name: body.name ?? "",
    description: body.description ?? "",
    daily_calories: body.daily_calories ?? null,
    daily_protein_g: body.daily_protein_g ?? null,
    daily_carbs_g: body.daily_carbs_g ?? null,
    daily_fat_g: body.daily_fat_g ?? null,
    categories: Array.isArray(body.categories) ? body.categories : [],
    updated_at: FieldValue.serverTimestamp(),
  });

  res.json({ data: { updated: true } });
});

// GET /creator/nutrition/assignments — list all assignments for this creator
router.get("/creator/nutrition/assignments", async (req, res) => {
  const auth = await validateAuth(req);
  requireCreator(auth);
  await checkRateLimit(auth.userId, 200, "rate_limit_first_party");

  const snap = await db
    .collection("nutrition_assignments")
    .where("assignedBy", "==", auth.userId)
    .orderBy("createdAt", "desc")
    .get();

  const assignments = snap.docs.map((d) => ({
    id: d.id,
    assignmentId: d.id,
    ...d.data(),
  }));

  res.json({ data: assignments });
});

// GET /creator/nutrition/assignments/:assignmentId
router.get("/creator/nutrition/assignments/:assignmentId", async (req, res) => {
  const auth = await validateAuth(req);
  requireCreator(auth);
  await checkRateLimit(auth.userId, 200, "rate_limit_first_party");

  const doc = await db.collection("nutrition_assignments").doc(req.params.assignmentId).get();
  if (!doc.exists || doc.data()?.assignedBy !== auth.userId) {
    throw new WakeApiServerError("NOT_FOUND", 404, "Asignación no encontrada");
  }

  res.json({ data: { id: doc.id, assignmentId: doc.id, ...doc.data() } });
});

// GET /creator/nutrition/assignments-by-plan?sourcePlanId=...
router.get("/creator/nutrition/assignments-by-plan", async (req, res) => {
  const auth = await validateAuth(req);
  requireCreator(auth);
  await checkRateLimit(auth.userId, 200, "rate_limit_first_party");

  const sourcePlanId = req.query.sourcePlanId as string;
  if (!sourcePlanId) {
    throw new WakeApiServerError("VALIDATION_ERROR", 400, "sourcePlanId es requerido", "sourcePlanId");
  }

  const snap = await db
    .collection("nutrition_assignments")
    .where("planId", "==", sourcePlanId)
    .where("assignedBy", "==", auth.userId)
    .get();

  res.json({ data: snap.docs.map((d) => ({ id: d.id, assignmentId: d.id, ...d.data() })) });
});

// ─── Creator Feedback ─────────────────────────────────────────────────────

// POST /creator/feedback/upload-url
router.post("/creator/feedback/upload-url", async (req, res) => {
  const auth = await validateAuth(req);
  requireCreator(auth);
  await checkRateLimit(auth.userId, 10, "rate_limit_first_party");

  const { filename, contentType } = validateBody<{ filename: string; contentType: string }>(
    { filename: "string", contentType: "string" },
    req.body
  );

  const allowedTypes = ["image/jpeg", "image/png", "image/webp"];
  if (!allowedTypes.includes(contentType)) {
    throw new WakeApiServerError("VALIDATION_ERROR", 400, "Tipo de archivo no soportado", "contentType");
  }

  const ext = contentType.split("/")[1] === "jpeg" ? "jpg" : contentType.split("/")[1];
  const storagePath = `creator_feedback/${auth.userId}/${Date.now()}_${filename.replace(/[^a-zA-Z0-9._-]/g, "_")}.${ext}`;
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

// POST /creator/feedback
router.post("/creator/feedback", async (req, res) => {
  const auth = await validateAuth(req);
  requireCreator(auth);
  await checkRateLimit(auth.userId, 20, "rate_limit_first_party");

  const body = validateBody<{
    type: string;
    text: string;
    storagePath?: string;
    creatorEmail?: string;
    creatorDisplayName?: string;
  }>(
    {
      type: "string",
      text: "string",
      storagePath: "optional_string",
      creatorEmail: "optional_string",
      creatorDisplayName: "optional_string",
    },
    req.body
  );

  const docRef = await db.collection("creator_feedback").add({
    creatorId: auth.userId,
    type: body.type,
    text: body.text,
    storagePath: body.storagePath ?? null,
    creatorEmail: body.creatorEmail ?? null,
    creatorDisplayName: body.creatorDisplayName ?? null,
    created_at: FieldValue.serverTimestamp(),
  });

  res.status(201).json({ data: { feedbackId: docRef.id } });
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

// ─── Client Plan Content (one-on-one scheduling/content chain) ────────────

function planContentDocId(clientId: string, programId: string, weekKey: string): string {
  return `${clientId}_${programId}_${weekKey}`;
}

// GET /creator/clients/:clientId/plan-content/:weekKey?programId=X
router.get("/creator/clients/:clientId/plan-content/:weekKey", async (req, res) => {
  const auth = await validateAuth(req);
  requireCreator(auth);
  await checkRateLimit(auth.userId, 200, "rate_limit_first_party");
  await verifyClientAccess(auth.userId, req.params.clientId);

  const programId = req.query.programId as string;
  if (!programId) {
    throw new WakeApiServerError("VALIDATION_ERROR", 400, "programId es requerido", "programId");
  }

  const docId = planContentDocId(req.params.clientId, programId, req.params.weekKey);
  const doc = await db.collection("client_plan_content").doc(docId).get();

  if (!doc.exists) {
    res.json({ data: null });
    return;
  }

  const docData = doc.data()!;

  // Load sessions subcollection
  const sessionsSnap = await doc.ref.collection("sessions").orderBy("order", "asc").get();
  const sessions = await Promise.all(
    sessionsSnap.docs.map(async (sDoc) => {
      const exSnap = await sDoc.ref.collection("exercises").orderBy("order", "asc").get();
      const exercises = await Promise.all(
        exSnap.docs.map(async (eDoc) => {
          const setsSnap = await eDoc.ref.collection("sets").orderBy("order", "asc").get();
          return {
            id: eDoc.id,
            ...eDoc.data(),
            sets: setsSnap.docs.map((s) => ({ id: s.id, ...s.data() })),
          };
        })
      );
      return { id: sDoc.id, ...sDoc.data(), exercises };
    })
  );

  res.json({ data: { ...docData, programId, sessions } });
});

// PUT /creator/clients/:clientId/plan-content/:weekKey
router.put("/creator/clients/:clientId/plan-content/:weekKey", async (req, res) => {
  const auth = await validateAuth(req);
  requireCreator(auth);
  await checkRateLimit(auth.userId, 200, "rate_limit_first_party");
  await verifyClientAccess(auth.userId, req.params.clientId);

  const body = req.body ?? {};
  const programId = body.programId as string;
  if (!programId) {
    throw new WakeApiServerError("VALIDATION_ERROR", 400, "programId es requerido", "programId");
  }

  const docId = planContentDocId(req.params.clientId, programId, req.params.weekKey);
  const docRef = db.collection("client_plan_content").doc(docId);

  await docRef.set({
    title: body.title ?? req.params.weekKey,
    order: body.order ?? 0,
    source_plan_id: body.source_plan_id ?? null,
    source_module_id: body.source_module_id ?? null,
    created_at: FieldValue.serverTimestamp(),
    updated_at: FieldValue.serverTimestamp(),
  });

  // If sessions are provided, write them as subcollection docs
  const sessions = Array.isArray(body.sessions) ? body.sessions : [];
  const batch = db.batch();
  let batchCount = 0;

  for (const session of sessions) {
    if (!session || typeof session !== "object") continue;
    const sessionId = session.id ?? session.sessionId ?? db.collection("_").doc().id;
    const sessionRef = docRef.collection("sessions").doc(sessionId);
    const { exercises: exArr, ...sessionFields } = session as Record<string, unknown>;
    batch.set(sessionRef, {
      ...sessionFields,
      id: sessionId,
      created_at: FieldValue.serverTimestamp(),
      updated_at: FieldValue.serverTimestamp(),
    });
    batchCount++;

    // Write exercises if provided
    if (Array.isArray(exArr)) {
      for (const exercise of exArr) {
        if (!exercise || typeof exercise !== "object") continue;
        const exId = (exercise as Record<string, unknown>).id ?? db.collection("_").doc().id;
        const exRef = sessionRef.collection("exercises").doc(exId as string);
        const { sets: setsArr, ...exFields } = exercise as Record<string, unknown>;
        batch.set(exRef, { ...exFields, id: exId, created_at: FieldValue.serverTimestamp() });
        batchCount++;

        if (Array.isArray(setsArr)) {
          for (const set of setsArr) {
            if (!set || typeof set !== "object") continue;
            const setId = (set as Record<string, unknown>).id ?? db.collection("_").doc().id;
            const setRef = exRef.collection("sets").doc(setId as string);
            batch.set(setRef, { ...set, id: setId, created_at: FieldValue.serverTimestamp() });
            batchCount++;
          }
        }

        if (batchCount >= 450) {
          await batch.commit();
          batchCount = 0;
        }
      }
    }
  }

  if (batchCount > 0) await batch.commit();

  res.json({ data: { docId, weekKey: req.params.weekKey, sessionsWritten: sessions.length } });
});

// PATCH /creator/clients/:clientId/plan-content/:weekKey/sessions/:sessionId
router.patch("/creator/clients/:clientId/plan-content/:weekKey/sessions/:sessionId", async (req, res) => {
  const auth = await validateAuth(req);
  requireCreator(auth);
  await checkRateLimit(auth.userId, 200, "rate_limit_first_party");
  await verifyClientAccess(auth.userId, req.params.clientId);

  const programId = req.query.programId as string;
  if (!programId) {
    throw new WakeApiServerError("VALIDATION_ERROR", 400, "programId es requerido", "programId");
  }

  const docId = planContentDocId(req.params.clientId, programId, req.params.weekKey);
  const sessionRef = db
    .collection("client_plan_content")
    .doc(docId)
    .collection("sessions")
    .doc(req.params.sessionId);

  const sessionDoc = await sessionRef.get();
  if (!sessionDoc.exists) {
    throw new WakeApiServerError("NOT_FOUND", 404, "Sesión no encontrada");
  }

  const allowedFields = ["title", "order", "dayIndex", "isRestDay", "image_url", "librarySessionRef"];
  const updates = pickFields(req.body, allowedFields);

  if (Object.keys(updates).length === 0) {
    throw new WakeApiServerError("VALIDATION_ERROR", 400, "No se proporcionaron campos para actualizar");
  }

  await sessionRef.update({ ...updates, updated_at: FieldValue.serverTimestamp() });
  res.json({ data: { sessionId: req.params.sessionId, updated: true } });
});

// ─── Client Sessions (one-on-one scheduled sessions) ─────────────────────

// GET /creator/clients/:clientId/client-sessions
router.get("/creator/clients/:clientId/client-sessions", async (req, res) => {
  const auth = await validateAuth(req);
  requireCreator(auth);
  await checkRateLimit(auth.userId, 200, "rate_limit_first_party");
  await verifyClientAccess(auth.userId, req.params.clientId);

  const { startDate, endDate } = req.query as Record<string, string | undefined>;
  let query: Query = db
    .collection("client_sessions")
    .where("client_id", "==", req.params.clientId)
    .where("creator_id", "==", auth.userId);

  if (startDate && endDate) {
    query = query.where("date", ">=", startDate).where("date", "<=", endDate);
  }

  query = query.orderBy("date", "asc").limit(100);
  const snap = await query.get();

  res.json({ data: snap.docs.map((d) => ({ id: d.id, ...d.data() })) });
});

// PUT /creator/clients/:clientId/client-sessions/:clientSessionId
router.put("/creator/clients/:clientId/client-sessions/:clientSessionId", async (req, res) => {
  const auth = await validateAuth(req);
  requireCreator(auth);
  await checkRateLimit(auth.userId, 200, "rate_limit_first_party");
  await verifyClientAccess(auth.userId, req.params.clientId);

  const body = req.body ?? {};
  const docRef = db.collection("client_sessions").doc(req.params.clientSessionId);

  await docRef.set({
    ...body,
    client_id: req.params.clientId,
    creator_id: auth.userId,
    updated_at: FieldValue.serverTimestamp(),
  });

  res.json({ data: { id: req.params.clientSessionId } });
});

// GET /creator/clients/:clientId/client-sessions/:clientSessionId
router.get("/creator/clients/:clientId/client-sessions/:clientSessionId", async (req, res) => {
  const auth = await validateAuth(req);
  requireCreator(auth);
  await checkRateLimit(auth.userId, 200, "rate_limit_first_party");

  const doc = await db.collection("client_sessions").doc(req.params.clientSessionId).get();
  if (!doc.exists) {
    throw new WakeApiServerError("NOT_FOUND", 404, "Sesión no encontrada");
  }

  const data = doc.data()!;
  if (data.creator_id !== auth.userId) {
    throw new WakeApiServerError("FORBIDDEN", 403, "No tienes acceso");
  }

  res.json({ data: { id: doc.id, ...data } });
});

// PATCH /creator/clients/:clientId/client-sessions/:clientSessionId
router.patch("/creator/clients/:clientId/client-sessions/:clientSessionId", async (req, res) => {
  const auth = await validateAuth(req);
  requireCreator(auth);
  await checkRateLimit(auth.userId, 200, "rate_limit_first_party");

  const docRef = db.collection("client_sessions").doc(req.params.clientSessionId);
  const doc = await docRef.get();
  if (!doc.exists || doc.data()?.creator_id !== auth.userId) {
    throw new WakeApiServerError("NOT_FOUND", 404, "Sesión no encontrada");
  }

  const allowedFields = ["date", "date_timestamp", "session_id", "module_id", "plan_id", "program_id", "status", "notes"];
  const updates = pickFields(req.body, allowedFields);

  if (Object.keys(updates).length === 0) {
    throw new WakeApiServerError("VALIDATION_ERROR", 400, "No se proporcionaron campos para actualizar");
  }

  await docRef.update({ ...updates, updated_at: FieldValue.serverTimestamp() });
  res.json({ data: { id: doc.id, updated: true } });
});

// DELETE /creator/clients/:clientId/client-sessions/:clientSessionId
router.delete("/creator/clients/:clientId/client-sessions/:clientSessionId", async (req, res) => {
  const auth = await validateAuth(req);
  requireCreator(auth);
  await checkRateLimit(auth.userId, 200, "rate_limit_first_party");

  const docRef = db.collection("client_sessions").doc(req.params.clientSessionId);
  const doc = await docRef.get();
  if (!doc.exists || doc.data()?.creator_id !== auth.userId) {
    throw new WakeApiServerError("NOT_FOUND", 404, "Sesión no encontrada");
  }

  await docRef.delete();
  res.status(204).send();
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

  const [snap, coursesSnap] = await Promise.all([
    db.collection("plans")
      .where("creator_id", "==", auth.userId)
      .orderBy("created_at", "desc")
      .get(),
    db.collection("courses")
      .where("creator_id", "==", auth.userId)
      .get(),
  ]);

  // Build map: planId → count of courses that reference this plan
  const planClientCounts: Record<string, number> = {};
  for (const cDoc of coursesSnap.docs) {
    const cpId = cDoc.data().content_plan_id as string | undefined;
    if (cpId) {
      planClientCounts[cpId] = (planClientCounts[cpId] ?? 0) + 1;
    }
  }

  // Fetch modules per plan in parallel for weekCount and weeks[]
  const plans = await Promise.all(
    snap.docs.map(async (d) => {
      const data = d.data();
      const modulesSnap = await db
        .collection("plans")
        .doc(d.id)
        .collection("modules")
        .orderBy("order", "asc")
        .get();

      return {
        id: d.id,
        ...data,
        weekCount: modulesSnap.size,
        clientCount: planClientCounts[d.id] ?? 0,
        weeks: modulesSnap.docs.map((m) => ({
          moduleId: m.id,
          title: m.data().title ?? null,
        })),
      };
    })
  );

  res.json({ data: plans });
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

  const body = validateBody<{ title: string; order: number; isRestDay?: boolean; librarySessionRef?: string; dayIndex?: number; image_url?: string }>(
    { title: "string", order: "number", isRestDay: "optional_boolean", librarySessionRef: "optional_string", dayIndex: "optional_number", image_url: "optional_string" },
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
      ...(body.librarySessionRef !== undefined && { librarySessionRef: body.librarySessionRef }),
      ...(body.dayIndex !== undefined && { dayIndex: body.dayIndex }),
      ...(body.image_url !== undefined && { image_url: body.image_url }),
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
        id: eDoc.id,
        ...eDoc.data(),
        sets: setsSnap.docs.map((s) => ({ setId: s.id, id: s.id, ...s.data() })),
      };
    })
  );

  res.json({ data: { sessionId: sessionDoc.id, id: sessionDoc.id, ...sessionDoc.data(), exercises } });
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

  // Allowlist: title, order, isRestDay, librarySessionRef, dayIndex, image_url
  const allowedFields = ["title", "order", "isRestDay", "librarySessionRef", "dayIndex", "image_url"];
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

  const allowedExFields = [
    "name", "order", "title", "libraryId", "primaryMuscles", "notes",
    "programSettings", "defaultSetValues",
    "primary", "alternatives", "objectives", "measures",
    "description", "video_url", "muscle_activation", "implements",
    "customMeasureLabels", "customObjectiveLabels",
  ];
  const exData = pickFields(req.body, allowedExFields);
  exData.created_at = FieldValue.serverTimestamp();

  const ref = await db
    .collection("plans")
    .doc(req.params.planId)
    .collection("modules")
    .doc(req.params.moduleId)
    .collection("sessions")
    .doc(req.params.sessionId)
    .collection("exercises")
    .add(exData);

  res.status(201).json({ data: { exerciseId: ref.id, id: ref.id } });
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
  const allowedFields = [
    "name", "order", "title", "libraryId", "primaryMuscles", "notes",
    "videoUrl", "thumbnailUrl", "programSettings", "defaultSetValues",
    "primary", "alternatives", "objectives", "measures",
    "description", "video_url", "muscle_activation", "implements",
    "customMeasureLabels", "customObjectiveLabels",
  ];
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
    title?: string;
    reps?: string | number;
    weight?: number;
    intensity?: string;
    rir?: number;
    restSeconds?: number;
    type?: string;
  }>(
    {
      order: "number",
      title: "optional_string",
      reps: "optional_string_or_number",
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

  res.status(201).json({ data: { setId: ref.id, id: ref.id } });
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
  const allowedFields = ["order", "title", "reps", "weight", "intensity", "rir", "restSeconds", "type"];
  const updates = pickFields(req.body, allowedFields);

  // Allow custom objective/measure fields (custom_*)
  for (const [key, value] of Object.entries(req.body as Record<string, unknown>)) {
    if (key.startsWith("custom_") && (typeof value === "string" || typeof value === "number" || value === null)) {
      updates[key] = value;
    }
  }

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

// GET /creator/library/exercises — deduplicated exercises from creator_libraries sessions + exercises_library
router.get("/creator/library/exercises", async (req, res) => {
  const auth = await validateAuth(req);
  requireCreator(auth);
  await checkRateLimit(auth.userId, 200, "rate_limit_first_party");

  const seen = new Map<string, Record<string, unknown>>();

  // 1. Exercises from creator_libraries sessions
  const sessionsSnap = await db
    .collection("creator_libraries")
    .doc(auth.userId)
    .collection("sessions")
    .get();

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

  // 2. Exercises from exercises_library (flat docs where each exercise is a field)
  const libSnap = await db
    .collection("exercises_library")
    .where("creator_id", "==", auth.userId)
    .get();

  const metaKeys = new Set(["creator_id", "creator_name", "title", "created_at", "updated_at"]);

  for (const libDoc of libSnap.docs) {
    const libData = libDoc.data();
    for (const [fieldName, fieldVal] of Object.entries(libData)) {
      if (metaKeys.has(fieldName) || typeof fieldVal !== "object" || fieldVal === null) continue;
      const key = fieldName;
      if (!seen.has(key)) {
        const exData = fieldVal as Record<string, unknown>;
        const ma = (exData.muscle_activation || {}) as Record<string, number>;
        const primaryMuscles = Object.entries(ma)
          .sort((a, b) => b[1] - a[1])
          .map(([m]) => m);
        seen.set(key, {
          id: `${libDoc.id}_${fieldName}`,
          name: fieldName,
          primaryMuscles,
          video_url: (exData.video_url as string) || null,
          muscle_activation: exData.muscle_activation || null,
          implements: exData.implements || null,
          libraryId: libDoc.id,
        });
      }
    }
  }

  res.json({ data: Array.from(seen.values()) });
});

// GET /creator/library/sessions
router.get("/creator/library/sessions", async (req, res) => {
  const auth = await validateAuth(req);
  requireCreator(auth);
  await checkRateLimit(auth.userId, 200, "rate_limit_first_party");

  const sessionsCol = db
    .collection("creator_libraries")
    .doc(auth.userId)
    .collection("sessions");

  const snap = await sessionsCol.orderBy("created_at", "desc").get();

  const data = await Promise.all(
    snap.docs.map(async (d) => {
      const exSnap = await d.ref.collection("exercises").orderBy("order", "asc").get();
      const exercises = await Promise.all(
        exSnap.docs.map(async (eDoc) => {
          const setsSnap = await eDoc.ref.collection("sets").orderBy("order", "asc").get();
          return { exerciseId: eDoc.id, id: eDoc.id, ...eDoc.data(), sets: setsSnap.docs.map((s) => ({ setId: s.id, id: s.id, ...s.data() })) };
        })
      );
      return { sessionId: d.id, id: d.id, ...d.data(), exercises };
    })
  );

  res.json({ data });
});

// POST /creator/library/sessions
router.post("/creator/library/sessions", async (req, res) => {
  const auth = await validateAuth(req);
  requireCreator(auth);
  await checkRateLimit(auth.userId, 200, "rate_limit_first_party");

  const body = validateBody<{ title: string; image_url?: string }>({ title: "string", image_url: "optional_string" }, req.body);
  const sessionData: Record<string, unknown> = { title: body.title, created_at: FieldValue.serverTimestamp(), updated_at: FieldValue.serverTimestamp() };
  if (body.image_url) sessionData.image_url = body.image_url;
  const ref = await db
    .collection("creator_libraries")
    .doc(auth.userId)
    .collection("sessions")
    .add(sessionData);

  res.status(201).json({ data: { sessionId: ref.id, id: ref.id } });
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
      return { exerciseId: eDoc.id, id: eDoc.id, ...eDoc.data(), sets: setsSnap.docs.map((s) => ({ setId: s.id, id: s.id, ...s.data() })) };
    })
  );

  res.json({ data: { sessionId: doc.id, id: doc.id, ...doc.data(), exercises } });
});

// PATCH /creator/library/sessions/:sessionId
router.patch("/creator/library/sessions/:sessionId", async (req, res) => {
  const auth = await validateAuth(req);
  requireCreator(auth);
  await checkRateLimit(auth.userId, 200, "rate_limit_first_party");

  const ref = db.collection("creator_libraries").doc(auth.userId).collection("sessions").doc(req.params.sessionId);
  const doc = await ref.get();
  if (!doc.exists) throw new WakeApiServerError("NOT_FOUND", 404, "Sesión no encontrada");

  const allowedFields = ["title", "order", "isRestDay", "image_url", "defaultDataTemplate"];
  const updates = pickFields(req.body, allowedFields);

  if (Object.keys(updates).length === 0) {
    throw new WakeApiServerError("VALIDATION_ERROR", 400, "No se proporcionaron campos para actualizar");
  }

  await ref.update({ ...updates, updated_at: FieldValue.serverTimestamp() });
  res.json({ data: { updated: true } });
});

// POST /creator/library/sessions/:sessionId/image/upload-url
router.post("/creator/library/sessions/:sessionId/image/upload-url", async (req, res) => {
  const auth = await validateAuth(req);
  requireCreator(auth);
  await checkRateLimit(auth.userId, 200, "rate_limit_first_party");

  const sessionRef = db.collection("creator_libraries").doc(auth.userId).collection("sessions").doc(req.params.sessionId);
  const doc = await sessionRef.get();
  if (!doc.exists) throw new WakeApiServerError("NOT_FOUND", 404, "Sesión no encontrada");

  const { contentType } = validateBody<{ contentType: string }>({ contentType: "string" }, req.body);

  const ext = contentType.split("/")[1] === "jpeg" ? "jpg" : contentType.split("/")[1];
  const storagePath = `creator_libraries/${auth.userId}/sessions/${req.params.sessionId}/image.${ext}`;
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

// POST /creator/library/sessions/:sessionId/image/confirm
router.post("/creator/library/sessions/:sessionId/image/confirm", async (req, res) => {
  const auth = await validateAuth(req);
  requireCreator(auth);
  await checkRateLimit(auth.userId, 200, "rate_limit_first_party");

  const { storagePath } = validateBody<{ storagePath: string }>({ storagePath: "string" }, req.body);

  validateStoragePath(storagePath, `creator_libraries/${auth.userId}/sessions/${req.params.sessionId}/`);

  const bucket = admin.storage().bucket();
  const [exists] = await bucket.file(storagePath).exists();
  if (!exists) throw new WakeApiServerError("NOT_FOUND", 404, "Archivo no encontrado");

  const publicUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(storagePath)}?alt=media`;

  const sessionRef = db.collection("creator_libraries").doc(auth.userId).collection("sessions").doc(req.params.sessionId);
  await sessionRef.update({
    image_url: publicUrl,
    image_path: storagePath,
    updated_at: FieldValue.serverTimestamp(),
  });

  res.json({ data: { image_url: publicUrl, image_path: storagePath } });
});

// DELETE /creator/library/sessions/:sessionId
router.delete("/creator/library/sessions/:sessionId", async (req, res) => {
  const auth = await validateAuth(req);
  requireCreator(auth);
  await checkRateLimit(auth.userId, 200, "rate_limit_first_party");

  const ref = db.collection("creator_libraries").doc(auth.userId).collection("sessions").doc(req.params.sessionId);
  const doc = await ref.get();
  if (!doc.exists) throw new WakeApiServerError("NOT_FOUND", 404, "Sesión no encontrada");

  // Cascade delete: exercises → sets
  const exSnap = await ref.collection("exercises").get();
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
  batch.delete(ref);
  await batch.commit();
  res.status(204).send();
});

// Library session exercise/set CRUD — with allowlisted fields
router.post("/creator/library/sessions/:sessionId/exercises", async (req, res) => {
  const auth = await validateAuth(req);
  requireCreator(auth);
  await checkRateLimit(auth.userId, 200, "rate_limit_first_party");

  const allowedExFields = [
    "name", "order", "libraryId", "primaryMuscles", "notes",
    "primary", "alternatives", "objectives", "measures",
    "customMeasureLabels", "customObjectiveLabels", "defaultSetValues",
  ];
  const exData = pickFields(req.body, allowedExFields);
  exData.created_at = FieldValue.serverTimestamp();

  const ref = await db
    .collection("creator_libraries").doc(auth.userId)
    .collection("sessions").doc(req.params.sessionId)
    .collection("exercises")
    .add(exData);

  res.status(201).json({ data: { exerciseId: ref.id, id: ref.id } });
});

router.patch("/creator/library/sessions/:sessionId/exercises/:exerciseId", async (req, res) => {
  const auth = await validateAuth(req);
  requireCreator(auth);
  await checkRateLimit(auth.userId, 200, "rate_limit_first_party");

  const ref = db
    .collection("creator_libraries").doc(auth.userId)
    .collection("sessions").doc(req.params.sessionId)
    .collection("exercises").doc(req.params.exerciseId);

  const allowedFields = [
    "name", "order", "libraryId", "primaryMuscles", "notes", "videoUrl", "thumbnailUrl",
    "primary", "alternatives", "objectives", "measures",
    "customMeasureLabels", "customObjectiveLabels", "defaultSetValues",
  ];
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

  const body = validateBody<{ order: number; title?: string; reps?: string | number; weight?: number; intensity?: string; rir?: number; restSeconds?: number; type?: string }>(
    { order: "number", title: "optional_string", reps: "optional_string_or_number", weight: "optional_number", intensity: "optional_string", rir: "optional_number", restSeconds: "optional_number", type: "optional_string" },
    req.body
  );

  const ref = await db
    .collection("creator_libraries").doc(auth.userId)
    .collection("sessions").doc(req.params.sessionId)
    .collection("exercises").doc(req.params.exerciseId)
    .collection("sets")
    .add({ ...body, created_at: FieldValue.serverTimestamp() });

  res.status(201).json({ data: { setId: ref.id, id: ref.id } });
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

  const allowedFields = ["order", "title", "reps", "weight", "intensity", "rir", "restSeconds", "type"];
  const updates = pickFields(req.body, allowedFields);

  // Allow custom objective/measure fields (custom_*)
  for (const [key, value] of Object.entries(req.body as Record<string, unknown>)) {
    if (key.startsWith("custom_") && (typeof value === "string" || typeof value === "number" || value === null)) {
      updates[key] = value;
    }
  }

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

  // Module references sessions by sessionRefs — but the sessions live at creator_libraries/{id}/sessions/
  // not as subcollections of the module, so we only need to delete the module doc itself.
  // (Library sessions are standalone docs, not subcollections of modules.)
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
  const affectedPlanIds: string[] = [];
  const affectedUserIdSet = new Set<string>();

  for (const planDoc of plansSnap.docs) {
    const modulesSnap = await planDoc.ref.collection("modules").get();
    let planHasRef = false;
    for (const moduleDoc of modulesSnap.docs) {
      const sessionsSnap = await moduleDoc.ref.collection("sessions")
        .where("librarySessionRef", "==", sessionId)
        .limit(1)
        .get();
      if (!sessionsSnap.empty) {
        planHasRef = true;
        break;
      }
    }
    if (planHasRef) {
      programCount++;
      affectedPlanIds.push(planDoc.id);
    }
  }

  // Find affected users: clients whose planAssignments reference any affected plan
  if (affectedPlanIds.length > 0) {
    const affectedPlanIdSet = new Set(affectedPlanIds);
    const clientsSnap = await db
      .collection("one_on_one_clients")
      .where("creatorId", "==", auth.userId)
      .get();

    for (const clientDoc of clientsSnap.docs) {
      const clientUserId = clientDoc.data().clientUserId as string;
      const cpSnap = await db
        .collection("client_programs")
        .where("user_id", "==", clientUserId)
        .get();

      for (const cpDoc of cpSnap.docs) {
        const assignments = cpDoc.data().planAssignments as Record<string, { planId: string }> | undefined;
        if (!assignments) continue;
        for (const val of Object.values(assignments)) {
          if (affectedPlanIdSet.has(val.planId)) {
            affectedUserIdSet.add(clientUserId);
            break;
          }
        }
        if (affectedUserIdSet.has(clientUserId)) break;
      }
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

  // Helper: replace exercises/sets on a session doc with library content
  const replaceSessionContent = async (sessionRef: FirebaseFirestore.DocumentReference) => {
    batch.update(sessionRef, {
      title: libSessionData.title,
      updated_at: FieldValue.serverTimestamp(),
    });
    batchCount++;
    if (batchCount >= batchSize) { await batch.commit(); batch = db.batch(); batchCount = 0; }

    const existingExSnap = await sessionRef.collection("exercises").get();
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
      const newExRef = sessionRef.collection("exercises").doc();
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
  };

  // Phase 1: Update plan template sessions
  for (const planDoc of plansSnap.docs) {
    const modulesSnap = await planDoc.ref.collection("modules").get();
    for (const moduleDoc of modulesSnap.docs) {
      const sessionsSnap = await moduleDoc.ref.collection("sessions")
        .where("librarySessionRef", "==", req.params.sessionId)
        .get();

      for (const sessionDoc of sessionsSnap.docs) {
        await replaceSessionContent(sessionDoc.ref);
      }
    }
  }

  // Phase 2: Update client_plan_content snapshots
  const clientsSnap = await db
    .collection("one_on_one_clients")
    .where("creatorId", "==", auth.userId)
    .get();

  for (const clientDoc of clientsSnap.docs) {
    const clientUserId = clientDoc.data().clientUserId as string;
    const cpSnap = await db
      .collection("client_programs")
      .where("user_id", "==", clientUserId)
      .get();

    for (const cpDoc of cpSnap.docs) {
      const programId = cpDoc.data().program_id as string;
      const assignments = cpDoc.data().planAssignments as Record<string, { planId: string }> | undefined;
      if (!assignments) continue;

      for (const [weekKey] of Object.entries(assignments)) {
        const contentDocId = `${clientUserId}_${programId}_${weekKey}`;
        const contentDocRef = db.collection("client_plan_content").doc(contentDocId);
        const contentDoc = await contentDocRef.get();
        if (!contentDoc.exists) continue;

        const matchingSessions = await contentDocRef
          .collection("sessions")
          .where("librarySessionRef", "==", req.params.sessionId)
          .get();

        for (const sessionDoc of matchingSessions.docs) {
          await replaceSessionContent(sessionDoc.ref);
        }
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
    // Check both field names for module references
    const modulesSnap1 = await planDoc.ref.collection("modules")
      .where("libraryRef", "==", req.params.moduleId)
      .get();
    const modulesSnap2 = await planDoc.ref.collection("modules")
      .where("libraryModuleRef", "==", req.params.moduleId)
      .get();
    const seenModIds = new Set(modulesSnap1.docs.map((d) => d.id));
    const modulesSnap = { docs: [...modulesSnap1.docs] };
    for (const d of modulesSnap2.docs) {
      if (!seenModIds.has(d.id)) modulesSnap.docs.push(d);
    }

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

  const courseData = courseDoc.data()!;
  const now = new Date().toISOString();

  await userRef.update({
    [`courses.${req.params.programId}`]: {
      status: "active",
      deliveryType: "one_on_one",
      access_duration: req.body.accessDuration ?? "one_on_one",
      title: courseData.title ?? "",
      image_url: courseData.image_url ?? null,
      discipline: courseData.discipline ?? "General",
      creatorName: courseData.creatorName ?? courseData.creator_name ?? "",
      completedTutorials: {
        dailyWorkout: [],
        warmup: [],
        workoutExecution: [],
        workoutCompletion: [],
      },
      assigned_by: auth.userId,
      assigned_at: now,
      purchased_at: now,
      expires_at: req.body.expiresAt ?? null,
    },
  });

  res.status(201).json({ data: { assignedAt: now } });
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

// GET /creator/bookings — list creator's call bookings
router.get("/creator/bookings", async (req, res) => {
  const auth = await validateAuth(req);
  requireCreator(auth);
  await checkRateLimit(auth.userId, 200, "rate_limit_first_party");

  const snap = await db
    .collection("call_bookings")
    .where("creatorId", "==", auth.userId)
    .orderBy("slotStartUtc", "desc")
    .limit(100)
    .get();

  const bookings = snap.docs.map((d) => {
    const data = d.data();
    return {
      id: d.id,
      clientUserId: data.clientUserId ?? null,
      clientDisplayName: data.clientName ?? data.clientDisplayName ?? data.displayName ?? null,
      slotStartUtc: data.slotStartUtc ?? data.startAt ?? data.startTime ?? null,
      slotEndUtc: data.slotEndUtc ?? data.endAt ?? data.endTime ?? null,
      durationMinutes: data.durationMinutes ?? null,
      status: data.status ?? "confirmed",
      date: data.date ?? null,
      created_at: data.created_at ?? null,
    };
  });

  res.json({ data: bookings });
});

// ─── Creator Availability ────────────────────────────────────────────────

// GET /creator/availability
router.get("/creator/availability", async (req, res) => {
  const auth = await validateAuth(req);
  requireCreator(auth);
  await checkRateLimit(auth.userId, 200, "rate_limit_first_party");

  const doc = await db.collection("creator_availability").doc(auth.userId).get();
  if (!doc.exists) {
    res.json({ data: { timezone: null, days: {}, weeklyTemplate: null } });
    return;
  }

  const data = doc.data()!;
  res.json({
    data: {
      timezone: data.timezone ?? null,
      days: data.days ?? {},
      weeklyTemplate: data.weeklyTemplate ?? null,
      disabledDates: data.disabledDates ?? [],
      defaultSlotDuration: data.defaultSlotDuration ?? 45,
    },
  });
});

// PUT /creator/availability/template
router.put("/creator/availability/template", async (req, res) => {
  const auth = await validateAuth(req);
  requireCreator(auth);
  await checkRateLimit(auth.userId, 200, "rate_limit_first_party");

  const body = validateBody<{
    weeklyTemplate: unknown;
    disabledDates?: unknown[];
    defaultSlotDuration?: number;
    timezone?: string;
  }>(
    {
      weeklyTemplate: "object",
      disabledDates: "optional_array",
      defaultSlotDuration: "optional_number",
      timezone: "optional_string",
    },
    req.body
  );

  await db.collection("creator_availability").doc(auth.userId).set(
    {
      weeklyTemplate: body.weeklyTemplate,
      ...(body.disabledDates !== undefined ? { disabledDates: body.disabledDates } : {}),
      ...(body.defaultSlotDuration !== undefined ? { defaultSlotDuration: body.defaultSlotDuration } : {}),
      ...(body.timezone ? { timezone: body.timezone } : {}),
      updated_at: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  res.json({ data: { updated: true } });
});

// ─── Courses Subcollection CRUD (modules/sessions/exercises/sets) ─────────

// GET /creator/programs/:programId/modules
router.get("/creator/programs/:programId/modules", async (req, res) => {
  const auth = await validateAuth(req);
  requireCreator(auth);
  await checkRateLimit(auth.userId, 200, "rate_limit_first_party");

  const courseDoc = await db.collection("courses").doc(req.params.programId).get();
  if (!courseDoc.exists || courseDoc.data()?.creator_id !== auth.userId) {
    throw new WakeApiServerError("NOT_FOUND", 404, "Programa no encontrado");
  }

  const snap = await db
    .collection("courses")
    .doc(req.params.programId)
    .collection("modules")
    .orderBy("order", "asc")
    .get();

  res.json({ data: snap.docs.map((d) => ({ moduleId: d.id, id: d.id, ...d.data() })) });
});

// POST /creator/programs/:programId/modules
router.post("/creator/programs/:programId/modules", async (req, res) => {
  const auth = await validateAuth(req);
  requireCreator(auth);
  await checkRateLimit(auth.userId, 200, "rate_limit_first_party");

  const courseDoc = await db.collection("courses").doc(req.params.programId).get();
  if (!courseDoc.exists || courseDoc.data()?.creator_id !== auth.userId) {
    throw new WakeApiServerError("NOT_FOUND", 404, "Programa no encontrado");
  }

  const body = validateBody<{ title: string; order?: number }>(
    { title: "string", order: "optional_number" },
    req.body
  );

  const ref = await db
    .collection("courses")
    .doc(req.params.programId)
    .collection("modules")
    .add({
      title: body.title,
      order: body.order ?? 0,
      created_at: FieldValue.serverTimestamp(),
    });

  res.status(201).json({ data: { moduleId: ref.id, id: ref.id } });
});

// PATCH /creator/programs/:programId/modules/:moduleId
router.patch("/creator/programs/:programId/modules/:moduleId", async (req, res) => {
  const auth = await validateAuth(req);
  requireCreator(auth);
  await checkRateLimit(auth.userId, 200, "rate_limit_first_party");

  const courseDoc = await db.collection("courses").doc(req.params.programId).get();
  if (!courseDoc.exists || courseDoc.data()?.creator_id !== auth.userId) {
    throw new WakeApiServerError("NOT_FOUND", 404, "Programa no encontrado");
  }

  const modRef = db
    .collection("courses")
    .doc(req.params.programId)
    .collection("modules")
    .doc(req.params.moduleId);

  const modDoc = await modRef.get();
  if (!modDoc.exists) {
    throw new WakeApiServerError("NOT_FOUND", 404, "Módulo no encontrado");
  }

  const updates = pickFields(req.body, ["title", "order"]);
  if (Object.keys(updates).length === 0) {
    throw new WakeApiServerError("VALIDATION_ERROR", 400, "No se proporcionaron campos para actualizar");
  }

  await modRef.update({ ...updates, updated_at: FieldValue.serverTimestamp() });
  res.json({ data: { moduleId: req.params.moduleId, updated: true } });
});

// DELETE /creator/programs/:programId/modules/:moduleId
router.delete("/creator/programs/:programId/modules/:moduleId", async (req, res) => {
  const auth = await validateAuth(req);
  requireCreator(auth);
  await checkRateLimit(auth.userId, 200, "rate_limit_first_party");

  const courseDoc = await db.collection("courses").doc(req.params.programId).get();
  if (!courseDoc.exists || courseDoc.data()?.creator_id !== auth.userId) {
    throw new WakeApiServerError("NOT_FOUND", 404, "Programa no encontrado");
  }

  const modRef = db
    .collection("courses")
    .doc(req.params.programId)
    .collection("modules")
    .doc(req.params.moduleId);

  if (!(await modRef.get()).exists) {
    throw new WakeApiServerError("NOT_FOUND", 404, "Módulo no encontrado");
  }

  await modRef.delete();
  res.status(204).send();
});

// GET /creator/programs/:programId/modules/:moduleId/sessions
router.get("/creator/programs/:programId/modules/:moduleId/sessions", async (req, res) => {
  const auth = await validateAuth(req);
  requireCreator(auth);
  await checkRateLimit(auth.userId, 200, "rate_limit_first_party");

  const courseDoc = await db.collection("courses").doc(req.params.programId).get();
  if (!courseDoc.exists || courseDoc.data()?.creator_id !== auth.userId) {
    throw new WakeApiServerError("NOT_FOUND", 404, "Programa no encontrado");
  }

  const snap = await db
    .collection("courses")
    .doc(req.params.programId)
    .collection("modules")
    .doc(req.params.moduleId)
    .collection("sessions")
    .orderBy("order", "asc")
    .get();

  res.json({ data: snap.docs.map((d) => ({ sessionId: d.id, id: d.id, ...d.data() })) });
});

// POST /creator/programs/:programId/modules/:moduleId/sessions
router.post("/creator/programs/:programId/modules/:moduleId/sessions", async (req, res) => {
  const auth = await validateAuth(req);
  requireCreator(auth);
  await checkRateLimit(auth.userId, 200, "rate_limit_first_party");

  const courseDoc = await db.collection("courses").doc(req.params.programId).get();
  if (!courseDoc.exists || courseDoc.data()?.creator_id !== auth.userId) {
    throw new WakeApiServerError("NOT_FOUND", 404, "Programa no encontrado");
  }

  const body = validateBody<{ title: string; order?: number; librarySessionRef?: string; dayIndex?: number; image_url?: string }>(
    { title: "string", order: "optional_number", librarySessionRef: "optional_string", dayIndex: "optional_number", image_url: "optional_string" },
    req.body
  );

  const ref = await db
    .collection("courses")
    .doc(req.params.programId)
    .collection("modules")
    .doc(req.params.moduleId)
    .collection("sessions")
    .add({
      title: body.title,
      order: body.order ?? 0,
      ...(body.librarySessionRef !== undefined && { librarySessionRef: body.librarySessionRef }),
      ...(body.dayIndex !== undefined && { dayIndex: body.dayIndex }),
      ...(body.image_url !== undefined && { image_url: body.image_url }),
      created_at: FieldValue.serverTimestamp(),
    });

  res.status(201).json({ data: { sessionId: ref.id, id: ref.id } });
});

// PATCH /creator/programs/:programId/modules/:moduleId/sessions/:sessionId
router.patch("/creator/programs/:programId/modules/:moduleId/sessions/:sessionId", async (req, res) => {
  const auth = await validateAuth(req);
  requireCreator(auth);
  await checkRateLimit(auth.userId, 200, "rate_limit_first_party");

  const courseDoc = await db.collection("courses").doc(req.params.programId).get();
  if (!courseDoc.exists || courseDoc.data()?.creator_id !== auth.userId) {
    throw new WakeApiServerError("NOT_FOUND", 404, "Programa no encontrado");
  }

  const sessRef = db
    .collection("courses")
    .doc(req.params.programId)
    .collection("modules")
    .doc(req.params.moduleId)
    .collection("sessions")
    .doc(req.params.sessionId);

  if (!(await sessRef.get()).exists) {
    throw new WakeApiServerError("NOT_FOUND", 404, "Sesión no encontrada");
  }

  const updates = pickFields(req.body, ["title", "order", "image_url", "librarySessionRef", "dayIndex"]);
  if (Object.keys(updates).length === 0) {
    throw new WakeApiServerError("VALIDATION_ERROR", 400, "No se proporcionaron campos para actualizar");
  }

  await sessRef.update({ ...updates, updated_at: FieldValue.serverTimestamp() });
  res.json({ data: { sessionId: req.params.sessionId, updated: true } });
});

// DELETE /creator/programs/:programId/modules/:moduleId/sessions/:sessionId
router.delete("/creator/programs/:programId/modules/:moduleId/sessions/:sessionId", async (req, res) => {
  const auth = await validateAuth(req);
  requireCreator(auth);
  await checkRateLimit(auth.userId, 200, "rate_limit_first_party");

  const courseDoc = await db.collection("courses").doc(req.params.programId).get();
  if (!courseDoc.exists || courseDoc.data()?.creator_id !== auth.userId) {
    throw new WakeApiServerError("NOT_FOUND", 404, "Programa no encontrado");
  }

  const sessRef = db
    .collection("courses")
    .doc(req.params.programId)
    .collection("modules")
    .doc(req.params.moduleId)
    .collection("sessions")
    .doc(req.params.sessionId);

  if (!(await sessRef.get()).exists) {
    throw new WakeApiServerError("NOT_FOUND", 404, "Sesión no encontrada");
  }

  await sessRef.delete();
  res.status(204).send();
});

// GET /creator/programs/:programId/modules/:moduleId/sessions/:sessionId/exercises
router.get("/creator/programs/:programId/modules/:moduleId/sessions/:sessionId/exercises", async (req, res) => {
  const auth = await validateAuth(req);
  requireCreator(auth);
  await checkRateLimit(auth.userId, 200, "rate_limit_first_party");

  const courseDoc = await db.collection("courses").doc(req.params.programId).get();
  if (!courseDoc.exists || courseDoc.data()?.creator_id !== auth.userId) {
    throw new WakeApiServerError("NOT_FOUND", 404, "Programa no encontrado");
  }

  const snap = await db
    .collection("courses")
    .doc(req.params.programId)
    .collection("modules")
    .doc(req.params.moduleId)
    .collection("sessions")
    .doc(req.params.sessionId)
    .collection("exercises")
    .orderBy("order", "asc")
    .get();

  const exercises = await Promise.all(
    snap.docs.map(async (d) => {
      const setsSnap = await d.ref.collection("sets").orderBy("order", "asc").get();
      return {
        exerciseId: d.id,
        id: d.id,
        ...d.data(),
        sets: setsSnap.docs.map((s) => ({ setId: s.id, id: s.id, ...s.data() })),
      };
    })
  );

  res.json({ data: exercises });
});

// POST /creator/programs/:programId/modules/:moduleId/sessions/:sessionId/exercises
router.post("/creator/programs/:programId/modules/:moduleId/sessions/:sessionId/exercises", async (req, res) => {
  const auth = await validateAuth(req);
  requireCreator(auth);
  await checkRateLimit(auth.userId, 200, "rate_limit_first_party");

  const courseDoc = await db.collection("courses").doc(req.params.programId).get();
  if (!courseDoc.exists || courseDoc.data()?.creator_id !== auth.userId) {
    throw new WakeApiServerError("NOT_FOUND", 404, "Programa no encontrado");
  }

  const allowedExFields = ["name", "order", "libraryId", "description", "video_url",
    "muscle_activation", "implements", "primary", "primaryMuscles",
    "alternatives", "objectives", "measures", "customMeasureLabels", "customObjectiveLabels"];
  const exData = pickFields(req.body, allowedExFields);
  exData.created_at = FieldValue.serverTimestamp();

  const ref = await db
    .collection("courses")
    .doc(req.params.programId)
    .collection("modules")
    .doc(req.params.moduleId)
    .collection("sessions")
    .doc(req.params.sessionId)
    .collection("exercises")
    .add(exData);

  res.status(201).json({ data: { exerciseId: ref.id, id: ref.id } });
});

// PATCH /creator/programs/:programId/modules/:moduleId/sessions/:sessionId/exercises/:exerciseId
router.patch("/creator/programs/:programId/modules/:moduleId/sessions/:sessionId/exercises/:exerciseId", async (req, res) => {
  const auth = await validateAuth(req);
  requireCreator(auth);
  await checkRateLimit(auth.userId, 200, "rate_limit_first_party");

  const courseDoc = await db.collection("courses").doc(req.params.programId).get();
  if (!courseDoc.exists || courseDoc.data()?.creator_id !== auth.userId) {
    throw new WakeApiServerError("NOT_FOUND", 404, "Programa no encontrado");
  }

  const exRef = db
    .collection("courses")
    .doc(req.params.programId)
    .collection("modules")
    .doc(req.params.moduleId)
    .collection("sessions")
    .doc(req.params.sessionId)
    .collection("exercises")
    .doc(req.params.exerciseId);

  if (!(await exRef.get()).exists) {
    throw new WakeApiServerError("NOT_FOUND", 404, "Ejercicio no encontrado");
  }

  const allowedFields = ["name", "order", "libraryId", "description", "video_url",
    "muscle_activation", "implements", "primary", "primaryMuscles",
    "alternatives", "objectives", "measures", "customMeasureLabels", "customObjectiveLabels"];
  const updates = pickFields(req.body, allowedFields);

  if (Object.keys(updates).length === 0) {
    throw new WakeApiServerError("VALIDATION_ERROR", 400, "No se proporcionaron campos para actualizar");
  }

  await exRef.update({ ...updates, updated_at: FieldValue.serverTimestamp() });
  res.json({ data: { exerciseId: req.params.exerciseId, updated: true } });
});

// DELETE /creator/programs/:programId/modules/:moduleId/sessions/:sessionId/exercises/:exerciseId
router.delete("/creator/programs/:programId/modules/:moduleId/sessions/:sessionId/exercises/:exerciseId", async (req, res) => {
  const auth = await validateAuth(req);
  requireCreator(auth);
  await checkRateLimit(auth.userId, 200, "rate_limit_first_party");

  const courseDoc = await db.collection("courses").doc(req.params.programId).get();
  if (!courseDoc.exists || courseDoc.data()?.creator_id !== auth.userId) {
    throw new WakeApiServerError("NOT_FOUND", 404, "Programa no encontrado");
  }

  const exRef = db
    .collection("courses")
    .doc(req.params.programId)
    .collection("modules")
    .doc(req.params.moduleId)
    .collection("sessions")
    .doc(req.params.sessionId)
    .collection("exercises")
    .doc(req.params.exerciseId);

  if (!(await exRef.get()).exists) {
    throw new WakeApiServerError("NOT_FOUND", 404, "Ejercicio no encontrado");
  }

  await exRef.delete();
  res.status(204).send();
});

// POST /creator/programs/:programId/modules/:moduleId/sessions/:sessionId/exercises/:exerciseId/sets
router.post("/creator/programs/:programId/modules/:moduleId/sessions/:sessionId/exercises/:exerciseId/sets", async (req, res) => {
  const auth = await validateAuth(req);
  requireCreator(auth);
  await checkRateLimit(auth.userId, 200, "rate_limit_first_party");

  const courseDoc = await db.collection("courses").doc(req.params.programId).get();
  if (!courseDoc.exists || courseDoc.data()?.creator_id !== auth.userId) {
    throw new WakeApiServerError("NOT_FOUND", 404, "Programa no encontrado");
  }

  const allowedSetFields = ["reps", "weight", "intensity", "rir", "order", "title"];
  const setData = pickFields(req.body, allowedSetFields);
  setData.created_at = FieldValue.serverTimestamp();

  const ref = await db
    .collection("courses")
    .doc(req.params.programId)
    .collection("modules")
    .doc(req.params.moduleId)
    .collection("sessions")
    .doc(req.params.sessionId)
    .collection("exercises")
    .doc(req.params.exerciseId)
    .collection("sets")
    .add(setData);

  res.status(201).json({ data: { setId: ref.id, id: ref.id } });
});

// PATCH /creator/programs/:programId/modules/:moduleId/sessions/:sessionId/exercises/:exerciseId/sets/:setId
router.patch("/creator/programs/:programId/modules/:moduleId/sessions/:sessionId/exercises/:exerciseId/sets/:setId", async (req, res) => {
  const auth = await validateAuth(req);
  requireCreator(auth);
  await checkRateLimit(auth.userId, 200, "rate_limit_first_party");

  const courseDoc = await db.collection("courses").doc(req.params.programId).get();
  if (!courseDoc.exists || courseDoc.data()?.creator_id !== auth.userId) {
    throw new WakeApiServerError("NOT_FOUND", 404, "Programa no encontrado");
  }

  const setRef = db
    .collection("courses")
    .doc(req.params.programId)
    .collection("modules")
    .doc(req.params.moduleId)
    .collection("sessions")
    .doc(req.params.sessionId)
    .collection("exercises")
    .doc(req.params.exerciseId)
    .collection("sets")
    .doc(req.params.setId);

  if (!(await setRef.get()).exists) {
    throw new WakeApiServerError("NOT_FOUND", 404, "Set no encontrado");
  }

  const allowedFields = ["reps", "weight", "intensity", "rir", "order", "title"];
  const updates = pickFields(req.body, allowedFields);

  if (Object.keys(updates).length === 0) {
    throw new WakeApiServerError("VALIDATION_ERROR", 400, "No se proporcionaron campos para actualizar");
  }

  await setRef.update({ ...updates, updated_at: FieldValue.serverTimestamp() });
  res.json({ data: { setId: req.params.setId, updated: true } });
});

// DELETE /creator/programs/:programId/modules/:moduleId/sessions/:sessionId/exercises/:exerciseId/sets/:setId
router.delete("/creator/programs/:programId/modules/:moduleId/sessions/:sessionId/exercises/:exerciseId/sets/:setId", async (req, res) => {
  const auth = await validateAuth(req);
  requireCreator(auth);
  await checkRateLimit(auth.userId, 200, "rate_limit_first_party");

  const courseDoc = await db.collection("courses").doc(req.params.programId).get();
  if (!courseDoc.exists || courseDoc.data()?.creator_id !== auth.userId) {
    throw new WakeApiServerError("NOT_FOUND", 404, "Programa no encontrado");
  }

  const setRef = db
    .collection("courses")
    .doc(req.params.programId)
    .collection("modules")
    .doc(req.params.moduleId)
    .collection("sessions")
    .doc(req.params.sessionId)
    .collection("exercises")
    .doc(req.params.exerciseId)
    .collection("sets")
    .doc(req.params.setId);

  if (!(await setRef.get()).exists) {
    throw new WakeApiServerError("NOT_FOUND", 404, "Set no encontrado");
  }

  await setRef.delete();
  res.status(204).send();
});

// ─── Plan Propagation ────────────────────────────────────────────────────

// GET /creator/plans/:planId/affected
router.get("/creator/plans/:planId/affected", async (req, res) => {
  const auth = await validateAuth(req);
  requireCreator(auth);
  await checkRateLimit(auth.userId, 200, "rate_limit_first_party");

  const planDoc = await db.collection("plans").doc(req.params.planId).get();
  if (!planDoc.exists || planDoc.data()?.creator_id !== auth.userId) {
    throw new WakeApiServerError("NOT_FOUND", 404, "Plan no encontrado");
  }

  const planId = req.params.planId;
  const wantDetails = req.query.details === "true";

  const affectedUserIdSet = new Set<string>();

  // Find clients whose planAssignments reference this plan
  const clientsSnap = await db
    .collection("one_on_one_clients")
    .where("creatorId", "==", auth.userId)
    .get();

  for (const clientDoc of clientsSnap.docs) {
    const clientUserId = clientDoc.data().clientUserId as string;
    const cpSnap = await db
      .collection("client_programs")
      .where("user_id", "==", clientUserId)
      .get();

    for (const cpDoc of cpSnap.docs) {
      const assignments = cpDoc.data().planAssignments as Record<string, { planId: string }> | undefined;
      if (!assignments) continue;
      for (const val of Object.values(assignments)) {
        if (val.planId === planId) {
          affectedUserIdSet.add(clientUserId);
          break;
        }
      }
      if (affectedUserIdSet.has(clientUserId)) break;
    }
  }

  const affectedUserIds = Array.from(affectedUserIdSet);

  if (wantDetails && affectedUserIds.length > 0) {
    const userDocs = await Promise.all(
      affectedUserIds.slice(0, 50).map((uid) => db.collection("users").doc(uid).get())
    );
    const users = userDocs
      .filter((d) => d.exists)
      .map((d) => ({
        userId: d.id,
        displayName: d.data()?.displayName || d.data()?.email || d.id,
      }));
    res.json({ data: { users } });
    return;
  }

  res.json({ data: { affectedUserIds, programCount: 0 } });
});

// POST /creator/plans/:planId/propagate
router.post("/creator/plans/:planId/propagate", async (req, res) => {
  const auth = await validateAuth(req);
  requireCreator(auth);
  await checkRateLimit(auth.userId, 200, "rate_limit_first_party");

  const planDoc = await db.collection("plans").doc(req.params.planId).get();
  if (!planDoc.exists || planDoc.data()?.creator_id !== auth.userId) {
    throw new WakeApiServerError("NOT_FOUND", 404, "Plan no encontrado");
  }

  // Plans are per-user assignments — propagation means the plan content itself is the source of truth.
  // No copies to update (unlike nutrition plans which snapshot into client_nutrition_plan_content).
  // This endpoint exists to satisfy the client-side propagation flow.
  res.json({ data: { updatedCount: 0, message: "Plans are live — no copies to propagate." } });
});

// GET /creator/nutrition/plans/:planId/affected
router.get("/creator/nutrition/plans/:planId/affected", async (req, res) => {
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
    throw new WakeApiServerError("NOT_FOUND", 404, "Plan de nutrición no encontrado");
  }

  const wantDetails = req.query.details === "true";

  // Find all assignments for this plan
  const assignmentsSnap = await db
    .collection("nutrition_assignments")
    .where("planId", "==", req.params.planId)
    .where("assignedBy", "==", auth.userId)
    .get();

  const affectedUserIdSet = new Set<string>();
  for (const aDoc of assignmentsSnap.docs) {
    const userId = aDoc.data().userId as string | undefined;
    if (userId) affectedUserIdSet.add(userId);
  }

  const affectedUserIds = Array.from(affectedUserIdSet);

  if (wantDetails && affectedUserIds.length > 0) {
    const userDocs = await Promise.all(
      affectedUserIds.slice(0, 50).map((uid) => db.collection("users").doc(uid).get())
    );
    const users = userDocs
      .filter((d) => d.exists)
      .map((d) => ({
        userId: d.id,
        displayName: d.data()?.displayName || d.data()?.email || d.id,
      }));
    res.json({ data: { users } });
    return;
  }

  res.json({ data: { affectedUserIds, clientCount: affectedUserIds.length } });
});

// ─── Exercises Library CRUD ──────────────────────────────────────────────

// GET /creator/exercises/libraries — list all exercise libraries for the authenticated creator
router.get("/creator/exercises/libraries", async (req, res) => {
  const auth = await validateAuth(req);
  requireCreator(auth);
  await checkRateLimit(auth.userId, 200, "rate_limit_first_party");

  const snap = await db
    .collection("exercises_library")
    .where("creator_id", "==", auth.userId)
    .get();

  res.json({ data: snap.docs.map((d) => ({ id: d.id, ...d.data() })) });
});

// GET /creator/exercises/libraries/:libraryId — single library by ID
router.get("/creator/exercises/libraries/:libraryId", async (req, res) => {
  const auth = await validateAuth(req);
  requireCreator(auth);
  await checkRateLimit(auth.userId, 200, "rate_limit_first_party");

  const doc = await db.collection("exercises_library").doc(req.params.libraryId).get();
  if (!doc.exists || doc.data()?.creator_id !== auth.userId) {
    throw new WakeApiServerError("NOT_FOUND", 404, "Biblioteca no encontrada");
  }

  res.json({ data: { id: doc.id, ...doc.data() } });
});

// POST /creator/exercises/libraries — create new library
router.post("/creator/exercises/libraries", async (req, res) => {
  const auth = await validateAuth(req);
  requireCreator(auth);
  await checkRateLimit(auth.userId, 200, "rate_limit_first_party");

  const body = validateBody<{ title: string }>({ title: "string" }, req.body);

  const userDoc = await db.collection("users").doc(auth.userId).get();
  const creatorName = userDoc.data()?.displayName || userDoc.data()?.name || "";

  const ref = await db.collection("exercises_library").add({
    creator_id: auth.userId,
    creator_name: creatorName,
    title: body.title,
    created_at: FieldValue.serverTimestamp(),
    updated_at: FieldValue.serverTimestamp(),
  });

  res.status(201).json({ data: { id: ref.id } });
});

// DELETE /creator/exercises/libraries/:libraryId — delete a library
router.delete("/creator/exercises/libraries/:libraryId", async (req, res) => {
  const auth = await validateAuth(req);
  requireCreator(auth);
  await checkRateLimit(auth.userId, 200, "rate_limit_first_party");

  const ref = db.collection("exercises_library").doc(req.params.libraryId);
  const doc = await ref.get();
  if (!doc.exists || doc.data()?.creator_id !== auth.userId) {
    throw new WakeApiServerError("NOT_FOUND", 404, "Biblioteca no encontrada");
  }

  await ref.delete();
  res.status(204).send();
});

// POST /creator/exercises/libraries/:libraryId/exercises — add exercise to library
router.post("/creator/exercises/libraries/:libraryId/exercises", async (req, res) => {
  const auth = await validateAuth(req);
  requireCreator(auth);
  await checkRateLimit(auth.userId, 200, "rate_limit_first_party");

  const body = validateBody<{ name: string }>({ name: "string" }, req.body);

  const ref = db.collection("exercises_library").doc(req.params.libraryId);
  const doc = await ref.get();
  if (!doc.exists || doc.data()?.creator_id !== auth.userId) {
    throw new WakeApiServerError("NOT_FOUND", 404, "Biblioteca no encontrada");
  }

  const now = FieldValue.serverTimestamp();
  await ref.update(
    new FieldPath(body.name),
    { muscle_activation: {}, implements: [], created_at: now, updated_at: now },
    "updated_at",
    now
  );

  res.status(201).json({ data: { name: body.name, created: true } });
});

// DELETE /creator/exercises/libraries/:libraryId/exercises/:name — remove exercise from library
router.delete("/creator/exercises/libraries/:libraryId/exercises/:name", async (req, res) => {
  const auth = await validateAuth(req);
  requireCreator(auth);
  await checkRateLimit(auth.userId, 200, "rate_limit_first_party");

  const ref = db.collection("exercises_library").doc(req.params.libraryId);
  const doc = await ref.get();
  if (!doc.exists || doc.data()?.creator_id !== auth.userId) {
    throw new WakeApiServerError("NOT_FOUND", 404, "Biblioteca no encontrada");
  }

  const exerciseName = req.params.name;
  await ref.update(
    new FieldPath(exerciseName),
    FieldValue.delete(),
    "updated_at",
    FieldValue.serverTimestamp()
  );

  res.status(204).send();
});

// PATCH /creator/exercises/libraries/:libraryId/exercises/:name — update exercise data
router.patch("/creator/exercises/libraries/:libraryId/exercises/:name", async (req, res) => {
  const auth = await validateAuth(req);
  requireCreator(auth);
  await checkRateLimit(auth.userId, 200, "rate_limit_first_party");

  const ref = db.collection("exercises_library").doc(req.params.libraryId);
  const doc = await ref.get();
  if (!doc.exists || doc.data()?.creator_id !== auth.userId) {
    throw new WakeApiServerError("NOT_FOUND", 404, "Biblioteca no encontrada");
  }

  const exerciseName = decodeURIComponent(req.params.name);
  const existingData = doc.data()?.[exerciseName];
  if (!existingData || typeof existingData !== "object") {
    throw new WakeApiServerError("NOT_FOUND", 404, "Ejercicio no encontrado");
  }

  const updates: Record<string, unknown> = {};
  const body = req.body || {};

  if (body.muscle_activation !== undefined) {
    updates[`${exerciseName}.muscle_activation`] = body.muscle_activation;
  }
  if (body.implements !== undefined) {
    updates[`${exerciseName}.implements`] = body.implements;
  }
  if (body.video_url !== undefined) {
    updates[`${exerciseName}.video_url`] = body.video_url;
  }
  if (body.video_path !== undefined) {
    updates[`${exerciseName}.video_path`] = body.video_path;
  }

  if (Object.keys(updates).length === 0) {
    throw new WakeApiServerError("VALIDATION_ERROR", 400, "No hay campos para actualizar");
  }

  updates[`${exerciseName}.updated_at`] = FieldValue.serverTimestamp();
  updates["updated_at"] = FieldValue.serverTimestamp();

  await ref.update(updates);
  res.json({ data: { updated: true } });
});

// POST /creator/exercises/libraries/:libraryId/exercises/:name/upload-url
router.post("/creator/exercises/libraries/:libraryId/exercises/:name/upload-url", async (req, res) => {
  const auth = await validateAuth(req);
  requireCreator(auth);
  await checkRateLimit(auth.userId, 200, "rate_limit_first_party");

  const { contentType } = validateBody<{ contentType: string }>(
    { contentType: "string" },
    req.body
  );

  if (!contentType.startsWith("video/")) {
    throw new WakeApiServerError("VALIDATION_ERROR", 400, "Solo se permiten archivos de video");
  }

  const ref = db.collection("exercises_library").doc(req.params.libraryId);
  const doc = await ref.get();
  if (!doc.exists || doc.data()?.creator_id !== auth.userId) {
    throw new WakeApiServerError("NOT_FOUND", 404, "Biblioteca no encontrada");
  }

  const exerciseName = decodeURIComponent(req.params.name);
  const sanitizedName = exerciseName.replace(/[^a-zA-Z0-9_-]/g, "_");
  const ext = contentType.split("/")[1] === "quicktime" ? "mov" : (contentType.split("/")[1] || "mp4");
  const storagePath = `exercises_library/${req.params.libraryId}/${sanitizedName}/video.${ext}`;

  const bucket = admin.storage().bucket();
  const file = bucket.file(storagePath);

  const [url] = await file.getSignedUrl({
    version: "v4",
    action: "write",
    expires: Date.now() + 15 * 60 * 1000,
    contentType,
  });

  res.json({ data: { uploadUrl: url, storagePath, contentType } });
});

// POST /creator/exercises/libraries/:libraryId/exercises/:name/upload-url/confirm
router.post("/creator/exercises/libraries/:libraryId/exercises/:name/upload-url/confirm", async (req, res) => {
  const auth = await validateAuth(req);
  requireCreator(auth);
  await checkRateLimit(auth.userId, 200, "rate_limit_first_party");

  const { storagePath } = validateBody<{ storagePath: string }>(
    { storagePath: "string" },
    req.body
  );

  const exerciseName = decodeURIComponent(req.params.name);
  const sanitizedName = exerciseName.replace(/[^a-zA-Z0-9_-]/g, "_");
  validateStoragePath(storagePath, `exercises_library/${req.params.libraryId}/${sanitizedName}/`);

  const ref = db.collection("exercises_library").doc(req.params.libraryId);
  const doc = await ref.get();
  if (!doc.exists || doc.data()?.creator_id !== auth.userId) {
    throw new WakeApiServerError("NOT_FOUND", 404, "Biblioteca no encontrada");
  }

  const bucket = admin.storage().bucket();
  const [exists] = await bucket.file(storagePath).exists();
  if (!exists) {
    throw new WakeApiServerError("NOT_FOUND", 404, "Archivo no encontrado en Storage");
  }

  const publicUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(storagePath)}?alt=media`;

  await ref.update({
    [`${exerciseName}.video_url`]: publicUrl,
    [`${exerciseName}.video_path`]: storagePath,
    [`${exerciseName}.updated_at`]: FieldValue.serverTimestamp(),
    updated_at: FieldValue.serverTimestamp(),
  });

  res.json({ data: { video_url: publicUrl, video_path: storagePath } });
});

// DELETE /creator/exercises/libraries/:libraryId/exercises/:name/video
router.delete("/creator/exercises/libraries/:libraryId/exercises/:name/video", async (req, res) => {
  const auth = await validateAuth(req);
  requireCreator(auth);
  await checkRateLimit(auth.userId, 200, "rate_limit_first_party");

  const ref = db.collection("exercises_library").doc(req.params.libraryId);
  const doc = await ref.get();
  if (!doc.exists || doc.data()?.creator_id !== auth.userId) {
    throw new WakeApiServerError("NOT_FOUND", 404, "Biblioteca no encontrada");
  }

  const exerciseName = decodeURIComponent(req.params.name);
  const existingData = doc.data()?.[exerciseName];
  if (!existingData || typeof existingData !== "object") {
    throw new WakeApiServerError("NOT_FOUND", 404, "Ejercicio no encontrado");
  }

  // Delete from Storage if path exists
  if (existingData.video_path) {
    try {
      const bucket = admin.storage().bucket();
      await bucket.file(existingData.video_path).delete();
    } catch (_err) {
      // File may not exist, continue
    }
  }

  await ref.update({
    [`${exerciseName}.video_url`]: FieldValue.delete(),
    [`${exerciseName}.video_path`]: FieldValue.delete(),
    [`${exerciseName}.updated_at`]: FieldValue.serverTimestamp(),
    updated_at: FieldValue.serverTimestamp(),
  });

  res.status(204).send();
});

// PATCH /creator/exercises/libraries/:libraryId — update library metadata
router.patch("/creator/exercises/libraries/:libraryId", async (req, res) => {
  const auth = await validateAuth(req);
  requireCreator(auth);
  await checkRateLimit(auth.userId, 200, "rate_limit_first_party");

  const ref = db.collection("exercises_library").doc(req.params.libraryId);
  const doc = await ref.get();
  if (!doc.exists || doc.data()?.creator_id !== auth.userId) {
    throw new WakeApiServerError("NOT_FOUND", 404, "Biblioteca no encontrada");
  }

  const allowed = ["title", "icon"];
  const updates: Record<string, unknown> = {};
  for (const key of allowed) {
    if (req.body[key] !== undefined) updates[key] = req.body[key];
  }

  if (Object.keys(updates).length === 0) {
    throw new WakeApiServerError("VALIDATION_ERROR", 400, "No hay campos para actualizar");
  }

  updates.updated_at = FieldValue.serverTimestamp();
  await ref.update(updates);
  res.json({ data: { updated: true } });
});

// ─── Objective Presets CRUD ──────────────────────────────────────────────

// GET /creator/library/objective-presets — list all presets
router.get("/creator/library/objective-presets", async (req, res) => {
  const auth = await validateAuth(req);
  requireCreator(auth);
  await checkRateLimit(auth.userId, 200, "rate_limit_first_party");

  const snap = await db
    .collection("creator_libraries")
    .doc(auth.userId)
    .collection("objective_presets")
    .orderBy("created_at", "desc")
    .get();

  res.json({ data: snap.docs.map((d) => ({ id: d.id, ...d.data() })) });
});

// POST /creator/library/objective-presets — create preset
router.post("/creator/library/objective-presets", async (req, res) => {
  const auth = await validateAuth(req);
  requireCreator(auth);
  await checkRateLimit(auth.userId, 200, "rate_limit_first_party");

  const body = validateBody<{
    name: string;
    measures: unknown[];
    objectives: unknown[];
    customMeasureLabels: Record<string, unknown>;
    customObjectiveLabels: Record<string, unknown>;
  }>({
    name: "string",
    measures: "optional_array",
    objectives: "optional_array",
    customMeasureLabels: "optional_object",
    customObjectiveLabels: "optional_object",
  }, req.body);

  const ref = await db
    .collection("creator_libraries")
    .doc(auth.userId)
    .collection("objective_presets")
    .add({
      name: body.name,
      measures: body.measures || [],
      objectives: body.objectives || [],
      customMeasureLabels: body.customMeasureLabels || {},
      customObjectiveLabels: body.customObjectiveLabels || {},
      created_at: FieldValue.serverTimestamp(),
      updated_at: FieldValue.serverTimestamp(),
    });

  res.status(201).json({ data: { id: ref.id } });
});

// PATCH /creator/library/objective-presets/:presetId — update preset
router.patch("/creator/library/objective-presets/:presetId", async (req, res) => {
  const auth = await validateAuth(req);
  requireCreator(auth);
  await checkRateLimit(auth.userId, 200, "rate_limit_first_party");

  const ref = db
    .collection("creator_libraries")
    .doc(auth.userId)
    .collection("objective_presets")
    .doc(req.params.presetId);

  const doc = await ref.get();
  if (!doc.exists) {
    throw new WakeApiServerError("NOT_FOUND", 404, "Preset no encontrado");
  }

  const allowedFields = ["name", "measures", "objectives", "customMeasureLabels", "customObjectiveLabels"];
  const updates = pickFields(req.body, allowedFields);

  if (Object.keys(updates).length === 0) {
    throw new WakeApiServerError("VALIDATION_ERROR", 400, "No se proporcionaron campos para actualizar");
  }

  await ref.update({ ...updates, updated_at: FieldValue.serverTimestamp() });
  res.json({ data: { id: req.params.presetId, updated: true } });
});

// DELETE /creator/library/objective-presets/:presetId — delete preset
router.delete("/creator/library/objective-presets/:presetId", async (req, res) => {
  const auth = await validateAuth(req);
  requireCreator(auth);
  await checkRateLimit(auth.userId, 200, "rate_limit_first_party");

  const ref = db
    .collection("creator_libraries")
    .doc(auth.userId)
    .collection("objective_presets")
    .doc(req.params.presetId);

  const doc = await ref.get();
  if (!doc.exists) {
    throw new WakeApiServerError("NOT_FOUND", 404, "Preset no encontrado");
  }

  await ref.delete();
  res.status(204).send();
});

export default router;
