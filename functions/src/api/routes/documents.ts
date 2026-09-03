// Creator-owned public documents (lead magnets, guides, PDFs).
//
// Each document is one Firestore row plus two objects in Storage: the file
// itself and a cover image rendered from its first page by the dashboard at
// upload time. The cover is what makes `wakelab.co/d/{docId}` cheap — without
// it every visitor downloads the whole PDF just so the browser can draw page 1.
//
// Bytes never pass through this function. The dashboard PUTs to a signed URL
// and then calls confirm, same as every other upload in Wake.

import {Router} from "express";
import * as admin from "firebase-admin";
import * as functions from "firebase-functions";
import {db, FieldValue} from "../firestore.js";
import {validateAuth} from "../middleware/auth.js";
import {validateBody, validateStoragePath} from "../middleware/validate.js";
import {checkRateLimit} from "../middleware/rateLimit.js";
import {assertTextLength, TEXT_CAP_TITLE} from "../middleware/securityHelpers.js";
import {WakeApiServerError} from "../errors.js";
import {applyLongCacheControl} from "../services/storageMetadata.js";

const router = Router();

const DOC_NOT_FOUND = "Documento no encontrado";
const MAX_FILE_BYTES = 50 * 1024 * 1024;

const FILE_EXTENSIONS: Record<string, string> = {
  "application/pdf": "pdf",
};
const COVER_EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

function requireCreator(auth: { role: string }): void {
  if (auth.role !== "creator" && auth.role !== "admin") {
    throw new WakeApiServerError("FORBIDDEN", 403, "Acceso restringido a creadores");
  }
}

function publicStorageUrl(bucketName: string, storagePath: string): string {
  return "https://firebasestorage.googleapis.com/v0/b/" + bucketName +
    "/o/" + encodeURIComponent(storagePath) + "?alt=media";
}

/** Loads a document the caller owns, or 404s. Ownership miss and missing row
 *  are indistinguishable so one creator can't probe another's document IDs. */
async function ownedDocument(docId: string, userId: string, role: string) {
  const ref = db.collection("public_documents").doc(docId);
  const snap = await ref.get();
  const data = snap.data();
  if (!snap.exists || (data?.creator_id !== userId && role !== "admin")) {
    throw new WakeApiServerError("NOT_FOUND", 404, DOC_NOT_FOUND);
  }
  return {ref, data: data!};
}

function shape(id: string, d: Record<string, unknown>, bucketName: string) {
  const storagePath = typeof d.storage_path === "string" ? d.storage_path : null;
  const coverPath = typeof d.cover_path === "string" ? d.cover_path : null;
  return {
    docId: id,
    title: d.title || "",
    ctaLabel: d.cta_label || "Descargar ahora",
    status: d.status || "draft",
    fileName: d.file_name || null,
    contentType: d.content_type || null,
    sizeBytes: typeof d.size_bytes === "number" ? d.size_bytes : null,
    pageCount: typeof d.page_count === "number" ? d.page_count : null,
    downloadCount: typeof d.download_count === "number" ? d.download_count : 0,
    viewCount: typeof d.view_count === "number" ? d.view_count : 0,
    hasFile: Boolean(storagePath),
    coverUrl: coverPath ? publicStorageUrl(bucketName, coverPath) : null,
    fileUrl: storagePath ? publicStorageUrl(bucketName, storagePath) : null,
    url: "https://wakelab.co/d/" + id,
    createdAt: d.created_at ?? null,
    updatedAt: d.updated_at ?? null,
  };
}

// GET /creator/documents — every document this creator owns, newest first.
router.get("/creator/documents", async (req, res) => {
  const auth = await validateAuth(req);
  requireCreator(auth);
  await checkRateLimit(auth.userId, 200, "rate_limit_first_party");

  const snap = await db.collection("public_documents")
    .where("creator_id", "==", auth.userId)
    .get();

  const bucketName = admin.storage().bucket().name;
  const documents = snap.docs
    .map((d) => shape(d.id, d.data(), bucketName))
    .sort((a, b) => {
      const at = (a.createdAt as {_seconds?: number})?._seconds ?? 0;
      const bt = (b.createdAt as {_seconds?: number})?._seconds ?? 0;
      return bt - at;
    });

  res.json({data: {documents}});
});

