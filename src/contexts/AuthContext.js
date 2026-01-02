import React, { createContext, useContext, useEffect, useState } from 'react';
import { auth } from '../config/firebase';
import { onAuthStateChanged } from 'firebase/auth';

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
  //     console.error(`❌ [FREEZE DETECTOR] AuthProvider rendered ${renderCountRef.current} times - INFINITE LOOP!`);
  //   }
  // });

  useEffect(() => {
    if (initialized) return; // Prevent multiple initializations
    
    console.log('[WAKE] 🔐 ========================================');
    console.log('[WAKE] 🔐 AuthProvider: Setting up auth listener');
    console.log('[WAKE] 🔐 ========================================');
    setInitialized(true);
    
    let unsubscribe;
    let isMounted = true;
    
    // CRITICAL: Check currentUser IMMEDIATELY before setting up listener
    // This helps us see if IndexedDB has restored auth state
    const immediateCheck = auth.currentUser;
    console.log('[WAKE] 🔐 [IMMEDIATE CHECK] auth.currentUser:', immediateCheck ? `User: ${immediateCheck.uid}` : 'null');
    console.log('[WAKE] 🔐 [IMMEDIATE CHECK] auth.currentUser?.email:', immediateCheck?.email || 'N/A');
    
    // CRITICAL: Set up onAuthStateChanged listener FIRST
    // This listener fires immediately with the current user if one exists (after IndexedDB restore)
    // It also fires whenever auth state changes in the future
    console.log('[WAKE] 🔐 Setting up onAuthStateChanged listener...');
    
    // Set up the listener - this will fire immediately if user exists after IndexedDB restore
    // Use a ref to track if we've received the initial auth state
    let initialAuthStateReceived = false;
    
    unsubscribe = onAuthStateChanged(auth, (user) => {
      const isInitialState = !initialAuthStateReceived;
      initialAuthStateReceived = true;
      
      console.log(`[WAKE] 🔐 [onAuthStateChanged] ${isInitialState ? 'INITIAL' : 'SUBSEQUENT'} Fired! User:`, user ? `User: ${user.uid}, Email: ${user.email}` : 'null');
      
      if (isMounted) {
        setUser(user);
        setLoading(false);
        console.log('[WAKE] 🔐 [onAuthStateChanged] ✅ AuthContext updated, loading set to false');
      } else {
        console.log('[WAKE] 🔐 [onAuthStateChanged] Component unmounted, but updating anyway (auth state is critical)');
        // Even if unmounted, update state - auth state is critical
        setUser(user);
        setLoading(false);
      }
    }, (error) => {
      console.error('[WAKE] 🔐 [onAuthStateChanged] ❌ Error in auth state listener:', error);
      if (isMounted) {
        setLoading(false);
      }
    });
    console.log('[WAKE] 🔐 onAuthStateChanged listener set up successfully');
    
    // CRITICAL: Also check currentUser after delays to catch IndexedDB restore
    // Sometimes onAuthStateChanged doesn't fire immediately on page reload
    // This ensures we catch the restored user even if the listener hasn't fired yet
    // Use multiple checks at different intervals to catch IndexedDB restore
    const checkAfterDelay = (delay, label) => {
      setTimeout(() => {
        // Always check - auth state is critical, even if component appears unmounted
        // The component might be remounting, and we need to capture the user
        try {
          const currentUser = auth.currentUser;
          console.log(`[WAKE] 🔐 [DELAY CHECK ${label}] auth.currentUser after ${delay}ms:`, currentUser ? `User: ${currentUser.uid}, Email: ${currentUser.email}` : 'null');
          
          if (currentUser) {
            console.log(`[WAKE] 🔐 [DELAY CHECK ${label}] ✅ Found user after delay check (IndexedDB restored)`);
            // Always update if we have a currentUser - auth state is critical
            setUser(currentUser);
            setLoading(false);
            console.log(`[WAKE] 🔐 [DELAY CHECK ${label}] ✅ AuthContext initialized with restored user from IndexedDB`);
          } else {
            console.log(`[WAKE] 🔐 [DELAY CHECK ${label}] ❌ No user found after delay check`);
            // Only set loading to false on later checks to avoid premature state updates
            if (delay >= 1000) {
              setLoading(false);
              console.log(`[WAKE] 🔐 [DELAY CHECK ${label}] Set loading to false (no user)`);
            }
          }
        } catch (error) {
          console.error(`[WAKE] 🔐 [DELAY CHECK ${label}] ❌ Error in delay check:`, error);
          if (delay >= 1000) {
            setLoading(false);
          }
        }
      }, delay);
    };
    
    // Start multiple delay checks at different intervals
    // IndexedDB restore can take varying amounts of time
    checkAfterDelay(100, '100ms');
    checkAfterDelay(300, '300ms');
    checkAfterDelay(500, '500ms');
    checkAfterDelay(1000, '1s');
    checkAfterDelay(2000, '2s');
    
    // Fallback timeout - if auth state doesn't resolve in 10 seconds, check currentUser directly
    const timeout = setTimeout(() => {
      if (isMounted && loading) {
        console.log('[WAKE] 🔐 [TIMEOUT FALLBACK] Auth timeout (10s) - checking currentUser directly as fallback');
        try {
          const currentUser = auth.currentUser;
          console.log('[WAKE] 🔐 [TIMEOUT FALLBACK] currentUser:', currentUser ? `User: ${currentUser.uid}, Email: ${currentUser.email}` : 'No user');
          setUser(currentUser);
          setLoading(false);
          console.log('[WAKE] 🔐 [TIMEOUT FALLBACK] ✅ Set user and loading to false');
        } catch (error) {
          console.error('[WAKE] 🔐 [TIMEOUT FALLBACK] ❌ Error in timeout fallback:', error);
          setLoading(false);
        }
      } else {
        console.log('[WAKE] 🔐 [TIMEOUT FALLBACK] Skipped - not loading or unmounted');
      }
    }, 10000); // 10 seconds timeout

    return () => {
      isMounted = false;
      clearTimeout(timeout);
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, [initialized]); // Only depend on initialized, not loading (loading changes would cause re-runs)
  
  // Additional safety: If we have a user but loading is still true after 2 seconds, force it to false
  React.useEffect(() => {
    if (user && loading) {
      const safetyTimeout = setTimeout(() => {
        console.log('[WAKE] 🔐 Safety timeout: User exists but loading is true, forcing loading to false');
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
