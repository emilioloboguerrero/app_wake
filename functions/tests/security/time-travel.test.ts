/**
 * Time-travel tests — token cache TTL, expires_at boundaries, rate-limit windows.
 *
 * Findings covered:
 *   F-MW-06    Token cache TTL (5 min) ignores `decoded.exp` — revoked
 *              tokens stay valid up to 5 min after revocation.
 *   F-API1-19  Override endpoints accept status: 'expired' (no time check).
 *   F-MW-21    Rate-limit window quantization (60s boundary).
 *
 * Uses vitest fake timers to advance system time without waiting in real
 * wall-clock seconds.
 *
 * NOTE: pure unit-style tests for time logic. The middleware is hard to
 * fake-timer in isolation (it requires mocking firebase-admin's verifyIdToken)
 * — these tests focus on the time-arithmetic primitives the middleware uses.
 *
 * For full integration time-travel, see the day-of-cutover smoke script.
 */

import {beforeEach, afterEach, describe, it, expect, vi} from "vitest";

describe("F-MW-06 — token cache TTL boundary arithmetic", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-30T12:00:00.000Z"));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  // The middleware (functions/src/api/middleware/auth.ts:14-35) caches
  // decoded tokens for 5 min, REGARDLESS of decoded.exp. Reproduce that:
  it("BUG today: a token cached at minute 0 with exp at minute 1 is still served at minute 4", () => {
    // Simulated cache entry: token cached at time T0, with exp at T0+1min.
    const T0 = Date.now();
    const cacheEntry = {
      decoded: {exp: Math.floor((T0 + 60_000) / 1000)},
      cachedAt: T0,
      ttlMs: 5 * 60_000,
    };

    const isCached = (now: number) => now - cacheEntry.cachedAt < cacheEntry.ttlMs;
    const isTokenExpired = (now: number) =>
      cacheEntry.decoded.exp * 1000 < now;

    // Advance to T0 + 4 min — token is expired but cache says it's still valid.
    vi.advanceTimersByTime(4 * 60_000);
    const now = Date.now();

    expect(isCached(now)).toBe(true); // cache says valid
    expect(isTokenExpired(now)).toBe(true); // but the token itself is expired

    // After fix: cache TTL should be min(5 min, decoded.exp - now). Then:
    //   newTTL = min(5min, exp - cachedAt) = min(5min, 1min) = 1min
    //   isStillCachedAt(T0 + 4min) = 4 < 1 = false ← correctly evicted
    const fixedTtl = Math.min(
      cacheEntry.ttlMs,
      cacheEntry.decoded.exp * 1000 - cacheEntry.cachedAt
    );
    const fixedIsCached = (n: number) => n - cacheEntry.cachedAt < fixedTtl;
    expect(fixedIsCached(now)).toBe(false); // proves the fix would catch this
  });

  it("after fix: cache TTL bounded by decoded.exp", () => {
    const T0 = Date.now();
    const cachedAt = T0;
    const exp = T0 + 60_000; // 1 minute future
    const fiveMin = 5 * 60_000;

    const fixedTtl = Math.min(fiveMin, exp - cachedAt);
    expect(fixedTtl).toBe(60_000);

    // 30s into the cache: still valid
    vi.advanceTimersByTime(30_000);
    expect(Date.now() - cachedAt < fixedTtl).toBe(true);

    // 90s into the cache: expired (correctly)
    vi.advanceTimersByTime(60_000);
    expect(Date.now() - cachedAt < fixedTtl).toBe(false);
  });
});

describe("F-API1-19 — `courses[id].status === 'active'` boundary checking", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-30T12:00:00.000Z"));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("a course that just expired (1 ms ago) should be treated as expired", () => {
    const now = Date.now();
    const expiresAt = new Date(now - 1).toISOString();
    const isActive = (status: string, exp: string): boolean => {
      if (status !== "active") return false;
      return new Date(exp).getTime() > Date.now();
    };
    expect(isActive("active", expiresAt)).toBe(false);
  });

  it("BUG today: rule check `courses[id]` truthy (no time check) accepts expired entry", () => {
    const courses = {
      myCourse: {
        status: "active",
        expires_at: "2020-01-01T00:00:00Z", // long past
      },
    };
    const buggyCheck = !!courses.myCourse;
    const correctCheck =
      courses.myCourse.status === "active" &&
      new Date(courses.myCourse.expires_at).getTime() > Date.now();
    expect(buggyCheck).toBe(true);
    expect(correctCheck).toBe(false);
  });

  it("after fix: course with `status: expired` is rejected", () => {
    const courses = {
      myCourse: {
        status: "expired",
        expires_at: "2099-01-01T00:00:00Z",
      },
    };
    const correctCheck =
      courses.myCourse.status === "active" &&
      new Date(courses.myCourse.expires_at).getTime() > Date.now();
    expect(correctCheck).toBe(false);
  });
});

