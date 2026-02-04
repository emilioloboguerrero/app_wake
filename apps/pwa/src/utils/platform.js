// Platform detection utility
// Determines if running on web or native

export const isWeb = typeof window !== 'undefined' && typeof document !== 'undefined';
export const isNative = !isWeb;

// Detect Safari on web (desktop or iOS). Used to work around Firebase Auth + IndexedDB
// issues where onAuthStateChanged may never fire in Safari.
export const isSafariWeb = () => {
  if (!isWeb || typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  return (ua.includes('Safari') && !ua.includes('Chrome') && !ua.includes('Chromium')) || !!navigator.userAgentData?.brands?.some(b => b.brand === 'Safari');
};

// Detect if running as PWA (installed web app) vs regular browser
export const isPWA = () => {
  if (!isWeb) return false;

  const matchMedia = window.matchMedia;
  if (!matchMedia) return false;

  // Explicit: in browser tab we are NOT PWA (Chrome reports display-mode: browser here)
  if (matchMedia('(display-mode: browser)').matches) {
    return false;
  }

  // Standalone = launched from home screen / installed PWA
  if (matchMedia('(display-mode: standalone)').matches) {
    return true;
  }

  // iOS Safari: added to Home Screen
  if (window.navigator.standalone === true) {
    return true;
  }

  // minimal-ui = installed PWA with minimal browser chrome (some browsers)
  if (matchMedia('(display-mode: minimal-ui)').matches) {
    return true;
  }

  // Do NOT use display-mode: fullscreen — Chrome desktop reports fullscreen when
  // the window is merely maximized, so we would incorrectly show the app in browser.
  return false;
};

// Check if running in regular web browser (not PWA)
export const isRegularWeb = () => isWeb && !isPWA();

// Whether to show the main app flow instead of InstallScreen.
// In production: only when running as installed PWA.
// In development (localhost/127.0.0.1 or NODE_ENV=development): bypass via ?app=1 or WAKE_APP_BYPASS localStorage.
// On localhost/127.0.0.1 we also auto-bypass (always show app) so dev in browser works without extra flags.
export const shouldShowAppFlow = () => {
  if (isPWA()) return true;
  if (!isWeb || typeof window === 'undefined') return false;

  const hostname = window.location?.hostname || '';
  const isLocal =
    hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]';
  const isDev =
    isLocal ||
    (typeof __DEV__ !== 'undefined' && __DEV__) ||
    (typeof process !== 'undefined' && process.env.NODE_ENV === 'development');

  if (!isDev) return false;

  try {
    if (window.location?.search?.includes('app=1')) return true;
    if (window.localStorage?.getItem('WAKE_APP_BYPASS') === 'true') return true;
    // On localhost, auto-bypass so dev in browser works without ?app=1
    if (isLocal) return true;
  } catch (_) {}
  return false;
};

// Get platform-specific storage
export const getStorage = () => {
  if (isWeb) {
    // Use web storage service for web
    return require('../services/webStorageService').default;
  } else {
    // Use AsyncStorage for native
    const AsyncStorage = require('@react-native-async-storage/async-storage').default;
    return AsyncStorage;
  }
};

// Get platform-specific dimensions
// NOTE: For React components, prefer using useWindowDimensions() hook instead
// This utility is for non-React contexts only (e.g., utility functions, module-level code)
export const getDimensions = () => {
  if (isWeb) {
    return {
      width: window.innerWidth,
      height: window.innerHeight
    };
  } else {
    // For native, we still need Dimensions.get() since this is used outside React components
    // Components should use useWindowDimensions() hook instead
    const { Dimensions } = require('react-native');
    return Dimensions.get('window');
  }
};

// Platform-specific image component
export const getImageComponent = () => {
  if (isWeb) {
    return 'img';
  } else {
    const { Image } = require('react-native');
    return Image;
  }
};

// Platform-specific video component
export const getVideoComponent = () => {
  if (isWeb) {
    return 'video';
  } else {
    const { VideoView } = require('expo-video');
    return VideoView;
  }
};


