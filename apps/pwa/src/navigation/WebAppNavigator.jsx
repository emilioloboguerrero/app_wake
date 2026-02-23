// Web App Navigator - React Router based navigation for PWA
// SIMPLIFIED VERSION - Login route isolated
// Direct imports for web to avoid Metro "unknown module" errors with lazy chunks
import React, { Suspense, createContext, useContext } from 'react';
import { createPortal } from 'react-dom';
import { Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
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
// Import workout-related screens directly to avoid Metro "unknown module" errors with lazy chunks on web
import DailyWorkoutScreen from '../screens/DailyWorkoutScreen.web';
import WorkoutExecutionScreen from '../screens/WorkoutExecutionScreen.web';
import WorkoutCompletionScreen from '../screens/WorkoutCompletionScreen.web';
import WarmupScreen from '../screens/WarmupScreen.web';
import WorkoutExercisesScreen from '../screens/WorkoutExercisesScreen.web';
import CourseStructureScreen from '../screens/CourseStructureScreen.web';
// Import CourseDetailScreen directly using web wrapper for React Router navigation
import CourseDetailScreen from '../screens/CourseDetailScreen.web';
// Import CreatorProfileScreen directly using web wrapper for React Router navigation
import CreatorProfileScreen from '../screens/CreatorProfileScreen.web';
import UpcomingCallDetailScreen from '../screens/UpcomingCallDetailScreen.web';
import NutritionScreen from '../screens/NutritionScreen.web';
// Import screens with web wrappers directly to avoid Metro bundler issues
import SessionsScreen from '../screens/SessionsScreen.web';
import WeeklyVolumeHistoryScreen from '../screens/WeeklyVolumeHistoryScreen.web';
import PRsScreen from '../screens/PRsScreen.web';
import SessionDetailScreen from '../screens/SessionDetailScreen.web';
import PRDetailScreen from '../screens/PRDetailScreen.web';
import OnboardingScreen from '../screens/OnboardingScreen';

import firestoreService from '../services/firestoreService';
import webStorageService from '../services/webStorageService';
import logger from '../utils/logger';
import { isSafariWeb } from '../utils/platform';
import BottomTabBar from '../components/BottomTabBar.web';
import OnboardingNavigator from './OnboardingNavigator';
import { NavigationContainer } from '@react-navigation/native';
import UserRoleContext from '../contexts/UserRoleContext';

export const RefreshProfileContext = createContext(null);


// Wrapper so OnboardingScreen (profile step) can refetch profile and navigate to questions on web
const OnboardingProfileRoute = () => {
  const ctx = useContext(RefreshProfileContext);
  const navigate = useNavigate();
  const refreshUserProfile = ctx?.refreshUserProfile;
  const onComplete = React.useCallback(() => {
    if (refreshUserProfile) refreshUserProfile();
    navigate('/onboarding/questions', { replace: true });
  }, [refreshUserProfile, navigate]);
  const route = { params: {}, name: 'Onboarding' };
  return (
    <Suspense fallback={<LoadingScreen />}>
      {React.createElement(withErrorBoundary(() => <OnboardingScreen route={route} onComplete={onComplete} />, 'Onboarding'))}
    </Suspense>
  );
};

// Wrapper so OnboardingNavigator (questions flow) can refetch and go home on complete
const OnboardingQuestionsRoute = () => {
  const ctx = useContext(RefreshProfileContext);
  const navigate = useNavigate();
  const refreshUserProfile = ctx?.refreshUserProfile;
  const onComplete = React.useCallback(async () => {
    if (refreshUserProfile) {
      const p = refreshUserProfile();
      if (p && typeof p.then === 'function') await p;
    }
    navigate('/', { replace: true });
  }, [refreshUserProfile, navigate]);
  return (
    <NavigationContainer independent={true}>
      {React.createElement(withErrorBoundary(() => <OnboardingNavigator onComplete={onComplete} />, 'OnboardingQuestions'))}
    </NavigationContainer>
  );
};

// Layout component for authenticated routes
const AuthenticatedLayout = ({ children }) => {
  const { user, loading } = useAuth();
  const location = useLocation();
  const isOnOnboardingPath = location.pathname === '/onboarding';
  const isOnOnboardingQuestionsPath = location.pathname === '/onboarding/questions';
  const [userProfile, setUserProfile] = React.useState(null);
  const [profileLoading, setProfileLoading] = React.useState(false);
  const [refreshKey, setRefreshKey] = React.useState(0);
  const checkedUserIdRef = React.useRef(null);
  const refreshResolveRef = React.useRef(null);
  const skipCacheNextRef = React.useRef(false);

  const refreshUserProfile = React.useCallback(() => {
    logger.log('[AUTH LAYOUT] refreshUserProfile called — refetching profile');
    const promise = new Promise((resolve) => {
      refreshResolveRef.current = resolve;
    });
    checkedUserIdRef.current = null;
    skipCacheNextRef.current = true; // Prefer Firestore on this run (Safari cache can be stale)
    setRefreshKey((k) => k + 1);
    return promise;
  }, []);

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

  // Use effective uid from context or Firebase so we run profile fetch even when context lags
  const effectiveUidForFetch = user?.uid || firebaseUser?.uid;

  React.useEffect(() => {
    // Skip if already checked for this user (refreshUserProfile clears ref to force refetch)
    if (effectiveUidForFetch && checkedUserIdRef.current === effectiveUidForFetch) {
      logger.debug('[AUTH LAYOUT] checkUserProfile skipped (already checked for uid)', effectiveUidForFetch);
      return;
    }

    // Skip if no user and we've already cleared
    if (!effectiveUidForFetch && checkedUserIdRef.current === null) {
      return;
    }

    let mounted = true;
    let timeoutId = null;
    
    const checkUserProfile = async () => {
      // Start fetch whenever we have a uid (from context or Firebase). Do not require !loading:
      // if AuthContext is still loading but we have firebaseUser/directFirebaseCheck we'd otherwise
      // show "Waiting for profile" forever without ever starting the fetch.
      if (effectiveUidForFetch) {
        logger.log('[AUTH LAYOUT] BREAKPOINT: Starting profile fetch for uid:', effectiveUidForFetch);
        setProfileLoading(true);
        checkedUserIdRef.current = effectiveUidForFetch;
        
        timeoutId = setTimeout(() => {
          if (mounted) {
            logger.warn('[AUTH LAYOUT] BREAKPOINT: Profile fetch timeout (10s), assuming new user. uid:', effectiveUidForFetch);
            setUserProfile({ profileCompleted: false, onboardingCompleted: false });
            setProfileLoading(false);
          }
        }, 10000);
        
        try {
          const skipCache = skipCacheNextRef.current;
          if (skipCache) skipCacheNextRef.current = false;

          if (!skipCache) {
            const cached = await webStorageService.getItem(`onboarding_status_${effectiveUidForFetch}`);
            if (cached) {
              const status = JSON.parse(cached);
              const cacheAge = Date.now() - (status.cachedAt || 0);
              if (cacheAge < 5 * 60 * 1000) {
                logger.log('[AUTH LAYOUT] BREAKPOINT: Profile from cache. uid:', effectiveUidForFetch, 'onboardingCompleted:', status.onboardingCompleted, 'profileCompleted:', status.profileCompleted);
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
          }

          const profilePromise = firestoreService.getUser(effectiveUidForFetch);
          const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Firestore timeout')), 5000)
          );
          
          const profile = await Promise.race([profilePromise, timeoutPromise]);
          
          if (mounted) {
            if (profile) {
              logger.log('[AUTH LAYOUT] BREAKPOINT: Profile from Firestore. uid:', effectiveUidForFetch, 'onboardingCompleted:', profile.onboardingCompleted, 'profileCompleted:', profile.profileCompleted);
              setUserProfile(profile);
              webStorageService.setItem(`onboarding_status_${effectiveUidForFetch}`, JSON.stringify({
                onboardingCompleted: profile.onboardingCompleted ?? false,
                profileCompleted: profile.profileCompleted ?? false,
                cachedAt: Date.now()
              })).catch(() => {});
            } else {
              logger.log('[AUTH LAYOUT] BREAKPOINT: No profile (new user). uid:', effectiveUidForFetch, '-> setting onboarding not completed');
              setUserProfile({ profileCompleted: false, onboardingCompleted: false });
            }
          }
        } catch (error) {
          logger.warn('[AUTH LAYOUT] BREAKPOINT: Profile fetch error. uid:', effectiveUidForFetch, 'error:', error?.message);
          if (mounted) {
            try {
              const cached = await webStorageService.getItem(`onboarding_status_${effectiveUidForFetch}`);
              if (cached) {
                const status = JSON.parse(cached);
                logger.log('[AUTH LAYOUT] Using cached onboarding status after error. uid:', effectiveUidForFetch, status);
                setUserProfile({
                  profileCompleted: status.profileCompleted ?? false,
                  onboardingCompleted: status.onboardingCompleted ?? false
                });
              } else {
                logger.log('[AUTH LAYOUT] No cache, assuming new user after error. uid:', effectiveUidForFetch);
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
          const resolve = refreshResolveRef.current;
          refreshResolveRef.current = null;
          if (resolve) resolve();
        }
      } else if (!effectiveUidForFetch) {
        logger.debug('[AUTH LAYOUT] No user, clearing userProfile');
        setUserProfile(null);
        setProfileLoading(false);
        checkedUserIdRef.current = null;
        const resolve = refreshResolveRef.current;
        refreshResolveRef.current = null;
        if (resolve) resolve();
      }
    };

    checkUserProfile();
    
    return () => {
      mounted = false;
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [effectiveUidForFetch, refreshKey]);

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
  
  // Show loading ONLY if:
  // 1. AuthContext is loading AND Firebase doesn't have a user (genuine loading state)
  // 2. But add a timeout to prevent infinite loading
  const shouldShowLoading = loading && !hasFirebaseUser;
  
  // Add timeout to prevent infinite loading. Safari: use 2s (AuthContext gives up at 3s).
  // Other browsers: 5s to allow IndexedDB restore. (Declare before logger.prod so not used before init.)
  const loadingTimeoutMs = isSafariWeb() ? 2000 : 5000;
  const [loadingTimeout, setLoadingTimeout] = React.useState(false);
  
  logger.prod('LAYOUT', { loading, hasFirebaseUser: !!firebaseUser, finalHasUser: !!finalHasUser, shouldShowLoading, loadingTimeoutMs });
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
  React.useEffect(() => {
    if (shouldShowLoading) {
      const timeout = setTimeout(() => {
        logger.prod('LAYOUT loading timeout fired', loadingTimeoutMs + 'ms', 'Safari:', isSafariWeb());
        logger.debug(`[AUTH LAYOUT] Timeout: AuthContext loading too long (${loadingTimeoutMs}ms), proceeding anyway${isSafariWeb() ? ' [Safari]' : ''}`);
        setLoadingTimeout(true);
      }, loadingTimeoutMs);
      return () => clearTimeout(timeout);
    } else {
      setLoadingTimeout(false);
    }
  }, [shouldShowLoading, loadingTimeoutMs]);

  if (shouldShowLoading && !loadingTimeout) {
    logger.prod('LAYOUT showing LoadingScreen', 'loading:', loading, 'loadingTimeout:', loadingTimeout);
    logger.debug('[AUTH LAYOUT] Showing loading screen - loading:', loading, 'hasFirebaseUser:', hasFirebaseUser);
    return <LoadingScreen />;
  }

  // Once we've waited the loading timeout (2s Safari / 5s other) and still have no user, go to login.
  // Don't wait for AuthContext's fallback — Safari may never fire onAuthStateChanged.
  if (loadingTimeout && !finalHasUser) {
    logger.prod('LAYOUT redirect to /login (loading timeout, no user)');
    logger.debug('[AUTH LAYOUT] Loading timeout fired with no user, redirecting to login');
    return <Navigate to="/login" replace />;
  }

  // Use finalHasUser which includes direct Firebase check
  // Redirect to login if not authenticated (after checking both AuthContext and Firebase)
  if (!finalHasUser && !loading) {
    logger.prod('LAYOUT redirect to /login', 'no user');
    logger.debug('[AUTH LAYOUT] ❌ No user found after all checks, redirecting to login');
    logger.debug('[AUTH LAYOUT] Checked: AuthContext user, firebaseUser state, direct Firebase check');
    return <Navigate to="/login" replace />;
  }
  
  // If still loading and no user (and we haven't timed out yet), show loading screen
  if (!finalHasUser && loading) {
    logger.prod('LAYOUT LoadingScreen (no user, loading)', loading);
    logger.debug('[AUTH LAYOUT] ⏳ Still loading auth state, showing loading screen');
    return <LoadingScreen />;
  }
  
  const effectiveUid = finalHasUser?.uid || hasUser?.uid;
  if (finalHasUser) {
    logger.debug('[AUTH LAYOUT] ✅ User authenticated. uid:', finalHasUser.uid);
  }

  // Wait for profile when we have an authenticated user: either still loading or not yet known
  // Never redirect to onboarding when userProfile is null - we might be a returning user (profile just hasn't loaded yet)
  if (finalHasUser && (profileLoading || userProfile === null)) {
    logger.prod('LAYOUT LoadingScreen (waiting for profile)', { uid: effectiveUid, profileLoading, hasProfile: !!userProfile });
    logger.log('[AUTH LAYOUT] BREAKPOINT: Waiting for profile. uid:', effectiveUid, 'profileLoading:', profileLoading, 'userProfile:', userProfile ? 'set' : 'null');
    return <LoadingScreen />;
  }

  // Onboarding: only redirect based on explicit profile data (userProfile is now set from Firestore or "new user" default)
  // - profileCompleted: false/undefined = user has not filled base profile (name, etc.)
  // - onboardingCompleted: false = user has not finished the onboarding questions flow
  const needsOnboarding = userProfile && (
    userProfile.onboardingCompleted === false ||
    (userProfile.profileCompleted === false || userProfile.profileCompleted === undefined)
  );
  const hasCompletedOnboarding = userProfile && userProfile.onboardingCompleted === true;

  if (isOnOnboardingPath) {
    // We're on /onboarding: only render onboarding screen if they still need it
    if (hasCompletedOnboarding) {
      logger.log('[AUTH LAYOUT] BREAKPOINT: On /onboarding but profile complete, redirecting to /. uid:', effectiveUid);
      return <Navigate to="/" replace />;
    }
    // Profile already done but questions not: send to questions flow (e.g. after refresh)
    if (userProfile.profileCompleted && !userProfile.onboardingCompleted) {
      logger.log('[AUTH LAYOUT] BREAKPOINT: On /onboarding, profile done, redirecting to questions. uid:', effectiveUid);
      return <Navigate to="/onboarding/questions" replace />;
    }
    logger.log('[AUTH LAYOUT] BREAKPOINT: On /onboarding, rendering children. uid:', effectiveUid);
  } else if (isOnOnboardingQuestionsPath) {
    // On questions flow: allow even if refetch hasn't updated profile yet
    if (hasCompletedOnboarding) {
      logger.log('[AUTH LAYOUT] BREAKPOINT: On /onboarding/questions but onboarding complete, redirecting to /. uid:', effectiveUid);
      return <Navigate to="/" replace />;
    }
    logger.log('[AUTH LAYOUT] BREAKPOINT: On /onboarding/questions, rendering children. uid:', effectiveUid);
  } else {
    // We're on another route: redirect to onboarding only when profile explicitly says incomplete
    if (needsOnboarding) {
      logger.log('[AUTH LAYOUT] BREAKPOINT: Onboarding decision - redirecting to /onboarding.', {
        uid: effectiveUid,
        onboardingCompleted: userProfile.onboardingCompleted,
        profileCompleted: userProfile.profileCompleted
      });
      return <Navigate to="/onboarding" replace />;
    }
  }

  logger.log('[AUTH LAYOUT] BREAKPOINT: Rendering authenticated content. uid:', effectiveUid);
  const userRole = userProfile?.role ?? null;
  // Render tab bar in a portal to document.body so position:fixed is relative to viewport
  const tabBarEl =
    typeof document !== 'undefined' && document.body
      ? createPortal(<BottomTabBar />, document.body)
      : <BottomTabBar />;
  return (
    <RefreshProfileContext.Provider value={{ refreshUserProfile }}>
      <UserRoleContext.Provider value={{ role: userRole }}>
        {children}
        {tabBarEl}
      </UserRoleContext.Provider>
    </RefreshProfileContext.Provider>
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
  // .app-viewport constrains width on desktop so main app layout matches phone (see global.css)
  return (
    <div className="app-viewport" style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      <Routes>
          <Route path="/login" element={React.createElement(withErrorBoundary(LoginScreen, 'Login'))} />

        {/* Onboarding Routes */}
      <Route
        path="/onboarding"
        element={
          <AuthenticatedLayout>
            <OnboardingProfileRoute />
          </AuthenticatedLayout>
        }
      />
      <Route
        path="/onboarding/questions"
        element={
          <AuthenticatedLayout>
            <OnboardingQuestionsRoute />
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
        path="/nutrition"
        element={
          <AuthenticatedLayout>
            {React.createElement(withErrorBoundary(NutritionScreen, 'Nutrition'))}
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

      <Route
        path="/call/:bookingId"
        element={
          <AuthenticatedLayout>
            {React.createElement(withErrorBoundary(UpcomingCallDetailScreen, 'UpcomingCallDetail'))}
          </AuthenticatedLayout>
        }
      />

        {/* Catch all - redirect to home */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  );
};

export default WebAppNavigator;
