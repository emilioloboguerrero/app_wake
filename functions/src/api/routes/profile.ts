import {Router} from "express";
import * as admin from "firebase-admin";
import * as functions from "firebase-functions";
import {db, FieldValue} from "../firestore.js";
import type {Query} from "../firestore.js";
import {validateAuth, validateAuthAndRateLimit} from "../middleware/auth.js";
import {validateBody, validateStoragePath} from "../middleware/validate.js";
import {
  assertAllowedDownloadPath,
  assertAllowedUserCourseStatus,
  clampTrialDurationDays,
  isFreeGrantAllowed,
} from "../middleware/securityHelpers.js";
import {WakeApiServerError} from "../errors.js";
import {calculateExpirationDate} from "../services/paymentHelpers.js";
import {assignCourseToUser} from "../services/courseAssignment.js";
import {getActiveOneOnOneLock} from "../services/enrollmentLeave.js";

const router = Router();

// GET /users/me
router.get("/users/me", async (req, res) => {
  const auth = await validateAuthAndRateLimit(req);

  let data = auth.userData;
  if (!data) {
    // User doc doesn't exist yet (race with onUserCreated trigger).
    // Bootstrap it now so all subsequent calls find a document.
    const authUser = await admin.auth().getUser(auth.userId);
    const bootstrap = {
      role: "user" as const,
      email: authUser.email ?? null,
      displayName: authUser.displayName ?? null,
      created_at: FieldValue.serverTimestamp(),
    };
    await db.collection("users").doc(auth.userId).set(bootstrap, {merge: true});
    data = {...bootstrap, created_at: new Date()};
  }

  // Auto-heal: if no pinned nutrition assignment, check for active ones
  let pinnedNutritionAssignmentId = data.pinnedNutritionAssignmentId ?? null;
  if (!pinnedNutritionAssignmentId) {
    const assignSnap = await db
      .collection("nutrition_assignments")
      .where("userId", "==", auth.userId)
      .orderBy("createdAt", "desc")
      .limit(1)
      .get();
    const activeDoc = assignSnap.docs.find((d) => {
      const s = d.data().status;
      return !s || s === "active";
    });
    if (activeDoc) {
      pinnedNutritionAssignmentId = activeDoc.id;
      // Persist so future calls skip the extra query
      db.collection("users").doc(auth.userId).set({pinnedNutritionAssignmentId}, {merge: true})
        .catch((err) => functions.logger.warn("profile:pinned-nutrition-persist-failed", err));
    }
  }

  res.json({
    data: {
      userId: auth.userId,
      email: data.email ?? null,
      displayName: data.displayName ?? data.name ?? null,
      username: data.username ?? null,
      role: data.role ?? "user",
      country: data.country ?? null,
      city: data.city ?? null,
      gender: data.gender ?? null,
      height: data.height ?? null,
      weight: data.bodyweight ?? data.weight ?? null,
      birthDate: data.birthDate ?? null,
      profilePictureUrl: data.profilePictureUrl ?? data.profile_picture_url ?? null,
      phoneNumber: data.phoneNumber ?? null,
      pinnedTrainingCourseId: data.pinnedTrainingCourseId ?? null,
      pinnedNutritionAssignmentId,
      createdAt: data.created_at ?? null,
      webOnboardingCompleted: data.webOnboardingCompleted ?? false,
      profileCompleted: data.profileCompleted ?? false,
      onboardingCompleted: data.onboardingCompleted ?? false,
      bibliotecaGuideCompleted: data.bibliotecaGuideCompleted ?? false,
      courses: data.courses ?? {},
      bio: data.bio ?? null,
      creatorNavPreferences: data.creatorNavPreferences ?? null,
      // Lab screen fields
      oneRepMaxEstimates: data.oneRepMaxEstimates ?? null,
      weeklyMuscleVolume: data.weeklyMuscleVolume ?? null,
      onboardingData: data.onboardingData ?? null,
      goalWeight: data.goalWeight ?? null,
      weightUnit: data.weightUnit ?? null,
      activityStreak: data.activityStreak ?? null,
    },
  });
});

