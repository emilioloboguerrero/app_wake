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
  
  // Check for standalone display mode (PWA installed)
  if (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) {
    return true;
  }
  
  // iOS Safari specific check
  if (window.navigator.standalone === true) {
    return true;
  }
  
  // Check for minimal-ui mode (also indicates PWA)
  if (window.matchMedia && window.matchMedia('(display-mode: minimal-ui)').matches) {
    return true;
  }
  
  return false;
};

// Check if running in regular web browser (not PWA)
export const isRegularWeb = () => isWeb && !isPWA();

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


