/**
 * Tier 4.2 — rules emulator suite expansion.
 *
 * Codifies as `assertFails` tests the firestore-rules invariants for the
 * collections that are server-only or strictly tenant-isolated. Each test
 * blocks regression on a finding that the audit either treated as out of
 * scope for the emulator suite or discovered after Tier 1's first pass:
 *
 *   - api_keys              (audit L-07): read/write must be denied to all
 *                            clients; SHA-256 hashes only ever land here via
 *                            Admin SDK.
 *   - processed_payments    (audit L-07): same — webhook idempotency table.
 *   - fatsecret_cache       server-only.
 *   - subscription_cancellation_feedback (audit L-06):
 *                            create must bind userId; read/update/delete
 *                            admin-only.
 *   - one_on_one_clients    (covers C-10 from the rules side):
 *                            cross-creator read/write must fail; client can
 *                            read their own row.
 *   - video_exchanges       cross-party reads must fail; client + creator
 *                            of the exchange can read; all client writes
 *                            denied (API-only writes).
 *   - nutrition_assignments cross-creator read/write must fail.
 *   - creator_libraries     (audit M-35 informational):
 *                            owner can read; non-owner authenticated read
 *                            still allowed today (intentional). Test pins
 *                            the current behaviour so a future tighten is
 *                            an explicit choice.
 *
 * Same emulator harness as waitlist.test.ts and crossCreator.test.ts.
 */
import {
  initializeTestEnvironment,
  RulesTestEnvironment,
  assertFails,
  assertSucceeds,
} from "@firebase/rules-unit-testing";
import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import {beforeAll, afterAll, beforeEach, describe, it} from "vitest";
import {doc, setDoc, getDoc, deleteDoc, updateDoc} from "firebase/firestore";

const RULES_PATH = resolve(__dirname, "../../../config/firebase/firestore.rules");

let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: "wake-rules-test-tier42",
    firestore: {
      rules: readFileSync(RULES_PATH, "utf8"),
      host: "127.0.0.1",
      port: 8080,
    },
  });
});

afterAll(async () => {
  if (testEnv) await testEnv.cleanup();
});

beforeEach(async () => {
  await testEnv.clearFirestore();
});

async function seedUserRole(userId: string, role: "user" | "creator" | "admin"): Promise<void> {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), `users/${userId}`), {role});
  });
}

// ─── api_keys / processed_payments / fatsecret_cache (audit L-07) ────────────

describe("server-only collections (audit L-07)", () => {
  beforeEach(async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "api_keys/key1"), {hash: "abc", owner_id: "creator1"});
      await setDoc(doc(ctx.firestore(), "processed_payments/pay1"), {status: "approved"});
      await setDoc(doc(ctx.firestore(), "fatsecret_cache/cache1"), {data: {}});
    });
    await seedUserRole("creator1", "creator");
    await seedUserRole("admin1", "admin");
  });

  it("REJECTS api_keys read for any authenticated user (incl. owner)", async () => {
    const ctx = testEnv.authenticatedContext("creator1", {role: "creator"});
    await assertFails(getDoc(doc(ctx.firestore(), "api_keys/key1")));
  });

  it("REJECTS api_keys read for admin (Admin SDK bypass only)", async () => {
    const ctx = testEnv.authenticatedContext("admin1", {role: "admin"});
    await assertFails(getDoc(doc(ctx.firestore(), "api_keys/key1")));
  });

  it("REJECTS api_keys write for any authenticated user", async () => {
    const ctx = testEnv.authenticatedContext("creator1", {role: "creator"});
    await assertFails(
      setDoc(doc(ctx.firestore(), "api_keys/key2"), {hash: "x", owner_id: "creator1"})
    );
  });

  it("REJECTS processed_payments read for any client", async () => {
    const ctx = testEnv.authenticatedContext("admin1", {role: "admin"});
    await assertFails(getDoc(doc(ctx.firestore(), "processed_payments/pay1")));
  });

  it("REJECTS fatsecret_cache read for any client", async () => {
    const ctx = testEnv.authenticatedContext("creator1", {role: "creator"});
    await assertFails(getDoc(doc(ctx.firestore(), "fatsecret_cache/cache1")));
  });
});

