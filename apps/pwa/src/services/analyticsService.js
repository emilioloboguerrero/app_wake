// Wake analytics service — PWA (web bundle only)
//
// Session-level events only. No per-set, no per-Firestore-call, no autocapture.
// Free tier safe: identified_only profiles, manual page views, sampled replay.
//
// posthog-js touches `document` at module-evaluation time (not just at call
// time), so it cannot be statically imported: on native (no DOM) that crashes
// the JS runtime before any `isWeb()` guard ever runs. init() dynamically
// imports it instead, gated behind isWeb(), so the import never executes off
// web. Calls made before it loads are queued and flushed on ready. Native
// analytics is a later-phase item — every public method below is a safe no-op
// on native for now.
//
// Public API:
//   analyticsService.init()
//   analyticsService.identify(userId, props)
//   analyticsService.track(event, props)
//   analyticsService.reset()
//   analyticsService.optOut() / optIn() / isOptedOut()
//   analyticsService.setSuperProps(props)
//
// Every method is safe to call when PostHog is missing, opted out, or pre-init.

import logger from '../utils/logger';

const APP_NAME = 'pwa';
const STORAGE_OPTOUT_KEY = 'wake_analytics_opt_out';
const REPLAY_SAMPLE = 0.2;
const MAX_PENDING = 100;

let posthog = null;
let ready = false;
let disabled = false;
let initAttempted = false;
const pending = [];

function isWeb() {
  return typeof window !== 'undefined' && typeof document !== 'undefined';
}

function readKey() {
  if (typeof process !== 'undefined' && process.env) {
    return process.env.EXPO_PUBLIC_POSTHOG_KEY || null;
  }
  return null;
}

function readHost() {
  if (typeof process !== 'undefined' && process.env && process.env.EXPO_PUBLIC_POSTHOG_HOST) {
    return process.env.EXPO_PUBLIC_POSTHOG_HOST;
  }
  return 'https://us.i.posthog.com';
}

function readAppVersion() {
  if (typeof process !== 'undefined' && process.env && process.env.EXPO_PUBLIC_APP_VERSION) {
    return process.env.EXPO_PUBLIC_APP_VERSION;
  }
  return 'unknown';
}

function detectEnv() {
  if (!isWeb()) return 'unknown';
  const host = window.location.hostname || '';
  if (host === 'wakelab.co' || host === 'www.wakelab.co' || host.endsWith('.wakelab.co')) return 'production';
  if (host.startsWith('wake-staging')) return 'staging';
  if (host === 'wolf-20b8b.web.app' || host === 'wolf-20b8b.firebaseapp.com') return 'production';
  if (host === 'localhost' || host === '127.0.0.1') return 'development';
  return 'production';
}

function readOptOut() {
  if (!isWeb()) return true;
  try {
    return window.localStorage.getItem(STORAGE_OPTOUT_KEY) === '1';
  } catch {
    return false;
  }
}

function writeOptOut(v) {
  if (!isWeb()) return;
  try {
    if (v) window.localStorage.setItem(STORAGE_OPTOUT_KEY, '1');
    else window.localStorage.removeItem(STORAGE_OPTOUT_KEY);
  } catch {}
}

// Drop benign DOMException AbortErrors from Error Tracking. expo-video's web
// player discards the HTMLVideoElement.play() promise, so an interrupted
// play()/replace()/replay() surfaces on iOS Safari as an unhandled
// "AbortError: The operation was aborted." It's expected (interrupted playback),
// not a real error, and can't be caught at the call site (player.play() returns
// void). Our own fetch aborts are already translated to WakeApiError upstream,
// so a raw AbortError reaching here is always this benign media case.
//
// Browsers report these as `type: "DOMException"` with the AbortError name in
// the value ("AbortError: ..."), not as `type: "AbortError"` — match both.
function isAbortException(e) {
  if (!e) return false;
  if (e.type === 'AbortError') return true;
  return e.type === 'DOMException' && String(e.value || '').startsWith('AbortError');
}

