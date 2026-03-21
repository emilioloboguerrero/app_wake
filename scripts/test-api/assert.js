'use strict';

/**
 * Lightweight assertion helpers for API response validation.
 * Each function throws on failure with a descriptive message.
 */

function assertStatus(res, expected, label) {
  if (res.status !== expected) {
    throw new Error(
      `Expected status ${expected}, got ${res.status}\n` +
      `  ${res.method} ${res.path}\n` +
      `  Body: ${JSON.stringify(res.data, null, 2)?.slice(0, 500)}`
    );
  }
}

function assertOk(res, label) {
  assertStatus(res, res.status >= 200 && res.status < 300 ? res.status : 200, label);
  if (res.status !== 204 && (!res.data || !('data' in res.data))) {
    throw new Error(
      `Response missing "data" field\n` +
      `  ${res.method} ${res.path}\n` +
      `  Body: ${JSON.stringify(res.data, null, 2)?.slice(0, 500)}`
    );
  }
}

function assertErrorCode(res, expectedCode, label) {
  const actualCode = res.data?.error?.code;
  if (actualCode !== expectedCode) {
    throw new Error(
      `Expected error code "${expectedCode}", got "${actualCode}"\n` +
      `  ${res.method} ${res.path} → ${res.status}\n` +
      `  Body: ${JSON.stringify(res.data, null, 2)?.slice(0, 500)}`
    );
  }
}

function assert204(res, label) {
  assertStatus(res, 204, label);
}

function assertHasFields(obj, fields, context) {
  for (const field of fields) {
    if (!(field in obj)) {
      throw new Error(`Missing field "${field}" in ${context}\n  Got: ${JSON.stringify(obj, null, 2)?.slice(0, 500)}`);
    }
  }
}

function assertArrayOf(res, minLength = 0) {
  assertOk(res);
  if (!Array.isArray(res.data.data)) {
    throw new Error(`Expected data to be an array\n  Got: ${typeof res.data.data}`);
  }
  if (res.data.data.length < minLength) {
    throw new Error(`Expected at least ${minLength} items, got ${res.data.data.length}`);
  }
}

module.exports = { assertStatus, assertOk, assertErrorCode, assert204, assertHasFields, assertArrayOf };
