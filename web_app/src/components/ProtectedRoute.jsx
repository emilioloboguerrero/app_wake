import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

const ProtectedRoute = ({ children, requireOnboarding = true, requireCreator = true }) => {
  const { user, userRole, loading, isCreator, webOnboardingCompleted } = useAuth();
  const location = useLocation();

  if (loading || (user && userRole === null)) {
    return (
      <div style={{ 
        minHeight: '100vh', 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center',
        backgroundColor: '#1a1a1a',
        color: '#ffffff'
      }}>
        Cargando...
      </div>
    );
  }

  if (!user) {
    // Preserve the current path as redirect parameter
    const redirectPath = location.pathname + location.search;
    return <Navigate to={`/login?redirect=${encodeURIComponent(redirectPath)}`} replace />;
  }

  // Check if user is creator or admin (only if requireCreator is true)
  // Wait for userRole to be loaded before making this check
  if (userRole !== null && requireCreator && !isCreator) {
    const currentPath = location.pathname;
    // Only redirect if we're not already on a user-accessible page
    if (currentPath !== '/user/biblioteca' && 
        currentPath !== '/login' && 
        currentPath !== '/profile' &&
        !currentPath.startsWith('/course/')) {
      console.log('🚫 ProtectedRoute: Non-creator user accessing creator route, redirecting', {
        userRole,
        currentPath,
        isCreator
      });
      return <Navigate to="/user/biblioteca" replace />;
    }
    // If already on a valid user page but route requires creator, don't render
    return null;
  }

  // Special handling for onboarding route
  if (location.pathname === '/onboarding') {
    // Only creators should access onboarding
    if (!isCreator) {
      if (location.pathname !== '/user/biblioteca') {
        return <Navigate to="/user/biblioteca" replace />;
      }
      return null;
    }
    // If onboarding is already completed, redirect to lab
    if (webOnboardingCompleted === true && location.pathname !== '/lab') {
      return <Navigate to="/lab" replace />;
    }
    return children;
  }

  // For other routes, check if onboarding is required and not completed
  if (requireOnboarding && webOnboardingCompleted === false && isCreator) {
    if (location.pathname !== '/onboarding') {
      return <Navigate to="/onboarding" replace />;
    }
  }

  return children;
};

export default ProtectedRoute;