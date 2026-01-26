// Web-specific App entry point
import React from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import LoginScreen from './screens/LoginScreen.web';
import logger from './utils/logger';

// Helper function to check if we're on login path (called dynamically)
const getIsLoginPath = () => {
  return typeof window !== 'undefined' && window.location.pathname === '/login';
};

// Always import BrowserRouter and AuthProvider (needed for LoginScreen)
const BrowserRouter = require('react-router-dom').BrowserRouter;
const AuthProvider = require('./contexts/AuthContext').AuthProvider;

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
  if (typeof window !== 'undefined') {
    logger.debug('[APP] ✅ Using INLINED useMontserratFontsWeb (web version)');
  }
  
  // CRITICAL: Always call useState in the same order
  // This must be called unconditionally to maintain hook order
  const [fontsLoaded] = React.useState(true);
  return fontsLoaded;
};

// Verify this is the web version (safety check)
if (typeof window === 'undefined' || typeof document === 'undefined') {
  logger.warn('[APP] WARNING: useMontserratFonts is being used in non-web environment!');
}

// Lazy load heavy components - will be loaded when needed
// This prevents loading them at module load time
let StatusBar, VideoProvider, WebAppNavigator, ErrorBoundary;
let auth, webStorageService;

// Function to load heavy components (called when not on login route)
// Made async to prevent blocking the main thread
const loadHeavyComponents = async () => {
  if (!StatusBar) {
    logger.debug('[APP] Loading heavy components...');
    // Load components asynchronously to prevent blocking
    await new Promise(resolve => {
      requestAnimationFrame(() => {
        try {
          logger.debug('[APP] Loading StatusBar...');
          StatusBar = require('expo-status-bar').StatusBar;
          logger.debug('[APP] Loading VideoProvider...');
          VideoProvider = require('./contexts/VideoContext').VideoProvider;
          logger.debug('[APP] Loading WebAppNavigator...');
          WebAppNavigator = require('./navigation/WebAppNavigator').default;
          logger.debug('[APP] Loading ErrorBoundary...');
          ErrorBoundary = require('./components/ErrorBoundary').default;
          logger.debug('[APP] Loading auth, webStorageService...');
          auth = require('./config/firebase').auth;
          webStorageService = require('./services/webStorageService').default;
          logger.debug('[APP] Loading global.css...');
          require('./styles/global.css');
          logger.debug('[APP] ✅ All heavy components loaded successfully');
        } catch (error) {
          logger.error('[APP] ❌ Error loading heavy components:', error);
          // Don't throw - let the app continue with partial loading
        }
        resolve();
      });
    });
  } else {
    logger.debug('[APP] Heavy components already loaded');
  }
};

// Helper function to safely use logger
const safeLog = (method, ...args) => {
  if (logger && logger[method]) {
    logger[method](...args);
  } else {
    console[method === 'log' ? 'log' : method === 'error' ? 'error' : 'warn'](...args);
  }
};

