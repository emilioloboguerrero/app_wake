import { Router } from "express";
import * as admin from "firebase-admin";
import * as crypto from "node:crypto";
import { validateAuth } from "../middleware/auth.js";
import { validateBody } from "../middleware/validate.js";
import { checkRateLimit } from "../middleware/rateLimit.js";
import { WakeApiServerError } from "../errors.js";

const router = Router();
const db = admin.firestore();

// GET /api-keys
router.get("/api-keys", async (req, res) => {
  const auth = await validateAuth(req);
  if (auth.role !== "creator" && auth.role !== "admin") {
    throw new WakeApiServerError("FORBIDDEN", 403, "Solo creadores pueden gestionar API keys");
  }
  await checkRateLimit(auth.userId, 200, "rate_limit_first_party");

  const snapshot = await db
    .collection("api_keys")
    .where("owner_id", "==", auth.userId)
    .get();

  // Never return key_hash; filter out revoked keys
  const keys = snapshot.docs.filter((d) => !d.data().revoked).map((d) => {
    const data = d.data();
    return {
      keyId: d.id,
      name: data.name,
      scope: data.scopes ?? data.scope,
      revoked: data.revoked ?? false,
      createdAt: data.created_at ?? data.createdAt,
      lastUsedAt: data.last_used_at ?? data.lastUsedAt ?? null,
      ...(data.useCase ? { useCase: data.useCase } : {}),
    };
  });

  res.json({ data: keys });
});

// POST /api-keys
router.post("/api-keys", async (req, res) => {
  const auth = await validateAuth(req);
  if (auth.role !== "creator" && auth.role !== "admin") {
    throw new WakeApiServerError("FORBIDDEN", 403, "Solo creadores pueden crear API keys");
  }
  await checkRateLimit(auth.userId, 200, "rate_limit_first_party");

  const body = validateBody<{ name: string; scope?: string[]; useCase?: string }>(
    { name: "string", scope: "optional_array", useCase: "optional_string" },
    req.body,
    { maxStringLength: 100, maxArrayLength: 10 }
  );
  const scopes = body.scope ?? ["read"];

  // Validate name length
  if (body.name.length > 100) {
    throw new WakeApiServerError(
      "VALIDATION_ERROR", 400,
      "Nombre de API key demasiado largo (máx 100 caracteres)", "name"
    );
  }

  // Validate scope entries
  const validScopes = ["read", "write", "creator"];
  for (const s of scopes) {
    if (typeof s !== "string" || !validScopes.includes(s)) {
      throw new WakeApiServerError(
        "VALIDATION_ERROR", 400,
        `Scope inválido: ${s}. Valores permitidos: ${validScopes.join(", ")}`,
        "scope"
      );
    }
  }

  // Generate key
  const rawKey = `wk_live_${crypto.randomBytes(32).toString("hex")}`;
  const keyHash = crypto.createHash("sha256").update(rawKey).digest("hex");

  // Generate key_<12 hex chars> ID per spec
  const keyId = `key_${crypto.randomBytes(6).toString("hex")}`;
  const useCase = body.useCase?.trim() || null;

  const docData: Record<string, unknown> = {
    owner_id: auth.userId,
    name: body.name,
    scopes,
    key_hash: keyHash,
    key_prefix: rawKey.slice(0, 12),
    revoked: false,
    created_at: new Date().toISOString(),
    last_used_at: null,
    revoked_at: null,
  };
  if (useCase) docData.useCase = useCase;

  await db.collection("api_keys").doc(keyId).set(docData);

  // Return the raw key ONCE — it will never be retrievable again
  res.status(201).json({
    data: {
      keyId,
      rawKey,
      name: body.name,
      scope: scopes,
      status: "active",
      ...(useCase ? { useCase } : {}),
    },
  });
});

// DELETE /api-keys/:keyId
router.delete("/api-keys/:keyId", async (req, res) => {
  const auth = await validateAuth(req);
  if (auth.role !== "creator" && auth.role !== "admin") {
    throw new WakeApiServerError("FORBIDDEN", 403, "Solo creadores pueden revocar API keys");
  }
  await checkRateLimit(auth.userId, 200, "rate_limit_first_party");

  const docRef = db.collection("api_keys").doc(req.params.keyId);
  const doc = await docRef.get();

  if (!doc.exists || doc.data()?.owner_id !== auth.userId) {
    throw new WakeApiServerError("NOT_FOUND", 404, "API key no encontrada");
  }

  await docRef.update({
    revoked: true,
    revoked_at: new Date().toISOString(),
  });

  res.json({ data: { revoked: true } });
});

export default router;
