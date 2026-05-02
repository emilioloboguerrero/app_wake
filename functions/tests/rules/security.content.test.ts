/**
 * Security audit — `courses`, `bundles`, `plans`, `exercises_library` rules.
 *
 * Findings covered:
 *   F-RULES-19  courses/{id} create has no `creator_id == auth.uid` bind
 *   F-RULES-03  bundles update has no field guard / `programs[]`/`courseIds[]` ownership
 *   F-RULES-20  bundles update has no status state-machine
 *   F-RULES-33  plans update can flip `clientUserId` to victim
 *   F-RULES-43  exercises_library entries readable by all signed-in users
 *   F-DATA-08   bundles use `courseIds`, not `programs` (audit doc-vs-data correction)
 *
 * Convention as in security.users.test.ts.
 */

import {beforeAll, afterAll, beforeEach, describe, it} from "vitest";
import {doc, setDoc, updateDoc, getDoc} from "firebase/firestore";
import {
  bootRulesEnv,
  seedUser,
  seedCreator,
  seedCourse,
  seedDoc,
  assertFails,
  assertSucceeds,
} from "./_helper.js";
import type {RulesTestEnvironment} from "@firebase/rules-unit-testing";

let env: RulesTestEnvironment;
beforeAll(async () => {
  env = await bootRulesEnv("wake-rules-security-content");
});
afterAll(async () => {
  if (env) await env.cleanup();
});
beforeEach(async () => {
  await env.clearFirestore();
});

describe("courses — create / update / delete (F-RULES-19)", () => {
  it("creator can create their own course", async () => {
    await seedCreator(env, "creator1");
    const ctx = env.authenticatedContext("creator1", {role: "creator"});
    await assertSucceeds(
      setDoc(doc(ctx.firestore(), "courses/c1"), {
        creator_id: "creator1",
        title: "My program",
        status: "draft",
      })
    );
  });

  it(
    "FIXED: creator can no longer create a course attributing it to a foreign creator (F-RULES-19)",
    async () => {
      await seedCreator(env, "creatorA");
      await seedCreator(env, "creatorB");
      const ctxA = env.authenticatedContext("creatorA", {role: "creator"});
      // After fix: rule must require `request.resource.data.creator_id == request.auth.uid`
      await assertFails(
        setDoc(doc(ctxA.firestore(), "courses/orphan"), {
          creator_id: "creatorB",
          title: "Orphan course",
          status: "published",
        })
      );
    }
  );

  it("non-creator CANNOT create a course", async () => {
    await seedUser(env, "u1");
    const ctx = env.authenticatedContext("u1");
    await assertFails(
      setDoc(doc(ctx.firestore(), "courses/c1"), {
        creator_id: "u1",
        title: "user trying",
      })
    );
  });

  it("course owner can update their course", async () => {
    await seedCreator(env, "creator1");
    await seedCourse(env, "c1", "creator1");
    const ctx = env.authenticatedContext("creator1", {role: "creator"});
    await assertSucceeds(
      updateDoc(doc(ctx.firestore(), "courses/c1"), {title: "renamed"})
    );
  });

  it("non-owner creator CANNOT update someone else's course", async () => {
    await seedCreator(env, "creatorA");
    await seedCreator(env, "creatorB");
    await seedCourse(env, "c1", "creatorA");
    const ctxB = env.authenticatedContext("creatorB", {role: "creator"});
    await assertFails(
      updateDoc(doc(ctxB.firestore(), "courses/c1"), {title: "hijacked"})
    );
  });

  it("any signed-in user can read a published course (English status)", async () => {
    // Rule requires `isSignedIn()` and `status == 'published'` (or empty).
    // Public/anonymous read is NOT permitted.
    await seedCourse(env, "c1", "creator1", {status: "published"});
    await seedUser(env, "anyAuthedUser");
    const ctx = env.authenticatedContext("anyAuthedUser");
    await assertSucceeds(getDoc(doc(ctx.firestore(), "courses/c1")));
  });

  // F-2026-05-01: rule no longer accepts the legacy Spanish literal — prod
  // shape-analysis 2026-05-02 confirmed zero docs use it. Treating it as
  // published was a defense-in-depth weakness paired with the
  // isFreeGrantAllowed blacklist that produced the C-01 monetization bypass.
  it("non-owner signed-in user cannot read a Spanish status:'publicado' course (legacy literal removed)", async () => {
    await seedCourse(env, "c2", "creator1", {status: "publicado"});
    await seedUser(env, "anyAuthedUser2");
    const ctx = env.authenticatedContext("anyAuthedUser2");
    await assertFails(getDoc(doc(ctx.firestore(), "courses/c2")));
  });

  it("any signed-in user can read a course with no status field (back-compat)", async () => {
    // Rule treats absent status as published per the comment.
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "courses/no-status"), {
        creator_id: "creator1",
        title: "Old course",
      });
    });
    await seedUser(env, "anyAuthedUser3");
    const ctx = env.authenticatedContext("anyAuthedUser3");
    await assertSucceeds(getDoc(doc(ctx.firestore(), "courses/no-status")));
  });

  it("unauthenticated request is DENIED reading any course", async () => {
    // Confirms the published-course-read is auth-gated, not public.
    await seedCourse(env, "c3", "creator1", {status: "published"});
    const ctx = env.unauthenticatedContext();
    await assertFails(getDoc(doc(ctx.firestore(), "courses/c3")));
  });

  it("draft course is NOT readable by non-owner authed users", async () => {
    await seedCreator(env, "creatorA");
    await seedCreator(env, "creatorB");
    await seedCourse(env, "draft-c", "creatorA", {status: "draft"});
    const ctxB = env.authenticatedContext("creatorB", {role: "creator"});
    await assertFails(getDoc(doc(ctxB.firestore(), "courses/draft-c")));
  });
});

