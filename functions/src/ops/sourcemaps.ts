// Server-side sourcemap symbolication for PWA stack traces.
//
// Pipeline (foundation in place, opt-in at runtime):
//
//   1. PWA web build emits .js.map files alongside its bundles.
//   2. `scripts/ops/upload-sourcemaps.sh` uploads them to Firebase Storage
//      at `gs://{bucket}/ops/sourcemaps/pwa/{deployId}/{name.js.map}`
//      after each hosting deploy.
//   3. This module fetches + caches sourcemaps per deployId and resolves
//      frames from minified stacks back to readable file:line references.
//
// When no sourcemap is found the resolver quietly returns null — digesters
// fall back to the minified frame. That's the intended behavior until the
// upload script has been run at least once.

import * as admin from "firebase-admin";
import {SourceMapConsumer} from "source-map";

const CACHE_MAX_ENTRIES = 16;
const CACHE_TTL_MS = 30 * 60 * 1000;

interface CacheEntry {
  consumer: SourceMapConsumer;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry>();

function cacheGet(key: string): SourceMapConsumer | null {
  const e = cache.get(key);
  if (!e) return null;
  if (Date.now() > e.expiresAt) {
    try {
      e.consumer.destroy();
    } catch {
      // ignore
    }
    cache.delete(key);
    return null;
  }
  return e.consumer;
}

function cachePut(key: string, consumer: SourceMapConsumer): void {
  while (cache.size >= CACHE_MAX_ENTRIES) {
    const first = cache.keys().next();
    if (first.done) break;
    const old = cache.get(first.value);
    try {
      old?.consumer.destroy();
    } catch {
      // ignore
    }
    cache.delete(first.value);
  }
  cache.set(key, {consumer, expiresAt: Date.now() + CACHE_TTL_MS});
}

// Minified frames look like `    at t.default (app-abc123.js:142:8521)`
// or `at https://.../app-abc123.js:142:8521`. Extract the first frame
// with .js:line:col that points to one of our bundles.
const FRAME_RE = /(?:at\s+)?(?:\S+\s+)?\(?([^\s()]+\.js):(\d+):(\d+)\)?/;

interface ParsedFrame {
  filename: string; // basename of the js file, e.g. "app-abc123.js"
  line: number;
  column: number;
}

function parseTopFrame(stack: string): ParsedFrame | null {
  const lines = stack.split("\n").map((l) => l.trim()).filter(Boolean);
  for (const line of lines) {
    const m = FRAME_RE.exec(line);
    if (!m) continue;
    const url = m[1];
    const ln = parseInt(m[2], 10);
    const col = parseInt(m[3], 10);
    if (!ln || !col) continue;
    // Only resolve bundle-looking filenames; skip node_modules etc.
    const base = url.split("/").pop() || url;
    if (!base.endsWith(".js")) continue;
    return {filename: base, line: ln, column: col};
  }
  return null;
}

// Find the latest deployId by listing folder prefixes in Storage. Cached
// for the lifetime of the function instance; the miss cost is one list call.
let cachedLatestDeploy: {deployId: string | null; at: number} | null = null;
const DEPLOY_CACHE_TTL_MS = 10 * 60 * 1000;

async function resolveLatestDeployId(source: "pwa"): Promise<string | null> {
  if (cachedLatestDeploy && Date.now() - cachedLatestDeploy.at < DEPLOY_CACHE_TTL_MS) {
    return cachedLatestDeploy.deployId;
  }
  try {
    const bucket = admin.storage().bucket();
    const [files] = await bucket.getFiles({
      prefix: `ops/sourcemaps/${source}/`,
      autoPaginate: false,
      maxResults: 500,
    });
    // Extract unique deployIds from paths: ops/sourcemaps/pwa/{id}/...
    const ids = new Set<string>();
    for (const f of files) {
      const parts = f.name.split("/");
      if (parts.length >= 4) ids.add(parts[3]);
    }
    const sorted = [...ids].sort(); // deployIds are timestamped so lexsort works
    const latest = sorted.length > 0 ? sorted[sorted.length - 1] : null;
    cachedLatestDeploy = {deployId: latest, at: Date.now()};
    return latest;
  } catch {
    cachedLatestDeploy = {deployId: null, at: Date.now()};
    return null;
  }
}

async function loadConsumer(
  source: "pwa",
  deployId: string,
  filename: string
): Promise<SourceMapConsumer | null> {
  const cacheKey = `${source}|${deployId}|${filename}`;
  const cached = cacheGet(cacheKey);
  if (cached) return cached;

  try {
    const bucket = admin.storage().bucket();
    const file = bucket.file(
      `ops/sourcemaps/${source}/${deployId}/${filename}.map`
    );
    const [exists] = await file.exists();
    if (!exists) return null;
    const [data] = await file.download();
    const consumer = await new SourceMapConsumer(
      JSON.parse(data.toString("utf-8"))
    );
    cachePut(cacheKey, consumer);
    return consumer;
  } catch {
    return null;
  }
}

// Resolve the top frame of a minified stack to "file:line" (best-effort).
// Returns null if no sourcemap is available or parsing fails.
export async function tryResolveTopFrame(
  stack: string
): Promise<string | null> {
  if (!stack) return null;
  const frame = parseTopFrame(stack);
  if (!frame) return null;

  const deployId = await resolveLatestDeployId("pwa");
  if (!deployId) return null;

  const consumer = await loadConsumer("pwa", deployId, frame.filename);
  if (!consumer) return null;

  const pos = consumer.originalPositionFor({
    line: frame.line,
    column: frame.column,
  });
  if (!pos.source || !pos.line) return null;

  // Trim source path to just the filename — full path leaks build layout.
  const src = pos.source.split("/").slice(-2).join("/");
  return `${src}:${pos.line}${pos.column ? `:${pos.column}` : ""}`;
}
