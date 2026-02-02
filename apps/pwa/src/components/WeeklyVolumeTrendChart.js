import React, { useMemo } from 'react';
import { View, Text, StyleSheet, useWindowDimensions } from 'react-native';
import { getMondayWeek, formatWeekDisplay } from '../utils/weekCalculation';
import SvgArrowUpSm from './icons/vectors_fig/Arrow/ArrowUpSm';
import SvgArrowDownLeftSm from './icons/vectors_fig/Arrow/ArrowDownLeftSm';

const WeeklyVolumeTrendChart = ({ weeklyMuscleVolume }) => {
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  
  // Create styles with current dimensions - memoized to prevent recalculation
  const styles = useMemo(
    () => createStyles(screenWidth, screenHeight),
    [screenWidth, screenHeight],
  );
  
  // Calculate volume tendencies
  const calculateVolumeTendencies = useMemo(() => {
    const weeks = [];
    
    // Generate last 5 weeks
    for (let i = 4; i >= 0; i--) {
      const weekDate = new Date();
      weekDate.setDate(weekDate.getDate() - (i * 7));
      const weekKey = getMondayWeek(weekDate);
      weeks.push(weekKey);
    }
    
    // Process data for each week
    const weeklyData = weeks.map(weekKey => {
      const weekData = weeklyMuscleVolume[weekKey] || {};
      
      // Calculate total volume for the week
      const totalVolume = Object.values(weekData).reduce((sum, volume) => {
        if (typeof volume === 'number' && !isNaN(volume) && volume >= 0) {
          return sum + volume;
        }
        return sum;
      }, 0);
      
      return {
        weekKey,
        volume: totalVolume,
        displayName: formatWeekDisplay(weekKey)
      };
    });

    const validWeeks = weeklyData.filter(w => w.volume > 0);

    if (validWeeks.length < 2) {
      return {
        currentAverage: 0,
        previousAverage: 0,
        percentageChange: 0,
        trend: 'neutral'
      };
    }

    // Sort weeks by date (newest first) - reverse the array since weeks are generated oldest to newest
    const sortedWeeks = [...validWeeks].reverse();
    
    const currentWeek = sortedWeeks[0];  // Most recent week
    const previousWeeks = sortedWeeks.slice(1, 4); // 3 weeks before that

    const currentAverage = currentWeek ? Math.round(currentWeek.volume) : 0;

    const previousAverage = previousWeeks.length > 0
      ? Math.round(previousWeeks.reduce((sum, w) => sum + w.volume, 0) / previousWeeks.length)
      : currentAverage;

    const percentageChange = previousAverage > 0
      ? Math.round(((currentAverage - previousAverage) / previousAverage) * 100)
      : 0;

    return {
      currentAverage,
      previousAverage,
      percentageChange,
      trend: percentageChange > 0 ? 'up' : percentageChange < 0 ? 'down' : 'neutral'
    };
  }, [weeklyMuscleVolume]);

  const tendencies = calculateVolumeTendencies;

  return (
    <View style={styles.tendenciesCard}>
      <View style={styles.tendenciesHeader}>
        <Text style={styles.tendenciesTitle}>Volumen Semanal</Text>
        <Text style={styles.tendenciesSubtitle}>Semana pasada vs promedio</Text>
      </View>

      <View style={styles.tendenciesContent}>
        <View style={styles.tendenciesMain}>
          <Text style={styles.tendenciesNumber}>{tendencies.currentAverage}</Text>
          <Text style={styles.tendenciesUnit}>series</Text>
        </View>

        <View style={styles.tendenciesChange}>
          <View style={styles.tendenciesChangeRow}>
            <Text style={[
              styles.tendenciesPercentage,
              tendencies.trend === 'up' && styles.tendenciesPercentageUp,
              tendencies.trend === 'down' && styles.tendenciesPercentageDown
            ]}>
              {tendencies.percentageChange > 0 ? '+' : ''}{tendencies.percentageChange}%
            </Text>
            {tendencies.trend === 'up' && (
              <SvgArrowUpSm width={16} height={16} stroke="#4CAF50" />
            )}
            {tendencies.trend === 'down' && (
              <SvgArrowDownLeftSm width={16} height={16} stroke="#F44336" />
            )}
          </View>
          <Text style={styles.tendenciesChangeLabel}>
            vs. anteriores
          </Text>
        </View>
      </View>
    </View>
  );
};

const createStyles = (screenWidth, screenHeight) => StyleSheet.create({
  tendenciesCard: {
    backgroundColor: '#2a2a2a',
    borderRadius: Math.max(12, screenWidth * 0.04),
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    shadowColor: 'rgba(255, 255, 255, 0.4)',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 2,
    elevation: 10,
    padding: Math.max(20, screenWidth * 0.05),
    marginBottom: Math.max(20, screenHeight * 0.025),
  },
  tendenciesHeader: {
    marginBottom: Math.max(12, screenHeight * 0.015),
  },
  tendenciesTitle: {
    color: '#ffffff',
    fontSize: Math.min(screenWidth * 0.045, 18),
    fontWeight: '600',
    textAlign: 'left',
  },
  tendenciesSubtitle: {
    color: 'rgba(255, 255, 255, 0.6)',
    fontSize: Math.min(screenWidth * 0.035, 14),
    fontWeight: '400',
    textAlign: 'left',
    marginTop: Math.max(2, screenHeight * 0.002),
  },
  tendenciesContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  tendenciesMain: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  tendenciesNumber: {
    fontSize: Math.min(screenWidth * 0.08, 32),
    fontWeight: '700',
    color: 'rgba(191, 168, 77, 1)',
    marginRight: Math.max(4, screenWidth * 0.01),
  },
  tendenciesUnit: {
    color: 'rgba(255, 255, 255, 0.6)',
    fontSize: Math.min(screenWidth * 0.04, 16),
    fontWeight: '500',
    textAlign: 'left',
    marginLeft: Math.max(4, screenWidth * 0.01),
  },
  tendenciesChange: {
    alignItems: 'flex-end',
  },
  tendenciesChangeRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  tendenciesPercentage: {
    color: 'rgba(255, 255, 255, 0.6)',
    fontSize: Math.min(screenWidth * 0.04, 16),
    fontWeight: '600',
    textAlign: 'right',
    marginRight: Math.max(4, screenWidth * 0.01),
  },
  tendenciesPercentageUp: {
    color: '#4CAF50',
  },
  tendenciesPercentageDown: {
    color: '#F44336',
  },
  tendenciesChangeLabel: {
    color: 'rgba(255, 255, 255, 0.4)',
    fontSize: Math.min(screenWidth * 0.03, 12),
    fontWeight: '400',
    textAlign: 'right',
    marginTop: Math.max(2, screenHeight * 0.002),
  },
});

export default WeeklyVolumeTrendChart;