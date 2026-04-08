import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
import { auth } from '../config/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { isSafariWeb, isWeb } from '../utils/platform';

const AuthContext = createContext({});

export const useAuth = () => {
  return useContext(AuthContext);
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const resolvedRef = useRef(false);

  useEffect(() => {
    const safari = isSafariWeb();
    resolvedRef.current = false;

    const resolve = (authUser) => {
      if (resolvedRef.current) return;
      resolvedRef.current = true;
      setUser(authUser);
      setLoading(false);
    };

    const unsubscribe = onAuthStateChanged(auth, (authUser) => {
      resolve(authUser);
    }, () => {
      resolve(null);
    });

    // Single fallback timeout — Safari IndexedDB can stall onAuthStateChanged
    const fallbackMs = safari ? 3000 : 10000;
    const timeout = setTimeout(() => {
      if (!resolvedRef.current) {
        resolve(auth.currentUser);
      }
    }, fallbackMs);

    return () => {
      clearTimeout(timeout);
      unsubscribe();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Initialize web push notifications on login (web only)
  useEffect(() => {
    if (!isWeb || !user?.uid) return;
    import('../services/notificationService.web.js').then((mod) => {
      mod.initializeNotifications(user.uid);
    }).catch(() => {});
  }, [user?.uid]);

  const value = React.useMemo(() => ({
    user,
    loading
  }), [user, loading]);

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};
