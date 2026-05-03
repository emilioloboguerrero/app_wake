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
import HoyScreen from '../screens/HoyScreen.web.jsx';
import ProfileScreen from '../screens/ProfileScreen.web.jsx';
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
import CourseStructureScreen from '../screens/CourseStructureScreen.web';
// Import CourseDetailScreen directly using web wrapper for React Router navigation
import CourseDetailScreen from '../screens/CourseDetailScreen.web';
import BundleDetailScreen from '../screens/BundleDetailScreen.web';
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
import LabScreen from '../screens/LabScreen.web';
import OnboardingEducation from '../screens/onboarding/education/OnboardingEducation.web';
import EventsManagementScreen from '../screens/EventsManagementScreen.web';
import EventCheckinScreen from '../screens/EventCheckinScreen.web';
import EventRegistrationsScreen from '../screens/EventRegistrationsScreen.web';
import PaymentSuccessScreen from '../screens/PaymentSuccessScreen.web';
import PaymentCancelledScreen from '../screens/PaymentCancelledScreen.web';
import apiService from '../services/apiService';
import DebugScreenTracker from '../components/DebugScreenTracker.web';
import { isAdmin, isCreator } from '../utils/roleHelper';
import BottomTabBar from '../components/BottomTabBar.web';
import ReadinessCheckModal from '../components/ReadinessCheckModal.web';
import { getTodayReadiness } from '../services/readinessService';
import UserRoleContext, { useUserRole } from '../contexts/UserRoleContext';

export const RefreshProfileContext = createContext(null);
export const OpenReadinessModalContext = createContext(null);

// Role-based guard for creator-only routes
const CreatorRouteGuard = ({ children }) => {
  const { role } = useUserRole();
  if (!isCreator(role) && !isAdmin(role)) {
    return <Navigate to="/" replace />;
  }
  return children;
};

// Memoized error boundary wrapper for onboarding
const OnboardingEducationWithBoundary = withErrorBoundary(OnboardingEducation, 'OnboardingEducation');

// Onboarding route wrapper — passes onComplete that refreshes profile and navigates home
const OnboardingRoute = () => {
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
  return <OnboardingEducationWithBoundary onComplete={onComplete} />;
};

// Derive the CSS transition class for a navigation event.
// Completion screens always slide up; going shallower (back) slides from left;
// going deeper (forward) slides from right.
const getScreenEnterClass = (currentPath, prevPath) => {
  if (currentPath.includes('/workout/completion')) return 'wake-screen-enter-up';
  const depth = (p) => {
    const baseDepth = p.split('/').filter(Boolean).length;
    // Treat warmup as part of the deep workout flow so its transition
    // direction matches WorkoutExecution instead of looking like a "back" nav.
    if (p === '/warmup') return 4;
    return baseDepth;
  };
  if (depth(currentPath) < depth(prevPath)) return 'wake-screen-enter-back';
  return 'wake-screen-enter';
};

// Read whatever onboarding status is in localStorage, regardless of age.
// Used as a fallback when the live /users/me fetch times out or errors —
// keeps already-onboarded users out of /onboarding when the network is slow.
// Returns null if no cache exists (truly new users still get sent to onboarding).
const readStaleOnboardingCache = (uid) => {
  try {
    const raw = localStorage.getItem(`onboarding_status_${uid}`);
    if (!raw) return null;
    const status = JSON.parse(raw);
    return {
      profileCompleted: status.profileCompleted ?? false,
      onboardingCompleted: status.onboardingCompleted ?? false,
    };
  } catch (_) {
    return null;
  }
};

