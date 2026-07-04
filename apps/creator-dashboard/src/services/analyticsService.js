// Wake analytics service — Creator Dashboard
// Session-level events only. Identified-only profiles. No autocapture.

import posthog from 'posthog-js';

const APP_NAME = 'creator-dashboard';
const STORAGE_OPTOUT_KEY = 'wake_analytics_opt_out';
const REPLAY_SAMPLE = 0.5;

let initialized = false;
let initAttempted = false;

function readKey() {
  return import.meta.env.VITE_POSTHOG_KEY || null;
}

function readHost() {
  return import.meta.env.VITE_POSTHOG_HOST || 'https://us.i.posthog.com';
}

function detectEnv() {
  if (typeof window === 'undefined') return 'unknown';
  const host = window.location.hostname || '';
  if (host === 'wakelab.co' || host === 'www.wakelab.co' || host.endsWith('.wakelab.co')) return 'production';
  if (host.startsWith('wake-staging')) return 'staging';
  if (host === 'wolf-20b8b.web.app' || host === 'wolf-20b8b.firebaseapp.com') return 'production';
  if (host === 'localhost' || host === '127.0.0.1') return 'development';
  return 'production';
}

function readOptOut() {
  try {
    return window.localStorage.getItem(STORAGE_OPTOUT_KEY) === '1';
  } catch {
    return false;
  }
}

function writeOptOut(v) {
  try {
    if (v) window.localStorage.setItem(STORAGE_OPTOUT_KEY, '1');
    else window.localStorage.removeItem(STORAGE_OPTOUT_KEY);
  } catch {}
}

// Redact sensitive query params (auth codes, api keys, emails) from
// URL-shaped values before any event leaves the device.
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

function init() {
  if (initAttempted) return;
  initAttempted = true;
  if (typeof window === 'undefined') return;
  const key = readKey();
  if (!key) return;
  if (readOptOut()) return;
  try {
    posthog.init(key, {
      api_host: readHost(),
      person_profiles: 'identified_only',
      autocapture: false,
      capture_pageview: 'history_change',
      capture_pageleave: true,
      capture_exceptions: true,
      sanitize_properties: scrubPiiFromProps,
      session_recording: {
        maskAllInputs: true,
        maskTextSelector: '[data-ph-no-capture]',
      },
      session_replay: { sampleRate: REPLAY_SAMPLE },
      capture_performance: { web_vitals: true, network_timing: false },
      loaded: (ph) => {
        ph.register({
          app: APP_NAME,
          platform: 'web',
          app_version: (import.meta.env.VITE_APP_VERSION) || 'unknown',
          env: detectEnv(),
        });
        initialized = true;
      },
    });
  } catch (err) {
    console.error('[analytics] init failed', err);
  }
}

function safe(fn) {
  if (!initialized) return;
  if (readOptOut()) return;
  try { fn(posthog); } catch (err) { console.error('[analytics] call failed', err); }
}

const analyticsService = {
  init,
  identify(userId, props = {}) { if (userId) safe((c) => c.identify(userId, props)); },
  group(type, key, props = {}) { if (type && key) safe((c) => c.group(type, key, props)); },
  track(event, props = {}) { if (event) safe((c) => c.capture(event, props)); },
  reset() { safe((c) => c.reset()); },
  setSuperProps(props = {}) { safe((c) => c.register(props)); },
  optOut() { writeOptOut(true); safe((c) => c.opt_out_capturing()); },
  optIn() { writeOptOut(false); if (!initAttempted) init(); else safe((c) => c.opt_in_capturing()); },
  isOptedOut() { return readOptOut(); },
};

export default analyticsService;