// POST /users/me/init — bootstrap user doc if it doesn't exist
router.post("/users/me/init", async (req, res) => {
  const auth = await validateAuthAndRateLimit(req, 20);

  const userRef = db.collection("users").doc(auth.userId);
  const userDoc = await userRef.get();

  if (userDoc.exists) {
    res.json({data: {userId: auth.userId, created: false}});
    return;
  }

  // Pull email/displayName from Firebase Auth record
  let email: string | null = null;
  let displayName: string | null = null;
  try {
    const authRecord = await admin.auth().getUser(auth.userId);
    email = authRecord.email ?? null;
    displayName = authRecord.displayName ?? null;
  } catch {/* user may not exist in Auth yet */}

  await userRef.set({
    email,
    displayName,
    role: "user",
    courses: {},
    created_at: FieldValue.serverTimestamp(),
    updated_at: FieldValue.serverTimestamp(),
  });

  res.status(201).json({data: {userId: auth.userId, created: true}});
});

// PATCH /users/me
router.patch(["/users/me", "/users/me/full"], async (req, res) => {
  const auth = await validateAuthAndRateLimit(req);

  const allowedFields = [
    "displayName", "username", "country", "city", "gender",
    "height", "weight", "birthDate", "phoneNumber",
    "pinnedTrainingCourseId", "pinnedNutritionAssignmentId",
    "beholdFeedId",
    "webOnboardingCompleted", "profileCompleted", "onboardingCompleted", "bibliotecaGuideCompleted",
    "onboardingData",
    "creatorDiscipline", "creatorDeliveryType", "creatorClientRange",
    "howTheyFoundUs", "creatorOnboardingData",
    "goalWeight", "weightUnit",
    "bio", "creatorNavPreferences",
    "creatorSpecializations", "creatorExperience", "creatorCertifications",
    "websiteUrl", "socialLinks", "profilePictureUrl",
  ];

  const stringFields = new Set([
    "displayName", "username", "country", "city", "gender",
    "birthDate", "phoneNumber", "pinnedTrainingCourseId", "pinnedNutritionAssignmentId",
    "beholdFeedId",
    "creatorDiscipline", "creatorDeliveryType", "creatorClientRange",
    "howTheyFoundUs", "weightUnit", "bio",
    "creatorExperience", "creatorCertifications",
  ]);
  const urlFields = new Set(["websiteUrl", "profilePictureUrl"]);
  const numberFields = new Set(["height", "weight", "goalWeight"]);
  const booleanFields = new Set(["webOnboardingCompleted", "profileCompleted", "onboardingCompleted", "bibliotecaGuideCompleted"]);
  const objectFields = new Set(["creatorOnboardingData", "onboardingData", "creatorNavPreferences", "socialLinks"]);
  const arrayFields = new Set(["creatorSpecializations"]);

  const updates: Record<string, unknown> = {};
  for (const field of allowedFields) {
    if (req.body[field] !== undefined) {
      const value = req.body[field];

      // Type validation per field
      if (stringFields.has(field)) {
        if (typeof value !== "string" || value.length > 200) {
          throw new WakeApiServerError(
            "VALIDATION_ERROR", 400,
            `${field} debe ser un string de máximo 200 caracteres`, field
          );
        }
      } else if (urlFields.has(field)) {
        if (value !== null && (typeof value !== "string" || value.length > 2048)) {
          throw new WakeApiServerError(
            "VALIDATION_ERROR", 400,
            `${field} debe ser un string de máximo 2048 caracteres`, field
          );
        }
      } else if (numberFields.has(field)) {
        if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1000) {
          throw new WakeApiServerError(
            "VALIDATION_ERROR", 400,
            `${field} debe ser un número entre 0 y 1000`, field
          );
        }
      } else if (booleanFields.has(field)) {
        if (typeof value !== "boolean") {
          throw new WakeApiServerError(
            "VALIDATION_ERROR", 400,
            `${field} debe ser un booleano`, field
          );
        }
      } else if (objectFields.has(field)) {
        if (typeof value !== "object" || value === null || Array.isArray(value)) {
          throw new WakeApiServerError(
            "VALIDATION_ERROR", 400,
            `${field} debe ser un objeto`, field
          );
        }
      } else if (arrayFields.has(field)) {
        if (!Array.isArray(value) || value.length > 20 || !value.every((v: unknown) => typeof v === "string" && v.length <= 100)) {
          throw new WakeApiServerError(
            "VALIDATION_ERROR", 400,
            `${field} debe ser un array de strings (máximo 20 items)`, field
          );
        }
      }

      if (field === "weight") {
        updates["bodyweight"] = value;
      } else {
        updates[field] = value;
      }
    }
  }

  if (Object.keys(updates).length === 0) {
    throw new WakeApiServerError(
      "VALIDATION_ERROR", 400, "No se proporcionaron campos para actualizar"
    );
  }

  if (updates.username) {
    const normalized = (updates.username as string).toLowerCase().trim();
    updates.username = normalized;
    const existing = await db.collection("users")
      .where("username", "==", normalized)
      .limit(1)
      .get();
    if (!existing.empty && existing.docs[0].id !== auth.userId) {
      throw new WakeApiServerError(
        "CONFLICT", 409, "Este username ya esta en uso", "username"
      );
    }
  }

  updates.updated_at = FieldValue.serverTimestamp();
  await db.collection("users").doc(auth.userId).set(updates, {merge: true});

  res.json({data: {userId: auth.userId, updatedAt: new Date().toISOString()}});
});

