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
    .where("creatorId", "==", auth.userId)
    .where("status", "==", "active")
    .get();

  // Never return keyHash
  const keys = snapshot.docs.map((d) => {
    const data = d.data();
    return {
      keyId: d.id,
      name: data.name,
      scope: data.scope,
      createdAt: data.createdAt,
      lastUsedAt: data.lastUsedAt ?? null,
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

  // Include useCase in the validated schema; add length/scope caps
  const body = validateBody<{ name: string; scope: string[]; useCase?: string }>(
    { name: "string", scope: "array", useCase: "optional_string" },
    req.body,
    { maxStringLength: 100, maxArrayLength: 10 }
  );

  // Validate name length
  if (body.name.length > 100) {
    throw new WakeApiServerError(
      "VALIDATION_ERROR", 400,
      "Nombre de API key demasiado largo (máx 100 caracteres)", "name"
    );
  }

  // Validate scope entries
  const validScopes = ["read", "write", "creator"];
  for (const s of body.scope) {
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

  // Determine initial status — read keys are self-serve, write needs approval
  const needsApproval = body.scope.some((s) => s === "write" || s === "creator");
  const status = needsApproval ? "pending_approval" : "active";

  // Generate key_<12 hex chars> ID per spec
  const keyId = `key_${crypto.randomBytes(6).toString("hex")}`;
  const useCase = body.useCase?.trim() || null;

  const docData: Record<string, unknown> = {
    creatorId: auth.userId,
    name: body.name,
    scope: body.scope,
    keyHash,
    status,
    createdAt: new Date().toISOString(),
    lastUsedAt: null,
    revokedAt: null,
  };
  if (useCase) docData.useCase = useCase;

  await db.collection("api_keys").doc(keyId).set(docData);

  // Return the raw key ONCE — it will never be retrievable again
  res.status(201).json({
    data: {
      keyId,
      key: rawKey,
      name: body.name,
      scope: body.scope,
      status,
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

  if (!doc.exists || doc.data()?.creatorId !== auth.userId) {
    throw new WakeApiServerError("NOT_FOUND", 404, "API key no encontrada");
  }

  await docRef.update({
    status: "revoked",
    revokedAt: new Date().toISOString(),
  });

  res.json({ data: { revoked: true } });
});

export default router;
