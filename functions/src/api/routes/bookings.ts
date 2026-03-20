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

// ─── Creator Availability & Bookings (§7.7) ────────────────────────────────

// GET /creator/availability — get creator's availability slots
router.get("/creator/availability", async (req, res) => {
  const auth = await validateAuth(req);
  requireCreator(auth);
  await checkRateLimit(auth.userId, 200, "rate_limit_first_party");

  const doc = await db.collection("creator_availability").doc(auth.userId).get();
  if (!doc.exists) {
    res.json({ data: { timezone: "America/Bogota", days: {} } });
    return;
  }

  const data = doc.data()!;
  res.json({
    data: {
      timezone: data.timezone ?? "America/Bogota",
      days: data.days ?? {},
    },
  });
});

// POST /creator/availability/slots — add availability slots for a day
router.post("/creator/availability/slots", async (req, res) => {
  const auth = await validateAuth(req);
  requireCreator(auth);
  await checkRateLimit(auth.userId, 200, "rate_limit_first_party");

  const body = validateBody<{
    date: string;
    startTime: string;
    endTime: string;
    durationMinutes: number;
    timezone: string;
  }>(
    {
      date: "string",
      startTime: "string",
      endTime: "string",
      durationMinutes: "number",
      timezone: "string",
    },
    req.body
  );

  // Parse start/end into minutes since midnight
  const [startH, startM] = body.startTime.split(":").map(Number);
  const [endH, endM] = body.endTime.split(":").map(Number);
  const startMinutes = startH * 60 + startM;
  const endMinutes = endH * 60 + endM;

  if (endMinutes <= startMinutes || body.durationMinutes < 5) {
    throw new WakeApiServerError(
      "VALIDATION_ERROR",
      400,
      "Rango de tiempo inválido o duración muy corta"
    );
  }

  // Generate slots
  const slots: Array<{
    startUtc: string;
    endUtc: string;
    durationMinutes: number;
    booked: boolean;
  }> = [];

  let cursor = startMinutes;
  while (cursor + body.durationMinutes <= endMinutes) {
    const slotStartH = Math.floor(cursor / 60);
    const slotStartM = cursor % 60;
    const slotEndCursor = cursor + body.durationMinutes;
    const slotEndH = Math.floor(slotEndCursor / 60);
    const slotEndM = slotEndCursor % 60;

    const startUtc = `${body.date}T${String(slotStartH).padStart(2, "0")}:${String(slotStartM).padStart(2, "0")}:00.000Z`;
    const endUtc = `${body.date}T${String(slotEndH).padStart(2, "0")}:${String(slotEndM).padStart(2, "0")}:00.000Z`;

    slots.push({
      startUtc,
      endUtc,
      durationMinutes: body.durationMinutes,
      booked: false,
    });

    cursor = slotEndCursor;
  }

  // Merge into existing availability doc
  const docRef = db.collection("creator_availability").doc(auth.userId);
  const existing = await docRef.get();

  if (existing.exists) {
    const existingDays = existing.data()?.days ?? {};
    const dayData = existingDays[body.date] ?? { slots: [] };
    dayData.slots = [...(dayData.slots || []), ...slots];

    await docRef.update({
      [`days.${body.date}`]: dayData,
      timezone: body.timezone,
      updated_at: admin.firestore.FieldValue.serverTimestamp(),
    });
  } else {
    await docRef.set({
      timezone: body.timezone,
      days: {
        [body.date]: { slots },
      },
      updated_at: admin.firestore.FieldValue.serverTimestamp(),
    });
  }

  res.json({ data: { date: body.date, slotsCreated: slots.length } });
});

// DELETE /creator/availability/slots — remove slots for a day (or specific slot)
router.delete("/creator/availability/slots", async (req, res) => {
  const auth = await validateAuth(req);
  requireCreator(auth);
  await checkRateLimit(auth.userId, 200, "rate_limit_first_party");

  const body = validateBody<{ date: string; startUtc: string | null }>(
    { date: "string", startUtc: "optional_string" },
    req.body
  );

  const docRef = db.collection("creator_availability").doc(auth.userId);
  const doc = await docRef.get();

  if (!doc.exists) {
    res.status(204).send();
    return;
  }

  if (!body.startUtc) {
    // Delete all slots for the day
    await docRef.update({
      [`days.${body.date}`]: admin.firestore.FieldValue.delete(),
      updated_at: admin.firestore.FieldValue.serverTimestamp(),
    });
  } else {
    // Delete specific slot
    const days = doc.data()?.days ?? {};
    const dayData = days[body.date];
    if (dayData?.slots) {
      dayData.slots = dayData.slots.filter(
        (s: { startUtc: string }) => s.startUtc !== body.startUtc
      );
      await docRef.update({
        [`days.${body.date}`]: dayData,
        updated_at: admin.firestore.FieldValue.serverTimestamp(),
      });
    }
  }

  res.status(204).send();
});

