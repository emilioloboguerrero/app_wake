import React, { useMemo } from 'react';
import { View, Text, StyleSheet, useWindowDimensions, TouchableOpacity, ScrollView } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import WakeLoader from './WakeLoader';
import apiClient from '../utils/apiClient';
import { cacheConfig } from '../config/queryClient';
import { getMuscleDisplayName } from '../constants/muscles';
import { getMondayWeek, getWeekDates } from '../utils/weekCalculation';
import { getMuscleColorForText } from '../utils/muscleColorUtils';
import SvgInfo from '../components/icons/SvgInfo';
import muscleVolumeInfoService from '../services/muscleVolumeInfoService';

const toYMD = (d) => d.toISOString().split('T')[0];

const WeeklyMuscleVolumeCard = ({ userId, sessionMuscleVolumes, selectedWeek, weekDisplayName, showCurrentWeekLabel = false, onInfoPress }) => {
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();

  // Create styles with current dimensions - memoized to prevent recalculation
  const styles = useMemo(
    () => createStyles(screenWidth, screenHeight),
    [screenWidth, screenHeight],
  );

  const targetWeek = selectedWeek || getMondayWeek();
  const { start, end } = getWeekDates(targetWeek);

  const { data: volumeData, isLoading: loading } = useQuery({
    queryKey: ['analytics', 'weekly-volume', userId, targetWeek],
    queryFn: () =>
      apiClient.get('/analytics/weekly-volume', {
        params: { startDate: toYMD(start), endDate: toYMD(end) },
      }),
    enabled: !!userId,
    ...cacheConfig.analytics,
  });

  const weeklyVolumes = useMemo(() => {
    const weeks = volumeData?.data || [];
    const weekEntry = weeks.find((w) => w.weekKey === targetWeek);
    const apiVolumes = weekEntry?.muscleVolumes || weekEntry?.muscleBreakdown || {};

    // If we have API data, use it (already includes all sessions this week)
    if (Object.keys(apiVolumes).length > 0) return apiVolumes;

    // Fall back to session volumes if API returned nothing
    return sessionMuscleVolumes || {};
  }, [sessionMuscleVolumes, volumeData, targetWeek]);

  const getSubtitle = () => {
    if (showCurrentWeekLabel) {
      return "Esta semana";
    }
    return weekDisplayName || "Semana del ...";
  };

  if (loading && !sessionMuscleVolumes) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Series efectivas</Text>
        <Text style={styles.subtitle}>{getSubtitle()}</Text>
        <View style={styles.loadingContainer}>
          <WakeLoader size={40} />
        </View>
      </View>
    );
  }

  if (Object.keys(weeklyVolumes).length === 0) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Series efectivas</Text>
        <Text style={styles.subtitle}>{getSubtitle()}</Text>
        <Text style={styles.emptyText}>
          No hay datos de entrenamientos para esta semana.
        </Text>
      </View>
    );
  }

  // Sort muscles by volume (highest first)
  const sortedMuscles = Object.entries(weeklyVolumes)
    .sort(([, a], [, b]) => b - a);

  const hasInfo = muscleVolumeInfoService.hasInfo('series_efectivas');

  return (
    <View style={styles.container}>
      <TouchableOpacity 
        style={styles.headerTouchable}
        onPress={() => onInfoPress && onInfoPress('series_efectivas')}
        disabled={!hasInfo}
        activeOpacity={hasInfo ? 0.7 : 1}
      >
        <Text style={styles.title}>Series efectivas</Text>
        <Text style={styles.subtitle}>{getSubtitle()}</Text>
        
        {/* Info icon indicator */}
        {hasInfo && (
          <View style={styles.infoIconContainer}>
            <SvgInfo width={14} height={14} color="rgba(255, 255, 255, 0.6)" />
          </View>
        )}
      </TouchableOpacity>
      
      <View style={styles.musclesListContainer}>
        <ScrollView 
          style={styles.musclesListScrollView}
          contentContainerStyle={styles.musclesList}
          showsVerticalScrollIndicator={false}
        >
          {sortedMuscles.map(([muscle, sets]) => {
            const textColor = getMuscleColorForText(sets);
            return (
              <View key={muscle} style={styles.muscleRow}>
                <Text style={styles.muscleName} numberOfLines={1} ellipsizeMode="tail">{getMuscleDisplayName(muscle)}</Text>
                <Text style={[styles.muscleVolume, { color: textColor.color, opacity: textColor.opacity }]}>
                  {sets.toFixed(1)} sets
                </Text>
              </View>
            );
          })}
        </ScrollView>
        
        {/* Scroll indicator */}
        <View style={styles.scrollIndicator}>
          <Text style={styles.scrollIndicatorText}>Desliza</Text>
        </View>
      </View>
    </View>
  );
};

const createStyles = (screenWidth, screenHeight) => StyleSheet.create({
  container: {
    backgroundColor: '#2a2a2a',
    borderRadius: Math.max(12, screenWidth * 0.04),
    padding: Math.max(20, screenWidth * 0.05),
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    shadowColor: 'rgba(255, 255, 255, 0.4)',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 2,
    elevation: 2,
    overflow: 'visible',
    height: 500, // Restored original muscle card size
    width: '100%', // Ensure it fills the parent container
  },
  title: {
    color: '#ffffff',
    fontSize: Math.min(screenWidth * 0.045, 18),
    fontWeight: '600',
    marginBottom: Math.max(4, screenHeight * 0.005),
    textAlign: 'left',
    paddingLeft: Math.max(10, screenWidth * 0.02),
  },
  subtitle: {
    color: '#ffffff',
    fontSize: Math.min(screenWidth * 0.035, 14),
    opacity: 0.6,
    marginBottom: Math.max(16, screenHeight * 0.02),
    textAlign: 'left',
    paddingLeft: Math.max(10, screenWidth * 0.02),
  },
  headerTouchable: {
    position: 'relative',
  },
  musclesListContainer: {
    flex: 1,
    position: 'relative',
  },
  musclesListScrollView: {
    flex: 1,
  },
  musclesList: {
    gap: Math.max(10, screenHeight * 0.012),
    paddingBottom: 24,
  },
  scrollIndicator: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 35,
    backgroundColor: 'rgba(42, 42, 42, 0.8)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollIndicatorText: {
    fontSize: 11,
    fontWeight: '500',
    color: 'rgba(255, 255, 255, 0.5)',
    textAlign: 'center',
  },
  muscleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  muscleName: {
    color: '#ffffff',
    fontSize: Math.min(screenWidth * 0.04, 16),
    fontWeight: '500',
    opacity: 0.9,
    flex: 1,
    marginRight: 8,
  },
  muscleVolume: {
    fontSize: Math.min(screenWidth * 0.04, 16),
    fontWeight: '600',
  },
  loadingContainer: {
    paddingVertical: Math.max(40, screenHeight * 0.05),
    alignItems: 'center',
  },
  emptyText: {
    color: '#ffffff',
    fontSize: Math.min(screenWidth * 0.035, 14),
    opacity: 0.6,
    textAlign: 'center',
    paddingVertical: Math.max(20, screenHeight * 0.025),
    lineHeight: Math.max(20, screenHeight * 0.025),
  },
  // Info icon container (top-right of card)
  infoIconContainer: {
    position: 'absolute',
    top: Math.max(16, screenHeight * 0.02),
    right: Math.max(16, screenWidth * 0.04),
    zIndex: 10,
  },
});

export default WeeklyMuscleVolumeCard;

