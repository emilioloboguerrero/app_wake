// Web wrapper for DailyWorkoutScreen - provides React Router navigation and date selector
import React, { useState, useCallback, useEffect, useRef } from 'react';
import { View, StyleSheet } from 'react-native';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { STALE_TIMES } from '../config/queryConfig';
import LoadingScreen from './LoadingScreen';
import logger from '../utils/logger';
import firestoreService from '../services/apiService';
import exerciseHistoryService from '../services/exerciseHistoryService';
import sessionService from '../services/sessionService';
import { useAuth } from '../contexts/AuthContext';
import WeekDateSelector, { toYYYYMMDD } from '../components/WeekDateSelector.web';
import RecoveryModal from '../components/workout/RecoveryModal';
import { extractAccentColor, applyAccentToElement } from '../utils/accentExtractor';

const DailyWorkoutScreenModule = require('./DailyWorkoutScreen.js');
const DailyWorkoutScreenBase = DailyWorkoutScreenModule.default;

const dateRowStyle = StyleSheet.create({
  dateRow: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 32,
  },
});

const DailyWorkoutScreen = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { courseId } = useParams();
  const { user, loading: authLoading } = useAuth();

  const [selectedDate, setSelectedDate] = useState(() => toYYYYMMDD(new Date()));
  const [dateTransitioning, setDateTransitioning] = useState(false);
  const dateTransitionTimeoutRef = React.useRef(null);

  const handleDateChange = useCallback((date) => {
    setSelectedDate(date);
    setDateTransitioning(true);
    if (dateTransitionTimeoutRef.current) clearTimeout(dateTransitionTimeoutRef.current);
    dateTransitionTimeoutRef.current = setTimeout(() => setDateTransitioning(false), 420);
  }, []);

  React.useEffect(() => {
    return () => {
      if (dateTransitionTimeoutRef.current) clearTimeout(dateTransitionTimeoutRef.current);
    };
  }, []);

  const currentMonthMeta = React.useMemo(() => {
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth();
    const key = `${y}-${String(m + 1).padStart(2, '0')}`;
    // Extend start 7 days before month to cover week boundary (e.g. Mar 30 when April starts)
    const extStart = new Date(y, m, 1 - 7);
    const start = `${extStart.getFullYear()}-${String(extStart.getMonth() + 1).padStart(2, '0')}-${String(extStart.getDate()).padStart(2, '0')}`;
    const lastDay = new Date(y, m + 1, 0).getDate();
    const end = `${y}-${String(m + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
    return { key, start, end };
  }, []);

  const { data: prefetchedDates } = useQuery({
    queryKey: ['daily-prefetch', user?.uid, courseId, currentMonthMeta.key],
    queryFn: async () => {
      const { start, end, key } = currentMonthMeta;
      logger.debug('[DailyWorkout.web] prefetchQuery FETCHING', { start, end, key, courseId, userId: user.uid, isOneOnOne });
      const [planned, entries] = await Promise.all([
        firestoreService.getDatesWithPlannedSessions(user.uid, courseId, start, end),
        exerciseHistoryService.getDatesWithCompletedSessionsForCourse(user.uid, courseId, start, end),
      ]);
      const plannedArr = Array.isArray(planned) ? planned : [];
      const entriesArr = Array.isArray(entries) ? entries : [];
      logger.debug('[DailyWorkout.web] prefetchQuery RESULT', {
        plannedDates: plannedArr,
        completedDates: entriesArr,
        plannedCount: plannedArr.length,
        completedCount: entriesArr.length,
      });
      return { planned: plannedArr, entries: entriesArr };
    },
    staleTime: STALE_TIMES.userProfile,
    enabled: !!user?.uid && !!courseId,
  });

  const initialPlannedDates = prefetchedDates?.planned ?? [];
  const initialEntriesDates = prefetchedDates?.entries ?? [];
  const initialDataMonthKey = prefetchedDates ? currentMonthMeta.key : null;

  const wrapperRef = useRef(null);

  const courseFromState = location.state?.course;

  const { data: course, isLoading: loading } = useQuery({
    queryKey: ['programs', courseId],
    queryFn: async () => {
      if (courseFromState) {
        const rawCourse = courseFromState;
        return {
          ...rawCourse,
          id: rawCourse.id || rawCourse.courseId || courseId,
          courseId: rawCourse.courseId || rawCourse.id || courseId,
          title: rawCourse.title || 'Programa sin título',
        };
      }
      const courseData = await firestoreService.getCourse(courseId);
      if (!courseData) return null;
      return {
        ...courseData,
        id: courseData.id || courseId,
        courseId: courseData.id || courseId,
        title: courseData.title || 'Programa sin título',
      };
    },
    staleTime: STALE_TIMES.programStructure,
    enabled: !!courseId,
  });

  const isOneOnOne = course?.deliveryType === 'one_on_one';

  logger.debug('[DailyWorkout.web] RENDER', {
    courseId,
    isOneOnOne,
    deliveryType: course?.deliveryType,
    selectedDate,
    userId: user?.uid,
    courseTitle: course?.title,
    courseFromState: !!courseFromState,
  });

  // Extract accent color from course image
  useEffect(() => {
    const imageUrl = course?.image_url || course?.imageUrl;
    if (!imageUrl || !wrapperRef.current) return;
    extractAccentColor(imageUrl).then((color) => {
      if (color && wrapperRef.current) {
        applyAccentToElement(wrapperRef.current, color);
      }
    });
  }, [course?.image_url, course?.imageUrl]);

  const fetchDatesWithEntries = useCallback(
    async (startDate, endDate) => {
      logger.debug('[DailyWorkout.web] fetchDatesWithEntries CALLED', {
        startDate, endDate, isOneOnOne, userId: user?.uid, courseId,
      });
      if (!user?.uid || !courseId) return [];
      try {
        let result;
        if (isOneOnOne) {
          result = await firestoreService.getDatesWithCompletedPlannedSessions(
            user.uid,
            courseId,
            startDate,
            endDate
          );
        } else {
          result = await exerciseHistoryService.getDatesWithCompletedSessionsForCourse(
            user.uid,
            courseId,
            startDate,
            endDate
          );
        }
        logger.debug('[DailyWorkout.web] fetchDatesWithEntries RESULT', {
          isOneOnOne, dates: result, count: result?.length,
        });
        return result;
      } catch (e) {
        logger.error('[DailyWorkoutScreen] fetchDatesWithEntries error:', e);
        return [];
      }
    },
    [user?.uid, courseId, isOneOnOne]
  );

  const fetchDatesWithPlanned = useCallback(
    async (startDate, endDate) => {
      logger.debug('[DailyWorkout.web] fetchDatesWithPlanned CALLED', {
        startDate, endDate, isOneOnOne, userId: user?.uid, courseId,
      });
      if (!isOneOnOne || !user?.uid || !courseId) return [];
      try {
        const result = await firestoreService.getDatesWithPlannedSessions(
          user.uid,
          courseId,
          startDate,
          endDate
        );
        logger.debug('[DailyWorkout.web] fetchDatesWithPlanned RESULT', {
          dates: result, count: result?.length,
        });
        return result;
      } catch (e) {
        logger.error('[DailyWorkoutScreen] getDatesWithPlannedSessions error:', e);
        return [];
      }
    },
    [isOneOnOne, user?.uid, courseId]
  );

  // ─── Session recovery check (C4) ──────────────────────────────────────────
  const [recoveryCheckpoint, setRecoveryCheckpoint] = useState(null);

  useEffect(() => {
    const currentUser = user;
    if (!currentUser?.uid || !courseId) return;

    // 1. Check localStorage
    let cp = null;
    try {
      const raw = localStorage.getItem('wake_session_checkpoint');
      if (raw) cp = JSON.parse(raw);
    } catch { /* malformed → ignore */ }

    if (cp) {
      // Validate
      if (cp.userId !== currentUser.uid) {
        try { localStorage.removeItem('wake_session_checkpoint'); } catch {}
        import('@react-native-async-storage/async-storage').then(m => m.default.removeItem('current_session').catch(() => {}));
        return;
      }
      if (Date.now() - new Date(cp.savedAt).getTime() > 24 * 60 * 60 * 1000) {
        const completedSetsCount = cp.completedSets
          ? Object.values(cp.completedSets).filter(s => s && typeof s === 'object' && Object.values(s).some(v => v !== '' && v !== null && v !== undefined)).length
          : 0;
        const totalSets = (cp.exercises || []).reduce((sum, ex) => sum + (ex.sets?.length || 0), 0);
        import('../utils/apiClient.js').then(mod => {
          const client = mod.default || mod.apiClient;
          client.post('/workout/session/abandon', {
            sessionId: cp.sessionId || '',
            courseId: cp.courseId || '',
            sessionName: cp.sessionName || '',
            startedAt: cp.startedAt || new Date().toISOString(),
            elapsedSeconds: cp.elapsedSeconds || 0,
            completedSetsCount,
            totalSetsCount: totalSets,
            lastExerciseKey: cp.exercises?.[cp.currentExerciseIndex || 0]?.exerciseId || null,
          }).catch(() => {});
        });
        try { localStorage.removeItem('wake_session_checkpoint'); } catch {}
        // Also clear AsyncStorage so sessionManager.getCurrentSession() doesn't return stale data
        import('@react-native-async-storage/async-storage').then(m => m.default.removeItem('current_session').catch(() => {}));
        return;
      }
      if (cp.courseId !== courseId) return; // Different course — keep checkpoint but don't show
      setRecoveryCheckpoint(cp);
      return;
    }

    // 2. No local checkpoint → check server (cross-device)
    import('../utils/apiClient.js').then(mod => {
      const client = mod.default || mod.apiClient;
      client.get('/workout/session/active').then(res => {
        const serverCp = res?.data?.checkpoint;
        if (!serverCp) return;
        if (serverCp.userId && serverCp.userId !== currentUser.uid) return;
        if (Date.now() - new Date(serverCp.savedAt).getTime() > 24 * 60 * 60 * 1000) return;
        if (serverCp.courseId !== courseId) return;
        setRecoveryCheckpoint(serverCp);
      });
    });
  }, [user, courseId]); // eslint-disable-line react-hooks/exhaustive-deps

  const [recoveryResuming, setRecoveryResuming] = useState(false);
  const [resumeError, setResumeError] = useState(null);

  const handleRecoveryResume = useCallback(async () => {
    if (!recoveryCheckpoint || !course || recoveryResuming) return;
    setRecoveryResuming(true);
    setResumeError(null);
    const cId = course.courseId || course.id || courseId;
    let fullWorkout = null;
    try {
      const state = await sessionService.getCurrentSession(user.uid, cId, {
        manualSessionId: recoveryCheckpoint.sessionId,
        forceRefresh: true,
      });
      if (state?.workout?.exercises?.length) fullWorkout = state.workout;
    } catch (e) {
      logger.error('[DailyWorkout.web] resume: failed to fetch full session', e);
    }

    // Never resume with a stub workout — it strips video_url, objectives,
    // muscle_activation, primary/libraryId, etc., and the execution screen
    // renders in a broken state (no video, no weight suggestion, no RPE).
    if (!fullWorkout) {
      logger.error('[DailyWorkout.web] resume: could not load full workout, aborting');
      setResumeError('No pudimos cargar la sesión completa. Revisa tu conexión e inténtalo de nuevo.');
      setRecoveryResuming(false);
      return;
    }

    navigate(`/course/${cId}/workout/execution`, {
      state: {
        course,
        workout: fullWorkout,
        sessionId: recoveryCheckpoint.sessionId,
        checkpoint: recoveryCheckpoint,
      },
    });
    setRecoveryCheckpoint(null);
    setResumeError(null);
    setRecoveryResuming(false);
  }, [recoveryCheckpoint, course, courseId, navigate, user, recoveryResuming]);

  const handleRecoveryDiscard = useCallback(async () => {
    if (recoveryCheckpoint) {
      const totalSets = (recoveryCheckpoint.exercises || []).reduce(
        (sum, ex) => sum + (ex.sets?.length || 0), 0
      );
      const completedSetsCount = recoveryCheckpoint.completedSets
        ? Object.values(recoveryCheckpoint.completedSets).filter(s => s && typeof s === 'object' && Object.values(s).some(v => v !== '' && v !== null && v !== undefined)).length
        : 0;
      import('../utils/apiClient.js').then(mod => {
        const client = mod.default || mod.apiClient;
        client.post('/workout/session/abandon', {
          sessionId: recoveryCheckpoint.sessionId || '',
          courseId: recoveryCheckpoint.courseId || '',
          sessionName: recoveryCheckpoint.sessionName || '',
          startedAt: recoveryCheckpoint.startedAt || new Date().toISOString(),
          elapsedSeconds: recoveryCheckpoint.elapsedSeconds || 0,
          completedSetsCount,
          totalSetsCount: totalSets,
          lastExerciseKey: recoveryCheckpoint.exercises?.[recoveryCheckpoint.currentExerciseIndex || 0]?.exerciseId || null,
        }).catch(() => {});
      });
    }
    try { localStorage.removeItem('wake_session_checkpoint'); } catch {}
    // Clear AsyncStorage current_session (written by sessionRecoveryService on startup)
    // so sessionManager.getCurrentSession() doesn't return the abandoned session
    try {
      const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
      await AsyncStorage.removeItem('current_session');
    } catch {}
    setRecoveryCheckpoint(null);
    setResumeError(null);
  }, [recoveryCheckpoint]);

  const navigation = {
    navigate: (routeName, params) => {
      const routeMap = {
        'WorkoutExecution': () => {
          const cId = params?.course?.courseId || params?.course?.id || courseId;
          navigate(`/course/${cId}/workout/execution`, { state: params });
        },
        'WorkoutCompletion': () => {
          const cId = params?.course?.courseId || params?.course?.id || courseId;
          navigate(`/course/${cId}/workout/completion`, { state: params });
        },
        'Warmup': () => navigate('/warmup', { state: params }),
        'CourseStructure': () => {
          const cId = params?.course?.courseId || params?.course?.id || courseId;
          navigate(`/course/${cId}/structure`, { state: params });
        },
        'CourseDetail': () => {
          const cId = params?.course?.courseId || params?.course?.id || courseId;
          navigate(`/course/${cId}`, { state: params });
        },
        'Main': () => navigate('/'),
        'MainScreen': () => navigate('/'),
      };

      if (routeMap[routeName]) {
        routeMap[routeName]();
      } else {
        const path = `/${routeName.toLowerCase()}`;
        navigate(path, { state: params });
      }
    },
    goBack: () => navigate(-1),
    setParams: (params) => {
    },
  };

  const route = {
    params: {
      course: course,
      ...(location.state || {})
    }
  };

  if (loading || authLoading || !user) {
    return <LoadingScreen />;
  }

  if (!course) {
    return (
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        height: '100vh',
        backgroundColor: '#1a1a1a',
        color: '#ffffff'
      }}>
        <p>Programa no encontrado</p>
      </div>
    );
  }

  const currentMonthKey = (() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  })();

  const passInitialPlanned = initialDataMonthKey === currentMonthKey ? initialPlannedDates : undefined;
  const passInitialEntries = initialDataMonthKey === currentMonthKey && !isOneOnOne ? initialEntriesDates : undefined;
  const renderBeforeContent = (
    <View style={dateRowStyle.dateRow}>
      <WeekDateSelector
        selectedDate={selectedDate}
        onDateChange={handleDateChange}
        fetchDatesWithEntries={fetchDatesWithEntries}
        fetchDatesWithPlanned={isOneOnOne ? fetchDatesWithPlanned : undefined}
        initialDatesWithPlanned={passInitialPlanned}
        initialDatesWithEntries={passInitialEntries}
        initialMonthKey={initialDataMonthKey}
      />
    </View>
  );

  return (
    <div
      ref={wrapperRef}
      className={dateTransitioning ? 'wake-date-transition' : undefined}
      style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', position: 'relative', overflow: 'clip' }}
    >
      <div className="w-orb w-orb-1" />
      <div className="w-orb w-orb-2" />
      <div className="w-orb w-orb-3" />
      {recoveryCheckpoint && (
        <RecoveryModal
          checkpoint={recoveryCheckpoint}
          onResume={handleRecoveryResume}
          onDiscard={handleRecoveryDiscard}
          loading={recoveryResuming}
          error={resumeError}
        />
      )}
      <DailyWorkoutScreenBase
        navigation={navigation}
        route={route}
        selectedDate={selectedDate}
        onDateChange={handleDateChange}
        showSessionsList={!isOneOnOne}
        renderBeforeContent={renderBeforeContent}
      />
    </div>
  );
};

export default DailyWorkoutScreen;