// GET /creator/bookings — list creator's bookings
router.get("/creator/bookings", async (req, res) => {
  const auth = await validateAuth(req);
  requireCreator(auth);
  await checkRateLimit(auth.userId, 200, "rate_limit_first_party");

  const { date, pageToken } = req.query as Record<string, string | undefined>;
  const limit = 20;

  let query: admin.firestore.Query = db
    .collection("call_bookings")
    .where("creatorId", "==", auth.userId)
    .orderBy("slotStartUtc", "asc")
    .limit(limit + 1);

  if (date) {
    // Filter to a specific day: slotStartUtc between day start and end
    const dayStart = `${date}T00:00:00.000Z`;
    const dayEnd = `${date}T23:59:59.999Z`;
    query = db
      .collection("call_bookings")
      .where("creatorId", "==", auth.userId)
      .where("slotStartUtc", ">=", dayStart)
      .where("slotStartUtc", "<=", dayEnd)
      .orderBy("slotStartUtc", "asc")
      .limit(limit + 1);
  }

  if (pageToken) {
    const cursor = await db.collection("call_bookings").doc(pageToken).get();
    if (cursor.exists) query = query.startAfter(cursor);
  }

  const snapshot = await query.get();
  const docs = snapshot.docs.slice(0, limit);
  const hasMore = snapshot.docs.length > limit;

  res.json({
    data: docs.map((d) => {
      const data = d.data();
      return {
        bookingId: d.id,
        clientUserId: data.clientUserId,
        clientDisplayName: data.clientDisplayName ?? null,
        slotStartUtc: data.slotStartUtc,
        slotEndUtc: data.slotEndUtc,
        status: data.status,
        callLink: data.callLink ?? null,
        courseId: data.courseId ?? null,
        createdAt: data.createdAt ?? data.created_at,
      };
    }),
    nextPageToken: hasMore ? docs[docs.length - 1].id : null,
    hasMore,
  });
});

// PATCH /creator/bookings/:bookingId — update booking (add/update call link)
router.patch("/creator/bookings/:bookingId", async (req, res) => {
  const auth = await validateAuth(req);
  requireCreator(auth);
  await checkRateLimit(auth.userId, 200, "rate_limit_first_party");

  const body = validateBody<{ callLink: string | null }>(
    { callLink: "optional_string" },
    req.body
  );

  const docRef = db.collection("call_bookings").doc(req.params.bookingId);
  const doc = await docRef.get();

  if (!doc.exists) {
    throw new WakeApiServerError("NOT_FOUND", 404, "Reserva no encontrada");
  }

  if (doc.data()?.creatorId !== auth.userId) {
    throw new WakeApiServerError("FORBIDDEN", 403, "No tienes acceso a esta reserva");
  }

  const now = new Date().toISOString();
  await docRef.update({
    callLink: body.callLink ?? null,
    updatedAt: now,
  });

  res.json({ data: { bookingId: doc.id, updatedAt: now } });
});

// ─── PWA Client Bookings (§9) ──────────────────────────────────────────────

// GET /creator/:creatorId/availability — public view of available slots
router.get("/creator/:creatorId/availability", async (req, res) => {
  const auth = await validateAuth(req);
  await checkRateLimit(auth.userId, 200, "rate_limit_first_party");

  const { startDate, endDate } = req.query as Record<string, string | undefined>;
  if (!startDate || !endDate) {
    throw new WakeApiServerError(
      "VALIDATION_ERROR",
      400,
      "startDate y endDate son requeridos",
    );
  }

  // Validate max 60 days range
  const start = new Date(startDate);
  const end = new Date(endDate);
  const diffDays = (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24);
  if (diffDays > 60 || diffDays < 0) {
    throw new WakeApiServerError(
      "VALIDATION_ERROR",
      400,
      "El rango máximo es de 60 días"
    );
  }

  const doc = await db
    .collection("creator_availability")
    .doc(req.params.creatorId)
    .get();

  if (!doc.exists) {
    throw new WakeApiServerError("NOT_FOUND", 404, "Creador no encontrado");
  }

  const data = doc.data()!;
  const allDays = data.days ?? {};
  const filteredDays: Record<
    string,
    { availableSlots: Array<{ startUtc: string; endUtc: string; durationMinutes: number }> }
  > = {};

  // Filter days within range and only unbooked slots
  for (const [dateKey, dayData] of Object.entries(allDays)) {
    if (dateKey >= startDate && dateKey <= endDate) {
      const day = dayData as { slots?: Array<{ startUtc: string; endUtc: string; durationMinutes: number; booked: boolean }> };
      const available = (day.slots ?? []).filter((s) => !s.booked);
      if (available.length > 0) {
        filteredDays[dateKey] = {
          availableSlots: available.map(({ startUtc, endUtc, durationMinutes }) => ({
            startUtc,
            endUtc,
            durationMinutes,
          })),
        };
      }
    }
  }

  res.json({
    data: {
      timezone: data.timezone ?? "America/Bogota",
      days: filteredDays,
    },
  });
});