describe("bundles — F-RULES-03 / F-RULES-20 / F-DATA-08", () => {
  it("creator can create a draft bundle", async () => {
    await seedCreator(env, "creator1");
    const ctx = env.authenticatedContext("creator1", {role: "creator"});
    await assertSucceeds(
      setDoc(doc(ctx.firestore(), "bundles/b1"), {
        creatorId: "creator1",
        title: "My bundle",
        courseIds: ["c1", "c2"],
        status: "draft",
        pricing: {amount: 100000, currency_id: "COP"},
      })
    );
  });

  it("non-owner cannot update someone else's bundle", async () => {
    await seedCreator(env, "creatorA");
    await seedCreator(env, "creatorB");
    await seedDoc(env, "bundles/b1", {
      creatorId: "creatorA",
      title: "A's bundle",
      courseIds: ["c1"],
      status: "draft",
    });
    const ctxB = env.authenticatedContext("creatorB", {role: "creator"});
    await assertFails(
      updateDoc(doc(ctxB.firestore(), "bundles/b1"), {title: "hijacked"})
    );
  });

  it.fails(
    "BUG: bundle owner CAN flip status from draft → published with no review (F-RULES-20)",
    async () => {
      await seedCreator(env, "creator1");
      await seedDoc(env, "bundles/b1", {
        creatorId: "creator1",
        title: "x",
        courseIds: ["c1"],
        status: "draft",
      });
      const ctx = env.authenticatedContext("creator1", {role: "creator"});
      // After fix: only state-machine transitions allowed (e.g., draft→archived only).
      await assertFails(
        updateDoc(doc(ctx.firestore(), "bundles/b1"), {status: "published"})
      );
    }
  );

  it.fails(
    "BUG: bundle owner CAN inject foreign creators' courseIds (F-RULES-03)",
    async () => {
      await seedCreator(env, "creatorA");
      await seedCreator(env, "creatorB");
      await seedCourse(env, "courseB1", "creatorB");
      await seedDoc(env, "bundles/bA", {
        creatorId: "creatorA",
        title: "A's bundle",
        courseIds: ["myOwn"],
        status: "draft",
      });
      const ctxA = env.authenticatedContext("creatorA", {role: "creator"});
      // After fix: rule (or server-side validation) must reject courseIds whose
      // course doc has creator_id !== bundle.creatorId.
      await assertFails(
        updateDoc(doc(ctxA.firestore(), "bundles/bA"), {
          courseIds: ["myOwn", "courseB1"],
        })
      );
    }
  );

  it("anyone authed can read a bundle (current intent)", async () => {
    await seedDoc(env, "bundles/b1", {
      creatorId: "x",
      status: "published",
      courseIds: [],
    });
    const ctx = env.authenticatedContext("anyone");
    await assertSucceeds(getDoc(doc(ctx.firestore(), "bundles/b1")));
  });
});

