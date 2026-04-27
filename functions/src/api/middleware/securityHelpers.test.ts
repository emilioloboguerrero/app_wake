import {describe, it, expect} from "vitest";
import {
  ALLOWED_USER_COURSE_STATUSES,
  assertAllowedUserCourseStatus,
  MAX_TRIAL_DURATION_DAYS,
  clampTrialDurationDays,
  buildAllowedDownloadPrefixes,
  assertAllowedDownloadPath,
  assertHttpsUrl,
  isFreeGrantAllowed,
} from "./securityHelpers.js";
import {WakeApiServerError} from "../errors.js";

// ─── User course status enum (audit H-25) ────────────────────────────────────

describe("assertAllowedUserCourseStatus", () => {
  it("accepts each documented status value", () => {
    for (const status of ALLOWED_USER_COURSE_STATUSES) {
      expect(() => assertAllowedUserCourseStatus(status)).not.toThrow();
    }
  });

  it("rejects 'trial' (the historical exploit value)", () => {
    expect(() => assertAllowedUserCourseStatus("trial")).toThrow(WakeApiServerError);
  });

  it("rejects empty string", () => {
    expect(() => assertAllowedUserCourseStatus("")).toThrow(WakeApiServerError);
  });

  it("rejects arbitrary attacker-controlled values", () => {
    const attackerValues = [
      "active'; DROP TABLE",
      "ADMIN",
      "active ",
      " active",
      "Active",
      "premium",
      "lifetime",
      JSON.stringify({status: "active"}),
    ];
    for (const value of attackerValues) {
      expect(() => assertAllowedUserCourseStatus(value)).toThrow(WakeApiServerError);
    }
  });

  it("error response has correct HTTP code and field name", () => {
    try {
      assertAllowedUserCourseStatus("foo", "myField");
      throw new Error("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(WakeApiServerError);
      const wakeErr = err as WakeApiServerError;
      expect(wakeErr.status).toBe(400);
      expect(wakeErr.code).toBe("VALIDATION_ERROR");
      expect(wakeErr.field).toBe("myField");
    }
  });
});

// ─── Trial duration clamp (audit C-06) ───────────────────────────────────────

describe("clampTrialDurationDays", () => {
  it("clamps requests above 14 days to 14", () => {
    expect(clampTrialDurationDays(36500)).toBe(MAX_TRIAL_DURATION_DAYS);
    expect(clampTrialDurationDays(100)).toBe(MAX_TRIAL_DURATION_DAYS);
    expect(clampTrialDurationDays(15)).toBe(MAX_TRIAL_DURATION_DAYS);
  });

  it("preserves requests at or under 14 days", () => {
    expect(clampTrialDurationDays(7)).toBe(7);
    expect(clampTrialDurationDays(14)).toBe(14);
    expect(clampTrialDurationDays(1)).toBe(1);
  });

  it("further clamps to course-configured cap when smaller", () => {
    expect(clampTrialDurationDays(14, 7)).toBe(7);
    expect(clampTrialDurationDays(36500, 3)).toBe(3);
    expect(clampTrialDurationDays(5, 7)).toBe(5);
  });

  it("ignores course cap when course cap exceeds hard limit", () => {
    expect(clampTrialDurationDays(36500, 9999)).toBe(MAX_TRIAL_DURATION_DAYS);
  });

  it("rejects zero and negative durations", () => {
    expect(() => clampTrialDurationDays(0)).toThrow(WakeApiServerError);
    expect(() => clampTrialDurationDays(-1)).toThrow(WakeApiServerError);
    expect(() => clampTrialDurationDays(-36500)).toThrow(WakeApiServerError);
  });

  it("rejects non-finite numbers (NaN, Infinity)", () => {
    expect(() => clampTrialDurationDays(NaN)).toThrow(WakeApiServerError);
    expect(() => clampTrialDurationDays(Infinity)).toThrow(WakeApiServerError);
    expect(() => clampTrialDurationDays(-Infinity)).toThrow(WakeApiServerError);
  });

  it("floors fractional durations rather than allowing precision games", () => {
    expect(clampTrialDurationDays(7.9)).toBe(7);
    expect(clampTrialDurationDays(13.999)).toBe(13);
  });
});

// ─── Storage path allowlist (audit C-09) ─────────────────────────────────────

describe("buildAllowedDownloadPrefixes", () => {
  it("each prefix embeds the user id", () => {
    const prefixes = buildAllowedDownloadPrefixes("user-123");
    for (const prefix of prefixes) {
      expect(prefix).toContain("user-123");
    }
  });

  it("returns at least the four documented prefixes", () => {
    const prefixes = buildAllowedDownloadPrefixes("u1");
    expect(prefixes).toContain("progress_photos/u1/");
    expect(prefixes).toContain("body_log/u1/");
    expect(prefixes).toContain("profiles/u1/");
    expect(prefixes).toContain("users/u1/");
  });
});

describe("assertAllowedDownloadPath", () => {
  const userId = "alice-uid";

  it("accepts paths inside owner namespace", () => {
    expect(() => assertAllowedDownloadPath(`progress_photos/${userId}/2026-04-27.jpg`, userId)).not.toThrow();
    expect(() => assertAllowedDownloadPath(`body_log/${userId}/photo.jpg`, userId)).not.toThrow();
    expect(() => assertAllowedDownloadPath(`profiles/${userId}/avatar.jpg`, userId)).not.toThrow();
    expect(() => assertAllowedDownloadPath(`users/${userId}/document.pdf`, userId)).not.toThrow();
  });

  it("REJECTS another user's progress photos (the prior exploit)", () => {
    expect(() => assertAllowedDownloadPath("progress_photos/bob-uid/photo.jpg", userId))
      .toThrow(WakeApiServerError);
    expect(() => assertAllowedDownloadPath("body_log/bob-uid/2026-04-27.jpg", userId))
      .toThrow(WakeApiServerError);
  });

  it("REJECTS video exchange media (cross-creator client leak)", () => {
    expect(() => assertAllowedDownloadPath("video_exchanges/exch1/msg1/video.mp4", userId))
      .toThrow(WakeApiServerError);
  });

  it("REJECTS creator library media (creator IP)", () => {
    expect(() => assertAllowedDownloadPath("creator_libraries/other-creator/sessions/s1/img.jpg", userId))
      .toThrow(WakeApiServerError);
  });

  it("REJECTS path traversal attempts", () => {
    expect(() => assertAllowedDownloadPath(`progress_photos/${userId}/../../etc/passwd`, userId))
      .toThrow(WakeApiServerError);
    expect(() => assertAllowedDownloadPath("../../sensitive", userId))
      .toThrow(WakeApiServerError);
  });

  it("REJECTS leading slash", () => {
    expect(() => assertAllowedDownloadPath(`/progress_photos/${userId}/photo.jpg`, userId))
      .toThrow(WakeApiServerError);
  });

  it("REJECTS null bytes (filesystem trick)", () => {
    expect(() => assertAllowedDownloadPath(`progress_photos/${userId}/photo.jpg\0.exe`, userId))
      .toThrow(WakeApiServerError);
  });

  it("REJECTS empty / non-string path", () => {
    expect(() => assertAllowedDownloadPath("", userId)).toThrow(WakeApiServerError);
    // @ts-expect-error testing runtime guard
    expect(() => assertAllowedDownloadPath(null, userId)).toThrow(WakeApiServerError);
    // @ts-expect-error testing runtime guard
    expect(() => assertAllowedDownloadPath(undefined, userId)).toThrow(WakeApiServerError);
    // @ts-expect-error testing runtime guard
    expect(() => assertAllowedDownloadPath(123, userId)).toThrow(WakeApiServerError);
  });

  it("REJECTS prefix-matching attacks (e.g., body_log/aliceXXX/)", () => {
    // 'progress_photos/aliceXXX/' starts with 'progress_photos/alice-uid' chars but NOT prefix
    expect(() => assertAllowedDownloadPath(
      `progress_photos/${userId}-other/photo.jpg`,
      userId
    )).toThrow(WakeApiServerError);
  });

  it("returns FORBIDDEN (not VALIDATION_ERROR) for valid-format unauthorized paths", () => {
    try {
      assertAllowedDownloadPath("progress_photos/bob-uid/photo.jpg", userId);
      throw new Error("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(WakeApiServerError);
      const wakeErr = err as WakeApiServerError;
      expect(wakeErr.status).toBe(403);
      expect(wakeErr.code).toBe("FORBIDDEN");
    }
  });
});

// ─── Free-grant authorization (audit C-01) ───────────────────────────────────

describe("isFreeGrantAllowed", () => {
  const baseCourse = {
    creator_id: "creator-1",
    status: "published" as const,
    price: 10_000,
    subscription_price: 5_000,
  };

  it("ALLOWS admin to grant any course", () => {
    expect(isFreeGrantAllowed({
      callerUserId: "any-user",
      callerRole: "admin",
      course: baseCourse,
    })).toBe(true);
  });

  it("ALLOWS creator who owns the course (own-program preview)", () => {
    expect(isFreeGrantAllowed({
      callerUserId: "creator-1",
      callerRole: "creator",
      course: baseCourse,
    })).toBe(true);
  });

  it("ALLOWS creator who owns via creatorId field (alt schema)", () => {
    expect(isFreeGrantAllowed({
      callerUserId: "creator-2",
      callerRole: "creator",
      course: {creatorId: "creator-2", status: "published", price: 100},
    })).toBe(true);
  });

  it("REJECTS creator who does NOT own the course (the C-01 cross-creator exploit)", () => {
    expect(isFreeGrantAllowed({
      callerUserId: "creator-2",
      callerRole: "creator",
      course: baseCourse,
    })).toBe(false);
  });

  it("REJECTS regular user against a paid published course (the C-01 exploit)", () => {
    expect(isFreeGrantAllowed({
      callerUserId: "alice",
      callerRole: "user",
      course: baseCourse,
    })).toBe(false);
  });

  it("ALLOWS any user against a draft program (preview testing)", () => {
    expect(isFreeGrantAllowed({
      callerUserId: "alice",
      callerRole: "user",
      course: {...baseCourse, status: "draft"},
    })).toBe(true);
    expect(isFreeGrantAllowed({
      callerUserId: "alice",
      callerRole: "user",
      course: {...baseCourse, status: "archived"},
    })).toBe(true);
  });

  it("ALLOWS any user against a free program (price=0 AND subscription_price=0)", () => {
    expect(isFreeGrantAllowed({
      callerUserId: "alice",
      callerRole: "user",
      course: {creator_id: "c1", status: "published", price: 0, subscription_price: 0},
    })).toBe(true);
  });

  it("ALLOWS any user against a free program (price/sub_price null)", () => {
    expect(isFreeGrantAllowed({
      callerUserId: "alice",
      callerRole: "user",
      course: {creator_id: "c1", status: "published", price: null, subscription_price: null},
    })).toBe(true);
  });

  it("REJECTS subscription program with price=0 but subscription_price>0", () => {
    expect(isFreeGrantAllowed({
      callerUserId: "alice",
      callerRole: "user",
      course: {creator_id: "c1", status: "published", price: 0, subscription_price: 5_000},
    })).toBe(false);
  });

  it("REJECTS one-time program with subscription_price=0 but price>0", () => {
    expect(isFreeGrantAllowed({
      callerUserId: "alice",
      callerRole: "user",
      course: {creator_id: "c1", status: "published", price: 10_000, subscription_price: 0},
    })).toBe(false);
  });
});

// ─── HTTPS URL scheme (Tier 2 helper, used by Tier 0 hardening) ──────────────

describe("assertHttpsUrl", () => {
  it("accepts https:// URLs", () => {
    expect(() => assertHttpsUrl("https://example.com", "url")).not.toThrow();
    expect(() => assertHttpsUrl("https://wakelab.co/path?q=1", "url")).not.toThrow();
    expect(() => assertHttpsUrl("https://meet.google.com/abc-defg-hij", "url")).not.toThrow();
  });

  it("REJECTS javascript: scheme (the XSS exploit)", () => {
    expect(() => assertHttpsUrl("javascript:alert(1)", "url")).toThrow(WakeApiServerError);
    expect(() => assertHttpsUrl("javascript:fetch('//evil.com')", "url")).toThrow(WakeApiServerError);
  });

  it("REJECTS http:// (insecure)", () => {
    expect(() => assertHttpsUrl("http://example.com", "url")).toThrow(WakeApiServerError);
  });

  it("REJECTS data: scheme", () => {
    expect(() => assertHttpsUrl("data:text/html,<script>alert(1)</script>", "url"))
      .toThrow(WakeApiServerError);
  });

  it("REJECTS file: scheme", () => {
    expect(() => assertHttpsUrl("file:///etc/passwd", "url")).toThrow(WakeApiServerError);
  });

  it("REJECTS malformed URLs", () => {
    expect(() => assertHttpsUrl("not-a-url", "url")).toThrow(WakeApiServerError);
    expect(() => assertHttpsUrl("://malformed", "url")).toThrow(WakeApiServerError);
  });

  it("REJECTS empty string", () => {
    expect(() => assertHttpsUrl("", "url")).toThrow(WakeApiServerError);
  });
});
