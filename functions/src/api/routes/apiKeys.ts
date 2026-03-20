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

  const body = validateBody<{ name: string; scope: string[] }>(
    { name: "string", scope: "array" },
    req.body
  );

  const validScopes = ["read", "write", "creator"];
  for (const s of body.scope) {
    if (!validScopes.includes(s)) {
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

  const docRef = await db.collection("api_keys").add({
    creatorId: auth.userId,
    name: body.name,
    scope: body.scope,
    keyHash,
    status,
    createdAt: new Date().toISOString(),
    lastUsedAt: null,
    revokedAt: null,
  });

  // Return the raw key ONCE — it will never be retrievable again
  res.status(201).json({
    data: {
      keyId: docRef.id,
      key: rawKey,
      name: body.name,
      scope: body.scope,
      status,
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
