// Web-specific App entry point
import React from 'react';
import { View, Text } from 'react-native';
import './styles/global.css'; // Load Montserrat + global styles for all screens (including InstallScreen when !isPWA)
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from './config/queryClient';
import LoginScreen from './screens/LoginScreen.web';
import InstallScreen from './screens/InstallScreen.web';
import logger from './utils/logger';
import wakeDebug from './utils/wakeDebug';
import apiClient from './utils/apiClient';
import { reportError as reportClientError } from './utils/errorReporter';
import useFrozenBottomInset from './hooks/useFrozenBottomInset.web';
import { isPWA, shouldShowAppFlow } from './utils/platform';
import OfflineBanner from './components/ui/OfflineBanner';

// Extra top padding for non-iOS so Mac/Android browser layout matches iOS (safe area is 0 there).
const CONTENT_TOP_PADDING_NON_IOS = 0;

// Applies frozen bottom inset (like WakeHeader freezes top) so bottom never pops after mount.
function FrozenBottomWrapper({ children }) {
  const paddingBottom = useFrozenBottomInset();
  return <View style={{ flex: 1, paddingBottom }}>{children}</View>;
}

// Helper: login path depends on base path (e.g. /login at root, /app/login when base is /app)
const getIsLoginPath = (basePath) => {
  if (typeof window === 'undefined') return false;
  const loginPath = basePath ? (basePath.replace(/\/$/, '') + '/login') : '/login';
  return window.location.pathname === loginPath;
};

// Always import BrowserRouter and AuthProvider (needed for LoginScreen)
const BrowserRouter = require('react-router-dom').BrowserRouter;
const AuthProvider = require('./contexts/AuthContext').AuthProvider;
const ActivityStreakProvider = require('./contexts/ActivityStreakContext').ActivityStreakProvider;
const WakeDebugPanel = require('./components/WakeDebugPanel.web').default;

// Wake Debug instrumentation — activate with localStorage.WAKE_DEBUG = '1'
wakeDebug.patchApiClient(apiClient);
wakeDebug.patchQueryClient(queryClient);
wakeDebug.startMemoryTracking();
if (wakeDebug.IS_ENABLED) {
  try {
    const firestoreModule = require('firebase/firestore');
    wakeDebug.patchFirestore(firestoreModule);
  } catch { /* firestore not available */ }
}

// CRITICAL: DO NOT import useMontserratFonts from './config/fonts'
// That file conditionally calls useFonts from expo-google-fonts, which violates Rules of Hooks
// Instead, define it inline here to ensure consistent hook order on web

// Always import useMontserratFonts to maintain hook order
// FORCE web version to avoid expo-font hooks on web
// Inline web version directly to avoid Metro resolution issues
// This MUST be defined here, NOT imported from fonts.js, to avoid hook order violations
const useMontserratFontsWeb = () => {
  // WEB-SPECIFIC INLINED VERSION - DO NOT USE fonts.js
  // This ensures consistent hook order (only useState, no conditional useFonts)
  // On web, fonts are loaded via CSS (Google Fonts in global.css)
  // Use useState to maintain hook order (matching what native useFonts does)
  // This is the ONLY hook called in this function, ensuring consistent hook order
  // DO NOT call any other hooks here - this must match the hook structure exactly

  // Unique identifier to verify this version is being used
  // CRITICAL: Always call useState in the same order
  // This must be called unconditionally to maintain hook order
  const [fontsLoaded] = React.useState(true);
  return fontsLoaded;
};

// Verify this is the web version (safety check)

// Inject Montserrat font link at runtime – ensures font loads in dev (Expo dev server
// doesn't use web/index.html) and production (backup if index.html link is missing)
const MONSERRAT_URL =
  'https://fonts.googleapis.com/css2?family=Montserrat:wght@300;400;500;600;700&display=swap';
const FONT_LINK_ID = 'wake-montserrat-font';

