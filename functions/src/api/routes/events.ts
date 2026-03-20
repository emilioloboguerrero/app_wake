import { Router } from "express";
import * as admin from "firebase-admin";
import * as crypto from "node:crypto";
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

async function verifyEventOwnership(
  eventId: string,
  userId: string
): Promise<admin.firestore.DocumentSnapshot> {
  const doc = await db.collection("events").doc(eventId).get();
  if (!doc.exists || doc.data()?.creatorId !== userId) {
    throw new WakeApiServerError("NOT_FOUND", 404, "Evento no encontrado");
  }
  return doc;
}

// ─── Public endpoints ─────────────────────────────────────────────────────

// GET /events/:eventId (no auth — draft events return 404)
router.get("/events/:eventId", async (req, res) => {
  const doc = await db.collection("events").doc(req.params.eventId).get();
  if (!doc.exists || doc.data()?.status === "draft") {
    throw new WakeApiServerError("NOT_FOUND", 404, "Evento no encontrado");
  }

  const event = doc.data()!;

  let spotsRemaining: number | null = null;
  if (event.maxRegistrations) {
    const regsSnap = await db
      .collection("event_signups")
      .doc(req.params.eventId)
      .collection("registrations")
      .count()
      .get();
    spotsRemaining = Math.max(0, event.maxRegistrations - regsSnap.data().count);
  }

  res.json({
    data: {
      eventId: doc.id,
      title: event.title,
      description: event.description || null,
      imageUrl: event.image_url || null,
      date: event.date || null,
      location: event.location || null,
      status: event.status,
      spotsRemaining,
      fields: event.fields || [],
    },
  });
});

