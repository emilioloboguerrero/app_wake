import {Router} from "express";
import {db, FieldValue} from "../firestore.js";
import type {Query} from "../firestore.js";
import {validateAuth, type AuthResult} from "../middleware/auth.js";
import {validateBody} from "../middleware/validate.js";
import {checkRateLimit} from "../middleware/rateLimit.js";
import {WakeApiServerError} from "../errors.js";
import * as functions from "firebase-functions";
import {
  escapeHtml,
  generateUnsubscribeToken,
  unsubscribeDocId,
  filterUnsubscribed,
} from "../services/emailHelpers.js";

const router = Router();

// ─── Helpers ──────────────────────────────────────────────────────────────

function requireCreator(auth: AuthResult): void {
  if (auth.role !== "creator" && auth.role !== "admin") {
    throw new WakeApiServerError("FORBIDDEN", 403, "Solo creadores pueden acceder a esta ruta");
  }
}

// ─── Recipient resolvers ──────────────────────────────────────────────────

interface Recipient {
  email: string;
  name: string;
  registrationId: string;
}

async function resolveEventRecipients(
  eventId: string,
  creatorId: string,
  recipientIds?: string[]
): Promise<Recipient[]> {
  // Verify creator owns this event
  const eventDoc = await db.collection("events").doc(eventId).get();
  if (!eventDoc.exists) {
    throw new WakeApiServerError("NOT_FOUND", 404, "Evento no encontrado");
  }
  const event = eventDoc.data()!;
  if (event.creator_id !== creatorId) {
    throw new WakeApiServerError("FORBIDDEN", 403, "No tienes acceso a este evento");
  }

  const regsRef = db
    .collection("event_signups")
    .doc(eventId)
    .collection("registrations");

  const recipients: Recipient[] = [];

  if (recipientIds && recipientIds.length > 0) {
    // Fetch specific registrations by ID (batch get)
    const refs = recipientIds.map((id) => regsRef.doc(id));
    const docs = await db.getAll(...refs);
    for (const doc of docs) {
      if (!doc.exists) continue;
      const data = doc.data()!;
      const email = resolveRegistrationEmail(data);
      if (email) {
        recipients.push({
          email,
          name: resolveRegistrationName(data),
          registrationId: doc.id,
        });
      }
    }
  } else {
    // Fetch all registrations, paginating in chunks so we don't drop any.
    // Ordered by __name__ (doc ID) for a stable cursor that works even when
    // multiple registrations share the same created_at value.
    const PAGE_SIZE = 500;
    let lastDoc: FirebaseFirestore.QueryDocumentSnapshot | null = null;
    let pagesFetched = 0;

    while (true) {
      let query: Query = regsRef.orderBy("__name__").limit(PAGE_SIZE);
      if (lastDoc) query = query.startAfter(lastDoc);

      const snapshot = await query.get();
      if (snapshot.empty) break;

      for (const doc of snapshot.docs) {
        const data = doc.data();
        const email = resolveRegistrationEmail(data);
        if (email) {
          recipients.push({
            email,
            name: resolveRegistrationName(data),
            registrationId: doc.id,
          });
        }
      }

      pagesFetched++;
      if (snapshot.docs.length < PAGE_SIZE) break;
      lastDoc = snapshot.docs[snapshot.docs.length - 1];
    }

    functions.logger.info("email.resolveEventRecipients: paginated fetch", {
      eventId,
      pagesFetched,
      recipientCount: recipients.length,
    });
  }

  return recipients;
}

function resolveRegistrationEmail(data: FirebaseFirestore.DocumentData): string | null {
  if (typeof data.email === "string" && data.email.includes("@")) return data.email;
  if (data.responses && typeof data.responses === "object") {
    const entry = Object.entries(data.responses as Record<string, unknown>).find(
      ([k, v]) => k.toLowerCase().includes("email") && typeof v === "string" && (v as string).includes("@")
    );
    if (entry) return entry[1] as string;
  }
  return null;
}

function resolveRegistrationName(data: FirebaseFirestore.DocumentData): string {
  if (typeof data.nombre === "string" && data.nombre) return data.nombre;
  if (typeof data.displayName === "string" && data.displayName) return data.displayName;
  if (data.responses && typeof data.responses === "object") {
    const entry = Object.entries(data.responses as Record<string, unknown>).find(
      ([k]) => k.toLowerCase().includes("nombre") || k.toLowerCase().includes("name")
    );
    if (entry && typeof entry[1] === "string") return entry[1] as string;
  }
  return "";
}

// ─── POST /creator/email/send ─────────────────────────────────────────────
// Creates an email send job. Recipients are resolved, filtered for
// unsubscribes, and written as pending. The processEmailQueue scheduled
// function picks them up and sends via Resend.

