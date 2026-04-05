import { MercadoPagoConfig } from "mercadopago";

// ─── Types ───────────────────────────────────────────────────────────────────

export type PaymentKind = "otp" | "sub";

export interface ParsedReference {
  userId: string;
  courseId: string;
  paymentType: PaymentKind;
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
  monthly: 30,
  "3-month": 90,
  "6-month": 180,
  yearly: 365,
};

// ─── External reference ──────────────────────────────────────────────────────

export function buildExternalReference(
  userId: string,
  courseId: string,
  paymentType: PaymentKind
): string {
  if (!userId || !courseId) {
    throw new Error("Missing userId or courseId for external reference");
  }
  if (userId.includes(REFERENCE_DELIMITER) || courseId.includes(REFERENCE_DELIMITER)) {
    throw new Error("Identifiers cannot contain the reference delimiter '|'");
  }
  const reference = [REFERENCE_VERSION, userId, courseId, paymentType].join(REFERENCE_DELIMITER);
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
  const [version, userId, courseId, paymentTypeRaw] = parts;
  if (version !== REFERENCE_VERSION) {
    throw new Error(`Unsupported external_reference version: ${version}`);
  }
  if (!userId || !courseId) {
    throw new Error("external_reference missing userId or courseId");
  }
  if (paymentTypeRaw !== "otp" && paymentTypeRaw !== "sub") {
    throw new Error(`Unsupported payment type: ${paymentTypeRaw}`);
  }
  return { userId, courseId, paymentType: paymentTypeRaw };
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

export function classifyError(error: unknown): "RETRYABLE" | "NON_RETRYABLE" {
  if (!error || typeof error !== "object") return "RETRYABLE";
  const err = error as { code?: string; message?: string };
  if (
    err.code === "ECONNRESET" ||
    err.code === "ETIMEDOUT" ||
    err.code === "ENOTFOUND" ||
    err.message?.includes("network") ||
    err.message?.includes("timeout")
  ) return "RETRYABLE";
  if (
    err.message?.includes("not found") ||
    err.message?.includes("missing") ||
    err.message?.includes("invalid") ||
    err.message?.includes("required")
  ) return "NON_RETRYABLE";
  if (err.code === "permission-denied" || err.code === "not-found") return "NON_RETRYABLE";
  return "RETRYABLE";
}

// ─── MercadoPago client ──────────────────────────────────────────────────────

export function getClient(accessToken: string): MercadoPagoConfig {
  if (!accessToken) {
    throw new Error("Mercado Pago access token missing");
  }
  return new MercadoPagoConfig({ accessToken });
}

// ─── Misc ────────────────────────────────────────────────────────────────────

export function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string") return error;
  try { return JSON.stringify(error); } catch { return "Unknown error"; }
}
