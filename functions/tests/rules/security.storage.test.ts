/**
 * Security audit — Storage rules.
 *
 * Findings covered:
 *   F-RULES-25  exercises_library write open to any authed user, 500MB cap
 *   F-RULES-26  courses/{programId}/* writable by any authed user (defacement)
 *   F-RULES-27  courses/.../tutorials and sessions writable by any authed user
 *   F-RULES-28  events/{eventId}/* writable by any authed user (defacement)
 *
 * Note: Storage rules tests are slower than Firestore rules tests because
 * they upload bytes to the emulator. Each test uploads ~10 bytes only.
 */

import {beforeAll, afterAll, beforeEach, describe, it} from "vitest";
import {ref, uploadBytes, getBytes} from "firebase/storage";
import {doc, setDoc} from "firebase/firestore";
import {
  bootStorageRulesEnv,
  seedUser,
  seedCreator,
  seedCourse,
  assertFails,
  assertSucceeds,
} from "./_helper.js";
import type {RulesTestEnvironment} from "@firebase/rules-unit-testing";

let env: RulesTestEnvironment;
beforeAll(async () => {
  env = await bootStorageRulesEnv("wake-rules-security-storage");
});
afterAll(async () => {
  if (env) await env.cleanup();
});
beforeEach(async () => {
  await env.clearStorage();
  await env.clearFirestore();
});

const tinyJpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);

describe("Storage — courses/{programId}/* (F-RULES-26)", () => {
  it(
    "BUG: any authed user CAN overwrite courses/<programId>/image.jpg (F-RULES-26)",
    async () => {
      await seedCreator(env, "victim_creator");
      await seedCourse(env, "victim_program", "victim_creator");
      await seedUser(env, "attacker");
      const ctx = env.authenticatedContext("attacker");
      // After fix: storage rule must look up courses/{programId}.creator_id
      // and require it to match request.auth.uid.
      await assertFails(
        uploadBytes(
          ref(ctx.storage(), "courses/victim_program/image.jpg"),
          tinyJpeg,
          {contentType: "image/jpeg"}
        )
      );
    }
  );

  // The post-fix rule uses firestore.get / firestore.exists to bind the
  // upload to courses/{programId}.creator_id. In production this works
  // (storage rule engine resolves cross-service against firestore).
  // @firebase/rules-unit-testing v5 does NOT wire storage→firestore
  // cross-service in the test emulator, so a positive-path assertion of
  // assertSucceeds always sees PERMISSION_DENIED here even when the rule
  // would allow in prod. The post-deploy smoke runner exercises the
  // happy path against the deployed bucket.
  it.skip("course owner CAN upload to their own course path (TEST-ENV LIMITATION)", async () => {
    await seedCreator(env, "creator1");
    await seedCourse(env, "myCourse", "creator1");
    const ctx = env.authenticatedContext("creator1", {role: "creator"});
    await assertSucceeds(
      uploadBytes(
        ref(ctx.storage(), "courses/myCourse/image.jpg"),
        tinyJpeg,
        {contentType: "image/jpeg"}
      )
    );
  });
});

