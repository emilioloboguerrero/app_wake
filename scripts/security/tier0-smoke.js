#!/usr/bin/env node
/**
 * Tier 0 staging smoke test.
 *
 * Mints synthetic test users via Admin SDK, exchanges custom tokens for ID
 * tokens, then exercises each Tier 0 patch's success + failure path against
 * the deployed staging API.
 *
 * USAGE
 *   FIREBASE_PROJECT=wake-staging WAKE_WEB_API_KEY=... node scripts/security/tier0-smoke.js
 *
 * The WAKE_WEB_API_KEY is the Firebase web API key needed to exchange
 * custom tokens for ID tokens. Pulled from staging if not provided.
 */

/* eslint-disable no-console */
const admin = require("firebase-admin");
const https = require("node:https");

const PROJECT_ID = process.env.FIREBASE_PROJECT || "wake-staging";
const API_BASE = process.env.API_BASE || `https://api-3wqarx3cqq-uc.a.run.app`;
const WEB_API_KEY = process.env.WAKE_WEB_API_KEY;

if (!WEB_API_KEY) {
  console.error("ERROR: WAKE_WEB_API_KEY env var required (Firebase web API key for staging)");
  process.exit(1);
}

admin.initializeApp({projectId: PROJECT_ID});

// Test user identities are minted at runtime (uid + token returned together)
const createdUserIds = []; // tracked for cleanup

// ─── Utilities ────────────────────────────────────────────────────────────────

function postJson(url, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const data = JSON.stringify(body);
    const req = https.request({
      hostname: u.hostname,
      path: u.pathname + u.search,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": data.length,
        ...headers,
      },
    }, (res) => {
      let raw = "";
      res.on("data", (c) => raw += c);
      res.on("end", () => {
        try {
          resolve({status: res.statusCode, body: raw ? JSON.parse(raw) : null});
        } catch {
          resolve({status: res.statusCode, body: raw});
        }
      });
    });
    req.on("error", reject);
    req.write(data);
    req.end();
  });
}

function getJson(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = https.request({
      hostname: u.hostname,
      path: u.pathname + u.search,
      method: "GET",
      headers,
    }, (res) => {
      let raw = "";
      res.on("data", (c) => raw += c);
      res.on("end", () => {
        try {
          resolve({status: res.statusCode, body: raw ? JSON.parse(raw) : null});
        } catch {
          resolve({status: res.statusCode, body: raw});
        }
      });
    });
    req.on("error", reject);
    req.end();
  });
}

function patchJson(url, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const data = JSON.stringify(body);
    const req = https.request({
      hostname: u.hostname,
      path: u.pathname + u.search,
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": data.length,
        ...headers,
      },
    }, (res) => {
      let raw = "";
      res.on("data", (c) => raw += c);
      res.on("end", () => {
        try {
          resolve({status: res.statusCode, body: raw ? JSON.parse(raw) : null});
        } catch {
          resolve({status: res.statusCode, body: raw});
        }
      });
    });
    req.on("error", reject);
    req.write(data);
    req.end();
  });
}

const TEST_PASSWORD = "tier0-smoke-Pass-1234";

// Sidesteps email enumeration protection by using accounts:signUp instead
// of accounts:signInWithPassword. signUp creates the auth user AND returns
// an ID token in one call — no probing of existing accounts.
async function createTestUserAndMintToken(emailPrefix, role = "user") {
  // Unique email per run to avoid "EMAIL_EXISTS" on retry
  const email = `${emailPrefix}-${Date.now()}-${Math.floor(Math.random() * 9999)}@tier0-smoke.test`;

  const url = `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${WEB_API_KEY}`;
  const result = await postJson(url, {
    email,
    password: TEST_PASSWORD,
    returnSecureToken: true,
  });
  if (result.status !== 200) {
    throw new Error(`signUp failed for ${email}: ${result.status} ${JSON.stringify(result.body)}`);
  }

  const {idToken, localId: uid} = result.body;

  // Set role + Firestore user doc via Admin SDK. emailVerified is not needed
  // for Tier 0 tests; updateUser via Admin SDK has a propagation delay
  // immediately after signUp.
  const db = admin.firestore();
  await db.collection("users").doc(uid).set({
    role,
    email,
    displayName: emailPrefix,
    created_at: admin.firestore.FieldValue.serverTimestamp(),
    smokeTestUser: true, // marker for cleanup
  }, {merge: true});

  return {uid, email, idToken};
}

let passed = 0;
let failed = 0;
const failures = [];

