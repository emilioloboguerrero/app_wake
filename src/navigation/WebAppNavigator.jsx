// Web App Navigator - React Router based navigation for PWA
// SIMPLIFIED VERSION - Login route isolated
// LAZY LOADING: Heavy screens are loaded only when needed
import React, { lazy, Suspense } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { withErrorBoundary } from '../utils/withErrorBoundary';
import LoadingScreen from '../screens/LoadingScreen';
// Use mobile components with web wrappers
// These wrappers provide React Router navigation to the mobile components
import LoginScreen from '../screens/LoginScreen.web';
import MainScreen from '../screens/MainScreen.web';

// Lazy load heavy screens - only load when route is accessed
// Import ProfileScreen directly (not lazy) to avoid Metro bundler issues
// Use web wrapper for ProfileScreen to provide React Router navigation
import ProfileScreen from '../screens/ProfileScreen.web';
// Import AllPurchasedCoursesScreen directly (not lazy) to avoid hook order issues with fonts.js
import AllPurchasedCoursesScreen from '../screens/AllPurchasedCoursesScreen.web';
// Import SubscriptionsScreen directly - using require in web wrapper causes Metro issues with lazy loading
import SubscriptionsScreen from '../screens/SubscriptionsScreen.web';
// Import ProgramLibraryScreen directly (not lazy) - using web wrapper for React Router navigation
import ProgramLibraryScreen from '../screens/ProgramLibraryScreen.web';
// Lazy load workout-related screens with web wrappers for React Router navigation
const DailyWorkoutScreen = lazy(() => import('../screens/DailyWorkoutScreen.web'));
const WorkoutExecutionScreen = lazy(() => import('../screens/WorkoutExecutionScreen.web'));
const WorkoutCompletionScreen = lazy(() => import('../screens/WorkoutCompletionScreen.web'));
const WarmupScreen = lazy(() => import('../screens/WarmupScreen.web'));
const WorkoutExercisesScreen = lazy(() => import('../screens/WorkoutExercisesScreen.web'));
const CourseStructureScreen = lazy(() => import('../screens/CourseStructureScreen.web'));
// Import CourseDetailScreen directly using web wrapper for React Router navigation
import CourseDetailScreen from '../screens/CourseDetailScreen.web';
// Import CreatorProfileScreen directly using web wrapper for React Router navigation
import CreatorProfileScreen from '../screens/CreatorProfileScreen.web';
// Import screens with web wrappers directly to avoid Metro bundler issues
import SessionsScreen from '../screens/SessionsScreen.web';
import WeeklyVolumeHistoryScreen from '../screens/WeeklyVolumeHistoryScreen.web';
import PRsScreen from '../screens/PRsScreen.web';
import SessionDetailScreen from '../screens/SessionDetailScreen.web';
import PRDetailScreen from '../screens/PRDetailScreen.web';
// Test screen for debugging freeze issues
import TestScreen from '../screens/TestScreen.web';
// Simple button test screen for testing button responsiveness
import SimpleButtonTestScreen from '../screens/SimpleButtonTestScreen.web';
// AllPurchasedCoursesScreen is imported directly above (not lazy) to avoid hook order issues
const OnboardingScreen = lazy(() => import('../screens/OnboardingScreen'));

import firestoreService from '../services/firestoreService';
import webStorageService from '../services/webStorageService';
import logger from '../utils/logger';
import BottomTabBar from '../components/BottomTabBar.web';

