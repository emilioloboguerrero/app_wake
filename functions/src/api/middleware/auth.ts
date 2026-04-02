import type { Request } from "express";
import * as admin from "firebase-admin";
import * as crypto from "node:crypto";
import { db } from "../firestore.js";
import { WakeApiServerError } from "../errors.js";
import { checkRateLimit } from "./rateLimit.js";

// ─── In-memory token verification cache ───────────────────────────────────
// Caches decoded ID tokens by a truncated SHA-256 hash of the raw token.
// Avoids repeated verifyIdToken network calls for the same token across
// concurrent requests (e.g. 8 dashboard queries firing simultaneously).
const TOKEN_CACHE_MAX = 50;
const TOKEN_CACHE_TTL_MS = 5 * 60 * 1000;
const tokenCache = new Map<string, { decoded: admin.auth.DecodedIdToken; expiresAt: number }>();

function getCachedToken(token: string): admin.auth.DecodedIdToken | null {
  const hash = crypto.createHash("sha256").update(token).digest("hex").slice(0, 16);
  const entry = tokenCache.get(hash);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) { tokenCache.delete(hash); return null; }
  return entry.decoded;
}

function setCachedToken(token: string, decoded: admin.auth.DecodedIdToken): void {
  const hash = crypto.createHash("sha256").update(token).digest("hex").slice(0, 16);
  if (tokenCache.size >= TOKEN_CACHE_MAX) {
    const firstKey = tokenCache.keys().next().value;
    if (firstKey) tokenCache.delete(firstKey);
  }
  tokenCache.set(hash, { decoded, expiresAt: Date.now() + TOKEN_CACHE_TTL_MS });
}

export interface AuthResult {
  userId: string;
  role: "user" | "creator" | "admin";
  authType: "firebase" | "apikey";
  scope?: string[];
  keyId?: string;
  userData?: FirebaseFirestore.DocumentData | null;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: AuthResult;
    }
  }
}

export async function validateAuth(req: Request): Promise<AuthResult> {
  // Return cached result if already validated in this request.
  // Safe: no preceding middleware sets req.auth — only this function does.
  if (req.auth) {
    return req.auth;
  }

  const header = req.headers.authorization;

  if (!header || typeof header !== "string" || !header.startsWith("Bearer ")) {
    throw new WakeApiServerError(
      "UNAUTHENTICATED",
      401,
      "Token de autenticación requerido"
    );
  }

  const token = header.slice(7);

  let result: AuthResult;

  // API key path
  if (token.startsWith("wk_live_") || token.startsWith("wk_test_")) {
    result = await validateApiKey(token);
  } else {
    // Firebase ID token path
    result = await validateFirebaseToken(token, req);
  }

  // Cache on request object for subsequent calls
  req.auth = result;
  return result;
}

/**
 * Middleware that checks API key scope against the HTTP method.
 * Must run after validateAuth has set req.auth.
 * - `read` scope: only GET allowed
 * - `write` / `creator` scope: all methods allowed
 * - Firebase auth (no scope): no restriction
 */
export function enforceScope(req: Request): void {
  const auth = req.auth;
  if (!auth || auth.authType !== "apikey") return;

  const scopes = auth.scope || ["read"];

  // `write` and `creator` scopes allow all methods
  if (scopes.includes("write") || scopes.includes("creator")) return;

  // `read` scope: only GET allowed
  if (scopes.includes("read") && req.method !== "GET") {
    throw new WakeApiServerError(
      "FORBIDDEN",
      403,
      "API key scope does not allow write operations"
    );
  }
}

/**
 * Combined auth + rate limit in a single call. For Firebase token auth,
 * parallelizes the user doc read with the rate limit transaction — saves
 * one sequential Firestore round-trip per request.
 */
