import * as crypto from "node:crypto";

const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
const TIMESTAMP_RE =
  /\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?/g;
const EMAIL_RE = /[\w.+-]+@[\w-]+\.[\w.-]+/g;
const LONG_NUMBER_RE = /\b\d{6,}\b/g;
const HEX_HASH_RE = /\b[0-9a-f]{20,}\b/gi;
const USER_TAG_RE = /\(user=[^)]+\)/g;

// Normalize for fingerprinting: strip high-entropy tokens that would
// otherwise cause the same underlying bug to fingerprint as many.
export function normalizeForFingerprint(message: string): string {
  return message
    .replace(USER_TAG_RE, "(user=*)")
    .replace(UUID_RE, "{uuid}")
    .replace(TIMESTAMP_RE, "{ts}")
    .replace(EMAIL_RE, "{email}")
    .replace(HEX_HASH_RE, "{hash}")
    .replace(LONG_NUMBER_RE, "{n}")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 500);
}

// Normalize for display: keep more context (UUIDs/hashes kept since the
// human reader often wants them to identify the specific request).
export function normalizeForDisplay(message: string): string {
  return message
    .replace(TIMESTAMP_RE, "{ts}")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 300);
}

export function fingerprintError(
  functionName: string,
  errorType: string,
  message: string
): string {
  const normalized = normalizeForFingerprint(message);
  const key = `${functionName}|${errorType}|${normalized}`;
  return crypto.createHash("sha1").update(key).digest("hex").slice(0, 12);
}
