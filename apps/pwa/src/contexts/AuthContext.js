import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
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
  const resolvedRef = useRef(false);

  useEffect(() => {
    if (initialized) return;

    const safari = isSafariWeb();
    logger.prod('AUTH init', { safari, fallbackMs: safari ? 3000 : 10000 });
    setInitialized(true);
    resolvedRef.current = false;

    const resolve = (authUser) => {
      if (resolvedRef.current) return;
      resolvedRef.current = true;
      setUser(authUser);
      setLoading(false);
    };

    const unsubscribe = onAuthStateChanged(auth, (authUser) => {
      logger.prod('AUTH onAuthStateChanged', resolvedRef.current ? 'SUBSEQUENT' : 'INITIAL', authUser ? authUser.uid : null);
      resolve(authUser);
    }, (error) => {
      logger.prod('AUTH onAuthStateChanged ERROR', String(error?.message || error));
      resolve(null);
    });

    // Single fallback timeout — Safari IndexedDB can stall onAuthStateChanged
    const fallbackMs = safari ? 3000 : 10000;
    const timeout = setTimeout(() => {
      if (!resolvedRef.current) {
        logger.prod('AUTH TIMEOUT FALLBACK', fallbackMs + 'ms');
        const currentUser = auth.currentUser;
        logger.prod('AUTH TIMEOUT FALLBACK currentUser', currentUser ? currentUser.uid : null);
        resolve(currentUser);
      }
    }, fallbackMs);

    return () => {
      resolvedRef.current = true;
      clearTimeout(timeout);
      unsubscribe();
    };
  }, [initialized]);

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
