/**
 * Security audit — relationship-graph collections:
 *   - nutrition_assignments / client_nutrition_plan_content
 *   - client_session_content / client_plan_content / client_sessions
 *   - one_on_one_clients
 *   - call_bookings
 *   - client_programs (also covers F-DATA-02 dead rule)
 *   - user_progress
 *
 * Findings covered:
 *   F-RULES-09   nutrition_assignments create only checks assignedBy
 *   F-RULES-10   client_nutrition_plan_content create unbound to assignment
 *   F-RULES-14   client_session_content / client_plan_content phantom create
 *   F-RULES-13   client_programs update mutable creator/program identity
 *   F-RULES-31   one_on_one_clients update has no field guard
 *   F-RULES-34   nutrition_assignments update can flip userId
 *   F-RULES-11   call_bookings create has no creatorId validity
 *   F-RULES-12   call_bookings client update can set arbitrary status
 *   F-RULES-16   user_progress create cross-namespace poisoning
 *   F-DATA-02    client_programs rule references nonexistent fields
 *   F-DATA-06    nutrition_assignments parallel field names
 *   F-DATA-07    one_on_one_clients 60% missing status
 */

import {beforeAll, afterAll, beforeEach, describe, it} from "vitest";
import {doc, setDoc, updateDoc, getDoc} from "firebase/firestore";
import {
  bootRulesEnv,
  seedUser,
  seedCreator,
  seedDoc,
  assertFails,
  assertSucceeds,
} from "./_helper.js";
import type {RulesTestEnvironment} from "@firebase/rules-unit-testing";

let env: RulesTestEnvironment;
beforeAll(async () => {
  env = await bootRulesEnv("wake-rules-security-relationships");
});
afterAll(async () => {
  if (env) await env.cleanup();
});
beforeEach(async () => {
  await env.clearFirestore();
});

// ─── nutrition_assignments — F-RULES-09 / F-RULES-34 / F-DATA-06 ─────────────

describe("nutrition_assignments — phantom assignment vector", () => {
  it(
    "FIXED: any creator can no longer plant a nutrition_assignment for any victim (F-RULES-09)",
    async () => {
      await seedCreator(env, "creatorMalicious");
      await seedUser(env, "victim");
      const ctx = env.authenticatedContext("creatorMalicious", {role: "creator"});
      // After fix: gate via exists(/.../one_on_one_clients/{creator}_{victim})
      // OR move all writes server-side.
      await assertFails(
        setDoc(doc(ctx.firestore(), "nutrition_assignments/phantom1"), {
          assignedBy: "creatorMalicious",
          creator_id: "creatorMalicious",
          userId: "victim",
          clientUserId: "victim",
          planId: "p1",
          plan: {meals: []},
          createdAt: new Date(),
        })
      );
    }
  );

  it(
    "FIXED: creator can no longer flip userId on an existing assignment to retarget a victim (F-RULES-34)",
    async () => {
      await seedCreator(env, "creator1");
      await seedDoc(env, "nutrition_assignments/a1", {
        assignedBy: "creator1",
        creator_id: "creator1",
        userId: "originalClient",
        clientUserId: "originalClient",
        planId: "p1",
      });
      const ctx = env.authenticatedContext("creator1", {role: "creator"});
      await assertFails(
        updateDoc(doc(ctx.firestore(), "nutrition_assignments/a1"), {
          userId: "victim",
          clientUserId: "victim",
        })
      );
    }
  );

  it("client can read their own assignment", async () => {
    await seedCreator(env, "creator1");
    await seedUser(env, "client1");
    await seedDoc(env, "nutrition_assignments/a1", {
      assignedBy: "creator1",
      creator_id: "creator1",
      userId: "client1",
      clientUserId: "client1",
      planId: "p1",
    });
    const ctx = env.authenticatedContext("client1");
    await assertSucceeds(
      getDoc(doc(ctx.firestore(), "nutrition_assignments/a1"))
    );
  });
});

// ─── client_nutrition_plan_content — F-RULES-10 ──────────────────────────────

describe("client_nutrition_plan_content — phantom content vector", () => {
  it(
    "FIXED: creator can no longer plant content for a user they have no assignment with (F-RULES-10)",
    async () => {
      await seedCreator(env, "creatorMalicious");
      await seedUser(env, "victim");
      const ctx = env.authenticatedContext("creatorMalicious", {role: "creator"});
      // After fix: require the parent nutrition_assignment to exist with
      // assignedBy === auth.uid before allowing the content write.
      await assertFails(
        setDoc(
          doc(ctx.firestore(), "client_nutrition_plan_content/phantomContent"),
          {
            assignedBy: "creatorMalicious",
            creator_id: "creatorMalicious",
            userId: "victim",
            client_id: "victim",
            content: {meals: []},
          }
        )
      );
    }
  );
});

// ─── client_session_content / client_plan_content — F-RULES-14 ──────────────

