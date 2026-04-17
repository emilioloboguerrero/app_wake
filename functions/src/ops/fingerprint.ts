import * as crypto from "node:crypto";

const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
const TIMESTAMP_RE =
  /\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?/g;
const EMAIL_RE = /[\w.+-]+@[\w-]+\.[\w.-]+/g;
const LONG_NUMBER_RE = /\b\d{5,}\b/g;
const HEX_HASH_RE = /\b[0-9a-f]{16,}\b/gi;

export function normalizeMessage(message: string): string {
  return message
    .replace(UUID_RE, "{uuid}")
    .replace(TIMESTAMP_RE, "{ts}")
    .replace(EMAIL_RE, "{email}")
    .replace(HEX_HASH_RE, "{hash}")
    .replace(LONG_NUMBER_RE, "{n}")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 500);
}

export function fingerprintError(
  functionName: string,
  errorType: string,
  message: string
): string {
  const normalized = normalizeMessage(message);
  const key = `${functionName}|${errorType}|${normalized}`;
  return crypto.createHash("sha1").update(key).digest("hex").slice(0, 12);
}
