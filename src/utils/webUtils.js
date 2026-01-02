// Web-specific utility functions

// Get responsive dimensions (web-compatible)
export const getResponsiveDimensions = () => {
  if (typeof window === 'undefined') {
    return { width: 375, height: 812 }; // Default mobile size
  }

  return {
    width: window.innerWidth,
    height: window.innerHeight,
    screenWidth: window.innerWidth,
    screenHeight: window.innerHeight
  };
};

// Convert React Native style to web CSS
export const convertRNStyleToWeb = (rnStyle) => {
  if (!rnStyle) return {};

  const webStyle = {};

  // Convert common React Native styles to web
  Object.keys(rnStyle).forEach((key) => {
    const value = rnStyle[key];

    switch (key) {
      case 'flex':
        webStyle.flex = value;
        break;
      case 'flexDirection':
        webStyle.flexDirection = value;
        break;
      case 'justifyContent':
        webStyle.justifyContent = value;
        break;
      case 'alignItems':
        webStyle.alignItems = value;
        break;
      case 'backgroundColor':
        webStyle.backgroundColor = value;
        break;
      case 'color':
        webStyle.color = value;
        break;
      case 'fontSize':
        webStyle.fontSize = typeof value === 'number' ? `${value}px` : value;
        break;
      case 'fontWeight':
        webStyle.fontWeight = value;
        break;
      case 'padding':
        webStyle.padding = typeof value === 'number' ? `${value}px` : value;
        break;
      case 'paddingHorizontal':
        webStyle.paddingLeft = typeof value === 'number' ? `${value}px` : value;
        webStyle.paddingRight = typeof value === 'number' ? `${value}px` : value;
        break;
      case 'paddingVertical':
        webStyle.paddingTop = typeof value === 'number' ? `${value}px` : value;
        webStyle.paddingBottom = typeof value === 'number' ? `${value}px` : value;
        break;
      case 'margin':
        webStyle.margin = typeof value === 'number' ? `${value}px` : value;
        break;
      case 'marginHorizontal':
        webStyle.marginLeft = typeof value === 'number' ? `${value}px` : value;
        webStyle.marginRight = typeof value === 'number' ? `${value}px` : value;
        break;
      case 'marginVertical':
        webStyle.marginTop = typeof value === 'number' ? `${value}px` : value;
        webStyle.marginBottom = typeof value === 'number' ? `${value}px` : value;
        break;
      case 'borderRadius':
        webStyle.borderRadius = typeof value === 'number' ? `${value}px` : value;
        break;
      case 'borderWidth':
        webStyle.borderWidth = typeof value === 'number' ? `${value}px` : value;
        break;
      case 'borderColor':
        webStyle.borderColor = value;
        break;
      case 'width':
        webStyle.width = typeof value === 'number' ? `${value}px` : value;
        break;
      case 'height':
        webStyle.height = typeof value === 'number' ? `${value}px` : value;
        break;
      case 'position':
        webStyle.position = value;
        break;
      case 'top':
        webStyle.top = typeof value === 'number' ? `${value}px` : value;
        break;
      case 'left':
        webStyle.left = typeof value === 'number' ? `${value}px` : value;
        break;
      case 'right':
        webStyle.right = typeof value === 'number' ? `${value}px` : value;
        break;
      case 'bottom':
        webStyle.bottom = typeof value === 'number' ? `${value}px` : value;
        break;
      case 'zIndex':
        webStyle.zIndex = value;
        break;
      case 'opacity':
        webStyle.opacity = value;
        break;
      case 'transform':
        webStyle.transform = value;
        break;
      case 'shadowColor':
        webStyle.boxShadow = `0 0 ${rnStyle.shadowRadius || 0}px ${value}`;
        break;
      case 'elevation':
        // Android elevation -> box-shadow
        if (value > 0) {
          webStyle.boxShadow = `0 ${value}px ${value * 2}px rgba(0, 0, 0, 0.3)`;
        }
        break;
      default:
        // Pass through other properties
        webStyle[key] = value;
    }
  });

  return webStyle;
};

// Check if device is iOS
export const isIOS = () => {
  if (typeof window === 'undefined') return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || 
         (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
};

// Check if device is Android
export const isAndroid = () => {
  if (typeof window === 'undefined') return false;
  return /Android/.test(navigator.userAgent);
};

// Check if running as PWA
export const isPWA = () => {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(display-mode: standalone)').matches ||
         window.navigator.standalone === true ||
         document.referrer.includes('android-app://');
};

// Get safe area insets (for notched devices)
export const getSafeAreaInsets = () => {
  if (typeof window === 'undefined') {
    return { top: 0, bottom: 0, left: 0, right: 0 };
  }

  const style = getComputedStyle(document.documentElement);
  return {
    top: parseInt(style.getPropertyValue('--safe-area-inset-top') || '0', 10),
    bottom: parseInt(style.getPropertyValue('--safe-area-inset-bottom') || '0', 10),
    left: parseInt(style.getPropertyValue('--safe-area-inset-left') || '0', 10),
    right: parseInt(style.getPropertyValue('--safe-area-inset-right') || '0', 10)
  };
};

// Network status
export const getNetworkStatus = () => {
  if (typeof navigator === 'undefined' || !navigator.onLine) {
    return { isOnline: false, type: 'unknown' };
  }

  const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  
  return {
    isOnline: navigator.onLine,
    type: connection?.effectiveType || 'unknown',
    downlink: connection?.downlink || null,
    rtt: connection?.rtt || null
  };
};

// Listen to network changes
export const onNetworkChange = (callback) => {
  if (typeof window === 'undefined') return () => {};

  const handleOnline = () => callback({ isOnline: true });
  const handleOffline = () => callback({ isOnline: false });

  window.addEventListener('online', handleOnline);
  window.addEventListener('offline', handleOffline);

  return () => {
    window.removeEventListener('online', handleOnline);
    window.removeEventListener('offline', handleOffline);
  };
};

// Storage quota check
export const checkStorageQuota = async () => {
  if (!navigator.storage || !navigator.storage.estimate) {
    return null;
  }

  try {
    const estimate = await navigator.storage.estimate();
    return {
      usage: estimate.usage || 0,
      quota: estimate.quota || 0,
      usagePercent: estimate.quota 
        ? ((estimate.usage / estimate.quota) * 100).toFixed(2) 
        : 0,
      available: estimate.quota 
        ? (estimate.quota - (estimate.usage || 0)) 
        : null
    };
  } catch (error) {
    console.error('Error checking storage quota:', error);
    return null;
  }
};

// Request persistent storage (for better quota on some browsers)
export const requestPersistentStorage = async () => {
  if (!navigator.storage || !navigator.storage.persist) {
    return false;
  }

  try {
    const isPersistent = await navigator.storage.persist();
    return isPersistent;
  } catch (error) {
    console.error('Error requesting persistent storage:', error);
    return false;
  }
};


