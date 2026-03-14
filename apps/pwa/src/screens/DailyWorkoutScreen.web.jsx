// Web wrapper for DailyWorkoutScreen - provides React Router navigation and date selector
import React, { useState, useCallback } from 'react';
import { View, StyleSheet } from 'react-native';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import LoadingScreen from './LoadingScreen';
import logger from '../utils/logger';
import firestoreService from '../services/firestoreService';
import exerciseHistoryService from '../services/exerciseHistoryService';
import { useAuth } from '../contexts/AuthContext';
import { auth } from '../config/firebase';
import WeekDateSelector, { toYYYYMMDD } from '../components/WeekDateSelector.web';

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
  const { user: contextUser } = useAuth();
  const [fallbackUser, setFallbackUser] = useState(null);
  const user = contextUser || fallbackUser;

  React.useEffect(() => {
    if (!contextUser && auth?.currentUser) {
      setFallbackUser(auth.currentUser);
    } else if (contextUser) {
      setFallbackUser(null);
    }
  }, [contextUser]);

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

  const isOneOnOne = course?.deliveryType === 'one_on_one';

  const currentMonthMeta = React.useMemo(() => {
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth();
    const key = `${y}-${String(m + 1).padStart(2, '0')}`;
    const start = `${y}-${String(m + 1).padStart(2, '0')}-01`;
    const lastDay = new Date(y, m + 1, 0).getDate();
    const end = `${y}-${String(m + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
    return { key, start, end };
  }, []);

  const { data: prefetchedDates } = useQuery({
    queryKey: ['daily-prefetch', user?.uid, courseId, currentMonthMeta.key],
    queryFn: async () => {
      const { start, end, key } = currentMonthMeta;
      logger.log('[DailyWorkoutScreen.web] pre-fetch starting', { userId: user.uid, courseId, key, start, end });
      const [planned, entries] = await Promise.all([
        firestoreService.getDatesWithPlannedSessions(user.uid, courseId, start, end),
        exerciseHistoryService.getDatesWithCompletedSessionsForCourse(user.uid, courseId, start, end),
      ]);
      const plannedArr = Array.isArray(planned) ? planned : [];
      const entriesArr = Array.isArray(entries) ? entries : [];
      logger.log('[DailyWorkoutScreen.web] pre-fetch resolved', { key, plannedCount: plannedArr.length, entriesCount: entriesArr.length, plannedSample: plannedArr.slice(0, 5) });
      return { planned: plannedArr, entries: entriesArr };
    },
    staleTime: 5 * 60 * 1000,
    enabled: !!user?.uid && !!courseId,
  });

  const initialPlannedDates = prefetchedDates?.planned ?? [];
  const initialEntriesDates = prefetchedDates?.entries ?? [];
  const initialDataMonthKey = prefetchedDates ? currentMonthMeta.key : null;

  const fetchDatesWithEntries = useCallback(
    async (startDate, endDate) => {
      if (!user?.uid || !courseId) return [];
      try {
        if (isOneOnOne) {
          return await firestoreService.getDatesWithCompletedPlannedSessions(
            user.uid,
            courseId,
            startDate,
            endDate
          );
        }
        return await exerciseHistoryService.getDatesWithCompletedSessionsForCourse(
          user.uid,
          courseId,
          startDate,
          endDate
        );
      } catch (e) {
        logger.error('[DailyWorkoutScreen] fetchDatesWithEntries error:', e);
        return [];
      }
    },
    [user?.uid, courseId, isOneOnOne]
  );

  const fetchDatesWithPlanned = useCallback(
    async (startDate, endDate) => {
      if (!isOneOnOne || !user?.uid || !courseId) return [];
      try {
        return await firestoreService.getDatesWithPlannedSessions(
          user.uid,
          courseId,
          startDate,
          endDate
        );
      } catch (e) {
        logger.error('[DailyWorkoutScreen] getDatesWithPlannedSessions error:', e);
        return [];
      }
    },
    [isOneOnOne, user?.uid, courseId]
  );

  const courseFromState = location.state?.course;

  const { data: course, isLoading: loading } = useQuery({
    queryKey: ['programs', courseId],
    queryFn: async () => {
      if (courseFromState) {
        const rawCourse = courseFromState;
        return {
          id: rawCourse.id || rawCourse.courseId || courseId,
          courseId: rawCourse.courseId || rawCourse.id || courseId,
          title: rawCourse.title || 'Programa sin título',
          ...rawCourse,
        };
      }
      const courseData = await firestoreService.getCourse(courseId);
      if (!courseData) return null;
      return {
        id: courseData.id || courseId,
        courseId: courseData.id || courseId,
        title: courseData.title || 'Programa sin título',
        ...courseData,
      };
    },
    staleTime: 30 * 60 * 1000,
    enabled: !!courseId,
  });

  const navigation = {
    navigate: (routeName, params) => {
      logger.log('🧭 [DailyWorkout Web] Navigating to:', routeName, params);

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
      logger.log('🧭 [DailyWorkout Web] setParams:', params);
    },
  };

  const route = {
    params: {
      course: course,
      ...(location.state || {})
    }
  };

  if (loading) {
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
  logger.log('[DailyWorkoutScreen.web] WeekDateSelector props', {
    isOneOnOne,
    currentMonthKey,
    initialDataMonthKey,
    monthMatch: initialDataMonthKey === currentMonthKey,
    initialPlannedCount: passInitialPlanned?.length ?? 'undefined',
    initialEntriesCount: passInitialEntries?.length ?? 'undefined',
    hasFetchPlanned: !!fetchDatesWithPlanned,
  });

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
      className={dateTransitioning ? 'wake-date-transition' : undefined}
      style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}
    >
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