// POST /bookings — create a booking
router.post("/bookings", async (req, res) => {
  const auth = await validateAuth(req);
  await checkRateLimit(auth.userId, 200, "rate_limit_first_party");

  const body = validateBody<{
    creatorId: string;
    courseId: string | null;
    slotStartUtc: string;
    slotEndUtc: string;
  }>(
    {
      creatorId: "string",
      courseId: "optional_string",
      slotStartUtc: "string",
      slotEndUtc: "string",
    },
    req.body
  );

  // Verify creator availability doc exists and slot is available
  const availRef = db.collection("creator_availability").doc(body.creatorId);
  const availDoc = await availRef.get();

  if (!availDoc.exists) {
    throw new WakeApiServerError("NOT_FOUND", 404, "Creador no encontrado");
  }

  const days = availDoc.data()?.days ?? {};
  // Extract date from slotStartUtc (YYYY-MM-DD)
  const slotDate = body.slotStartUtc.substring(0, 10);
  const dayData = days[slotDate];

  if (!dayData?.slots) {
    throw new WakeApiServerError("NOT_FOUND", 404, "Horario no encontrado");
  }

  const slotIndex = dayData.slots.findIndex(
    (s: { startUtc: string; endUtc: string }) =>
      s.startUtc === body.slotStartUtc && s.endUtc === body.slotEndUtc
  );

  if (slotIndex === -1) {
    throw new WakeApiServerError("NOT_FOUND", 404, "Horario no encontrado");
  }

  if (dayData.slots[slotIndex].booked) {
    throw new WakeApiServerError("CONFLICT", 409, "Este horario ya fue reservado");
  }

  // Mark slot as booked
  dayData.slots[slotIndex].booked = true;
  await availRef.update({
    [`days.${slotDate}`]: dayData,
    updated_at: admin.firestore.FieldValue.serverTimestamp(),
  });

  // Get client display name
  const userDoc = await db.collection("users").doc(auth.userId).get();
  const clientDisplayName = userDoc.data()?.displayName ?? null;

  // Create booking
  const now = new Date().toISOString();
  const bookingRef = await db.collection("call_bookings").add({
    creatorId: body.creatorId,
    clientUserId: auth.userId,
    clientDisplayName,
    courseId: body.courseId ?? null,
    slotStartUtc: body.slotStartUtc,
    slotEndUtc: body.slotEndUtc,
    status: "scheduled",
    callLink: null,
    createdAt: now,
  });

  res.status(201).json({
    data: {
      bookingId: bookingRef.id,
      status: "scheduled",
      createdAt: now,
    },
  });
});

// GET /bookings/:bookingId — get booking details
router.get("/bookings/:bookingId", async (req, res) => {
  const auth = await validateAuth(req);
  await checkRateLimit(auth.userId, 200, "rate_limit_first_party");

  const doc = await db.collection("call_bookings").doc(req.params.bookingId).get();

  if (!doc.exists) {
    throw new WakeApiServerError("NOT_FOUND", 404, "Reserva no encontrada");
  }

  const data = doc.data()!;

  // Must be either the client or the creator
  if (data.clientUserId !== auth.userId && data.creatorId !== auth.userId) {
    throw new WakeApiServerError("FORBIDDEN", 403, "No tienes acceso a esta reserva");
  }

  // Get creator display name
  const creatorDoc = await db.collection("users").doc(data.creatorId).get();
  const creatorDisplayName = creatorDoc.data()?.displayName ?? null;

  res.json({
    data: {
      bookingId: doc.id,
      creatorId: data.creatorId,
      creatorDisplayName,
      slotStartUtc: data.slotStartUtc,
      slotEndUtc: data.slotEndUtc,
      status: data.status,
      callLink: data.callLink ?? null,
      courseId: data.courseId ?? null,
    },
  });
});

// DELETE /bookings/:bookingId — cancel booking (client cancels their own)
router.delete("/bookings/:bookingId", async (req, res) => {
  const auth = await validateAuth(req);
  await checkRateLimit(auth.userId, 200, "rate_limit_first_party");

  const docRef = db.collection("call_bookings").doc(req.params.bookingId);
  const doc = await docRef.get();

  if (!doc.exists) {
    throw new WakeApiServerError("NOT_FOUND", 404, "Reserva no encontrada");
  }

  const data = doc.data()!;
  if (data.clientUserId !== auth.userId) {
    throw new WakeApiServerError("FORBIDDEN", 403, "Solo puedes cancelar tus propias reservas");
  }

  // Mark booking as cancelled
  await docRef.update({ status: "cancelled" });

  // Free up the slot in creator's availability
  const slotDate = data.slotStartUtc.substring(0, 10);
  const availRef = db.collection("creator_availability").doc(data.creatorId);
  const availDoc = await availRef.get();

  if (availDoc.exists) {
    const days = availDoc.data()?.days ?? {};
    const dayData = days[slotDate];
    if (dayData?.slots) {
      const slot = dayData.slots.find(
        (s: { startUtc: string; endUtc: string }) =>
          s.startUtc === data.slotStartUtc && s.endUtc === data.slotEndUtc
      );
      if (slot) {
        slot.booked = false;
        await availRef.update({
          [`days.${slotDate}`]: dayData,
          updated_at: admin.firestore.FieldValue.serverTimestamp(),
        });
      }
    }
  }

  res.status(204).send();
});

export default router;
