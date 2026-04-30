import {describe, it, expect} from "vitest";
import {
  ALLOWED_USER_COURSE_STATUSES,
  assertAllowedUserCourseStatus,
  assertAllowedSubscriptionTransition,
  MAX_TRIAL_DURATION_DAYS,
  clampTrialDurationDays,
  buildAllowedDownloadPrefixes,
  assertAllowedDownloadPath,
  assertAllowedCallLinkUrl,
  assertHttpsUrl,
  assertTextLength,
  clampPushSenderName,
  isFreeGrantAllowed,
  loadCreatorOwnedCourseIds,
  maskEmail,
  pickPublicCourseFields,
  PUBLIC_COURSE_FIELDS,
  PUSH_SENDER_NAME_MAX,
  redactEmailForLog,
  safeErrorPayload,
  sanitizeBroadcastHtml,
  TEXT_CAP_NOTE,
  TEXT_CAP_TITLE,
  validateDeletionPath,
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

// ─── Deletion path validator (audit C-03 / C-04) ─────────────────────────────

describe("validateDeletionPath", () => {
  it("ACCEPTS sessions/<id>", () => {
    expect(validateDeletionPath("sessions/abc-123")).toEqual(["sessions", "abc-123"]);
  });

  it("ACCEPTS sessions/<id>/exercises/<id>", () => {
    expect(validateDeletionPath("sessions/s1/exercises/e1"))
      .toEqual(["sessions", "s1", "exercises", "e1"]);
  });

  it("ACCEPTS sessions/<id>/exercises/<id>/sets/<id>", () => {
    expect(validateDeletionPath("sessions/s1/exercises/e1/sets/set9"))
      .toEqual(["sessions", "s1", "exercises", "e1", "sets", "set9"]);
  });

  it("REJECTS path traversal attempts (.. as id)", () => {
    expect(() => validateDeletionPath("sessions/..")).toThrow(WakeApiServerError);
    expect(() => validateDeletionPath("sessions/../../users")).toThrow(WakeApiServerError);
  });

  it("REJECTS top-level collection names not in allowlist", () => {
    expect(() => validateDeletionPath("users/alice")).toThrow(WakeApiServerError);
    expect(() => validateDeletionPath("processed_payments/x")).toThrow(WakeApiServerError);
  });

  it("REJECTS odd number of segments (would target a collection, not doc)", () => {
    expect(() => validateDeletionPath("sessions")).toThrow(WakeApiServerError);
    expect(() => validateDeletionPath("sessions/s1/exercises")).toThrow(WakeApiServerError);
  });

  it("REJECTS empty / non-string", () => {
    expect(() => validateDeletionPath(null)).toThrow(WakeApiServerError);
    expect(() => validateDeletionPath({})).toThrow(WakeApiServerError);
    expect(() => validateDeletionPath("")).toThrow(WakeApiServerError);
  });

  it("REJECTS segments with disallowed characters", () => {
    expect(() => validateDeletionPath("sessions/has spaces")).toThrow(WakeApiServerError);
    expect(() => validateDeletionPath("sessions/has/slash")).toThrow(WakeApiServerError);
    expect(() => validateDeletionPath("sessions/has.dot")).toThrow(WakeApiServerError);
  });

  it("REJECTS segments longer than 128 chars", () => {
    expect(() => validateDeletionPath("sessions/" + "a".repeat(129)))
      .toThrow(WakeApiServerError);
  });

  it("REJECTS depths beyond maxDepth (default 3 = sessions/exercises/sets)", () => {
    expect(() => validateDeletionPath("sessions/a/exercises/b/sets/c/extras/d"))
      .toThrow(WakeApiServerError);
  });

  it("REJECTS even-segment but middle collection not in allowlist", () => {
    // sessions/<id>/HACKED/<id> — should reject because 'HACKED' not allowed
    expect(() => validateDeletionPath("sessions/s1/HACKED/e1")).toThrow(WakeApiServerError);
  });

  it("returns 400 VALIDATION_ERROR on rejection", () => {
    try {
      validateDeletionPath("../etc/passwd");
      throw new Error("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(WakeApiServerError);
      const wakeErr = err as WakeApiServerError;
      expect(wakeErr.status).toBe(400);
      expect(wakeErr.code).toBe("VALIDATION_ERROR");
      expect(wakeErr.field).toBe("deletions");
    }
  });
});

// ─── Call-link domain allowlist (audit M-42) ─────────────────────────────────

describe("assertAllowedCallLinkUrl", () => {
  it("ACCEPTS allowlisted vendor domains", () => {
    expect(() => assertAllowedCallLinkUrl("https://zoom.us/j/123456")).not.toThrow();
    expect(() => assertAllowedCallLinkUrl("https://us02web.zoom.us/j/123")).not.toThrow();
    expect(() => assertAllowedCallLinkUrl("https://meet.google.com/abc-defg-hij")).not.toThrow();
    expect(() => assertAllowedCallLinkUrl("https://meet.jit.si/wake-room")).not.toThrow();
    expect(() => assertAllowedCallLinkUrl("https://wake.daily.co/room")).not.toThrow();
    expect(() => assertAllowedCallLinkUrl("https://whereby.com/wake")).not.toThrow();
    expect(() => assertAllowedCallLinkUrl("https://teams.microsoft.com/l/meetup/abc")).not.toThrow();
  });

  it("REJECTS arbitrary phishing domain", () => {
    expect(() => assertAllowedCallLinkUrl("https://evil.example.com/zoom"))
      .toThrow(WakeApiServerError);
  });

  it("REJECTS javascript: scheme", () => {
    expect(() => assertAllowedCallLinkUrl("javascript:alert(1)"))
      .toThrow(WakeApiServerError);
  });

  it("REJECTS http:// (no scheme downgrade)", () => {
    expect(() => assertAllowedCallLinkUrl("http://zoom.us/j/123"))
      .toThrow(WakeApiServerError);
  });

  it("REJECTS lookalike domain (zoom-us.com)", () => {
    expect(() => assertAllowedCallLinkUrl("https://zoom-us.com/j/123"))
      .toThrow(WakeApiServerError);
    expect(() => assertAllowedCallLinkUrl("https://zoom.us.evil.com/j/123"))
      .toThrow(WakeApiServerError);
  });

  it("ACCEPTS subdomains of allowlisted domains", () => {
    expect(() => assertAllowedCallLinkUrl("https://x.y.zoom.us/j/123")).not.toThrow();
  });
});

// ─── Length caps (audit M-39) ────────────────────────────────────────────────

describe("assertTextLength", () => {
  it("accepts strings within the cap", () => {
    expect(assertTextLength("hello", "field", 10)).toBe("hello");
  });

  it("rejects non-string input", () => {
    expect(() => assertTextLength(123, "field", 10)).toThrow(WakeApiServerError);
    expect(() => assertTextLength(null, "field", 10)).toThrow(WakeApiServerError);
    expect(() => assertTextLength(undefined, "field", 10)).toThrow(WakeApiServerError);
  });

  it("rejects empty/whitespace by default", () => {
    expect(() => assertTextLength("", "field", 10)).toThrow(WakeApiServerError);
    expect(() => assertTextLength("   ", "field", 10)).toThrow(WakeApiServerError);
  });

  it("allows empty when allowEmpty is set", () => {
    expect(assertTextLength("", "field", 10, {allowEmpty: true})).toBe("");
  });

  it("rejects strings over the cap", () => {
    expect(() => assertTextLength("a".repeat(11), "field", 10)).toThrow(WakeApiServerError);
  });

  it("uses the canonical cap constants", () => {
    expect(() => assertTextLength("a".repeat(TEXT_CAP_TITLE), "title", TEXT_CAP_TITLE)).not.toThrow();
    expect(() => assertTextLength("a".repeat(TEXT_CAP_TITLE + 1), "title", TEXT_CAP_TITLE))
      .toThrow(WakeApiServerError);
    expect(() => assertTextLength("a".repeat(TEXT_CAP_NOTE + 1), "note", TEXT_CAP_NOTE))
      .toThrow(WakeApiServerError);
  });
});

// ─── Email masking (audit M-45) ──────────────────────────────────────────────

describe("maskEmail", () => {
  it("masks a normal email", () => {
    expect(maskEmail("alex@example.com")).toBe("al***@example.com");
  });

  it("masks a 1-char local part with a single visible char", () => {
    expect(maskEmail("a@example.com")).toBe("a***@example.com");
  });

  it("masks a 2-char local part with both chars visible", () => {
    expect(maskEmail("ab@example.com")).toBe("a***@example.com");
  });

  it("returns null for non-strings", () => {
    expect(maskEmail(undefined)).toBeNull();
    expect(maskEmail(null)).toBeNull();
    expect(maskEmail(42)).toBeNull();
  });

  it("returns null for malformed addresses", () => {
    expect(maskEmail("no-at-sign")).toBeNull();
    expect(maskEmail("@example.com")).toBeNull();
    expect(maskEmail("foo@")).toBeNull();
  });

  it("preserves the domain in plain text (deliberate)", () => {
    expect(maskEmail("longusername@gmail.com")).toBe("lo***@gmail.com");
  });
});

// ─── Creator-owned course IDs (audit M-44) ───────────────────────────────────

describe("loadCreatorOwnedCourseIds", () => {
  it("returns the doc ids from the courses query keyed on creator_id", async () => {
    const calls: Array<{collection?: string; where?: [string, string, string]}> = [];
    const fakeDb = {
      collection(path: string) {
        calls.push({collection: path});
        return {
          where(field: string, op: string, value: string) {
            calls.push({where: [field, op, value]});
            return this;
          },
          select() {
            return this;
          },
          async get() {
            return {
              docs: [
                {id: "course-a"},
                {id: "course-b"},
              ],
            };
          },
        };
      },
    };
    const ids = await loadCreatorOwnedCourseIds(fakeDb, "creator-1");
    expect(ids).toBeInstanceOf(Set);
    expect(ids.has("course-a")).toBe(true);
    expect(ids.has("course-b")).toBe(true);
    expect(ids.has("course-c")).toBe(false);
    expect(calls[0]).toEqual({collection: "courses"});
    expect(calls[1]).toEqual({where: ["creator_id", "==", "creator-1"]});
  });

  it("returns an empty set when the creator owns nothing", async () => {
    const fakeDb = {
      collection() {
        return {
          where() {
            return this;
          },
          select() {
            return this;
          },
          async get() {
            return {docs: []};
          },
        };
      },
    };
    const ids = await loadCreatorOwnedCourseIds(fakeDb, "creator-1");
    expect(ids.size).toBe(0);
  });
});

// ─── Broadcast HTML sanitizer (audit H-26) ───────────────────────────────────

describe("sanitizeBroadcastHtml", () => {
  it("strips <script>", () => {
    const out = sanitizeBroadcastHtml("hi<script>alert(1)</script>there");
    expect(out).not.toContain("<script");
    expect(out).not.toContain("alert");
  });

  it("strips on*= event handlers", () => {
    const out = sanitizeBroadcastHtml("<a href=\"https://example.com\" onclick=\"alert(1)\">x</a>");
    expect(out).not.toContain("onclick");
    expect(out).toContain("href=\"https://example.com\"");
  });

  it("strips <iframe>", () => {
    const out = sanitizeBroadcastHtml("<iframe src=\"https://evil.com\"></iframe>hello");
    expect(out).not.toContain("iframe");
    expect(out).toContain("hello");
  });

  it("strips <form>", () => {
    const out = sanitizeBroadcastHtml("<form action=\"https://evil.com\"><input/></form>ok");
    expect(out).not.toContain("<form");
    expect(out).not.toContain("<input");
    expect(out).toContain("ok");
  });

  it("strips <style>", () => {
    const out = sanitizeBroadcastHtml("<style>body{display:none}</style>visible");
    expect(out).not.toContain("<style");
    expect(out).toContain("visible");
  });

  it("REJECTS javascript: in href", () => {
    const out = sanitizeBroadcastHtml("<a href=\"javascript:alert(1)\">x</a>");
    expect(out).not.toContain("javascript:");
  });

  it("forces target=_blank rel=noopener noreferrer on links", () => {
    const out = sanitizeBroadcastHtml("<a href=\"https://example.com\">x</a>");
    expect(out).toContain("target=\"_blank\"");
    expect(out).toContain("rel=\"noopener noreferrer\"");
  });

  it("preserves safe marketing tags + inline styles", () => {
    const out = sanitizeBroadcastHtml(
      "<h1 style=\"color:#fff;text-align:center\">Hello</h1>" +
      "<p style=\"font-size:16px\">Body <strong>bold</strong></p>" +
      "<a href=\"https://wakelab.co\">link</a>"
    );
    expect(out).toContain("<h1");
    expect(out).toContain("<p");
    expect(out).toContain("<strong>");
    expect(out).toContain("color:#fff");
    expect(out).toContain("font-size:16px");
  });

  it("returns empty string for non-string input", () => {
    expect(sanitizeBroadcastHtml(undefined as unknown as string)).toBe("");
    expect(sanitizeBroadcastHtml(null as unknown as string)).toBe("");
  });
});

// ─── Push notification senderName clamp (audit H-27) ─────────────────────────

describe("clampPushSenderName", () => {
  it("returns the name unchanged when within cap", () => {
    expect(clampPushSenderName("Alex Smith")).toBe("Alex Smith");
  });

  it("truncates long names with ellipsis", () => {
    const long = "x".repeat(PUSH_SENDER_NAME_MAX + 20);
    const out = clampPushSenderName(long);
    expect(out.length).toBeLessThanOrEqual(PUSH_SENDER_NAME_MAX);
    expect(out.endsWith("…")).toBe(true);
  });

  it("strips bidi override characters (impersonation defense)", () => {
    // U+202E RIGHT-TO-LEFT OVERRIDE
    const evil = "Wake admin‮";
    expect(clampPushSenderName(evil)).toBe("Wake admin");
  });

  it("returns 'Alguien' for non-strings", () => {
    expect(clampPushSenderName(undefined)).toBe("Alguien");
    expect(clampPushSenderName(null)).toBe("Alguien");
    expect(clampPushSenderName(42)).toBe("Alguien");
  });

  it("returns 'Alguien' for empty/whitespace-only", () => {
    expect(clampPushSenderName("   ")).toBe("Alguien");
    expect(clampPushSenderName("")).toBe("Alguien");
  });
});

// ─── Email redaction (audit M-26 / M-27 / M-28) ──────────────────────────────

describe("redactEmailForLog", () => {
  it("returns ***@domain", () => {
    expect(redactEmailForLog("alex@example.com")).toBe("***@example.com");
  });

  it("preserves the full domain (deliberate, helps with deliverability triage)", () => {
    expect(redactEmailForLog("anyone@gmail.com")).toBe("***@gmail.com");
  });

  it("returns empty for non-strings", () => {
    expect(redactEmailForLog(undefined)).toBe("");
    expect(redactEmailForLog(null)).toBe("");
    expect(redactEmailForLog(42)).toBe("");
  });

  it("returns [invalid] for malformed addresses", () => {
    expect(redactEmailForLog("foo")).toBe("[invalid]");
    expect(redactEmailForLog("@example.com")).toBe("[invalid]");
    expect(redactEmailForLog("foo@")).toBe("[invalid]");
  });
});

// ─── Safe error payload (audit M-25 / L-41) ──────────────────────────────────

describe("safeErrorPayload", () => {
  it("returns name + truncated message for Error instances", () => {
    const err = new Error("boom");
    const out = safeErrorPayload(err);
    expect(out.message).toBe("boom");
    expect(out.name).toBe("Error");
  });

  it("strips MP-style PII fields from arbitrary error objects", () => {
    const mpError = {
      message: "Payment validation failed",
      name: "MercadoPagoError",
      status: 400,
      code: "PAYER_ERROR",
      payer: {email: "victim@example.com", identification: "12345"},
      card: {last_four_digits: "1111"},
      additional_info: {bin: "411111"},
      transaction_amount: 50000,
      external_reference: "v1|user-123|course-x|otp",
    };
    const out = safeErrorPayload(mpError);
    expect(out.message).toBe("Payment validation failed");
    expect(out.code).toBe("PAYER_ERROR");
    expect(out.status).toBe(400);
    expect(out.payer).toBeUndefined();
    expect(out.card).toBeUndefined();
    expect(out.additional_info).toBeUndefined();
    expect(out.transaction_amount).toBeUndefined();
    expect(out.external_reference).toBeUndefined();
  });

  it("truncates long messages", () => {
    const long = "a".repeat(2000);
    const out = safeErrorPayload(new Error(long));
    expect((out.message as string).length).toBe(500);
  });

  it("handles strings + primitives", () => {
    expect(safeErrorPayload("oops").message).toBe("oops");
    expect(safeErrorPayload(null).message).toBe("null");
    expect(safeErrorPayload(undefined).message).toBe("undefined");
  });
});

// ─── Public course-doc allowlist (audit H-11) ────────────────────────────────

describe("pickPublicCourseFields", () => {
  it("preserves documented public fields", () => {
    const data = {
      title: "Hypertrophy 8wk",
      description: "Lift big",
      image_url: "https://x.example/img.jpg",
      price: 150000,
      subscription_price: 30000,
      access_duration: "monthly",
      deliveryType: "low_ticket",
      visibility: "both",
      free_trial: {active: true, duration_days: 7},
      status: "published",
      version: "2026-01",
      creator_id: "creator-1",
      creatorName: "Coach",
      tags: ["strength"],
      tutorials: {dailyWorkout: []},
      created_at: "ts",
      updated_at: "ts",
    };
    const out = pickPublicCourseFields(data);
    for (const k of Object.keys(data)) {
      expect(out).toHaveProperty(k);
    }
  });

  it("DROPS internal/future fields not on the allowlist", () => {
    const data = {
      title: "X",
      // simulated future leakage
      creator_email: "creator@example.com",
      payout_account: "bank-1234",
      internal_notes: "low quality, demote",
      moderation_flags: ["pending_review"],
      enrollment_count: 42,
      __admin_only: true,
    };
    const out = pickPublicCourseFields(data);
    expect(out.title).toBe("X");
    expect(out.creator_email).toBeUndefined();
    expect(out.payout_account).toBeUndefined();
    expect(out.internal_notes).toBeUndefined();
    expect(out.moderation_flags).toBeUndefined();
    expect(out.enrollment_count).toBeUndefined();
    expect(out.__admin_only).toBeUndefined();
  });

  it("does not invent fields that aren't on the input", () => {
    const out = pickPublicCourseFields({title: "Only"});
    expect(Object.keys(out)).toEqual(["title"]);
  });

  it("PUBLIC_COURSE_FIELDS does not include creator_email or payout fields", () => {
    expect(PUBLIC_COURSE_FIELDS).not.toContain("creator_email");
    expect(PUBLIC_COURSE_FIELDS.find((f) => f.includes("payout"))).toBeUndefined();
    expect(PUBLIC_COURSE_FIELDS.find((f) => f.includes("internal"))).toBeUndefined();
  });
});

// ─── Subscription state-machine guard (audit H-20) ───────────────────────────

describe("assertAllowedSubscriptionTransition", () => {
  it("ALLOWS pending → cancelled/paused/authorized", () => {
    expect(() => assertAllowedSubscriptionTransition("pending", "cancelled")).not.toThrow();
    expect(() => assertAllowedSubscriptionTransition("pending", "paused")).not.toThrow();
    expect(() => assertAllowedSubscriptionTransition("pending", "authorized")).not.toThrow();
  });

  it("ALLOWS authorized → paused/cancelled", () => {
    expect(() => assertAllowedSubscriptionTransition("authorized", "paused")).not.toThrow();
    expect(() => assertAllowedSubscriptionTransition("authorized", "cancelled")).not.toThrow();
  });

  it("ALLOWS paused → authorized/cancelled", () => {
    expect(() => assertAllowedSubscriptionTransition("paused", "authorized")).not.toThrow();
    expect(() => assertAllowedSubscriptionTransition("paused", "cancelled")).not.toThrow();
  });

  it("REJECTS cancel-after-cancel (the audit-trail-loss case)", () => {
    expect(() => assertAllowedSubscriptionTransition("cancelled", "cancelled"))
      .toThrow(WakeApiServerError);
  });

  it("REJECTS resume-after-cancel (cancelled is terminal)", () => {
    expect(() => assertAllowedSubscriptionTransition("cancelled", "authorized"))
      .toThrow(WakeApiServerError);
  });

  it("REJECTS pause-after-cancel", () => {
    expect(() => assertAllowedSubscriptionTransition("cancelled", "paused"))
      .toThrow(WakeApiServerError);
  });

  it("REJECTS no-op transitions (already in target state)", () => {
    expect(() => assertAllowedSubscriptionTransition("authorized", "authorized"))
      .toThrow(WakeApiServerError);
    expect(() => assertAllowedSubscriptionTransition("paused", "paused"))
      .toThrow(WakeApiServerError);
  });

  it("ALLOWS legacy/missing on-disk status to self-heal", () => {
    expect(() => assertAllowedSubscriptionTransition(null, "authorized")).not.toThrow();
    expect(() => assertAllowedSubscriptionTransition(undefined, "cancelled")).not.toThrow();
    expect(() => assertAllowedSubscriptionTransition("", "paused")).not.toThrow();
  });

  it("ALLOWS unknown legacy MP states to pass through", () => {
    expect(() => assertAllowedSubscriptionTransition("in_process", "authorized")).not.toThrow();
  });
});
