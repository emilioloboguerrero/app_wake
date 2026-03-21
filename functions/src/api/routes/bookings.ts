import { Router } from "express";
import { db, FieldValue } from "../firestore.js";
import type { Query } from "../firestore.js";
import { validateAuth } from "../middleware/auth.js";
import { validateBody, validateDateFormat } from "../middleware/validate.js";
import { checkRateLimit } from "../middleware/rateLimit.js";
import { WakeApiServerError } from "../errors.js";

const router = Router();

function requireCreator(auth: { role: string }): void {
  if (auth.role !== "creator" && auth.role !== "admin") {
    throw new WakeApiServerError("FORBIDDEN", 403, "Acceso restringido a creadores");
  }
}

const TIME_RE = /^\d{2}:\d{2}$/;

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

  // Validate date format
  validateDateFormat(body.date, "date");

  // Validate time format HH:MM
  if (!TIME_RE.test(body.startTime)) {
    throw new WakeApiServerError("VALIDATION_ERROR", 400, "startTime debe tener formato HH:MM", "startTime");
  }
  if (!TIME_RE.test(body.endTime)) {
    throw new WakeApiServerError("VALIDATION_ERROR", 400, "endTime debe tener formato HH:MM", "endTime");
  }

  // Enforce minimum duration >= 15 minutes
  if (body.durationMinutes < 15) {
    throw new WakeApiServerError(
      "VALIDATION_ERROR", 400,
      "La duración mínima es de 15 minutos", "durationMinutes"
    );
  }

  // Parse start/end into minutes since midnight
  const [startH, startM] = body.startTime.split(":").map(Number);
  const [endH, endM] = body.endTime.split(":").map(Number);
  const startMinutes = startH * 60 + startM;
  const endMinutes = endH * 60 + endM;

  if (endMinutes <= startMinutes) {
    throw new WakeApiServerError(
      "VALIDATION_ERROR",
      400,
      "Rango de tiempo inválido"
    );
  }

  // Generate slots — cap at 100 per day
  const slots: Array<{
    startLocal: string;
    endLocal: string;
    durationMinutes: number;
    booked: boolean;
  }> = [];

  let cursor = startMinutes;
  while (cursor + body.durationMinutes <= endMinutes) {
    if (slots.length >= 100) {
      throw new WakeApiServerError(
        "VALIDATION_ERROR", 400,
        "Máximo 100 slots por día"
      );
    }

    const slotStartH = Math.floor(cursor / 60);
    const slotStartM = cursor % 60;
    const slotEndCursor = cursor + body.durationMinutes;
    const slotEndH = Math.floor(slotEndCursor / 60);
    const slotEndM = slotEndCursor % 60;

    const startLocal = `${body.date}T${String(slotStartH).padStart(2, "0")}:${String(slotStartM).padStart(2, "0")}:00.000Z`;
    const endLocal = `${body.date}T${String(slotEndH).padStart(2, "0")}:${String(slotEndM).padStart(2, "0")}:00.000Z`;

    slots.push({
      startLocal,
      endLocal,
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
      updated_at: FieldValue.serverTimestamp(),
    });
  } else {
    await docRef.set({
      timezone: body.timezone,
      days: {
        [body.date]: { slots },
      },
      updated_at: FieldValue.serverTimestamp(),
    });
  }

  res.json({ data: { date: body.date, slotsCreated: slots.length } });
});