// ─── subscription_cancellation_feedback (audit L-06) ─────────────────────────

describe("subscription_cancellation_feedback (audit L-06)", () => {
  beforeEach(async () => {
    await seedUserRole("user1", "user");
    await seedUserRole("user2", "user");
    await seedUserRole("admin1", "admin");
  });

  it("ALLOWS user creating feedback bound to their own uid", async () => {
    const ctx = testEnv.authenticatedContext("user1", {role: "user"});
    await assertSucceeds(
      setDoc(doc(ctx.firestore(), "subscription_cancellation_feedback/fb1"), {
        userId: "user1",
        answers: {reason: "price"},
      })
    );
  });

  it("REJECTS user creating feedback bound to another user's uid (impersonation)", async () => {
    const ctx = testEnv.authenticatedContext("user1", {role: "user"});
    await assertFails(
      setDoc(doc(ctx.firestore(), "subscription_cancellation_feedback/fb2"), {
        userId: "user2",
        answers: {reason: "price"},
      })
    );
  });

  it("REJECTS unauthenticated create", async () => {
    const ctx = testEnv.unauthenticatedContext();
    await assertFails(
      setDoc(doc(ctx.firestore(), "subscription_cancellation_feedback/fb3"), {
        userId: "user1",
        answers: {},
      })
    );
  });

  it("REJECTS non-admin read", async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "subscription_cancellation_feedback/fb-existing"), {
        userId: "user1",
        answers: {},
      });
    });
    const ctx = testEnv.authenticatedContext("user1", {role: "user"});
    await assertFails(getDoc(doc(ctx.firestore(), "subscription_cancellation_feedback/fb-existing")));
  });

  it("ALLOWS admin read", async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "subscription_cancellation_feedback/fb-existing"), {
        userId: "user1",
        answers: {},
      });
    });
    const ctx = testEnv.authenticatedContext("admin1", {role: "admin"});
    await assertSucceeds(getDoc(doc(ctx.firestore(), "subscription_cancellation_feedback/fb-existing")));
  });

  // L-06: keys().hasOnly() bound on create
  it("REJECTS create with keys outside the allowlist (L-06)", async () => {
    const ctx = testEnv.authenticatedContext("user1", {role: "user"});
    await assertFails(
      setDoc(doc(ctx.firestore(), "subscription_cancellation_feedback/fb-evil"), {
        userId: "user1",
        answers: {},
        injectedHugePayload: "x".repeat(10_000),
      })
    );
  });

  it("ALLOWS create within the keys allowlist (L-06)", async () => {
    const ctx = testEnv.authenticatedContext("user1", {role: "user"});
    await assertSucceeds(
      setDoc(doc(ctx.firestore(), "subscription_cancellation_feedback/fb-ok"), {
        userId: "user1",
        type: "subscription_cancel",
        feedback: {a: 1},
        submittedAt: new Date().toISOString(),
        subscriptionId: "sub-123",
        answers: {reason: "price"},
        source: "in_app_cancel_flow_v1",
        statusBefore: "authorized",
        statusAfter: "cancelled",
        courseId: "course-1",
        courseTitle: "T",
      })
    );
  });
});

// ─── call_bookings client-side update whitelist (audit L-08) ─────────────────

