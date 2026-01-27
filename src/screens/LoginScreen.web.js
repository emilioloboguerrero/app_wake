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

const LoginScreen = () => {
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const hasRedirectedRef = useRef(false); // Prevent multiple redirects

  // Redirect to home if already logged in
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
      logger.log('[LOGIN SCREEN WEB] BREAKPOINT: User authenticated, will redirect. uid:', uid, 'redirectTarget: / (AuthLayout will send to /onboarding if new user)');
      hasRedirectedRef.current = true; // Mark as redirected
      // Force full reload to / so App.web.js re-renders with main app (reliable fix for "sometimes doesn't navigate")
      setTimeout(() => {
        logger.log('[LOGIN SCREEN WEB] BREAKPOINT: Executing window.location.replace("/"). uid:', uid);
        window.location.replace('/');
      }, 100); // Small delay to ensure state is stable
    } else if (!loading && !currentUser) {
      // If loading is false but no user, check Firebase directly as fallback
      // This handles the case where AuthContext hasn't updated yet but Firebase has
      const firebaseUser = auth.currentUser;
      if (firebaseUser) {
        const uid = firebaseUser.uid;
        logger.log('[LOGIN SCREEN WEB] BREAKPOINT: Firebase user but AuthContext not updated, redirecting. uid:', uid);
        hasRedirectedRef.current = true;
        setTimeout(() => {
          logger.log('[LOGIN SCREEN WEB] BREAKPOINT: Executing window.location.replace("/") from Firebase fallback. uid:', uid);
          window.location.replace('/');
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
    
    // If we don't have user from AuthContext but Firebase has one, wait a bit then redirect
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
          window.location.replace('/');
        }
      }, 100); // Check every 100ms
      
      // Stop polling after 3 seconds (AuthContext should have updated by then)
      setTimeout(() => {
        clearInterval(pollInterval);
      }, 3000);
      
      return () => clearInterval(pollInterval);
    }
  }, [user, loading, navigate]);

  // Create MEMOIZED navigation adapter that matches React Navigation API
  // This prevents recreation on every render which was causing the infinite loop
  const navigation = useMemo(() => ({
    replace: (routeName) => {
      // Get fresh values at call time, not from closure
      const currentUser = user || auth.currentUser;
      logger.debug('[LOGIN SCREEN WEB] Navigation adapter replace called:', routeName, {
        hasRedirected: hasRedirectedRef.current,
        hasUser: !!user,
        hasFirebaseUser: !!auth.currentUser,
        loading,
        currentUserId: currentUser?.uid
      });
      
      // Map React Navigation routes to React Router paths
      const routeMap = {
        'MainApp': '/',
        'Home': '/',
      };

      // Always try to navigate if route is mapped. Use full reload so App.web.js switches to main app reliably.
      const performNavigation = () => {
        if (routeMap[routeName]) {
          const path = routeMap[routeName];
          logger.debug('[LOGIN SCREEN WEB] ✅ Reloading to:', path);
          hasRedirectedRef.current = true;
          window.location.replace(path);
        } else {
          // Fallback: try to construct path from route name
          const path = `/${routeName.toLowerCase()}`;
          logger.debug('[LOGIN SCREEN WEB] Reloading to fallback path:', path);
          hasRedirectedRef.current = true;
          window.location.replace(path);
        }
      };
      
      // Always try to navigate if we have a user (from AuthContext or Firebase)
      // Don't wait for loading to be false - if we have a user, navigate
      if (currentUser) {
        logger.debug('[LOGIN SCREEN WEB] ✅ User available, performing navigation immediately');
        performNavigation();
      } else {
        logger.debug('[LOGIN SCREEN WEB] ⏳ No user available yet, will redirect when AuthContext updates');
      }
    },
    navigate: (routeName, params) => {
      const routeMap = {
        'MainApp': '/',
        'Home': '/',
      };

      if (routeMap[routeName]) {
        navigate(routeMap[routeName]);
      } else {
        const path = `/${routeName.toLowerCase()}`;
        navigate(path, { state: params });
      }
    }
  }), [navigate, user, loading]); // Include user and loading in dependencies

  // LoginScreen.js uses React Native components which work on web via react-native-web
  // We just need to provide the navigation prop
  return <LoginScreenBase navigation={navigation} />;
};

export default LoginScreen;

