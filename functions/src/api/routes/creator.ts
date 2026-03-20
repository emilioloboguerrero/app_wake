import { Router } from "express";
import * as admin from "firebase-admin";
import { validateAuth } from "../middleware/auth.js";
import { validateBody } from "../middleware/validate.js";
import { checkRateLimit } from "../middleware/rateLimit.js";
import { WakeApiServerError } from "../errors.js";

const router = Router();
const db = admin.firestore();

function requireCreator(auth: { role: string }): void {
  if (auth.role !== "creator" && auth.role !== "admin") {
    throw new WakeApiServerError("FORBIDDEN", 403, "Acceso restringido a creadores");
  }
}

// GET /creator/clients — paginated 50/page
router.get("/creator/clients", async (req, res) => {
  const auth = await validateAuth(req);
  requireCreator(auth);
  await checkRateLimit(auth.userId, 200, "rate_limit_first_party");

  const pageToken = req.query.pageToken as string | undefined;
  const limit = 50;

  let query: admin.firestore.Query = db
    .collection("one_on_one_clients")
    .where("creatorId", "==", auth.userId)
    .orderBy("created_at", "desc")
    .limit(limit + 1);

  if (pageToken) {
    const cursor = await db.collection("one_on_one_clients").doc(pageToken).get();
    if (cursor.exists) query = query.startAfter(cursor);
  }

  const snapshot = await query.get();
  const docs = snapshot.docs.slice(0, limit);
  const hasMore = snapshot.docs.length > limit;

  res.json({
    data: docs.map((d) => ({ id: d.id, ...d.data() })),
    nextPageToken: hasMore ? docs[docs.length - 1].id : null,
    hasMore,
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

  const docRef = await db.collection("one_on_one_clients").add({
    creatorId: auth.userId,
    userId: body.userId,
    status: "active",
    created_at: admin.firestore.FieldValue.serverTimestamp(),
  });

  res.status(201).json({ data: { id: docRef.id } });
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

// GET /creator/programs
router.get("/creator/programs", async (req, res) => {
  const auth = await validateAuth(req);
  requireCreator(auth);
  await checkRateLimit(auth.userId, 200, "rate_limit_first_party");

  const snapshot = await db
    .collection("courses")
    .where("creatorId", "==", auth.userId)
    .orderBy("created_at", "desc")
    .get();

  res.json({
    data: snapshot.docs.map((d) => ({ id: d.id, ...d.data() })),
  });
});

// POST /creator/programs
router.post("/creator/programs", async (req, res) => {
  const auth = await validateAuth(req);
  requireCreator(auth);
  await checkRateLimit(auth.userId, 200, "rate_limit_first_party");

  const body = validateBody<{ title: string; deliveryType: string }>(
    { title: "string", deliveryType: "string" },
    req.body
  );

  const docRef = await db.collection("courses").add({
    ...body,
    creatorId: auth.userId,
    status: "draft",
    created_at: admin.firestore.FieldValue.serverTimestamp(),
    updated_at: admin.firestore.FieldValue.serverTimestamp(),
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

  if (!doc.exists || doc.data()?.creatorId !== auth.userId) {
    throw new WakeApiServerError("NOT_FOUND", 404, "Programa no encontrado");
  }

  await docRef.update({
    ...req.body,
    updated_at: admin.firestore.FieldValue.serverTimestamp(),
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

  const docRef = db.collection("courses").doc(req.params.programId);
  const doc = await docRef.get();

  if (!doc.exists || doc.data()?.creatorId !== auth.userId) {
    throw new WakeApiServerError("NOT_FOUND", 404, "Programa no encontrado");
  }

  await docRef.update({
    status,
    updated_at: admin.firestore.FieldValue.serverTimestamp(),
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

  if (!doc.exists || doc.data()?.creatorId !== auth.userId) {
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
  if (!sourceDoc.exists || sourceDoc.data()?.creatorId !== auth.userId) {
    throw new WakeApiServerError("NOT_FOUND", 404, "Programa no encontrado");
  }

  const sourceData = sourceDoc.data()!;
  const newDoc = await db.collection("courses").add({
    ...sourceData,
    title: `${sourceData.title} (copia)`,
    status: "draft",
    created_at: admin.firestore.FieldValue.serverTimestamp(),
    updated_at: admin.firestore.FieldValue.serverTimestamp(),
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

  const bucket = admin.storage().bucket();
  const [exists] = await bucket.file(storagePath).exists();
  if (!exists) {
    throw new WakeApiServerError("NOT_FOUND", 404, "Archivo no encontrado");
  }

  const publicUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(storagePath)}?alt=media`;

  await db.collection("courses").doc(req.params.programId).update({
    image_url: publicUrl,
    updated_at: admin.firestore.FieldValue.serverTimestamp(),
  });

  res.json({ data: { image_url: publicUrl } });
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

  const clientUserId = clientDoc.data()!.userId;

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

  const clientUserId = clientDoc.data()!.userId;
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
    data: snapshot.docs.map((d) => ({ id: d.id, ...d.data() })),
  });
});

// POST /creator/nutrition/meals
router.post("/creator/nutrition/meals", async (req, res) => {
  const auth = await validateAuth(req);
  requireCreator(auth);
  await checkRateLimit(auth.userId, 200, "rate_limit_first_party");

  const docRef = await db
    .collection("creator_nutrition_library")
    .doc(auth.userId)
    .collection("meals")
    .add({
      ...req.body,
      created_at: admin.firestore.FieldValue.serverTimestamp(),
      updated_at: admin.firestore.FieldValue.serverTimestamp(),
    });

  res.status(201).json({ data: { id: docRef.id } });
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

  await docRef.update({
    ...req.body,
    updated_at: admin.firestore.FieldValue.serverTimestamp(),
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
    data: snapshot.docs.map((d) => ({ id: d.id, ...d.data() })),
  });
});

// POST /creator/nutrition/plans
router.post("/creator/nutrition/plans", async (req, res) => {
  const auth = await validateAuth(req);
  requireCreator(auth);
  await checkRateLimit(auth.userId, 200, "rate_limit_first_party");

  const docRef = await db
    .collection("creator_nutrition_library")
    .doc(auth.userId)
    .collection("plans")
    .add({
      ...req.body,
      creatorId: auth.userId,
      created_at: admin.firestore.FieldValue.serverTimestamp(),
      updated_at: admin.firestore.FieldValue.serverTimestamp(),
    });

  res.status(201).json({ data: { id: docRef.id } });
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

  res.json({ data: { id: doc.id, ...doc.data() } });
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

  await docRef.update({
    ...req.body,
    updated_at: admin.firestore.FieldValue.serverTimestamp(),
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
    .where("creatorId", "==", auth.userId)
    .get();

  let copiesDeleted = 0;
  const batchSize = 450;
  let batch = db.batch();
  let batchCount = 0;

  for (const assignDoc of assignmentsSnap.docs) {
    const contentRef = db.collection("client_nutrition_plan_content").doc(assignDoc.id);
    batch.set(contentRef, { ...planData, refreshed_at: admin.firestore.FieldValue.serverTimestamp() });
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
    .where("userId", "==", clientId)
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
    .where("creatorId", "==", auth.userId)
    .orderBy("created_at", "desc")
    .get();

  res.json({ data: snap.docs.map((d) => ({ id: d.id, ...d.data() })) });
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
    creatorId: auth.userId,
    planId: body.planId,
    planName: planData.name ?? "",
    startDate: body.startDate ?? null,
    endDate: body.endDate ?? null,
    status: "active",
    created_at: admin.firestore.FieldValue.serverTimestamp(),
  });

  // Snapshot plan content
  await db.collection("client_nutrition_plan_content").doc(assignmentRef.id).set({
    ...planData,
    assignmentId: assignmentRef.id,
    snapshot_at: admin.firestore.FieldValue.serverTimestamp(),
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

// DELETE /creator/clients/:clientId/nutrition/assignments/:assignmentId
router.delete("/creator/clients/:clientId/nutrition/assignments/:assignmentId", async (req, res) => {
  const auth = await validateAuth(req);
  requireCreator(auth);
  await checkRateLimit(auth.userId, 200, "rate_limit_first_party");
  await verifyClientAccess(auth.userId, req.params.clientId);

  const assignRef = db.collection("nutrition_assignments").doc(req.params.assignmentId);
  const assignDoc = await assignRef.get();
  if (!assignDoc.exists || assignDoc.data()?.creatorId !== auth.userId) {
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
  let query: admin.firestore.Query = db
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

  const body = validateBody<{ title: string }>(
    { title: "string" },
    req.body
  );

  const planRef = await db.collection("plans").add({
    ...body,
    creatorId: auth.userId,
    created_at: admin.firestore.FieldValue.serverTimestamp(),
    updated_at: admin.firestore.FieldValue.serverTimestamp(),
  });

  // Auto-create first module
  const moduleRef = await db
    .collection("plans")
    .doc(planRef.id)
    .collection("modules")
    .add({
      title: "Semana 1",
      order: 0,
      created_at: admin.firestore.FieldValue.serverTimestamp(),
    });

  res.status(201).json({ data: { planId: planRef.id, firstModuleId: moduleRef.id } });
});

// GET /creator/plans
router.get("/creator/plans", async (req, res) => {
  const auth = await validateAuth(req);
  requireCreator(auth);
  await checkRateLimit(auth.userId, 200, "rate_limit_first_party");

  const snap = await db
    .collection("plans")
    .where("creatorId", "==", auth.userId)
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
  if (!planDoc.exists || planDoc.data()?.creatorId !== auth.userId) {
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

  res.json({ data: { planId: planDoc.id, ...planDoc.data(), modules } });
});

// PATCH /creator/plans/:planId
router.patch("/creator/plans/:planId", async (req, res) => {
  const auth = await validateAuth(req);
  requireCreator(auth);
  await checkRateLimit(auth.userId, 200, "rate_limit_first_party");

  const docRef = db.collection("plans").doc(req.params.planId);
  const doc = await docRef.get();
  if (!doc.exists || doc.data()?.creatorId !== auth.userId) {
    throw new WakeApiServerError("NOT_FOUND", 404, "Plan no encontrado");
  }

  await docRef.update({ ...req.body, updated_at: admin.firestore.FieldValue.serverTimestamp() });
  res.json({ data: { planId: doc.id, updated: true } });
});

// DELETE /creator/plans/:planId
router.delete("/creator/plans/:planId", async (req, res) => {
  const auth = await validateAuth(req);
  requireCreator(auth);
  await checkRateLimit(auth.userId, 200, "rate_limit_first_party");

  const docRef = db.collection("plans").doc(req.params.planId);
  const doc = await docRef.get();
  if (!doc.exists || doc.data()?.creatorId !== auth.userId) {
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
  if (!planDoc.exists || planDoc.data()?.creatorId !== auth.userId) {
    throw new WakeApiServerError("NOT_FOUND", 404, "Plan no encontrado");
  }

  const body = validateBody<{ title: string; order: number }>(
    { title: "string", order: "number" },
    req.body
  );

  const ref = await db.collection("plans").doc(req.params.planId).collection("modules").add({
    ...body,
    created_at: admin.firestore.FieldValue.serverTimestamp(),
  });

  res.status(201).json({ data: { moduleId: ref.id } });
});

// PATCH /creator/plans/:planId/modules/:moduleId
router.patch("/creator/plans/:planId/modules/:moduleId", async (req, res) => {
  const auth = await validateAuth(req);
  requireCreator(auth);
  await checkRateLimit(auth.userId, 200, "rate_limit_first_party");

  const planDoc = await db.collection("plans").doc(req.params.planId).get();
  if (!planDoc.exists || planDoc.data()?.creatorId !== auth.userId) {
    throw new WakeApiServerError("NOT_FOUND", 404, "Plan no encontrado");
  }

  const ref = db.collection("plans").doc(req.params.planId).collection("modules").doc(req.params.moduleId);
  const doc = await ref.get();
  if (!doc.exists) throw new WakeApiServerError("NOT_FOUND", 404, "Módulo no encontrado");

  await ref.update({ ...req.body, updated_at: admin.firestore.FieldValue.serverTimestamp() });
  res.json({ data: { moduleId: doc.id, updated: true } });
});

// DELETE /creator/plans/:planId/modules/:moduleId
router.delete("/creator/plans/:planId/modules/:moduleId", async (req, res) => {
  const auth = await validateAuth(req);
  requireCreator(auth);
  await checkRateLimit(auth.userId, 200, "rate_limit_first_party");

  const planDoc = await db.collection("plans").doc(req.params.planId).get();
  if (!planDoc.exists || planDoc.data()?.creatorId !== auth.userId) {
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
  if (!planDoc.exists || planDoc.data()?.creatorId !== auth.userId) {
    throw new WakeApiServerError("NOT_FOUND", 404, "Plan no encontrado");
  }

  const body = validateBody<{ title: string; order: number }>(
    { title: "string", order: "number" },
    req.body
  );

  const ref = await db
    .collection("plans")
    .doc(req.params.planId)
    .collection("modules")
    .doc(req.params.moduleId)
    .collection("sessions")
    .add({ ...body, created_at: admin.firestore.FieldValue.serverTimestamp() });

  res.status(201).json({ data: { sessionId: ref.id } });
});

// GET /creator/plans/:planId/modules/:moduleId/sessions/:sessionId
router.get("/creator/plans/:planId/modules/:moduleId/sessions/:sessionId", async (req, res) => {
  const auth = await validateAuth(req);
  requireCreator(auth);
  await checkRateLimit(auth.userId, 200, "rate_limit_first_party");

  const planDoc = await db.collection("plans").doc(req.params.planId).get();
  if (!planDoc.exists || planDoc.data()?.creatorId !== auth.userId) {
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
  if (!planDoc.exists || planDoc.data()?.creatorId !== auth.userId) {
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

  await ref.update({ ...req.body, updated_at: admin.firestore.FieldValue.serverTimestamp() });
  res.json({ data: { sessionId: doc.id, updated: true } });
});

// DELETE /creator/plans/:planId/modules/:moduleId/sessions/:sessionId
router.delete("/creator/plans/:planId/modules/:moduleId/sessions/:sessionId", async (req, res) => {
  const auth = await validateAuth(req);
  requireCreator(auth);
  await checkRateLimit(auth.userId, 200, "rate_limit_first_party");

  const planDoc = await db.collection("plans").doc(req.params.planId).get();
  if (!planDoc.exists || planDoc.data()?.creatorId !== auth.userId) {
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

// POST exercises and sets for plan sessions
router.post("/creator/plans/:planId/modules/:moduleId/sessions/:sessionId/exercises", async (req, res) => {
  const auth = await validateAuth(req);
  requireCreator(auth);
  await checkRateLimit(auth.userId, 200, "rate_limit_first_party");

  const planDoc = await db.collection("plans").doc(req.params.planId).get();
  if (!planDoc.exists || planDoc.data()?.creatorId !== auth.userId) {
    throw new WakeApiServerError("NOT_FOUND", 404, "Plan no encontrado");
  }

  const ref = await db
    .collection("plans")
    .doc(req.params.planId)
    .collection("modules")
    .doc(req.params.moduleId)
    .collection("sessions")
    .doc(req.params.sessionId)
    .collection("exercises")
    .add({ ...req.body, created_at: admin.firestore.FieldValue.serverTimestamp() });

  res.status(201).json({ data: { exerciseId: ref.id } });
});

router.patch("/creator/plans/:planId/modules/:moduleId/sessions/:sessionId/exercises/:exerciseId", async (req, res) => {
  const auth = await validateAuth(req);
  requireCreator(auth);
  await checkRateLimit(auth.userId, 200, "rate_limit_first_party");

  const planDoc = await db.collection("plans").doc(req.params.planId).get();
  if (!planDoc.exists || planDoc.data()?.creatorId !== auth.userId) {
    throw new WakeApiServerError("NOT_FOUND", 404, "Plan no encontrado");
  }

  const ref = db
    .collection("plans").doc(req.params.planId)
    .collection("modules").doc(req.params.moduleId)
    .collection("sessions").doc(req.params.sessionId)
    .collection("exercises").doc(req.params.exerciseId);

  await ref.update({ ...req.body, updated_at: admin.firestore.FieldValue.serverTimestamp() });
  res.json({ data: { exerciseId: req.params.exerciseId, updated: true } });
});

router.delete("/creator/plans/:planId/modules/:moduleId/sessions/:sessionId/exercises/:exerciseId", async (req, res) => {
  const auth = await validateAuth(req);
  requireCreator(auth);
  await checkRateLimit(auth.userId, 200, "rate_limit_first_party");

  const planDoc = await db.collection("plans").doc(req.params.planId).get();
  if (!planDoc.exists || planDoc.data()?.creatorId !== auth.userId) {
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

router.post("/creator/plans/:planId/modules/:moduleId/sessions/:sessionId/exercises/:exerciseId/sets", async (req, res) => {
  const auth = await validateAuth(req);
  requireCreator(auth);
  await checkRateLimit(auth.userId, 200, "rate_limit_first_party");

  const planDoc = await db.collection("plans").doc(req.params.planId).get();
  if (!planDoc.exists || planDoc.data()?.creatorId !== auth.userId) {
    throw new WakeApiServerError("NOT_FOUND", 404, "Plan no encontrado");
  }

  const ref = await db
    .collection("plans").doc(req.params.planId)
    .collection("modules").doc(req.params.moduleId)
    .collection("sessions").doc(req.params.sessionId)
    .collection("exercises").doc(req.params.exerciseId)
    .collection("sets")
    .add({ ...req.body, created_at: admin.firestore.FieldValue.serverTimestamp() });

  res.status(201).json({ data: { setId: ref.id } });
});

router.patch("/creator/plans/:planId/modules/:moduleId/sessions/:sessionId/exercises/:exerciseId/sets/:setId", async (req, res) => {
  const auth = await validateAuth(req);
  requireCreator(auth);
  await checkRateLimit(auth.userId, 200, "rate_limit_first_party");

  const planDoc = await db.collection("plans").doc(req.params.planId).get();
  if (!planDoc.exists || planDoc.data()?.creatorId !== auth.userId) {
    throw new WakeApiServerError("NOT_FOUND", 404, "Plan no encontrado");
  }

  const ref = db
    .collection("plans").doc(req.params.planId)
    .collection("modules").doc(req.params.moduleId)
    .collection("sessions").doc(req.params.sessionId)
    .collection("exercises").doc(req.params.exerciseId)
    .collection("sets").doc(req.params.setId);

  await ref.update({ ...req.body, updated_at: admin.firestore.FieldValue.serverTimestamp() });
  res.json({ data: { setId: req.params.setId, updated: true } });
});

router.delete("/creator/plans/:planId/modules/:moduleId/sessions/:sessionId/exercises/:exerciseId/sets/:setId", async (req, res) => {
  const auth = await validateAuth(req);
  requireCreator(auth);
  await checkRateLimit(auth.userId, 200, "rate_limit_first_party");

  const planDoc = await db.collection("plans").doc(req.params.planId).get();
  if (!planDoc.exists || planDoc.data()?.creatorId !== auth.userId) {
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
    .add({ ...body, created_at: admin.firestore.FieldValue.serverTimestamp(), updated_at: admin.firestore.FieldValue.serverTimestamp() });

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

  await ref.update({ ...req.body, updated_at: admin.firestore.FieldValue.serverTimestamp() });
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

// Library session exercise/set CRUD
router.post("/creator/library/sessions/:sessionId/exercises", async (req, res) => {
  const auth = await validateAuth(req);
  requireCreator(auth);
  await checkRateLimit(auth.userId, 200, "rate_limit_first_party");

  const ref = await db
    .collection("creator_libraries").doc(auth.userId)
    .collection("sessions").doc(req.params.sessionId)
    .collection("exercises")
    .add({ ...req.body, created_at: admin.firestore.FieldValue.serverTimestamp() });

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

  await ref.update({ ...req.body, updated_at: admin.firestore.FieldValue.serverTimestamp() });
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

  const ref = await db
    .collection("creator_libraries").doc(auth.userId)
    .collection("sessions").doc(req.params.sessionId)
    .collection("exercises").doc(req.params.exerciseId)
    .collection("sets")
    .add({ ...req.body, created_at: admin.firestore.FieldValue.serverTimestamp() });

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

  await ref.update({ ...req.body, updated_at: admin.firestore.FieldValue.serverTimestamp() });
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
    .add({ ...body, created_at: admin.firestore.FieldValue.serverTimestamp(), updated_at: admin.firestore.FieldValue.serverTimestamp() });

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

  await ref.update({ ...req.body, updated_at: admin.firestore.FieldValue.serverTimestamp() });
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
  if (!courseDoc.exists || courseDoc.data()?.creatorId !== auth.userId) {
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
    [`courses.${req.params.programId}`]: admin.firestore.FieldValue.delete(),
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
      ...body,
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
    [`planAssignments.${req.params.weekKey}`]: admin.firestore.FieldValue.delete(),
  });

  res.status(204).send();
});

export default router;
