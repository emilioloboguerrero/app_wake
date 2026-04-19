import {Router} from "express";
import * as admin from "firebase-admin";
import * as crypto from "node:crypto";
import * as path from "node:path";
import {db, FieldValue} from "../firestore.js";
import type {Query, DocumentSnapshot} from "../firestore.js";
import {validateAuth} from "../middleware/auth.js";
import {validateBody, pickFields, validateStoragePath} from "../middleware/validate.js";
import {checkRateLimit, checkIpRateLimit} from "../middleware/rateLimit.js";
import {WakeApiServerError} from "../errors.js";
import * as functions from "firebase-functions";

const router = Router();

function normalizeDate(value: unknown): string | null {
  if (!value) return null;
  if (typeof value === "string") return value;
  if (typeof value === "object" && value !== null) {
    if ("toDate" in value && typeof (value as { toDate: unknown }).toDate === "function") {
      return (value as { toDate: () => Date }).toDate().toISOString();
    }
    if ("_seconds" in value) {
      return new Date((value as { _seconds: number })._seconds * 1000).toISOString();
    }
  }
  return null;
}


async function generateOgImage(eventId: string, storagePath: string): Promise<void> {
  try {
    const sharp = (await import("sharp")).default;
    const bucket = admin.storage().bucket();

    const [coverBuffer] = await bucket.file(storagePath).download();

    const isotipoPath = path.resolve(__dirname, "../assets/wake-isotipo.png");
    const isotipoBuffer = await sharp(isotipoPath)
      .resize(400, 400, {fit: "inside"})
      .ensureAlpha()
      .composite([{
        input: Buffer.from([255, 255, 255, Math.round(255 * 0.4)]),
        raw: {width: 1, height: 1, channels: 4},
        tile: true,
        blend: "dest-in",
      }])
      .toBuffer();

    const ogBuffer = await sharp(coverBuffer)
      .resize(1200, 630, {fit: "cover", position: "center"})
      .composite([{
        input: isotipoBuffer,
        gravity: "center",
      }])
      .png()
      .toBuffer();

    const ogPath = `events/${eventId}/og-cover.png`;
    const ogFile = bucket.file(ogPath);
    await ogFile.save(ogBuffer, {
      metadata: {contentType: "image/png", cacheControl: "public, max-age=31536000"},
    });

    const ogImageUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(ogPath)}?alt=media`;

    await db.collection("events").doc(eventId).update({
      og_image_url: ogImageUrl,
    });
  } catch (err) {
    functions.logger.error(`OG image generation failed for event ${eventId}:`, err);
  }
}

function requireCreator(auth: { role: string }): void {
  if (auth.role !== "creator" && auth.role !== "admin") {
    throw new WakeApiServerError("FORBIDDEN", 403, "Acceso restringido a creadores");
  }
}

async function verifyEventOwnership(
  eventId: string,
  userId: string
): Promise<DocumentSnapshot> {
  const doc = await db.collection("events").doc(eventId).get();
  const data = doc.data();
  if (!doc.exists || (data?.creator_id !== userId && data?.creatorId !== userId)) {
    throw new WakeApiServerError("NOT_FOUND", 404, "Evento no encontrado");
  }
  return doc;
}

// ─── Public endpoints ─────────────────────────────────────────────────────

// GET /events/:eventId (no auth — draft events return 404)
router.get("/events/:eventId", async (req, res) => {
  // IP-based rate limiting for public endpoint
  await checkIpRateLimit(req, 60);

  const doc = await db.collection("events").doc(req.params.eventId).get();
  if (!doc.exists || doc.data()?.status === "draft") {
    throw new WakeApiServerError("NOT_FOUND", 404, "Evento no encontrado");
  }

  const event = doc.data()!;

  const maxRegs = event.max_registrations ?? event.maxRegistrations ?? event.capacity ?? null;
  const regsSnap = await db
    .collection("event_signups")
    .doc(req.params.eventId)
    .collection("registrations")
    .count()
    .get();
  const regCount = regsSnap.data().count;
  const spotsRemaining = maxRegs ? Math.max(0, maxRegs - regCount) : null;

  res.json({
    data: {
      eventId: doc.id,
      title: event.title,
      description: event.description || null,
      imageUrl: event.image_url || null,
      date: normalizeDate(event.date),
      location: event.location || null,
      status: event.status,
      max_registrations: maxRegs,
      registration_count: regCount,
      spotsRemaining,
      fields: event.fields || [],
      settings: event.settings || null,
    },
  });
});

// POST /events/:eventId/register (no auth — supports unauthenticated)
router.post("/events/:eventId/register", async (req, res) => {
  // IP-based rate limiting (10 RPM) for public endpoint
  await checkIpRateLimit(req, 10);

  // Validate registration body with explicit fields
  const body = validateBody<{
    email?: string;
    displayName?: string;
    phoneNumber?: string;
    fieldValues?: Record<string, unknown>;
  }>(
    {
      email: "optional_string",
      displayName: "optional_string",
      phoneNumber: "optional_string",
      fieldValues: "optional_object",
    },
    req.body,
    {maxStringLength: 500}
  );

  const eventDoc = await db.collection("events").doc(req.params.eventId).get();
  if (!eventDoc.exists) {
    throw new WakeApiServerError("NOT_FOUND", 404, "Evento no encontrado");
  }

  const event = eventDoc.data()!;
  if (event.status !== "active" && event.status !== "published") {
    throw new WakeApiServerError("FORBIDDEN", 403, "Las inscripciones están cerradas");
  }

  // Check capacity
  if (event.maxRegistrations || event.capacity) {
    const cap = event.maxRegistrations || event.capacity;
    const regsSnap = await db
      .collection("event_signups")
      .doc(req.params.eventId)
      .collection("registrations")
      .count()
      .get();

    if (regsSnap.data().count >= cap) {
      const waitlistSnap = await db
        .collection("event_signups")
        .doc(req.params.eventId)
        .collection("waitlist")
        .count()
        .get();

      const waitlistRef = await db
        .collection("event_signups")
        .doc(req.params.eventId)
        .collection("waitlist")
        .add({
          email: body.email ?? null,
          displayName: body.displayName ?? null,
          phoneNumber: body.phoneNumber ?? null,
          fieldValues: body.fieldValues ?? {},
          created_at: FieldValue.serverTimestamp(),
        });

      res.status(201).json({
        data: {
          registrationId: waitlistRef.id,
          status: "waitlisted",
          waitlistPosition: waitlistSnap.data().count + 1,
        },
      });
      return;
    }
  }

  const qrEnabled = event.settings?.enable_qr_checkin === true;
  const checkInToken = qrEnabled ? crypto.randomUUID() : null;

  const regRef = await db
    .collection("event_signups")
    .doc(req.params.eventId)
    .collection("registrations")
    .add({
      email: body.email ?? null,
      nombre: body.displayName ?? null,
      displayName: body.displayName ?? null,
      phoneNumber: body.phoneNumber ?? null,
      responses: body.fieldValues ?? {},
      fieldValues: body.fieldValues ?? {},
      ...(checkInToken ? {check_in_token: checkInToken} : {}),
      checked_in: false,
      created_at: FieldValue.serverTimestamp(),
    });

  res.status(201).json({
    data: {
      registrationId: regRef.id,
      status: "registered",
      waitlistPosition: null,
      ...(checkInToken ? {checkInToken} : {}),
    },
  });
});

// ─── Creator event management ──────────────────────────────────────────────

// GET /creator/events
router.get("/creator/events", async (req, res) => {
  const auth = await validateAuth(req);
  requireCreator(auth);
  await checkRateLimit(auth.userId, 200, "rate_limit_first_party");

  const snapshot = await db
    .collection("events")
    .where("creator_id", "==", auth.userId)
    .orderBy("created_at", "desc")
    .get();

  const events = await Promise.all(
    snapshot.docs.map(async (d) => {
      const data = d.data();
      const regsRef = db
        .collection("event_signups")
        .doc(d.id)
        .collection("registrations");

      const [regsSnap, checkinSnap] = await Promise.all([
        regsRef.count().get(),
        regsRef.where("checked_in", "==", true).count().get(),
      ]);

      const regCount = regsSnap.data().count;
      const checkinCount = checkinSnap.data().count;
      return {
        eventId: d.id,
        id: d.id,
        title: data.title,
        description: data.description || null,
        image_url: data.image_url || null,
        date: normalizeDate(data.date),
        location: data.location || null,
        status: data.status,
        max_registrations: data.max_registrations ?? data.maxRegistrations ?? null,
        registration_count: regCount,
        checkin_count: checkinCount,
        fields: data.fields || [],
        settings: data.settings || null,
        access: data.access || null,
        created_at: data.created_at,
      };
    })
  );

  res.json({data: events});
});

// POST /creator/events
router.post("/creator/events", async (req, res) => {
  const auth = await validateAuth(req);
  requireCreator(auth);
  await checkRateLimit(auth.userId, 200, "rate_limit_first_party");

  const body = validateBody<{
    title: string;
    description?: string;
    date?: string;
    location?: string;
    maxRegistrations?: number;
    fields?: unknown[];
    capacity?: number;
  }>(
    {
      title: "string",
      description: "optional_string",
      date: "optional_string",
      location: "optional_string",
      maxRegistrations: "optional_number",
      fields: "optional_array",
      capacity: "optional_number",
    },
    req.body
  );

  const now = FieldValue.serverTimestamp();
  const docData: Record<string, unknown> = {
    title: body.title,
    creator_id: auth.userId,
    status: "draft",
    created_at: now,
    updated_at: now,
  };
  if (body.description) docData.description = body.description;
  if (body.date) docData.date = body.date;
  if (body.location) docData.location = body.location;
  if (body.maxRegistrations != null) docData.max_registrations = body.maxRegistrations;
  if (body.capacity != null) docData.max_registrations = body.capacity;
  if (body.fields) docData.fields = body.fields;
  const docRef = await db.collection("events").add(docData);

  const created = await docRef.get();

  res.status(201).json({
    data: {
      eventId: docRef.id,
      createdAt: created.data()?.created_at,
    },
  });
});

// GET /creator/events/:eventId — single event detail for creator
router.get("/creator/events/:eventId", async (req, res) => {
  const auth = await validateAuth(req);
  requireCreator(auth);
  await checkRateLimit(auth.userId, 200, "rate_limit_first_party");

  const doc = await verifyEventOwnership(req.params.eventId, auth.userId);
  const data = doc.data()!;

  const regsSnap = await db
    .collection("event_signups")
    .doc(req.params.eventId)
    .collection("registrations")
    .count()
    .get();

  const regCount = regsSnap.data().count;

  res.json({
    data: {
      eventId: doc.id,
      id: doc.id,
      creator_id: data.creator_id || data.creatorId || null,
      title: data.title,
      description: data.description || null,
      image_url: data.image_url || null,
      date: normalizeDate(data.date),
      location: data.location || null,
      status: data.status,
      max_registrations: data.max_registrations ?? data.maxRegistrations ?? null,
      registration_count: regCount,
      fields: data.fields || [],
      settings: data.settings || null,
      access: data.access || null,
      created_at: data.created_at,
      updated_at: data.updated_at,
    },
  });
});

// PATCH /creator/events/:eventId
router.patch("/creator/events/:eventId", async (req, res) => {
  const auth = await validateAuth(req);
  requireCreator(auth);
  await checkRateLimit(auth.userId, 200, "rate_limit_first_party");

  const doc = await verifyEventOwnership(req.params.eventId, auth.userId);
  const event = doc.data()!;

  const bodyKeys = Object.keys(req.body);
  const isStatusOnlyChange = bodyKeys.length === 1 && bodyKeys[0] === "status";
  if (event.status !== "draft" && event.status !== "active" && !isStatusOnlyChange) {
    throw new WakeApiServerError(
      "FORBIDDEN", 403,
      "Solo se pueden editar eventos en estado draft o active"
    );
  }

  // Allowlist editable fields
  const allowedFields = ["title", "description", "date", "location", "max_registrations", "maxRegistrations", "fields", "capacity", "image_url", "settings", "access", "status"];
  const updates = pickFields(req.body, allowedFields);

  if (Object.keys(updates).length === 0) {
    throw new WakeApiServerError("VALIDATION_ERROR", 400, "No se proporcionaron campos para actualizar");
  }

  if (updates.status && !["draft", "active", "closed"].includes(updates.status as string)) {
    throw new WakeApiServerError("VALIDATION_ERROR", 400, "Estado inválido. Usa: draft, active o closed", "status");
  }

  await doc.ref.update({
    ...updates,
    updated_at: FieldValue.serverTimestamp(),
  });

  const updated = await doc.ref.get();

  res.json({
    data: {
      eventId: req.params.eventId,
      updatedAt: updated.data()?.updated_at,
    },
  });
});

// PATCH /creator/events/:eventId/status — change event status
router.patch("/creator/events/:eventId/status", async (req, res) => {
  const auth = await validateAuth(req);
  requireCreator(auth);
  await checkRateLimit(auth.userId, 200, "rate_limit_first_party");

  const {status} = validateBody<{ status: string }>(
    {status: "string"},
    req.body
  );

  const allowedStatuses = ["draft", "active", "closed"];
  if (!allowedStatuses.includes(status)) {
    throw new WakeApiServerError(
      "VALIDATION_ERROR", 400,
      "Estado inválido. Usa: draft, active o closed",
      "status"
    );
  }

  await verifyEventOwnership(req.params.eventId, auth.userId);

  const docRef = db.collection("events").doc(req.params.eventId);
  await docRef.update({
    status,
    updated_at: FieldValue.serverTimestamp(),
  });

  res.json({data: {eventId: req.params.eventId, status}});
});

// DELETE /creator/events/:eventId — delete event (only if draft or no registrations)
router.delete("/creator/events/:eventId", async (req, res) => {
  const auth = await validateAuth(req);
  requireCreator(auth);
  await checkRateLimit(auth.userId, 200, "rate_limit_first_party");

  const doc = await verifyEventOwnership(req.params.eventId, auth.userId);
  const event = doc.data()!;

  if (event.status !== "draft") {
    const regsSnap = await db
      .collection("event_signups")
      .doc(req.params.eventId)
      .collection("registrations")
      .limit(1)
      .get();

    if (!regsSnap.empty) {
      throw new WakeApiServerError(
        "CONFLICT", 409,
        "No se puede eliminar un evento con registros. Cambia el estado a cerrado"
      );
    }
  }

  await doc.ref.delete();

  res.status(204).send();
});

// POST /creator/events/:eventId/image/upload-url — signed URL for event image
router.post("/creator/events/:eventId/image/upload-url", async (req, res) => {
  const auth = await validateAuth(req);
  requireCreator(auth);
  await checkRateLimit(auth.userId, 200, "rate_limit_first_party");

  await verifyEventOwnership(req.params.eventId, auth.userId);

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
  const storagePath = `events/${req.params.eventId}/cover.${ext}`;
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

// POST /creator/events/:eventId/image/confirm — confirm event image upload
router.post("/creator/events/:eventId/image/confirm", async (req, res) => {
  const auth = await validateAuth(req);
  requireCreator(auth);
  await checkRateLimit(auth.userId, 200, "rate_limit_first_party");

  const eventDocRef = db.collection("events").doc(req.params.eventId);
  const eventDoc = await eventDocRef.get();
  const evData = eventDoc.data();
  if (!eventDoc.exists || (evData?.creator_id !== auth.userId && evData?.creatorId !== auth.userId)) {
    throw new WakeApiServerError("NOT_FOUND", 404, "Evento no encontrado");
  }

  const {storagePath} = validateBody<{ storagePath: string }>(
    {storagePath: "string"},
    req.body
  );

  // Validate storage path prefix
  validateStoragePath(storagePath, `events/${req.params.eventId}/`);

  const bucket = admin.storage().bucket();
  const [exists] = await bucket.file(storagePath).exists();
  if (!exists) {
    throw new WakeApiServerError(
      "NOT_FOUND", 404, "Archivo no encontrado en Storage"
    );
  }

  const imageUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(storagePath)}?alt=media`;

  await eventDocRef.update({
    image_url: imageUrl,
    updated_at: FieldValue.serverTimestamp(),
  });

  // Fire-and-forget: generate OG image with watermark
  generateOgImage(req.params.eventId, storagePath).catch(() => {});

  res.json({data: {imageUrl}});
});

