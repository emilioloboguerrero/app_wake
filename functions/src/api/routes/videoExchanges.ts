import {Router} from "express";
import * as admin from "firebase-admin";
import {db, FieldValue} from "../firestore.js";
import {validateAuth} from "../middleware/auth.js";
import {checkRateLimit} from "../middleware/rateLimit.js";
import {validateBody, validateStoragePath} from "../middleware/validate.js";
import {WakeApiServerError} from "../errors.js";

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
  }>(
    {
      clientId: "string",
      oneOnOneClientId: "string",
      exerciseKey: "optional_string",
      exerciseName: "optional_string",
    },
    req.body
  );

  // Verify the one_on_one_clients relationship exists and caller is part of it
  const ooDoc = await db.collection("one_on_one_clients").doc(body.oneOnOneClientId).get();
  if (!ooDoc.exists) {
    throw new WakeApiServerError("NOT_FOUND", 404, "Relacion de asesoria no encontrada");
  }
  const oo = ooDoc.data()!;

  if (auth.role === "creator" || auth.role === "admin") {
    if (oo.creatorId !== auth.userId) {
      throw new WakeApiServerError("FORBIDDEN", 403, "No eres el creador de esta asesoria");
    }
    if (oo.clientUserId !== body.clientId) {
      throw new WakeApiServerError("VALIDATION_ERROR", 400, "clientId no coincide con la asesoria", "clientId");
    }
  } else {
    // Client creating a thread
    if (oo.clientUserId !== auth.userId) {
      throw new WakeApiServerError("FORBIDDEN", 403, "No tienes acceso a esta asesoria");
    }
    if (auth.userId !== body.clientId) {
      throw new WakeApiServerError("VALIDATION_ERROR", 400, "clientId debe ser tu propio userId", "clientId");
    }

    // Enforce 3 active thread limit for clients
    const openThreads = await db
      .collection("video_exchanges")
      .where("clientId", "==", auth.userId)
      .where("status", "==", "open")
      .get();

    if (openThreads.size >= 3) {
      throw new WakeApiServerError(
        "VALIDATION_ERROR", 400,
        "Puedes tener maximo 3 conversaciones activas"
      );
    }
  }

  const now = FieldValue.serverTimestamp();
  const exchangeData = {
    creatorId: oo.creatorId,
    clientId: body.clientId,
    oneOnOneClientId: body.oneOnOneClientId,
    exerciseKey: body.exerciseKey || null,
    exerciseName: body.exerciseName || null,
    status: "open",
    createdAt: now,
    lastMessageAt: now,
    lastMessageBy: null,
    unreadByCreator: 0,
    unreadByClient: 0,
  };

  const ref = await db.collection("video_exchanges").add(exchangeData);

  res.status(201).json({data: {exchangeId: ref.id, ...exchangeData}});
});

// ─── GET /video-exchanges — List threads ──────────────────────────────────

router.get("/video-exchanges", async (req, res) => {
  const auth = await validateAuthAndRateLimit(req);

  const {oneOnOneClientId, status} = req.query as Record<string, string | undefined>;

  let query: FirebaseFirestore.Query = db.collection("video_exchanges");

  if (auth.role === "creator" || auth.role === "admin") {
    query = query.where("creatorId", "==", auth.userId);
  } else {
    query = query.where("clientId", "==", auth.userId);
  }

  if (status) {
    query = query.where("status", "==", status);
  }

  query = query.orderBy("lastMessageAt", "desc").limit(100);

  const snap = await query.get();
  let exchanges = snap.docs.map((d) => ({...d.data(), id: d.id}));

  // Filter oneOnOneClientId client-side to avoid extra composite index
  if (oneOnOneClientId) {
    exchanges = exchanges.filter((e: Record<string, unknown>) => e.oneOnOneClientId === oneOnOneClientId);
  }

  res.json({data: exchanges});
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

  const msgRef = await db
    .collection("video_exchanges")
    .doc(req.params.id)
    .collection("messages")
    .add(messageData);

  // Update parent exchange
  const unreadField = role === "creator" ? "unreadByClient" : "unreadByCreator";
  await db.collection("video_exchanges").doc(req.params.id).update({
    lastMessageAt: now,
    lastMessageBy: role,
    [unreadField]: FieldValue.increment(1),
  });

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
  const [exists] = await bucket.file(body.storagePath).exists();
  if (!exists) {
    throw new WakeApiServerError("NOT_FOUND", 404, "Archivo no encontrado en Storage");
  }

  const publicUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(body.storagePath)}?alt=media`;

  res.json({data: {url: publicUrl, storagePath: body.storagePath}});
});

export default router;
