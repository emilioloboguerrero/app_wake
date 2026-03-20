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
    setInitialized(true);
    
    let unsubscribe;
    let isMounted = true;
    
    // CRITICAL: Check currentUser IMMEDIATELY before setting up listener
    // This helps us see if IndexedDB has restored auth state
    const immediateCheck = auth.currentUser;
    logger.prod('AUTH immediate auth.currentUser', immediateCheck ? immediateCheck.uid : null);
    
    // CRITICAL: Set up onAuthStateChanged listener FIRST
    // This listener fires immediately with the current user if one exists (after IndexedDB restore)
    // It also fires whenever auth state changes in the future
    // Set up the listener - this will fire immediately if user exists after IndexedDB restore
    // Use a ref to track if we've received the initial auth state
    let initialAuthStateReceived = false;
    
    unsubscribe = onAuthStateChanged(auth, (user) => {
      const isInitialState = !initialAuthStateReceived;
      initialAuthStateReceived = true;
      
      logger.prod('AUTH onAuthStateChanged', isInitialState ? 'INITIAL' : 'SUBSEQUENT', user ? user.uid : null);

      if (isMounted) {
        setUser(user);
        setLoading(false);
      } else {
        // Even if unmounted, update state - auth state is critical
        setUser(user);
        setLoading(false);
      }
    }, (error) => {
      logger.prod('AUTH onAuthStateChanged ERROR', String(error?.message || error));
      if (isMounted) {
        setLoading(false);
      }
    });
    // CRITICAL: Also check currentUser after delays to catch IndexedDB restore
    // Sometimes onAuthStateChanged doesn't fire immediately on page reload
    // This ensures we catch the restored user even if the listener hasn't fired yet
    // Use multiple checks at different intervals to catch IndexedDB restore
    // Store all timeout IDs for cleanup
    const timeoutIds = [];
    
    const checkAfterDelay = (delay, label) => {
      const timeoutId = setTimeout(() => {
        if (!isMounted) return;

        try {
          const currentUser = auth.currentUser;

          if (currentUser) {
            logger.prod('AUTH delay check', label, 'user', currentUser.uid);
            if (isMounted) {
              setUser(currentUser);
              setLoading(false);
            }
          } else {
            if (delay >= 1000) logger.prod('AUTH delay check', label, 'no user');
            if (delay >= 1000 && isMounted) {
              setLoading(false);
            }
          }
        } catch (error) {
          logger.prod('AUTH delay check ERROR', label, String(error?.message || error));
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
          setUser(currentUser);
          setLoading(false);
        } catch (error) {
          logger.prod('AUTH TIMEOUT FALLBACK ERROR', String(error?.message || error));
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
    };
  }, [initialized]); // Only depend on initialized, not loading (loading changes would cause re-runs)
  
  // Additional safety: If we have a user but loading is still true after 2 seconds, force it to false
  React.useEffect(() => {
    if (user && loading) {
      const safetyTimeout = setTimeout(() => {
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