// GET /creator/events/:eventId/registrations — paginated 50/page
router.get("/creator/events/:eventId/registrations", async (req, res) => {
  const auth = await validateAuth(req);
  requireCreator(auth);
  await checkRateLimit(auth.userId, 200, "rate_limit_first_party");

  await verifyEventOwnership(req.params.eventId, auth.userId);

  const pageToken = req.query.pageToken as string | undefined;
  const checkedInFilter = req.query.checkedIn as string | undefined;
  const limit = 50;

  let query: Query = db
    .collection("event_signups")
    .doc(req.params.eventId)
    .collection("registrations")
    .orderBy("created_at", "desc");

  if (checkedInFilter === "true") {
    query = query.where("checked_in", "==", true);
  } else if (checkedInFilter === "false") {
    query = query.where("checked_in", "==", false);
  }

  query = query.limit(limit + 1);

  if (pageToken) {
    const cursor = await db
      .collection("event_signups")
      .doc(req.params.eventId)
      .collection("registrations")
      .doc(pageToken)
      .get();
    if (cursor.exists) query = query.startAfter(cursor);
  }

  const snapshot = await query.get();
  const docs = snapshot.docs.slice(0, limit);
  const hasMore = snapshot.docs.length > limit;

  res.json({
    data: docs.map((d) => {
      const data = d.data();
      return {
        registrationId: d.id,
        id: d.id,
        clientUserId: data.clientUserId || null,
        email: data.email || null,
        nombre: data.nombre ?? data.displayName ?? null,
        displayName: data.nombre ?? data.displayName ?? null,
        checked_in: data.checked_in || false,
        checked_in_at: data.checked_in_at || null,
        responses: data.responses ?? data.fieldValues ?? {},
        fieldValues: data.responses ?? data.fieldValues ?? {},
        created_at: data.created_at,
      };
    }),
    nextPageToken: hasMore ? docs[docs.length - 1].id : null,
    hasMore,
  });
});

