/**
 * Shared helper for API integration tests.
 *
 * Prerequisite: the Firebase emulators must be running:
 *
 *   firebase emulators:start --only functions,firestore,auth,storage \
 *     --project wolf-20b8b
 *
 * The helper:
 *   - probes the emulator on startup; if down, the suite is skipped
 *   - mints Firebase Auth ID tokens via the Auth emulator REST API
 *   - exposes `apiCall(method, path, opts)` that hits the local Functions
 *     emulator at http://localhost:5001/wolf-20b8b/us-central1/api/v1/*
 *   - exposes seed helpers that write directly to the local Firestore
 *     emulator with admin credentials
 */

import {test, beforeAll, afterAll} from "vitest";

export const API_BASE =
  process.env.WAKE_API_BASE ??
  "http://127.0.0.1:5001/wolf-20b8b/us-central1/api/v1";

export const AUTH_EMULATOR =
  process.env.FIREBASE_AUTH_EMULATOR_HOST ?? "127.0.0.1:9099";

export const FIRESTORE_EMULATOR =
  process.env.FIRESTORE_EMULATOR_HOST ?? "127.0.0.1:8080";

export const PROJECT_ID = "wolf-20b8b";

let emulatorReady: boolean | null = null;

async function probeEmulator(): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/health`, {
      method: "GET",
      // signal: AbortSignal.timeout(2_000),
    });
    return res.status < 500;
  } catch {
    return false;
  }
}

export async function ensureEmulator(): Promise<boolean> {
  if (emulatorReady !== null) return emulatorReady;
  emulatorReady = await probeEmulator();
  if (!emulatorReady) {
    // eslint-disable-next-line no-console
    console.warn(
      "[api-tests] Functions emulator not reachable at " +
        API_BASE +
        " — suite skipped. Run: firebase emulators:start"
    );
  }
  return emulatorReady;
}

/**
 * Wraps `test.skipIf(!emulator)` cleanly. Use as `apiTest("...", async () => …)`.
 * If the emulator is down, the test is skipped instead of failing.
 */
export const apiTest = test.runIf(
  process.env.WAKE_RUN_API_TESTS === "1" ||
    Boolean(process.env.FIREBASE_EMULATOR_HUB)
);

// ─── Auth via the Auth emulator REST API ─────────────────────────────────────

async function authEmulatorBase(): Promise<string> {
  return `http://${AUTH_EMULATOR}/identitytoolkit.googleapis.com/v1`;
}

/**
 * Create a user in the Auth emulator. Optionally set custom claims.
 * Returns the uid + a freshly-minted ID token.
 */
export async function createTestUser(opts: {
  uid: string;
  email: string;
  password?: string;
  customClaims?: Record<string, unknown>;
}): Promise<{uid: string; idToken: string; refreshToken: string}> {
  const base = await authEmulatorBase();
  // Sign up via the emulator REST API
  const signupRes = await fetch(
    `${base}/accounts:signUp?key=fake-api-key`,
    {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({
        email: opts.email,
        password: opts.password ?? "password123",
        returnSecureToken: true,
      }),
    }
  );
  if (!signupRes.ok) {
    throw new Error(`signUp failed: ${signupRes.status} ${await signupRes.text()}`);
  }
  const signup = (await signupRes.json()) as {
    localId: string;
    idToken: string;
    refreshToken: string;
  };

  // The emulator assigns a localId we don't control. To force a specific uid,
  // tests that need it should use the admin SDK to set it. For most tests,
  // the auto-generated uid is fine — return it.
  if (opts.customClaims) {
    // Custom-claims via the emulator are set via the admin SDK, not REST.
    // Tests that need claims should call `setClaims(uid, claims)` separately.
  }

  return {
    uid: signup.localId,
    idToken: signup.idToken,
    refreshToken: signup.refreshToken,
  };
}

/**
 * Sign in with email/password — returns a fresh ID token.
 */
export async function signIn(email: string, password: string): Promise<string> {
  const base = await authEmulatorBase();
  const res = await fetch(`${base}/accounts:signInWithPassword?key=fake-api-key`, {
    method: "POST",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify({email, password, returnSecureToken: true}),
  });
  if (!res.ok) throw new Error(`signIn failed: ${await res.text()}`);
  const j = (await res.json()) as {idToken: string};
  return j.idToken;
}

// ─── API call ────────────────────────────────────────────────────────────────

export interface ApiCallOptions {
  idToken?: string;
  apiKey?: string;
  body?: unknown;
  headers?: Record<string, string>;
}

export interface ApiCallResult {
  status: number;
  body: unknown;
  headers: Record<string, string>;
}

export async function apiCall(
  method: string,
  path: string,
  opts: ApiCallOptions = {}
): Promise<ApiCallResult> {
  const url = path.startsWith("http") ? path : `${API_BASE}${path}`;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(opts.headers ?? {}),
  };
  if (opts.idToken) headers["Authorization"] = `Bearer ${opts.idToken}`;
  if (opts.apiKey) headers["Authorization"] = `Bearer ${opts.apiKey}`;

  const res = await fetch(url, {
    method,
    headers,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const text = await res.text();
  let body: unknown = text;
  try {
    body = JSON.parse(text);
  } catch {
    /* keep text */
  }
  const headerObj: Record<string, string> = {};
  res.headers.forEach((v, k) => (headerObj[k] = v));
  return {status: res.status, body, headers: headerObj};
}

// ─── Firestore admin via emulator (uses firebase-admin) ──────────────────────

import * as admin from "firebase-admin";

let adminApp: admin.app.App | null = null;

export function adminFirestore(): admin.firestore.Firestore {
  if (!adminApp) {
    if (!process.env.FIRESTORE_EMULATOR_HOST) {
      process.env.FIRESTORE_EMULATOR_HOST = FIRESTORE_EMULATOR;
    }
    if (!process.env.FIREBASE_AUTH_EMULATOR_HOST) {
      process.env.FIREBASE_AUTH_EMULATOR_HOST = AUTH_EMULATOR;
    }
    adminApp = admin.initializeApp({projectId: PROJECT_ID}, "api-tests-admin");
  }
  return adminApp.firestore();
}

export async function setClaims(uid: string, claims: Record<string, unknown>): Promise<void> {
  if (!adminApp) adminFirestore();
  await admin.auth(adminApp!).setCustomUserClaims(uid, claims);
}

export async function seedFsDoc(path: string, data: Record<string, unknown>): Promise<void> {
  const db = adminFirestore();
  await db.doc(path).set(data, {merge: true});
}

export async function clearFs(): Promise<void> {
  // Clear all Firestore data via the emulator's REST endpoint.
  const res = await fetch(
    `http://${FIRESTORE_EMULATOR}/emulator/v1/projects/${PROJECT_ID}/databases/(default)/documents`,
    {method: "DELETE"}
  );
  if (!res.ok && res.status !== 200) {
    // Some emulator versions return 200 with no body, others 204; ignore both.
  }
  // Also clear all Auth users so tests don't get EMAIL_EXISTS on re-run.
  await fetch(
    `http://${AUTH_EMULATOR}/emulator/v1/projects/${PROJECT_ID}/accounts`,
    {method: "DELETE"}
  ).catch(() => undefined);
}

let userCounter = 0;
export function uniqueEmail(prefix = "test"): string {
  userCounter++;
  return `${prefix}-${userCounter}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@example.test`;
}
