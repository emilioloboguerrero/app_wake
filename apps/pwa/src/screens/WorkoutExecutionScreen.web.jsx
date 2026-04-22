// Web-specific wrapper for WorkoutExecutionScreen (MINIMAL TEST VERSION)
// Provides React Router navigation for minimal test screen

import React, { useMemo, useState, useEffect } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';

// Import base component directly (like LoginScreen and MainScreen)
const WorkoutExecutionScreenModule = require('./WorkoutExecutionScreen.js');
const WorkoutExecutionScreenBase = WorkoutExecutionScreenModule.default || WorkoutExecutionScreenModule;

// MINIMAL TEST VERSION - Simplified wrapper

const WorkoutExecutionScreen = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { courseId } = useParams();

  // Memoize navigation adapter
  const navigation = useMemo(() => ({
    navigate: (routeName, params) => {
      const routeMap = {
        'WorkoutCompletion': () => {
          const cId = params?.course?.courseId || params?.course?.id || courseId;
          navigate(`/course/${cId}/workout/completion`, { state: params });
        },
        'DailyWorkout': () => {
          const cId = params?.course?.courseId || params?.course?.id || courseId;
          navigate(`/course/${cId}/workout`, { state: params });
        },
        'Main': () => navigate('/'),
        'MainScreen': () => navigate('/'),
      };

      if (routeMap[routeName]) {
        routeMap[routeName]();
      } else {
        navigate(`/${routeName.toLowerCase()}`, { state: params });
      }
    },
    goBack: () => navigate(-1),
    setParams: () => {},
  }), [navigate, courseId]);
  
  // Create route object from location state
  const route = useMemo(() => ({
    params: {
      course: location.state?.course || null,
      workout: location.state?.workout || null,
      sessionId: location.state?.sessionId || null,
      checkpoint: location.state?.checkpoint || null,
    }
  }), [location.state]);

  const [isOffline, setIsOffline] = useState(!navigator.onLine);

  useEffect(() => {
    const goOffline = () => setIsOffline(true);
    const goOnline = () => setIsOffline(false);
    window.addEventListener('offline', goOffline);
    window.addEventListener('online', goOnline);
    return () => {
      window.removeEventListener('offline', goOffline);
      window.removeEventListener('online', goOnline);
    };
  }, []);

  // Block iOS Safari's left-edge back-swipe. touchstart.preventDefault cannot
  // stop the system gesture on iOS, so instead we seat a history sentinel: a
  // duplicate history entry at the current URL. When the user swipes back the
  // browser pops the sentinel (popstate fires) but the URL is unchanged, so
  // React Router does not re-render. We immediately re-push the sentinel to
  // arm the next swipe. The in-screen discard button remains the only
  // intentional way to leave the session.
  useEffect(() => {
    const sentinelUrl = window.location.href;
    window.history.pushState({ wakeExecSentinel: true }, '', sentinelUrl);
    const onPop = () => {
      window.history.pushState({ wakeExecSentinel: true }, '', sentinelUrl);
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  return (
    <div style={{ position: 'relative', width: '100%', flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      {isOffline && (
        <div style={{
          position: 'absolute',
          top: 8,
          right: 8,
          zIndex: 100,
          backgroundColor: 'rgba(255,255,255,0.12)',
          backdropFilter: 'blur(8px)',
          WebkitBackdropFilter: 'blur(8px)',
          borderRadius: 12,
          padding: '4px 10px',
        }}>
          <span style={{
            color: 'rgba(255,255,255,0.7)',
            fontSize: 11,
            fontWeight: 500,
          }}>Sin conexión</span>
        </div>
      )}
      <WorkoutExecutionScreenBase
        navigation={navigation}
        route={route}
      />
    </div>
  );
};

export default WorkoutExecutionScreen;