// POST /creator/events/:eventId/registrations/:regId/check-in
router.post(
  "/creator/events/:eventId/registrations/:regId/check-in",
  async (req, res) => {
    const auth = await validateAuth(req);
    requireCreator(auth);
    await checkRateLimit(auth.userId, 200, "rate_limit_first_party");

    await verifyEventOwnership(req.params.eventId, auth.userId);

    const regRef = db
      .collection("event_signups")
      .doc(req.params.eventId)
      .collection("registrations")
      .doc(req.params.regId);

    const regDoc = await regRef.get();
    if (!regDoc.exists) {
      throw new WakeApiServerError("NOT_FOUND", 404, "Registro no encontrado");
    }

    if (regDoc.data()?.checked_in) {
      throw new WakeApiServerError("CONFLICT", 409, "Este asistente ya hizo check-in");
    }

    await regRef.update({
      checked_in: true,
      checked_in_at: FieldValue.serverTimestamp(),
    });

    const updated = await regRef.get();

    res.json({
      data: {
        registrationId: req.params.regId,
        checkedInAt: updated.data()?.checked_in_at,
      },
    });
  }
);

// POST /creator/events/:eventId/checkin-by-token — check in by QR token
router.post(
  "/creator/events/:eventId/checkin-by-token",
  async (req, res) => {
    const auth = await validateAuth(req);
    requireCreator(auth);
    await checkRateLimit(auth.userId, 200, "rate_limit_first_party");

    await verifyEventOwnership(req.params.eventId, auth.userId);

    const {token} = validateBody<{ token: string }>(
      {token: "string"},
      req.body
    );

    const regsSnap = await db
      .collection("event_signups")
      .doc(req.params.eventId)
      .collection("registrations")
      .where("check_in_token", "==", token)
      .limit(1)
      .get();

    if (regsSnap.empty) {
      res.json({data: {status: "invalid"}});
      return;
    }

    const regDoc = regsSnap.docs[0];
    const regData = regDoc.data();

    if (regData.checked_in) {
      res.json({
        data: {
          status: "already",
          reg: {
            registrationId: regDoc.id,
            nombre: regData.nombre ?? regData.displayName ?? null,
            displayName: regData.nombre ?? regData.displayName ?? null,
            email: regData.email || null,
            responses: regData.responses ?? regData.fieldValues ?? {},
            fieldValues: regData.responses ?? regData.fieldValues ?? {},
            checked_in: true,
            checked_in_at: regData.checked_in_at || null,
          },
        },
      });
      return;
    }

    await regDoc.ref.update({
      checked_in: true,
      checked_in_at: FieldValue.serverTimestamp(),
    });

    const updated = await regDoc.ref.get();
    const updatedData = updated.data()!;

    res.json({
      data: {
        status: "success",
        reg: {
          registrationId: regDoc.id,
          nombre: updatedData.nombre ?? updatedData.displayName ?? null,
          displayName: updatedData.nombre ?? updatedData.displayName ?? null,
          email: updatedData.email || null,
          responses: updatedData.responses ?? updatedData.fieldValues ?? {},
          fieldValues: updatedData.responses ?? updatedData.fieldValues ?? {},
          checked_in: true,
          checked_in_at: updatedData.checked_in_at || null,
        },
      },
    });
  }
);

