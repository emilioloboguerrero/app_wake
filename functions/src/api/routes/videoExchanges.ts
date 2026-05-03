import {Router} from "express";
import * as admin from "firebase-admin";
import {db, FieldValue} from "../firestore.js";
import {validateAuth} from "../middleware/auth.js";
import {checkRateLimit} from "../middleware/rateLimit.js";
import {validateBody, validateStoragePath} from "../middleware/validate.js";
import {assertTextLength, TEXT_CAP_NOTE} from "../middleware/securityHelpers.js";
import {WakeApiServerError} from "../errors.js";
import {applyLongCacheControl} from "../services/storageMetadata.js";

const router = Router();

// ─── Helpers ──────────────────────────────────────────────────────────────

async function validateAuthAndRateLimit(req: Parameters<typeof validateAuth>[0], limit = 200) {
  const auth = await validateAuth(req);
  await checkRateLimit(auth.userId, limit, "rate_limit_first_party");
  return auth;
}

/** Verify the caller is a participant of the exchange and return the exchange data. */
async function getExchangeOrThrow(exchangeId: string, userId: string) {
  const doc = await db.collection("video_exchanges").doc(exchangeId).get();
  if (!doc.exists) {
    throw new WakeApiServerError("NOT_FOUND", 404, "Intercambio no encontrado");
  }
  const data = doc.data()!;
  if (data.creatorId !== userId && data.clientId !== userId) {
    throw new WakeApiServerError("NOT_FOUND", 404, "Intercambio no encontrado");
  }
  return {id: doc.id, ...data} as { id: string; creatorId: string; clientId: string; status: string; [key: string]: unknown };
}

function senderRole(userId: string, exchange: Record<string, unknown>): "creator" | "client" {
  return userId === exchange.creatorId ? "creator" : "client";
}

// ─── POST /video-exchanges — Create thread ────────────────────────────────