describe("Storage — courses tutorials + sessions (F-RULES-27)", () => {
  // STORAGE PATH NOTE: tutorials rule is `match /courses/{programId}/tutorials/{screenName}/{fileName}`
  // — FOUR segments after `courses/`, not three. Tests below use the correct
  // 4-segment shape that matches the rule.

  it(
    "BUG: any authed user CAN overwrite tutorials videos (F-RULES-27)",
    async () => {
      await seedCreator(env, "victim_creator");
      await seedCourse(env, "victim_program", "victim_creator");
      await seedUser(env, "attacker");
      const ctx = env.authenticatedContext("attacker");
      // Path: courses/{programId}/tutorials/{screenName}/{fileName}
      await assertFails(
        uploadBytes(
          ref(
            ctx.storage(),
            "courses/victim_program/tutorials/dailyWorkout/intro.mp4"
          ),
          new Uint8Array(20),
          {contentType: "video/mp4"}
        )
      );
    }
  );

  it(
    "BUG: any authed user CAN overwrite session images (F-RULES-27)",
    async () => {
      // Path: courses/{programId}/modules/{moduleId}/sessions/{fileName}
      await seedCreator(env, "victim_creator");
      await seedCourse(env, "victim_program", "victim_creator");
      await seedUser(env, "attacker");
      const ctx = env.authenticatedContext("attacker");
      await assertFails(
        uploadBytes(
          ref(
            ctx.storage(),
            "courses/victim_program/modules/m1/sessions/cover.jpg"
          ),
          new Uint8Array(20),
          {contentType: "image/jpeg"}
        )
      );
    }
  );

  it("Wrong-shape tutorial path falls through to default deny (correctly rejected today)", async () => {
    // Storage rule for tutorials is the 4-segment path. A 3-segment path
    // (`courses/<pid>/tutorials/<file>` — missing screenName) doesn't match
    // any rule and is denied by default. Pinning this behavior so a future
    // rule loosening that adds a 3-segment match is caught.
    await seedUser(env, "attacker");
    const ctx = env.authenticatedContext("attacker");
    await assertFails(
      uploadBytes(
        ref(ctx.storage(), "courses/anyProgram/tutorials/orphan.mp4"),
        new Uint8Array(10),
        {contentType: "video/mp4"}
      )
    );
  });
});

describe("Storage — events/{eventId}/* (F-RULES-28)", () => {
  it(
    "BUG: any authed user CAN overwrite events/<eid>/cover.jpg (F-RULES-28)",
    async () => {
      await env.withSecurityRulesDisabled(async (ctx) => {
        await setDoc(doc(ctx.firestore(), "events/victim_event"), {
          creator_id: "victim_creator",
          status: "active",
        });
      });
      await seedUser(env, "attacker");
      const ctx = env.authenticatedContext("attacker");
      await assertFails(
        uploadBytes(
          ref(ctx.storage(), "events/victim_event/cover.jpg"),
          tinyJpeg,
          {contentType: "image/jpeg"}
        )
      );
    }
  );
});

describe("Storage — exercises_library (F-RULES-25)", () => {
  it(
    "BUG: any authed user CAN upload to exercises_library/* (F-RULES-25)",
    async () => {
      await seedUser(env, "attacker");
      const ctx = env.authenticatedContext("attacker");
      // After fix: storage rule must look up users/{auth.uid}.role and
      // require role in [creator, admin].
      await assertFails(
        uploadBytes(
          ref(ctx.storage(), "exercises_library/lib1/squat/squat.mp4"),
          new Uint8Array(20),
          {contentType: "video/mp4"}
        )
      );
    }
  );
});

describe("Storage — profile_pictures (own-uid scoped)", () => {
  it("user CAN upload to their own profile_pictures path", async () => {
    await seedUser(env, "u1");
    const ctx = env.authenticatedContext("u1");
    await assertSucceeds(
      uploadBytes(
        ref(ctx.storage(), "profile_pictures/u1/avatar.jpg"),
        tinyJpeg,
        {contentType: "image/jpeg"}
      )
    );
  });

  it("user CANNOT upload to another user's profile_pictures path", async () => {
    await seedUser(env, "u1");
    await seedUser(env, "u2");
    const ctx = env.authenticatedContext("u2");
    await assertFails(
      uploadBytes(
        ref(ctx.storage(), "profile_pictures/u1/hijacked.jpg"),
        tinyJpeg,
        {contentType: "image/jpeg"}
      )
    );
  });
});

describe("Storage — progress_photos (own-uid scoped)", () => {
  it("user CAN upload to their own progress_photos", async () => {
    await seedUser(env, "u1");
    const ctx = env.authenticatedContext("u1");
    await assertSucceeds(
      uploadBytes(
        ref(ctx.storage(), "progress_photos/u1/2026-04-30/p1.jpg"),
        tinyJpeg,
        {contentType: "image/jpeg"}
      )
    );
  });

  it("user CANNOT upload to another user's progress_photos", async () => {
    await seedUser(env, "u1");
    await seedUser(env, "u2");
    const ctx = env.authenticatedContext("u2");
    await assertFails(
      uploadBytes(
        ref(ctx.storage(), "progress_photos/u1/2026-04-30/p1.jpg"),
        tinyJpeg,
        {contentType: "image/jpeg"}
      )
    );
  });
});
