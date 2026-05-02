/**
 * Firestore rules tests for Tier-1 cross-creator boundary patches:
 *   - H-01: courses/{courseId}/modules/** scoped to parent course owner
 *   - H-04: exercises_library writes scoped to creator_id field
 *   - H-03 / Tier 5.1: creator_availability owner-only read
 *
 * Same emulator harness as waitlist.test.ts.
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
    projectId: "wake-rules-test-tier1",
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

async function seedCourse(courseId: string, creatorId: string): Promise<void> {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), `courses/${courseId}`), {
      creator_id: creatorId,
      title: "Test course",
      status: "published",
    });
  });
}

async function seedExerciseLibrary(libId: string, creatorId: string): Promise<void> {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), `exercises_library/${libId}`), {
      creator_id: creatorId,
      title: "My library",
    });
  });
}

async function seedUserAsCreator(userId: string): Promise<void> {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), `users/${userId}`), {role: "creator"});
  });
}

// ─── H-01: courses/{courseId}/modules/** ─────────────────────────────────────

describe("courses/{courseId}/modules/** cross-creator tampering (audit H-01)", () => {
  it("REJECTS creator B writing into creator A's course modules", async () => {
    await seedCourse("courseA", "creatorA");
    await seedUserAsCreator("creatorB");
    const ctxB = testEnv.authenticatedContext("creatorB", {role: "creator"});
    await assertFails(
      setDoc(doc(ctxB.firestore(), "courses/courseA/modules/mod1"), {
        title: "Injected by B",
      })
    );
  });

  it("ACCEPTS the course owner writing modules", async () => {
    await seedCourse("courseA", "creatorA");
    await seedUserAsCreator("creatorA");
    const ctxA = testEnv.authenticatedContext("creatorA", {role: "creator"});
    await assertSucceeds(
      setDoc(doc(ctxA.firestore(), "courses/courseA/modules/mod1"), {
        title: "Module 1",
      })
    );
  });

  it("REJECTS creator B writing nested sessions/exercises/sets in creator A's course", async () => {
    await seedCourse("courseA", "creatorA");
    await seedUserAsCreator("creatorB");
    const ctxB = testEnv.authenticatedContext("creatorB", {role: "creator"});
    await assertFails(
      setDoc(doc(ctxB.firestore(), "courses/courseA/modules/mod1/sessions/s1"), {title: "x"})
    );
    await assertFails(
      setDoc(doc(ctxB.firestore(), "courses/courseA/modules/mod1/sessions/s1/exercises/e1"), {title: "x"})
    );
    await assertFails(
      setDoc(doc(ctxB.firestore(), "courses/courseA/modules/mod1/sessions/s1/exercises/e1/sets/set1"), {reps: 10})
    );
  });

  it("ACCEPTS owner writing nested sessions/exercises/sets in their own course", async () => {
    await seedCourse("courseA", "creatorA");
    await seedUserAsCreator("creatorA");
    const ctxA = testEnv.authenticatedContext("creatorA", {role: "creator"});
    await assertSucceeds(
      setDoc(doc(ctxA.firestore(), "courses/courseA/modules/mod1/sessions/s1/exercises/e1/sets/set1"), {reps: 10})
    );
  });
});

// ─── H-04: exercises_library ──────────────────────────────────────────────────

describe("exercises_library cross-creator overwrite (audit H-04)", () => {
  it("REJECTS creator B updating a library owned by creator A", async () => {
    await seedExerciseLibrary("lib1", "creatorA");
    await seedUserAsCreator("creatorB");
    const ctxB = testEnv.authenticatedContext("creatorB", {role: "creator"});
    await assertFails(
      updateDoc(doc(ctxB.firestore(), "exercises_library/lib1"), {title: "Hijacked"})
    );
  });

  it("ACCEPTS owner updating their own library", async () => {
    await seedExerciseLibrary("lib1", "creatorA");
    await seedUserAsCreator("creatorA");
    const ctxA = testEnv.authenticatedContext("creatorA", {role: "creator"});
    await assertSucceeds(
      updateDoc(doc(ctxA.firestore(), "exercises_library/lib1"), {title: "Renamed"})
    );
  });

  it("REJECTS create when caller does not stamp themselves as creator_id", async () => {
    await seedUserAsCreator("creatorB");
    const ctxB = testEnv.authenticatedContext("creatorB", {role: "creator"});
    await assertFails(
      setDoc(doc(ctxB.firestore(), "exercises_library/newLib"), {
        creator_id: "creatorA",
        title: "Spoofed",
      })
    );
  });

  it("REJECTS update that would change creator_id away from caller", async () => {
    await seedExerciseLibrary("lib1", "creatorA");
    await seedUserAsCreator("creatorA");
    const ctxA = testEnv.authenticatedContext("creatorA", {role: "creator"});
    await assertFails(
      updateDoc(doc(ctxA.firestore(), "exercises_library/lib1"), {creator_id: "creatorB"})
    );
  });

  it("ACCEPTS create with caller's own creator_id", async () => {
    await seedUserAsCreator("creatorA");
    const ctxA = testEnv.authenticatedContext("creatorA", {role: "creator"});
    await assertSucceeds(
      setDoc(doc(ctxA.firestore(), "exercises_library/newLib"), {
        creator_id: "creatorA",
        title: "Mine",
      })
    );
  });
});

// ─── H-03 / Tier 5.1: creator_availability ──────────────────────────────────

describe("creator_availability owner-only read (audit H-03 / Tier 5.1)", () => {
  it("REJECTS another authenticated user reading a creator's availability", async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "creator_availability/creatorA"), {
        weeklyTemplate: {monday: []},
      });
    });
    const other = testEnv.authenticatedContext("randomUser");
    await assertFails(getDoc(doc(other.firestore(), "creator_availability/creatorA")));
  });

  it("ACCEPTS the owner reading their own availability", async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "creator_availability/creatorA"), {
        weeklyTemplate: {monday: []},
      });
    });
    const owner = testEnv.authenticatedContext("creatorA");
    await assertSucceeds(getDoc(doc(owner.firestore(), "creator_availability/creatorA")));
  });

  it("REJECTS unauthenticated reads", async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "creator_availability/creatorA"), {weeklyTemplate: {}});
    });
    const anon = testEnv.unauthenticatedContext();
    await assertFails(getDoc(doc(anon.firestore(), "creator_availability/creatorA")));
  });

  it("ACCEPTS owner writing their own availability with allowlisted keys", async () => {
    // F-RULES-32: write rule caps doc shape to a known allowlist
    // (slots / timezone / updatedAt / createdAt). Production-side writes
    // happen via Admin SDK through /v1/creator/availability/template
    // (apps/creator-dashboard/src/services/availabilityService.js) and
    // bypass rules entirely; this test asserts the rule's positive path
    // for any client-direct write a future code path might add.
    const owner = testEnv.authenticatedContext("creatorA");
    await assertSucceeds(
      setDoc(doc(owner.firestore(), "creator_availability/creatorA"), {
        slots: [],
        timezone: "America/Bogota",
      })
    );
  });

  it("REJECTS direct-SDK write with weeklyTemplate (forces API-mediation)", async () => {
    // F-RULES-32 in action: weeklyTemplate is computed and written by the
    // server (Admin SDK / expandWeeklyAvailability cron). A creator
    // attempting to write it via the JS SDK is denied at the rule layer,
    // so the only remaining write path is the API.
    const owner = testEnv.authenticatedContext("creatorA");
    await assertFails(
      setDoc(doc(owner.firestore(), "creator_availability/creatorA"), {
        weeklyTemplate: {monday: []},
      })
    );
  });

  it("ACCEPTS owner deleting their own availability", async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "creator_availability/creatorA"), {weeklyTemplate: {}});
    });
    const owner = testEnv.authenticatedContext("creatorA");
    await assertSucceeds(deleteDoc(doc(owner.firestore(), "creator_availability/creatorA")));
  });
});