router.post("/creator/email/send", async (req, res) => {
  const auth = await validateAuth(req);
  requireCreator(auth);
  await checkRateLimit(auth.userId, 20, "rate_limit_first_party");

  const body = validateBody<{
    subject: string;
    bodyHtml: string;
    recipients: {
      type: string;
      eventId?: string;
      recipientIds?: string[];
    };
  }>(
    {
      subject: "string",
      bodyHtml: "string",
      recipients: "object",
    },
    req.body,
    {maxStringLength: 50_000}
  );

  // Validate recipients object
  const recipientsConfig = body.recipients;
  if (!recipientsConfig || typeof recipientsConfig.type !== "string") {
    throw new WakeApiServerError("VALIDATION_ERROR", 400, "recipients.type es requerido", "recipients");
  }

  // Validate recipientIds if provided
  if (recipientsConfig.recipientIds) {
    if (!Array.isArray(recipientsConfig.recipientIds)) {
      throw new WakeApiServerError("VALIDATION_ERROR", 400, "recipients.recipientIds debe ser un array", "recipients");
    }
    if (recipientsConfig.recipientIds.length > 500) {
      throw new WakeApiServerError("VALIDATION_ERROR", 400, "Máximo 500 destinatarios por envío", "recipients");
    }
  }

  // Resolve recipients based on type
  let resolved: Recipient[];
  switch (recipientsConfig.type) {
  case "event": {
    if (!recipientsConfig.eventId || typeof recipientsConfig.eventId !== "string") {
      throw new WakeApiServerError("VALIDATION_ERROR", 400, "recipients.eventId es requerido para tipo event", "recipients");
    }
    resolved = await resolveEventRecipients(
      recipientsConfig.eventId,
      auth.userId,
        recipientsConfig.recipientIds as string[] | undefined
    );
    break;
  }
  // Future types: "clients", "segment", "program"
  default:
    throw new WakeApiServerError("VALIDATION_ERROR", 400, `Tipo de destinatario no soportado: ${recipientsConfig.type}`, "recipients");
  }

  if (resolved.length === 0) {
    throw new WakeApiServerError("VALIDATION_ERROR", 400, "No se encontraron destinatarios con email válido");
  }

  // Filter unsubscribed
  const filtered = await filterUnsubscribed(resolved, auth.userId);
  if (filtered.length === 0) {
    throw new WakeApiServerError("VALIDATION_ERROR", 400, "Todos los destinatarios se han dado de baja");
  }

  // Create the email_sends document
  const sendRef = db.collection("email_sends").doc();
  const sendData = {
    creatorId: auth.userId,
    type: "event_broadcast",
    sourceType: recipientsConfig.type,
    sourceId: recipientsConfig.eventId || null,
    subject: body.subject,
    bodyHtml: body.bodyHtml,
    fromAddress: "Wake <notificaciones@wakelab.co>",
    status: "queued",
    stats: {
      total: filtered.length,
      sent: 0,
      delivered: 0,
      opened: 0,
      clicked: 0,
      bounced: 0,
      failed: 0,
    },
    createdAt: FieldValue.serverTimestamp(),
    completedAt: null,
  };

  // Write send doc + recipient docs in a batch
  // Firestore batches max 500 ops, and we have 1 send doc + N recipients
  const batches: FirebaseFirestore.WriteBatch[] = [];
  let currentBatch = db.batch();
  let opsInBatch = 0;

  currentBatch.set(sendRef, sendData);
  opsInBatch++;

  for (const recipient of filtered) {
    if (opsInBatch >= 499) {
      batches.push(currentBatch);
      currentBatch = db.batch();
      opsInBatch = 0;
    }

    const recipientRef = sendRef.collection("recipients").doc();
    currentBatch.set(recipientRef, {
      email: recipient.email,
      name: recipient.name,
      sourceRecordId: recipient.registrationId,
      status: "pending",
      sentAt: null,
      deliveredAt: null,
      openedAt: null,
      clickedAt: null,
      error: null,
      // Retry tracking — consumed by processEmailQueue
      attemptCount: 0,
      nextRetryAt: null, // null = ready immediately for first attempt
      lastError: null,
    });
    opsInBatch++;
  }
  batches.push(currentBatch);

  await Promise.all(batches.map((b) => b.commit()));

  functions.logger.info("email.send: queued", {
    sendId: sendRef.id,
    creatorId: auth.userId,
    recipientCount: filtered.length,
    sourceType: recipientsConfig.type,
  });

  res.status(201).json({
    data: {
      sendId: sendRef.id,
      recipientCount: filtered.length,
      status: "queued",
    },
  });
});

// ─── GET /creator/email/sends ─────────────────────────────────────────────
// List past email sends for the authenticated creator, paginated.

