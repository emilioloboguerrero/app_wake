#!/usr/bin/env node
/**
 * Tier 1 staging smoke test.
 *
 * Mints synthetic test users via Admin SDK, exchanges custom tokens for ID
 * tokens, then exercises each Tier 1 patch's success + failure path against
 * the deployed staging API.
 *
 * Coverage:
 *   - C-02 client-sessions cross-creator overwrite blocked
 *   - H-12 client-session content/exercises cross-creator blocked
 *   - H-13 client-session content PUT/PATCH cross-creator blocked
 *   - H-14 client_programs raw body fields stripped (verified via Firestore readback)
 *   - H-28 assign-plan rejects another creator's planId (both call sites)
 *   - H-29 library sessions cross-read blocked for unrelated user
 *   - C-03 plan-content body.deletions traversal rejected
 *   - C-04 program plan-content body.deletions traversal rejected
 *   - C-05 nutrition assignments validateBody (name length, oversized category)
 *   - C-10 one_on_one_clients pending status + accept/decline + verifyClientAccess gate
 *   - M-43 wake_users_only enforced in public event registration
 *
 * Skipped (need MP sandbox or HMAC forgery):
 *   - H-15/H-16 payment race
 *   - H-17 bundle assignment race
 *   - H-21 preapproval external_reference
 *   - Firestore rules (H-01/H-04/H-03) — covered by emulator suite
 *
 * USAGE
 *   FIREBASE_PROJECT=wake-staging WAKE_WEB_API_KEY=... node scripts/security/tier1-smoke.js
 *
 * NOTE on App Check (M-14): the deployed API now enforces App Check for
 * first-party Firebase callers. The smoke runner cannot mint App Check
 * tokens server-side, so the staging functions config must set
 * APP_CHECK_ENFORCE=false during smoke runs (production keeps it unset =
 * enforced). Invalid tokens still 401 in both modes.
 */

/* eslint-disable no-console */
const admin = require("firebase-admin");
const https = require("node:https");

const PROJECT_ID = process.env.FIREBASE_PROJECT || "wake-staging";
const API_BASE = process.env.API_BASE || "https://api-3wqarx3cqq-uc.a.run.app";
const WEB_API_KEY = process.env.WAKE_WEB_API_KEY;

if (!WEB_API_KEY) {
  console.error("ERROR: WAKE_WEB_API_KEY env var required (Firebase web API key for staging)");
  process.exit(1);
}

admin.initializeApp({projectId: PROJECT_ID});

const RUN_ID = `t1-${Date.now()}`;
const createdUserIds = [];
const createdCollections = []; // [{collection, id}]

// ─── HTTP helpers ───────────────────────────────────────────────────────────

function request(method, url, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const data = body !== undefined ? JSON.stringify(body) : null;
    const reqOpts = {
      hostname: u.hostname,
      path: u.pathname + u.search,
      method,
      headers: {...headers},
    };
    if (data) {
      reqOpts.headers["Content-Type"] = "application/json";
      reqOpts.headers["Content-Length"] = Buffer.byteLength(data);
    }
    const req = https.request(reqOpts, (res) => {
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
    if (data) req.write(data);
    req.end();
  });
}

const post = (url, body, headers) => request("POST", url, body, headers);
const get = (url, headers) => request("GET", url, undefined, headers);
const patch = (url, body, headers) => request("PATCH", url, body, headers);
const put = (url, body, headers) => request("PUT", url, body, headers);

// ─── User minting (signUp bypasses email enumeration protection) ────────────

const TEST_PASSWORD = "tier1-smoke-Pass-1234";

async function mintUser(prefix, role = "user") {
  // Lowercase email throughout — matches production signup behavior and the
  // invite handler's `email.trim().toLowerCase()` lookup.
  const email = `${prefix.toLowerCase()}-${RUN_ID}-${Math.floor(Math.random() * 9999)}@tier1-smoke.test`;
  const url = `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${WEB_API_KEY}`;
  const r = await post(url, {email, password: TEST_PASSWORD, returnSecureToken: true});
  if (r.status !== 200) {
    throw new Error(`signUp failed for ${email}: ${r.status} ${JSON.stringify(r.body)}`);
  }
  const {idToken, localId: uid} = r.body;
  const db = admin.firestore();
  await db.collection("users").doc(uid).set({
    role,
    email,
    displayName: prefix,
    created_at: admin.firestore.FieldValue.serverTimestamp(),
    smokeTestUser: true,
  }, {merge: true});
  // Mint a fresh idToken with the role custom claim so requireCreator/requireAdmin
  // work via auth token role rather than the Firestore fallback.
  if (role !== "user") {
    await admin.auth().setCustomUserClaims(uid, {role});
    // Force token refresh by exchanging the password again.
    const refreshUrl = `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${WEB_API_KEY}`;
    const refresh = await post(refreshUrl, {email, password: TEST_PASSWORD, returnSecureToken: true});
    if (refresh.status === 200) {
      return {uid, email, idToken: refresh.body.idToken};
    }
  }
  return {uid, email, idToken};
}

// ─── Assertion / scoring ────────────────────────────────────────────────────

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
}

function assertEq(label, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(`  ${ok ? "✓" : "✗"} ${label} (got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)})`);
  if (ok) passed++;
  else {
    failed++;
    failures.push({label, actual, expected});
  }
}

