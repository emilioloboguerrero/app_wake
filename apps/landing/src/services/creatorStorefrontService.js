// Creator storefront service — public, unauthenticated reads.
// CDN-cached on the function side, so retries are cheap.
//
// Local in-memory cache + in-flight dedupe trims redundant network when the
// user navigates storefront → detail → back. Cache TTL aligns with the
// backend's max-age=60 so a stale price never lingers longer than the CDN
// already allows.

import apiClient from '../utils/apiClient';

const CACHE_TTL_MS = 60_000;
const cache = new Map();
const inflight = new Map();

function read(key) {
  const entry = cache.get(key);
  if (!entry) return undefined;
  if (Date.now() - entry.t > CACHE_TTL_MS) {
    cache.delete(key);
    return undefined;
  }
  return entry.v;
}

function write(key, value) {
  cache.set(key, { v: value, t: Date.now() });
}

async function fetchOnce(key, fn) {
  const cached = read(key);
  if (cached !== undefined) return cached;
  if (inflight.has(key)) return inflight.get(key);
  const p = fn()
    .then((v) => {
      write(key, v ?? null);
      inflight.delete(key);
      return v;
    })
    .catch((err) => {
      inflight.delete(key);
      throw err;
    });
  inflight.set(key, p);
  return p;
}

export async function getCreatorStorefront(username) {
  const u = (username || '').toLowerCase().trim();
  return fetchOnce(`creator:${u}`, async () => {
    const res = await apiClient.get(`/public/creators/${encodeURIComponent(u)}`);
    return res?.data ?? null;
  });
}

export async function getStorefrontCreators() {
  return fetchOnce('storefront:creators', async () => {
    const res = await apiClient.get('/public/storefront/creators');
    return res?.data?.creators ?? [];
  });
}

export async function getCreatorProgram(username, programId) {
  const u = (username || '').toLowerCase().trim();
  return fetchOnce(`program:${u}:${programId}`, async () => {
    const res = await apiClient.get(
      `/public/creators/${encodeURIComponent(u)}/programs/${encodeURIComponent(programId)}`
    );
    return res?.data ?? null;
  });
}

// Useful for the post-payment / cancel flow where we want fresh data.
export function invalidateStorefrontCache(username) {
  if (!username) {
    cache.clear();
    return;
  }
  const u = username.toLowerCase().trim();
  for (const key of cache.keys()) {
    if (key === `creator:${u}` || key.startsWith(`program:${u}:`)) {
      cache.delete(key);
    }
  }
}
