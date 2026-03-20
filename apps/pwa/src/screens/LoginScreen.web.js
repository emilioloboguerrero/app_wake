// Web wrapper for LoginScreen - provides React Router navigation
import React, { useEffect, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { auth } from '../config/firebase';
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
    if (hasRedirectedRef.current) return;

    const currentUser = user || auth.currentUser;

    if (!loading && currentUser) {
      hasRedirectedRef.current = true;
      setTimeout(() => {
        window.location.replace(appHomePath);
      }, 100);
    } else if (!loading && !currentUser) {
      const firebaseUser = auth.currentUser;
      if (firebaseUser) {
        hasRedirectedRef.current = true;
        setTimeout(() => {
          window.location.replace(appHomePath);
        }, 100);
      }
    }
  }, [user, loading, navigate]);
  
  // Additional fallback: Poll for user if AuthContext is slow to update
  useEffect(() => {
    if (hasRedirectedRef.current) return;
    if (loading) return; // Still loading, wait
    
    if (!user && auth.currentUser) {
      const pollInterval = setInterval(() => {
        if (hasRedirectedRef.current) {
          clearInterval(pollInterval);
          return;
        }

        const firebaseUser = auth.currentUser;
        if (firebaseUser && !loading) {
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

      const routeMap = {
        'MainApp': appHomePath,
        'Home': appHomePath,
      };

      const performNavigation = () => {
        if (routeMap[routeName]) {
          const path = routeMap[routeName];
          hasRedirectedRef.current = true;
          window.location.replace(path);
        } else {
          const path = webBasePath ? webBasePath.replace(/\/$/, '') + '/' + routeName.toLowerCase() : '/' + routeName.toLowerCase();
          hasRedirectedRef.current = true;
          window.location.replace(path);
        }
      };

      if (currentUser) {
        performNavigation();
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