router.post("/video-exchanges", async (req, res) => {
  const auth = await validateAuthAndRateLimit(req, 50);

  const body = validateBody<{
    clientId: string;
    oneOnOneClientId: string;
    exerciseKey?: string;
    exerciseName?: string;
    initialMessage?: Record<string, unknown>;
  }>(
    {
      clientId: "string",
      oneOnOneClientId: "string",
      exerciseKey: "optional_string",
      exerciseName: "optional_string",
      initialMessage: "optional_object",
    },
    req.body
  );

  // Verify the one_on_one_clients relationship exists and caller is part of it
  const ooDoc = await db.collection("one_on_one_clients").doc(body.oneOnOneClientId).get();
  if (!ooDoc.exists) {
    throw new WakeApiServerError("NOT_FOUND", 404, "Relacion de asesoria no encontrada");
  }
  const oo = ooDoc.data()!;

  let callerRole: "creator" | "client";
  if (oo.creatorId === auth.userId) {
    callerRole = "creator";
    if (oo.clientUserId !== body.clientId) {
      throw new WakeApiServerError("VALIDATION_ERROR", 400, "clientId no coincide con la asesoria", "clientId");
    }
  } else if (oo.clientUserId === auth.userId) {
    callerRole = "client";
    if (auth.userId !== body.clientId) {
      throw new WakeApiServerError("VALIDATION_ERROR", 400, "clientId debe ser tu propio userId", "clientId");
    }
  } else {
    throw new WakeApiServerError("FORBIDDEN", 403, "No tienes acceso a esta asesoria");
  }

  // Validate initialMessage shape if present
  let msgData: Record<string, unknown> | null = null;
  if (body.initialMessage) {
    const im = body.initialMessage;
    const note = typeof im.note === "string" ? im.note : "";
    const videoPath = typeof im.videoPath === "string" ? im.videoPath : null;
    const thumbnailPath = typeof im.thumbnailPath === "string" ? im.thumbnailPath : null;
    const videoDurationSec = typeof im.videoDurationSec === "number" && Number.isFinite(im.videoDurationSec) ?
      im.videoDurationSec :
      null;

    if (!note && !videoPath) {
      throw new WakeApiServerError(
        "VALIDATION_ERROR", 400,
        "initialMessage debe incluir un texto o un video",
        "initialMessage"
      );
    }

    if (videoDurationSec !== null) {
      const maxDuration = callerRole === "client" ? 120 : 300;
      if (videoDurationSec > maxDuration) {
        throw new WakeApiServerError(
          "VALIDATION_ERROR", 400,
          `La duracion maxima del video es ${maxDuration} segundos`,
          "initialMessage.videoDurationSec"
        );
      }
    }

    msgData = {
      senderId: auth.userId,
      senderRole: callerRole,
      note,
      videoPath,
      videoDurationSec,
      thumbnailPath,
      savedByCreator: false,
      createdAt: FieldValue.serverTimestamp(),
    };
  }

  const now = FieldValue.serverTimestamp();
  const exchangeData: Record<string, unknown> = {
    creatorId: oo.creatorId,
    clientId: body.clientId,
    oneOnOneClientId: body.oneOnOneClientId,
    exerciseKey: body.exerciseKey || null,
    exerciseName: body.exerciseName || null,
    status: "open",
    createdAt: now,
    lastMessageAt: now,
    lastMessageBy: msgData ? callerRole : null,
    unreadByCreator: msgData && callerRole === "client" ? 1 : 0,
    unreadByClient: msgData && callerRole === "creator" ? 1 : 0,
  };

  const exchangeRef = db.collection("video_exchanges").doc();

  if (msgData) {
    // Validate storage paths against the now-known exchange id
    if (msgData.videoPath) {
      validateStoragePath(msgData.videoPath as string, `video_exchanges/${exchangeRef.id}/`);
    }
    if (msgData.thumbnailPath) {
      validateStoragePath(msgData.thumbnailPath as string, `video_exchanges/${exchangeRef.id}/`);
    }
    const msgRef = exchangeRef.collection("messages").doc();
    const batch = db.batch();
    batch.set(exchangeRef, exchangeData);
    batch.set(msgRef, msgData);
    await batch.commit();
    res.status(201).json({
      data: {
        exchangeId: exchangeRef.id,
        ...exchangeData,
        firstMessage: {messageId: msgRef.id, ...msgData},
      },
    });
    return;
  }

  await exchangeRef.set(exchangeData);
  res.status(201).json({data: {exchangeId: exchangeRef.id, ...exchangeData}});
});

// ─── GET /video-exchanges — List threads ──────────────────────────────────

router.get("/video-exchanges", async (req, res) => {
  const auth = await validateAuthAndRateLimit(req);

  const {oneOnOneClientId, status} = req.query as Record<string, string | undefined>;

  // Query both sides — a user can participate as creator in some threads and
  // as client in others (e.g. a coach who is also a client of another coach).
  const base = db.collection("video_exchanges");
  const build = (field: "creatorId" | "clientId") => {
    let q: FirebaseFirestore.Query = base.where(field, "==", auth.userId);
    if (status) q = q.where("status", "==", status);
    return q.orderBy("lastMessageAt", "desc").limit(100);
  };

  const [asCreatorSnap, asClientSnap] = await Promise.all([
    build("creatorId").get(),
    build("clientId").get(),
  ]);

  const byId = new Map<string, Record<string, unknown>>();
  for (const d of [...asCreatorSnap.docs, ...asClientSnap.docs]) {
    byId.set(d.id, {...d.data(), id: d.id});
  }
  let exchanges = Array.from(byId.values());

  if (oneOnOneClientId) {
    exchanges = exchanges.filter((e) => e.oneOnOneClientId === oneOnOneClientId);
  }

  exchanges.sort((a, b) => {
    const am = (a.lastMessageAt as FirebaseFirestore.Timestamp | undefined)?.toMillis?.() ?? 0;
    const bm = (b.lastMessageAt as FirebaseFirestore.Timestamp | undefined)?.toMillis?.() ?? 0;
    return bm - am;
  });
  exchanges = exchanges.slice(0, 100);

  res.json({data: exchanges});
});

