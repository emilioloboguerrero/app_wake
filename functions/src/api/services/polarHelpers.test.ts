import {describe, it, expect} from "vitest";
import {
  resolvePolarProductId,
  isPolarPaymentType,
  parsePolarMetadata,
  polarCentsToMajor,
  toIsoDate,
  isRenewalBillingReason,
  isTrialingSubscription,
} from "./polarHelpers";

// ---------------------------------------------------------------------------
// resolvePolarProductId
// ---------------------------------------------------------------------------
describe("resolvePolarProductId", () => {
  const course = {
    polar: {
      subscription_product_id: "prod_sub_123",
      onetime_product_id: "prod_otp_456",
    },
  };

  it("returns the subscription product for paymentType=subscription", () => {
    expect(resolvePolarProductId(course, "subscription")).toBe("prod_sub_123");
  });

  it("returns the one-time product for paymentType=one_time", () => {
    expect(resolvePolarProductId(course, "one_time")).toBe("prod_otp_456");
  });

  it("returns null when the course has no polar map", () => {
    expect(resolvePolarProductId({}, "subscription")).toBeNull();
    expect(resolvePolarProductId(null, "subscription")).toBeNull();
    expect(resolvePolarProductId(undefined, "one_time")).toBeNull();
  });

  it("returns null when the requested type's product id is absent/blank", () => {
    expect(resolvePolarProductId({polar: {onetime_product_id: "x"}}, "subscription")).toBeNull();
    expect(resolvePolarProductId({polar: {subscription_product_id: "  "}}, "subscription")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// isPolarPaymentType
// ---------------------------------------------------------------------------
describe("isPolarPaymentType", () => {
  it("accepts the two valid literals", () => {
    expect(isPolarPaymentType("subscription")).toBe(true);
    expect(isPolarPaymentType("one_time")).toBe(true);
  });
  it("rejects everything else", () => {
    expect(isPolarPaymentType("otp")).toBe(false);
    expect(isPolarPaymentType("sub")).toBe(false);
    expect(isPolarPaymentType("")).toBe(false);
    expect(isPolarPaymentType(null)).toBe(false);
    expect(isPolarPaymentType(1)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// parsePolarMetadata
// ---------------------------------------------------------------------------
describe("parsePolarMetadata", () => {
  it("parses a valid metadata object", () => {
    expect(
      parsePolarMetadata({userId: "u1", courseId: "course_abc", paymentType: "subscription"})
    ).toEqual({userId: "u1", courseId: "course_abc", paymentType: "subscription"});
  });

  it("coerces non-string scalar values", () => {
    expect(
      parsePolarMetadata({userId: 123, courseId: "c1", paymentType: "one_time"})
    ).toEqual({userId: "123", courseId: "c1", paymentType: "one_time"});
  });

  it("trims whitespace", () => {
    expect(
      parsePolarMetadata({userId: " u1 ", courseId: " c1 ", paymentType: "subscription"})
    ).toEqual({userId: "u1", courseId: "c1", paymentType: "subscription"});
  });

  it("throws when metadata is missing or not an object", () => {
    expect(() => parsePolarMetadata(null)).toThrow();
    expect(() => parsePolarMetadata("nope")).toThrow();
  });

  it("throws when userId is missing", () => {
    expect(() => parsePolarMetadata({courseId: "c1", paymentType: "subscription"})).toThrow(/userId/);
  });

  it("throws when courseId is missing or malformed", () => {
    expect(() => parsePolarMetadata({userId: "u1", paymentType: "subscription"})).toThrow(/courseId/);
    expect(() =>
      parsePolarMetadata({userId: "u1", courseId: "bad id!", paymentType: "subscription"})
    ).toThrow(/courseId/);
  });

  it("throws when paymentType is invalid", () => {
    expect(() =>
      parsePolarMetadata({userId: "u1", courseId: "c1", paymentType: "sub"})
    ).toThrow(/paymentType/);
  });
});

// ---------------------------------------------------------------------------
// polarCentsToMajor
// ---------------------------------------------------------------------------
describe("polarCentsToMajor", () => {
  it("converts cents to major units", () => {
    expect(polarCentsToMajor(2000)).toBe(20);
    expect(polarCentsToMajor(1999)).toBe(19.99);
    expect(polarCentsToMajor(0)).toBe(0);
  });
  it("returns null for non-finite input", () => {
    expect(polarCentsToMajor(NaN)).toBeNull();
    expect(polarCentsToMajor("2000")).toBeNull();
    expect(polarCentsToMajor(undefined)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// toIsoDate
// ---------------------------------------------------------------------------
describe("toIsoDate", () => {
  it("normalizes a Date", () => {
    const d = new Date("2026-07-01T00:00:00.000Z");
    expect(toIsoDate(d)).toBe("2026-07-01T00:00:00.000Z");
  });
  it("normalizes an ISO string", () => {
    expect(toIsoDate("2026-07-01T00:00:00.000Z")).toBe("2026-07-01T00:00:00.000Z");
  });
  it("returns null for invalid/absent input", () => {
    expect(toIsoDate("not a date")).toBeNull();
    expect(toIsoDate(null)).toBeNull();
    expect(toIsoDate({})).toBeNull();
    expect(toIsoDate(new Date("invalid"))).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// isRenewalBillingReason / isTrialingSubscription
// ---------------------------------------------------------------------------
describe("isRenewalBillingReason", () => {
  it("treats subscription_cycle as a renewal", () => {
    expect(isRenewalBillingReason("subscription_cycle")).toBe(true);
  });
  it("treats first-charge / one-time reasons as non-renewal", () => {
    expect(isRenewalBillingReason("subscription_create")).toBe(false);
    expect(isRenewalBillingReason("purchase")).toBe(false);
    expect(isRenewalBillingReason(undefined)).toBe(false);
  });
});

describe("isTrialingSubscription", () => {
  it("detects trialing status", () => {
    expect(isTrialingSubscription({status: "trialing"})).toBe(true);
  });
  it("returns false for active/other/absent", () => {
    expect(isTrialingSubscription({status: "active"})).toBe(false);
    expect(isTrialingSubscription({})).toBe(false);
    expect(isTrialingSubscription(null)).toBe(false);
  });
});
