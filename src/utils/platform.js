// Platform detection utility
// Determines if running on web or native

export const isWeb = typeof window !== 'undefined' && typeof document !== 'undefined';
export const isNative = !isWeb;

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
export const getDimensions = () => {
  if (isWeb) {
    return {
      width: window.innerWidth,
      height: window.innerHeight
    };
  } else {
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