// ─── GET /video-exchanges/inbox — Creator review queue ───────────────────
// Must be declared BEFORE /:id so it doesn't match as an exchange id.

router.get("/video-exchanges/inbox", async (req, res) => {
  const auth = await validateAuthAndRateLimit(req);

  if (auth.role !== "creator" && auth.role !== "admin") {
    throw new WakeApiServerError("FORBIDDEN", 403, "Solo los creadores tienen bandeja de entrada");
  }

  const snap = await db
    .collection("video_exchanges")
    .where("creatorId", "==", auth.userId)
    .where("status", "==", "open")
    .where("lastMessageBy", "==", "client")
    .orderBy("lastMessageAt", "desc")
    .limit(100)
    .get();

  // Denormalise the latest client message and client display name onto each
  // exchange for the UI. Bounded at 100 parallel reads.
  const items = await Promise.all(
    snap.docs.map(async (d) => {
      const exchange = {id: d.id, ...d.data()} as Record<string, unknown>;
      const clientId = exchange.clientId as string | undefined;

      const [msgSnap, clientUserSnap] = await Promise.all([
        d.ref
          .collection("messages")
          .where("senderRole", "==", "client")
          .orderBy("createdAt", "desc")
          .limit(1)
          .get(),
        clientId ? db.collection("users").doc(clientId).get() : Promise.resolve(null),
      ]);

      const latestClientMessage = msgSnap.empty ? null : {id: msgSnap.docs[0].id, ...msgSnap.docs[0].data()};
      const clientUser = clientUserSnap && clientUserSnap.exists ? clientUserSnap.data() : null;
      const clientName = (clientUser?.displayName as string) || (clientUser?.email as string) || null;

      return {...exchange, latestClientMessage, clientName};
    })
  );

  res.json({data: items});
});

// ─── GET /video-exchanges/:id — Thread + messages ─────────────────────────

router.get("/video-exchanges/:id", async (req, res) => {
  const auth = await validateAuthAndRateLimit(req);
  const exchange = await getExchangeOrThrow(req.params.id, auth.userId);

  const messagesSnap = await db
    .collection("video_exchanges")
    .doc(req.params.id)
    .collection("messages")
    .orderBy("createdAt", "asc")
    .get();

  const messages = messagesSnap.docs.map((d) => ({...d.data(), id: d.id}));

  res.json({data: {exchange, messages}});
});

// ─── PATCH /video-exchanges/:id — Close / mark read ──────────────────────

router.patch("/video-exchanges/:id", async (req, res) => {
  const auth = await validateAuthAndRateLimit(req);
  const exchange = await getExchangeOrThrow(req.params.id, auth.userId);

  const body = validateBody<{
    status?: string;
    markRead?: boolean;
  }>(
    {
      status: "optional_string",
      markRead: "optional_boolean",
    },
    req.body
  );

  const updates: Record<string, unknown> = {};

  if (body.status === "closed") {
    // Only creator can close a thread
    if (exchange.creatorId !== auth.userId) {
      throw new WakeApiServerError("FORBIDDEN", 403, "Solo el creador puede cerrar la conversacion");
    }
    updates.status = "closed";
  }

  if (body.markRead === true) {
    const role = senderRole(auth.userId, exchange);
    if (role === "creator") {
      updates.unreadByCreator = 0;
    } else {
      updates.unreadByClient = 0;
    }
  }

  if (Object.keys(updates).length === 0) {
    throw new WakeApiServerError("VALIDATION_ERROR", 400, "No se proporcionaron cambios validos");
  }

  await db.collection("video_exchanges").doc(req.params.id).update(updates);

  res.json({data: {id: req.params.id, ...updates}});
});

