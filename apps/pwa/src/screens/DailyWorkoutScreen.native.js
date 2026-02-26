// Native wrapper for DailyWorkoutScreen - provides date selector with calendar dots
import React, { useState, useCallback } from 'react';
import { View, StyleSheet } from 'react-native';
import firestoreService from '../services/firestoreService';
import exerciseHistoryService from '../services/exerciseHistoryService';
import { useAuth } from '../contexts/AuthContext';
import WeekDateSelector, { toYYYYMMDD } from '../components/WeekDateSelector';
import logger from '../utils/logger';

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

export default function DailyWorkoutScreen({ navigation, route }) {
  const { course } = route.params;
  const { user } = useAuth();

  const [selectedDate, setSelectedDate] = useState(() => toYYYYMMDD(new Date()));
  const courseId = course?.courseId || course?.id;
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
    logger.debug('[DailyWorkoutScreen.native] pre-fetch starting', { userId: user.uid, courseId, key, start, end });
    let cancelled = false;
    Promise.all([
      firestoreService.getDatesWithPlannedSessions(user.uid, courseId, start, end),
      exerciseHistoryService.getDatesWithCompletedSessionsForCourse(user.uid, courseId, start, end),
    ]).then(([planned, entries]) => {
      if (!cancelled) {
        const plannedArr = Array.isArray(planned) ? planned : [];
        const entriesArr = Array.isArray(entries) ? entries : [];
        logger.debug('[DailyWorkoutScreen.native] pre-fetch resolved', { key, plannedCount: plannedArr.length, entriesCount: entriesArr.length, plannedSample: plannedArr.slice(0, 5) });
        setInitialPlannedDates(plannedArr);
        setInitialEntriesDates(entriesArr);
        setInitialDataMonthKey(key);
      }
    }).catch((e) => {
      logger.error('[DailyWorkoutScreen.native] pre-fetch planned/entries error:', e);
    });
    return () => { cancelled = true; };
  }, [user?.uid, courseId]);

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
        return [];
      }
    },
    [isOneOnOne, user?.uid, courseId]
  );

  const currentMonthKey = (() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  })();

  const passInitialPlanned = initialDataMonthKey === currentMonthKey ? initialPlannedDates : undefined;
  const passInitialEntries = initialDataMonthKey === currentMonthKey && !isOneOnOne ? initialEntriesDates : undefined;
  logger.debug('[DailyWorkoutScreen.native] WeekDateSelector props', {
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
}