// POST /users/me/profile-picture/upload-url
router.post("/users/me/profile-picture/upload-url", async (req, res) => {
  const auth = await validateAuthAndRateLimit(req, 10);

  const {contentType} = validateBody<{ contentType: string }>(
    {contentType: "string"},
    req.body
  );

  const allowedTypes = ["image/jpeg", "image/png", "image/webp"];
  if (!allowedTypes.includes(contentType)) {
    throw new WakeApiServerError(
      "VALIDATION_ERROR", 400,
      "Tipo de imagen no soportado. Usa JPEG, PNG o WebP",
      "contentType"
    );
  }

  const ext = contentType.split("/")[1] === "jpeg" ? "jpg" : contentType.split("/")[1];
  const storagePath = `profile_pictures/${auth.userId}/profile.${ext}`;
  const bucket = admin.storage().bucket();
  const file = bucket.file(storagePath);

  const [url] = await file.getSignedUrl({
    version: "v4",
    action: "write",
    expires: Date.now() + 15 * 60 * 1000,
    contentType,
  });

  res.json({data: {uploadUrl: url, storagePath}});
});

// POST /users/me/profile-picture/confirm
router.post("/users/me/profile-picture/confirm", async (req, res) => {
  const auth = await validateAuthAndRateLimit(req);

  const {storagePath} = validateBody<{ storagePath: string }>(
    {storagePath: "string"},
    req.body
  );

  // CRITICAL: Validate storage path prefix to prevent path traversal
  validateStoragePath(storagePath, `profile_pictures/${auth.userId}/`);

  const bucket = admin.storage().bucket();
  const [exists] = await bucket.file(storagePath).exists();
  if (!exists) {
    throw new WakeApiServerError(
      "NOT_FOUND", 404, "Archivo no encontrado en Storage"
    );
  }

  const publicUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(storagePath)}?alt=media`;

  await db.collection("users").doc(auth.userId).update({
    profilePictureUrl: publicUrl,
    updated_at: FieldValue.serverTimestamp(),
  });

  res.json({data: {profilePictureUrl: publicUrl}});
});

// GET /users/:userId/public-profile
router.get("/users/:userId/public-profile", async (req, res) => {
  await validateAuthAndRateLimit(req);

  const userDoc = await db.collection("users").doc(req.params.userId).get();
  if (!userDoc.exists) {
    functions.logger.warn("public-profile miss", {
      userId: req.params.userId,
      referer: req.header("referer") ?? null,
    });
    throw new WakeApiServerError("NOT_FOUND", 404, "Usuario no encontrado");
  }

  const data = userDoc.data()!;
  res.json({
    data: {
      userId: req.params.userId,
      displayName: data.displayName ?? data.name ?? null,
      firstName: data.firstName ?? data.first_name ?? null,
      lastName: data.lastName ?? data.last_name ?? null,
      username: data.username ?? null,
      profilePictureUrl: data.profilePictureUrl ?? data.profile_picture_url ?? null,
      role: data.role ?? "user",
      bio: data.bio ?? null,
      birthDate: data.birthDate ?? data.birthdate ?? null,
      city: data.city ?? null,
      country: data.country ?? null,
      cards: data.cards ?? null,
    },
  });
});

// POST /users/me/courses/:courseId/trial — start a trial for a course
//
// Security (audit C-06, H-07):
//   - durationInDays clamped server-side via course config + 14d hard cap
//   - title/image_url/deliveryType read from course doc, NOT request body
//   - trial_used flag persisted to prevent delete+recreate trial farming
//   - course must declare free_trial.active === true
router.post("/users/me/courses/:courseId/trial", async (req, res) => {
  const auth = await validateAuthAndRateLimit(req);

  const body = validateBody<{
    durationInDays?: number;
  }>(
    {
      durationInDays: "optional_number",
    },
    req.body
  );

  const courseId = req.params.courseId;

  // Verify course exists AND has trial enabled
  const courseDoc = await db.collection("courses").doc(courseId).get();
  if (!courseDoc.exists) {
    throw new WakeApiServerError("NOT_FOUND", 404, "Programa no encontrado");
  }
  const course = courseDoc.data()!;
  const freeTrial = (course.free_trial ?? {}) as { active?: boolean; duration_days?: number };
  if (freeTrial.active !== true) {
    throw new WakeApiServerError(
      "FORBIDDEN", 403, "Este programa no ofrece prueba gratuita"
    );
  }

  // Block if user has ever started a trial for this course (survives delete)
  const userData = auth.userData ?? {};
  const trialUsed = (userData.trial_used ?? {}) as Record<string, unknown>;
  if (trialUsed[courseId]) {
    throw new WakeApiServerError(
      "CONFLICT", 409, "Ya usaste la prueba gratuita para este programa"
    );
  }

  // Block concurrent active trial
  const courses = (userData.courses ?? {}) as Record<string, Record<string, unknown>>;
  if (courses[courseId]?.status === "trial") {
    throw new WakeApiServerError(
      "CONFLICT", 409, "Ya tienes un trial activo para este programa"
    );
  }

  // Clamp duration: max(course.free_trial.duration_days, 14d)
  const requested = body.durationInDays ?? freeTrial.duration_days ?? 7;
  const durationDays = clampTrialDurationDays(requested, freeTrial.duration_days);

  const now = new Date();
  const expiresAt = new Date(now.getTime() + durationDays * 24 * 60 * 60 * 1000);

  await db.collection("users").doc(auth.userId).update({
    [`courses.${courseId}`]: {
      status: "trial",
      title: course.title ?? "",
      image_url: course.image_url ?? "",
      deliveryType: course.deliveryType ?? "low_ticket",
      purchased_at: now.toISOString(),
      expires_at: expiresAt.toISOString(),
      access_duration: "trial",
    },
    [`trial_used.${courseId}`]: {
      started_at: now.toISOString(),
      duration_days: durationDays,
    },
    updated_at: FieldValue.serverTimestamp(),
  });

  res.json({data: {success: true, expirationDate: expiresAt.toISOString()}});
});

// POST /users/me/move-course — add a course to the user's courses map
//
// Security (audit C-01): allowed only for legitimate free-grant cases.
// Previously any authenticated user could grant themselves an active
// enrollment to any course with no payment proof — the worst monetization
// bypass in the audit.
//
// Allowed cases (mirrors PWA pre-check at CourseDetailScreen.js:730-734):
//   - admin role
//   - creator who owns the course (own-program preview)
//   - draft programs (status !== 'published')
//   - explicitly-free programs (price === 0 AND subscription_price === 0)
//
// Paid programs MUST go through /payments/preference + webhook.
router.post("/users/me/move-course", async (req, res) => {
  const auth = await validateAuthAndRateLimit(req);

  const body = validateBody<{ courseId: string; targetUserId?: string }>(
    {courseId: "string", targetUserId: "optional_string"},
    req.body
  );

  const courseDoc = await db.collection("courses").doc(body.courseId).get();
  if (!courseDoc.exists) {
    throw new WakeApiServerError("NOT_FOUND", 404, "Programa no encontrado");
  }

  const course = courseDoc.data()!;
  if (!course.access_duration) {
    throw new WakeApiServerError("VALIDATION_ERROR", 400, "Programa sin duración de acceso");
  }

  // Only admins may grant access to a different user; everyone else can only
  // affect themselves.
  const targetUserId = body.targetUserId ?? auth.userId;
  if (targetUserId !== auth.userId && auth.role !== "admin") {
    throw new WakeApiServerError(
      "FORBIDDEN", 403, "Solo administradores pueden usar targetUserId"
    );
  }

  if (!isFreeGrantAllowed({
    callerUserId: auth.userId,
    callerRole: auth.role,
    course,
  })) {
    throw new WakeApiServerError(
      "FORBIDDEN",
      403,
      "Este programa requiere compra. La asignación se hace al confirmar el pago."
    );
  }

  const expiresAt = calculateExpirationDate(course.access_duration);
  await assignCourseToUser(targetUserId, body.courseId, course, expiresAt);

  functions.logger.info("move-course.granted", {
    callerUserId: auth.userId,
    callerRole: auth.role,
    targetUserId,
    courseId: body.courseId,
    reason: auth.role === "admin" ? "admin" :
      (course.creator_id === auth.userId || course.creatorId === auth.userId) ? "creator_owns" :
        course.status !== "published" ? "draft" : "free",
  });

  res.json({data: {success: true}});
});

// POST /users/me/courses/:programId/backfill — backfill a course entry for orphaned client_programs
//
// Security (audit H-09): requires an existing client_programs/{userId}_{programId}
// doc proving the user was enrolled by a creator. Title/image/etc are read from
// the program doc, NOT from the request body.
router.post("/users/me/courses/:programId/backfill", async (req, res) => {
  const auth = await validateAuthAndRateLimit(req);

  const programId = req.params.programId;

  // Proof of legitimate enrollment: must have a client_programs entry
  const clientProgramRef = db
    .collection("client_programs")
    .doc(`${auth.userId}_${programId}`);
  const clientProgramDoc = await clientProgramRef.get();
  if (!clientProgramDoc.exists) {
    throw new WakeApiServerError(
      "FORBIDDEN", 403, "No tienes una asignación activa para este programa"
    );
  }

  // Read program metadata server-side
  const courseDoc = await db.collection("courses").doc(programId).get();
  if (!courseDoc.exists) {
    throw new WakeApiServerError("NOT_FOUND", 404, "Programa no encontrado");
  }
  const course = courseDoc.data()!;

  await db.collection("users").doc(auth.userId).update({
    [`courses.${programId}`]: {
      status: "active",
      deliveryType: course.deliveryType ?? "one_on_one",
      title: course.title ?? "",
      image_url: course.image_url ?? "",
      discipline: course.discipline ?? "General",
      creatorName: course.creatorName ?? course.creator_name ?? "",
      purchased_at: new Date().toISOString(),
      expires_at: null,
      access_duration: "one_on_one",
    },
    updated_at: FieldValue.serverTimestamp(),
  });

  res.json({data: {success: true}});
});

// POST /auth/logout — no-op; Firebase Auth is stateless
router.post("/auth/logout", async (req, res) => {
  await validateAuth(req);
  res.json({data: {logged_out: true}});
});

// PATCH /creator/profile
router.patch("/creator/profile", async (req, res) => {
  const auth = await validateAuthAndRateLimit(req);
  if (auth.role !== "creator" && auth.role !== "admin") {
    throw new WakeApiServerError("FORBIDDEN", 403, "Solo creadores pueden actualizar su perfil de creador");
  }

  const {cards} = req.body;

  if (cards === undefined) {
    throw new WakeApiServerError(
      "VALIDATION_ERROR", 400, "No se proporcionaron campos para actualizar"
    );
  }

  if (typeof cards !== "object" || cards === null || Array.isArray(cards)) {
    throw new WakeApiServerError(
      "VALIDATION_ERROR", 400, "cards debe ser un objeto", "cards"
    );
  }

  // Validate cards object size and depth
  const cardsJson = JSON.stringify(cards);
  if (cardsJson.length > 10_000) {
    throw new WakeApiServerError(
      "VALIDATION_ERROR", 400, "cards excede el tamaño máximo de 10KB", "cards"
    );
  }

  // Check max depth of 3
  function checkDepth(obj: unknown, depth: number): boolean {
    if (depth > 3) return false;
    if (typeof obj === "object" && obj !== null) {
      for (const val of Object.values(obj as Record<string, unknown>)) {
        if (!checkDepth(val, depth + 1)) return false;
      }
    }
    return true;
  }
  if (!checkDepth(cards, 1)) {
    throw new WakeApiServerError(
      "VALIDATION_ERROR", 400, "cards excede la profundidad máxima permitida", "cards"
    );
  }

  await db.collection("users").doc(auth.userId).update({
    cards,
    updated_at: FieldValue.serverTimestamp(),
  });

  res.json({data: {updatedAt: new Date().toISOString()}});
});

// GET /users/me/full — returns full user document including all fields
router.get("/users/me/full", async (req, res) => {
  const auth = await validateAuthAndRateLimit(req);

  const data = auth.userData;
  if (!data) {
    throw new WakeApiServerError("NOT_FOUND", 404, "Usuario no encontrado");
  }

  res.json({
    data: {
      userId: auth.userId,
      ...data,
      profilePictureUrl: data.profilePictureUrl ?? data.profile_picture_url ?? null,
    },
  });
});

// GET /users/me/username-check — check if username is available
router.get("/users/me/username-check", async (req, res) => {
  const auth = await validateAuthAndRateLimit(req);

  const raw = req.query.username;
  if (!raw || typeof raw !== "string" || raw.length > 50) {
    throw new WakeApiServerError(
      "VALIDATION_ERROR", 400, "username es requerido (máx 50 caracteres)", "username"
    );
  }
  const normalized = raw.toLowerCase().trim();
  if (!normalized) {
    throw new WakeApiServerError(
      "VALIDATION_ERROR", 400, "username es requerido", "username"
    );
  }

  const snapshot = await db
    .collection("users")
    .where("username", "==", normalized)
    .limit(1)
    .get();

  const available = snapshot.empty || snapshot.docs[0].id === auth.userId;

  res.json({data: {available}});
});

// DELETE /users/me — account deletion
router.delete("/users/me", async (req, res) => {
  const auth = await validateAuthAndRateLimit(req, 10);

  const userRef = db.collection("users").doc(auth.userId);
  const userDoc = await userRef.get();
  if (!userDoc.exists) {
    throw new WakeApiServerError("NOT_FOUND", 404, "Usuario no encontrado");
  }

  // Delete known subcollections
  const subcollections = [
    "diary", "sessionHistory", "exerciseHistory",
    "exerciseLastPerformance", "saved_foods", "saved_meals",
    "readiness", "bodyLog", "subscriptions", "purchase_logs",
  ];

  for (const sub of subcollections) {
    const collRef = userRef.collection(sub);
    let snapshot = await collRef.limit(500).get();
    while (!snapshot.empty) {
      const batch = db.batch();
      snapshot.docs.forEach((doc) => batch.delete(doc.ref));
      await batch.commit();
      snapshot = await collRef.limit(500).get();
    }
  }

  // Delete the user document
  await userRef.delete();

  // Delete Firebase Auth record
  try {
    await admin.auth().deleteUser(auth.userId);
  } catch {/* Auth record may already be deleted */}

  res.status(204).send();
});

// POST /users/me/delete-feedback — save account deletion feedback
router.post("/users/me/delete-feedback", async (req, res) => {
  const auth = await validateAuthAndRateLimit(req, 10);

  const body = validateBody<{ feedback: Record<string, unknown> }>(
    {feedback: "object"},
    req.body
  );

  await db.collection("subscription_cancellation_feedback").add({
    userId: auth.userId,
    type: "account_deletion",
    feedback: body.feedback,
    submittedAt: FieldValue.serverTimestamp(),
  });

  res.status(201).json({data: {saved: true}});
});

// DELETE /users/me/courses/:courseId — remove a course from user's courses map
router.delete("/users/me/courses/:courseId", async (req, res) => {
  const auth = await validateAuthAndRateLimit(req);

  const courseId = req.params.courseId;
  if (!auth.userData) {
    throw new WakeApiServerError("NOT_FOUND", 404, "Usuario no encontrado");
  }

  const courses = (auth.userData.courses ?? {}) as Record<string, unknown>;
  if (!courses[courseId]) {
    throw new WakeApiServerError("NOT_FOUND", 404, "Curso no encontrado en tu cuenta");
  }

  await db.collection("users").doc(auth.userId).update({
    [`courses.${courseId}`]: FieldValue.delete(),
    updated_at: FieldValue.serverTimestamp(),
  });

  res.status(204).send();
});

// PATCH /users/me/courses/:courseId/version — update version status fields
router.patch("/users/me/courses/:courseId/version", async (req, res) => {
  const auth = await validateAuthAndRateLimit(req);

  const courseId = req.params.courseId;
  const allowedFields = ["update_status", "downloaded_version", "last_version_check"];
  const updates: Record<string, unknown> = {};

  for (const field of allowedFields) {
    if (req.body[field] !== undefined) {
      updates[`courses.${courseId}.${field}`] = req.body[field];
    }
  }

  if (Object.keys(updates).length === 0) {
    throw new WakeApiServerError(
      "VALIDATION_ERROR", 400, "No se proporcionaron campos para actualizar"
    );
  }

  updates.updated_at = FieldValue.serverTimestamp();
  await db.collection("users").doc(auth.userId).update(updates);

  res.json({data: {updated: true}});
});

// PATCH /users/me/courses/:courseId/status — update course status
//
// Security (audit H-25): status restricted to enum. Previously accepted any
// string, letting users set status="trial" on a paid course to game trial
// logic. expiresAt only applies to "expired"/"cancelled" transitions —
// extending paid access via this endpoint is not allowed.
router.patch("/users/me/courses/:courseId/status", async (req, res) => {
  const auth = await validateAuthAndRateLimit(req);

  const courseId = req.params.courseId;
  const body = validateBody<{ status: string; expiresAt?: string }>(
    {status: "string", expiresAt: "optional_string"},
    req.body
  );

  assertAllowedUserCourseStatus(body.status);

  const updates: Record<string, unknown> = {
    [`courses.${courseId}.status`]: body.status,
    updated_at: FieldValue.serverTimestamp(),
  };

  // Only allow setting expiresAt when transitioning to a terminal state.
  // Forbids users from extending their own paid access by sending a future date.
  if (body.expiresAt !== undefined) {
    if (body.status !== "expired" && body.status !== "cancelled") {
      throw new WakeApiServerError(
        "VALIDATION_ERROR",
        400,
        "expiresAt solo se puede establecer al cancelar o expirar",
        "expiresAt"
      );
    }
    updates[`courses.${courseId}.expires_at`] = body.expiresAt;
  }

  await db.collection("users").doc(auth.userId).update(updates);

  res.json({data: {updated: true}});
});

// GET /courses — course listing, optional ?creatorId=X filter
router.get("/courses", async (req, res) => {
  const auth = await validateAuthAndRateLimit(req);

  const creatorId = req.query.creatorId as string | undefined;

  let query: Query = db
    .collection("courses")
    .orderBy("created_at", "desc")
    .limit(100);

  if (creatorId) {
    query = query.where("creator_id", "==", creatorId);
  }

  // Lock-in filter applies only to global discovery (library).
  // On creator profile pages (?creatorId=X) we intentionally show everything —
  // general programs are always unblocked, and one-on-ones remain visible for
  // browsing. The purchase-block at POST /payments/preference still prevents
  // actually enrolling in a rival one-on-one while locked.
  const isCreatorProfileRequest = !!creatorId;

  const [snapshot, lock] = await Promise.all([
    query.get(),
    isCreatorProfileRequest ?
      Promise.resolve(null) :
      getActiveOneOnOneLock(auth.userId),
  ]);

  let docs = snapshot.docs.map((doc) => {
    const data = doc.data();
    return {
      ...data,
      id: doc.id,
      bundleOnly: data.visibility === "bundle-only",
    } as Record<string, unknown>;
  });

  // Global library only: hide rival creators' one-on-one programs while locked
  if (lock) {
    docs = docs.filter((d) => {
      if (d.deliveryType !== "one_on_one") return true;
      return d.creator_id === lock.creatorId;
    });
  }

  res.json({data: docs});
});

// GET /storage/download-url — return signed download URL for a storage path
//
// Security (audit C-09): caller can only request URLs for paths inside their
// own namespace (progress_photos/{uid}/, body_log/{uid}/, profiles/{uid}/,
// users/{uid}/). Previous implementation only blocked `..` and leading `/`,
// which let any user read any storage path including other users' body-log
// photos and video exchange media — Admin SDK signed URLs bypass Storage rules.
//
// For paths NOT in the allowlist (e.g. event covers, creator media), the
// client should fetch via the public token URL returned at upload time, OR
// a per-resource endpoint must be added that performs ownership checks
// before signing.
router.get("/storage/download-url", async (req, res) => {
  const auth = await validateAuthAndRateLimit(req);

  const path = req.query.path as string;
  assertAllowedDownloadPath(path, auth.userId);

  const bucket = admin.storage().bucket();
  const file = bucket.file(path);

  const [exists] = await file.exists();
  if (!exists) {
    throw new WakeApiServerError("NOT_FOUND", 404, "Archivo no encontrado");
  }

  const [url] = await file.getSignedUrl({
    version: "v4",
    action: "read",
    expires: Date.now() + 60 * 60 * 1000,
  });

  res.json({data: {url}});
});

// POST /purchases — log a purchase record
//
// Security (audit H-10): admin-only. Previously any user could write
// arbitrary amount/currency/paymentMethod/receiptId entries to their own
// purchase_logs subcollection, polluting any analytics or revenue calc that
// reads from it. Real purchases are recorded by the payment webhook in
// processed_payments, not via this endpoint.
router.post("/purchases", async (req, res) => {
  const auth = await validateAuthAndRateLimit(req);

  if (auth.role !== "admin") {
    throw new WakeApiServerError(
      "FORBIDDEN",
      403,
      "Solo administradores pueden crear registros de compra"
    );
  }

  const body = validateBody<{
    targetUserId: string;
    courseId?: string;
    amount?: number;
    currency?: string;
    paymentMethod?: string;
    receiptId?: string;
  }>(
    {
      targetUserId: "string",
      courseId: "optional_string",
      amount: "optional_number",
      currency: "optional_string",
      paymentMethod: "optional_string",
      receiptId: "optional_string",
    },
    req.body
  );

  const {targetUserId, ...purchaseFields} = body;
  const docRef = await db
    .collection("users")
    .doc(targetUserId)
    .collection("purchase_logs")
    .add({
      ...purchaseFields,
      userId: targetUserId,
      created_by_admin: auth.userId,
      created_at: FieldValue.serverTimestamp(),
    });

  functions.logger.info("admin.purchases.create", {
    adminId: auth.userId,
    targetUserId,
    purchaseLogId: docRef.id,
  });

  res.status(201).json({data: {id: docRef.id}});
});

export default router;