// ─── DELETE /video-exchanges/:id — Soft delete ────────────────────────────

router.delete("/video-exchanges/:id", async (req, res) => {
  const auth = await validateAuthAndRateLimit(req);
  const exchange = await getExchangeOrThrow(req.params.id, auth.userId);

  if (exchange.creatorId !== auth.userId) {
    throw new WakeApiServerError("FORBIDDEN", 403, "Solo el creador puede eliminar la conversacion");
  }

  await db.collection("video_exchanges").doc(req.params.id).update({status: "closed"});

  res.status(204).send();
});

// ─── POST /video-exchanges/:id/messages — Send message ────────────────────

router.post("/video-exchanges/:id/messages", async (req, res) => {
  const auth = await validateAuthAndRateLimit(req);
  const exchange = await getExchangeOrThrow(req.params.id, auth.userId);

  if (exchange.status === "closed") {
    throw new WakeApiServerError("VALIDATION_ERROR", 400, "Esta conversacion esta cerrada");
  }

  const body = validateBody<{
    note?: string;
    videoPath?: string;
    videoDurationSec?: number;
    thumbnailPath?: string;
  }>(
    {
      note: "optional_string",
      videoPath: "optional_string",
      videoDurationSec: "optional_number",
      thumbnailPath: "optional_string",
    },
    req.body
  );

  if (!body.note && !body.videoPath) {
    throw new WakeApiServerError(
      "VALIDATION_ERROR", 400,
      "Debes enviar un mensaje de texto o un video"
    );
  }

  // Audit M-39: cap creator-controlled text.
  if (body.note) {
    assertTextLength(body.note, "note", TEXT_CAP_NOTE);
  }

  // Validate video path prefix if provided
  if (body.videoPath) {
    validateStoragePath(body.videoPath, `video_exchanges/${req.params.id}/`);
  }
  if (body.thumbnailPath) {
    validateStoragePath(body.thumbnailPath, `video_exchanges/${req.params.id}/`);
  }

  // Duration validation
  const role = senderRole(auth.userId, exchange);
  if (body.videoDurationSec) {
    const maxDuration = role === "client" ? 120 : 300;
    if (body.videoDurationSec > maxDuration) {
      throw new WakeApiServerError(
        "VALIDATION_ERROR", 400,
        `La duracion maxima del video es ${maxDuration} segundos`,
        "videoDurationSec"
      );
    }
  }

  const now = FieldValue.serverTimestamp();
  const messageData = {
    senderId: auth.userId,
    senderRole: role,
    note: body.note || "",
    videoPath: body.videoPath || null,
    videoDurationSec: body.videoDurationSec || null,
    thumbnailPath: body.thumbnailPath || null,
    savedByCreator: false,
    createdAt: now,
  };

  const exchangeRef = db.collection("video_exchanges").doc(req.params.id);
  const msgRef = exchangeRef.collection("messages").doc();

  const unreadField = role === "creator" ? "unreadByClient" : "unreadByCreator";
  const exchangeUpdate: Record<string, unknown> = {
    lastMessageAt: now,
    lastMessageBy: role,
    [unreadField]: FieldValue.increment(1),
  };
  // Auto-close when the coach responds — submission is resolved.
  if (role === "creator") {
    exchangeUpdate.status = "closed";
  }

  const batch = db.batch();
  batch.set(msgRef, messageData);
  batch.update(exchangeRef, exchangeUpdate);
  await batch.commit();

  res.status(201).json({data: {messageId: msgRef.id, ...messageData}});
});

// ─── PATCH /video-exchanges/:id/messages/:msgId — Toggle saved ────────────

