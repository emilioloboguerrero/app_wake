import {Router} from "express";
import * as admin from "firebase-admin";
import {db, FieldValue} from "../firestore.js";
import type {Query} from "../firestore.js";
import {validateAuth} from "../middleware/auth.js";
import {validateBody, validateDateFormat, validateStoragePath} from "../middleware/validate.js";
import {checkRateLimit} from "../middleware/rateLimit.js";
import {WakeApiServerError} from "../errors.js";

const router = Router();

// GET /progress/body-log — cursor paginated, 30/page
router.get("/progress/body-log", async (req, res) => {
  const auth = await validateAuth(req);
  await checkRateLimit(auth.userId, 200, "rate_limit_first_party");

  const pageToken = req.query.pageToken as string | undefined;
  const limit = 30;

  let query: Query = db
    .collection("users")
    .doc(auth.userId)
    .collection("bodyLog")
    .orderBy("date", "desc")
    .limit(limit + 1);

  if (pageToken) {
    const cursorDoc = await db
      .collection("users")
      .doc(auth.userId)
      .collection("bodyLog")
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
    data: docs.map((d) => ({...d.data(), id: d.id})),
    nextPageToken: hasMore ? docs[docs.length - 1].id : null,
    hasMore,
  });
});

// GET /progress/body-log/:date
router.get("/progress/body-log/:date", async (req, res) => {
  const auth = await validateAuth(req);
  await checkRateLimit(auth.userId, 200, "rate_limit_first_party");

  // Validate date param format
  validateDateFormat(req.params.date, "date");

  const doc = await db
    .collection("users")
    .doc(auth.userId)
    .collection("bodyLog")
    .doc(req.params.date)
    .get();

  if (!doc.exists) {
    throw new WakeApiServerError("NOT_FOUND", 404, "Registro no encontrado");
  }

  res.json({data: {...doc.data(), id: doc.id}});
});

// PUT /progress/body-log/:date (idempotent)
router.put("/progress/body-log/:date", async (req, res) => {
  const auth = await validateAuth(req);
  await checkRateLimit(auth.userId, 200, "rate_limit_first_party");

  const date = req.params.date;
  validateDateFormat(date, "date");

  // Validate and allowlist fields
  const body = validateBody<{
    weight?: number;
    bodyFat?: number;
    notes?: string;
    muscleMass?: number;
    waist?: number;
    chest?: number;
    arms?: number;
    hips?: number;
  }>(
    {
      weight: "optional_number",
      bodyFat: "optional_number",
      notes: "optional_string",
      muscleMass: "optional_number",
      waist: "optional_number",
      chest: "optional_number",
      arms: "optional_number",
      hips: "optional_number",
    },
    req.body
  );

  const docRef = db
    .collection("users")
    .doc(auth.userId)
    .collection("bodyLog")
    .doc(date);

  await docRef.set(
    {
      ...body,
      date,
      updated_at: FieldValue.serverTimestamp(),
    },
    {merge: true}
  );

  res.json({data: {date, updated: true}});
});

// DELETE /progress/body-log/:date
router.delete("/progress/body-log/:date", async (req, res) => {
  const auth = await validateAuth(req);
  await checkRateLimit(auth.userId, 200, "rate_limit_first_party");

  validateDateFormat(req.params.date, "date");

  const docRef = db
    .collection("users")
    .doc(auth.userId)
    .collection("bodyLog")
    .doc(req.params.date);

  const doc = await docRef.get();
  if (!doc.exists) {
    throw new WakeApiServerError("NOT_FOUND", 404, "Registro no encontrado");
  }

  await docRef.delete();
  res.status(204).send();
});