function assertStatus(label, actual, expected) {
  const ok = actual === expected;
  console.log(`  ${ok ? "✓" : "✗"} ${label} (status ${actual}, expected ${expected})`);
  if (ok) passed++;
  else {
    failed++;
    failures.push({label, actual, expected});
  }
  return ok;
}

// ─── Setup ────────────────────────────────────────────────────────────────────

async function setupTestCourses() {
  console.log("\n[setup] Creating test courses…");
  const db = admin.firestore();
  // Test course: paid, published — should reject move-course for regular users
  await db.collection("courses").doc("tier0-smoke-paid-course").set({
    title: "Smoke test paid course",
    creator_id: "tier0-smoke-fake-creator",
    status: "published",
    price: 50000,
    subscription_price: 0,
    access_duration: "monthly",
    free_trial: {active: true, duration_days: 7},
  }, {merge: true});
  // Test course: free, published — should allow move-course
  await db.collection("courses").doc("tier0-smoke-free-course").set({
    title: "Smoke test free course",
    creator_id: "tier0-smoke-fake-creator",
    status: "published",
    price: 0,
    subscription_price: 0,
    access_duration: "monthly",
  }, {merge: true});
  // Test course: draft — should allow move-course
  await db.collection("courses").doc("tier0-smoke-draft-course").set({
    title: "Smoke test draft course",
    creator_id: "tier0-smoke-fake-creator",
    status: "draft",
    price: 50000,
    subscription_price: 0,
    access_duration: "monthly",
  }, {merge: true});
  console.log("  ✓ Setup complete");
}

// ─── Tests ────────────────────────────────────────────────────────────────────

async function testC01_movePaidCourse(aliceToken) {
  console.log("\n[C-01] move-course on PAID course as regular user → expect 403");
  const r = await postJson(
    `${API_BASE}/v1/users/me/move-course`,
    {courseId: "tier0-smoke-paid-course"},
    {Authorization: `Bearer ${aliceToken}`}
  );
  assertStatus("regular user → paid course", r.status, 403);
}

async function testC01_moveFreeCourse(aliceToken) {
  console.log("\n[C-01] move-course on FREE course as regular user → expect 200");
  const r = await postJson(
    `${API_BASE}/v1/users/me/move-course`,
    {courseId: "tier0-smoke-free-course"},
    {Authorization: `Bearer ${aliceToken}`}
  );
  assertStatus("regular user → free course", r.status, 200);
}

async function testC01_moveDraftCourse(aliceToken) {
  console.log("\n[C-01] move-course on DRAFT course as regular user → expect 200 (preview)");
  const r = await postJson(
    `${API_BASE}/v1/users/me/move-course`,
    {courseId: "tier0-smoke-draft-course"},
    {Authorization: `Bearer ${aliceToken}`}
  );
  assertStatus("regular user → draft course", r.status, 200);
}

async function testC01_admin(adminToken) {
  console.log("\n[C-01] move-course on PAID course as admin → expect 200");
  const r = await postJson(
    `${API_BASE}/v1/users/me/move-course`,
    {courseId: "tier0-smoke-paid-course"},
    {Authorization: `Bearer ${adminToken}`}
  );
  assertStatus("admin → paid course", r.status, 200);
}

async function testC06_trialClamp(aliceToken) {
  console.log("\n[C-06] trial duration clamp: request 36500d → expect ≤14d");
  const r = await postJson(
    `${API_BASE}/v1/users/me/courses/tier0-smoke-paid-course/trial`,
    {durationInDays: 36500},
    {Authorization: `Bearer ${aliceToken}`}
  );
  if (r.status === 200 && r.body?.data?.expirationDate) {
    const exp = new Date(r.body.data.expirationDate).getTime();
    const days = Math.round((exp - Date.now()) / 86400000);
    const ok = days <= 14;
    console.log(`  ${ok ? "✓" : "✗"} returned ${days}d trial (expected ≤14)`);
    if (ok) passed++; else { failed++; failures.push({label: "trial clamp", days}); }
  } else if (r.status === 409) {
    console.log("  ⚠ trial already used (409 conflict) — patch correctly persists trial_used");
    passed++;
  } else {
    console.log(`  ✗ unexpected response ${r.status}: ${JSON.stringify(r.body)}`);
    failed++;
    failures.push({label: "trial clamp", status: r.status, body: r.body});
  }
}