describe("plans — F-RULES-33 + F-DATA-02 (rule vs production data shape)", () => {
  // ─── PRODUCTION DATA SHAPE NOTE ────────────────────────────────────────────
  // Production `plans` docs use `creator_id` (snake_case) per §11.1.4.
  // The Firestore rule at firestore.rules:446 reads `resource.data.creatorId`
  // (camelCase) — a field that doesn't exist on production docs. This means:
  //   - Reads/writes through the client SDK are denied (the rule throws
  //     "Property creatorId is undefined") — F-DATA-02 manifesting on plans.
  //   - All current plan reads/writes go through the Phase 3 API (Admin SDK
  //     bypass) — the rule has no effect on production today.
  //
  // For tests: we seed with `creatorId` (camelCase) so we can verify what
  // the rule WOULD do if production had matching data. Each test that does
  // so is annotated. A separate test below confirms the prod-shape failure.

  it("plan owner can update their plan (when doc has matching creatorId field)", async () => {
    await seedCreator(env, "creator1");
    await seedDoc(env, "plans/p1", {
      creatorId: "creator1", // camelCase to match the rule
      creator_id: "creator1", // snake to match production data
      title: "Plan 1",
    });
    const ctx = env.authenticatedContext("creator1", {role: "creator"});
    await assertSucceeds(
      updateDoc(doc(ctx.firestore(), "plans/p1"), {title: "renamed"})
    );
  });

  it("F-DATA-02 confirmed: rule denies update when only snake_case creator_id present", async () => {
    // This is the production-shape test. Same plan, but the doc is missing
    // the camelCase field that the rule reads. Rule should throw / deny.
    await seedCreator(env, "creator1");
    await seedDoc(env, "plans/p1-prodshape", {
      creator_id: "creator1", // production shape — no camelCase field
      title: "Plan with prod shape",
    });
    const ctx = env.authenticatedContext("creator1", {role: "creator"});
    // Rule reads resource.data.creatorId which is undefined → denied.
    await assertFails(
      updateDoc(doc(ctx.firestore(), "plans/p1-prodshape"), {title: "renamed"})
    );
  });

  it(
    "FIXED: plan owner can no longer flip clientUserId to a victim (F-RULES-33), reachable when doc has both fields",
    async () => {
      await seedCreator(env, "creator1");
      await seedDoc(env, "plans/p2", {
        creatorId: "creator1",
        creator_id: "creator1",
        clientUserId: "originalClient",
      });
      const ctx = env.authenticatedContext("creator1", {role: "creator"});
      // After fix: clientUserId must be immutable from client; lock via diff.
      await assertFails(
        updateDoc(doc(ctx.firestore(), "plans/p2"), {clientUserId: "victim"})
      );
    }
  );

  it("non-owner cannot update someone else's plan", async () => {
    await seedCreator(env, "creatorA");
    await seedCreator(env, "creatorB");
    await seedDoc(env, "plans/pA", {
      creatorId: "creatorA",
      creator_id: "creatorA",
      title: "A",
    });
    const ctxB = env.authenticatedContext("creatorB", {role: "creator"});
    await assertFails(
      updateDoc(doc(ctxB.firestore(), "plans/pA"), {title: "hijacked"})
    );
  });
});

describe("exercises_library — F-RULES-43 / F-API2-05 reachable shape", () => {
  it("creator can create their own library", async () => {
    await seedCreator(env, "creator1");
    const ctx = env.authenticatedContext("creator1", {role: "creator"});
    await assertSucceeds(
      setDoc(doc(ctx.firestore(), "exercises_library/lib1"), {
        creator_id: "creator1",
        title: "My library",
      })
    );
  });

  it("any authed user can read another creator's library (current shared-library intent — F-RULES-43)", async () => {
    await seedCreator(env, "creatorA");
    await seedCreator(env, "creatorB");
    await seedDoc(env, "exercises_library/libA", {
      creator_id: "creatorA",
      title: "A's library",
    });
    const ctxB = env.authenticatedContext("creatorB", {role: "creator"});
    await assertSucceeds(getDoc(doc(ctxB.firestore(), "exercises_library/libA")));
  });

  it("non-owner cannot create a library claiming another's creator_id", async () => {
    await seedCreator(env, "creatorA");
    await seedCreator(env, "creatorB");
    const ctxB = env.authenticatedContext("creatorB", {role: "creator"});
    await assertFails(
      setDoc(doc(ctxB.firestore(), "exercises_library/orphan"), {
        creator_id: "creatorA",
        title: "Orphan",
      })
    );
  });
});