export async function validateAuthAndRateLimit(
  req: Request,
  limitRpm = 200,
  collection: "rate_limit_windows" | "rate_limit_first_party" = "rate_limit_first_party"
): Promise<AuthResult> {
  if (req.auth) {
    await checkRateLimit(req.auth.userId, limitRpm, collection);
    return req.auth;
  }

  const header = req.headers.authorization;
  if (!header || typeof header !== "string" || !header.startsWith("Bearer ")) {
    throw new WakeApiServerError("UNAUTHENTICATED", 401, "Token de autenticación requerido");
  }
  const token = header.slice(7);

  // API key path — sequential (need userId from key lookup first)
  if (token.startsWith("wk_live_") || token.startsWith("wk_test_")) {
    const result = await validateApiKey(token);
    req.auth = result;
    await checkRateLimit(
      result.keyId!,
      limitRpm,
      "rate_limit_windows"
    );
    return result;
  }

  // Firebase path — parallelize user doc read + rate limit after token verify
  const isEmulator = process.env.FUNCTIONS_EMULATOR === "true";
  let decoded = getCachedToken(token);
  if (decoded) {
  } else {
    try {
      decoded = await admin.auth().verifyIdToken(token, !isEmulator);
    } catch {
      throw new WakeApiServerError("UNAUTHENTICATED", 401, "Token de autenticación inválido o expirado");
    }
    setCachedToken(token, decoded);
  }

  // App Check (skip in emulator)
  if (!isEmulator) {
    const appCheckToken = req.headers["x-firebase-appcheck"] as string | undefined;
    if (appCheckToken) {
      try {
        await admin.appCheck().verifyToken(appCheckToken);
      } catch {
        throw new WakeApiServerError("UNAUTHENTICATED", 401, "App Check token inválido");
      }
    }
  }

  const [userDoc] = await Promise.all([
    db.collection("users").doc(decoded.uid).get(),
    checkRateLimit(decoded.uid, limitRpm, collection),
  ]);

  const userData = userDoc.exists ? userDoc.data()! : null;
  const role = userData
    ? ((userData.role as "user" | "creator" | "admin") || "user")
    : "user";

  const result: AuthResult = {
    userId: decoded.uid,
    role,
    authType: "firebase",
    userData,
  };
  req.auth = result;
  return result;
}

async function validateApiKey(key: string): Promise<AuthResult> {
  const hash = crypto.createHash("sha256").update(key).digest("hex");

  const snapshot = await db
    .collection("api_keys")
    .where("key_hash", "==", hash)
    .limit(1)
    .get();

  if (snapshot.empty) {
    throw new WakeApiServerError(
      "UNAUTHENTICATED",
      401,
      "API key inválida o revocada"
    );
  }

  const doc = snapshot.docs[0];
  const data = doc.data();

  // Production uses `revoked` boolean instead of `status`
  if (data.revoked === true) {
    throw new WakeApiServerError(
      "UNAUTHENTICATED",
      401,
      "API key inválida o revocada"
    );
  }

  // Update last_used_at (fire-and-forget)
  doc.ref.update({ last_used_at: new Date().toISOString() }).catch(() => {});

  return {
    userId: data.owner_id,
    role: "creator",
    authType: "apikey",
    scope: data.scopes || data.scope || ["read"],
    keyId: doc.id,
  };
}

async function validateFirebaseToken(
  token: string,
  req: Request
): Promise<AuthResult> {
  const isEmulator = process.env.FUNCTIONS_EMULATOR === "true";
  let decoded = getCachedToken(token);
  if (!decoded) {
    try {
      decoded = await admin.auth().verifyIdToken(token, !isEmulator);
    } catch {
      throw new WakeApiServerError(
        "UNAUTHENTICATED",
        401,
        "Token de autenticación inválido o expirado"
      );
    }
    setCachedToken(token, decoded);
  }

  // Optional App Check verification (skip in emulator).
  // Accepted risk: App Check is only validated when the header is present.
  // An attacker can omit it entirely to bypass verification. This is
  // intentional until enforcement is enabled across all clients. When ready,
  // reject requests missing the header outside emulator mode.
  if (!isEmulator) {
    const appCheckToken = req.headers["x-firebase-appcheck"] as
      | string
      | undefined;
    if (appCheckToken) {
      try {
        await admin.appCheck().verifyToken(appCheckToken);
      } catch {
        throw new WakeApiServerError(
          "UNAUTHENTICATED",
          401,
          "App Check token inválido"
        );
      }
    }
  }

  // Lookup user role from Firestore — keep full doc data for reuse by handlers
  const userDoc = await db.collection("users").doc(decoded.uid).get();
  const userData = userDoc.exists ? userDoc.data()! : null;
  const role = userData
    ? ((userData.role as "user" | "creator" | "admin") || "user")
    : "user";

  return {
    userId: decoded.uid,
    role,
    authType: "firebase",
    userData,
  };
}