// DELETE /creator/events/:eventId/registrations/:regId — remove a registration
router.delete(
  "/creator/events/:eventId/registrations/:regId",
  async (req, res) => {
    const auth = await validateAuth(req);
    requireCreator(auth);
    await checkRateLimit(auth.userId, 200, "rate_limit_first_party");

    await verifyEventOwnership(req.params.eventId, auth.userId);

    const regRef = db
      .collection("event_signups")
      .doc(req.params.eventId)
      .collection("registrations")
      .doc(req.params.regId);

    const regDoc = await regRef.get();
    if (!regDoc.exists) {
      throw new WakeApiServerError("NOT_FOUND", 404, "Registro no encontrado");
    }

    await regRef.delete();

    res.status(204).send();
  }
);

// GET /creator/events/:eventId/waitlist — list waitlist entries
router.get("/creator/events/:eventId/waitlist", async (req, res) => {
  const auth = await validateAuth(req);
  requireCreator(auth);
  await checkRateLimit(auth.userId, 200, "rate_limit_first_party");

  await verifyEventOwnership(req.params.eventId, auth.userId);

  const snapshot = await db
    .collection("event_signups")
    .doc(req.params.eventId)
    .collection("waitlist")
    .orderBy("created_at", "asc")
    .get();

  res.json({
    data: snapshot.docs.map((d) => {
      const data = d.data();
      return {
        registrationId: d.id,
        clientUserId: data.clientUserId || null,
        email: data.email || null,
        displayName: data.displayName || null,
        checkedIn: false,
        checkedInAt: null,
        fieldValues: data.fieldValues || {},
        createdAt: data.created_at,
      };
    }),
  });
});

