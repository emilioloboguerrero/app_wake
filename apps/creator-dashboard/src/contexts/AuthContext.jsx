import React, { createContext, useContext, useEffect, useState } from 'react';
import { auth } from '../config/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import apiClient from '../utils/apiClient';
import { ASSET_BASE } from '../config/assets';
import './AuthContext.css';

const AuthContext = createContext({});

export const useAuth = () => {
  return useContext(AuthContext);
};

export { AuthContext };

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [userRole, setUserRole] = useState(null);
  const [webOnboardingCompleted, setWebOnboardingCompleted] = useState(null);
  const [profileCompleted, setProfileCompleted] = useState(null);
  const [onboardingCompleted, setOnboardingCompleted] = useState(null);
  const [loading, setLoading] = useState(true);
  const [authenticating, setAuthenticating] = useState(false);

  const fetchUserData = async (firebaseUser) => {
      if (firebaseUser) {
        try {
          const { data } = await apiClient.get('/users/me');
          setUserRole(data.role || 'user');
          setWebOnboardingCompleted(data.webOnboardingCompleted ?? false);
          setProfileCompleted(data.profileCompleted ?? false);
          setOnboardingCompleted(data.onboardingCompleted ?? false);
        } catch (error) {
          console.error('Error fetching user data:', error);
          setUserRole('user');
          setWebOnboardingCompleted(false);
          setProfileCompleted(false);
          setOnboardingCompleted(false);
        }
      } else {
        setUserRole(null);
        setWebOnboardingCompleted(null);
        setProfileCompleted(null);
        setOnboardingCompleted(null);
      }
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      if (firebaseUser) {
        setAuthenticating(true);
        await fetchUserData(firebaseUser);
        setAuthenticating(false);
      } else {
        await fetchUserData(null);
      }
      setLoading(false);
    });

    return unsubscribe;
  }, []);

  const refreshUserData = async () => {
    const currentUser = auth.currentUser;
    if (currentUser) {
      await fetchUserData(currentUser);
    }
  };

  const isCreatorValue = userRole === 'creator' || userRole === 'admin';
  const isAdminValue = userRole === 'admin';

  const value = {
    user,
    userRole,
    loading,
    authenticating,
    webOnboardingCompleted,
    profileCompleted,
    onboardingCompleted,
    isCreator: isCreatorValue,
    isAdmin: isAdminValue,
    refreshUserData
  };

  return (
    <AuthContext.Provider value={value}>
      {loading ? (
        <div className="auth-loading">
          <div className="auth-loading__logo-wrap">
            <img
              className="auth-loading__logo"
              src={`${ASSET_BASE}wake-logo-new.png`}
              alt="Wake"
            />
          </div>
          <div className="auth-loading__spinner" />
        </div>
      ) : (
        children
      )}
    </AuthContext.Provider>
  );
};