// POST /creator/documents — create the row first so the ID exists before the
// upload; the Storage path is keyed by it. Starts as a draft, so a half-
// uploaded document is never reachable from its public URL.
router.post("/creator/documents", async (req, res) => {
  const auth = await validateAuth(req);
  requireCreator(auth);
  await checkRateLimit(auth.userId, 200, "rate_limit_first_party");

  const body = validateBody<{ title: string; ctaLabel?: string }>(
    {title: "string", ctaLabel: "optional_string"},
    req.body,
    {maxStringLength: 200}
  );
  assertTextLength(body.title, "title", TEXT_CAP_TITLE);

  const now = FieldValue.serverTimestamp();
  const ref = await db.collection("public_documents").add({
    title: body.title.trim(),
    cta_label: (body.ctaLabel || "Descargar ahora").trim(),
    creator_id: auth.userId,
    status: "draft",
    download_count: 0,
    view_count: 0,
    created_at: now,
    updated_at: now,
  });

  res.status(201).json({data: {docId: ref.id, url: "https://wakelab.co/d/" + ref.id}});
});

// PATCH /creator/documents/:docId — title, CTA and publish state.
router.patch("/creator/documents/:docId", async (req, res) => {
  const auth = await validateAuth(req);
  requireCreator(auth);
  await checkRateLimit(auth.userId, 200, "rate_limit_first_party");

  const {ref, data} = await ownedDocument(req.params.docId, auth.userId, auth.role);
  const body = validateBody<{ title?: string; ctaLabel?: string; status?: string }>(
    {title: "optional_string", ctaLabel: "optional_string", status: "optional_string"},
    req.body,
    {maxStringLength: 200}
  );

  const update: Record<string, unknown> = {updated_at: FieldValue.serverTimestamp()};
  if (body.title !== undefined) {
    assertTextLength(body.title, "title", TEXT_CAP_TITLE);
    update.title = body.title.trim();
  }
  if (body.ctaLabel !== undefined) update.cta_label = body.ctaLabel.trim() || "Descargar ahora";
  if (body.status !== undefined) {
    if (body.status !== "active" && body.status !== "draft") {
      throw new WakeApiServerError("VALIDATION_ERROR", 400, "Estado inválido", "status");
    }
    // Publishing a document with no file would 404 the public page.
    if (body.status === "active" && typeof data.storage_path !== "string") {
      throw new WakeApiServerError("VALIDATION_ERROR", 400, "Sube el archivo antes de publicar", "status");
    }
    update.status = body.status;
  }

  await ref.update(update);
  res.json({data: {docId: req.params.docId}});
});

// DELETE /creator/documents/:docId — row and both objects go together, so a
// deleted document leaves nothing publicly readable behind.
router.delete("/creator/documents/:docId", async (req, res) => {
  const auth = await validateAuth(req);
  requireCreator(auth);
  await checkRateLimit(auth.userId, 200, "rate_limit_first_party");

  const {ref} = await ownedDocument(req.params.docId, auth.userId, auth.role);
  const bucket = admin.storage().bucket();

  await bucket.deleteFiles({prefix: `public_documents/${req.params.docId}/`})
    .catch((err) => functions.logger.warn("documents:storage-cleanup-failed", err));
  await ref.delete();

  res.status(204).send();
});

// POST /creator/documents/:docId/file/upload-url
router.post("/creator/documents/:docId/file/upload-url", async (req, res) => {
  const auth = await validateAuth(req);
  requireCreator(auth);
  await checkRateLimit(auth.userId, 200, "rate_limit_first_party");
  await ownedDocument(req.params.docId, auth.userId, auth.role);

  const {contentType, fileName} = validateBody<{ contentType: string; fileName: string }>(
    {contentType: "string", fileName: "string"},
    req.body,
    {maxStringLength: 300}
  );

  const ext = FILE_EXTENSIONS[contentType];
  if (!ext) {
    throw new WakeApiServerError("VALIDATION_ERROR", 400, "Por ahora solo se admiten PDF", "contentType");
  }

  const storagePath = `public_documents/${req.params.docId}/documento.${ext}`;
  const [uploadUrl] = await admin.storage().bucket().file(storagePath).getSignedUrl({
    version: "v4",
    action: "write",
    expires: Date.now() + 15 * 60 * 1000,
    contentType,
  });

  res.json({data: {uploadUrl, storagePath, fileName, maxBytes: MAX_FILE_BYTES}});
});

