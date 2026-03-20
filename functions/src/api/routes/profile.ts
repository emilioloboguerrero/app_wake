import { Router } from "express";
import * as admin from "firebase-admin";
import { validateAuth } from "../middleware/auth.js";
import { validateBody } from "../middleware/validate.js";
import { checkRateLimit } from "../middleware/rateLimit.js";
import { WakeApiServerError } from "../errors.js";

const router = Router();
const db = admin.firestore();

// GET /users/me
router.get("/users/me", async (req, res) => {
  const auth = await validateAuth(req);
  await checkRateLimit(
    auth.authType === "apikey" ? auth.keyId! : auth.userId,
    auth.authType === "apikey" ? 60 : 200,
    auth.authType === "apikey" ? "rate_limit_windows" : "rate_limit_first_party"
  );

  const userDoc = await db.collection("users").doc(auth.userId).get();
  if (!userDoc.exists) {
    throw new WakeApiServerError("NOT_FOUND", 404, "Usuario no encontrado");
  }

  const data = userDoc.data()!;
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
      age: data.age ?? null,
      height: data.height ?? null,
      bodyweight: data.bodyweight ?? null,
      profile_picture_url: data.profile_picture_url ?? null,
      courses: data.courses ?? {},
      onboardingData: data.onboardingData ?? null,
      created_at: data.created_at ?? null,
    },
  });
});

// PATCH /users/me
router.patch("/users/me", async (req, res) => {
  const auth = await validateAuth(req);
  await checkRateLimit(auth.userId, 200, "rate_limit_first_party");

  const allowedFields = [
    "displayName", "username", "country", "city", "gender",
    "age", "height", "bodyweight", "onboardingData",
  ];

  const updates: Record<string, unknown> = {};
  for (const field of allowedFields) {
    if (req.body[field] !== undefined) {
      updates[field] = req.body[field];
    }
  }

  if (Object.keys(updates).length === 0) {
    throw new WakeApiServerError(
      "VALIDATION_ERROR", 400, "No se proporcionaron campos para actualizar"
    );
  }

  updates.updated_at = admin.firestore.FieldValue.serverTimestamp();
  await db.collection("users").doc(auth.userId).update(updates);

  res.json({ data: { updated: true } });
});

// POST /users/me/profile-picture/upload-url
router.post("/users/me/profile-picture/upload-url", async (req, res) => {
  const auth = await validateAuth(req);
  await checkRateLimit(auth.userId, 200, "rate_limit_first_party");

  const { contentType } = validateBody<{ contentType: string }>(
    { contentType: "string" },
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

  res.json({ data: { uploadUrl: url, storagePath } });
});

// POST /users/me/profile-picture/confirm
router.post("/users/me/profile-picture/confirm", async (req, res) => {
  const auth = await validateAuth(req);
  await checkRateLimit(auth.userId, 200, "rate_limit_first_party");

  const { storagePath } = validateBody<{ storagePath: string }>(
    { storagePath: "string" },
    req.body
  );

  const bucket = admin.storage().bucket();
  const [exists] = await bucket.file(storagePath).exists();
  if (!exists) {
    throw new WakeApiServerError(
      "NOT_FOUND", 404, "Archivo no encontrado en Storage"
    );
  }

  const publicUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(storagePath)}?alt=media`;

  await db.collection("users").doc(auth.userId).update({
    profile_picture_url: publicUrl,
    updated_at: admin.firestore.FieldValue.serverTimestamp(),
  });

  res.json({ data: { profile_picture_url: publicUrl } });
});

// GET /users/:userId/public-profile
router.get("/users/:userId/public-profile", async (req, res) => {
  const auth = await validateAuth(req);
  await checkRateLimit(
    auth.authType === "apikey" ? auth.keyId! : auth.userId,
    auth.authType === "apikey" ? 60 : 200,
    auth.authType === "apikey" ? "rate_limit_windows" : "rate_limit_first_party"
  );

  const userDoc = await db.collection("users").doc(req.params.userId).get();
  if (!userDoc.exists) {
    throw new WakeApiServerError("NOT_FOUND", 404, "Usuario no encontrado");
  }

  const data = userDoc.data()!;
  res.json({
    data: {
      userId: req.params.userId,
      displayName: data.displayName ?? data.name ?? null,
      username: data.username ?? null,
      profile_picture_url: data.profile_picture_url ?? null,
    },
  });
});

// PATCH /creator/profile
router.patch("/creator/profile", async (req, res) => {
  const auth = await validateAuth(req);
  if (auth.role !== "creator" && auth.role !== "admin") {
    throw new WakeApiServerError("FORBIDDEN", 403, "Solo creadores pueden actualizar su perfil de creador");
  }
  await checkRateLimit(auth.userId, 200, "rate_limit_first_party");

  const allowedFields = [
    "bio", "specialties", "social_links", "banner_url",
    "display_name", "contact_email",
  ];

  const updates: Record<string, unknown> = {};
  for (const field of allowedFields) {
    if (req.body[field] !== undefined) {
      updates[field] = req.body[field];
    }
  }

  if (Object.keys(updates).length === 0) {
    throw new WakeApiServerError(
      "VALIDATION_ERROR", 400, "No se proporcionaron campos para actualizar"
    );
  }

  updates.updated_at = admin.firestore.FieldValue.serverTimestamp();
  await db.collection("users").doc(auth.userId).update(updates);

  res.json({ data: { updated: true } });
});

export default router;
