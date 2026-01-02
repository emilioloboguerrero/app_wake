// TEST WebAppNavigator with minimal LoginScreen
import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import LoadingScreen from '../screens/LoadingScreen';
import LoginScreen from '../screens/LoginScreen.minimal'; // Use minimal version

// Layout component for authenticated routes
const AuthenticatedLayout = ({ children }) => {
  const { user, loading } = useAuth();
  
  if (loading) {
    return <LoadingScreen />;
  }
  
  if (!user) {
    return <Navigate to="/login" replace />;
  }
  
  return <>{children}</>;
};

// Main App Routes
const WebAppNavigator = () => {
  const { user, loading } = useAuth();
  
  console.log('[TEST NAV] WebAppNavigator render:', {
    user: user ? user.uid : 'null',
    loading,
    pathname: window.location.pathname
  });
  
  if (loading) {
    console.log('[TEST NAV] Showing LoadingScreen');
    return <LoadingScreen />;
  }
  
  console.log('[TEST NAV] Auth loaded, user:', user ? 'authenticated' : 'not authenticated');
  
  return (
    <Routes>
      {/* Public Routes */}
      <Route path="/login" element={!user ? <LoginScreen /> : <Navigate to="/" replace />} />
      
      {/* Catch all - redirect to login */}
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
};

export default WebAppNavigator;

