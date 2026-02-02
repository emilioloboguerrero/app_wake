/**
 * Web-only Dimensions module: single source of truth for layout viewport.
 * Replaces react-native-web's Dimensions on web so useWindowDimensions() returns
 * a canonical size (max of innerHeight, visualViewport.height, screen.availHeight on iOS PWA),
 * matching the root height set by the iOS PWA fix. Also sets --layout-width-px and
 * --layout-height-px on document.documentElement for CSS.
 */

'use client';

const canUseDOM = typeof window !== 'undefined';

const dimensions = {
  window: { fontScale: 1, height: 0, scale: 1, width: 0 },
  screen: { fontScale: 1, height: 0, scale: 1, width: 0 },
};
const listeners = {};
let shouldInit = canUseDOM;

function isIOS() {
  return canUseDOM && /iPhone|iPad|iPod/.test(navigator.userAgent || '');
}

function isPWA() {
  if (!canUseDOM) return false;
  if (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) return true;
  if (window.matchMedia && window.matchMedia('(display-mode: minimal-ui)').matches) return true;
  return !!(window.navigator && window.navigator.standalone === true);
}

function getCanonicalWindowHeight() {
  const win = window;
  let h = win.innerHeight || 0;
  if (win.visualViewport && win.visualViewport.height) {
    h = Math.max(h, win.visualViewport.height);
  }
  if (isIOS() && win.screen && win.screen.availHeight) {
    const nearFull = h >= win.screen.availHeight - 2;
    if (isPWA() || nearFull) {
      h = Math.max(h, win.screen.availHeight);
    }
  }
  return Math.round(h);
}

function getCanonicalWindowWidth() {
  const win = window;
  if (win.visualViewport) {
    return Math.round(win.visualViewport.width * win.visualViewport.scale);
  }
  const docEl = win.document.documentElement;
  return docEl.clientWidth || 0;
}

function update() {
  if (!canUseDOM) return;

  const win = window;
  const width = getCanonicalWindowWidth();
  const height = getCanonicalWindowHeight();
  const scale = win.devicePixelRatio || 1;

  dimensions.window = { fontScale: 1, height, scale, width };
  dimensions.screen = {
    fontScale: 1,
    height: win.screen.height,
    scale,
    width: win.screen.width,
  };

  if (win.document && win.document.documentElement) {
    win.document.documentElement.style.setProperty('--layout-width-px', `${width}px`);
    win.document.documentElement.style.setProperty('--layout-height-px', `${height}px`);
  }
}

function handleResize() {
  update();
  if (Array.isArray(listeners['change'])) {
    listeners['change'].forEach((handler) => handler(dimensions));
  }
}

class Dimensions {
  static get(dimension) {
    if (shouldInit) {
      shouldInit = false;
      update();
    }
    if (!dimensions[dimension]) {
      throw new Error(`No dimension set for key ${dimension}`);
    }
    return dimensions[dimension];
  }

  static set(initialDimensions) {
    if (initialDimensions && canUseDOM) {
      throw new Error('Dimensions cannot be set in the browser');
    }
    if (initialDimensions && !canUseDOM) {
      if (initialDimensions.screen != null) dimensions.screen = initialDimensions.screen;
      if (initialDimensions.window != null) dimensions.window = initialDimensions.window;
    }
  }

  static addEventListener(type, handler) {
    listeners[type] = listeners[type] || [];
    listeners[type].push(handler);
    return {
      remove: () => this.removeEventListener(type, handler),
    };
  }

  static removeEventListener(type, handler) {
    if (Array.isArray(listeners[type])) {
      listeners[type] = listeners[type].filter((h) => h !== handler);
    }
  }
}

if (canUseDOM) {
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', handleResize, false);
    window.visualViewport.addEventListener('scroll', handleResize, false);
  }
  window.addEventListener('resize', handleResize, false);
}

export default Dimensions;