router.patch("/video-exchanges/:id/messages/:msgId", async (req, res) => {
  const auth = await validateAuthAndRateLimit(req);
  const exchange = await getExchangeOrThrow(req.params.id, auth.userId);

  if (exchange.creatorId !== auth.userId) {
    throw new WakeApiServerError("FORBIDDEN", 403, "Solo el creador puede guardar mensajes");
  }

  const body = validateBody<{ savedByCreator: boolean }>(
    {savedByCreator: "boolean"},
    req.body
  );

  const msgRef = db
    .collection("video_exchanges")
    .doc(req.params.id)
    .collection("messages")
    .doc(req.params.msgId);

  const msgDoc = await msgRef.get();
  if (!msgDoc.exists) {
    throw new WakeApiServerError("NOT_FOUND", 404, "Mensaje no encontrado");
  }

  await msgRef.update({savedByCreator: body.savedByCreator});

  res.json({data: {id: req.params.msgId, savedByCreator: body.savedByCreator}});
});

// ─── POST /video-exchanges/:id/upload-url — Signed upload URL ─────────────

router.post("/video-exchanges/:id/upload-url", async (req, res) => {
  const auth = await validateAuthAndRateLimit(req, 20);
  await getExchangeOrThrow(req.params.id, auth.userId);

  const body = validateBody<{
    contentType: string;
    fileType: string;
  }>(
    {contentType: "string", fileType: "string"},
    req.body
  );

  const allowedVideoTypes = ["video/mp4", "video/webm"];
  const allowedThumbnailTypes = ["image/jpeg"];

  if (body.fileType === "video") {
    if (!allowedVideoTypes.includes(body.contentType)) {
      throw new WakeApiServerError(
        "VALIDATION_ERROR", 400,
        "Tipo de video no soportado. Usa MP4 o WebM",
        "contentType"
      );
    }
  } else if (body.fileType === "thumbnail") {
    if (!allowedThumbnailTypes.includes(body.contentType)) {
      throw new WakeApiServerError(
        "VALIDATION_ERROR", 400,
        "Tipo de thumbnail no soportado. Usa JPEG",
        "contentType"
      );
    }
  } else {
    throw new WakeApiServerError(
      "VALIDATION_ERROR", 400,
      "fileType debe ser 'video' o 'thumbnail'",
      "fileType"
    );
  }

  const messageId = db.collection("_").doc().id;
  const ext = body.fileType === "video" ?
    (body.contentType === "video/webm" ? "webm" : "mp4") :
    "jpg";
  const filename = body.fileType === "video" ? `video.${ext}` : `thumbnail.${ext}`;
  const storagePath = `video_exchanges/${req.params.id}/${messageId}/${filename}`;

  const bucket = admin.storage().bucket();
  const file = bucket.file(storagePath);

  const [url] = await file.getSignedUrl({
    version: "v4",
    action: "write",
    expires: Date.now() + 15 * 60 * 1000,
    contentType: body.contentType,
  });

  res.json({data: {uploadUrl: url, storagePath, messageId}});
});

// ─── POST /video-exchanges/:id/upload-url/confirm — Confirm upload ────────

router.post("/video-exchanges/:id/upload-url/confirm", async (req, res) => {
  const auth = await validateAuthAndRateLimit(req);
  await getExchangeOrThrow(req.params.id, auth.userId);

  const body = validateBody<{
    storagePath: string;
    messageId: string;
  }>(
    {storagePath: "string", messageId: "string"},
    req.body
  );

  validateStoragePath(body.storagePath, `video_exchanges/${req.params.id}/`);

  const bucket = admin.storage().bucket();
  const file = bucket.file(body.storagePath);
  const [exists] = await file.exists();
  if (!exists) {
    throw new WakeApiServerError("NOT_FOUND", 404, "Archivo no encontrado en Storage");
  }

  await applyLongCacheControl(file);

  const publicUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(body.storagePath)}?alt=media`;

  res.json({data: {url: publicUrl, storagePath: body.storagePath}});
});

export default router;