describe("client_session_content / client_plan_content — phantom create", () => {
  it(
    "FIXED: creator can no longer create client_session_content targeting an unrelated user (F-RULES-14)",
    async () => {
      await seedCreator(env, "creatorMalicious");
      await seedUser(env, "victim");
      const ctx = env.authenticatedContext("creatorMalicious", {role: "creator"});
      await assertFails(
        setDoc(doc(ctx.firestore(), "client_session_content/phantom"), {
          creator_id: "creatorMalicious",
          client_id: "victim",
          content: "attacker-controlled",
        })
      );
    }
  );

  it("FIXED (F-RULES-14): even legitimate creator cannot write directly via JS SDK — API-only", async () => {
    // F-RULES-14 (Round 2) locked all writes to `client_session_content` to
    // admin-only. Production write path is /creator/clients/* via Admin SDK
    // (creator-dashboard/.../ClientPlanSessionPanel.jsx — "Persist via the
    // API"); PWA reads via /workout/client-session-content/:id. No client
    // surface uses the Firestore SDK to write here, so denying every direct
    // write at the rule layer is the correct posture.
    //
    // The previous test asserted the pre-Round-2 behavior (creator-with-
    // one_on_one_clients-link can setDoc directly) and stayed in place after
    // the fix landed; flipped here to assert the post-fix denial.
    await seedCreator(env, "creator1");
    await seedUser(env, "client1");
    await seedDoc(env, "one_on_one_clients/creator1_client1", {
      creatorId: "creator1",
      clientUserId: "client1",
      status: "active",
    });
    const ctx = env.authenticatedContext("creator1", {role: "creator"});
    await assertFails(
      setDoc(doc(ctx.firestore(), "client_session_content/legit"), {
        creator_id: "creator1",
        client_id: "client1",
        content: "ok",
      })
    );
  });
});

// ─── client_programs — F-RULES-13 / F-DATA-02 ───────────────────────────────

describe("client_programs — F-RULES-13 / F-DATA-02 (rule vs production data shape)", () => {
  // PRODUCTION SHAPE: client_programs docs in production have `user_id`,
  // `program_id`, `version_snapshot` (snake_case) — NOT `creatorId` /
  // `clientId` which the rule reads. Per §11.1.4 / F-DATA-02, this rule is
  // dead code in production: every read/write through the client SDK is
  // denied because the rule throws "Property creatorId is undefined."
  // All current writes go through the Phase 3 API (Admin SDK bypass).

  it("F-DATA-02: rule denies client read on production-shape doc", async () => {
    await seedUser(env, "u1");
    // Production-shape doc — no creatorId/clientId fields
    await seedDoc(env, "client_programs/u1_program1", {
      user_id: "u1",
      program_id: "program1",
      version_snapshot: {},
      created_at: new Date(),
    });
    const ctx = env.authenticatedContext("u1");
    // Rule reads resource.data.creatorId / resource.data.clientId — both
    // undefined → comparison throws → denied.
    await assertFails(
      getDoc(doc(ctx.firestore(), "client_programs/u1_program1"))
    );
  });

  it(
    "FIXED: client can no longer rewrite identity fields when doc has matching clientId field (F-RULES-13)",
    async () => {
      await seedUser(env, "u1");
      // Synthetic doc with clientId field present so the rule's update path
      // is reachable — this is what would happen IF production data had
      // the camelCase fields. After F-RULES-13 fix, identity fields must
      // be immutable via diff-allowlist.
      await seedDoc(env, "client_programs/u1_program1", {
        user_id: "u1",
        program_id: "program1",
        clientId: "u1", // present so rule passes the read
        creatorId: "originalCreator",
      });
      const ctx = env.authenticatedContext("u1");
      await assertFails(
        updateDoc(doc(ctx.firestore(), "client_programs/u1_program1"), {
          program_id: "premium-course",
          creatorId: "u1",
        })
      );
    }
  );

  it("client_programs is currently effectively Admin-SDK only in production", async () => {
    // Documents the architectural reality: with the F-DATA-02 rule mismatch,
    // every client SDK write fails — the only writes that succeed are via
    // Admin SDK. This test pins that state until the rule is reconciled.
    await seedUser(env, "u1");
    await seedDoc(env, "client_programs/u1_admin", {
      user_id: "u1",
      program_id: "anything",
    });
    const ctx = env.authenticatedContext("u1");
    await assertFails(
      updateDoc(doc(ctx.firestore(), "client_programs/u1_admin"), {
        anyField: "value",
      })
    );
  });
});

// ─── one_on_one_clients — F-RULES-31 / F-DATA-07 ─────────────────────────────

