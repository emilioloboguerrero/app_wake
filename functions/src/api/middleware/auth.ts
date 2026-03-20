import type { Request } from "express";
import * as admin from "firebase-admin";
import * as crypto from "node:crypto";
import { WakeApiServerError } from "../errors.js";

export interface AuthResult {
  userId: string;
  role: "user" | "creator" | "admin";
  authType: "firebase" | "apikey";
  scope?: string[];
  keyId?: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: AuthResult;
    }
  }
}

const db = admin.firestore();

export async function validateAuth(req: Request): Promise<AuthResult> {
  const header = req.headers.authorization;

  if (!header || typeof header !== "string" || !header.startsWith("Bearer ")) {
    throw new WakeApiServerError(
      "UNAUTHENTICATED",
      401,
      "Token de autenticación requerido"
    );
  }

  const token = header.slice(7);

  // API key path
  if (token.startsWith("wk_live_") || token.startsWith("wk_test_")) {
    return validateApiKey(token);
  }

  // Firebase ID token path
  return validateFirebaseToken(token, req);
}

async function validateApiKey(key: string): Promise<AuthResult> {
  const hash = crypto.createHash("sha256").update(key).digest("hex");

  const snapshot = await db
    .collection("api_keys")
    .where("keyHash", "==", hash)
    .where("status", "==", "active")
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

  // Update lastUsedAt (fire-and-forget)
  doc.ref.update({ lastUsedAt: new Date().toISOString() }).catch(() => {});

  return {
    userId: data.creatorId,
    role: "creator",
    authType: "apikey",
    scope: data.scope || ["read"],
    keyId: doc.id,
  };
}

async function validateFirebaseToken(
  token: string,
  req: Request
): Promise<AuthResult> {
  let decoded: admin.auth.DecodedIdToken;
  try {
    decoded = await admin.auth().verifyIdToken(token);
  } catch {
    throw new WakeApiServerError(
      "UNAUTHENTICATED",
      401,
      "Token de autenticación inválido o expirado"
    );
  }

  // Optional App Check verification (skip in emulator)
  const isEmulator = process.env.FUNCTIONS_EMULATOR === "true";
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

  // Lookup user role from Firestore
  const userDoc = await db.collection("users").doc(decoded.uid).get();
  const role = userDoc.exists
    ? ((userDoc.data()?.role as "user" | "creator" | "admin") || "user")
    : "user";

  return {
    userId: decoded.uid,
    role,
    authType: "firebase",
  };
}
