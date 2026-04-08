// Native wrapper for DailyWorkoutScreen - provides date selector with calendar dots
import React, { useState, useCallback } from 'react';
import { View, StyleSheet } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import apiService from '../services/apiService';
import exerciseHistoryService from '../services/exerciseHistoryService';
import { useAuth } from '../contexts/AuthContext';
import WeekDateSelector, { toYYYYMMDD } from '../components/WeekDateSelector';
import { cacheConfig } from '../config/queryClient';

const _now = new Date();
const _y = _now.getFullYear();
const _m = _now.getMonth();
const CURRENT_MONTH_KEY = `${_y}-${String(_m + 1).padStart(2, '0')}`;
const CURRENT_MONTH_START = `${_y}-${String(_m + 1).padStart(2, '0')}-01`;
const CURRENT_MONTH_END = `${_y}-${String(_m + 1).padStart(2, '0')}-${String(new Date(_y, _m + 1, 0).getDate()).padStart(2, '0')}`;

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

  const { data: initialPlannedDates } = useQuery({
    queryKey: ['workout', 'calendar', 'planned', courseId, CURRENT_MONTH_KEY],
    queryFn: () => apiService.getDatesWithPlannedSessions(user.uid, courseId, CURRENT_MONTH_START, CURRENT_MONTH_END),
    enabled: !!user?.uid && !!courseId && isOneOnOne,
    ...cacheConfig.programStructure,
  });

  const { data: initialEntriesDates } = useQuery({
    queryKey: ['workout', 'calendar', 'entries', courseId, CURRENT_MONTH_KEY],
    queryFn: () => exerciseHistoryService.getDatesWithCompletedSessionsForCourse(user.uid, courseId, CURRENT_MONTH_START, CURRENT_MONTH_END),
    enabled: !!user?.uid && !!courseId && !isOneOnOne,
    ...cacheConfig.programStructure,
  });

  const fetchDatesWithEntries = useCallback(
    async (startDate, endDate) => {
      if (!user?.uid || !courseId) return [];
      try {
        if (isOneOnOne) {
          return await apiService.getDatesWithCompletedPlannedSessions(
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
        return await apiService.getDatesWithPlannedSessions(
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

  const renderBeforeContent = (
    <View style={dateRowStyle.dateRow}>
      <WeekDateSelector
        selectedDate={selectedDate}
        onDateChange={setSelectedDate}
        fetchDatesWithEntries={fetchDatesWithEntries}
        fetchDatesWithPlanned={isOneOnOne ? fetchDatesWithPlanned : undefined}
        initialDatesWithPlanned={initialPlannedDates}
        initialDatesWithEntries={initialEntriesDates}
        initialMonthKey={CURRENT_MONTH_KEY}
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
