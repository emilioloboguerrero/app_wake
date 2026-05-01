/**
 * Security audit — `users/{uid}` rules.
 *
 * Findings covered:
 *   F-RULES-01  Mass-assignment of role / courses / subscriptions / email /
 *               trial_used / purchased_courses / username on own user doc
 *   F-RULES-02  getUserRole() Firestore fallback (chains with F-RULES-01)
 *   F-NEW-01    `trial_used` is mutable from client (infinite trials)
 *   F-NEW-05    `username` not unique-constrained at rules layer
 *   F-NEW-06    `users.email` mutable from client → diverges from Auth email
 *   F-DRIFT-04  `users.cards` mutable from client (chains with F-CLIENT-01)
 *   F-DRIFT-06  `users.purchased_courses` mutable from client (drift with courses map)
 *
 * Test convention:
 *   - `it(...)` = current behavior, should hold today and after the fix
 *   - `it.fails(...)` = future-correct behavior, currently fails because the
 *     bug is present. After the fix lands, drop `.fails` and the test
 *     should pass.
 */

import {beforeAll, afterAll, beforeEach, describe, it} from "vitest";
import {doc, setDoc, updateDoc, getDoc} from "firebase/firestore";
import {
  bootRulesEnv,
  seedUser,
  seedCreator,
  seedAdmin,
  assertFails,
  assertSucceeds,
} from "./_helper.js";

import type {RulesTestEnvironment} from "@firebase/rules-unit-testing";

let env: RulesTestEnvironment;

beforeAll(async () => {
  env = await bootRulesEnv("wake-rules-security-users");
});
afterAll(async () => {
  if (env) await env.cleanup();
});
beforeEach(async () => {
  await env.clearFirestore();
});

describe("users/{uid} — own-doc reads (always permitted)", () => {
  it("user can read their own doc", async () => {
    await seedUser(env, "u1");
    const ctx = env.authenticatedContext("u1");
    await assertSucceeds(getDoc(doc(ctx.firestore(), "users/u1")));
  });

  it("user cannot read someone else's user doc", async () => {
    await seedUser(env, "u1");
    await seedUser(env, "u2");
    const ctx = env.authenticatedContext("u2");
    await assertFails(getDoc(doc(ctx.firestore(), "users/u1")));
  });

  it("admin can read any user doc", async () => {
    await seedUser(env, "u1");
    await seedAdmin(env, "admin1");
    const ctx = env.authenticatedContext("admin1");
    await assertSucceeds(getDoc(doc(ctx.firestore(), "users/u1")));
  });
});