// Layout component for authenticated routes
// Auth state comes exclusively from AuthContext (single source of truth).
// No duplicate Firebase checks, no polling, no competing timeouts.
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
  const prevPathRef = React.useRef(location.pathname);

  const refreshUserProfile = React.useCallback(() => {
    const promise = new Promise((resolve) => {
      refreshResolveRef.current = resolve;
    });
    checkedUserIdRef.current = null;
    skipCacheNextRef.current = true;
    setRefreshKey((k) => k + 1);
    return promise;
  }, []);

  const uid = user?.uid;

  React.useEffect(() => {
    if (uid && checkedUserIdRef.current === uid) return;
    if (!uid && checkedUserIdRef.current === null) return;

    let mounted = true;
    let timeoutId = null;

    const checkUserProfile = async () => {
      if (uid) {
        setProfileLoading(true);
        checkedUserIdRef.current = uid;

        timeoutId = setTimeout(() => {
          if (mounted) {
            const stale = readStaleOnboardingCache(uid);
            setUserProfile(stale || { profileCompleted: false, onboardingCompleted: false });
            setProfileLoading(false);
          }
        }, 10000);

        try {
          const skipCache = skipCacheNextRef.current;
          if (skipCache) skipCacheNextRef.current = false;

          if (!skipCache) {
            let cached = null;
            try { cached = localStorage.getItem(`onboarding_status_${uid}`); } catch (_) {}
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
          }

          const profilePromise = apiService.getUser(uid);
          const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Firestore timeout')), 5000)
          );

          const profile = await Promise.race([profilePromise, timeoutPromise]);

          if (mounted) {
            if (profile) {
              setUserProfile(profile);
              try {
                localStorage.setItem(`onboarding_status_${uid}`, JSON.stringify({
                  onboardingCompleted: profile.onboardingCompleted ?? false,
                  profileCompleted: profile.profileCompleted ?? false,
                  cachedAt: Date.now(),
                }));
              } catch (_) {}
            } else {
              const stale = readStaleOnboardingCache(uid);
              setUserProfile(stale || { profileCompleted: false, onboardingCompleted: false });
            }
          }
        } catch (error) {
          if (mounted) {
            const stale = readStaleOnboardingCache(uid);
            setUserProfile(stale || { profileCompleted: false, onboardingCompleted: false });
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
      } else {
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
  }, [uid, refreshKey]);

  const [showReadiness, setShowReadiness] = React.useState(false);
  const [readinessMandatory, setReadinessMandatory] = React.useState(false);
  const openReadinessModal = React.useCallback(() => {
    setReadinessMandatory(false);
    setShowReadiness(true);
  }, []);
  const readinessCheckedRef = React.useRef(false);
  React.useEffect(() => {
    if (readinessCheckedRef.current) return;
    if (!user || profileLoading || userProfile === null) return;
    const needsOnboardingCheck = userProfile && (
      userProfile.onboardingCompleted === false ||
      (userProfile.profileCompleted === false || userProfile.profileCompleted === undefined)
    );
    if (needsOnboardingCheck) return;
    readinessCheckedRef.current = true;
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    const dateStr = `${yyyy}-${mm}-${dd}`;
    const lsKey = `wake_readiness_${dateStr}`;
    try {
      const cached = localStorage.getItem(lsKey);
      if (cached === 'done' || cached === 'skipped') return;
    } catch (_) {}
    getTodayReadiness(user.uid, dateStr).then((existing) => {
      if (existing) {
        try { localStorage.setItem(lsKey, 'done'); } catch (_) {}
      } else {
        setReadinessMandatory(true);
        setTimeout(() => setShowReadiness(true), 800);
      }
    }).catch(() => {});
  }, [user?.uid, profileLoading, userProfile]);

  // Auth loading — wait for AuthContext to resolve
  if (loading) {
    return <LoadingScreen />;
  }

  // Not authenticated
  if (!user) {
    return <Navigate to="/login" replace />;
  }

  // Wait for profile fetch
  if (profileLoading || userProfile === null) {
    return <LoadingScreen />;
  }

  // Onboarding routing
  const needsOnboarding = userProfile && (
    userProfile.onboardingCompleted === false ||
    (userProfile.profileCompleted === false || userProfile.profileCompleted === undefined)
  );
  const hasCompletedOnboarding = userProfile && userProfile.onboardingCompleted === true;

  if (isOnOnboardingPath) {
    if (hasCompletedOnboarding) {
      return <Navigate to="/" replace />;
    }
    if (userProfile.profileCompleted && !userProfile.onboardingCompleted) {
      return <Navigate to="/onboarding/questions" replace />;
    }
  } else if (isOnOnboardingQuestionsPath) {
    if (hasCompletedOnboarding) {
      return <Navigate to="/" replace />;
    }
  } else {
    if (needsOnboarding) {
      return <Navigate to="/onboarding" replace />;
    }
  }
  const userRole = userProfile?.role ?? null;

  const tabBarEl =
    typeof document !== 'undefined' && document.body
      ? createPortal(<BottomTabBar />, document.body)
      : <BottomTabBar />;
  const screenClass = getScreenEnterClass(location.pathname, prevPathRef.current);
  prevPathRef.current = location.pathname;

  return (
    <RefreshProfileContext.Provider value={{ refreshUserProfile }}>
      <OpenReadinessModalContext.Provider value={{ openReadinessModal }}>
        <UserRoleContext.Provider value={{ role: userRole }}>
          <div
            key={location.key}
            className={screenClass}
            style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}
          >
            {children}
          </div>
          {tabBarEl}
          {showReadiness && typeof document !== 'undefined' && document.body
            ? createPortal(
                <ReadinessCheckModal mandatory={readinessMandatory} onClose={() => setShowReadiness(false)} />,
                document.body
              )
            : showReadiness
              ? <ReadinessCheckModal mandatory={readinessMandatory} onClose={() => setShowReadiness(false)} />
              : null}
        </UserRoleContext.Provider>
      </OpenReadinessModalContext.Provider>
    </RefreshProfileContext.Provider>
  );
};

// Delay mounting NutritionScreen by one frame so we never show empty content.
// When layout switches from LoadingScreen to children, React mounts NutritionScreen;
// its first render is slow (many hooks), so the content area can flash empty before
// NutritionScreen commits. This wrapper shows LoadingScreen until after first paint,
// then mounts NutritionScreen, so we always have loading visible then NutritionScreen.
const NutritionRouteWrapper = () => {
  const [showScreen, setShowScreen] = React.useState(false);
  React.useEffect(() => {
    setShowScreen(true);
  }, []);
  if (!showScreen) return <LoadingScreen />;
  return React.createElement(withErrorBoundary(NutritionScreen, 'Nutrition'));
};

// Main App Routes
const WebAppNavigator = () => {
  const location = useLocation();
  const isLoginRoute = location.pathname === '/login';
  const { user, loading } = useAuth();

  if (isLoginRoute) {
    if (!loading && user) {
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
      <DebugScreenTracker />
      <Routes>

        {/* Onboarding Routes */}
      <Route
        path="/onboarding"
        element={
          <AuthenticatedLayout>
            <OnboardingRoute />
          </AuthenticatedLayout>
        }
      />
      <Route
        path="/onboarding/questions"
        element={
          <AuthenticatedLayout>
            <OnboardingRoute />
          </AuthenticatedLayout>
        }
      />

      {/* Main App Routes */}
      <Route
        path="/"
        element={
          <AuthenticatedLayout>
            {React.createElement(withErrorBoundary(HoyScreen, 'Hoy'))}
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
            <NutritionRouteWrapper />
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
        path="/bundle/:bundleId"
        element={
          <AuthenticatedLayout>
            {React.createElement(withErrorBoundary(BundleDetailScreen, 'BundleDetail'))}
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
        path="/progress"
        element={
          <AuthenticatedLayout>
            {React.createElement(withErrorBoundary(LabScreen, 'Lab'))}
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

      <Route
        path="/creator/events"
        element={
          <AuthenticatedLayout>
            <CreatorRouteGuard>
              {React.createElement(withErrorBoundary(EventsManagementScreen, 'EventsManagement'))}
            </CreatorRouteGuard>
          </AuthenticatedLayout>
        }
      />

      <Route
        path="/creator/events/:eventId/checkin"
        element={
          <AuthenticatedLayout>
            <CreatorRouteGuard>
              {React.createElement(withErrorBoundary(EventCheckinScreen, 'EventCheckin'))}
            </CreatorRouteGuard>
          </AuthenticatedLayout>
        }
      />

      <Route
        path="/creator/events/:eventId/registrations"
        element={
          <AuthenticatedLayout>
            <CreatorRouteGuard>
              {React.createElement(withErrorBoundary(EventRegistrationsScreen, 'EventRegistrations'))}
            </CreatorRouteGuard>
          </AuthenticatedLayout>
        }
      />

      <Route
        path="/payment/success"
        element={
          <AuthenticatedLayout>
            <PaymentSuccessScreen />
          </AuthenticatedLayout>
        }
      />

      <Route
        path="/payment/cancelled"
        element={
          <AuthenticatedLayout>
            <PaymentCancelledScreen />
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
