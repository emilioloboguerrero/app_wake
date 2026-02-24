// Web wrapper for DailyWorkoutScreen - provides React Router navigation and date selector
import React, { useState, useCallback } from 'react';
import { View, StyleSheet } from 'react-native';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
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

  const [course, setCourse] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const hasFetchedRef = React.useRef(false);

  const [selectedDate, setSelectedDate] = useState(() => toYYYYMMDD(new Date()));

  const isOneOnOne = course?.deliveryType === 'one_on_one';

  const [initialPlannedDates, setInitialPlannedDates] = useState([]);
  const [initialEntriesDates, setInitialEntriesDates] = useState([]);
  const [initialDataMonthKey, setInitialDataMonthKey] = useState(null);

  React.useEffect(() => {
    if (!user?.uid || !courseId) return;
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth();
    const key = `${y}-${String(m + 1).padStart(2, '0')}`;
    const start = `${y}-${String(m + 1).padStart(2, '0')}-01`;
    const lastDay = new Date(y, m + 1, 0).getDate();
    const end = `${y}-${String(m + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
    logger.log('[DailyWorkoutScreen.web] pre-fetch starting', { userId: user.uid, courseId, key, start, end });
    let cancelled = false;
    Promise.all([
      firestoreService.getDatesWithPlannedSessions(user.uid, courseId, start, end),
      exerciseHistoryService.getDatesWithCompletedSessionsForCourse(user.uid, courseId, start, end)
    ]).then(([planned, entries]) => {
      if (!cancelled) {
        const plannedArr = Array.isArray(planned) ? planned : [];
        const entriesArr = Array.isArray(entries) ? entries : [];
        logger.log('[DailyWorkoutScreen.web] pre-fetch resolved', { key, plannedCount: plannedArr.length, entriesCount: entriesArr.length, plannedSample: plannedArr.slice(0, 5) });
        setInitialPlannedDates(plannedArr);
        setInitialEntriesDates(entriesArr);
        setInitialDataMonthKey(key);
      }
    }).catch((e) => {
      logger.error('[DailyWorkoutScreen] pre-fetch planned/entries error:', e);
    });
    return () => { cancelled = true; };
  }, [user?.uid, courseId]);

  const fetchDatesWithEntries = useCallback(
    async (startDate, endDate) => {
      if (!user?.uid || !courseId) return [];
      try {
        return await exerciseHistoryService.getDatesWithCompletedSessionsForCourse(
          user.uid,
          courseId,
          startDate,
          endDate
        );
      } catch (e) {
        logger.error('[DailyWorkoutScreen] getDatesWithCompletedSessionsForCourse error:', e);
        return [];
      }
    },
    [user?.uid, courseId]
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

  React.useEffect(() => {
    if (hasFetchedRef.current) return;

    const fetchCourse = async () => {
      hasFetchedRef.current = true;

      if (location.state?.course) {
        const rawCourse = location.state.course;
        const transformedCourse = {
          id: rawCourse.id || rawCourse.courseId || courseId,
          courseId: rawCourse.courseId || rawCourse.id || courseId,
          title: rawCourse.title || 'Programa sin título',
          ...rawCourse
        };
        setCourse(transformedCourse);
        setLoading(false);
        return;
      }

      if (!courseId) {
        setLoading(false);
        return;
      }

      try {
        const courseData = await firestoreService.getCourse(courseId);
        if (courseData) {
          const transformedCourse = {
            id: courseData.id || courseId,
            courseId: courseData.id || courseId,
            title: courseData.title || 'Programa sin título',
            ...courseData
          };
          setCourse(transformedCourse);
        }
      } catch (error) {
        logger.error('Error fetching course:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchCourse();
  }, [courseId, location.state?.course]);

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
        'WorkoutExercises': () => {
          const cId = params?.course?.courseId || params?.course?.id || courseId;
          navigate(`/course/${cId}/exercises`, { state: params });
        },
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
  const passInitialEntries = initialDataMonthKey === currentMonthKey ? initialEntriesDates : undefined;
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
        onDateChange={setSelectedDate}
        fetchDatesWithEntries={fetchDatesWithEntries}
        fetchDatesWithPlanned={isOneOnOne ? fetchDatesWithPlanned : undefined}
        initialDatesWithPlanned={passInitialPlanned}
        initialDatesWithEntries={passInitialEntries}
        initialMonthKey={initialDataMonthKey}
      />
    </View>
  );

  return (
    <DailyWorkoutScreenBase
      navigation={navigation}
      route={route}
      selectedDate={selectedDate}
      onDateChange={setSelectedDate}
      showSessionsList={!isOneOnOne}
      renderBeforeContent={renderBeforeContent}
    />
  );
};

export default DailyWorkoutScreen;
