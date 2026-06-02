// Wake analytics service — Landing
// Anonymous behavior: identified_only person profiles, but anonymous events still flow
// for funnel analysis ($pageview, landing.cta_clicked). Session replay at 100%.

import posthog from 'posthog-js';

const APP_NAME = 'landing';
const STORAGE_OPTOUT_KEY = 'wake_analytics_opt_out';
const REPLAY_SAMPLE = 1.0;

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
  track(event, props = {}) { if (event) safe((c) => c.capture(event, props)); },
  reset() { safe((c) => c.reset()); },
  setSuperProps(props = {}) { safe((c) => c.register(props)); },
  optOut() { writeOptOut(true); safe((c) => c.opt_out_capturing()); },
  optIn() { writeOptOut(false); if (!initAttempted) init(); else safe((c) => c.opt_in_capturing()); },
  isOptedOut() { return readOptOut(); },
};

export default analyticsService;