// POST /creator/documents/:docId/file/confirm
router.post("/creator/documents/:docId/file/confirm", async (req, res) => {
  const auth = await validateAuth(req);
  requireCreator(auth);
  await checkRateLimit(auth.userId, 200, "rate_limit_first_party");
  const {ref} = await ownedDocument(req.params.docId, auth.userId, auth.role);

  const body = validateBody<{ storagePath: string; fileName: string; pageCount?: number }>(
    {storagePath: "string", fileName: "string", pageCount: "optional_number"},
    req.body,
    {maxStringLength: 300}
  );
  validateStoragePath(body.storagePath, `public_documents/${req.params.docId}/`);

  const file = admin.storage().bucket().file(body.storagePath);
  const [exists] = await file.exists();
  if (!exists) {
    throw new WakeApiServerError("NOT_FOUND", 404, "Archivo no encontrado en Storage");
  }

  const [meta] = await file.getMetadata();
  const size = Number(meta.size ?? 0);
  if (size > MAX_FILE_BYTES) {
    await file.delete().catch(() => undefined);
    throw new WakeApiServerError("VALIDATION_ERROR", 400, "El archivo supera los 50 MB", "storagePath");
  }

  await applyLongCacheControl(file);
  await ref.update({
    storage_path: body.storagePath,
    file_name: body.fileName,
    content_type: meta.contentType || "application/pdf",
    size_bytes: size,
    page_count: body.pageCount ?? null,
    updated_at: FieldValue.serverTimestamp(),
  });

  res.json({data: {sizeBytes: size}});
});

// POST /creator/documents/:docId/cover/upload-url
router.post("/creator/documents/:docId/cover/upload-url", async (req, res) => {
  const auth = await validateAuth(req);
  requireCreator(auth);
  await checkRateLimit(auth.userId, 200, "rate_limit_first_party");
  await ownedDocument(req.params.docId, auth.userId, auth.role);

  const {contentType} = validateBody<{ contentType: string }>(
    {contentType: "string"},
    req.body
  );
  const ext = COVER_EXTENSIONS[contentType];
  if (!ext) {
    throw new WakeApiServerError("VALIDATION_ERROR", 400, "Formato de portada no soportado", "contentType");
  }

  const storagePath = `public_documents/${req.params.docId}/portada.${ext}`;
  const [uploadUrl] = await admin.storage().bucket().file(storagePath).getSignedUrl({
    version: "v4",
    action: "write",
    expires: Date.now() + 15 * 60 * 1000,
    contentType,
  });

  res.json({data: {uploadUrl, storagePath}});
});

// POST /creator/documents/:docId/cover/confirm
router.post("/creator/documents/:docId/cover/confirm", async (req, res) => {
  const auth = await validateAuth(req);
  requireCreator(auth);
  await checkRateLimit(auth.userId, 200, "rate_limit_first_party");
  const {ref} = await ownedDocument(req.params.docId, auth.userId, auth.role);

  const {storagePath} = validateBody<{ storagePath: string }>(
    {storagePath: "string"},
    req.body,
    {maxStringLength: 300}
  );
  validateStoragePath(storagePath, `public_documents/${req.params.docId}/`);

  const file = admin.storage().bucket().file(storagePath);
  const [exists] = await file.exists();
  if (!exists) {
    throw new WakeApiServerError("NOT_FOUND", 404, "Portada no encontrada en Storage");
  }

  await applyLongCacheControl(file);
  await ref.update({
    cover_path: storagePath,
    updated_at: FieldValue.serverTimestamp(),
  });

  res.json({data: {coverUrl: publicStorageUrl(admin.storage().bucket().name, storagePath)}});
});

export default router;