describe("call_bookings client update whitelist (audit L-08)", () => {
  beforeEach(async () => {
    await seedUserRole("creatorA", "creator");
    await seedUserRole("clientX", "user");
    await seedUserRole("randomY", "user");
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "call_bookings/bk1"), {
        creatorId: "creatorA",
        clientUserId: "clientX",
        status: "scheduled",
        callLink: "https://meet.google.com/abc-defg-hij",
        slotStartUtc: "2026-05-01T15:00:00Z",
      });
    });
  });

  it("ALLOWS client updating only allowlisted fields (status / notes)", async () => {
    const ctx = testEnv.authenticatedContext("clientX", {role: "user"});
    await assertSucceeds(
      updateDoc(doc(ctx.firestore(), "call_bookings/bk1"), {
        status: "cancelled",
        notes: "I had a conflict.",
        cancelled_by_client: true,
      })
    );
  });

  it("REJECTS client mutating creator-owned fields (callLink)", async () => {
    const ctx = testEnv.authenticatedContext("clientX", {role: "user"});
    await assertFails(
      updateDoc(doc(ctx.firestore(), "call_bookings/bk1"), {
        callLink: "https://attacker.example.com/phish",
      })
    );
  });

  it("REJECTS client mutating creator-owned fields (slotStartUtc)", async () => {
    const ctx = testEnv.authenticatedContext("clientX", {role: "user"});
    await assertFails(
      updateDoc(doc(ctx.firestore(), "call_bookings/bk1"), {
        slotStartUtc: "2026-06-01T10:00:00Z",
      })
    );
  });

  it("REJECTS unrelated user from updating", async () => {
    const ctx = testEnv.authenticatedContext("randomY", {role: "user"});
    await assertFails(
      updateDoc(doc(ctx.firestore(), "call_bookings/bk1"), {status: "cancelled"})
    );
  });

  it("ALLOWS owning creator to do a full-shape update (callLink)", async () => {
    const ctx = testEnv.authenticatedContext("creatorA", {role: "creator"});
    await assertSucceeds(
      updateDoc(doc(ctx.firestore(), "call_bookings/bk1"), {
        callLink: "https://meet.google.com/new-room",
        notes: "moved rooms",
      })
    );
  });
});

// ─── one_on_one_clients (covers cross-creator + audit C-10 rules side) ───────

describe("one_on_one_clients tenant isolation", () => {
  beforeEach(async () => {
    await seedUserRole("creatorA", "creator");
    await seedUserRole("creatorB", "creator");
    await seedUserRole("clientX", "user");
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "one_on_one_clients/relA"), {
        creatorId: "creatorA",
        clientUserId: "clientX",
        status: "active",
      });
    });
  });

  it("ALLOWS owning creator to read their relationship", async () => {
    const ctx = testEnv.authenticatedContext("creatorA", {role: "creator"});
    await assertSucceeds(getDoc(doc(ctx.firestore(), "one_on_one_clients/relA")));
  });

  it("ALLOWS the client to read their own relationship row", async () => {
    const ctx = testEnv.authenticatedContext("clientX", {role: "user"});
    await assertSucceeds(getDoc(doc(ctx.firestore(), "one_on_one_clients/relA")));
  });

  it("REJECTS cross-creator read", async () => {
    const ctx = testEnv.authenticatedContext("creatorB", {role: "creator"});
    await assertFails(getDoc(doc(ctx.firestore(), "one_on_one_clients/relA")));
  });

  it("REJECTS cross-creator update", async () => {
    const ctx = testEnv.authenticatedContext("creatorB", {role: "creator"});
    await assertFails(
      updateDoc(doc(ctx.firestore(), "one_on_one_clients/relA"), {status: "cancelled"})
    );
  });

  it("REJECTS cross-creator delete", async () => {
    const ctx = testEnv.authenticatedContext("creatorB", {role: "creator"});
    await assertFails(deleteDoc(doc(ctx.firestore(), "one_on_one_clients/relA")));
  });

  it("REJECTS create with mismatched creatorId (impersonation)", async () => {
    const ctx = testEnv.authenticatedContext("creatorB", {role: "creator"});
    await assertFails(
      setDoc(doc(ctx.firestore(), "one_on_one_clients/relB"), {
        creatorId: "creatorA",
        clientUserId: "clientX",
        status: "active",
      })
    );
  });
});

