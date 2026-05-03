/**
 * Production-shape replay tests.
 *
 * Reads the redacted production shape from /tmp/wake-shape.json (produced by
 * `scripts/security/shape-analysis.js`) and synthesizes documents that match
 * each observed shape variant. Each shape variant gets a test that exercises
 * the rule path against it.
 *
 * Why this matters: the audit's first test-run found 5 unexpected failures
 * because the rules were written for an idealized data shape; production
 * data has snake/camel drift, missing fields, and legacy variants the
 * rules don't account for. This test class catches that disagreement.
 *
 * Skipped automatically if /tmp/wake-shape.json is missing (run the
 * shape-analysis script first).
 */

import {beforeAll, afterAll, beforeEach, describe, test, it} from "vitest";
import {readFileSync, existsSync} from "node:fs";
import {doc, getDoc, setDoc, updateDoc} from "firebase/firestore";
import {
  bootRulesEnv,
  seedUser,
  seedCreator,
  seedDoc,
  assertFails,
  assertSucceeds,
} from "../rules/_helper.js";
import type {RulesTestEnvironment} from "@firebase/rules-unit-testing";

const SHAPE_PATH = process.env.WAKE_SHAPE_JSON ?? "/tmp/wake-shape.json";
const HAS_SHAPE = existsSync(SHAPE_PATH);

// Soft skip if the shape JSON isn't available.
const shapeTest = HAS_SHAPE ? it : it.skip;

let env: RulesTestEnvironment;
let shape: any;

beforeAll(async () => {
  if (!HAS_SHAPE) return;
  env = await bootRulesEnv("wake-rules-prod-shape");
  shape = JSON.parse(readFileSync(SHAPE_PATH, "utf8"));
});
afterAll(async () => {
  if (env) await env.cleanup();
});
beforeEach(async () => {
  if (env) await env.clearFirestore();
});

if (!HAS_SHAPE) {
  // eslint-disable-next-line no-console
  console.warn(
    `[prod-shape-replay] SKIPPED — ${SHAPE_PATH} not found.\n` +
      `Run: NODE_PATH=functions/node_modules node scripts/security/shape-analysis.js --out /tmp/wake-shape.json`
  );
}