export default function App() {
  if (typeof window !== 'undefined') {
    console.log('[APP WEB] App() running');
  }

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
  
  // Font loading - MUST be called unconditionally before any conditional logic
  // CRITICAL: This hook MUST be called unconditionally, before any conditional returns
  const fontsLoadedFromHook = useMontserratFontsWeb();
  logger.debug('[APP] useMontserratFontsWeb called, fontsLoadedFromHook:', fontsLoadedFromHook);
  
  // Check login path AFTER all hooks are called
  const isLoginPath = getIsLoginPath();
  
  // Determine final fonts loaded state (after hooks are called)
  // CRITICAL: Always use fontsLoadedFromHook to maintain consistent hook order
  // Don't conditionally change this value as it can affect hook order
  const fontsLoaded = fontsLoadedFromHook;
  
  // Service worker management (for both login and non-login routes)
  React.useEffect(() => {
    if (isLoginPath) {
      // Unregister service worker for login route
      if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
        navigator.serviceWorker.getRegistrations().then((registrations) => {
          registrations.forEach((registration) => {
            registration.unregister();
            logger.debug('[APP] Service worker unregistered for login route');
          });
        });
      }
    } else {
      // Load heavy components for non-login routes
      logger.debug('[APP] Starting to load heavy components for non-login route...');
      loadHeavyComponents().then(() => {
        logger.debug('[APP] Heavy components loaded, setting componentsLoaded to true');
        setComponentsLoaded(true);
        
        // Initialize Service Worker AFTER components are loaded
        // Only register if /sw.js is served as JS (not as index.html - fixes "unsupported MIME type text/html")
        if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
          fetch('/sw.js', { method: 'HEAD' })
            .then((res) => {
              const ct = res.headers.get('content-type') || '';
              if (ct.indexOf('javascript') === -1 && ct.indexOf('ecmascript') === -1) {
                safeLog('log', '[WAKE] Skipping SW registration: /sw.js not served as JavaScript');
                return null;
              }
              return navigator.serviceWorker.register('/sw.js');
            })
            .then((registration) => {
              if (registration) safeLog('log', '✅ Service Worker registered:', registration);
            })
            .catch((error) => {
              safeLog('error', '❌ Service Worker registration failed:', error);
            });
        }
      }).catch((error) => {
        logger.error('[APP] ❌ Error loading components:', error);
        logger.debug('[APP] Setting componentsLoaded to true anyway to continue...');
        setComponentsLoaded(true); // Continue anyway
      });
      
      // Fallback: if components don't load within 3 seconds, set to true anyway
      // Use a ref to track if we've already set it
      const timeoutId = setTimeout(() => {
        logger.debug('[APP] ⚠️ Components loading timeout (3s) - forcing componentsLoaded to true');
        setComponentsLoaded(true);
      }, 3000);
      
      // Cleanup timeout if component unmounts
      return () => {
        clearTimeout(timeoutId);
      };
    }
  }, [isLoginPath]);

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
        
        safeLog('error', '❌ Unhandled Error:', {
          message: event.message,
          filename: event.filename,
          lineno: event.lineno,
          colno: event.colno,
          error: event.error
        });
      };

      const rejectionHandler = (event) => {
        const reason = String(event.reason || '');
        
        // Skip Chrome extension promise rejections
        if (reason.includes('chrome-extension://') ||
            reason.includes('ERR_FILE_NOT_FOUND') ||
            reason.includes('pejdijmoenmkgeppbflobdenhhabjlaj')) {
          return; // Don't log extension errors
        }
        
        safeLog('error', '❌ Unhandled Promise Rejection:', event.reason);
      };
      
      window.addEventListener('error', errorHandler, true);
      window.addEventListener('unhandledrejection', rejectionHandler);
      
      return () => {
        window.removeEventListener('error', errorHandler, true);
        window.removeEventListener('unhandledrejection', rejectionHandler);
      };
    }
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
      if (!webStorageService || !auth) {
        return;
      }
      
      try {
        safeLog('log', '🚀 Starting web app initialization...');
        if (debugMode) {
          logger.debug('[DEBUG] Environment:', {
            userAgent: navigator.userAgent,
            platform: navigator.platform,
            language: navigator.language,
            cookieEnabled: navigator.cookieEnabled,
            onLine: navigator.onLine
          });
        }
        
        // Initialize web storage service first (critical for web)
        // Don't await - let it initialize in background with timeout
        Promise.race([
          webStorageService.init().then(() => {
            if (mounted) safeLog('log', '✅ Web storage initialized');
          }),
          new Promise(resolve => setTimeout(resolve, 2000)) // 2 second timeout
        ]).catch((error) => {
          if (mounted) {
            safeLog('error', '⚠️ Web storage initialization failed (non-critical):', error);
            if (debugMode) {
              logger.error('[DEBUG] Storage error details:', error);
            }
          }
        });
        
        // Check auth state (non-blocking)
        try {
          const currentUser = auth.currentUser;
          if (mounted) {
            safeLog('log', '🔐 Auth state:', {
              isAuthenticated: !!currentUser,
              userId: currentUser?.uid || 'none'
            });
            if (debugMode && currentUser) {
              logger.debug('[DEBUG] User details:', {
                uid: currentUser.uid,
                email: currentUser.email,
                emailVerified: currentUser.emailVerified
              });
            }
          }
        } catch (authError) {
          if (mounted) {
            safeLog('error', '❌ Auth check failed:', authError);
            if (debugMode) {
              logger.error('[DEBUG] Auth error details:', authError);
            }
          }
        }
        
        // Skip native-only services on web (they use AsyncStorage/AppState which don't work)
        // These services are not critical for web functionality
        if (mounted) safeLog('log', 'ℹ️ Skipping native-only services on web (session manager, workout progress)');
        
        // Skip monitoring on web (uses React Native Firebase which doesn't work on web)
        if (mounted) safeLog('log', 'ℹ️ Skipping monitoring service on web (React Native Firebase not available)');
        
        // Request persistent storage for better quota (non-blocking with timeout)
        if (navigator.storage && navigator.storage.persist) {
          // Use Promise.race to prevent hanging
          Promise.race([
            navigator.storage.persist().then(isPersistent => {
              if (mounted) safeLog('log', '💾 Persistent storage:', isPersistent ? 'granted' : 'not granted');
            }),
            new Promise(resolve => setTimeout(resolve, 1000)) // 1 second timeout
          ]).catch((error) => {
            if (mounted) safeLog('warn', '⚠️ Persistent storage request failed:', error);
          });
        }
        
        if (mounted) safeLog('log', '✅ Web app initialization completed');
      } catch (error) {
        if (mounted) {
          safeLog('error', '❌ App initialization failed:', error);
          if (debugMode) {
            logger.error('[DEBUG] Initialization error stack:', error.stack);
            logger.error('[DEBUG] Error details:', {
              name: error.name,
              message: error.message,
              code: error.code,
              stack: error.stack
            });
          }
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
          if (debugMode) {
            logger.error('[DEBUG] Unhandled init error:', err);
          }
          setInitError(err);
        }
      });
    } else {
      safeLog('log', '⏳ Waiting for fonts to load...');
    }
    
    return () => {
      mounted = false;
    };
  }, [fontsLoaded, debugMode, isLoginPath]);

  // Debug: Log render - Skip for login route
  React.useEffect(() => {
    if (isLoginPath) return;
    
    if (fontsLoaded) {
      safeLog('log', '🎨 App rendered, fonts loaded:', fontsLoaded);
      if (debugMode) {
        const root = document.getElementById('root');
        logger.debug('[DEBUG] Root element:', root);
        logger.debug('[DEBUG] Root children:', root?.children.length || 0);
        logger.debug('[DEBUG] Window size:', {
          width: window.innerWidth,
          height: window.innerHeight
        });
        logger.debug('[DEBUG] React render count:', performance.now());
      }
    }
  }, [fontsLoaded, debugMode, isLoginPath]);

  // Frame = window size. Insets from env(safe-area-inset-*) so PWA on iPhone gets notch/home-indicator padding.
  const initialMetrics = React.useMemo(() => {
    if (typeof window === 'undefined' || !window.document) {
      return {
        frame: { x: 0, y: 0, width: 375, height: 667 },
        insets: { top: 0, left: 0, right: 0, bottom: 0 },
      };
    }
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
      top = parse(s.paddingTop); bottom = parse(s.paddingBottom);
      left = parse(s.paddingLeft); right = parse(s.paddingRight);
      window.document.body.removeChild(el);
    } catch (_) {}
    return { frame: { x: 0, y: 0, width, height }, insets: { top, left, right, bottom } };
  }, []);

  // Ensure critical components are loaded before rendering main app
  if (!ErrorBoundary || !VideoProvider || !WebAppNavigator || !StatusBar) {
    logger.debug('[APP] ⚠️ Some components not loaded, attempting synchronous load...');
    try {
      if (!ErrorBoundary) ErrorBoundary = require('./components/ErrorBoundary').default;
      if (!VideoProvider) VideoProvider = require('./contexts/VideoContext').VideoProvider;
      if (!WebAppNavigator) WebAppNavigator = require('./navigation/WebAppNavigator').default;
      if (!StatusBar) StatusBar = require('expo-status-bar').StatusBar;
      if (!auth) auth = require('./config/firebase').auth;
      if (!logger) logger = require('./utils/logger').default;
      if (!webStorageService) webStorageService = require('./services/webStorageService').default;
      logger.debug('[APP] ✅ Synchronous load successful');
    } catch (syncError) {
      logger.error('[APP] ❌ Synchronous load failed:', syncError);
    }
  }

  // Single BrowserRouter at root so useNavigate() always has context (fixes LoginScreen error)
  const loadingMarkup = (
    <div style={{
      minHeight: '100dvh',
      backgroundColor: '#1a1a1a',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: '#ffffff',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "Roboto", sans-serif'
    }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{
          width: '40px',
          height: '40px',
          border: '3px solid rgba(191, 168, 77, 0.3)',
          borderTopColor: 'rgba(191, 168, 77, 1)',
          borderRadius: '50%',
          animation: 'spin 0.8s linear infinite',
          margin: '0 auto 20px'
        }}></div>
        <p>Cargando...</p>
      </div>
      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );

  const hasCritical = !!(ErrorBoundary && VideoProvider && WebAppNavigator);
  if (typeof window !== 'undefined') {
    const branch =
      isLoginPath ? 'login' :
      !componentsLoaded || !fontsLoaded ? 'loading' :
      initError && initError.message?.includes('critical') ? 'initError' :
      !hasCritical ? 'criticalComponentsMissing' : 'main';
    console.log('[APP WEB] Content branch:', branch, {
      isLoginPath,
      componentsLoaded,
      fontsLoaded,
      initError: initError ? initError.message : null,
      hasErrorBoundary: !!ErrorBoundary,
      hasVideoProvider: !!VideoProvider,
      hasWebAppNavigator: !!WebAppNavigator,
      pathname: window.location.pathname,
    });
  }

  // Single AuthProvider for entire app so auth state persists when navigating from /login to /
  // (Previously two providers caused the main app to see user=null after redirect and bounce back to login.)
  let content;
  if (isLoginPath) {
    logger.debug('[APP] Login route - rendering LoginScreen');
    content = <LoginScreen />;
  } else if (!componentsLoaded || !fontsLoaded) {
    logger.debug('[APP] Showing loading screen - componentsLoaded:', componentsLoaded, 'fontsLoaded:', fontsLoaded);
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
    logger.error('[APP] ❌ Critical components failed to load');
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

  if (typeof window !== 'undefined') {
    console.log('[APP WEB] Rendering BrowserRouter + AuthProvider + content');
  }

  return (
    <BrowserRouter
      future={{
        v7_startTransition: true,
        v7_relativeSplatPath: true,
      }}
    >
      <SafeAreaProvider initialMetrics={initialMetrics}>
        <AuthProvider>
          {content}
        </AuthProvider>
      </SafeAreaProvider>
    </BrowserRouter>
  );
}