// POST /events/:eventId/register (no auth — supports unauthenticated)
router.post("/events/:eventId/register", async (req, res) => {
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
          ...req.body,
          created_at: admin.firestore.FieldValue.serverTimestamp(),
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

  const checkInToken = crypto.randomUUID();

  const regRef = await db
    .collection("event_signups")
    .doc(req.params.eventId)
    .collection("registrations")
    .add({
      ...req.body,
      check_in_token: checkInToken,
      checked_in: false,
      created_at: admin.firestore.FieldValue.serverTimestamp(),
    });

  res.status(201).json({
    data: {
      registrationId: regRef.id,
      status: "registered",
      waitlistPosition: null,
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
    .where("creatorId", "==", auth.userId)
    .orderBy("created_at", "desc")
    .get();

  const events = await Promise.all(
    snapshot.docs.map(async (d) => {
      const data = d.data();
      const regsSnap = await db
        .collection("event_signups")
        .doc(d.id)
        .collection("registrations")
        .count()
        .get();

      return {
        eventId: d.id,
        title: data.title,
        description: data.description || null,
        imageUrl: data.image_url || null,
        date: data.date || null,
        location: data.location || null,
        status: data.status,
        maxRegistrations: data.maxRegistrations || null,
        registrationCount: regsSnap.data().count,
        fields: data.fields || [],
        createdAt: data.created_at,
      };
    })
  );

  res.json({ data: events });
});

// POST /creator/events
router.post("/creator/events", async (req, res) => {
  const auth = await validateAuth(req);
  requireCreator(auth);
  await checkRateLimit(auth.userId, 200, "rate_limit_first_party");

  const body = validateBody<{ title: string }>(
    { title: "string" },
    req.body
  );

  const now = admin.firestore.FieldValue.serverTimestamp();
  const docRef = await db.collection("events").add({
    ...body,
    creatorId: auth.userId,
    status: "draft",
    created_at: now,
    updated_at: now,
  });

  const created = await docRef.get();

  res.status(201).json({
    data: {
      eventId: docRef.id,
      createdAt: created.data()?.created_at,
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

  if (event.status !== "draft" && event.status !== "active") {
    throw new WakeApiServerError(
      "FORBIDDEN", 403,
      "Solo se pueden editar eventos en estado draft o active"
    );
  }

  await doc.ref.update({
    ...req.body,
    updated_at: admin.firestore.FieldValue.serverTimestamp(),
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

  const { status } = validateBody<{ status: string }>(
    { status: "string" },
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
    updated_at: admin.firestore.FieldValue.serverTimestamp(),
  });

  res.json({ data: { eventId: req.params.eventId, status } });
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
  const storagePath = `event_images/${req.params.eventId}/cover.${ext}`;
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

// POST /creator/events/:eventId/image/confirm — confirm event image upload
router.post("/creator/events/:eventId/image/confirm", async (req, res) => {
  const auth = await validateAuth(req);
  requireCreator(auth);
  await checkRateLimit(auth.userId, 200, "rate_limit_first_party");

  const eventDocRef = db.collection("events").doc(req.params.eventId);
  const eventDoc = await eventDocRef.get();
  if (!eventDoc.exists || eventDoc.data()?.creatorId !== auth.userId) {
    throw new WakeApiServerError("NOT_FOUND", 404, "Evento no encontrado");
  }

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

  const imageUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(storagePath)}?alt=media`;

  await eventDocRef.update({
    image_url: imageUrl,
    updated_at: admin.firestore.FieldValue.serverTimestamp(),
  });

  res.json({ data: { imageUrl } });
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

  let query: admin.firestore.Query = db
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
        clientUserId: data.clientUserId || null,
        email: data.email || null,
        displayName: data.displayName || null,
        checkedIn: data.checked_in || false,
        checkedInAt: data.checked_in_at || null,
        fieldValues: data.fieldValues || {},
        createdAt: data.created_at,
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
      checked_in_at: admin.firestore.FieldValue.serverTimestamp(),
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
    const checkInToken = crypto.randomUUID();

    const regRef = await db
      .collection("event_signups")
      .doc(req.params.eventId)
      .collection("registrations")
      .add({
        ...waitlistData,
        check_in_token: checkInToken,
        checked_in: false,
        admitted_from_waitlist: true,
        created_at: admin.firestore.FieldValue.serverTimestamp(),
      });

    await waitlistRef.delete();

    res.status(201).json({
      data: { registrationId: regRef.id },
    });
  }
);

// ─── Creator availability & bookings ───────────────────────────────────────

// GET /creator/availability
router.get("/creator/availability", async (req, res) => {
  const auth = await validateAuth(req);
  requireCreator(auth);
  await checkRateLimit(auth.userId, 200, "rate_limit_first_party");

  const doc = await db.collection("creator_availability").doc(auth.userId).get();
  res.json({ data: doc.exists ? doc.data() : null });
});

// POST /creator/availability/slots
router.post("/creator/availability/slots", async (req, res) => {
  const auth = await validateAuth(req);
  requireCreator(auth);
  await checkRateLimit(auth.userId, 200, "rate_limit_first_party");

  const docRef = db.collection("creator_availability").doc(auth.userId);
  await docRef.set(
    {
      slots: admin.firestore.FieldValue.arrayUnion(...(req.body.slots || [])),
      updated_at: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  res.json({ data: { updated: true } });
});

// DELETE /creator/availability/slots
router.delete("/creator/availability/slots", async (req, res) => {
  const auth = await validateAuth(req);
  requireCreator(auth);
  await checkRateLimit(auth.userId, 200, "rate_limit_first_party");

  const docRef = db.collection("creator_availability").doc(auth.userId);
  await docRef.set(
    {
      slots: admin.firestore.FieldValue.arrayRemove(...(req.body.slots || [])),
      updated_at: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  res.status(204).send();
});

// GET /creator/bookings — paginated
router.get("/creator/bookings", async (req, res) => {
  const auth = await validateAuth(req);
  requireCreator(auth);
  await checkRateLimit(auth.userId, 200, "rate_limit_first_party");

  const snapshot = await db
    .collection("call_bookings")
    .where("creatorId", "==", auth.userId)
    .orderBy("created_at", "desc")
    .limit(50)
    .get();

  res.json({
    data: snapshot.docs.map((d) => ({ id: d.id, ...d.data() })),
  });
});

// PATCH /creator/bookings/:bookingId
router.patch("/creator/bookings/:bookingId", async (req, res) => {
  const auth = await validateAuth(req);
  requireCreator(auth);
  await checkRateLimit(auth.userId, 200, "rate_limit_first_party");

  const docRef = db.collection("call_bookings").doc(req.params.bookingId);
  const doc = await docRef.get();

  if (!doc.exists || doc.data()?.creatorId !== auth.userId) {
    throw new WakeApiServerError("NOT_FOUND", 404, "Booking no encontrado");
  }

  await docRef.update({
    ...req.body,
    updated_at: admin.firestore.FieldValue.serverTimestamp(),
  });

  res.json({ data: { updated: true } });
});

// ─── Public availability + user bookings ───────────────────────────────────

// GET /creator/:creatorId/availability
router.get("/creator/:creatorId/availability", async (req, res) => {
  const auth = await validateAuth(req);
  await checkRateLimit(auth.userId, 200, "rate_limit_first_party");

  const doc = await db
    .collection("creator_availability")
    .doc(req.params.creatorId)
    .get();

  res.json({ data: doc.exists ? doc.data() : null });
});

// POST /bookings
router.post("/bookings", async (req, res) => {
  const auth = await validateAuth(req);
  await checkRateLimit(auth.userId, 200, "rate_limit_first_party");

  const body = validateBody<{ creatorId: string; slotId: string }>(
    { creatorId: "string", slotId: "string" },
    req.body
  );

  const docRef = await db.collection("call_bookings").add({
    ...body,
    userId: auth.userId,
    status: "confirmed",
    created_at: admin.firestore.FieldValue.serverTimestamp(),
  });

  res.status(201).json({ data: { id: docRef.id } });
});

// GET /bookings/:bookingId
router.get("/bookings/:bookingId", async (req, res) => {
  const auth = await validateAuth(req);
  await checkRateLimit(auth.userId, 200, "rate_limit_first_party");

  const doc = await db.collection("call_bookings").doc(req.params.bookingId).get();
  if (!doc.exists) {
    throw new WakeApiServerError("NOT_FOUND", 404, "Booking no encontrado");
  }

  const data = doc.data()!;
  if (data.userId !== auth.userId && data.creatorId !== auth.userId) {
    throw new WakeApiServerError("FORBIDDEN", 403, "Sin acceso a este booking");
  }

  res.json({ data: { id: doc.id, ...data } });
});

// DELETE /bookings/:bookingId
router.delete("/bookings/:bookingId", async (req, res) => {
  const auth = await validateAuth(req);
  await checkRateLimit(auth.userId, 200, "rate_limit_first_party");

  const docRef = db.collection("call_bookings").doc(req.params.bookingId);
  const doc = await docRef.get();

  if (!doc.exists) {
    throw new WakeApiServerError("NOT_FOUND", 404, "Booking no encontrado");
  }

  if (doc.data()?.userId !== auth.userId) {
    throw new WakeApiServerError("FORBIDDEN", 403, "Solo puedes cancelar tus propios bookings");
  }

  await docRef.update({
    status: "cancelled",
    cancelled_at: admin.firestore.FieldValue.serverTimestamp(),
  });

  res.json({ data: { cancelled: true } });
});

export default router;
