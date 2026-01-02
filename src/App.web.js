// Web-specific App entry point
import React from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import LoginScreen from './screens/LoginScreen.web';

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
    console.log('[APP] ✅ Using INLINED useMontserratFontsWeb (web version)');
  }
  
  // CRITICAL: Always call useState in the same order
  // This must be called unconditionally to maintain hook order
  const [fontsLoaded] = React.useState(true);
  return fontsLoaded;
};

// Verify this is the web version (safety check)
if (typeof window === 'undefined' || typeof document === 'undefined') {
  console.warn('[APP] WARNING: useMontserratFonts is being used in non-web environment!');
}

// Lazy load heavy components - will be loaded when needed
// This prevents loading them at module load time
let StatusBar, VideoProvider, WebAppNavigator, ErrorBoundary;
let auth, logger, webStorageService;

// Function to load heavy components (called when not on login route)
// Made async to prevent blocking the main thread
const loadHeavyComponents = async () => {
  if (!StatusBar) {
    console.log('[APP] Loading heavy components...');
    // Load components asynchronously to prevent blocking
    await new Promise(resolve => {
      requestAnimationFrame(() => {
        try {
          console.log('[APP] Loading StatusBar...');
          StatusBar = require('expo-status-bar').StatusBar;
          console.log('[APP] Loading VideoProvider...');
          VideoProvider = require('./contexts/VideoContext').VideoProvider;
          console.log('[APP] Loading WebAppNavigator...');
          WebAppNavigator = require('./navigation/WebAppNavigator').default;
          console.log('[APP] Loading ErrorBoundary...');
          ErrorBoundary = require('./components/ErrorBoundary').default;
          console.log('[APP] Loading auth, logger, webStorageService...');
          auth = require('./config/firebase').auth;
          logger = require('./utils/logger').default;
          webStorageService = require('./services/webStorageService').default;
          console.log('[APP] Loading global.css...');
          require('./styles/global.css');
          console.log('[APP] ✅ All heavy components loaded successfully');
        } catch (error) {
          console.error('[APP] ❌ Error loading heavy components:', error);
          // Don't throw - let the app continue with partial loading
        }
        resolve();
      });
    });
  } else {
    console.log('[APP] Heavy components already loaded');
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
  console.log('[APP] useMontserratFontsWeb called, fontsLoadedFromHook:', fontsLoadedFromHook);
  
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
            console.log('[APP] Service worker unregistered for login route');
          });
        });
      }
    } else {
      // Load heavy components for non-login routes
      console.log('[APP] Starting to load heavy components for non-login route...');
      loadHeavyComponents().then(() => {
        console.log('[APP] Heavy components loaded, setting componentsLoaded to true');
        setComponentsLoaded(true);
        
        // Initialize Service Worker AFTER components are loaded
        if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
          navigator.serviceWorker.register('/sw.js')
            .then((registration) => {
              safeLog('log', '✅ Service Worker registered:', registration);
            })
            .catch((error) => {
              safeLog('error', '❌ Service Worker registration failed:', error);
            });
        }
      }).catch((error) => {
        console.error('[APP] ❌ Error loading components:', error);
        console.log('[APP] Setting componentsLoaded to true anyway to continue...');
        setComponentsLoaded(true); // Continue anyway
      });
      
      // Fallback: if components don't load within 3 seconds, set to true anyway
      // Use a ref to track if we've already set it
      const timeoutId = setTimeout(() => {
        console.log('[APP] ⚠️ Components loading timeout (3s) - forcing componentsLoaded to true');
        setComponentsLoaded(true);
      }, 3000);
      
      // Cleanup timeout if component unmounts
      return () => {
        clearTimeout(timeoutId);
      };
    }
  }, [isLoginPath]);

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
          console.log('[DEBUG] Environment:', {
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
              console.error('[DEBUG] Storage error details:', error);
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
              console.log('[DEBUG] User details:', {
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
              console.error('[DEBUG] Auth error details:', authError);
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
            console.error('[DEBUG] Initialization error stack:', error.stack);
            console.error('[DEBUG] Error details:', {
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
            console.error('[DEBUG] Unhandled init error:', err);
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
        console.log('[DEBUG] Root element:', root);
        console.log('[DEBUG] Root children:', root?.children.length || 0);
        console.log('[DEBUG] Window size:', {
          width: window.innerWidth,
          height: window.innerHeight
        });
        console.log('[DEBUG] React render count:', performance.now());
      }
    }
  }, [fontsLoaded, debugMode, isLoginPath]);

  // Provide initial safe area metrics for web (required for react-native-safe-area-context on web)
  const initialMetrics = React.useMemo(() => ({
    frame: { x: 0, y: 0, width: 0, height: 0 },
    insets: { top: 0, left: 0, right: 0, bottom: 0 },
  }), []);

  // Conditional returns MUST come after all hooks
  // CRITICAL: For login route, render with BrowserRouter and AuthProvider only
  if (isLoginPath) {
    console.log('[APP] Login route - rendering LoginScreen with BrowserRouter and AuthProvider');
    return (
      <SafeAreaProvider initialMetrics={initialMetrics}>
        <BrowserRouter>
          <AuthProvider>
            <LoginScreen />
          </AuthProvider>
        </BrowserRouter>
      </SafeAreaProvider>
    );
  }

  // For non-login routes, check if components are loaded
  // Add logging to debug loading state
  // Note: fontsLoaded is now independent of componentsLoaded
  if (!componentsLoaded || !fontsLoaded) {
    console.log('[APP] Showing loading screen - componentsLoaded:', componentsLoaded, 'fontsLoaded:', fontsLoaded, 'isLoginPath:', isLoginPath);
    return (
      <div style={{
        minHeight: '100vh',
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
  }

  // Show error if initialization failed critically
  if (initError && initError.message?.includes('critical')) {
    return (
      <div style={{ padding: 20, color: 'white', backgroundColor: '#1a1a1a' }}>
        <h1>Error Loading App</h1>
        <p>{initError.message}</p>
        <button onClick={() => window.location.reload()}>Reload</button>
      </div>
    );
  }

  // Ensure critical components are loaded before rendering
  // If they're not loaded yet, try to load them synchronously
  if (!ErrorBoundary || !VideoProvider || !WebAppNavigator || !StatusBar) {
    console.log('[APP] ⚠️ Some components not loaded, attempting synchronous load...');
    try {
      if (!ErrorBoundary) ErrorBoundary = require('./components/ErrorBoundary').default;
      if (!VideoProvider) VideoProvider = require('./contexts/VideoContext').VideoProvider;
      if (!WebAppNavigator) WebAppNavigator = require('./navigation/WebAppNavigator').default;
      if (!StatusBar) StatusBar = require('expo-status-bar').StatusBar;
      if (!auth) auth = require('./config/firebase').auth;
      if (!logger) logger = require('./utils/logger').default;
      if (!webStorageService) webStorageService = require('./services/webStorageService').default;
      console.log('[APP] ✅ Synchronous load successful');
    } catch (syncError) {
      console.error('[APP] ❌ Synchronous load failed:', syncError);
      // Continue anyway - some components might still work
    }
  }

  // Final check - if still not loaded, show error instead of infinite loading
  if (!ErrorBoundary || !VideoProvider || !WebAppNavigator) {
    console.error('[APP] ❌ Critical components failed to load');
    return (
      <div style={{ padding: 20, color: 'white', backgroundColor: '#1a1a1a' }}>
        <h1>Error Loading App</h1>
        <p>Some components failed to load. Please refresh the page.</p>
        <button onClick={() => window.location.reload()}>Reload</button>
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <SafeAreaProvider initialMetrics={initialMetrics}>
        <BrowserRouter
          future={{
            v7_startTransition: true,
            v7_relativeSplatPath: true,
          }}
        >
          <AuthProvider>
            <VideoProvider>
              <WebAppNavigator />
              {StatusBar && <StatusBar style="light" />}
            </VideoProvider>
          </AuthProvider>
        </BrowserRouter>
      </SafeAreaProvider>
    </ErrorBoundary>
  );
}