// Layout component for authenticated routes
const AuthenticatedLayout = ({ children }) => {
  const { user, loading } = useAuth();
  const [userProfile, setUserProfile] = React.useState(null);
  const [profileLoading, setProfileLoading] = React.useState(false);
  const checkedUserIdRef = React.useRef(null);
  
  // Check Firebase user directly - this is the source of truth
  // Use useState to store Firebase user and update it when needed
  const [firebaseUser, setFirebaseUser] = React.useState(() => {
    try {
      const { auth } = require('../config/firebase');
      return auth.currentUser;
    } catch (error) {
      logger.error('[AUTH LAYOUT] Error getting Firebase user:', error);
      return null;
    }
  });
  
  // Track if we've already checked Firebase user to prevent infinite loops
  const firebaseUserCheckedRef = React.useRef(false);
  
  // Update firebaseUser once on mount and when user/auth state changes
  React.useEffect(() => {
    if (firebaseUserCheckedRef.current) return; // Only check once
    
    try {
      const { auth } = require('../config/firebase');
      const currentUser = auth.currentUser;
      if (currentUser && currentUser !== firebaseUser) {
        setFirebaseUser(currentUser);
        firebaseUserCheckedRef.current = true;
      } else if (!currentUser) {
        firebaseUserCheckedRef.current = true; // Mark as checked even if no user
      }
    } catch (error) {
      firebaseUserCheckedRef.current = true; // Mark as checked on error
    }
  }, []); // Only run once on mount
  
  // Re-check Firebase user periodically if AuthContext is still loading
  // But only if we don't have a user from context yet
  React.useEffect(() => {
    if (loading && !user && !firebaseUser) {
      // Only set up interval if we don't have a Firebase user yet
      const interval = setInterval(() => {
        try {
          const { auth } = require('../config/firebase');
          const currentUser = auth.currentUser;
          if (currentUser && currentUser !== firebaseUser) {
            logger.debug('[AUTH LAYOUT] Firebase user found but AuthContext still loading, updating firebaseUser');
            setFirebaseUser(currentUser);
            // Stop interval once we have a user
            clearInterval(interval);
          }
        } catch (error) {
          // Ignore errors
        }
      }, 1000); // Check every 1 second instead of 500ms
      
      // Stop interval after 5 seconds max
      const timeout = setTimeout(() => {
        clearInterval(interval);
      }, 5000);
      
      return () => {
        clearInterval(interval);
        clearTimeout(timeout);
      };
    }
  }, [loading, user, firebaseUser]);

  React.useEffect(() => {
    // Skip if already checked for this user
    if (user && checkedUserIdRef.current === user.uid) {
      return;
    }
    
    // Skip if no user and we've already cleared
    if (!user && checkedUserIdRef.current === null) {
      return;
    }
    
    let mounted = true;
    let timeoutId = null;
    
    const checkUserProfile = async () => {
      if (user && !loading) {
        setProfileLoading(true);
        checkedUserIdRef.current = user.uid;
        
        timeoutId = setTimeout(() => {
          if (mounted) {
            setUserProfile({ profileCompleted: false, onboardingCompleted: false });
            setProfileLoading(false);
          }
        }, 10000);
        
        try {
          const cached = await webStorageService.getItem(`onboarding_status_${user.uid}`);
          if (cached) {
            const status = JSON.parse(cached);
            const cacheAge = Date.now() - (status.cachedAt || 0);
            if (cacheAge < 5 * 60 * 1000) {
              if (mounted) {
                setUserProfile({
                  profileCompleted: status.profileCompleted ?? false,
                  onboardingCompleted: status.onboardingCompleted ?? false
                });
                setProfileLoading(false);
              }
              if (timeoutId) clearTimeout(timeoutId);
              return;
            }
          }
          
          const profilePromise = firestoreService.getUser(user.uid);
          const timeoutPromise = new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Firestore timeout')), 5000)
          );
          
          const profile = await Promise.race([profilePromise, timeoutPromise]);
          
          if (mounted) {
            if (profile) {
              setUserProfile(profile);
              webStorageService.setItem(`onboarding_status_${user.uid}`, JSON.stringify({
                onboardingCompleted: profile.onboardingCompleted ?? false,
                profileCompleted: profile.profileCompleted ?? false,
                cachedAt: Date.now()
              })).catch(() => {});
            } else {
              setUserProfile({ profileCompleted: false, onboardingCompleted: false });
            }
          }
        } catch (error) {
          if (mounted) {
            try {
              const cached = await webStorageService.getItem(`onboarding_status_${user.uid}`);
              if (cached) {
                const status = JSON.parse(cached);
                setUserProfile({
                  profileCompleted: status.profileCompleted ?? false,
                  onboardingCompleted: status.onboardingCompleted ?? false
                });
              } else {
                setUserProfile({ profileCompleted: false, onboardingCompleted: false });
              }
            } catch {
              setUserProfile({ profileCompleted: false, onboardingCompleted: false });
            }
          }
        } finally {
          if (mounted) {
            setProfileLoading(false);
          }
          if (timeoutId) clearTimeout(timeoutId);
        }
      } else if (!user && !loading) {
        setUserProfile(null);
        setProfileLoading(false);
        checkedUserIdRef.current = null;
      }
    };

    checkUserProfile();
    
    return () => {
      mounted = false;
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [user?.uid, loading]);

  // Determine if we have a user (from context or Firebase)
  // CRITICAL: If Firebase has a user, proceed even if AuthContext is still loading
  // This prevents infinite loading when onAuthStateChanged doesn't fire immediately
  const hasUser = user || firebaseUser;
  const hasFirebaseUser = !!firebaseUser;
  
  // Also check Firebase directly as a fallback
  const directFirebaseCheck = React.useMemo(() => {
    try {
      const { auth } = require('../config/firebase');
      return auth.currentUser;
    } catch {
      return null;
    }
  }, []);
  
  const finalHasUser = hasUser || directFirebaseCheck;
  
  logger.debug('[AUTH LAYOUT] ========================================');
  logger.debug('[AUTH LAYOUT] Auth state check:', {
    userFromContext: user?.uid || 'none',
    userFromContextEmail: user?.email || 'none',
    firebaseUser: firebaseUser?.uid || 'none',
    firebaseUserEmail: firebaseUser?.email || 'none',
    directFirebaseCheck: directFirebaseCheck?.uid || 'none',
    directFirebaseCheckEmail: directFirebaseCheck?.email || 'none',
    loading,
    hasUser: hasUser?.uid || 'none',
    finalHasUser: finalHasUser?.uid || 'none'
  });
  logger.debug('[AUTH LAYOUT] ========================================');

  // Show loading ONLY if:
  // 1. AuthContext is loading AND Firebase doesn't have a user (genuine loading state)
  // 2. But add a timeout to prevent infinite loading
  const shouldShowLoading = loading && !hasFirebaseUser;
  
  // Add timeout to prevent infinite loading - wait up to 5 seconds for auth to restore
  const [loadingTimeout, setLoadingTimeout] = React.useState(false);
  React.useEffect(() => {
    if (shouldShowLoading) {
      const timeout = setTimeout(() => {
        logger.debug('[AUTH LAYOUT] Timeout: AuthContext loading too long (5s), proceeding anyway');
        setLoadingTimeout(true);
      }, 5000); // Increased to 5 seconds to allow IndexedDB restore
      return () => clearTimeout(timeout);
    } else {
      setLoadingTimeout(false);
    }
  }, [shouldShowLoading]);

  if (shouldShowLoading && !loadingTimeout) {
    logger.debug('[AUTH LAYOUT] Showing loading screen - loading:', loading, 'hasFirebaseUser:', hasFirebaseUser);
    return <LoadingScreen />;
  }

  // Use finalHasUser which includes direct Firebase check
  // Redirect to login if not authenticated (after checking both AuthContext and Firebase)
  // But only if we're not already on the login page and loading is complete
  if (!finalHasUser && !loading) {
    logger.debug('[AUTH LAYOUT] ❌ No user found after all checks, redirecting to login');
    logger.debug('[AUTH LAYOUT] Checked: AuthContext user, firebaseUser state, direct Firebase check');
    return <Navigate to="/login" replace />;
  }
  
  // If still loading and no user, show loading screen
  if (!finalHasUser && loading) {
    logger.debug('[AUTH LAYOUT] ⏳ Still loading auth state, showing loading screen');
    return <LoadingScreen />;
  }
  
  if (finalHasUser) {
    logger.debug('[AUTH LAYOUT] ✅ User authenticated, showing children. User:', finalHasUser.uid);
  }
  
  logger.debug('[AUTH LAYOUT] ✅ User authenticated, showing children. User:', hasUser?.uid || 'from Firebase');

  // For now, skip onboarding check to get MainScreen working
  // TODO: Re-enable onboarding check later
  // if (userProfile) {
  //   if (userProfile.onboardingCompleted === false && 
  //       (userProfile.profileCompleted === false || userProfile.profileCompleted === undefined)) {
  //     return <Navigate to="/onboarding" replace />;
  //   } else if (userProfile.onboardingCompleted === false) {
  //     return <Navigate to="/onboarding" replace />;
  //   }
  // }

  // Show children immediately - don't wait for profile loading
  // Profile loading happens in background
  return (
    <>
      {children}
      <BottomTabBar />
    </>
  );
};

// Main App Routes - SIMPLIFIED
const WebAppNavigator = () => {
  const location = useLocation();
  const isLoginRoute = location.pathname === '/login';
  const { user, loading } = useAuth();
  
  // Check Firebase user directly as fallback
  const [firebaseUserForLogin, setFirebaseUserForLogin] = React.useState(() => {
    try {
      const { auth } = require('../config/firebase');
      return auth.currentUser;
    } catch {
      return null;
    }
  });
  
  // Update Firebase user check
  React.useEffect(() => {
    try {
      const { auth } = require('../config/firebase');
      const currentUser = auth.currentUser;
      if (currentUser !== firebaseUserForLogin) {
        setFirebaseUserForLogin(currentUser);
      }
    } catch {
      // Ignore errors
    }
  }, [firebaseUserForLogin]);
  
  // For login route, check if user is already logged in and redirect
  if (isLoginRoute) {
    const hasUser = user || firebaseUserForLogin;
    if (!loading && hasUser) {
      logger.debug('[WEB NAV] User already logged in, redirecting from /login to /');
      return <Navigate to="/" replace />;
    }
    
    return (
      <Routes>
        <Route path="/login" element={<LoginScreen />} />
      </Routes>
    );
  }

  // For all other routes, use auth
  // Loading state is handled by AuthenticatedLayout

  return (
    <Routes>
      {/* Test routes - must be first to catch before auth */}
      <Route
        path="/test"
        element={React.createElement(withErrorBoundary(TestScreen, 'TestScreen'))}
      />
      <Route
        path="/simple-test"
        element={React.createElement(withErrorBoundary(SimpleButtonTestScreen, 'SimpleButtonTestScreen'))}
      />
      
      {/* Public Routes */}
      <Route path="/login" element={React.createElement(withErrorBoundary(LoginScreen, 'Login'))} />

      {/* Onboarding Routes */}
      <Route
        path="/onboarding"
        element={
          <AuthenticatedLayout>
            <Suspense fallback={<LoadingScreen />}>
              {React.createElement(withErrorBoundary(OnboardingScreen, 'Onboarding'))}
            </Suspense>
          </AuthenticatedLayout>
        }
      />

      {/* Main App Routes */}
      <Route
        path="/"
        element={
          <AuthenticatedLayout>
            {React.createElement(withErrorBoundary(MainScreen, 'MainScreen'))}
          </AuthenticatedLayout>
        }
      />

      <Route
        path="/profile"
        element={
          <AuthenticatedLayout>
            {React.createElement(withErrorBoundary(ProfileScreen, 'Profile'))}
          </AuthenticatedLayout>
        }
      />

      <Route
        path="/library"
        element={
          <AuthenticatedLayout>
            {React.createElement(withErrorBoundary(ProgramLibraryScreen, 'ProgramLibrary'))}
          </AuthenticatedLayout>
        }
      />

      <Route
        path="/course/:courseId"
        element={
          <AuthenticatedLayout>
            {React.createElement(withErrorBoundary(CourseDetailScreen, 'CourseDetail'))}
          </AuthenticatedLayout>
        }
      />

      <Route
        path="/creator/:creatorId"
        element={
          <AuthenticatedLayout>
            {React.createElement(withErrorBoundary(CreatorProfileScreen, 'CreatorProfile'))}
          </AuthenticatedLayout>
        }
      />

      <Route
        path="/course/:courseId/structure"
        element={
          <AuthenticatedLayout>
            <Suspense fallback={<LoadingScreen />}>
              {React.createElement(withErrorBoundary(CourseStructureScreen, 'CourseStructure'))}
            </Suspense>
          </AuthenticatedLayout>
        }
      />

      <Route
        path="/course/:courseId/workout"
        element={
          <AuthenticatedLayout>
            <Suspense fallback={<LoadingScreen />}>
              {React.createElement(withErrorBoundary(DailyWorkoutScreen, 'DailyWorkout'))}
            </Suspense>
          </AuthenticatedLayout>
        }
      />

      <Route
        path="/course/:courseId/workout/execution"
          element={
            <AuthenticatedLayout>
              <Suspense fallback={<LoadingScreen />}>
                {React.createElement(withErrorBoundary(WorkoutExecutionScreen, 'WorkoutExecution'))}
              </Suspense>
            </AuthenticatedLayout>
          }
      />

      <Route
        path="/course/:courseId/workout/completion"
        element={
          <AuthenticatedLayout>
            <Suspense fallback={<LoadingScreen />}>
              {React.createElement(withErrorBoundary(WorkoutCompletionScreen, 'WorkoutCompletion'))}
            </Suspense>
          </AuthenticatedLayout>
        }
      />

      <Route
        path="/course/:courseId/exercises"
        element={
          <AuthenticatedLayout>
            <Suspense fallback={<LoadingScreen />}>
              {React.createElement(withErrorBoundary(WorkoutExercisesScreen, 'WorkoutExercises'))}
            </Suspense>
          </AuthenticatedLayout>
        }
      />

      <Route
        path="/warmup"
        element={
          <AuthenticatedLayout>
            <Suspense fallback={<LoadingScreen />}>
              {React.createElement(withErrorBoundary(WarmupScreen, 'Warmup'))}
            </Suspense>
          </AuthenticatedLayout>
        }
      />

      <Route
        path="/sessions"
        element={
          <AuthenticatedLayout>
            {React.createElement(withErrorBoundary(SessionsScreen, 'Sessions'))}
          </AuthenticatedLayout>
        }
      />

      <Route
        path="/sessions/:sessionId"
        element={
          <AuthenticatedLayout>
            {React.createElement(withErrorBoundary(SessionDetailScreen, 'SessionDetail'))}
          </AuthenticatedLayout>
        }
      />

      <Route
        path="/prs"
        element={
          <AuthenticatedLayout>
            {React.createElement(withErrorBoundary(PRsScreen, 'PRs'))}
          </AuthenticatedLayout>
        }
      />

      <Route
        path="/prs/:exerciseId"
        element={
          <AuthenticatedLayout>
            {React.createElement(withErrorBoundary(PRDetailScreen, 'PRDetail'))}
          </AuthenticatedLayout>
        }
      />

      <Route
        path="/volume"
        element={
          <AuthenticatedLayout>
            {React.createElement(withErrorBoundary(WeeklyVolumeHistoryScreen, 'WeeklyVolumeHistory'))}
          </AuthenticatedLayout>
        }
      />

      <Route
        path="/subscriptions"
        element={
          <AuthenticatedLayout>
            {React.createElement(withErrorBoundary(SubscriptionsScreen, 'Subscriptions'))}
          </AuthenticatedLayout>
        }
      />

      <Route
        path="/courses"
        element={
          <AuthenticatedLayout>
            {React.createElement(withErrorBoundary(AllPurchasedCoursesScreen, 'AllPurchasedCourses'))}
          </AuthenticatedLayout>
        }
      />

      {/* Catch all - redirect to home */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
};

export default WebAppNavigator;