describe("one_on_one_clients", () => {
  it("creator can read their own clients", async () => {
    await seedCreator(env, "creator1");
    await seedDoc(env, "one_on_one_clients/c1", {
      creatorId: "creator1",
      clientUserId: "client1",
      status: "active",
    });
    const ctx = env.authenticatedContext("creator1", {role: "creator"});
    await assertSucceeds(
      getDoc(doc(ctx.firestore(), "one_on_one_clients/c1"))
    );
  });

  it("client can read their own enrollment", async () => {
    await seedUser(env, "client1");
    await seedDoc(env, "one_on_one_clients/c1", {
      creatorId: "creator1",
      clientUserId: "client1",
      status: "active",
    });
    const ctx = env.authenticatedContext("client1");
    await assertSucceeds(
      getDoc(doc(ctx.firestore(), "one_on_one_clients/c1"))
    );
  });

  it("unrelated user CANNOT read", async () => {
    await seedUser(env, "stranger");
    await seedDoc(env, "one_on_one_clients/c1", {
      creatorId: "creator1",
      clientUserId: "client1",
      status: "active",
    });
    const ctx = env.authenticatedContext("stranger");
    await assertFails(getDoc(doc(ctx.firestore(), "one_on_one_clients/c1")));
  });

  it(
    "FIXED: creator can no longer flip clientUserId on their own row to a victim (F-RULES-31)",
    async () => {
      await seedCreator(env, "creator1");
      await seedDoc(env, "one_on_one_clients/c1", {
        creatorId: "creator1",
        clientUserId: "originalClient",
        status: "active",
      });
      const ctx = env.authenticatedContext("creator1", {role: "creator"});
      await assertFails(
        updateDoc(doc(ctx.firestore(), "one_on_one_clients/c1"), {
          clientUserId: "victim",
        })
      );
    }
  );
});

// ─── call_bookings — F-RULES-11 / F-RULES-12 ─────────────────────────────────

describe("call_bookings", () => {
  it("client can create a booking with their own clientUserId", async () => {
    await seedUser(env, "client1");
    const ctx = env.authenticatedContext("client1");
    await assertSucceeds(
      setDoc(doc(ctx.firestore(), "call_bookings/b1"), {
        creatorId: "creator1",
        clientUserId: "client1",
        slotStartUtc: "2026-12-31T10:00:00.000Z",
        slotEndUtc: "2026-12-31T11:00:00.000Z",
        status: "scheduled",
      })
    );
  });

  it("client CANNOT create a booking spoofing another user's clientUserId", async () => {
    await seedUser(env, "u1");
    await seedUser(env, "victim");
    const ctx = env.authenticatedContext("u1");
    await assertFails(
      setDoc(doc(ctx.firestore(), "call_bookings/spoof"), {
        creatorId: "creator1",
        clientUserId: "victim",
        slotStartUtc: "2026-12-31T10:00:00.000Z",
        slotEndUtc: "2026-12-31T11:00:00.000Z",
        status: "scheduled",
      })
    );
  });

  it(
    "FIXED: client can no longer flip own booking status to 'confirmed' or 'completed' (F-RULES-12)",
    async () => {
      await seedUser(env, "client1");
      await seedDoc(env, "call_bookings/b1", {
        creatorId: "creator1",
        clientUserId: "client1",
        slotStartUtc: "2026-12-31T10:00:00.000Z",
        slotEndUtc: "2026-12-31T11:00:00.000Z",
        status: "scheduled",
      });
      const ctx = env.authenticatedContext("client1");
      // After fix: client status transitions limited to ['cancelled'].
      await assertFails(
        updateDoc(doc(ctx.firestore(), "call_bookings/b1"), {
          status: "completed",
        })
      );
    }
  );

  it("client CAN cancel their own booking (legitimate update)", async () => {
    await seedUser(env, "client1");
    await seedDoc(env, "call_bookings/b1", {
      creatorId: "creator1",
      clientUserId: "client1",
      slotStartUtc: "2026-12-31T10:00:00.000Z",
      slotEndUtc: "2026-12-31T11:00:00.000Z",
      status: "scheduled",
    });
    const ctx = env.authenticatedContext("client1");
    await assertSucceeds(
      updateDoc(doc(ctx.firestore(), "call_bookings/b1"), {
        status: "cancelled",
      })
    );
  });
});

// ─── user_progress — F-RULES-16 ──────────────────────────────────────────────

describe("user_progress — cross-namespace poisoning vector", () => {
  it(
    "FIXED: attacker can no longer write user_progress/<victimUid_X> with own userId (F-RULES-16)",
    async () => {
      await seedUser(env, "attacker");
      await seedUser(env, "victim");
      const ctx = env.authenticatedContext("attacker");
      // After fix: the `request.resource.data.userId == request.auth.uid` branch
      // should be removed; only docId-prefix matching the auth uid should pass.
      await assertFails(
        setDoc(doc(ctx.firestore(), "user_progress/victim_courseX"), {
          userId: "attacker",
          progress: 100,
        })
      );
    }
  );

  it("user can write user_progress with their own uid prefix in docId", async () => {
    await seedUser(env, "u1");
    const ctx = env.authenticatedContext("u1");
    await assertSucceeds(
      setDoc(doc(ctx.firestore(), "user_progress/u1_courseX"), {
        userId: "u1",
        progress: 50,
      })
    );
  });
});
