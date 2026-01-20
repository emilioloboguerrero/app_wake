// Web wrapper for LoginScreen - provides React Router navigation
import React, { useEffect, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { auth } from '../config/firebase';
// Import the base component - Metro should resolve LoginScreen.js (not .web.js) when we use explicit .js extension
// The metro.config.js is configured to prioritize .js over .web.js for explicit imports
const LoginScreenModule = require('./LoginScreen.js');
const LoginScreenBase = LoginScreenModule.LoginScreenBase || LoginScreenModule.default;

const LoginScreen = () => {
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const hasRedirectedRef = useRef(false); // Prevent multiple redirects
  
  // Redirect to home if already logged in (single check)
  useEffect(() => {
    if (hasRedirectedRef.current) return; // Already redirected, skip
    
    // Check both AuthContext user and Firebase currentUser
    const currentUser = user || auth.currentUser;
    if (!loading && currentUser) {
      console.log('[LOGIN SCREEN WEB] User already logged in, redirecting to home');
      hasRedirectedRef.current = true; // Mark as redirected
      navigate('/', { replace: true });
    }
  }, [user, loading, navigate]);

  // Create MEMOIZED navigation adapter that matches React Navigation API
  // This prevents recreation on every render which was causing the infinite loop
  const navigation = useMemo(() => ({
    replace: (routeName) => {
      if (hasRedirectedRef.current) return; // Prevent multiple redirects
      
      // Map React Navigation routes to React Router paths
      const routeMap = {
        'MainApp': '/',
        'Home': '/',
      };

      hasRedirectedRef.current = true;
      if (routeMap[routeName]) {
        navigate(routeMap[routeName], { replace: true });
      } else {
        // Fallback: try to construct path from route name
        const path = `/${routeName.toLowerCase()}`;
        navigate(path, { replace: true });
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
  }), [navigate]);

  // LoginScreen.js uses React Native components which work on web via react-native-web
  // We just need to provide the navigation prop
  return <LoginScreenBase navigation={navigation} />;
};

export default LoginScreen;

