import {MercadoPagoConfig} from "mercadopago";

// ─── Types ───────────────────────────────────────────────────────────────────

export type PaymentKind = "otp" | "sub" | "bundle-otp" | "bundle-sub";

export interface ParsedReference {
  userId: string;
  courseId?: string;
  bundleId?: string;
  paymentType: PaymentKind;
}

export function isBundleReference(ref: ParsedReference): boolean {
  return ref.paymentType === "bundle-otp" || ref.paymentType === "bundle-sub";
}

export interface MercadoPagoPreapproval {
  external_reference?: string | null;
  next_payment_date?: string | null;
  auto_recurring?: {
    next_payment_date?: string | null;
    start_date?: string | null;
    transaction_amount?: number | null;
    currency_id?: string | null;
  };
  reason?: string | null;
  status?: string | null;
  payer_email?: string | null;
  payer?: {
    email?: string | null;
  };
}

// ─── Constants ───────────────────────────────────────────────────────────────

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const COURSE_ID_RE = /^[a-zA-Z0-9_-]{1,128}$/;

const REFERENCE_VERSION = "v1";
const REFERENCE_DELIMITER = "|";
const REFERENCE_MAX_LENGTH = 256;

const DURATION_DAYS: Record<string, number> = {
  "monthly": 30,
  "3-month": 90,
  "6-month": 180,
  "yearly": 365,
};

// ─── External reference ──────────────────────────────────────────────────────

export function buildExternalReference(
  userId: string,
  resourceId: string,
  paymentType: PaymentKind
): string {
  if (!userId || !resourceId) {
    throw new Error("Missing userId or resourceId for external reference");
  }
  if (userId.includes(REFERENCE_DELIMITER) || resourceId.includes(REFERENCE_DELIMITER)) {
    throw new Error("Identifiers cannot contain the reference delimiter '|'");
  }
  const reference = [REFERENCE_VERSION, userId, resourceId, paymentType].join(REFERENCE_DELIMITER);
  if (reference.length > REFERENCE_MAX_LENGTH) {
    throw new Error("external_reference exceeds Mercado Pago length limit");
  }
  return reference;
}

export function parseExternalReference(reference: string): ParsedReference {
  if (!reference) {
    throw new Error("external_reference is empty");
  }
  const parts = reference.split(REFERENCE_DELIMITER);
  if (parts.length !== 4) {
    throw new Error(`Unexpected external_reference format: ${reference}`);
  }
  const [version, userId, resourceId, paymentTypeRaw] = parts;
  if (version !== REFERENCE_VERSION) {
    throw new Error(`Unsupported external_reference version: ${version}`);
  }
  if (!userId || !resourceId) {
    throw new Error("external_reference missing userId or resourceId");
  }
  if (
    paymentTypeRaw !== "otp" &&
    paymentTypeRaw !== "sub" &&
    paymentTypeRaw !== "bundle-otp" &&
    paymentTypeRaw !== "bundle-sub"
  ) {
    throw new Error(`Unsupported payment type: ${paymentTypeRaw}`);
  }
  const paymentType = paymentTypeRaw as PaymentKind;
  const isBundle = paymentType === "bundle-otp" || paymentType === "bundle-sub";
  return isBundle ?
    {userId, bundleId: resourceId, paymentType} :
    {userId, courseId: resourceId, paymentType};
}

// ─── Expiration ──────────────────────────────────────────────────────────────

export function calculateExpirationDate(accessDuration: string, fromDate?: string): string {
  const days = DURATION_DAYS[accessDuration] || 30;
  const now = new Date();
  let base = now;
  if (fromDate) {
    const parsed = new Date(fromDate);
    if (isNaN(parsed.getTime())) {
      throw new Error(`Invalid date: ${fromDate}`);
    }
    if (parsed > now) base = parsed;
  }
  return new Date(base.getTime() + days * 86400000).toISOString();
}

// ─── Error classification ────────────────────────────────────────────────────

// Default to RETRYABLE so a user who paid never silently loses access on a
// transient error. Only mark NON_RETRYABLE when the error is structurally
// known to be non-transient — never on substring heuristics over the message,
// because Firestore transient errors ("Cannot read properties...", "5 NOT_FOUND
// for deadline") would be misclassified and the webhook would 200 + mark the
// payment errored, with no retry.
export function classifyError(error: unknown): "RETRYABLE" | "NON_RETRYABLE" {
  if (!error || typeof error !== "object") return "RETRYABLE";
  const err = error as { code?: string | number; status?: number; httpStatusCode?: number };

  // Network-class errors: definitely retry
  if (
    err.code === "ECONNRESET" ||
    err.code === "ETIMEDOUT" ||
    err.code === "ENOTFOUND" ||
    err.code === "ECONNREFUSED" ||
    err.code === "EAI_AGAIN"
  ) return "RETRYABLE";

  // Firebase / gRPC permission codes — these will not change on retry
  if (err.code === "permission-denied") return "NON_RETRYABLE";

  // 4xx from MP (other than 429) — bad request data, retry won't help
  const httpStatus = err.status ?? err.httpStatusCode;
  if (typeof httpStatus === "number" && httpStatus >= 400 && httpStatus < 500 && httpStatus !== 429) {
    return "NON_RETRYABLE";
  }

  return "RETRYABLE";
}

// ─── MercadoPago client ──────────────────────────────────────────────────────

export function getClient(accessToken: string): MercadoPagoConfig {
  if (!accessToken) {
    throw new Error("Mercado Pago access token missing");
  }
  return new MercadoPagoConfig({accessToken});
}

// ─── Misc ────────────────────────────────────────────────────────────────────

export function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string") return error;
  try {
    return JSON.stringify(error);
  } catch {
    return "Unknown error";
  }
}
