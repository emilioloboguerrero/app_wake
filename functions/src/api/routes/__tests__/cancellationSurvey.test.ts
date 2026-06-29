import {describe, it, expect, vi, beforeAll} from "vitest";

// Mock firebase-admin so FieldValue.serverTimestamp() is available without emulator
vi.mock("firebase-admin/firestore", () => ({
  FieldValue: {serverTimestamp: () => ({_methodName: "serverTimestamp"})},
}));

// Mock the firestore module used by payments.ts
vi.mock("../../firestore.js", () => ({
  db: {},
  FieldValue: {serverTimestamp: () => ({_methodName: "serverTimestamp"})},
}));

// All other heavy deps payments.ts imports — mock so the module loads without creds
vi.mock("mercadopago", () => ({Preference: vi.fn(), Payment: vi.fn(), PreApproval: vi.fn()}));
vi.mock("../../../lib/analytics.js", () => ({capture: vi.fn()}));
vi.mock("../middleware/auth.js", () => ({validateAuth: vi.fn()}));
vi.mock("../middleware/validate.js", () => ({validateBody: vi.fn()}));
vi.mock("../middleware/rateLimit.js", () => ({checkRateLimit: vi.fn()}));
vi.mock("../errors.js", () => ({WakeApiServerError: class extends Error {}}));
vi.mock("../services/paymentHelpers.js", () => ({
  EMAIL_RE: /.+/,
  COURSE_ID_RE: /.+/,
  buildExternalReference: vi.fn(),
  parseExternalReference: vi.fn(),
  calculateExpirationDate: vi.fn(),
  classifyError: vi.fn(),
  getClient: vi.fn(),
}));
vi.mock("../services/courseAssignment.js", () => ({assignCourseToUser: vi.fn()}));
vi.mock("../services/capacity.js", () => ({assertCourseHasSeat: vi.fn()}));
vi.mock("../services/bundleAssignment.js", () => ({
  assignBundleToUser: vi.fn(),
  revokeBundleAccess: vi.fn(),
}));
vi.mock("../services/enrollmentLeave.js", () => ({
  cancelMpSubscription: vi.fn(),
  getActiveOneOnOneLock: vi.fn(),
}));
vi.mock("../middleware/securityHelpers.js", () => ({clampTrialDurationDays: vi.fn()}));
vi.mock("../services/purchaseEmails.js", () => ({
  sendOneTimePurchaseEmail: vi.fn(),
  sendSubscriptionStartedEmail: vi.fn(),
  sendChargeReceiptEmail: vi.fn(),
  sendTrialActivatedEmail: vi.fn(),
  sendCancellationEmail: vi.fn(),
}));

let buildCancellationSurveyRecord: typeof import("../payments.js").buildCancellationSurveyRecord;

beforeAll(async () => {
  const mod = await import("../payments.js");
  buildCancellationSurveyRecord = mod.buildCancellationSurveyRecord;
});

describe("buildCancellationSurveyRecord", () => {
  const base = {
    userId: "u1",
    subscriptionId: "s1",
    subscriptionData: {
      course_id: "c1",
      course_title: "Método Bejarano",
      status: "authorized",
      payer_email: "a@b.com",
    },
  };

  it("builds a record with source, status and reconciled fields", () => {
    const rec = buildCancellationSurveyRecord({
      ...base,
      survey: {answers: ["cost", "satisfied"], source: "pre_portal_survey_v1"},
      statusAfter: "intent",
      proceededToPortal: true,
    });
    expect(rec.userId).toBe("u1");
    expect(rec.subscriptionId).toBe("s1");
    expect(rec.answers).toEqual(["cost", "satisfied"]);
    expect(rec.source).toBe("pre_portal_survey_v1");
    expect(rec.statusAfter).toBe("intent");
    expect(rec.proceeded_to_portal).toBe(true);
    expect(rec.courseId).toBe("c1");
    expect(rec.courseTitle).toBe("Método Bejarano");
    expect(rec.statusBefore).toBe("authorized");
    expect(rec.payerEmail).toBe("a@b.com");
  });

  it("defaults source to in_app_cancel_flow_v1 and omits proceeded_to_portal when undefined", () => {
    const rec = buildCancellationSurveyRecord({
      ...base,
      survey: {answers: ["other"]},
      statusAfter: "cancelled",
    });
    expect(rec.source).toBe("in_app_cancel_flow_v1");
    expect("proceeded_to_portal" in rec).toBe(false);
  });

  it("throws on non-array answers", () => {
    expect(() =>
      buildCancellationSurveyRecord({
        ...base,
        survey: {answers: "nope"},
        statusAfter: "cancelled",
      })
    ).toThrow();
  });

  it("throws on an over-long answer", () => {
    expect(() =>
      buildCancellationSurveyRecord({
        ...base,
        survey: {answers: ["x".repeat(501)]},
        statusAfter: "cancelled",
      })
    ).toThrow();
  });
});