router.get("/creator/email/sends", async (req, res) => {
  const auth = await validateAuth(req);
  requireCreator(auth);
  await checkRateLimit(auth.userId, 200, "rate_limit_first_party");

  const pageToken = req.query.pageToken as string | undefined;
  const limit = 20;

  let query: Query = db
    .collection("email_sends")
    .where("creatorId", "==", auth.userId)
    .orderBy("createdAt", "desc")
    .limit(limit + 1);

  if (pageToken) {
    const cursor = await db.collection("email_sends").doc(pageToken).get();
    if (cursor.exists) query = query.startAfter(cursor);
  }

  const snapshot = await query.get();
  const docs = snapshot.docs.slice(0, limit);
  const hasMore = snapshot.docs.length > limit;

  res.json({
    data: docs.map((d) => {
      const data = d.data();
      return {
        sendId: d.id,
        type: data.type,
        sourceType: data.sourceType,
        sourceId: data.sourceId,
        subject: data.subject,
        status: data.status,
        stats: data.stats,
        createdAt: data.createdAt,
        completedAt: data.completedAt,
      };
    }),
    nextPageToken: hasMore ? docs[docs.length - 1].id : null,
    hasMore,
  });
});

// ─── GET /creator/email/sends/:sendId ─────────────────────────────────────
// Detailed view of a single email send, including per-recipient status.

router.get("/creator/email/sends/:sendId", async (req, res) => {
  const auth = await validateAuth(req);
  requireCreator(auth);
  await checkRateLimit(auth.userId, 200, "rate_limit_first_party");

  const sendDoc = await db.collection("email_sends").doc(req.params.sendId).get();
  if (!sendDoc.exists) {
    throw new WakeApiServerError("NOT_FOUND", 404, "Envío no encontrado");
  }
  const sendData = sendDoc.data()!;
  if (sendData.creatorId !== auth.userId) {
    throw new WakeApiServerError("FORBIDDEN", 403, "No tienes acceso a este envío");
  }

  // Fetch recipients (paginated)
  const recipientPageToken = req.query.recipientPageToken as string | undefined;
  const recipientLimit = 50;

  let recipientQuery: Query = sendDoc.ref
    .collection("recipients")
    .orderBy("email")
    .limit(recipientLimit + 1);

  if (recipientPageToken) {
    const cursor = await sendDoc.ref.collection("recipients").doc(recipientPageToken).get();
    if (cursor.exists) recipientQuery = recipientQuery.startAfter(cursor);
  }

  const recipientSnapshot = await recipientQuery.get();
  const recipientDocs = recipientSnapshot.docs.slice(0, recipientLimit);
  const hasMoreRecipients = recipientSnapshot.docs.length > recipientLimit;

  res.json({
    data: {
      sendId: sendDoc.id,
      type: sendData.type,
      sourceType: sendData.sourceType,
      sourceId: sendData.sourceId,
      subject: sendData.subject,
      status: sendData.status,
      stats: sendData.stats,
      createdAt: sendData.createdAt,
      completedAt: sendData.completedAt,
      recipients: recipientDocs.map((d) => {
        const data = d.data();
        return {
          recipientId: d.id,
          email: data.email,
          name: data.name,
          status: data.status,
          sentAt: data.sentAt,
          error: data.error,
        };
      }),
      recipientNextPageToken: hasMoreRecipients ? recipientDocs[recipientDocs.length - 1].id : null,
      hasMoreRecipients,
    },
  });
});

// ─── GET /email/unsubscribe ───────────────────────────────────────────────
// Public endpoint — no auth required. Handles one-click unsubscribe via
// link in email footer. Token is SHA-256(email:creatorId).

router.get("/email/unsubscribe", async (req, res) => {
  const {token, email, creatorId} = req.query as Record<string, string | undefined>;

  if (!token || !email || !creatorId) {
    res.status(400).send(unsubscribePageHtml("Enlace inválido", false));
    return;
  }

  // Verify token matches
  const expectedToken = generateUnsubscribeToken(email, creatorId);
  if (token !== expectedToken) {
    res.status(400).send(unsubscribePageHtml("Enlace inválido", false));
    return;
  }

  // Write unsubscribe record
  const docId = unsubscribeDocId(email, creatorId);
  await db.collection("email_unsubscribes").doc(docId).set(
    {
      email,
      creatorId,
      unsubscribedAt: FieldValue.serverTimestamp(),
      source: "link",
    },
    {merge: true}
  );

  functions.logger.info("email.unsubscribe", {email, creatorId});

  res.status(200).send(unsubscribePageHtml("Te has dado de baja correctamente", true));
});

function unsubscribePageHtml(message: string, success: boolean): string {
  const color = success ? "rgba(255,255,255,0.78)" : "rgba(255,100,100,0.78)";
  return `<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Cancelar suscripción</title></head>
<body style="margin:0;padding:0;background:#1a1a1a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#fff;display:flex;align-items:center;justify-content:center;min-height:100vh;">
  <div style="text-align:center;padding:40px;">
    <p style="font-size:0.7rem;letter-spacing:0.14em;text-transform:uppercase;color:rgba(255,255,255,0.5);margin:0 0 16px;">Wake</p>
    <h1 style="font-size:1.5rem;font-weight:700;color:${color};margin:0 0 12px;">${escapeHtml(message)}</h1>
    <p style="font-size:0.9rem;color:rgba(255,255,255,0.45);margin:0;">No recibirás más correos de este creador.</p>
  </div>
</body>
</html>`;
}

export default router;
