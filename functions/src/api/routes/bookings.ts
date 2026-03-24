import { Router } from "express";
import * as functions from "firebase-functions";
import { Resend } from "resend";
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
const VALID_DURATIONS = new Set([15, 30, 45, 60]);

// ─── Email helpers ──────────────────────────────────────────────────────────

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatDateTimeColombia(isoUtc: string): string {
  const d = new Date(isoUtc);
  return d.toLocaleString("es-CO", {
    timeZone: "America/Bogota",
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

function buildCallEmailHtml(params: {
  greeting: string;
  bodyText: string;
  callLink?: string;
  dateTimeStr: string;
  ctaLabel?: string;
}): string {
  const { greeting, bodyText, callLink, dateTimeStr, ctaLabel } = params;
  const ctaButton = callLink
    ? `<a href="${escapeHtml(callLink)}" style="display:inline-block;margin-top:20px;padding:14px 32px;background:rgba(255,255,255,0.12);color:#fff;font-size:0.95rem;font-weight:600;text-decoration:none;border-radius:10px;border:1px solid rgba(255,255,255,0.15);">${escapeHtml(ctaLabel || "Unirse a la llamada")}</a>`
    : "";

  return `<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#1a1a1a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#fff;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#1a1a1a;padding:40px 0;">
    <tr><td align="center">
      <table width="480" cellpadding="0" cellspacing="0" style="max-width:480px;border-radius:18px;overflow:hidden;border:1px solid rgba(255,255,255,0.08);">
        <tr>
          <td style="background:#1a1a1a;padding:52px 36px 44px;text-align:center;">
            <p style="margin:0 0 18px;font-size:0.7rem;letter-spacing:0.14em;text-transform:uppercase;color:rgba(255,255,255,0.5);">Wake Coaching</p>
            <h1 style="margin:0 0 10px;font-size:1.75rem;font-weight:800;color:#fff;line-height:1.2;">${escapeHtml(greeting)}</h1>
            <p style="margin:0;font-size:1rem;color:rgba(255,255,255,0.78);line-height:1.55;">${escapeHtml(bodyText)}</p>
          </td>
        </tr>
        <tr><td style="background:#1e1e1e;padding:32px 36px 28px;text-align:center;">
          <div style="background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.09);border-radius:14px;padding:18px 24px;margin-bottom:${callLink ? "24px" : "0"};">
            <p style="margin:0 0 4px;font-size:0.7rem;text-transform:uppercase;letter-spacing:0.1em;color:rgba(255,255,255,0.35);">Fecha y hora</p>
            <p style="margin:0;font-size:1.1rem;font-weight:700;color:#fff;">${escapeHtml(dateTimeStr)}</p>
          </div>
          ${ctaButton}
        </td></tr>
        <tr><td style="background:#1e1e1e;padding:16px 36px 28px;text-align:center;border-top:1px solid rgba(255,255,255,0.06);">
          <p style="margin:0;font-size:0.75rem;color:rgba(255,255,255,0.22);">Enviado automáticamente por Wake · <a href="https://wakelab.co" style="color:rgba(255,255,255,0.22);text-decoration:none;">wakelab.co</a></p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

async function sendCallEmail(to: string, subject: string, html: string): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    functions.logger.warn("sendCallEmail: RESEND_API_KEY not available, skipping");
    return;
  }
  try {
    const resend = new Resend(apiKey);
    const { error } = await resend.emails.send({
      from: "Wake Coaching <coaching@wakelab.co>",
      to,
      subject,
      html,
      headers: {
        "List-Unsubscribe": "<mailto:soporte@wakelab.co?subject=unsubscribe>",
      },
    });
    if (error) {
      functions.logger.error("sendCallEmail: resend error", { to, subject, error });
    }
  } catch (err) {
    functions.logger.error("sendCallEmail: failed", { to, subject, error: String(err) });
  }
}

async function sendBookingConfirmationEmails(
  bookingId: string,
  clientUserId: string,
  creatorId: string,
  slotStartUtc: string,
  callLink: string
): Promise<void> {
  const [clientDoc, creatorDoc] = await Promise.all([
    db.collection("users").doc(clientUserId).get(),
    db.collection("users").doc(creatorId).get(),
  ]);
  const clientEmail = clientDoc.data()?.email;
  const clientName = clientDoc.data()?.displayName || "Cliente";
  const creatorEmail = creatorDoc.data()?.email;
  const creatorName = creatorDoc.data()?.displayName || "Coach";
  const dateTimeStr = formatDateTimeColombia(slotStartUtc);

  if (clientEmail) {
    const html = buildCallEmailHtml({
      greeting: `¡Hola, ${clientName.split(" ")[0]}!`,
      bodyText: `Tu llamada con ${creatorName} está confirmada.`,
      callLink,
      dateTimeStr,
    });
    sendCallEmail(clientEmail, "Tu llamada está confirmada", html).catch(() => {});
  }

  if (creatorEmail) {
    const html = buildCallEmailHtml({
      greeting: `¡Hola, ${creatorName.split(" ")[0]}!`,
      bodyText: `${clientName} agendó una llamada contigo.`,
      callLink,
      dateTimeStr,
    });
    sendCallEmail(creatorEmail, "Nueva llamada agendada", html).catch(() => {});
  }
}

async function sendCancellationEmail(
  recipientUserId: string,
  cancelledByName: string,
  slotStartUtc: string,
  isCancelledByCreator: boolean
): Promise<void> {
  const recipientDoc = await db.collection("users").doc(recipientUserId).get();
  const recipientEmail = recipientDoc.data()?.email;
  const recipientName = recipientDoc.data()?.displayName || "";
  if (!recipientEmail) return;

  const dateTimeStr = formatDateTimeColombia(slotStartUtc);
  const bodyText = isCancelledByCreator
    ? `${cancelledByName} canceló la llamada programada.`
    : `${cancelledByName} canceló su llamada.`;

  const html = buildCallEmailHtml({
    greeting: recipientName ? `Hola, ${recipientName.split(" ")[0]}` : "Hola",
    bodyText,
    dateTimeStr,
  });
  sendCallEmail(recipientEmail, "Llamada cancelada", html).catch(() => {});
}

function freeSlotInAvailability(
  creatorId: string,
  slotStartUtc: string,
  slotEndUtc: string
): void {
  const slotDate = slotStartUtc.substring(0, 10);
  const availRef = db.collection("creator_availability").doc(creatorId);

  availRef.get().then((availDoc) => {
    if (!availDoc.exists) return;
    const days = availDoc.data()?.days ?? {};
    const dayData = days[slotDate];
    if (!dayData?.slots) return;
    const slot = dayData.slots.find(
      (s: { startUtc?: string; startLocal?: string; endUtc?: string; endLocal?: string }) =>
        (s.startUtc ?? s.startLocal) === slotStartUtc && (s.endUtc ?? s.endLocal) === slotEndUtc
    );
    if (slot) {
      slot.booked = false;
      availRef.update({
        [`days.${slotDate}`]: dayData,
        updated_at: FieldValue.serverTimestamp(),
      }).catch((e) => functions.logger.error("freeSlotInAvailability: update failed", { error: String(e) }));
    }
  }).catch((e) => functions.logger.error("freeSlotInAvailability: get failed", { error: String(e) }));
}

// ─── Creator Availability & Bookings (§7.7) ────────────────────────────────

// GET /creator/availability — get creator's availability slots + template
router.get("/creator/availability", async (req, res) => {
  const auth = await validateAuth(req);
  requireCreator(auth);
  await checkRateLimit(auth.userId, 200, "rate_limit_first_party");

  const doc = await db.collection("creator_availability").doc(auth.userId).get();
  if (!doc.exists) {
    res.json({
      data: {
        timezone: "America/Bogota",
        days: {},
        weeklyTemplate: {},
        disabledDates: [],
        defaultSlotDuration: 45,
      },
    });
    return;
  }

  const data = doc.data()!;
  res.json({
    data: {
      timezone: data.timezone ?? "America/Bogota",
      days: data.days ?? {},
      weeklyTemplate: data.weeklyTemplate ?? {},
      disabledDates: data.disabledDates ?? [],
      defaultSlotDuration: data.defaultSlotDuration ?? 45,
    },
  });
});

// PUT /creator/availability/template — save weekly recurring template
router.put("/creator/availability/template", async (req, res) => {
  const auth = await validateAuth(req);
  requireCreator(auth);
  await checkRateLimit(auth.userId, 200, "rate_limit_first_party");

  const body = validateBody<{
    weeklyTemplate: Record<string, Array<{ startTime: string; durationMinutes: number }>>;
    disabledDates: string[];
    defaultSlotDuration: number;
    timezone: string;
  }>(
    {
      weeklyTemplate: "object",
      disabledDates: "array",
      defaultSlotDuration: "number",
      timezone: "string",
    },
    req.body
  );

  // Validate defaultSlotDuration
  if (!VALID_DURATIONS.has(body.defaultSlotDuration)) {
    throw new WakeApiServerError("VALIDATION_ERROR", 400, "Duración debe ser 15, 30, 45 o 60", "defaultSlotDuration");
  }

  // Validate weeklyTemplate
  const validDays = new Set(["1", "2", "3", "4", "5", "6", "7"]);
  const cleanTemplate: Record<string, Array<{ startTime: string; durationMinutes: number }>> = {};

  for (const [dayKey, slots] of Object.entries(body.weeklyTemplate)) {
    if (!validDays.has(dayKey)) {
      throw new WakeApiServerError("VALIDATION_ERROR", 400, `Día inválido: ${dayKey}. Usa 1-7 (Lun-Dom)`, "weeklyTemplate");
    }
    if (!Array.isArray(slots)) {
      throw new WakeApiServerError("VALIDATION_ERROR", 400, `Los slots del día ${dayKey} deben ser un array`, "weeklyTemplate");
    }
    if (slots.length > 20) {
      throw new WakeApiServerError("VALIDATION_ERROR", 400, `Máximo 20 franjas por día`, "weeklyTemplate");
    }

    const daySlots: Array<{ startTime: string; durationMinutes: number }> = [];
    for (const slot of slots) {
      if (!slot || typeof slot !== "object") {
        throw new WakeApiServerError("VALIDATION_ERROR", 400, "Formato de franja inválido", "weeklyTemplate");
      }
      if (!TIME_RE.test(slot.startTime)) {
        throw new WakeApiServerError("VALIDATION_ERROR", 400, `startTime inválido: ${slot.startTime}`, "weeklyTemplate");
      }
      if (!VALID_DURATIONS.has(slot.durationMinutes)) {
        throw new WakeApiServerError("VALIDATION_ERROR", 400, "Duración debe ser 15, 30, 45 o 60", "weeklyTemplate");
      }
      daySlots.push({ startTime: slot.startTime, durationMinutes: slot.durationMinutes });
    }

    // Check for overlaps within the same day
    const sorted = [...daySlots].sort((a, b) => a.startTime.localeCompare(b.startTime));
    for (let i = 1; i < sorted.length; i++) {
      const prev = sorted[i - 1];
      const curr = sorted[i];
      const [ph, pm] = prev.startTime.split(":").map(Number);
      const prevEnd = ph * 60 + pm + prev.durationMinutes;
      const [ch, cm] = curr.startTime.split(":").map(Number);
      const currStart = ch * 60 + cm;
      if (prevEnd > currStart) {
        throw new WakeApiServerError("VALIDATION_ERROR", 400, `Franjas se superponen en día ${dayKey}`, "weeklyTemplate");
      }
    }

    if (daySlots.length > 0) {
      cleanTemplate[dayKey] = daySlots;
    }
  }

  // Validate disabledDates
  if (body.disabledDates.length > 90) {
    throw new WakeApiServerError("VALIDATION_ERROR", 400, "Máximo 90 fechas bloqueadas", "disabledDates");
  }
  const cleanDates: string[] = [];
  for (const d of body.disabledDates) {
    if (typeof d !== "string") continue;
    validateDateFormat(d, "disabledDates");
    cleanDates.push(d);
  }

  const docRef = db.collection("creator_availability").doc(auth.userId);
  await docRef.set(
    {
      weeklyTemplate: cleanTemplate,
      disabledDates: cleanDates,
      defaultSlotDuration: body.defaultSlotDuration,
      timezone: body.timezone,
      updated_at: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  res.json({ data: { saved: true } });
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
    startUtc: string;
    endUtc: string;
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

  const body = validateBody<{ date: string; slotStartUtc: string | null }>(
    { date: "string", slotStartUtc: "optional_string" },
    req.body
  );

  const docRef = db.collection("creator_availability").doc(auth.userId);
  const doc = await docRef.get();

  if (!doc.exists) {
    res.status(204).send();
    return;
  }

  if (!body.slotStartUtc) {
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
        (s: { startUtc?: string; startLocal?: string }) => (s.startUtc ?? s.startLocal) !== body.slotStartUtc
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
      const startMs = new Date(data.slotStartUtc).getTime();
      const endMs = new Date(data.slotEndUtc).getTime();
      const durationMinutes = Math.round((endMs - startMs) / 60000);
      return {
        bookingId: d.id,
        clientUserId: data.clientUserId,
        clientDisplayName: data.clientDisplayName ?? null,
        slotStartUtc: data.slotStartUtc,
        slotEndUtc: data.slotEndUtc,
        durationMinutes,
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

// DELETE /creator/bookings/:bookingId — creator cancels a booking
router.delete("/creator/bookings/:bookingId", async (req, res) => {
  const auth = await validateAuth(req);
  requireCreator(auth);
  await checkRateLimit(auth.userId, 200, "rate_limit_first_party");

  const docRef = db.collection("call_bookings").doc(req.params.bookingId);
  const doc = await docRef.get();

  if (!doc.exists) {
    throw new WakeApiServerError("NOT_FOUND", 404, "Reserva no encontrada");
  }

  const data = doc.data()!;
  if (data.creatorId !== auth.userId) {
    throw new WakeApiServerError("FORBIDDEN", 403, "No tienes acceso a esta reserva");
  }

  if (data.status !== "scheduled") {
    throw new WakeApiServerError("CONFLICT", 409, "Solo se pueden cancelar reservas en estado 'scheduled'");
  }

  await docRef.update({
    status: "cancelled_by_creator",
    cancelledAt: new Date().toISOString(),
  });

  // Free slot and send cancellation email (non-blocking)
  freeSlotInAvailability(data.creatorId, data.slotStartUtc, data.slotEndUtc);

  const creatorDoc = await db.collection("users").doc(auth.userId).get();
  const creatorName = creatorDoc.data()?.displayName || "Tu coach";
  sendCancellationEmail(data.clientUserId, creatorName, data.slotStartUtc, true).catch(() => {});

  res.status(204).send();
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

    // Create booking within transaction — auto-generate Jitsi link
    const bookingRef = db.collection("call_bookings").doc();
    tx.set(bookingRef, {
      creatorId: body.creatorId,
      clientUserId: auth.userId,
      clientDisplayName: null,
      courseId: body.courseId ?? null,
      slotStartUtc: body.slotStartUtc,
      slotEndUtc: body.slotEndUtc,
      status: "scheduled",
      callLink: `https://meet.jit.si/wake-${bookingRef.id}`,
      reminderSent24h: false,
      reminderSent1h: false,
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

  // Send confirmation emails (non-blocking)
  const callLink = `https://meet.jit.si/wake-${bookingId}`;
  sendBookingConfirmationEmails(bookingId, auth.userId, body.creatorId, body.slotStartUtc, callLink).catch(() => {});

  res.status(201).json({
    data: {
      bookingId,
      callLink,
      status: "scheduled",
      createdAt: new Date().toISOString(),
    },
  });
});

// GET /bookings — list user's bookings (with optional filters)
router.get("/bookings", async (req, res) => {
  const auth = await validateAuth(req);
  await checkRateLimit(auth.userId, 200, "rate_limit_first_party");

  const { creatorId, courseId, status } = req.query as Record<string, string | undefined>;

  // Query bookings where user is client OR creator
  let query: Query = db
    .collection("call_bookings")
    .where("clientUserId", "==", auth.userId)
    .orderBy("slotStartUtc", "desc")
    .limit(50);

  const snapshot = await query.get();

  let results = snapshot.docs.map((d) => {
    const data = d.data();
    return {
      bookingId: d.id,
      creatorId: data.creatorId,
      clientUserId: data.clientUserId,
      clientDisplayName: data.clientDisplayName ?? null,
      courseId: data.courseId ?? null,
      slotStartUtc: data.slotStartUtc,
      slotEndUtc: data.slotEndUtc,
      status: data.status,
      callLink: data.callLink ?? null,
      createdAt: data.createdAt ?? data.created_at,
    };
  });

  // Client-side filters (Firestore can only have one inequality/range)
  if (creatorId) results = results.filter((b) => b.creatorId === creatorId);
  if (courseId) results = results.filter((b) => b.courseId === courseId);
  if (status) results = results.filter((b) => b.status === status);

  res.json({ data: results });
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

  // Free slot (non-blocking)
  freeSlotInAvailability(data.creatorId, data.slotStartUtc, data.slotEndUtc);

  // Send cancellation email to creator (non-blocking)
  const clientDoc = await db.collection("users").doc(auth.userId).get();
  const clientName = clientDoc.data()?.displayName || "Un cliente";
  sendCancellationEmail(data.creatorId, clientName, data.slotStartUtc, false).catch(() => {});

  res.status(204).send();
});

export default router;
