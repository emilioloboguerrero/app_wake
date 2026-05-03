import type {Request} from "express";
import * as admin from "firebase-admin";
import * as functions from "firebase-functions";
import * as crypto from "node:crypto";
import {db} from "../firestore.js";
import {WakeApiServerError} from "../errors.js";
import {checkRateLimit} from "./rateLimit.js";
import {enforceAppCheck} from "./appCheck.js";

// ─── In-memory token verification cache ───────────────────────────────────
// Caches decoded ID tokens by a SHA-256 hash of the raw token.
// Avoids repeated verifyIdToken network calls for the same token across
// concurrent requests (e.g. 8 dashboard queries firing simultaneously).
//
// F-MW-06:
//   - Cache key uses the FULL 32-byte SHA-256 (was: truncated to 16 hex
//     chars / 8 bytes). The truncation gave a 64-bit collision space —
//     enough for an attacker to deliberately collide a token with another
//     user's cached entry.
//   - TTL is clamped to the actual token expiry. Previously a 5-min cache
//     could serve a decoded token whose `exp` had already passed.
const TOKEN_CACHE_MAX = 50;
const TOKEN_CACHE_TTL_MS = 5 * 60 * 1000;
const tokenCache = new Map<string, { decoded: admin.auth.DecodedIdToken; expiresAt: number }>();

function tokenCacheKey(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function getCachedToken(token: string): admin.auth.DecodedIdToken | null {
  const entry = tokenCache.get(tokenCacheKey(token));
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    tokenCache.delete(tokenCacheKey(token)); return null;
  }
  return entry.decoded;
}

function setCachedToken(token: string, decoded: admin.auth.DecodedIdToken): void {
  if (tokenCache.size >= TOKEN_CACHE_MAX) {
    const firstKey = tokenCache.keys().next().value;
    if (firstKey) tokenCache.delete(firstKey);
  }
  // Clamp to the smaller of (5 min, token's own remaining lifetime). exp is
  // in seconds; convert to ms. If exp is missing or already past, fall back
  // to a tiny TTL so the cache miss happens fast.
  const tokenExpMs = (decoded.exp ?? 0) * 1000;
  const remaining = tokenExpMs - Date.now();
  const ttl = Math.min(TOKEN_CACHE_TTL_MS, Math.max(remaining, 1000));
  tokenCache.set(tokenCacheKey(token), {decoded, expiresAt: Date.now() + ttl});
}

