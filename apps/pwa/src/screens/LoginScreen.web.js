// Web wrapper for LoginScreen - provides React Router navigation
import React, { useEffect, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { auth } from '../config/firebase';
import logger from '../utils/logger';
// Import the base component - Metro should resolve LoginScreen.js (not .web.js) when we use explicit .js extension
// The metro.config.js is configured to prioritize .js over .web.js for explicit imports
const LoginScreenModule = require('./LoginScreen.js');
const LoginScreenBase = LoginScreenModule.LoginScreenBase || LoginScreenModule.default;

// Derive from URL first (same as App.web.js) so reload at /app works without build env
const webBasePath =
  typeof window !== 'undefined' && (window.location.pathname === '/app' || window.location.pathname.startsWith('/app/'))
    ? '/app'
    : ((typeof process !== 'undefined' && process.env?.EXPO_PUBLIC_BASE_PATH) || '');
const appHomePath = webBasePath ? webBasePath.replace(/\/$/, '') + '/' : '/';

const LoginScreen = () => {
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const hasRedirectedRef = useRef(false); // Prevent multiple redirects

  // Redirect to home if already logged in (home = /app when deployed under /app)
  useEffect(() => {
    // Always log current state for debugging
    logger.log('[LOGIN SCREEN WEB] BREAKPOINT: useEffect triggered. uid:', user?.uid || auth.currentUser?.uid, {
      hasRedirected: hasRedirectedRef.current,
      hasUser: !!user,
      hasFirebaseUser: !!auth.currentUser,
      loading
    });
    
    if (hasRedirectedRef.current) {
      logger.debug('[LOGIN SCREEN WEB] Already redirected, skipping');
      return; // Already redirected, skip
    }
    
    // Check both AuthContext user and Firebase currentUser
    // Also check auth.currentUser directly as fallback (sometimes AuthContext updates slowly)
    const currentUser = user || auth.currentUser;
    
    if (!loading && currentUser) {
      const uid = currentUser?.uid;
      logger.log('[LOGIN SCREEN WEB] BREAKPOINT: User authenticated, will redirect. uid:', uid, 'redirectTarget:', appHomePath);
      hasRedirectedRef.current = true; // Mark as redirected
      setTimeout(() => {
        logger.log('[LOGIN SCREEN WEB] BREAKPOINT: Executing window.location.replace(appHomePath). uid:', uid);
        window.location.replace(appHomePath);
      }, 100); // Small delay to ensure state is stable
    } else if (!loading && !currentUser) {
      const firebaseUser = auth.currentUser;
      if (firebaseUser) {
        const uid = firebaseUser.uid;
        logger.log('[LOGIN SCREEN WEB] BREAKPOINT: Firebase user but AuthContext not updated, redirecting. uid:', uid);
        hasRedirectedRef.current = true;
        setTimeout(() => {
          logger.log('[LOGIN SCREEN WEB] BREAKPOINT: Executing window.location.replace from Firebase fallback. uid:', uid);
          window.location.replace(appHomePath);
        }, 100);
      } else {
        logger.debug('[LOGIN SCREEN WEB] No user found, waiting...', {
          loading,
          hasUser: !!user,
          hasFirebaseUser: !!auth.currentUser
        });
      }
    } else {
      logger.debug('[LOGIN SCREEN WEB] Still loading or no user yet', { loading, hasUser: !!currentUser });
    }
  }, [user, loading, navigate]);
  
  // Additional fallback: Poll for user if AuthContext is slow to update
  useEffect(() => {
    if (hasRedirectedRef.current) return;
    if (loading) return; // Still loading, wait
    
    if (!user && auth.currentUser) {
      logger.debug('[LOGIN SCREEN WEB] Firebase user exists but AuthContext not updated, polling...');
      const pollInterval = setInterval(() => {
        if (hasRedirectedRef.current) {
          clearInterval(pollInterval);
          return;
        }
        
        const firebaseUser = auth.currentUser;
        if (firebaseUser && !loading) {
          logger.log('[LOGIN SCREEN WEB] BREAKPOINT: Polling found user, redirecting. uid:', firebaseUser.uid);
          hasRedirectedRef.current = true;
          clearInterval(pollInterval);
          window.location.replace(appHomePath);
        }
      }, 100); // Check every 100ms
      
      setTimeout(() => {
        clearInterval(pollInterval);
      }, 3000);
      
      return () => clearInterval(pollInterval);
    }
  }, [user, loading, navigate]);

  // Create MEMOIZED navigation adapter that matches React Navigation API
  const navigation = useMemo(() => ({
    replace: (routeName) => {
      const currentUser = user || auth.currentUser;
      logger.debug('[LOGIN SCREEN WEB] Navigation adapter replace called:', routeName, {
        hasRedirected: hasRedirectedRef.current,
        hasUser: !!user,
        hasFirebaseUser: !!auth.currentUser,
        loading,
        currentUserId: currentUser?.uid
      });
      
      const routeMap = {
        'MainApp': appHomePath,
        'Home': appHomePath,
      };

      const performNavigation = () => {
        if (routeMap[routeName]) {
          const path = routeMap[routeName];
          logger.debug('[LOGIN SCREEN WEB] ✅ Reloading to:', path);
          hasRedirectedRef.current = true;
          window.location.replace(path);
        } else {
          const path = webBasePath ? webBasePath.replace(/\/$/, '') + '/' + routeName.toLowerCase() : '/' + routeName.toLowerCase();
          logger.debug('[LOGIN SCREEN WEB] Reloading to fallback path:', path);
          hasRedirectedRef.current = true;
          window.location.replace(path);
        }
      };
      
      if (currentUser) {
        logger.debug('[LOGIN SCREEN WEB] ✅ User available, performing navigation immediately');
        performNavigation();
      } else {
        logger.debug('[LOGIN SCREEN WEB] ⏳ No user available yet, will redirect when AuthContext updates');
      }
    },
    navigate: (routeName, params) => {
      // Router has basename=/app, so navigate('/') goes to /app; use '/' for in-app nav
      const routeMap = {
        'MainApp': '/',
        'Home': '/',
      };

      if (routeMap[routeName]) {
        navigate(routeMap[routeName]);
      } else {
        const path = '/' + routeName.toLowerCase();
        navigate(path, { state: params });
      }
    }
  }), [navigate, user, loading]); // Include user and loading in dependencies

  // LoginScreen.js uses React Native components which work on web via react-native-web
  // We just need to provide the navigation prop
  return <LoginScreenBase navigation={navigation} />;
};

export default LoginScreen;

