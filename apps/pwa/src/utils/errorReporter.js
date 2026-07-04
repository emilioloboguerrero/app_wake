// Frontend error reporter — batches + dedupes client-side errors and posts
// them to the wakeClientErrorsIngest Cloud Function. Intentionally tiny and
// dependency-free so it cannot itself become a source of errors.

const INGEST_URL_PROD =
  'https://us-central1-wolf-20b8b.cloudfunctions.net/wakeClientErrorsIngest';
const INGEST_URL_STAGING =
  'https://us-central1-wake-staging.cloudfunctions.net/wakeClientErrorsIngest';

const FLUSH_INTERVAL_MS = 5000;
const MAX_DISTINCT = 10;
const MAX_PER_FINGERPRINT = 50;

function resolveIngestUrl() {
  if (typeof window === 'undefined') return null;
  const host = window.location?.hostname || '';
  if (host.includes('wake-staging')) return INGEST_URL_STAGING;
  if (
    host === 'wolf-20b8b.web.app' ||
    host === 'wolf-20b8b.firebaseapp.com' ||
    host === 'wakelab.co' ||
    host === 'www.wakelab.co'
  ) {
    return INGEST_URL_PROD;
  }
  return null; // dev / localhost / preview — don't send
}

function simpleHash(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) - h + str.charCodeAt(i)) | 0;
  }
  return (h >>> 0).toString(16);
}

function inferErrorType(message) {
  const m = /\b([A-Z][a-zA-Z]*(?:Error|Exception))\b/.exec(message || '');
  return m ? m[1] : 'Error';
}

function fingerprint(message, stack) {
  const topFrame = (stack || '').split('\n').slice(0, 3).join('|');
  return simpleHash(`${inferErrorType(message)}|${message}|${topFrame}`);
}

function isOurs(stack) {
  if (!stack) return true; // no stack → don't filter out
  // Drop extension / blob errors so we don't pay to ingest noise.
  if (stack.includes('chrome-extension://')) return false;
  if (stack.includes('moz-extension://')) return false;
  return true;
}

const source = 'pwa';
const queue = new Map(); // fingerprint → { message, stack, url, count, errorType }
let flushTimer = null;
let installed = false;
let userIdProvider = () => null;

function setUserIdProvider(fn) {
  if (typeof fn === 'function') userIdProvider = fn;
}

function scheduleFlush() {
  if (flushTimer) return;
  flushTimer = setTimeout(flush, FLUSH_INTERVAL_MS);
}

async function flush() {
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  if (queue.size === 0) return;
  const url = resolveIngestUrl();
  if (!url) {
    queue.clear();
    return;
  }

  const errors = [];
  for (const [, v] of queue) errors.push(v);
  queue.clear();

  const payload = {
    source,
    userId: (() => {
      try {
        return userIdProvider();
      } catch {
        return null;
      }
    })(),
    userAgent:
      typeof navigator !== 'undefined' && navigator.userAgent ?
        navigator.userAgent.slice(0, 400) :
        '',
    errors,
  };

  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      keepalive: true,
    });
  } catch {
    // Intentionally swallow. Never throw from the reporter.
  }
}

function reportError({ message, stack, url }) {
  if (typeof window === 'undefined') return;
  const msg = String(message || '').slice(0, 500);
  if (!msg) return;
  const stk = typeof stack === 'string' ? stack.slice(0, 8000) : null;
  if (stk && !isOurs(stk)) return;
  const pageUrl =
    url || (typeof location !== 'undefined' ? location.pathname : '');
  const errorType = inferErrorType(msg);
  const fp = fingerprint(msg, stk);

  const existing = queue.get(fp);
  if (existing) {
    if (existing.count < MAX_PER_FINGERPRINT) existing.count += 1;
  } else {
    if (queue.size >= MAX_DISTINCT) {
      // Force a flush, then enqueue into the now-empty queue.
      flush();
    }
    queue.set(fp, {
      message: msg,
      stack: stk,
      url: pageUrl.slice(0, 500),
      errorType,
      count: 1,
    });
  }

  if (queue.size >= MAX_DISTINCT) {
    flush();
  } else {
    scheduleFlush();
  }
}

// App.web.js owns the window error/unhandledrejection listeners (it filters
// extension noise, benign AbortErrors, and resource-load errors before
// calling reportError). This hook only guarantees the queue flushes when the
// tab is backgrounded/closed before the 5s timer fires.
function installFlushOnHide() {
  if (installed || typeof window === 'undefined') return;
  installed = true;

  window.addEventListener(
    'visibilitychange',
    () => {
      if (document.visibilityState === 'hidden') flush();
    },
    false
  );
}

export { reportError, installFlushOnHide, setUserIdProvider };
