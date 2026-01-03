// Web wrapper for LoginScreen - provides React Router navigation
import React, { useEffect } from 'react';
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
  
  // Redirect to home if already logged in
  useEffect(() => {
    // Check both AuthContext user and Firebase currentUser
    const currentUser = user || auth.currentUser;
    if (!loading && currentUser) {
      console.log('[LOGIN SCREEN WEB] User already logged in, redirecting to home');
      navigate('/', { replace: true });
    }
  }, [user, loading, navigate]);

  // Also check periodically for user after login (in case AuthContext is slow to update)
  useEffect(() => {
    if (!loading && !user) {
      // Check Firebase directly every 100ms for up to 2 seconds after login
      let attempts = 0;
      const maxAttempts = 20; // 2 seconds total
      const checkInterval = setInterval(() => {
        attempts++;
        const currentUser = auth.currentUser;
        if (currentUser) {
          console.log('[LOGIN SCREEN WEB] Found user via periodic check, redirecting');
          navigate('/', { replace: true });
          clearInterval(checkInterval);
        } else if (attempts >= maxAttempts) {
          clearInterval(checkInterval);
        }
      }, 100);

      return () => clearInterval(checkInterval);
    }
  }, [loading, user, navigate]);

  // Create navigation adapter that matches React Navigation API
  const navigation = {
    replace: (routeName) => {
      // Map React Navigation routes to React Router paths
      const routeMap = {
        'MainApp': '/',
        'Home': '/',
      };

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
  };

  // LoginScreen.js uses React Native components which work on web via react-native-web
  // We just need to provide the navigation prop
  return <LoginScreenBase navigation={navigation} />;
};

export default LoginScreen;

