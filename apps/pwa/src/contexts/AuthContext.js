import React, { createContext, useContext, useEffect, useState } from 'react';
import { auth } from '../config/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import logger from '../utils/logger';
import { isSafariWeb } from '../utils/platform';

const AuthContext = createContext({});

export const useAuth = () => {
  return useContext(AuthContext);
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [initialized, setInitialized] = useState(false);
  const renderCountRef = React.useRef(0);

  // Freeze detection - DISABLED: Running on every render could cause performance issues
  // React.useEffect(() => {
  //   renderCountRef.current += 1;
  //   if (renderCountRef.current > 10) {
  //     logger.error(`❌ [FREEZE DETECTOR] AuthProvider rendered ${renderCountRef.current} times - INFINITE LOOP!`);
  //   }
  // });

  useEffect(() => {
    if (initialized) return; // Prevent multiple initializations
    
    const safari = isSafariWeb();
    logger.prod('AUTH init', { safari, fallbackMs: safari ? 3000 : 10000 });
    logger.debug('[WAKE] 🔐 ========================================');
    logger.debug('[WAKE] 🔐 AuthProvider: Setting up auth listener');
    logger.debug('[WAKE] 🔐 ========================================');
    setInitialized(true);
    
    let unsubscribe;
    let isMounted = true;
    
    // CRITICAL: Check currentUser IMMEDIATELY before setting up listener
    // This helps us see if IndexedDB has restored auth state
    const immediateCheck = auth.currentUser;
    logger.prod('AUTH immediate auth.currentUser', immediateCheck ? immediateCheck.uid : null);
    logger.debug('[WAKE] 🔐 [IMMEDIATE CHECK] auth.currentUser:', immediateCheck ? `User: ${immediateCheck.uid}` : 'null');
    logger.debug('[WAKE] 🔐 [IMMEDIATE CHECK] auth.currentUser?.email:', immediateCheck?.email || 'N/A');
    
    // CRITICAL: Set up onAuthStateChanged listener FIRST
    // This listener fires immediately with the current user if one exists (after IndexedDB restore)
    // It also fires whenever auth state changes in the future
    logger.debug('[WAKE] 🔐 Setting up onAuthStateChanged listener...');
    
    // Set up the listener - this will fire immediately if user exists after IndexedDB restore
    // Use a ref to track if we've received the initial auth state
    let initialAuthStateReceived = false;
    
    unsubscribe = onAuthStateChanged(auth, (user) => {
      const isInitialState = !initialAuthStateReceived;
      initialAuthStateReceived = true;
      
      logger.prod('AUTH onAuthStateChanged', isInitialState ? 'INITIAL' : 'SUBSEQUENT', user ? user.uid : null);
      logger.debug(`[WAKE] 🔐 [onAuthStateChanged] ${isInitialState ? 'INITIAL' : 'SUBSEQUENT'} Fired! User:`, user ? `User: ${user.uid}, Email: ${user.email}` : 'null');
      
      if (isMounted) {
        setUser(user);
        setLoading(false);
        logger.debug('[WAKE] 🔐 [onAuthStateChanged] ✅ AuthContext updated, loading set to false', {
          userId: user?.uid,
          email: user?.email
        });
      } else {
        logger.debug('[WAKE] 🔐 [onAuthStateChanged] Component unmounted, but updating anyway (auth state is critical)');
        // Even if unmounted, update state - auth state is critical
        setUser(user);
        setLoading(false);
      }
    }, (error) => {
      logger.prod('AUTH onAuthStateChanged ERROR', String(error?.message || error));
      logger.error('[WAKE] 🔐 [onAuthStateChanged] ❌ Error in auth state listener:', error);
      if (isMounted) {
        setLoading(false);
      }
    });
    logger.debug('[WAKE] 🔐 onAuthStateChanged listener set up successfully');
    
    // CRITICAL: Also check currentUser after delays to catch IndexedDB restore
    // Sometimes onAuthStateChanged doesn't fire immediately on page reload
    // This ensures we catch the restored user even if the listener hasn't fired yet
    // Use multiple checks at different intervals to catch IndexedDB restore
    // Store all timeout IDs for cleanup
    const timeoutIds = [];
    
    const checkAfterDelay = (delay, label) => {
      const timeoutId = setTimeout(() => {
        // Check if component is still mounted before updating state
        if (!isMounted) {
          logger.debug(`[WAKE] 🔐 [DELAY CHECK ${label}] Component unmounted, skipping state update`);
          return;
        }
        
        try {
          const currentUser = auth.currentUser;
          logger.debug(`[WAKE] 🔐 [DELAY CHECK ${label}] auth.currentUser after ${delay}ms:`, currentUser ? `User: ${currentUser.uid}, Email: ${currentUser.email}` : 'null');
          
          if (currentUser) {
            logger.prod('AUTH delay check', label, 'user', currentUser.uid);
            logger.debug(`[WAKE] 🔐 [DELAY CHECK ${label}] ✅ Found user after delay check (IndexedDB restored)`);
            // Update state only if still mounted
            if (isMounted) {
              setUser(currentUser);
              setLoading(false);
              logger.debug(`[WAKE] 🔐 [DELAY CHECK ${label}] ✅ AuthContext initialized with restored user from IndexedDB`);
            }
          } else {
            if (delay >= 1000) logger.prod('AUTH delay check', label, 'no user');
            logger.debug(`[WAKE] 🔐 [DELAY CHECK ${label}] ❌ No user found after delay check`);
            // Only set loading to false on later checks to avoid premature state updates
            if (delay >= 1000 && isMounted) {
              setLoading(false);
              logger.debug(`[WAKE] 🔐 [DELAY CHECK ${label}] Set loading to false (no user)`);
            }
          }
        } catch (error) {
          logger.prod('AUTH delay check ERROR', label, String(error?.message || error));
          logger.error(`[WAKE] 🔐 [DELAY CHECK ${label}] ❌ Error in delay check:`, error);
          if (delay >= 1000 && isMounted) {
            setLoading(false);
          }
        }
      }, delay);
      
      // Store timeout ID for cleanup
      timeoutIds.push(timeoutId);
      return timeoutId;
    };
    
    // Start multiple delay checks at different intervals
    // IndexedDB restore can take varying amounts of time
    checkAfterDelay(100, '100ms');
    checkAfterDelay(300, '300ms');
    checkAfterDelay(500, '500ms');
    checkAfterDelay(1000, '1s');
    checkAfterDelay(2000, '2s');
    
    // Safari workaround: Firebase Auth + IndexedDB persistence often never fires onAuthStateChanged
    // in Safari (desktop/iOS). Use a shorter fallback so users see login instead of infinite loading.
    const fallbackMs = isSafariWeb() ? 3000 : 10000;
    const timeout = setTimeout(() => {
      if (isMounted && loading) {
        logger.prod('AUTH TIMEOUT FALLBACK', fallbackMs + 'ms', 'Safari:', isSafariWeb());
        try {
          const currentUser = auth.currentUser;
          logger.prod('AUTH TIMEOUT FALLBACK currentUser', currentUser ? currentUser.uid : null);
          logger.debug(`[WAKE] 🔐 [TIMEOUT FALLBACK] Auth timeout (${fallbackMs}ms) - checking currentUser directly as fallback${isSafariWeb() ? ' [Safari]' : ''}`);
          setUser(currentUser);
          setLoading(false);
          logger.debug('[WAKE] 🔐 [TIMEOUT FALLBACK] ✅ Set user and loading to false');
        } catch (error) {
          logger.prod('AUTH TIMEOUT FALLBACK ERROR', String(error?.message || error));
          logger.error('[WAKE] 🔐 [TIMEOUT FALLBACK] ❌ Error in timeout fallback:', error);
          setLoading(false);
        }
      } else {
        logger.prod('AUTH TIMEOUT FALLBACK skipped', 'isMounted:', isMounted, 'loading:', loading);
      }
    }, fallbackMs);

    return () => {
      isMounted = false;
      // Clear all timeout IDs from delay checks
      timeoutIds.forEach(timeoutId => {
        clearTimeout(timeoutId);
      });
      // Clear the fallback timeout
      clearTimeout(timeout);
      // Unsubscribe from auth state listener
      if (unsubscribe) {
        unsubscribe();
      }
      logger.debug('[WAKE] 🔐 AuthProvider cleanup: All timers cleared and listener unsubscribed');
    };
  }, [initialized]); // Only depend on initialized, not loading (loading changes would cause re-runs)
  
  // Additional safety: If we have a user but loading is still true after 2 seconds, force it to false
  React.useEffect(() => {
    if (user && loading) {
      const safetyTimeout = setTimeout(() => {
        logger.debug('[WAKE] 🔐 Safety timeout: User exists but loading is true, forcing loading to false');
        setLoading(false);
      }, 2000);
      return () => clearTimeout(safetyTimeout);
    }
  }, [user, loading]);

  const value = React.useMemo(() => ({
    user,
    loading
  }), [user, loading]);

  // Always render children, but show loading state if needed
  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};