// Diagnostic logging for verifyIdToken failures. The Admin SDK error code
// (auth/id-token-expired, auth/id-token-revoked, auth/argument-error,
// auth/project-not-found, etc.) tells us why a real user's session is failing
// without leaking the token itself. We log only the first/last few chars of
// the token hash to correlate retries from the same client.
function logVerifyIdTokenFailure(err: unknown, req: Request, token: string): void {
  const errCode = (err as { code?: string } | null)?.code ?? "unknown";
  const errMessage = err instanceof Error ? err.message : String(err);
  const tokenHash = crypto.createHash("sha256").update(token).digest("hex").slice(0, 12);
  const tokenLen = token.length;
  // Try to extract `iss`/`aud`/`uid`/`exp` from the JWT payload without
  // verifying — purely diagnostic. If parsing fails, skip silently.
  let claims: Record<string, unknown> | null = null;
  try {
    const parts = token.split(".");
    if (parts.length === 3) {
      const payloadJson = Buffer.from(parts[1], "base64url").toString("utf8");
      const payload = JSON.parse(payloadJson) as Record<string, unknown>;
      claims = {
        iss: payload.iss,
        aud: payload.aud,
        uid: payload.user_id ?? payload.sub,
        exp: payload.exp,
        iat: payload.iat,
      };
    }
  } catch {
    // ignore — token may be malformed; that's itself a useful signal
  }
  functions.logger.warn("auth:verifyIdToken-failed", {
    errCode,
    errMessage,
    tokenHash,
    tokenLen,
    claims,
    nowSec: Math.floor(Date.now() / 1000),
    path: req.path,
    method: req.method,
    origin: req.headers.origin ?? null,
    userAgent: req.headers["user-agent"] ?? null,
    appCheckPresent: !!req.headers["x-firebase-appcheck"],
  });
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
  if (!decoded) {
    try {
      decoded = await admin.auth().verifyIdToken(token, !isEmulator);
    } catch (err) {
      logVerifyIdTokenFailure(err, req, token);
      throw new WakeApiServerError("UNAUTHENTICATED", 401, "Token de autenticación inválido o expirado");
    }
    setCachedToken(token, decoded);
  }

  // App Check enforcement for first-party Firebase callers (M-14).
  // Skipped in the emulator (test fixtures don't mint App Check tokens) and
  // for the API-key path above (third-party clients can't obtain App Check).
  // Gen1 endpoints already require App Check; this brings Gen2 to parity.
  // The env escape hatch (APP_CHECK_ENFORCE=false) only relaxes the missing-
  // token case so smoke runners can authenticate; an invalid (forged/stale)
  // token always 401s regardless.
  await enforceAppCheck(req, decoded.uid, isEmulator);

  const [userDoc] = await Promise.all([
    db.collection("users").doc(decoded.uid).get(),
    checkRateLimit(decoded.uid, limitRpm, collection),
  ]);

  const userData = userDoc.exists ? userDoc.data()! : null;
  // F-MW-08: role is sourced ONLY from the decoded ID-token claim. Token
  // claims are issued by Admin SDK paths (onUserCreated for new users,
  // /creator/register for promotion). Firestore users/{uid}.role is no
  // longer authoritative — it cannot be trusted because rules let the
  // owner write it (closed by F-RULES-01) and even the locked-down rule
  // doesn't make Firestore the source of truth.
  const role = roleFromClaim(decoded);

  const result: AuthResult = {
    userId: decoded.uid,
    role,
    authType: "firebase",
    userData,
  };
  req.auth = result;
  return result;
}

function roleFromClaim(decoded: admin.auth.DecodedIdToken): "user" | "creator" | "admin" {
  const claim = (decoded as {role?: unknown}).role;
  if (claim === "creator" || claim === "admin") return claim;
  return "user";
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

  // F-NEW-03 (Round 2): the key was issued under role:"creator" assumptions
  // (scope, default rate caps, route allowlist). If the owner has been
  // demoted from `creator` since issuance, reject the key — the operator
  // can rotate manually rather than the key keeping access. Costs one extra
  // Firestore read per API key request; Wake currently has 2 keys total so
  // the cost is negligible, and any future per-key throughput growth would
  // amortize via the existing token cache layer if added.
  if (data.owner_id) {
    const ownerSnap = await db.collection("users").doc(data.owner_id).get();
    const ownerRole = ownerSnap.exists ? ownerSnap.data()?.role : null;
    if (ownerRole !== "creator" && ownerRole !== "admin") {
      throw new WakeApiServerError(
        "UNAUTHENTICATED",
        401,
        "API key inválida o revocada"
      );
    }
  }

  // Update last_used_at (fire-and-forget)
  // Audit M-29: stringify error so Firestore internals (request bodies, etc.)
  // don't end up in Cloud Logging.
  doc.ref.update({last_used_at: new Date().toISOString()})
    .catch((err) => functions.logger.warn("apikey:last-used-update-failed", {error: String(err)}));

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
    } catch (err) {
      logVerifyIdTokenFailure(err, req, token);
      throw new WakeApiServerError(
        "UNAUTHENTICATED",
        401,
        "Token de autenticación inválido o expirado"
      );
    }
    setCachedToken(token, decoded);
  }

  // App Check enforcement for first-party Firebase callers (M-14).
  // Mirrors the gate in validateAuthAndRateLimit above.
  await enforceAppCheck(req, decoded.uid, isEmulator);

  // F-MW-08: role from decoded claim only. We still read the user doc so
  // route handlers that destructure userData (profile, courses map, etc.)
  // continue to work — but role authority is the token, not Firestore.
  const userDoc = await db.collection("users").doc(decoded.uid).get();
  const userData = userDoc.exists ? userDoc.data()! : null;
  const role = roleFromClaim(decoded);

  return {
    userId: decoded.uid,
    role,
    authType: "firebase",
    userData,
  };
}
