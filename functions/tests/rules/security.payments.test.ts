/**
 * Security audit — `purchases` and `processed_payments` rules.
 *
 * Findings covered:
 *   F-RULES-08  purchases create from client with arbitrary status/amount
 *   F-DATA-04   processed_payments lacks external_reference (informational)
 *   F-DATA-05   processed_payments has both `state` and `status` (informational)
 *
 * Production data note: `purchases` collection has 0 docs in production
 * (per §11). The vulnerability is forward-looking — closing the rule is
 * defense-in-depth.
 */

import {beforeAll, afterAll, beforeEach, describe, it} from "vitest";
import {doc, setDoc, getDoc} from "firebase/firestore";
import {
  bootRulesEnv,
  seedUser,
  seedDoc,
  assertFails,
  assertSucceeds,
} from "./_helper.js";
import type {RulesTestEnvironment} from "@firebase/rules-unit-testing";

let env: RulesTestEnvironment;
beforeAll(async () => {
  env = await bootRulesEnv("wake-rules-security-payments");
});
afterAll(async () => {
  if (env) await env.cleanup();
});
beforeEach(async () => {
  await env.clearFirestore();
});

describe("purchases — F-RULES-08", () => {
  it.fails(
    "BUG: signed-in user CAN forge an approved purchase row (F-RULES-08)",
    async () => {
      await seedUser(env, "u1");
      const ctx = env.authenticatedContext("u1");
      // After fix: `purchases` should be Admin-SDK only (`allow create: if false`)
      // because the `purchases` collection is empty in prod and any consumer
      // that reads it as access source-of-truth is bypassable today.
      await assertFails(
        setDoc(doc(ctx.firestore(), "purchases/forged-1"), {
          user_id: "u1",
          course_id: "premium-course",
          status: "approved",
          amount: 0,
          created_at: new Date().toISOString(),
        })
      );
    }
  );

  it("user CANNOT create a purchase claiming another user's user_id", async () => {
    await seedUser(env, "u1");
    await seedUser(env, "u2");
    const ctx = env.authenticatedContext("u1");
    await assertFails(
      setDoc(doc(ctx.firestore(), "purchases/forged-victim"), {
        user_id: "u2",
        course_id: "any",
        status: "approved",
      })
    );
  });

  it("unauthenticated user CANNOT create a purchase", async () => {
    const ctx = env.unauthenticatedContext();
    await assertFails(
      setDoc(doc(ctx.firestore(), "purchases/anon-purchase"), {
        user_id: "anyone",
        course_id: "any",
        status: "approved",
      })
    );
  });
});

describe("processed_payments — server-only", () => {
  it("any client CANNOT read processed_payments", async () => {
    await seedDoc(env, "processed_payments/pay1", {
      status: "approved",
      userId: "u1",
    });
    const ctx = env.authenticatedContext("u1");
    await assertFails(getDoc(doc(ctx.firestore(), "processed_payments/pay1")));
  });

  it("any client CANNOT write processed_payments", async () => {
    await seedUser(env, "u1");
    const ctx = env.authenticatedContext("u1");
    await assertFails(
      setDoc(doc(ctx.firestore(), "processed_payments/forged"), {
        status: "approved",
        userId: "u1",
        courseId: "any",
      })
    );
  });
});
