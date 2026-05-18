// Wraps React.lazy so a "Failed to fetch dynamically imported module" error
// from a stale index.html (referencing chunk hashes that no longer exist on
// hosting after a deploy) triggers a single page reload to pick up the new
// hashes. sessionStorage guards against infinite reload loops if the new
// deploy is also broken; the guard clears as soon as any lazy import resolves.

import { lazy } from 'react';

const GUARD_KEY = 'wake_chunk_reload';

function isChunkLoadError(err) {
  const msg = String(err?.message || err || '');
  return (
    /Failed to fetch dynamically imported module/i.test(msg) ||
    /Importing a module script failed/i.test(msg) ||
    /error loading dynamically imported module/i.test(msg) ||
    /Loading chunk [\w-]+ failed/i.test(msg)
  );
}

function readGuard() {
  try { return window.sessionStorage.getItem(GUARD_KEY) === '1'; } catch { return false; }
}
function setGuard() {
  try { window.sessionStorage.setItem(GUARD_KEY, '1'); } catch {}
}
function clearGuard() {
  try { window.sessionStorage.removeItem(GUARD_KEY); } catch {}
}

export function lazyWithRetry(factory) {
  return lazy(async () => {
    try {
      const mod = await factory();
      clearGuard();
      return mod;
    } catch (err) {
      if (isChunkLoadError(err) && !readGuard()) {
        setGuard();
        window.location.reload();
        return new Promise(() => {});
      }
      throw err;
    }
  });
}
