import React, { createContext, useContext, useEffect, useState, useRef, useMemo, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { auth } from '../config/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import apiClient from '../utils/apiClient';
import { queryKeys } from '../config/queryClient';
import { ASSET_BASE } from '../config/assets';
import './AuthContext.css';

const SHIMMER_DURATION = 2700;
const SHIMMER_KEY_TIME = 0.72;

function WakeLoader({ size = 100 }) {
  const containerRef = useRef(null);
  const gradId = 'auth-shimmer-grad';
  const maskId = 'auth-shimmer-mask';
  const logoSrc = `${ASSET_BASE}wake-isotipo-negativo.png`;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const grad = container.querySelector(`#${gradId}`);
    if (!grad) return;

    let rafId = null;
    const start = performance.now();
    const tick = () => {
      const elapsed = (performance.now() - start) % SHIMMER_DURATION;
      const t = elapsed / SHIMMER_DURATION;
      const x = t <= SHIMMER_KEY_TIME ? -30 + (140 * t) / SHIMMER_KEY_TIME : -30;
      grad.setAttribute('gradientTransform', `translate(${x}, 0)`);
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, []);

  return (
    <div ref={containerRef} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <svg width={size} height={size} viewBox="0 0 80 80">
        <defs>
          <mask id={maskId}>
            <image href={logoSrc} x="0" y="0" width="80" height="80" />
          </mask>
          <linearGradient id={gradId} gradientUnits="userSpaceOnUse" x1="-20" y1="0" x2="20" y2="0" gradientTransform="translate(-30, 0)">
            <stop offset="0%" stopColor="white" stopOpacity="0" />
            <stop offset="50%" stopColor="white" stopOpacity="1" />
            <stop offset="100%" stopColor="white" stopOpacity="0" />
          </linearGradient>
        </defs>
        <image href={logoSrc} x="0" y="0" width="80" height="80" opacity="0.2" />
        <rect x="0" y="0" width="80" height="80" fill={`url(#${gradId})`} mask={`url(#${maskId})`} />
      </svg>
    </div>
  );
}

const AuthContext = createContext({});

export const useAuth = () => {
  return useContext(AuthContext);
};

export { AuthContext };

export const AuthProvider = ({ children }) => {
  const queryClient = useQueryClient();
  const [user, setUser] = useState(null);
  const [userRole, setUserRole] = useState(null);
  const [webOnboardingCompleted, setWebOnboardingCompleted] = useState(null);
  const [profileCompleted, setProfileCompleted] = useState(null);
  const [onboardingCompleted, setOnboardingCompleted] = useState(null);
  const [bibliotecaGuideCompleted, setBibliotecaGuideCompleted] = useState(null);
  const [loading, setLoading] = useState(true);
  const [authenticating, setAuthenticating] = useState(false);

  const [authError, setAuthError] = useState(null);

  const fetchUserData = async (firebaseUser) => {
      setAuthError(null);
      if (firebaseUser) {
        try {
          const { data } = await apiClient.get('/users/me');
          // Seed React Query cache so DashboardLayout and other consumers don't re-fetch
          queryClient.setQueryData(queryKeys.user.detail(firebaseUser.uid), data);
          setUserRole(data.role || 'user');
          setWebOnboardingCompleted(data.webOnboardingCompleted ?? false);
          setProfileCompleted(data.profileCompleted ?? false);
          setOnboardingCompleted(data.onboardingCompleted ?? false);
          setBibliotecaGuideCompleted(data.bibliotecaGuideCompleted ?? false);
        } catch (error) {
          console.error('[AuthContext] Error fetching user data:', error);
          const message = error?.status === 0
            ? 'No se pudo conectar con el servidor'
            : error?.message || 'Error al cargar datos del usuario';
          setAuthError(message);
          setUserRole('user');
          setWebOnboardingCompleted(false);
          setProfileCompleted(false);
          setOnboardingCompleted(false);
          setBibliotecaGuideCompleted(false);
        }
      } else {
        setUserRole(null);
        setWebOnboardingCompleted(null);
        setProfileCompleted(null);
        setOnboardingCompleted(null);
        setBibliotecaGuideCompleted(null);
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

  const refreshUserData = useCallback(async () => {
    const currentUser = auth.currentUser;
    if (currentUser) {
      await fetchUserData(currentUser);
    }
  }, []);

  const isCreatorValue = userRole === 'creator' || userRole === 'admin';
  const isAdminValue = userRole === 'admin';

  const value = useMemo(() => ({
    user,
    userRole,
    loading,
    authenticating,
    webOnboardingCompleted,
    profileCompleted,
    onboardingCompleted,
    bibliotecaGuideCompleted,
    isCreator: isCreatorValue,
    isAdmin: isAdminValue,
    authError,
    refreshUserData
  }), [user, userRole, loading, authenticating, webOnboardingCompleted,
       profileCompleted, onboardingCompleted, bibliotecaGuideCompleted,
       isCreatorValue, isAdminValue, authError, refreshUserData]);

  return (
    <AuthContext.Provider value={value}>
      {loading ? (
        <div className="auth-loading">
          <div className="auth-loading__orb auth-loading__orb--1" />
          <div className="auth-loading__orb auth-loading__orb--2" />
          <div className="auth-loading__orb auth-loading__orb--3" />
          <div className="auth-loading__logo-wrap">
            <WakeLoader size={100} />
          </div>
        </div>
      ) : (
        children
      )}
    </AuthContext.Provider>
  );
};

