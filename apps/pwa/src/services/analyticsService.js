// Wake analytics service — PWA (web bundle only)
//
// Session-level events only. No per-set, no per-Firestore-call, no autocapture.
// Free tier safe: identified_only profiles, manual page views, sampled replay.
//
// Public API:
//   analyticsService.init()
//   analyticsService.identify(userId, props)
//   analyticsService.track(event, props)
//   analyticsService.screenViewed(name, props)
//   analyticsService.reset()
//   analyticsService.optOut() / optIn() / isOptedOut()
//   analyticsService.setSuperProps(props)
//
// Every method is safe to call when PostHog is missing, opted out, or pre-init.

import logger from '../utils/logger';

const APP_NAME = 'pwa';
const STORAGE_OPTOUT_KEY = 'wake_analytics_opt_out';
const REPLAY_SAMPLE = 0.2;

let client = null;
let initialized = false;
let initAttempted = false;

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

function init() {
  if (initAttempted) return;
  initAttempted = true;
  if (!isWeb()) return;

  const key = readKey();
  if (!key) return; // Silent no-op when key not configured (dev, opt-out, etc.)

  if (readOptOut()) return;

  try {
    // Dynamic require so the SDK never blocks bundle parse if not installed yet.
    // eslint-disable-next-line global-require
    const posthog = require('posthog-js').default || require('posthog-js');
    posthog.init(key, {
      api_host: readHost(),
      person_profiles: 'identified_only',
      autocapture: false,
      capture_pageview: false,
      capture_pageleave: true,
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
          initialized = true;
        } catch (err) {
          logger.error?.('[analytics] register failed', err);
        }
      },
    });
    client = posthog;
  } catch (err) {
    logger.error?.('[analytics] init failed', err);
  }
}

function withClient(fn) {
  if (!client || !initialized) return;
  if (readOptOut()) return;
  try {
    fn(client);
  } catch (err) {
    logger.error?.('[analytics] call failed', err);
  }
}

function identify(userId, props = {}) {
  if (!userId) return;
  withClient((c) => c.identify(userId, props));
}

function track(event, props = {}) {
  if (!event) return;
  withClient((c) => c.capture(event, props));
}

function screenViewed(name, props = {}) {
  track('screen.viewed', { screen_name: name, ...props });
}

function reset() {
  withClient((c) => c.reset());
}

function setSuperProps(props = {}) {
  withClient((c) => c.register(props));
}

function optOut() {
  writeOptOut(true);
  withClient((c) => c.opt_out_capturing());
}

function optIn() {
  writeOptOut(false);
  if (!initAttempted) {
    init();
    return;
  }
  withClient((c) => c.opt_in_capturing());
}

function isOptedOut() {
  return readOptOut();
}

const analyticsService = {
  init,
  identify,
  track,
  screenViewed,
  reset,
  setSuperProps,
  optOut,
  optIn,
  isOptedOut,
};

export default analyticsService;