// POST /creator/events/:eventId/waitlist/:waitlistId/admit — admit from waitlist
router.post(
  "/creator/events/:eventId/waitlist/:waitlistId/admit",
  async (req, res) => {
    const auth = await validateAuth(req);
    requireCreator(auth);
    await checkRateLimit(auth.userId, 200, "rate_limit_first_party");

    await verifyEventOwnership(req.params.eventId, auth.userId);

    const waitlistRef = db
      .collection("event_signups")
      .doc(req.params.eventId)
      .collection("waitlist")
      .doc(req.params.waitlistId);

    const waitlistDoc = await waitlistRef.get();
    if (!waitlistDoc.exists) {
      throw new WakeApiServerError("NOT_FOUND", 404, "Entrada de lista de espera no encontrada");
    }

    const waitlistData = waitlistDoc.data()!;

    const eventDoc = await db.collection("events").doc(req.params.eventId).get();
    const qrEnabled = eventDoc.data()?.settings?.enable_qr_checkin === true;
    const checkInToken = qrEnabled ? crypto.randomUUID() : null;

    // Only copy safe fields from waitlist entry
    const regRef = await db
      .collection("event_signups")
      .doc(req.params.eventId)
      .collection("registrations")
      .add({
        email: waitlistData.email ?? null,
        displayName: waitlistData.displayName ?? null,
        phoneNumber: waitlistData.phoneNumber ?? null,
        fieldValues: waitlistData.fieldValues ?? {},
        ...(checkInToken ? {check_in_token: checkInToken} : {}),
        checked_in: false,
        admitted_from_waitlist: true,
        created_at: FieldValue.serverTimestamp(),
      });

    await waitlistRef.delete();

    res.status(201).json({
      data: {registrationId: regRef.id},
    });
  }
);

export default router;