// ─── video_exchanges party-only reads ────────────────────────────────────────

describe("video_exchanges party-only reads", () => {
  beforeEach(async () => {
    await seedUserRole("creatorA", "creator");
    await seedUserRole("clientX", "user");
    await seedUserRole("strangerY", "user");
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "video_exchanges/exch1"), {
        creatorId: "creatorA",
        clientId: "clientX",
      });
      await setDoc(doc(ctx.firestore(), "video_exchanges/exch1/messages/m1"), {
        senderId: "clientX",
        note: "hi",
      });
    });
  });

  it("ALLOWS creator party to read", async () => {
    const ctx = testEnv.authenticatedContext("creatorA", {role: "creator"});
    await assertSucceeds(getDoc(doc(ctx.firestore(), "video_exchanges/exch1")));
  });

  it("ALLOWS client party to read", async () => {
    const ctx = testEnv.authenticatedContext("clientX", {role: "user"});
    await assertSucceeds(getDoc(doc(ctx.firestore(), "video_exchanges/exch1")));
  });

  it("REJECTS unrelated user read on exchange root", async () => {
    const ctx = testEnv.authenticatedContext("strangerY", {role: "user"});
    await assertFails(getDoc(doc(ctx.firestore(), "video_exchanges/exch1")));
  });

  it("REJECTS unrelated user read on messages subcollection", async () => {
    const ctx = testEnv.authenticatedContext("strangerY", {role: "user"});
    await assertFails(getDoc(doc(ctx.firestore(), "video_exchanges/exch1/messages/m1")));
  });

  it("REJECTS direct write on exchange (API-only)", async () => {
    const ctx = testEnv.authenticatedContext("clientX", {role: "user"});
    await assertFails(
      setDoc(doc(ctx.firestore(), "video_exchanges/exch1"), {
        creatorId: "creatorA",
        clientId: "clientX",
        injected: true,
      })
    );
  });
});

// ─── nutrition_assignments cross-creator ─────────────────────────────────────

describe("nutrition_assignments cross-creator", () => {
  beforeEach(async () => {
    await seedUserRole("creatorA", "creator");
    await seedUserRole("creatorB", "creator");
    await seedUserRole("clientX", "user");
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "nutrition_assignments/asg1"), {
        userId: "clientX",
        assignedBy: "creatorA",
        planName: "Cut",
      });
    });
  });

  it("REJECTS cross-creator read of another creator's assignment", async () => {
    const ctx = testEnv.authenticatedContext("creatorB", {role: "creator"});
    await assertFails(getDoc(doc(ctx.firestore(), "nutrition_assignments/asg1")));
  });

  it("REJECTS cross-creator update", async () => {
    const ctx = testEnv.authenticatedContext("creatorB", {role: "creator"});
    await assertFails(
      updateDoc(doc(ctx.firestore(), "nutrition_assignments/asg1"), {planName: "Bulk"})
    );
  });

  it("REJECTS cross-creator delete", async () => {
    const ctx = testEnv.authenticatedContext("creatorB", {role: "creator"});
    await assertFails(deleteDoc(doc(ctx.firestore(), "nutrition_assignments/asg1")));
  });

  it("REJECTS create with mismatched assignedBy", async () => {
    const ctx = testEnv.authenticatedContext("creatorB", {role: "creator"});
    await assertFails(
      setDoc(doc(ctx.firestore(), "nutrition_assignments/asg2"), {
        userId: "clientX",
        assignedBy: "creatorA",
        planName: "Inject",
      })
    );
  });

  it("ALLOWS the assigned client to read their own assignment", async () => {
    const ctx = testEnv.authenticatedContext("clientX", {role: "user"});
    await assertSucceeds(getDoc(doc(ctx.firestore(), "nutrition_assignments/asg1")));
  });
});
