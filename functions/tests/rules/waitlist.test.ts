/**
 * Firestore rules tests for event_signups/{eventId}/waitlist/{waitId}
 * (audit H-02). Verifies the patch that requires authentication and binds
 * userId to the caller.
 *
 * Requires Firebase emulator. Run with:
 *   firebase emulators:start --only firestore (in another terminal)
 *   npm run test:rules
 *
 * Or one-shot:
 *   firebase emulators:exec --only firestore "npm run test:rules"
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
import {doc, setDoc} from "firebase/firestore";

const RULES_PATH = resolve(__dirname, "../../../config/firebase/firestore.rules");

let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: "wake-rules-test",
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

async function seedEvent(eventId: string, creatorId: string): Promise<void> {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), `events/${eventId}`), {
      creator_id: creatorId,
      title: "Test Event",
      status: "open",
      capacity: 10,
    });
  });
}

describe("event_signups/{eventId}/waitlist (audit H-02)", () => {
  it("REJECTS unauthenticated public writes (the prior exploit)", async () => {
    await seedEvent("event1", "creator1");
    const anon = testEnv.unauthenticatedContext();
    await assertFails(
      setDoc(doc(anon.firestore(), "event_signups/event1/waitlist/spam-doc-id"), {
        userId: "victim",
        email: "spam@evil.com",
        spam: "x".repeat(10000),
      })
    );
  });

  it("ACCEPTS authenticated user writing entry under their own uid as docId", async () => {
    await seedEvent("event1", "creator1");
    const alice = testEnv.authenticatedContext("alice");
    await assertSucceeds(
      setDoc(doc(alice.firestore(), "event_signups/event1/waitlist/alice"), {
        joinedAt: Date.now(),
      })
    );
  });

  it("ACCEPTS authenticated user writing entry with their userId in body", async () => {
    await seedEvent("event1", "creator1");
    const alice = testEnv.authenticatedContext("alice");
    await assertSucceeds(
      setDoc(doc(alice.firestore(), "event_signups/event1/waitlist/random-doc-id"), {
        userId: "alice",
        joinedAt: Date.now(),
      })
    );
  });

  it("REJECTS authenticated user impersonating another user's userId", async () => {
    await seedEvent("event1", "creator1");
    const alice = testEnv.authenticatedContext("alice");
    await assertFails(
      setDoc(doc(alice.firestore(), "event_signups/event1/waitlist/random-id"), {
        userId: "bob",  // impersonating bob
        joinedAt: Date.now(),
      })
    );
  });

  it("REJECTS authenticated user with no userId binding (neither docId nor body)", async () => {
    await seedEvent("event1", "creator1");
    const alice = testEnv.authenticatedContext("alice");
    await assertFails(
      setDoc(doc(alice.firestore(), "event_signups/event1/waitlist/some-random-id"), {
        someField: "value",
      })
    );
  });

  it("creator can read all waitlist entries on their event", async () => {
    await seedEvent("event1", "creator1");
    const alice = testEnv.authenticatedContext("alice");
    await setDoc(doc(alice.firestore(), "event_signups/event1/waitlist/alice"), {
      joinedAt: Date.now(),
    });

    const creator = testEnv.authenticatedContext("creator1");
    await assertSucceeds(
      // @ts-expect-error firebase v9 modular API
      (await import("firebase/firestore")).getDoc(
        doc(creator.firestore(), "event_signups/event1/waitlist/alice")
      )
    );
  });

  it("non-creator cannot read another user's waitlist entry", async () => {
    await seedEvent("event1", "creator1");
    const alice = testEnv.authenticatedContext("alice");
    await setDoc(doc(alice.firestore(), "event_signups/event1/waitlist/alice"), {
      joinedAt: Date.now(),
    });

    const bob = testEnv.authenticatedContext("bob");
    await assertFails(
      // @ts-expect-error firebase v9 modular API
      (await import("firebase/firestore")).getDoc(
        doc(bob.firestore(), "event_signups/event1/waitlist/alice")
      )
    );
  });
});