function ensureMontserratLoaded() {
  if (typeof document === 'undefined' || !document.head) return;
  if (document.getElementById(FONT_LINK_ID)) return;
  const existing = document.querySelector(`link[href*="Montserrat"]`);
  if (existing) return;
  const preconnect1 = document.createElement('link');
  preconnect1.rel = 'preconnect';
  preconnect1.href = 'https://fonts.googleapis.com';
  document.head.appendChild(preconnect1);
  const preconnect2 = document.createElement('link');
  preconnect2.rel = 'preconnect';
  preconnect2.href = 'https://fonts.gstatic.com';
  preconnect2.crossOrigin = 'anonymous';
  document.head.appendChild(preconnect2);
  const link = document.createElement('link');
  link.id = FONT_LINK_ID;
  link.rel = 'stylesheet';
  link.href = MONSERRAT_URL;
  document.head.appendChild(link);
}
ensureMontserratLoaded();

// Apply viewport height once as soon as the bundle loads (dev server doesn't use web/index.html).
// This ensures the fix runs in Expo dev and in production before React mounts.
const VIEWPORT_LOG = '[VIEWPORT]';
function applyViewportHeightOnce() {
  if (typeof window === 'undefined' || !window.document) return;
  const root = document.getElementById('root');
  if (!root) return;
  const isIOS = () => /iPhone|iPad|iPod/.test(navigator.userAgent || '');
  const isAndroid = () => /Android/.test(navigator.userAgent || '');
  const isPWAHere = () => {
    if (!window.matchMedia) return false;
    if (window.matchMedia('(display-mode: browser)').matches) return false;
    if (window.matchMedia('(display-mode: standalone)').matches) return true;
    if (window.navigator && window.navigator.standalone === true) return true;
    if (window.matchMedia('(display-mode: minimal-ui)').matches) return true;
    return false;
  };
  const getCurrentHeight = () =>
    Math.max(
      (window.visualViewport && window.visualViewport.height) || 0,
      window.innerHeight || 0
    );
  const getHeight = () => {
    let h = getCurrentHeight();
    const useAvail = (isPWAHere() && (isIOS() || isAndroid())) || (isIOS() && window.screen && window.screen.availHeight && getCurrentHeight() >= window.screen.availHeight - 2);
    if (useAvail && window.screen && window.screen.availHeight) {
      h = Math.max(h, window.screen.availHeight);
    }
    return Math.round(h);
  };
  const getWidth = () => {
    if (window.visualViewport) {
      return Math.round(window.visualViewport.width * window.visualViewport.scale);
    }
    return window.document.documentElement.clientWidth || window.innerWidth || 0;
  };
  const pwa = isPWAHere();
  const ios = isIOS();
  const android = isAndroid();
  const curH = getCurrentHeight();
  const w = getWidth();
  const h = getHeight();
  if (w > 0 && h > 0 && window.document.documentElement) {
    window.document.documentElement.style.setProperty('--layout-width-px', `${w}px`);
    window.document.documentElement.style.setProperty('--layout-height-px', `${h}px`);
    window.document.documentElement.style.setProperty('height', `${h}px`, 'important');
    window.document.documentElement.style.setProperty('min-height', `${h}px`, 'important');
    if (document.body) {
      document.body.style.setProperty('height', `${h}px`, 'important');
      document.body.style.setProperty('min-height', `${h}px`, 'important');
    }
    root.style.setProperty('height', `${h}px`, 'important');
    root.style.setProperty('min-height', `${h}px`, 'important');
    root.style.setProperty('max-height', `${h}px`, 'important');
  }
}
applyViewportHeightOnce();

// Lazy load heavy components - will be loaded when needed
// This prevents loading them at module load time
let StatusBar, VideoProvider, WebAppNavigator, ErrorBoundary;
let auth;

// Function to load heavy components (called when not on login route)
// Made async to prevent blocking the main thread
const loadHeavyComponents = async () => {
  if (!StatusBar) {
    // Load components asynchronously to prevent blocking
    await new Promise(resolve => {
      requestAnimationFrame(() => {
        try {
          StatusBar = require('expo-status-bar').StatusBar;
          VideoProvider = require('./contexts/VideoContext').VideoProvider;
          WebAppNavigator = require('./navigation/WebAppNavigator').default;
          ErrorBoundary = require('./components/ErrorBoundary').default;
          auth = require('./config/firebase').auth;
        } catch (error) {
          logger.error('[APP] ❌ Error loading heavy components:', error);
          // Don't throw - let the app continue with partial loading
        }
        resolve();
      });
    });
  }
};

