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
    logger.debug('[LOGIN SCREEN WEB] useEffect triggered', {
      hasRedirected: hasRedirectedRef.current,
      hasUser: !!user,
      hasFirebaseUser: !!auth.currentUser,
      loading,
      userId: user?.uid || auth.currentUser?.uid
    });
    
    if (hasRedirectedRef.current) {
      logger.debug('[LOGIN SCREEN WEB] Already redirected, skipping');
      return; // Already redirected, skip
    }
    
    // Check both AuthContext user and Firebase currentUser
    // Also check auth.currentUser directly as fallback (sometimes AuthContext updates slowly)
    const currentUser = user || auth.currentUser;
    
    if (!loading && currentUser) {
      logger.debug('[LOGIN SCREEN WEB] ✅ User authenticated, redirecting to home', {
        hasAuthContextUser: !!user,
        hasFirebaseUser: !!auth.currentUser,
        userId: currentUser?.uid
      });
      hasRedirectedRef.current = true; // Mark as redirected
      // Use setTimeout to ensure navigation happens after React state updates
      setTimeout(() => {
        logger.debug('[LOGIN SCREEN WEB] Executing navigate("/")');
        navigate('/', { replace: true });
      }, 100); // Small delay to ensure state is stable
    } else if (!loading && !currentUser) {
      // If loading is false but no user, check Firebase directly as fallback
      // This handles the case where AuthContext hasn't updated yet but Firebase has
      const firebaseUser = auth.currentUser;
      if (firebaseUser) {
        logger.debug('[LOGIN SCREEN WEB] Found Firebase user but AuthContext not updated yet, redirecting anyway');
        hasRedirectedRef.current = true;
        setTimeout(() => {
          logger.debug('[LOGIN SCREEN WEB] Executing navigate("/") from Firebase fallback');
          navigate('/', { replace: true });
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
          logger.debug('[LOGIN SCREEN WEB] Polling found user, redirecting');
          hasRedirectedRef.current = true;
          clearInterval(pollInterval);
          navigate('/', { replace: true });
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

      // Always try to navigate if route is mapped
      const performNavigation = () => {
        if (routeMap[routeName]) {
          logger.debug('[LOGIN SCREEN WEB] ✅ Navigating to:', routeMap[routeName]);
          hasRedirectedRef.current = true; // Set flag before navigation
          try {
            navigate(routeMap[routeName], { replace: true });
            logger.debug('[LOGIN SCREEN WEB] ✅ Navigate call completed');
          } catch (navError) {
            logger.error('[LOGIN SCREEN WEB] ❌ Navigation error:', navError);
            hasRedirectedRef.current = false; // Reset flag on error
          }
        } else {
          // Fallback: try to construct path from route name
          const path = `/${routeName.toLowerCase()}`;
          logger.debug('[LOGIN SCREEN WEB] Navigating to fallback path:', path);
          hasRedirectedRef.current = true;
          try {
            navigate(path, { replace: true });
          } catch (navError) {
            logger.error('[LOGIN SCREEN WEB] ❌ Navigation error:', navError);
            hasRedirectedRef.current = false;
          }
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