describe("users/{uid} — owner update (currently broad — F-RULES-01)", () => {
  it("user can update their own non-privileged fields", async () => {
    await seedUser(env, "u1", {displayName: "old"});
    const ctx = env.authenticatedContext("u1");
    await assertSucceeds(
      updateDoc(doc(ctx.firestore(), "users/u1"), {displayName: "new"})
    );
  });

  // ─── F-RULES-01 / F-NEW-06 / F-NEW-01 / F-NEW-05 / F-DRIFT-04 / F-DRIFT-06 ──
  // After the Phase 1 lockdown, every test below should `assertFails`.
  // Today they `assertSucceeds` because the rule has no field whitelist.

  it.fails("BUG: user CAN promote themselves to admin (F-RULES-01)", async () => {
    await seedUser(env, "u1");
    const ctx = env.authenticatedContext("u1");
    // Currently allowed → assertFails throws → it.fails marks as expected-fail.
    await assertFails(
      updateDoc(doc(ctx.firestore(), "users/u1"), {role: "admin"})
    );
  });

  it.fails("BUG: user CAN promote themselves to creator (F-RULES-01)", async () => {
    await seedUser(env, "u1");
    const ctx = env.authenticatedContext("u1");
    await assertFails(
      updateDoc(doc(ctx.firestore(), "users/u1"), {role: "creator"})
    );
  });

  it.fails("BUG: user CAN self-grant a paid course (F-RULES-01 + F-DRIFT-06)", async () => {
    await seedUser(env, "u1");
    const ctx = env.authenticatedContext("u1");
    await assertFails(
      updateDoc(doc(ctx.firestore(), "users/u1"), {
        courses: {
          paidCourse123: {
            status: "active",
            access_duration: "yearly",
            expires_at: "2099-01-01T00:00:00Z",
            purchased_at: new Date().toISOString(),
            deliveryType: "low_ticket",
          },
        },
      })
    );
  });

  it.fails("BUG: user CAN write subscriptions field on own doc (F-RULES-01)", async () => {
    await seedUser(env, "u1");
    const ctx = env.authenticatedContext("u1");
    await assertFails(
      updateDoc(doc(ctx.firestore(), "users/u1"), {
        subscriptions: {fakeSubId: {status: "authorized"}},
      })
    );
  });

  it.fails("BUG: user CAN flip email_verified to true (F-RULES-01)", async () => {
    await seedUser(env, "u1");
    const ctx = env.authenticatedContext("u1");
    await assertFails(
      updateDoc(doc(ctx.firestore(), "users/u1"), {email_verified: true})
    );
  });

  it.fails("BUG: user CAN overwrite users.email to victim address (F-NEW-06)", async () => {
    await seedUser(env, "u1");
    const ctx = env.authenticatedContext("u1");
    await assertFails(
      updateDoc(doc(ctx.firestore(), "users/u1"), {email: "victim@example.com"})
    );
  });

  it.fails("BUG: user CAN clear trial_used to re-use trials (F-NEW-01)", async () => {
    await seedUser(env, "u1", {trial_used: {courseX: true}});
    const ctx = env.authenticatedContext("u1");
    await assertFails(
      updateDoc(doc(ctx.firestore(), "users/u1"), {
        "trial_used.courseX": null,
      })
    );
  });

  it.fails("BUG: user CAN squat another creator's username (F-NEW-05)", async () => {
    await seedCreator(env, "famousCreator", {username: "alex_h"});
    await seedUser(env, "u1");
    const ctx = env.authenticatedContext("u1");
    await assertFails(
      updateDoc(doc(ctx.firestore(), "users/u1"), {username: "alex_h"})
    );
  });

  it.fails("BUG: user CAN write arbitrary cards content (F-DRIFT-04 / F-CLIENT-01)", async () => {
    await seedUser(env, "u1");
    const ctx = env.authenticatedContext("u1");
    await assertFails(
      updateDoc(doc(ctx.firestore(), "users/u1"), {
        cards: {
          card1: {label: "Click here", value: "javascript:alert(1)"},
        },
      })
    );
  });

  it.fails("BUG: user CAN poison purchased_courses array (F-DRIFT-06)", async () => {
    await seedUser(env, "u1");
    const ctx = env.authenticatedContext("u1");
    await assertFails(
      updateDoc(doc(ctx.firestore(), "users/u1"), {
        purchased_courses: ["unowned_course_1", "unowned_course_2"],
      })
    );
  });
});

describe("users/{uid}/subscriptions — admin/server only (F-RULES-08-adjacent)", () => {
  it("user CANNOT write to their own subscriptions subcollection", async () => {
    await seedUser(env, "u1");
    const ctx = env.authenticatedContext("u1");
    await assertFails(
      setDoc(doc(ctx.firestore(), "users/u1/subscriptions/sub1"), {
        status: "authorized",
      })
    );
  });

  it("user CAN read their own subscriptions", async () => {
    await seedUser(env, "u1");
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "users/u1/subscriptions/sub1"), {
        status: "authorized",
      });
    });
    const ctx = env.authenticatedContext("u1");
    await assertSucceeds(getDoc(doc(ctx.firestore(), "users/u1/subscriptions/sub1")));
  });

  it("user CANNOT read another user's subscriptions", async () => {
    await seedUser(env, "u1");
    await seedUser(env, "u2");
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "users/u1/subscriptions/sub1"), {
        status: "authorized",
      });
    });
    const ctx = env.authenticatedContext("u2");
    await assertFails(getDoc(doc(ctx.firestore(), "users/u1/subscriptions/sub1")));
  });
});