function dropBenignAbortErrors(event) {
  if (event?.event === '$exception') {
    const list = event.properties?.$exception_list;
    if (Array.isArray(list) && list.some(isAbortException)) {
      return null;
    }
  }
  return event;
}

// Redact sensitive query params (Firebase magic-link oobCode, api keys,
// emails) from URL-shaped values before any event leaves the device. The
// magic-link screen also cleans its own URL on mount; this is defense in
// depth for every event that carries a URL prop.
const SENSITIVE_QUERY_PARAMS = /([?&#](?:oobCode|apiKey|email|token|access_token|id_token|continueUrl)=)[^&#\s]*/gi;

function scrubPiiFromProps(props) {
  if (!props) return props;
  for (const key of Object.keys(props)) {
    const value = props[key];
    if (typeof value === 'string' && value.includes('=')) {
      props[key] = value.replace(SENSITIVE_QUERY_PARAMS, '$1REDACTED');
    }
  }
  return props;
}

function flushPending() {
  while (pending.length) {
    const fn = pending.shift();
    try { fn(posthog); } catch (err) { logger.error?.('[analytics] call failed', err); }
  }
}

async function init() {
  if (initAttempted) return;
  initAttempted = true;
  if (!isWeb()) { disabled = true; return; }

  const key = readKey();
  if (!key) { disabled = true; return; } // Silent no-op when key not configured (dev, opt-out, etc.)

  if (readOptOut()) { disabled = true; return; }

  try {
    const mod = await import('posthog-js');
    posthog = mod.default;
    posthog.init(key, {
      api_host: readHost(),
      person_profiles: 'identified_only',
      autocapture: false,
      capture_pageview: 'history_change',
      capture_pageleave: true,
      capture_exceptions: true,
      before_send: dropBenignAbortErrors,
      sanitize_properties: scrubPiiFromProps,
      disable_session_recording: false,
      session_recording: {
        maskAllInputs: true,
        maskTextSelector: '[data-ph-no-capture]',
      },
      session_replay: {
        sampleRate: REPLAY_SAMPLE,
      },
      // Web vitals → fed back as a $web_vitals event, single event per page.
      capture_performance: {
        web_vitals: true,
        network_timing: false,
      },
      loaded: (ph) => {
        try {
          ph.register({
            app: APP_NAME,
            platform: 'web',
            app_version: readAppVersion(),
            env: detectEnv(),
          });
        } catch (err) {
          logger.error?.('[analytics] register failed', err);
        }
        ready = true;
        flushPending();
      },
    });
  } catch (err) {
    logger.error?.('[analytics] init failed', err);
    disabled = true;
  }
}

function safe(fn) {
  if (disabled || readOptOut()) return;
  if (ready) {
    try { fn(posthog); } catch (err) { logger.error?.('[analytics] call failed', err); }
    return;
  }
  // posthog is still loading — queue the call (bounded) and flush on ready.
  if (pending.length < MAX_PENDING) pending.push(fn);
}

function identify(userId, props = {}) {
  if (!userId) return;
  safe((c) => c.identify(userId, props));
}

function track(event, props = {}) {
  if (!event) return;
  safe((c) => c.capture(event, props));
}

function reset() {
  safe((c) => c.reset());
}

function setSuperProps(props = {}) {
  safe((c) => c.register(props));
}

function optOut() {
  writeOptOut(true);
  safe((c) => c.opt_out_capturing());
}

function optIn() {
  writeOptOut(false);
  if (!initAttempted) {
    init();
    return;
  }
  safe((c) => c.opt_in_capturing());
}

function isOptedOut() {
  return readOptOut();
}

const analyticsService = {
  init,
  identify,
  track,
  reset,
  setSuperProps,
  optOut,
  optIn,
  isOptedOut,
};

export default analyticsService;