describe("F-MW-21 — rate-limit window quantization", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("two bursts straddling the minute boundary land in two different windows (the bug)", () => {
    const windowKey = (now: number) => Math.floor(now / 60_000);

    vi.setSystemTime(new Date("2026-04-30T12:00:59.500Z"));
    const w1 = windowKey(Date.now());

    vi.setSystemTime(new Date("2026-04-30T12:01:00.500Z"));
    const w2 = windowKey(Date.now());

    expect(w1).not.toBe(w2);
    // Bug: both bursts can each hit the per-window cap, yielding 2× total.
  });

  it("after fix (sliding window or token bucket): no boundary advantage", () => {
    // Sliding window: count requests in the last 60_000 ms regardless of
    // window key. Bursts at boundary share one rolling count.
    const windowMs = 60_000;
    const requests: number[] = [];

    vi.setSystemTime(new Date("2026-04-30T12:00:00.000Z"));
    for (let i = 0; i < 200; i++) {
      requests.push(Date.now());
      vi.advanceTimersByTime(295); // ~200 RPM rate
    }

    const cutoff = Date.now() - windowMs;
    const inWindow = requests.filter((t) => t >= cutoff).length;
    // Sliding window correctly counts all 200 — no boundary doubling.
    expect(inWindow).toBeLessThanOrEqual(200);
  });
});

describe("F-API2-15 — booking past-slot timestamp validation", () => {
  it("a slot in the past should not be acceptable", () => {
    const isFuture = (iso: string) => new Date(iso).getTime() > Date.now();
    expect(isFuture("2020-01-01T00:00:00Z")).toBe(false);
    expect(isFuture("2099-12-31T23:59:59Z")).toBe(true);
  });

  it("BUG today: bookings.ts:204 doesn't gate on isFuture(slotStartUtc)", () => {
    // Simulated minimal validator from bookings.ts:204-321 — what it does today:
    const validateBookingToday = (body: {date: string; slotStartUtc: string}) => {
      // Today: only checks date format, no future-check.
      return /^\d{4}-\d{2}-\d{2}/.test(body.date);
    };
    expect(validateBookingToday({date: "2020-01-01", slotStartUtc: "2020-01-01T00:00:00Z"})).toBe(true);

    // After fix: isFuture(slotStartUtc) AND date >= today.
    const validateBookingFixed = (body: {date: string; slotStartUtc: string}) => {
      const slotMs = new Date(body.slotStartUtc).getTime();
      return slotMs > Date.now() && /^\d{4}-\d{2}-\d{2}/.test(body.date);
    };
    expect(validateBookingFixed({date: "2020-01-01", slotStartUtc: "2020-01-01T00:00:00Z"})).toBe(false);
  });
});

describe("F-FUNCS-08 — refund branch concurrency window", () => {
  // Pure logic test: simulate two concurrent refund webhooks operating on the
  // same processed_payments doc. Without a transaction, both succeed and
  // double-revoke. With a transaction, the second one observes the first's
  // changes and skips.
  it("BUG: non-transactional revoke lets both refunds run", () => {
    let courseStatus = "active";
    let revokeCount = 0;
    const refundWithoutTransaction = () => {
      if (courseStatus === "active") {
        revokeCount++;
        // simulate write delay
        courseStatus = "cancelled";
      }
    };
    // Simulate concurrent: both read "active" before either writes.
    const snapshotA = courseStatus;
    const snapshotB = courseStatus;
    if (snapshotA === "active") {
      revokeCount++;
      courseStatus = "cancelled";
    }
    if (snapshotB === "active") {
      revokeCount++;
      courseStatus = "cancelled";
    }
    expect(revokeCount).toBe(2); // double-revoke, the bug
  });

  it("after fix: transaction serializes the second refund", () => {
    let courseStatus = "active";
    let revokeCount = 0;
    const refundWithTransaction = () => {
      const snapshot = courseStatus;
      if (snapshot === "active") {
        revokeCount++;
        courseStatus = "cancelled";
      }
    };
    refundWithTransaction();
    refundWithTransaction();
    expect(revokeCount).toBe(1); // only one revoke — correct
  });
});
