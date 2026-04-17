import React, { createContext, useContext, useEffect, useState } from 'react';
import { auth } from '../config/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { isWeb } from '../utils/platform';

const AuthContext = createContext({});

export const useAuth = () => {
  return useContext(AuthContext);
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // onAuthStateChanged is the single source of truth.
    // It fires once Firebase restores persisted auth from IndexedDB — no
    // artificial timeouts that could resolve to null before restoration finishes.
    const unsubscribe = onAuthStateChanged(auth, (authUser) => {
      setUser(authUser);
      setLoading(false);
    }, () => {
      setUser(null);
      setLoading(false);
    });

    return () => unsubscribe();
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
