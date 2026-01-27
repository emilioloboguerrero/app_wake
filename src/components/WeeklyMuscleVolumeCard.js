import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, useWindowDimensions, ActivityIndicator, TouchableOpacity, ScrollView } from 'react-native';
import { doc, getDoc } from 'firebase/firestore';
import { firestore } from '../config/firebase';
import { getMuscleDisplayName } from '../constants/muscles';
import { getMondayWeek } from '../utils/weekCalculation';
import { getMuscleColorForText } from '../utils/muscleColorUtils';
import SvgInfo from '../components/icons/SvgInfo';
import muscleVolumeInfoService from '../services/muscleVolumeInfoService';
import logger from '../utils/logger';

const WeeklyMuscleVolumeCard = ({ userId, sessionMuscleVolumes, selectedWeek, weekDisplayName, showCurrentWeekLabel = false, onInfoPress }) => {
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const [weeklyVolumes, setWeeklyVolumes] = useState(null);
  const [loading, setLoading] = useState(true);
  
  // Create styles with current dimensions - memoized to prevent recalculation
  const styles = useMemo(
    () => createStyles(screenWidth, screenHeight),
    [screenWidth, screenHeight],
  );

  // Log userId whenever props change (to verify it is passed correctly to this card)
  useEffect(() => {
    logger.log('[WeeklyMuscleVolumeCard] Props received:', {
      hasUserId: !!userId,
      userId: userId ?? 'null/undefined',
      userIdType: typeof userId,
      selectedWeek: selectedWeek ?? 'null',
    });
  }, [userId, selectedWeek]);

  useEffect(() => {
    loadWeeklyVolumes();
  }, [userId, selectedWeek]);

  const loadWeeklyVolumes = async () => {
    try {
      setLoading(true);
      const targetWeek = selectedWeek || getMondayWeek(); // Use selectedWeek if provided, otherwise current week
      logger.log('[WeeklyMuscleVolumeCard] loadWeeklyVolumes called with userId:', userId ?? 'null/undefined', 'targetWeek:', targetWeek);
      if (!userId) {
        logger.warn('[WeeklyMuscleVolumeCard] No userId – cannot load weekly volumes');
        setWeeklyVolumes({});
        setLoading(false);
        return;
      }
      const userDocRef = doc(firestore, 'users', userId);
      const userDoc = await getDoc(userDocRef);
      
      if (userDoc.exists()) {
        const data = userDoc.data();
        const weekData = data.weeklyMuscleVolume?.[targetWeek] || {};
        
        // For history view, always use the fetched weekData from DB
        // For current week, it already includes the current session's volume
        setWeeklyVolumes(weekData);
        logger.log('✅ Weekly muscle volumes loaded from DB for week:', targetWeek, weekData);
      } else {
        // If no user document, use empty object for history
        setWeeklyVolumes({});
      }
    } catch (error) {
      logger.error('❌ Error loading weekly muscle volumes:', error);
      setWeeklyVolumes({});
    } finally {
      setLoading(false);
    }
  };

  const getSubtitle = () => {
    if (showCurrentWeekLabel) {
      return "Esta semana";
    }
    return weekDisplayName || "Semana del ...";
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Series efectivas</Text>
        <Text style={styles.subtitle}>{getSubtitle()}</Text>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="small" color="rgba(191, 168, 77, 1)" />
        </View>
      </View>
    );
  }

  if (!weeklyVolumes || Object.keys(weeklyVolumes).length === 0) {
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