// Helper function to safely use logger
const safeLog = (method, ...args) => {
  if (logger && logger[method]) {
    logger[method](...args);
  }
};

export default function App() {

  // CRITICAL: ALL HOOKS MUST BE CALLED UNCONDITIONALLY AND IN THE SAME ORDER
  // This ensures React hooks are always called in the same order every render

  // Load heavy components for non-login routes (async, non-blocking)
  const [componentsLoaded, setComponentsLoaded] = React.useState(false);
  const [initError, setInitError] = React.useState(null);
  const [debugMode] = React.useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('WAKE_DEBUG') === 'true' ||
             window.location.search.includes('debug=true');
    }
    return false;
  });

  // Base path: derive from URL first (reload at /app stays in PWA), then fall back to build env
  const webBasePath =
    typeof window !== 'undefined' && (window.location.pathname === '/app' || window.location.pathname.startsWith('/app/'))
      ? '/app'
      : ((typeof process !== 'undefined' && process.env?.EXPO_PUBLIC_BASE_PATH) || '');
  // Font loading - MUST be called unconditionally before any conditional logic
  // CRITICAL: This hook MUST be called unconditionally, before any conditional returns
  const fontsLoadedFromHook = useMontserratFontsWeb();
  // Check login path AFTER all hooks are called (basename-aware)
  const isLoginPath = getIsLoginPath(webBasePath);

  // Determine final fonts loaded state (after hooks are called)
  // CRITICAL: Always use fontsLoadedFromHook to maintain consistent hook order
  // Don't conditionally change this value as it can affect hook order
  const fontsLoaded = fontsLoadedFromHook;

  // Production debug: log on mount so we see something in console (Safari etc.)

  // Service worker management (for both login and non-login routes)
  React.useEffect(() => {
    if (isLoginPath) {
      // Unregister service worker for login route
      if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
        navigator.serviceWorker.getRegistrations().then((registrations) => {
          registrations.forEach((registration) => {
            registration.unregister();
          });
        });
      }
    } else {
      loadHeavyComponents().then(() => {
        setComponentsLoaded(true);

        // Register background sync listeners so the offline queue is processed on reconnect
        try {
          const { registerOnlineListener } = require('./utils/backgroundSync');
          registerOnlineListener();
        } catch (_) {}

        // Initialize Service Worker AFTER components are loaded (path respects base path e.g. /app/sw.js)
        if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
          const swPath = webBasePath + '/sw.js';
          const rootScope = new URL('/', window.location.origin).href;
          navigator.serviceWorker.getRegistrations().then((registrations) => {
            return Promise.all(
              registrations.map((reg) => {
                if (reg.scope === rootScope && webBasePath === '/app') {
                  return reg.unregister();
                }
                return Promise.resolve();
              })
            );
          }).then(() =>
            fetch(swPath, { method: 'HEAD' })
          ).then((res) => {
            if (!res) return null;
            const ct = res && res.headers ? res.headers.get('content-type') || '' : '';
            if (ct.indexOf('javascript') === -1 && ct.indexOf('ecmascript') === -1) {
              return null;
            }
            return navigator.serviceWorker.register(swPath);
          })
            .then(() => {})
            .catch((error) => {
              safeLog('error', '❌ Service Worker registration failed:', error);
            });
        }
      }).catch((error) => {
        logger.error('[APP] Error loading components:', error);
        setComponentsLoaded(true); // Continue anyway
      });

      // Fallback: if components don't load within 3 seconds, set to true anyway
      // Use a ref to track if we've already set it
      const timeoutId = setTimeout(() => {
        setComponentsLoaded(true);
      }, 3000);

      // Cleanup timeout if component unmounts
      return () => {
        clearTimeout(timeoutId);
      };
    }
  }, [isLoginPath, webBasePath]);

  // Suppress React Native chart-kit warnings on web (development only)
  React.useEffect(() => {
    if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
      const originalWarn = logger.warn;
      const originalError = logger.error;

      // Filter out specific chart-related warnings
      logger.warn = (...args) => {
        const message = args.join(' ');
        // Suppress react-native-chart-kit warnings
        if (
          message.includes('Invalid DOM property') ||
          message.includes('Unknown event handler property') ||
          message.includes('onStartShouldSetResponder') ||
          message.includes('onResponderTerminationRequest') ||
          message.includes('onResponderGrant') ||
          message.includes('onResponderMove') ||
          message.includes('onResponderRelease') ||
          message.includes('onResponderTerminate') ||
          message.includes('transform-origin') ||
          message.includes('TouchableMixin is deprecated')
        ) {
          return; // Don't log these warnings
        }
        originalWarn(...args);
      };

      logger.error = (...args) => {
        const message = args.join(' ');
        // Suppress chart-related errors
        if (
          message.includes('Invalid DOM property') ||
          message.includes('Unknown event handler property') ||
          message.includes('transform-origin')
        ) {
          return; // Don't log these errors
        }
        originalError(...args);
      };

      return () => {
        logger.warn = originalWarn;
        logger.error = originalError;
      };
    }
  }, []);

  // Enhanced error logging (with extension error filtering)
  // This runs for both login and non-login routes (safeLog handles missing logger)
  React.useEffect(() => {
    if (typeof window !== 'undefined') {
      // Log unhandled errors (but filter extension errors)
      const errorHandler = (event) => {
        const message = String(event.message || '');
        const source = String(event.filename || '');

        // Skip Chrome extension errors
        if (message.includes('chrome-extension://') ||
            message.includes('ERR_FILE_NOT_FOUND') ||
            source.includes('chrome-extension://') ||
            source.includes('pejdijmoenmkgeppbflobdenhhabjlaj')) {
          return; // Don't log extension errors
        }
        // Resource load errors (e.g. img 404) often have undefined message/filename/error in some browsers
        if (event.message == null && event.filename == null && event.error == null) {
          safeLog('error', '❌ Unhandled Error: (resource load error, e.g. image)');
          return;
        }
        safeLog('error', '❌ Unhandled Error:', {
          message: event.message,
          filename: event.filename,
          lineno: event.lineno,
          colno: event.colno,
          error: event.error
        });
        reportClientError({
          message: event.message,
          stack: event.error && event.error.stack ? event.error.stack : null,
          url:
            (typeof location !== 'undefined' ? location.pathname : '') +
            (event.filename ? ` (${event.filename}:${event.lineno || '?'})` : ''),
        });
      };

      const rejectionHandler = (event) => {
        const reason = event.reason;
        const reasonStr = String(reason || '');

        // Skip Chrome extension promise rejections
        if (reasonStr.includes('chrome-extension://') ||
            reasonStr.includes('ERR_FILE_NOT_FOUND') ||
            reasonStr.includes('pejdijmoenmkgeppbflobdenhhabjlaj')) {
          event.preventDefault();
          return;
        }
        // AbortError is expected when video load/play is aborted (e.g. switching add-exercise cards, closing modal, changing source)
        if (reason?.name === 'AbortError' || reasonStr.includes('AbortError') || reasonStr.includes('operation was aborted')) {
          event.preventDefault();
          return;
        }

        safeLog('error', '❌ Unhandled Promise Rejection:', event.reason);
        const msg =
          reason && typeof reason === 'object' && reason.message ?
            String(reason.message) :
            reasonStr;
        reportClientError({
          message: msg,
          stack:
            reason && typeof reason === 'object' && reason.stack ?
              String(reason.stack) :
              null,
          url: typeof location !== 'undefined' ? location.pathname : '',
        });
      };

      window.addEventListener('error', errorHandler, true);
      window.addEventListener('unhandledrejection', rejectionHandler);

      return () => {
        window.removeEventListener('error', errorHandler, true);
        window.removeEventListener('unhandledrejection', rejectionHandler);
      };
    }
  }, []);

  // Inject video-card overlay CSS at runtime so it wins over bundled styles (Safari PWA
  // was showing video with position:static/z-index:auto; our global.css rules were not applied).
  React.useEffect(() => {
    if (typeof document === 'undefined' || !document.head) return;
    if (document.getElementById('wake-video-card-override')) return;
    const style = document.createElement('style');
    style.id = 'wake-video-card-override';
    style.textContent = [
      '[data-video-card]{position:relative!important;z-index:0!important;isolation:isolate!important}',
      '[data-video-card] video{position:relative!important;z-index:-1!important}',
      '[data-video-card] [data-video-overlay]{-webkit-transform:translateZ(0)!important;transform:translateZ(0)!important;z-index:1!important}'
    ].join('\n');
    document.head.appendChild(style);
  }, []);

  // CRITICAL: This useEffect must always be called (no conditional hook calls)
  // Early return inside the callback is fine, but the hook itself must always be called
  React.useEffect(() => {
    // Skip initialization for login route
    if (isLoginPath) return;

    // Prevent multiple initializations
    let mounted = true;

    // Initialize web storage (non-blocking)
    const initializeApp = async () => {
      if (!mounted) return;

      // Guard: Only run if components are loaded
      if (!auth) {
        return;
      }

      try {
        // Initialize React Query IndexedDB persistence (non-blocking)
        try {
          const { initQueryPersistence } = require('./config/queryPersistence.web');
          initQueryPersistence(queryClient);
        } catch (persistError) {
        }

        // Request persistent storage for better quota (non-blocking with timeout)
        if (navigator.storage && navigator.storage.persist) {
          // Use Promise.race to prevent hanging
          Promise.race([
            navigator.storage.persist(),
            new Promise(resolve => setTimeout(resolve, 1000)) // 1 second timeout
          ]).catch((error) => {
          });
        }

      } catch (error) {
        if (mounted) {
          safeLog('error', 'App initialization failed:', error);
          setInitError(error);
        }
        // Don't block app from loading even if initialization fails
      }
    };

    if (fontsLoaded) {
      // Run initialization asynchronously without blocking render
      initializeApp().catch(err => {
        if (mounted) {
          safeLog('error', 'Unhandled initialization error:', err);
          setInitError(err);
        }
      });
    }

    return () => {
      mounted = false;
    };
  }, [fontsLoaded, debugMode, isLoginPath]);

  // Safari video overlay debug: run when ?safari_video_debug=1 or __DEV__ + Safari (navigate to a screen with video, pause, then check console or on-screen panel).
  React.useEffect(() => {
    if (isLoginPath || !fontsLoaded) return;
    try {
      const { runSafariVideoOverlayDebug } = require('./utils/safariVideoOverlayDebug.web');
      runSafariVideoOverlayDebug();
    } catch (_) {}
  }, [fontsLoaded, isLoginPath]);

  // Defer safe-area measurement so env() has resolved (avoids 0→34 pop when NativeSafeAreaProvider fires ~50ms later).
  // Use 250ms so more devices have env(safe-area-inset-*) ready; freezing 0 made the bar "too high".
  const [initialMetrics, setInitialMetrics] = React.useState(null);
  React.useEffect(() => {
    if (typeof window === 'undefined' || !window.document) return;
    const id = setTimeout(() => {
      const width = window.innerWidth;
      const height = window.innerHeight;
      let top = 0, bottom = 0, left = 0, right = 0;
      try {
        const el = window.document.createElement('div');
        el.style.cssText =
          'position:fixed;top:0;left:0;padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left);visibility:hidden;pointer-events:none;';
        window.document.body.appendChild(el);
        const s = window.getComputedStyle(el);
        const parse = (v) => { const n = parseInt(String(v), 10); return Number.isNaN(n) ? 0 : Math.max(0, n); };
        top = parse(s.paddingTop);
        bottom = parse(s.paddingBottom);
        left = parse(s.paddingLeft);
        right = parse(s.paddingRight);
        window.document.body.removeChild(el);
      } catch (_) {}
      if (isPWA()) bottom = 0;
      // Standalone but env(safe-area-inset-top) is 0 (e.g. iOS localhost PWA). Use fallback so dev layout matches production.
      // iPhone 17 / Dynamic Island devices: ~59px; older notched iPhones ~47px. Use 59 so iPhone 17 is covered.
      const standaloneOrIOSHomeScreen =
        isPWA() || (typeof navigator !== 'undefined' && navigator.standalone === true);
      if (top === 0 && standaloneOrIOSHomeScreen) top = 59;
      const metrics = { frame: { x: 0, y: 0, width, height }, insets: { top, left, right, bottom } };
      setInitialMetrics(metrics);
    }, 250);
    return () => clearTimeout(id);
  }, []);

  // iOS PWA standalone: 100vh/100svh use the "small" viewport (Safari-with-toolbar height), leaving a gap.
  // Use isPWA() (matchMedia + navigator.standalone + minimal-ui), display-mode listener, delayed re-checks,
  // and on iOS PWA use screen.availHeight. If standalone isn't detected, still apply on iOS when viewport
  // is already near full height (innerHeight >= screen.availHeight - 2).
  React.useEffect(() => {
    if (typeof window === 'undefined' || !window.document) return;
    const root = document.getElementById('root');
    if (!root) return;
    const isIOS = () => /iPhone|iPad|iPod/.test(navigator.userAgent || '');
    const isAndroid = () => /Android/.test(navigator.userAgent || '');
    const getCurrentHeight = () =>
      Math.max(
        (window.visualViewport && window.visualViewport.height) || 0,
        window.innerHeight || 0
      );
    const shouldApply = () => {
      if (isPWA()) return true;
      if (isIOS() && window.screen && window.screen.availHeight && getCurrentHeight() >= window.screen.availHeight - 2) return true;
      return true;
    };
    const getHeight = () => {
      let h = getCurrentHeight();
      const useAvail = (isPWA() && (isIOS() || isAndroid())) || (isIOS() && window.screen && window.screen.availHeight && getCurrentHeight() >= window.screen.availHeight - 2);
      if (useAvail && window.screen && window.screen.availHeight) {
        h = Math.max(h, window.screen.availHeight);
      }
      return Math.round(h);
    };
    const getWidth = () => {
      if (window.visualViewport) {
        return Math.round(window.visualViewport.width * window.visualViewport.scale);
      }
      return window.document.documentElement.clientWidth || window.innerWidth || 0;
    };
    const setLayoutViewportCSSVars = () => {
      const w = getWidth();
      const h = getHeight();
      if (w > 0 && h > 0 && window.document.documentElement) {
        window.document.documentElement.style.setProperty('--layout-width-px', `${w}px`);
        window.document.documentElement.style.setProperty('--layout-height-px', `${h}px`);
      }
    };
    const setHeight = () => {
      setLayoutViewportCSSVars();
      const apply = shouldApply();
      const h = getHeight();
      if (!apply) return;
      document.documentElement.style.setProperty('height', `${h}px`, 'important');
      document.documentElement.style.setProperty('min-height', `${h}px`, 'important');
      document.body.style.setProperty('height', `${h}px`, 'important');
      document.body.style.setProperty('min-height', `${h}px`, 'important');
      root.style.setProperty('height', `${h}px`, 'important');
      root.style.setProperty('min-height', `${h}px`, 'important');
      root.style.setProperty('max-height', `${h}px`, 'important');
    };
    setHeight();
    const t1 = setTimeout(setHeight, 100);
    const t2 = setTimeout(setHeight, 300);
    const t3 = setTimeout(setHeight, 800);
    window.addEventListener('resize', setHeight);
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', setHeight);
      window.visualViewport.addEventListener('scroll', setHeight);
    }
    const mq = window.matchMedia('(display-mode: standalone)');
    const mqMin = window.matchMedia('(display-mode: minimal-ui)');
    const onDisplayModeChange = (e) => { if (e.matches) setHeight(); };
    mq.addEventListener('change', onDisplayModeChange);
    mqMin.addEventListener('change', onDisplayModeChange);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
      window.removeEventListener('resize', setHeight);
      if (window.visualViewport) {
        window.visualViewport.removeEventListener('resize', setHeight);
        window.visualViewport.removeEventListener('scroll', setHeight);
      }
      mq.removeEventListener('change', onDisplayModeChange);
      mqMin.removeEventListener('change', onDisplayModeChange);
    };
  }, []);

  // Ensure critical components are loaded before rendering main app
  if (!ErrorBoundary || !VideoProvider || !WebAppNavigator || !StatusBar) {
    try {
      if (!ErrorBoundary) ErrorBoundary = require('./components/ErrorBoundary').default;
      if (!VideoProvider) VideoProvider = require('./contexts/VideoContext').VideoProvider;
      if (!WebAppNavigator) WebAppNavigator = require('./navigation/WebAppNavigator').default;
      if (!StatusBar) StatusBar = require('expo-status-bar').StatusBar;
      if (!auth) auth = require('./config/firebase').auth;
      if (!logger) logger = require('./utils/logger').default;
    } catch (syncError) {
      logger.error('[APP] Synchronous load failed:', syncError);
    }
  }

  // Single BrowserRouter at root so useNavigate() always has context (fixes LoginScreen error)
  const WakeLoader = require('./components/WakeLoader').default;

  const loadingMarkup = (
    <div style={{
      minHeight: '100svh',
      backgroundColor: '#1a1a1a',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: '#ffffff',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "Roboto", sans-serif'
    }}>
      <View style={{ alignItems: 'center', justifyContent: 'center' }}>
        <WakeLoader size={80} />
        <Text style={{ marginTop: 16, fontSize: 16, color: '#ffffff' }}>Cargando...</Text>
      </View>
    </div>
  );

  // Single AuthProvider for entire app so auth state persists when navigating from /login to /
  // (Previously two providers caused the main app to see user=null after redirect and bounce back to login.)
  let content;
  if (!shouldShowAppFlow()) {
    content = <InstallScreen />;
  } else if (isLoginPath) {
    content = <LoginScreen />;
  } else if (!componentsLoaded || !fontsLoaded) {
    content = loadingMarkup;
  } else if (initError && initError.message?.includes('critical')) {
    content = (
      <div style={{ padding: 20, color: 'white', backgroundColor: '#1a1a1a' }}>
        <h1>Error Loading App</h1>
        <p>{initError.message}</p>
        <button onClick={() => window.location.reload()}>Reload</button>
      </div>
    );
  } else if (!ErrorBoundary || !VideoProvider || !WebAppNavigator) {
    content = (
      <div style={{ padding: 20, color: 'white', backgroundColor: '#1a1a1a' }}>
        <h1>Error Loading App</h1>
        <p>Some components failed to load. Please refresh the page.</p>
        <button onClick={() => window.location.reload()}>Reload</button>
      </div>
    );
  } else {
    content = (
      <ErrorBoundary>
        <VideoProvider>
          <WebAppNavigator />
          {StatusBar && <StatusBar style="light" />}
        </VideoProvider>
      </ErrorBoundary>
    );
  }

  // Mount SafeAreaProvider only after deferred insets measurement so insets are correct from first paint (no 0→34 pop).
  if (!initialMetrics) {
    return (
      <BrowserRouter
        basename={webBasePath}
        future={{
          v7_startTransition: true,
          v7_relativeSplatPath: true,
        }}
      >
        {loadingMarkup}
      </BrowserRouter>
    );
  }

  const isIOSDevice = /iPhone|iPad|iPod/.test(typeof navigator !== 'undefined' ? navigator.userAgent || '' : '');
  const contentWrapperStyle = {
    flex: 1,
    minHeight: 0,
    paddingTop: isIOSDevice ? 0 : CONTENT_TOP_PADDING_NON_IOS,
    display: 'flex',
    flexDirection: 'column',
  };

  return (
    <BrowserRouter
      basename={webBasePath}
      future={{
        v7_startTransition: true,
        v7_relativeSplatPath: true,
      }}
    >
      <QueryClientProvider client={queryClient}>
        <SafeAreaProvider initialMetrics={initialMetrics}>
          <AuthProvider>
            <ActivityStreakProvider>
              <OfflineBanner />
              <FrozenBottomWrapper>
                <View style={contentWrapperStyle}>
                  {content}
                </View>
              </FrozenBottomWrapper>
              <WakeDebugPanel />
            </ActivityStreakProvider>
          </AuthProvider>
        </SafeAreaProvider>
      </QueryClientProvider>
    </BrowserRouter>
  );
}
