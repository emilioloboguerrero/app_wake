// TEST WebAppNavigator with test LoginScreen versions
import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import LoadingScreen from '../screens/LoadingScreen';
// Change this import to test different versions:
// import LoginScreen from '../screens/LoginScreen.test1'; // No inputs
// import LoginScreen from '../screens/LoginScreen.test2'; // Email only
// import LoginScreen from '../screens/LoginScreen.test3'; // Email + Password (freezes)
import LoginScreen from '../screens/LoginScreen.test3-fixed'; // Email + Password (FIXED)

import logger from '../utils/logger';

const WebAppNavigator = () => {
  const { user, loading } = useAuth();
  
  logger.log('[TEST NAV] WebAppNavigator render:', {
    user: user ? user.uid : 'null',
    loading,
    pathname: window.location.pathname
  });
  
  if (loading) {
    return <LoadingScreen />;
  }
  
  return (
    <Routes>
      <Route path="/login" element={!user ? <LoginScreen /> : <Navigate to="/" replace />} />
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
};

export default WebAppNavigator;