// DELETE /creator/availability/slots — remove slots for a day (or specific slot)
router.delete("/creator/availability/slots", async (req, res) => {
  const auth = await validateAuth(req);
  requireCreator(auth);
  await checkRateLimit(auth.userId, 200, "rate_limit_first_party");

  const body = validateBody<{ date: string; startLocal: string | null }>(
    { date: "string", startLocal: "optional_string" },
    req.body
  );

  const docRef = db.collection("creator_availability").doc(auth.userId);
  const doc = await docRef.get();

  if (!doc.exists) {
    res.status(204).send();
    return;
  }

  if (!body.startLocal) {
    // Delete all slots for the day
    await docRef.update({
      [`days.${body.date}`]: FieldValue.delete(),
      updated_at: FieldValue.serverTimestamp(),
    });
  } else {
    // Delete specific slot
    const days = doc.data()?.days ?? {};
    const dayData = days[body.date];
    if (dayData?.slots) {
      dayData.slots = dayData.slots.filter(
        (s: { startLocal?: string; startUtc?: string }) => (s.startLocal ?? s.startUtc) !== body.startLocal
      );
      await docRef.update({
        [`days.${body.date}`]: dayData,
        updated_at: FieldValue.serverTimestamp(),
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

  let query: Query = db
    .collection("call_bookings")
    .where("creatorId", "==", auth.userId)
    .orderBy("slotStartUtc", "asc")
    .limit(limit + 1);

  if (date) {
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

  // Validate date formats
  validateDateFormat(startDate, "startDate");
  validateDateFormat(endDate, "endDate");

  // Validate max 60 days range
  const start = new Date(startDate);
  const end = new Date(endDate);
  if (isNaN(start.getTime()) || isNaN(end.getTime())) {
    throw new WakeApiServerError("VALIDATION_ERROR", 400, "Fechas inválidas");
  }
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

  for (const [dateKey, dayData] of Object.entries(allDays)) {
    if (dateKey >= startDate && dateKey <= endDate) {
      const day = dayData as { slots?: Array<{ startUtc?: string; startLocal?: string; endUtc?: string; endLocal?: string; durationMinutes: number; booked: boolean }> };
      const available = (day.slots ?? []).filter((s) => !s.booked);
      if (available.length > 0) {
        filteredDays[dateKey] = {
          availableSlots: available.map((s) => ({
            startUtc: s.startUtc ?? s.startLocal ?? "",
            endUtc: s.endUtc ?? s.endLocal ?? "",
            durationMinutes: s.durationMinutes,
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

// POST /bookings — create a booking (uses Firestore transaction)
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

  const slotDate = body.slotStartUtc.substring(0, 10);

  // Use a transaction to atomically check and mark the slot as booked
  const availRef = db.collection("creator_availability").doc(body.creatorId);

  const bookingId = await db.runTransaction(async (tx) => {
    const availDoc = await tx.get(availRef);

    if (!availDoc.exists) {
      throw new WakeApiServerError("NOT_FOUND", 404, "Creador no encontrado");
    }

    const days = availDoc.data()?.days ?? {};
    const dayData = days[slotDate];

    if (!dayData?.slots) {
      throw new WakeApiServerError("NOT_FOUND", 404, "Horario no encontrado");
    }

    const slotIndex = dayData.slots.findIndex(
      (s: { startUtc?: string; startLocal?: string; endUtc?: string; endLocal?: string }) =>
        (s.startUtc ?? s.startLocal) === body.slotStartUtc && (s.endUtc ?? s.endLocal) === body.slotEndUtc
    );

    if (slotIndex === -1) {
      throw new WakeApiServerError("NOT_FOUND", 404, "Horario no encontrado");
    }

    if (dayData.slots[slotIndex].booked) {
      throw new WakeApiServerError("CONFLICT", 409, "Este horario ya fue reservado");
    }

    // Mark slot as booked within transaction
    dayData.slots[slotIndex].booked = true;
    tx.update(availRef, {
      [`days.${slotDate}`]: dayData,
      updated_at: FieldValue.serverTimestamp(),
    });

    // Create booking within transaction
    const bookingRef = db.collection("call_bookings").doc();
    tx.set(bookingRef, {
      creatorId: body.creatorId,
      clientUserId: auth.userId,
      clientDisplayName: null, // Will be set after transaction
      courseId: body.courseId ?? null,
      slotStartUtc: body.slotStartUtc,
      slotEndUtc: body.slotEndUtc,
      status: "scheduled",
      callLink: null,
      createdAt: new Date().toISOString(),
    });

    return bookingRef.id;
  });

  // Update client display name (non-blocking, outside transaction)
  const userDoc = await db.collection("users").doc(auth.userId).get();
  const clientDisplayName = userDoc.data()?.displayName ?? null;
  if (clientDisplayName) {
    db.collection("call_bookings").doc(bookingId).update({ clientDisplayName }).catch(() => {});
  }

  res.status(201).json({
    data: {
      bookingId,
      status: "scheduled",
      createdAt: new Date().toISOString(),
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

  if (data.clientUserId !== auth.userId && data.creatorId !== auth.userId) {
    throw new WakeApiServerError("FORBIDDEN", 403, "No tienes acceso a esta reserva");
  }

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

  // Only allow cancellation of scheduled bookings
  if (data.status !== "scheduled") {
    throw new WakeApiServerError("CONFLICT", 409, "Solo se pueden cancelar reservas en estado 'scheduled'");
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
        (s: { startUtc?: string; startLocal?: string; endUtc?: string; endLocal?: string }) =>
          (s.startUtc ?? s.startLocal) === data.slotStartUtc && (s.endUtc ?? s.endLocal) === data.slotEndUtc
      );
      if (slot) {
        slot.booked = false;
        await availRef.update({
          [`days.${slotDate}`]: dayData,
          updated_at: FieldValue.serverTimestamp(),
        });
      }
    }
  }

  res.status(204).send();
});

export default router;