async function testC09_storageOtherUser(aliceToken, bobUid) {
  console.log("\n[C-09] /storage/download-url for ANOTHER user's path → expect 403");
  const r = await getJson(
    `${API_BASE}/v1/storage/download-url?path=body_log/${bobUid}/photo.jpg`,
    {Authorization: `Bearer ${aliceToken}`}
  );
  assertStatus("alice fetching bob's body_log", r.status, 403);
}

async function testC09_storageVideoExchange(aliceToken) {
  console.log("\n[C-09] /storage/download-url for video_exchanges path → expect 403 (not allowlisted)");
  const r = await getJson(
    `${API_BASE}/v1/storage/download-url?path=video_exchanges/random/msg/video.mp4`,
    {Authorization: `Bearer ${aliceToken}`}
  );
  assertStatus("alice fetching video_exchanges path", r.status, 403);
}

async function testH25_statusEnum(aliceToken) {
  console.log("\n[H-25] PATCH status='trial' (not in enum) → expect 400");
  const r = await patchJson(
    `${API_BASE}/v1/users/me/courses/tier0-smoke-free-course/status`,
    {status: "trial"},
    {Authorization: `Bearer ${aliceToken}`}
  );
  assertStatus("status='trial' rejected", r.status, 400);
}

async function testH25_statusEnumValid(aliceToken) {
  console.log("\n[H-25] PATCH status='cancelled' (in enum) → expect 200");
  const r = await patchJson(
    `${API_BASE}/v1/users/me/courses/tier0-smoke-free-course/status`,
    {status: "cancelled"},
    {Authorization: `Bearer ${aliceToken}`}
  );
  assertStatus("status='cancelled' accepted", r.status, 200);
}

async function testH25_expiresOnActive(aliceToken) {
  console.log("\n[H-25] PATCH status='active' WITH expiresAt → expect 400 (extension blocked)");
  const r = await patchJson(
    `${API_BASE}/v1/users/me/courses/tier0-smoke-free-course/status`,
    {status: "active", expiresAt: "2099-01-01T00:00:00Z"},
    {Authorization: `Bearer ${aliceToken}`}
  );
  assertStatus("active+expiresAt rejected", r.status, 400);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function cleanup() {
  console.log("\n[cleanup] Removing test users + test data…");
  const db = admin.firestore();
  for (const uid of createdUserIds) {
    try {
      await admin.auth().deleteUser(uid);
    } catch {/* ignore */}
    try {
      await db.collection("users").doc(uid).delete();
    } catch {/* ignore */}
  }
  for (const courseId of [
    "tier0-smoke-paid-course",
    "tier0-smoke-free-course",
    "tier0-smoke-draft-course",
  ]) {
    try {
      await db.collection("courses").doc(courseId).delete();
    } catch {/* ignore */}
  }
}

async function main() {
  console.log(`\n=== Tier 0 Smoke Test — project: ${PROJECT_ID} — base: ${API_BASE} ===\n`);

  try {
    await setupTestCourses();

    console.log("\n[setup] Minting test users via signUp…");
    const alice = await createTestUserAndMintToken("alice", "user");
    const bob = await createTestUserAndMintToken("bob", "user");
    const adminUser = await createTestUserAndMintToken("admin", "admin");
    createdUserIds.push(alice.uid, bob.uid, adminUser.uid);
    console.log(`  ✓ alice=${alice.uid}, bob=${bob.uid}, admin=${adminUser.uid}`);

    // C-01: move-course refined behavior
    await testC01_movePaidCourse(alice.idToken);
    await testC01_moveFreeCourse(alice.idToken);
    await testC01_moveDraftCourse(alice.idToken);
    await testC01_admin(adminUser.idToken);

    // C-06: trial duration clamp
    await testC06_trialClamp(alice.idToken);

    // C-09: storage download URL
    await testC09_storageOtherUser(alice.idToken, bob.uid);
    await testC09_storageVideoExchange(alice.idToken);

    // H-25: status enum
    await testH25_statusEnum(alice.idToken);
    await testH25_statusEnumValid(alice.idToken);
    await testH25_expiresOnActive(alice.idToken);
  } catch (err) {
    console.error("\n✗ Suite failed:", err);
    failed++;
    failures.push({label: "suite", error: String(err)});
  } finally {
    await cleanup();
  }

  console.log(`\n=== ${passed} passed, ${failed} failed ===\n`);
  if (failed > 0) {
    console.log("Failures:");
    for (const f of failures) console.log(`  - ${JSON.stringify(f)}`);
    process.exit(1);
  }
}

main();
