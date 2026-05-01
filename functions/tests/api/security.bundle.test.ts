/**
 * API integration — bundle ownership.
 *
 * Findings covered:
 *   F-NEW-07 / F-SVC-01  bundleAssignment.ts grants every courseId in
 *                        bundle.courseIds without verifying ownership
 */

import {beforeAll, beforeEach, describe} from "vitest";
import {
  apiTest,
  apiCall,
  createTestUser,
  seedFsDoc,
  clearFs,
  ensureEmulator,
} from "./_helper.js";

beforeAll(async () => {
  await ensureEmulator();
});
beforeEach(async () => {
  await clearFs();
});

describe("F-NEW-07 — bundle creation can mix foreign creators' courseIds", () => {
  apiTest(
    "FIXED: creator A is rejected (400) when crafting a bundle with creator B's courseId",
    async () => {
      const {setClaims} = await import("./_helper.js");
      const creatorA = await createTestUser({uid: "ca", email: "ca@x.com"});
      const creatorB = await createTestUser({uid: "cb", email: "cb@x.com"});
      await seedFsDoc(`users/${creatorA.uid}`, {role: "creator"});
      await seedFsDoc(`users/${creatorB.uid}`, {role: "creator"});
      await setClaims(creatorA.uid, {role: "creator"});
      // Refresh ID token to pick up the claim
      const refreshed = await import("./_helper.js").then((m) => m.signIn(
        "ca@x.com", "password123"
      ));
      await seedFsDoc("courses/B-premium", {
        creator_id: creatorB.uid,
        title: "B premium",
        status: "published",
      });

      const res = await apiCall("POST", "/creator/bundles", {
        idToken: refreshed,
        body: {
          title: "Cheap bundle (with B's content)",
          courseIds: ["B-premium"],
          pricing: {amount: 100, currency_id: "COP"},
        },
      });
      if (res.status === 400) return;
      throw new Error(`Expected 400 (fix in); got ${res.status}`);
    }
  );
});
