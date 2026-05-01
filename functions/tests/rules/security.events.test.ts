/**
 * Security audit — event-related collections.
 *
 * Findings covered:
 *   F-RULES-06   event_signups/registrations create accepts arbitrary fields
 *   F-RULES-21   events update has no field guard (registration_count, etc.)
 *   F-RULES-41   registrations userId not bound to caller
 *   F-DATA-03    events parallel access models (`access` vs `wake_users_only`)
 *   F-DATA-12    registrations has two parallel schemas in same collection
 *
 * Production data note: events use `access: "public"` (10/15 events). The
 * rule references `wake_users_only` which doesn't exist on any prod event
 * (per §11.1.5). Tests assert current rule behavior; F-DATA-03 fix should
 * decide on canonical field.
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
  env = await bootRulesEnv("wake-rules-security-events");
});
afterAll(async () => {
  if (env) await env.cleanup();
});
beforeEach(async () => {
  await env.clearFirestore();
});

describe("events — public read intent (F-RULES-05)", () => {
  it("anyone can read an event doc (public listing)", async () => {
    await seedDoc(env, "events/e1", {
      creator_id: "creator1",
      title: "Public event",
      status: "active",
      access: "public",
    });
    const ctx = env.unauthenticatedContext();
    await assertSucceeds(getDoc(doc(ctx.firestore(), "events/e1")));
  });
});

describe("events — owner update (F-RULES-21)", () => {
  it("event creator can update their own event", async () => {
    await seedCreator(env, "creator1");
    await seedDoc(env, "events/e1", {
      creator_id: "creator1",
      title: "x",
      status: "active",
    });
    const ctx = env.authenticatedContext("creator1", {role: "creator"});
    await assertSucceeds(
      updateDoc(doc(ctx.firestore(), "events/e1"), {title: "renamed"})
    );
  });

  it.fails(
    "BUG: event creator CAN inflate registration_count manually (F-RULES-21)",
    async () => {
      await seedCreator(env, "creator1");
      await seedDoc(env, "events/e1", {
        creator_id: "creator1",
        title: "x",
        status: "active",
        registration_count: 5,
      });
      const ctx = env.authenticatedContext("creator1", {role: "creator"});
      // After fix: registration_count must be in the immutable-from-client list.
      await assertFails(
        updateDoc(doc(ctx.firestore(), "events/e1"), {
          registration_count: 9999,
        })
      );
    }
  );

  it.fails(
    "BUG: event creator CAN flip wake_users_only / access flags arbitrarily (F-RULES-21 / F-DATA-03)",
    async () => {
      await seedCreator(env, "creator1");
      await seedDoc(env, "events/e1", {
        creator_id: "creator1",
        access: "wake_only",
        status: "active",
      });
      const ctx = env.authenticatedContext("creator1", {role: "creator"});
      // After fix: gating fields should require admin or be append-only.
      await assertFails(
        updateDoc(doc(ctx.firestore(), "events/e1"), {access: "public"})
      );
    }
  );
});

describe("event_signups/registrations — F-RULES-06 / F-RULES-41", () => {
  it("authenticated user can register for an open event with their own userId", async () => {
    await seedDoc(env, "events/e1", {
      creator_id: "creator1",
      status: "active",
      access: "public",
    });
    await seedUser(env, "u1");
    // Post-Tier-6: rule binds resource.email to auth token email when email
    // is supplied; pass it on the auth context so the bind matches.
    const ctx = env.authenticatedContext("u1", {email: "u1@example.com"});
    await assertSucceeds(
      setDoc(doc(ctx.firestore(), "event_signups/e1/registrations/r1"), {
        userId: "u1",
        email: "u1@example.com",
        nombre: "Alice",
        check_in_token: "token123",
        created_at: new Date(),
      })
    );
  });

  it(
    "FIXED: authed user CANNOT spoof userId of another user on registration (F-RULES-41)",
    async () => {
      await seedDoc(env, "events/e1", {
        creator_id: "creator1",
        status: "active",
        access: "public",
      });
      await seedUser(env, "attacker");
      await seedUser(env, "victim");
      const ctx = env.authenticatedContext("attacker");
      // After fix: when authed, request.resource.data.userId must equal auth.uid.
      await assertFails(
        setDoc(doc(ctx.firestore(), "event_signups/e1/registrations/r1"), {
          userId: "victim",
          email: "victim@example.com",
          check_in_token: "token123",
        })
      );
    }
  );

  it.fails(
    "BUG: registration creates accept arbitrary unwhitelisted fields (F-RULES-06)",
    async () => {
      await seedDoc(env, "events/e1", {
        creator_id: "creator1",
        status: "active",
        access: "public",
      });
      const ctx = env.unauthenticatedContext();
      // After fix: keys().hasOnly([...whitelist]) should reject unknown fields.
      await assertFails(
        setDoc(doc(ctx.firestore(), "event_signups/e1/registrations/r-spam"), {
          email: "anyone@example.com",
          nombre: "x",
          check_in_token: "t",
          // unwhitelisted fields:
          attacker_inject: "<script>",
          stuff_that_should_not_exist: {foo: "bar"},
        })
      );
    }
  );

  it("registrant can read their own registration (when authed)", async () => {
    await seedDoc(env, "events/e1", {
      creator_id: "creator1",
      status: "active",
      access: "public",
    });
    await seedUser(env, "u1");
    await seedDoc(env, "event_signups/e1/registrations/r1", {
      userId: "u1",
      email: "u1@example.com",
    });
    const ctx = env.authenticatedContext("u1");
    await assertSucceeds(
      getDoc(doc(ctx.firestore(), "event_signups/e1/registrations/r1"))
    );
  });

  it("creator can read all registrations on their own event", async () => {
    await seedCreator(env, "creator1");
    await seedDoc(env, "events/e1", {
      creator_id: "creator1",
      status: "active",
    });
    await seedDoc(env, "event_signups/e1/registrations/r1", {
      userId: "anyone",
      email: "x@example.com",
    });
    const ctx = env.authenticatedContext("creator1", {role: "creator"});
    await assertSucceeds(
      getDoc(doc(ctx.firestore(), "event_signups/e1/registrations/r1"))
    );
  });
});