function assertCondition(label, cond, detail = "") {
  const ok = !!cond;
  console.log(`  ${ok ? "✓" : "✗"} ${label}${detail ? ` (${detail})` : ""}`);
  if (ok) passed++;
  else {
    failed++;
    failures.push({label, detail});
  }
}

// ─── Setup ──────────────────────────────────────────────────────────────────

const COURSE_A = `${RUN_ID}-courseA`;
const COURSE_B = `${RUN_ID}-courseB`;
const LIB_SESSION_A = `${RUN_ID}-libsessA`;
const PLAN_A = `${RUN_ID}-planA`;
const PLAN_B = `${RUN_ID}-planB`;
const CLIENT_SESSION_A = `${RUN_ID}-clientsessA`; // belongs to creatorA + clientUser
const NUTRITION_ASSIGNMENT_A = `${RUN_ID}-nutA`;
const ONE_ON_ONE_A_CLIENT = `${RUN_ID}-onerelA`; // active relationship
const EVENT_OPEN = `${RUN_ID}-eventopen`;
const EVENT_WAKE_ONLY = `${RUN_ID}-eventwakeonly`;

async function seed(creatorA, creatorB, clientUser) {
  const db = admin.firestore();

  // Courses owned by each creator
  await db.collection("courses").doc(COURSE_A).set({
    title: "Smoke A course",
    creator_id: creatorA.uid,
    status: "published",
    price: 50000,
    subscription_price: 0,
    access_duration: "monthly",
  });
  createdCollections.push({collection: "courses", id: COURSE_A});

  await db.collection("courses").doc(COURSE_B).set({
    title: "Smoke B course",
    creator_id: creatorB.uid,
    status: "published",
    price: 50000,
    subscription_price: 0,
    access_duration: "monthly",
  });
  createdCollections.push({collection: "courses", id: COURSE_B});

  // Active 1-on-1 between A and clientUser
  await db.collection("one_on_one_clients").doc(ONE_ON_ONE_A_CLIENT).set({
    creatorId: creatorA.uid,
    clientUserId: clientUser.uid,
    status: "active",
    clientName: clientUser.email,
    clientEmail: clientUser.email,
    courseId: [],
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  createdCollections.push({collection: "one_on_one_clients", id: ONE_ON_ONE_A_CLIENT});

  // Enroll clientUser in courseA so library access via "enrolled course" path works
  await db.collection("users").doc(clientUser.uid).set({
    courses: {
      [COURSE_A]: {
        status: "active",
        access_duration: "monthly",
        title: "Smoke A course",
        deliveryType: "one_on_one",
        purchased_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString(),
      },
    },
  }, {merge: true});

  // Library session owned by creatorA
  await db.collection("creator_libraries").doc(creatorA.uid)
    .collection("sessions").doc(LIB_SESSION_A).set({
      title: "Smoke library session",
      version: 1,
      created_at: admin.firestore.FieldValue.serverTimestamp(),
    });

  // Plans owned by each creator
  await db.collection("plans").doc(PLAN_A).set({
    title: "Plan A",
    creator_id: creatorA.uid,
    creatorName: "creatorA",
    created_at: admin.firestore.FieldValue.serverTimestamp(),
  });
  createdCollections.push({collection: "plans", id: PLAN_A});

  await db.collection("plans").doc(PLAN_B).set({
    title: "Plan B",
    creator_id: creatorB.uid,
    creatorName: "creatorB",
    created_at: admin.firestore.FieldValue.serverTimestamp(),
  });
  createdCollections.push({collection: "plans", id: PLAN_B});

  // Add at least one module to each plan so assign-plan validation passes for
  // the success-path call.
  await db.collection("plans").doc(PLAN_A).collection("modules").doc("m1").set({
    title: "Week 1", order: 0,
  });
  await db.collection("plans").doc(PLAN_B).collection("modules").doc("m1").set({
    title: "Week 1", order: 0,
  });

  // client_sessions doc owned by creatorA + clientUser
  await db.collection("client_sessions").doc(CLIENT_SESSION_A).set({
    creator_id: creatorA.uid,
    client_id: clientUser.uid,
    title: "Smoke client session",
    date: "2026-05-01",
    created_at: admin.firestore.FieldValue.serverTimestamp(),
  });
  createdCollections.push({collection: "client_sessions", id: CLIENT_SESSION_A});

  // nutrition_assignments doc for C-05 PUT path
  await db.collection("nutrition_assignments").doc(NUTRITION_ASSIGNMENT_A).set({
    assignedBy: creatorA.uid,
    userId: clientUser.uid,
    planName: "Smoke plan",
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  createdCollections.push({collection: "nutrition_assignments", id: NUTRITION_ASSIGNMENT_A});

  // Events: one open, one wake_users_only
  await db.collection("events").doc(EVENT_OPEN).set({
    title: "Smoke open event",
    creator_id: creatorA.uid,
    status: "published",
    wake_users_only: false,
    capacity: 100,
    fields: [],
  });
  createdCollections.push({collection: "events", id: EVENT_OPEN});

  await db.collection("events").doc(EVENT_WAKE_ONLY).set({
    title: "Smoke wake-only event",
    creator_id: creatorA.uid,
    status: "published",
    wake_users_only: true,
    capacity: 100,
    fields: [],
  });
  createdCollections.push({collection: "events", id: EVENT_WAKE_ONLY});

  console.log("  ✓ Seed complete");
}

// ─── Tests ──────────────────────────────────────────────────────────────────

async function testC02_putClientSessionCrossCreator(creatorB, clientB) {
  console.log("\n[C-02] PUT client-sessions on another creator's sessionId → expect 403");
  const r = await put(
    `${API_BASE}/v1/creator/clients/${clientB.uid}/client-sessions/${CLIENT_SESSION_A}`,
    {date: "2026-05-02", title: "Hijack attempt"},
    {Authorization: `Bearer ${creatorB.idToken}`}
  );
  assertStatus("creatorB → creatorA's clientSessionId blocked", r.status, 403);
}

async function testH13_putContentCrossCreator(creatorB, clientB) {
  console.log("\n[H-13] PUT content on another creator's clientSessionId → expect 403");
  const r = await put(
    `${API_BASE}/v1/creator/clients/${clientB.uid}/client-sessions/${CLIENT_SESSION_A}/content`,
    {title: "Hijack content", exercises: []},
    {Authorization: `Bearer ${creatorB.idToken}`}
  );
  assertStatus("creatorB content PUT blocked", r.status, 403);
}

async function testH13_patchContentCrossCreator(creatorB, clientB) {
  console.log("\n[H-13] PATCH content on another creator's clientSessionId → expect 403/404");
  const r = await patch(
    `${API_BASE}/v1/creator/clients/${clientB.uid}/client-sessions/${CLIENT_SESSION_A}/content`,
    {title: "Hijack patch"},
    {Authorization: `Bearer ${creatorB.idToken}`}
  );
  // FORBIDDEN before doc fetch (verifyClientSessionOwnership) — 403
  assertStatus("creatorB content PATCH blocked", r.status, 403);
}

async function testH12_patchExerciseCrossCreator(creatorB, clientB) {
  console.log("\n[H-12] PATCH content/exercises on another creator's clientSessionId → expect 403");
  const r = await patch(
    `${API_BASE}/v1/creator/clients/${clientB.uid}/client-sessions/${CLIENT_SESSION_A}/content/exercises/anyId`,
    {displayName: "Hijack ex"},
    {Authorization: `Bearer ${creatorB.idToken}`}
  );
  assertStatus("creatorB exercise PATCH blocked", r.status, 403);
}

async function testH14_clientProgramFieldStrip(clientUser) {
  console.log("\n[H-14] POST /workout/client-programs strips disallowed fields");
  const programId = `${RUN_ID}-prog`;
  const r = await post(
    `${API_BASE}/v1/workout/client-programs/${programId}`,
    {
      currentSessionId: "valid-1",
      progress: 0.5,
      // Disallowed fields that should be stripped:
      creator_id: "attacker",
      assigned_by: "attacker",
      expires_at: "2099-01-01T00:00:00Z",
      status: "completed",
    },
    {Authorization: `Bearer ${clientUser.idToken}`}
  );
  assertStatus("POST client-programs accepted", r.status, 200);

  // Read back via Admin SDK and verify disallowed fields are NOT set
  const db = admin.firestore();
  const docId = `${clientUser.uid}_${programId}`;
  const doc = await db.collection("client_programs").doc(docId).get();
  createdCollections.push({collection: "client_programs", id: docId});
  const data = doc.data() || {};
  assertCondition(
    "currentSessionId persisted",
    data.currentSessionId === "valid-1",
    `got ${data.currentSessionId}`
  );
  assertCondition(
    "creator_id NOT injected",
    data.creator_id === undefined,
    `got ${data.creator_id}`
  );
  assertCondition(
    "assigned_by NOT injected",
    data.assigned_by === undefined,
    `got ${data.assigned_by}`
  );
  assertCondition(
    "expires_at NOT injected",
    data.expires_at === undefined,
    `got ${data.expires_at}`
  );
  assertCondition(
    "status NOT injected",
    data.status === undefined,
    `got ${data.status}`
  );
}

async function testH28_assignPlanCrossCreator(creatorA, clientUser) {
  console.log("\n[H-28] assign-plan with another creator's planId → expect 404");
  // Need a client_program for this client+programA so verifyClientAccess passes.
  // creatorA owns courseA and has active 1-on-1 with clientUser, so call assigns
  // PLAN_B (owned by creatorB) — should be blocked.
  const r = await post(
    `${API_BASE}/v1/creator/clients/${clientUser.uid}/programs/${COURSE_A}/assign-plan`,
    {planId: PLAN_B, startWeekKey: "2026-W18"},
    {Authorization: `Bearer ${creatorA.idToken}`}
  );
  assertStatus("creatorA assigning creatorB's plan blocked", r.status, 404);
}

async function testH28_assignPlanProgramCrossCreator(creatorA) {
  console.log("\n[H-28] /creator/programs assign-plan with another creator's planId → expect 404");
  const r = await post(
    `${API_BASE}/v1/creator/programs/${COURSE_A}/assign-plan`,
    {planId: PLAN_B, startWeekKey: "2026-W18"},
    {Authorization: `Bearer ${creatorA.idToken}`}
  );
  assertStatus("creatorA program assign of creatorB's plan blocked", r.status, 404);
}

async function testH28_assignPlanOwnPlanSucceeds(creatorA) {
  console.log("\n[H-28] /creator/programs assign-plan with OWN planId → expect 200");
  const r = await post(
    `${API_BASE}/v1/creator/programs/${COURSE_A}/assign-plan`,
    {planId: PLAN_A, startWeekKey: "2026-W19"},
    {Authorization: `Bearer ${creatorA.idToken}`}
  );
  assertStatus("creatorA assigning own plan accepted", r.status, 200);
}

async function testH29_libraryUnrelatedUser(randomUser, creatorA) {
  console.log("\n[H-29] /library/sessions as unrelated user → expect 403");
  const r = await get(
    `${API_BASE}/v1/library/sessions/${LIB_SESSION_A}?creatorId=${creatorA.uid}`,
    {Authorization: `Bearer ${randomUser.idToken}`}
  );
  assertStatus("randomUser → creatorA library blocked", r.status, 403);
}

async function testH29_libraryEnrolledClient(clientUser, creatorA) {
  console.log("\n[H-29] /library/sessions as enrolled client → expect 200");
  const r = await get(
    `${API_BASE}/v1/library/sessions/${LIB_SESSION_A}?creatorId=${creatorA.uid}`,
    {Authorization: `Bearer ${clientUser.idToken}`}
  );
  assertStatus("clientUser (enrolled) → creatorA library allowed", r.status, 200);
}

async function testH29_libraryOwner(creatorA) {
  console.log("\n[H-29] /library/sessions as owner → expect 200");
  const r = await get(
    `${API_BASE}/v1/library/sessions/${LIB_SESSION_A}?creatorId=${creatorA.uid}`,
    {Authorization: `Bearer ${creatorA.idToken}`}
  );
  assertStatus("creatorA → own library allowed", r.status, 200);
}

async function testC03_pathTraversalDeletion(creatorA, clientUser) {
  console.log("\n[C-03] plan-content body.deletions traversal rejected → expect 400");
  const r = await put(
    `${API_BASE}/v1/creator/clients/${clientUser.uid}/plan-content/2026-W18`,
    {programId: COURSE_A, sessions: [], deletions: ["../etc/passwd"]},
    {Authorization: `Bearer ${creatorA.idToken}`}
  );
  assertStatus("../etc/passwd rejected", r.status, 400);
}

async function testC03_disallowedCollectionDeletion(creatorA, clientUser) {
  console.log("\n[C-03] plan-content body.deletions to non-allowlisted collection → expect 400");
  const r = await put(
    `${API_BASE}/v1/creator/clients/${clientUser.uid}/plan-content/2026-W18`,
    {programId: COURSE_A, sessions: [], deletions: ["users/alice"]},
    {Authorization: `Bearer ${creatorA.idToken}`}
  );
  assertStatus("users/alice rejected", r.status, 400);
}

async function testC03_validDeletionAccepted(creatorA, clientUser) {
  console.log("\n[C-03] plan-content body.deletions=['sessions/s1'] → expect 200");
  const r = await put(
    `${API_BASE}/v1/creator/clients/${clientUser.uid}/plan-content/2026-W18`,
    {programId: COURSE_A, sessions: [], deletions: ["sessions/abc-123"]},
    {Authorization: `Bearer ${creatorA.idToken}`}
  );
  assertStatus("valid sessions/<id> deletion accepted", r.status, 200);
}

async function testC04_programPathTraversal(creatorA) {
  console.log("\n[C-04] /creator/programs plan-content traversal rejected → expect 400");
  const r = await put(
    `${API_BASE}/v1/creator/programs/${COURSE_A}/plan-content/2026-W18`,
    {sessions: [], deletions: ["sessions/s1/exercises/e1/sets/s1/extras/x"]},
    {Authorization: `Bearer ${creatorA.idToken}`}
  );
  // depth > 3 → rejected
  assertStatus("over-deep deletion path rejected", r.status, 400);
}

async function testC05_nutritionNameTooLong(creatorA, clientUser) {
  console.log("\n[C-05] nutrition PUT name > 200 chars → expect 400");
  const r = await put(
    `${API_BASE}/v1/creator/clients/${clientUser.uid}/nutrition/assignments/${NUTRITION_ASSIGNMENT_A}/content`,
    {name: "x".repeat(250), description: "ok"},
    {Authorization: `Bearer ${creatorA.idToken}`}
  );
  assertStatus("name > 200 chars rejected", r.status, 400);
}

async function testC05_nutritionOversizedCategory(creatorA, clientUser) {
  console.log("\n[C-05] nutrition PUT with > 100KB single category → expect 400");
  // Per-category cap is now 100 KB (raised from 5 KB after the original cap
  // rejected legitimate library payloads). Push past the new cap.
  const big = {meal: "x".repeat(120_000)};
  const r = await put(
    `${API_BASE}/v1/creator/clients/${clientUser.uid}/nutrition/assignments/${NUTRITION_ASSIGNMENT_A}/content`,
    {name: "ok", categories: [big]},
    {Authorization: `Bearer ${creatorA.idToken}`}
  );
  assertStatus("oversized single category rejected", r.status, 400);
}

async function testC05_nutritionTotalCategoriesOversized(creatorA, clientUser) {
  console.log("\n[C-05] nutrition PUT with combined categories > 800KB → expect 400");
  // Each category 30 KB, 40 of them → ~1.2 MB total → exceeds the 800 KB
  // combined cap (still under each category's 100 KB ceiling).
  const cats = Array.from({length: 40}, (_, i) => ({i, blob: "x".repeat(30_000)}));
  const r = await put(
    `${API_BASE}/v1/creator/clients/${clientUser.uid}/nutrition/assignments/${NUTRITION_ASSIGNMENT_A}/content`,
    {name: "ok", categories: cats},
    {Authorization: `Bearer ${creatorA.idToken}`}
  );
  assertStatus("combined oversized categories rejected", r.status, 400);
}

async function testC05_nutritionTooManyCategories(creatorA, clientUser) {
  console.log("\n[C-05] nutrition PUT with categories > 50 → expect 400");
  const cats = Array.from({length: 60}, (_, i) => ({i}));
  const r = await put(
    `${API_BASE}/v1/creator/clients/${clientUser.uid}/nutrition/assignments/${NUTRITION_ASSIGNMENT_A}/content`,
    {name: "ok", categories: cats},
    {Authorization: `Bearer ${creatorA.idToken}`}
  );
  assertStatus("> 50 categories rejected", r.status, 400);
}

async function testC05_nutritionValid(creatorA, clientUser) {
  console.log("\n[C-05] nutrition PUT valid small payload → expect 200");
  const r = await put(
    `${API_BASE}/v1/creator/clients/${clientUser.uid}/nutrition/assignments/${NUTRITION_ASSIGNMENT_A}/content`,
    {
      name: "Valid plan",
      description: "desc",
      daily_calories: 2000,
      daily_protein_g: 150,
      categories: [{label: "Breakfast", items: []}],
    },
    {Authorization: `Bearer ${creatorA.idToken}`}
  );
  assertStatus("valid nutrition payload accepted", r.status, 200);
}

async function testC10_inviteCreatesPending(creatorA, clientUser) {
  console.log("\n[C-10] invite creates pending status (verifyClientAccess blocks)");
  const r = await post(
    `${API_BASE}/v1/creator/clients/invite`,
    {email: clientUser.email},
    {Authorization: `Bearer ${creatorA.idToken}`}
  );
  assertStatus("invite POST accepted", r.status, 201);
  // Verify Firestore doc has status='pending'
  const db = admin.firestore();
  const snap = await db.collection("one_on_one_clients")
    .where("creatorId", "==", creatorA.uid)
    .where("clientUserId", "==", clientUser.uid)
    .where("status", "==", "pending")
    .limit(1)
    .get();
  assertCondition("Firestore row has status=pending", !snap.empty,
    snap.empty ? "no pending doc found" : `id=${snap.docs[0].id}`);
  if (!snap.empty) createdCollections.push({collection: "one_on_one_clients", id: snap.docs[0].id});
  return snap.empty ? null : snap.docs[0].id;
}

async function testC10_pendingBlocksOperations(creatorA, pendingClientUser) {
  console.log("\n[C-10] verifyClientAccess blocks PUT while pending → expect 403");
  // Try to PUT a client-session for this pending client
  const sessionId = `${RUN_ID}-blocked-sess`;
  const r = await put(
    `${API_BASE}/v1/creator/clients/${pendingClientUser.uid}/client-sessions/${sessionId}`,
    {date: "2026-05-03"},
    {Authorization: `Bearer ${creatorA.idToken}`}
  );
  assertStatus("operations blocked while pending", r.status, 403);
}

async function testC10_listRelationshipsAsClient(pendingClientUser) {
  console.log("\n[C-10] GET /users/me/client-relationships?status=pending → see invite");
  const r = await get(
    `${API_BASE}/v1/users/me/client-relationships?status=pending`,
    {Authorization: `Bearer ${pendingClientUser.idToken}`}
  );
  assertStatus("list pending invites accepted", r.status, 200);
  const items = r.body?.data || [];
  assertCondition("pending invite is listed", items.length >= 1,
    `got ${items.length} items`);
}

async function testC10_acceptUnknownRelationship(pendingClientUser) {
  console.log("\n[C-10] accept unknown relationshipId → expect 404");
  const r = await post(
    `${API_BASE}/v1/users/me/client-relationships/nonexistent-id/accept`,
    {},
    {Authorization: `Bearer ${pendingClientUser.idToken}`}
  );
  assertStatus("accept unknown id rejected", r.status, 404);
}

async function testC10_acceptOtherUsersRelationship(creatorA, otherUser, relationshipId) {
  console.log("\n[C-10] accept somebody else's pending relationship → expect 403");
  const r = await post(
    `${API_BASE}/v1/users/me/client-relationships/${relationshipId}/accept`,
    {},
    {Authorization: `Bearer ${otherUser.idToken}`}
  );
  assertStatus("accepting another user's invite blocked", r.status, 403);
}

async function testC10_acceptValid(pendingClientUser, relationshipId) {
  console.log("\n[C-10] accept own pending relationship → expect 200, status active");
  const r = await post(
    `${API_BASE}/v1/users/me/client-relationships/${relationshipId}/accept`,
    {},
    {Authorization: `Bearer ${pendingClientUser.idToken}`}
  );
  assertStatus("accept accepted", r.status, 200);
  assertCondition("response status=active", r.body?.data?.status === "active",
    `got ${r.body?.data?.status}`);
}

async function testC10_postAcceptOpsAllowed(creatorA, clientUser) {
  console.log("\n[C-10] post-accept: creator can now operate on client → expect 200");
  const sessionId = `${RUN_ID}-postaccept-sess`;
  const r = await put(
    `${API_BASE}/v1/creator/clients/${clientUser.uid}/client-sessions/${sessionId}`,
    {date: "2026-05-04", title: "Post-accept session"},
    {Authorization: `Bearer ${creatorA.idToken}`}
  );
  createdCollections.push({collection: "client_sessions", id: sessionId});
  assertStatus("post-accept PUT accepted", r.status, 200);
}

// C-10 v2: pending-aware program assignment + auto-grant on accept
async function testC10v2_assignToPendingAttachesProgram(creatorA, pendingUser) {
  console.log("\n[C-10v2] assigning a program to pending user → expect 202 + relationship gets pendingProgramAssignment");
  // Step 1: invite the user (creates pending relationship).
  await post(
    `${API_BASE}/v1/creator/clients/invite`,
    {email: pendingUser.email},
    {Authorization: `Bearer ${creatorA.idToken}`}
  );
  // Step 2: creator hits the program-assign endpoint while user still pending.
  const r = await post(
    `${API_BASE}/v1/creator/clients/${pendingUser.uid}/programs/${COURSE_A}`,
    {accessDuration: "monthly"},
    {Authorization: `Bearer ${creatorA.idToken}`}
  );
  assertStatus("assign-to-pending returns 202", r.status, 202);
  assertCondition("response status=pending", r.body?.data?.status === "pending",
    `got ${r.body?.data?.status}`);
  const db = admin.firestore();
  const snap = await db.collection("one_on_one_clients")
    .where("creatorId", "==", creatorA.uid)
    .where("clientUserId", "==", pendingUser.uid)
    .limit(1).get();
  const pending = snap.empty ? null : snap.docs[0].data().pendingProgramAssignment;
  assertCondition("pendingProgramAssignment.programId set on row",
    pending?.programId === COURSE_A,
    `got ${JSON.stringify(pending)}`);
  return snap.empty ? null : snap.docs[0].id;
}

async function testC10v2_pendingClientDetailDenied(creatorA, pendingUser, relationshipId) {
  console.log("\n[C-10v2] GET /creator/clients/:relId while pending → expect 403");
  if (!relationshipId) {
    console.log("  ✗ skipped — no relationshipId");
    failed++; failures.push({label: "C-10v2 pending-detail missing relationshipId"}); return;
  }
  const r = await get(
    `${API_BASE}/v1/creator/clients/${relationshipId}`,
    {Authorization: `Bearer ${creatorA.idToken}`}
  );
  assertStatus("client detail blocked while pending", r.status, 403);
  // Also confirm the list endpoint redacts pending rows (no avatar / no
  // session stats on the pending row).
  const list = await get(
    `${API_BASE}/v1/creator/clients`,
    {Authorization: `Bearer ${creatorA.idToken}`}
  );
  const row = (list.body?.data || []).find((c) => c.id === relationshipId);
  assertCondition("pending row in list has no avatarUrl",
    row && !row.avatarUrl,
    `got ${JSON.stringify(row?.avatarUrl)}`);
  assertCondition("pending row exposes pendingProgramAssignment",
    row?.pendingProgramAssignment?.programId === COURSE_A,
    `got ${JSON.stringify(row?.pendingProgramAssignment)}`);
}

async function testC10v2_acceptAppliesPendingProgram(pendingUser, relationshipId) {
  console.log("\n[C-10v2] accept invite that carries a pending program → expect program assigned to user.courses");
  if (!relationshipId) {
    console.log("  ✗ skipped — no relationshipId");
    failed++; failures.push({label: "C-10v2 missing relationshipId"}); return;
  }
  const r = await post(
    `${API_BASE}/v1/users/me/client-relationships/${relationshipId}/accept`,
    {},
    {Authorization: `Bearer ${pendingUser.idToken}`}
  );
  assertStatus("accept returns 200", r.status, 200);
  assertCondition("response programAssigned=true", r.body?.data?.programAssigned === true,
    `got ${JSON.stringify(r.body?.data)}`);
  // Verify user.courses got populated.
  const db = admin.firestore();
  const userDoc = await db.collection("users").doc(pendingUser.uid).get();
  const course = userDoc.data()?.courses?.[COURSE_A];
  assertCondition("user.courses[COURSE_A] exists with status=active",
    course?.status === "active",
    `got ${JSON.stringify(course)}`);
  assertCondition("user.courses[COURSE_A].deliveryType=one_on_one",
    course?.deliveryType === "one_on_one",
    `got ${course?.deliveryType}`);
}

async function testC10_decline(creatorA, declineUser) {
  console.log("\n[C-10] decline flow: invite → decline → status declined");
  const r1 = await post(
    `${API_BASE}/v1/creator/clients/invite`,
    {email: declineUser.email},
    {Authorization: `Bearer ${creatorA.idToken}`}
  );
  assertStatus("decline-flow invite accepted", r1.status, 201);
  const db = admin.firestore();
  const snap = await db.collection("one_on_one_clients")
    .where("creatorId", "==", creatorA.uid)
    .where("clientUserId", "==", declineUser.uid)
    .where("status", "==", "pending")
    .limit(1)
    .get();
  if (snap.empty) {
    failed++;
    failures.push({label: "decline-flow no pending doc"});
    return;
  }
  const relId = snap.docs[0].id;
  createdCollections.push({collection: "one_on_one_clients", id: relId});

  const r2 = await post(
    `${API_BASE}/v1/users/me/client-relationships/${relId}/decline`,
    {},
    {Authorization: `Bearer ${declineUser.idToken}`}
  );
  assertStatus("decline accepted", r2.status, 200);
  assertCondition("response status=declined", r2.body?.data?.status === "declined",
    `got ${r2.body?.data?.status}`);
}

async function testM43_wakeOnlyEventBlocksAnon() {
  console.log("\n[M-43] register to wake_users_only event without auth → expect 401");
  const r = await post(
    `${API_BASE}/v1/events/${EVENT_WAKE_ONLY}/register`,
    {email: "anon@example.com", displayName: "Anon"}
  );
  assertStatus("anon register to wake-only blocked", r.status, 401);
}

async function testM43_openEventAllowsAnon() {
  console.log("\n[M-43] register to open event without auth → expect 201");
  const r = await post(
    `${API_BASE}/v1/events/${EVENT_OPEN}/register`,
    {email: `anon-${RUN_ID}@example.com`, displayName: "Anon"}
  );
  assertStatus("anon register to open event accepted", r.status, 201);
  // No way to clean up the registration easily without registrationId; the
  // test event is unique per run so leftover docs are isolated.
}

async function testM43_wakeOnlyAllowsAuthed(clientUser) {
  console.log("\n[M-43] register to wake_users_only event WITH auth → expect 201");
  const r = await post(
    `${API_BASE}/v1/events/${EVENT_WAKE_ONLY}/register`,
    {email: clientUser.email, displayName: "Authed"},
    {Authorization: `Bearer ${clientUser.idToken}`}
  );
  assertStatus("authed register to wake-only accepted", r.status, 201);
}

// ─── tier-finish: validateBody schemas (M-08 / M-11 / M-12) ────────────────

async function testM08_programsFreeTrialDurationOutOfRange(creatorA) {
  console.log("\n[M-08] POST /creator/programs free_trial.duration_days > 365 → expect 400");
  const r = await post(
    `${API_BASE}/v1/creator/programs`,
    {
      title: "Smoke M-08 prog",
      deliveryType: "low_ticket",
      free_trial: {active: true, duration_days: 9999},
    },
    {Authorization: `Bearer ${creatorA.idToken}`}
  );
  assertStatus("oversized free_trial.duration_days rejected", r.status, 400);
}

async function testM08_programsAvailableLibrariesArrayShape(creatorA) {
  console.log("\n[M-08] POST /creator/programs availableLibraries non-array → expect 400");
  const r = await post(
    `${API_BASE}/v1/creator/programs`,
    {
      title: "Smoke M-08 prog 2",
      deliveryType: "low_ticket",
      availableLibraries: "not-an-array",
    },
    {Authorization: `Bearer ${creatorA.idToken}`}
  );
  assertStatus("non-array availableLibraries rejected", r.status, 400);
}

async function testM24_programsPriceInteger(creatorA) {
  console.log("\n[M-24] POST /creator/programs price = 1.5 → expect 400");
  const r = await post(
    `${API_BASE}/v1/creator/programs`,
    {title: "Smoke M-24 prog", deliveryType: "low_ticket", price: 1.5},
    {Authorization: `Bearer ${creatorA.idToken}`}
  );
  assertStatus("non-integer price rejected", r.status, 400);
}

async function testM11_plansMissingTitle(creatorA) {
  console.log("\n[M-11] POST /creator/plans without title → expect 400");
  const r = await post(
    `${API_BASE}/v1/creator/plans`,
    {description: "no title"},
    {Authorization: `Bearer ${creatorA.idToken}`}
  );
  assertStatus("plans missing title rejected", r.status, 400);
}

async function testM12_lookupNonStringEmail(creatorA) {
  console.log("\n[M-12] POST /creator/clients/lookup emailOrUsername=number → expect 400");
  const r = await post(
    `${API_BASE}/v1/creator/clients/lookup`,
    {emailOrUsername: 12345},
    {Authorization: `Bearer ${creatorA.idToken}`}
  );
  assertStatus("non-string lookup body rejected", r.status, 400);
}

async function testM12_inviteEmailTooLong(creatorA) {
  console.log("\n[M-12] POST /creator/clients/invite long email → expect 400");
  const longEmail = `${"a".repeat(500)}@example.com`;
  const r = await post(
    `${API_BASE}/v1/creator/clients/invite`,
    {email: longEmail},
    {Authorization: `Bearer ${creatorA.idToken}`}
  );
  assertStatus("oversized invite email rejected", r.status, 400);
}

// ─── Cleanup ────────────────────────────────────────────────────────────────

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
  // Remove all created docs
  for (const {collection, id} of createdCollections) {
    try {
      await db.collection(collection).doc(id).delete();
    } catch {/* ignore */}
  }
  // Library session subcollection requires manual delete
  // (best effort — leftover staging data is fine)
  // Plans: the modules subcollections + plan doc deletion are separate
  for (const planId of [PLAN_A, PLAN_B]) {
    try {
      const mods = await db.collection("plans").doc(planId).collection("modules").get();
      for (const m of mods.docs) await m.ref.delete();
    } catch {/* ignore */}
  }
  // event_signups subcollections (best effort)
  for (const eid of [EVENT_OPEN, EVENT_WAKE_ONLY]) {
    try {
      const regs = await db.collection("event_signups").doc(eid).collection("registrations").get();
      for (const r of regs.docs) await r.ref.delete();
    } catch {/* ignore */}
  }
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n=== Tier 1 Smoke — project: ${PROJECT_ID} — base: ${API_BASE} — run ${RUN_ID} ===\n`);
  let creatorA; let creatorB; let clientUser; let randomUser;
  let pendingUserA; let pendingUserB; let declineUser;
  try {
    console.log("[setup] Minting users…");
    [creatorA, creatorB, clientUser, randomUser, pendingUserA, pendingUserB, declineUser] = await Promise.all([
      mintUser("creatorA", "creator"),
      mintUser("creatorB", "creator"),
      mintUser("client", "user"),
      mintUser("random", "user"),
      mintUser("pendingA", "user"),
      mintUser("pendingB", "user"),
      mintUser("decline", "user"),
    ]);
    createdUserIds.push(
      creatorA.uid, creatorB.uid, clientUser.uid, randomUser.uid,
      pendingUserA.uid, pendingUserB.uid, declineUser.uid,
    );
    console.log(`  ✓ users minted`);

    console.log("\n[setup] Seeding fixtures…");
    await seed(creatorA, creatorB, clientUser);

    // Creator B needs at least one client to pass verifyClientAccess on cross-creator tests.
    // Insert an active 1-on-1 between creatorB and a fresh user (we'll use clientUser too — wait,
    // we need clientUser to be only A's client. Create a separate B client.)
    const clientB = await mintUser("clientB", "user");
    createdUserIds.push(clientB.uid);
    const db = admin.firestore();
    await db.collection("one_on_one_clients").add({
      creatorId: creatorB.uid,
      clientUserId: clientB.uid,
      status: "active",
      clientName: clientB.email,
      clientEmail: clientB.email,
      courseId: [],
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    // ── C-02 / H-12 / H-13 cross-creator content writes ──
    await testC02_putClientSessionCrossCreator(creatorB, clientB);
    await testH13_putContentCrossCreator(creatorB, clientB);
    await testH13_patchContentCrossCreator(creatorB, clientB);
    await testH12_patchExerciseCrossCreator(creatorB, clientB);

    // ── H-14 client_programs raw body strip ──
    await testH14_clientProgramFieldStrip(clientUser);

    // ── H-28 assign-plan ownership (both call sites) ──
    await testH28_assignPlanCrossCreator(creatorA, clientUser);
    await testH28_assignPlanProgramCrossCreator(creatorA);
    await testH28_assignPlanOwnPlanSucceeds(creatorA);

    // ── H-29 library cross-read ──
    await testH29_libraryUnrelatedUser(randomUser, creatorA);
    await testH29_libraryEnrolledClient(clientUser, creatorA);
    await testH29_libraryOwner(creatorA);

    // ── C-03 / C-04 path traversal ──
    await testC03_pathTraversalDeletion(creatorA, clientUser);
    await testC03_disallowedCollectionDeletion(creatorA, clientUser);
    await testC03_validDeletionAccepted(creatorA, clientUser);
    await testC04_programPathTraversal(creatorA);

    // ── C-05 nutrition validation ──
    await testC05_nutritionNameTooLong(creatorA, clientUser);
    await testC05_nutritionOversizedCategory(creatorA, clientUser);
    await testC05_nutritionTotalCategoriesOversized(creatorA, clientUser);
    await testC05_nutritionTooManyCategories(creatorA, clientUser);
    await testC05_nutritionValid(creatorA, clientUser);

    // ── C-10 pending status + accept/decline ──
    const pendingRelId = await testC10_inviteCreatesPending(creatorA, pendingUserA);
    await testC10_pendingBlocksOperations(creatorA, pendingUserA);
    await testC10_listRelationshipsAsClient(pendingUserA);
    await testC10_acceptUnknownRelationship(pendingUserA);
    if (pendingRelId) {
      await testC10_acceptOtherUsersRelationship(creatorA, pendingUserB, pendingRelId);
      await testC10_acceptValid(pendingUserA, pendingRelId);
      await testC10_postAcceptOpsAllowed(creatorA, pendingUserA);
    }
    await testC10_decline(creatorA, declineUser);

    // ── C-10 v2: pending-aware assign + auto-grant on accept ──
    // Use a freshly-minted user so we're not interfering with prior pendingUserA state.
    const c10v2User = await mintUser("c10v2", "user");
    createdUserIds.push(c10v2User.uid);
    const c10v2RelId = await testC10v2_assignToPendingAttachesProgram(creatorA, c10v2User);
    if (c10v2RelId) {
      createdCollections.push({collection: "one_on_one_clients", id: c10v2RelId});
    }
    await testC10v2_pendingClientDetailDenied(creatorA, c10v2User, c10v2RelId);
    await testC10v2_acceptAppliesPendingProgram(c10v2User, c10v2RelId);

    // ── M-43 wake_users_only ──
    await testM43_wakeOnlyEventBlocksAnon();
    await testM43_openEventAllowsAnon();
    await testM43_wakeOnlyAllowsAuthed(clientUser);

    // ── tier-finish: validateBody schemas (M-08, M-11, M-12, M-24) ──
    await testM08_programsFreeTrialDurationOutOfRange(creatorA);
    await testM08_programsAvailableLibrariesArrayShape(creatorA);
    await testM24_programsPriceInteger(creatorA);
    await testM11_plansMissingTitle(creatorA);
    await testM12_lookupNonStringEmail(creatorA);
    await testM12_inviteEmailTooLong(creatorA);
  } catch (err) {
    console.error("\n✗ Suite crashed:", err);
    failed++;
    failures.push({label: "suite-crash", error: String(err), stack: err.stack});
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