describe("Production-shape replay (loaded from /tmp/wake-shape.json)", () => {
  shapeTest("courses: rule must accept ALL observed status values", async () => {
    if (!shape) return;
    const courseShape = shape.collections?.courses?.shape?.fields?.status;
    if (!courseShape) return;
    const observedStatuses = courseShape.valueDist
      ?.filter((v: any) => v.value && v.value.startsWith("string:"))
      .map((v: any) => v.value.replace(/^string:/, "")) ?? [];

    // For each observed status, seed a course and verify a creator-owned
    // course is readable. Catches drift where rules don't include all real
    // production status values.
    await seedCreator(env, "real-creator");
    await seedUser(env, "any-user");

    for (const status of observedStatuses) {
      const courseId = `cs-${status.replace(/[^a-zA-Z0-9]/g, "_")}`;
      await seedDoc(env, `courses/${courseId}`, {
        creator_id: "real-creator",
        title: `Course with status=${status}`,
        status,
      });
      const ctx = env.authenticatedContext("any-user");
      // F-2026-05-01: rule allows read only for published / no-status / admin
      // / owner. The legacy 'publicado' literal was removed (prod has 0 docs
      // with it as of 2026-05-02). Anything else (draft / archived / unknown)
      // is denied for non-owner.
      if (status === "published" || status === "" || status === undefined) {
        await assertSucceeds(getDoc(doc(ctx.firestore(), `courses/${courseId}`)));
      } else {
        await assertFails(getDoc(doc(ctx.firestore(), `courses/${courseId}`)));
      }
    }
  });

  shapeTest("plans: rule denies access on production-shape data (F-DATA-02)", async () => {
    if (!shape) return;
    const planShape = shape.collections?.plans?.shape?.fields;
    if (!planShape) return;
    // Production plans have creator_id (snake), not creatorId (camel).
    // Confirm the rule denies access on this real shape.
    await seedCreator(env, "plan-owner");
    await seedDoc(env, "plans/prod-shape-plan", {
      creator_id: "plan-owner",
      title: "Real prod-shape plan",
      created_at: new Date(),
      updated_at: new Date(),
    });
    const ctx = env.authenticatedContext("plan-owner", {role: "creator"});
    // Rule reads resource.data.creatorId → undefined → denied.
    await assertFails(getDoc(doc(ctx.firestore(), "plans/prod-shape-plan")));
  });

  shapeTest(
    "client_programs: rule denies all client-SDK access on production-shape (F-DATA-02)",
    async () => {
      if (!shape) return;
      // Production has user_id, program_id, version_snapshot, content_plan_id.
      // No creatorId/clientId. Rule reads those → all denied.
      await seedUser(env, "owner-uid");
      await seedDoc(env, `client_programs/owner-uid_prog1`, {
        user_id: "owner-uid",
        program_id: "prog1",
        content_plan_id: null,
        version_snapshot: {},
        created_at: new Date(),
      });
      const ctx = env.authenticatedContext("owner-uid");
      await assertFails(
        getDoc(doc(ctx.firestore(), "client_programs/owner-uid_prog1"))
      );
    }
  );

  shapeTest(
    "events: rule must handle BOTH `access` and `wake_users_only` field shapes (F-DATA-03)",
    async () => {
      if (!shape) return;
      // Production has access:"public" mostly. Rule may reference wake_users_only.
      // Pin both shapes pass-through for any signed-in user.
      await seedCreator(env, "event-creator");

      // Variant 1: access:"public"
      await seedDoc(env, "events/access-public", {
        creator_id: "event-creator",
        status: "active",
        access: "public",
      });
      // Variant 2: wake_users_only:false
      await seedDoc(env, "events/wake-users-false", {
        creator_id: "event-creator",
        status: "active",
        wake_users_only: false,
      });
      // Variant 3: legacy — neither field present
      await seedDoc(env, "events/legacy-no-access", {
        creator_id: "event-creator",
        status: "active",
      });

      const ctx = env.unauthenticatedContext();
      // Rule for events is `allow read: if true;` per audit §1 — anonymous
      // OK on all shapes.
      await assertSucceeds(getDoc(doc(ctx.firestore(), "events/access-public")));
      await assertSucceeds(getDoc(doc(ctx.firestore(), "events/wake-users-false")));
      await assertSucceeds(getDoc(doc(ctx.firestore(), "events/legacy-no-access")));
    }
  );

  shapeTest(
    "one_on_one_clients: 60% of production docs lack `status` field (F-DATA-07)",
    async () => {
      if (!shape) return;
      // Confirm the audit finding: docs with no status field must be readable
      // by their creator/client. Seed BOTH shapes and verify reads.
      await seedCreator(env, "ooo-creator");
      await seedUser(env, "ooo-client");

      // Shape 1: full status field
      await seedDoc(env, "one_on_one_clients/shape-with-status", {
        creatorId: "ooo-creator",
        clientUserId: "ooo-client",
        status: "active",
      });
      // Shape 2: missing status (60% of prod)
      await seedDoc(env, "one_on_one_clients/shape-no-status", {
        creatorId: "ooo-creator",
        clientUserId: "ooo-client",
      });

      const cCtx = env.authenticatedContext("ooo-creator", {role: "creator"});
      const clCtx = env.authenticatedContext("ooo-client");

      await assertSucceeds(
        getDoc(doc(cCtx.firestore(), "one_on_one_clients/shape-no-status"))
      );
      await assertSucceeds(
        getDoc(doc(clCtx.firestore(), "one_on_one_clients/shape-no-status"))
      );
      await assertSucceeds(
        getDoc(doc(cCtx.firestore(), "one_on_one_clients/shape-with-status"))
      );
    }
  );

  shapeTest(
    "users: 21 of 65 prod users have NO role field — rule fallback must default to 'user'",
    async () => {
      if (!shape) return;
      // Pin: a user doc with no role can be read by the owner.
      await seedDoc(env, "users/no-role-user", {
        email: "noroleuser@x.com",
        // no role field
      });
      const ctx = env.authenticatedContext("no-role-user");
      await assertSucceeds(getDoc(doc(ctx.firestore(), "users/no-role-user")));
    }
  );

  shapeTest(
    "registrations: rule must accept BOTH camelCase + snake_case schemas (F-DATA-12)",
    async () => {
      if (!shape) return;
      await seedDoc(env, "events/dual-schema", {
        creator_id: "test-creator",
        status: "active",
        access: "public",
      });

      // Schema 1 (10% of prod) — camelCase English fields
      await seedDoc(env, "event_signups/dual-schema/registrations/r-camel", {
        email: "u@x.com",
        displayName: "User",
        clientUserId: null,
        fieldValues: {},
        createdAt: new Date(),
      });
      // Schema 2 (90% of prod) — snake_case Spanish
      await seedDoc(env, "event_signups/dual-schema/registrations/r-snake", {
        email: "u@x.com",
        nombre: "User",
        phoneNumber: null,
        responses: {},
        checked_in: false,
        created_at: new Date(),
      });

      // Both shapes should be readable by the event creator.
      await seedCreator(env, "test-creator");
      const ctx = env.authenticatedContext("test-creator", {role: "creator"});
      await assertSucceeds(
        getDoc(doc(ctx.firestore(), "event_signups/dual-schema/registrations/r-camel"))
      );
      await assertSucceeds(
        getDoc(doc(ctx.firestore(), "event_signups/dual-schema/registrations/r-snake"))
      );
    }
  );

  shapeTest(
    "courses: deliveryType has 3 values in prod — low_ticket, one_on_one, general (§11.1.7)",
    async () => {
      if (!shape) return;
      // Confirm the rule doesn't reject any of the 3 observed values.
      await seedCreator(env, "test-creator");
      await seedUser(env, "test-user");
      const ctx = env.authenticatedContext("test-user");
      const seedAndRead = async (deliveryType: string) => {
        const id = `dt-${deliveryType}`;
        await seedDoc(env, `courses/${id}`, {
          creator_id: "test-creator",
          status: "published",
          deliveryType,
          title: `Type ${deliveryType}`,
        });
        await assertSucceeds(getDoc(doc(ctx.firestore(), `courses/${id}`)));
      };
      for (const dt of ["low_ticket", "one_on_one", "general"]) {
        await seedAndRead(dt);
      }
    }
  );
});