// POST /progress/body-log/:date/photos/upload-url
router.post("/progress/body-log/:date/photos/upload-url", async (req, res) => {
  const auth = await validateAuth(req);
  await checkRateLimit(auth.userId, 20, "rate_limit_first_party");

  validateDateFormat(req.params.date, "date");

  const {contentType} = validateBody<{ contentType: string }>(
    {contentType: "string"},
    req.body
  );

  const allowedTypes = ["image/jpeg", "image/png", "image/webp"];
  if (!allowedTypes.includes(contentType)) {
    throw new WakeApiServerError(
      "VALIDATION_ERROR", 400,
      "Tipo de imagen no soportado", "contentType"
    );
  }

  const photoId = db.collection("_").doc().id;
  const ext = contentType.split("/")[1] === "jpeg" ? "jpg" : contentType.split("/")[1];
  const storagePath = `body_log/${auth.userId}/${req.params.date}/${photoId}.${ext}`;
  const bucket = admin.storage().bucket();
  const file = bucket.file(storagePath);

  const [url] = await file.getSignedUrl({
    version: "v4",
    action: "write",
    expires: Date.now() + 15 * 60 * 1000,
    contentType,
  });

  res.json({data: {uploadUrl: url, storagePath, photoId}});
});

// POST /progress/body-log/:date/photos/confirm
router.post("/progress/body-log/:date/photos/confirm", async (req, res) => {
  const auth = await validateAuth(req);
  await checkRateLimit(auth.userId, 200, "rate_limit_first_party");

  validateDateFormat(req.params.date, "date");

  const {storagePath, photoId} = validateBody<{
    storagePath: string;
    photoId: string;
  }>({storagePath: "string", photoId: "string"}, req.body);

  // CRITICAL: Validate storage path prefix to prevent path traversal
  validateStoragePath(storagePath, `body_log/${auth.userId}/${req.params.date}/`);

  const bucket = admin.storage().bucket();
  const [exists] = await bucket.file(storagePath).exists();
  if (!exists) {
    throw new WakeApiServerError("NOT_FOUND", 404, "Archivo no encontrado en Storage");
  }

  const publicUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(storagePath)}?alt=media`;

  const docRef = db
    .collection("users")
    .doc(auth.userId)
    .collection("bodyLog")
    .doc(req.params.date);

  await docRef.set(
    {
      photos: FieldValue.arrayUnion({
        photoId,
        url: publicUrl,
        storagePath,
        uploaded_at: new Date().toISOString(),
      }),
      updated_at: FieldValue.serverTimestamp(),
    },
    {merge: true}
  );

  res.json({data: {photoId, url: publicUrl}});
});

// DELETE /progress/body-log/:date/photos/:photoId
router.delete("/progress/body-log/:date/photos/:photoId", async (req, res) => {
  const auth = await validateAuth(req);
  await checkRateLimit(auth.userId, 200, "rate_limit_first_party");

  validateDateFormat(req.params.date, "date");

  const docRef = db
    .collection("users")
    .doc(auth.userId)
    .collection("bodyLog")
    .doc(req.params.date);

  const doc = await docRef.get();
  if (!doc.exists) {
    throw new WakeApiServerError("NOT_FOUND", 404, "Registro no encontrado");
  }

  const photos = (doc.data()?.photos ?? []) as Array<{ photoId: string; storagePath?: string }>;
  const photo = photos.find((p) => p.photoId === req.params.photoId);

  if (!photo) {
    throw new WakeApiServerError("NOT_FOUND", 404, "Foto no encontrada");
  }

  // Delete from Storage
  if (photo.storagePath) {
    const bucket = admin.storage().bucket();
    await bucket.file(photo.storagePath).delete().catch(() => {});
  }

  // Remove from array
  await docRef.update({
    photos: FieldValue.arrayRemove(photo),
    updated_at: FieldValue.serverTimestamp(),
  });

  res.status(204).send();
});

// GET /progress/readiness
router.get("/progress/readiness", async (req, res) => {
  const auth = await validateAuth(req);
  await checkRateLimit(auth.userId, 200, "rate_limit_first_party");

  const {startDate, endDate} = req.query as Record<string, string>;

  // Validate date formats
  if (startDate) validateDateFormat(startDate, "startDate");
  if (endDate) validateDateFormat(endDate, "endDate");

  let query: Query = db
    .collection("users")
    .doc(auth.userId)
    .collection("readiness")
    .orderBy("date", "desc");

  if (startDate && endDate) {
    query = query.where("date", ">=", startDate).where("date", "<=", endDate);
  }

  query = query.limit(30);
  const snapshot = await query.get();

  res.json({
    data: snapshot.docs.map((d) => ({...d.data(), id: d.id})),
  });
});

// GET /progress/readiness/:date
router.get("/progress/readiness/:date", async (req, res) => {
  const auth = await validateAuth(req);
  await checkRateLimit(auth.userId, 200, "rate_limit_first_party");

  validateDateFormat(req.params.date, "date");

  const doc = await db
    .collection("users")
    .doc(auth.userId)
    .collection("readiness")
    .doc(req.params.date)
    .get();

  res.json({data: doc.exists ? {...doc.data(), id: doc.id} : null});
});

// PUT /progress/readiness/:date (idempotent)
router.put("/progress/readiness/:date", async (req, res) => {
  const auth = await validateAuth(req);
  await checkRateLimit(auth.userId, 200, "rate_limit_first_party");

  const date = req.params.date;
  validateDateFormat(date, "date");

  // Validate and allowlist fields
  const body = validateBody<{
    sleep?: number;
    stress?: number;
    energy?: number;
    soreness?: number;
    mood?: number;
    notes?: string;
  }>(
    {
      sleep: "optional_number",
      stress: "optional_number",
      energy: "optional_number",
      soreness: "optional_number",
      mood: "optional_number",
      notes: "optional_string",
    },
    req.body
  );

  const docRef = db
    .collection("users")
    .doc(auth.userId)
    .collection("readiness")
    .doc(date);

  await docRef.set(
    {
      ...body,
      date,
      updated_at: FieldValue.serverTimestamp(),
    },
    {merge: true}
  );

  res.json({data: {date, updated: true}});
});

// DELETE /progress/readiness/:date
router.delete("/progress/readiness/:date", async (req, res) => {
  const auth = await validateAuth(req);
  await checkRateLimit(auth.userId, 200, "rate_limit_first_party");

  validateDateFormat(req.params.date, "date");

  const docRef = db
    .collection("users")
    .doc(auth.userId)
    .collection("readiness")
    .doc(req.params.date);

  const doc = await docRef.get();
  if (!doc.exists) {
    throw new WakeApiServerError("NOT_FOUND", 404, "Registro no encontrado");
  }

  await docRef.delete();
  res.status(204).send();
});

// GET /progress/user-sessions — session history for a course
router.get("/progress/user-sessions", async (req, res) => {
  const auth = await validateAuth(req);
  await checkRateLimit(auth.userId, 200, "rate_limit_first_party");

  const courseId = req.query.courseId as string;
  if (!courseId) {
    throw new WakeApiServerError("VALIDATION_ERROR", 400, "courseId es requerido", "courseId");
  }

  const rawLimit = parseInt(req.query.limit as string, 10);
  const limitParam = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, 200) : 50;

  const snap = await db
    .collection("users")
    .doc(auth.userId)
    .collection("sessionHistory")
    .where("courseId", "==", courseId)
    .orderBy("date", "desc")
    .limit(limitParam)
    .get();

  res.json({data: snap.docs.map((d) => ({...d.data(), id: d.id}))});
});

// GET /progress/session/:sessionId — single session history entry
router.get("/progress/session/:sessionId", async (req, res) => {
  const auth = await validateAuth(req);
  await checkRateLimit(auth.userId, 200, "rate_limit_first_party");

  const doc = await db
    .collection("users")
    .doc(auth.userId)
    .collection("sessionHistory")
    .doc(req.params.sessionId)
    .get();

  if (!doc.exists) {
    throw new WakeApiServerError("NOT_FOUND", 404, "Sesión no encontrada");
  }

  res.json({data: {...doc.data(), id: doc.id}});
});

// GET /progress/prs — alias for GET /workout/prs
// exerciseHistoryService.js calls this path
router.get("/progress/prs", async (req, res) => {
  const auth = await validateAuth(req);
  await checkRateLimit(auth.userId, 200, "rate_limit_first_party");

  const snapshot = await db
    .collection("users")
    .doc(auth.userId)
    .collection("exerciseLastPerformance")
    .get();

  const prs = snapshot.docs.map((doc) => ({
    exerciseKey: doc.id,
    ...doc.data(),
  }));

  res.json({data: prs});
});

export default router;
