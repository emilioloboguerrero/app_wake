import React, { useState, useMemo, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, useWindowDimensions, ScrollView, Modal, Pressable } from 'react-native';
import { PieChart } from 'react-native-chart-kit';
import { getWeeksBetween } from '../utils/weekCalculation';
import { getMuscleDisplayName } from '../constants/muscles';
import SvgChevronDown from './icons/vectors_fig/Arrow/ChevronDown';
import SvgChevronRight from './icons/vectors_fig/Arrow/ChevronRight';

const MuscleVolumeStats = ({ weeklyMuscleVolume }) => {
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  
  // Create styles with current dimensions - memoized to prevent recalculation
  const styles = useMemo(
    () => createStyles(screenWidth, screenHeight),
    [screenWidth, screenHeight],
  );
  
  const [selectedPeriod, setSelectedPeriod] = useState('month');
  const [isPeriodDropdownVisible, setIsPeriodDropdownVisible] = useState(false);
  const [isLegendPopupVisible, setIsLegendPopupVisible] = useState(false);
  const [cachedData, setCachedData] = useState({
    month: null,
    '3months': null,
    '6months': null,
    year: null
  });

  // Generate modern monochrome colors for muscles - progressive grayscale from light to dark
  const generateMuscleColor = (muscle, index) => {
    // Progressive grayscale palette - starts lightest, gets progressively darker with very prominent differences
    const colors = [
      'rgba(255, 255, 255, 0.9)',    // Pure White (lightest)
      'rgba(230, 230, 230, 0.9)',    // Very Light Gray
      'rgba(200, 200, 200, 0.9)',    // Light Gray
      'rgba(170, 170, 170, 0.9)',    // Medium Light Gray
      'rgba(140, 140, 140, 0.9)',    // Medium Gray
      'rgba(110, 110, 110, 0.9)',    // Medium Dark Gray
      'rgba(80, 80, 80, 0.9)',       // Dark Gray
      'rgba(50, 50, 50, 0.9)',       // Very Dark Gray
      'rgba(20, 20, 20, 0.9)',       // Almost Black (darkest)
    ];
    
    // Use index to get consistent colors - always starts with lightest
    return colors[index % colors.length];
  };

  // Calculate time period weeks
  const getTimePeriodWeeks = (period) => {
    const now = new Date();
    const periods = {
      'month': 4,      // ~4 weeks
      '3months': 12,   // ~12 weeks  
      '6months': 24,   // ~24 weeks
      'year': 52       // ~52 weeks
    };
    
    const weeksBack = periods[period];
    const startDate = new Date(now.getTime() - (weeksBack * 7 * 24 * 60 * 60 * 1000));
    
    return getWeeksBetween(startDate, now);
  };

  // Process weekly data efficiently
  const processWeeklyData = (weeklyData, targetWeeks) => {
    const relevantWeeks = targetWeeks.filter(week => weeklyData[week]);
    
    if (relevantWeeks.length === 0) return { volume: {}, muscleIndicators: [] };
    
    // Single pass aggregation
    const volume = relevantWeeks.reduce((acc, week) => {
      const weekData = weeklyData[week];
      Object.keys(weekData).forEach(muscle => {
        acc[muscle] = (acc[muscle] || 0) + weekData[muscle];
      });
      return acc;
    }, {});
    
    // Create muscle indicators for top 3 only, sorted from most to least
    const muscleIndicators = Object.entries(volume)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 3) // Only top 3
      .map(([muscle, muscleVolume], index) => {
        const total = Object.values(volume).reduce((sum, vol) => sum + vol, 0);
        const percentage = total > 0 ? ((muscleVolume / total) * 100).toFixed(1) : 0;
        
        return {
          muscle: getMuscleDisplayName(muscle),
          color: generateMuscleColor(muscle, index), // Same index as pie chart
          percentage: percentage
        };
      });
    
    return { volume, muscleIndicators };
  };

  // Memoized stats calculation
  const stats = useMemo(() => {
    if (cachedData[selectedPeriod]) {
      return cachedData[selectedPeriod];
    }
    
    const weeks = getTimePeriodWeeks(selectedPeriod);
    const result = processWeeklyData(weeklyMuscleVolume, weeks);
    
    // Cache the result
    setCachedData(prev => ({ ...prev, [selectedPeriod]: result }));
    
    return result;
  }, [selectedPeriod, weeklyMuscleVolume]);

  // Clear cache when data updates
  useEffect(() => {
    setCachedData({
      month: null,
      '3months': null,
      '6months': null,
      year: null
    });
  }, [weeklyMuscleVolume]);

  // Prepare pie chart data with better colors (sorted from most to least, all muscles)
  const preparePieChartData = (muscleVolume) => {
    const total = Object.values(muscleVolume).reduce((sum, vol) => sum + vol, 0);
    
    if (total === 0) return [];
    
    // Sort by volume (most to least) and create chart data for all muscles
    return Object.entries(muscleVolume)
      .sort(([,a], [,b]) => b - a) // Sort from most to least
      .map(([muscle, volume], index) => ({
        name: getMuscleDisplayName(muscle),
        population: volume,
        color: generateMuscleColor(muscle, index),
        legendFontColor: '#FFFFFF',
        legendFontSize: 12
      }));
  };

  const chartConfig = {
    backgroundColor: 'transparent',
    backgroundGradientFrom: 'transparent',
    backgroundGradientTo: 'transparent',
    color: (opacity = 1) => `rgba(255, 255, 255, ${opacity})`,
    labelColor: (opacity = 1) => `rgba(255, 255, 255, ${opacity})`,
    strokeWidth: 2,
    barPercentage: 0.5,
    useShadowColorFromDataset: false,
    decimalPlaces: 0, // Hide decimal places
    formatXLabel: () => '', // Hide X labels
    formatYLabel: () => '', // Hide Y labels
  };

  const periods = [
    { key: 'month', label: 'Último mes' },
    { key: '3months', label: 'Últimos 3 meses' },
    { key: '6months', label: 'Últimos 6 meses' },
    { key: 'year', label: 'Último año' }
  ];

  const pieChartData = preparePieChartData(stats.volume);

  return (
    <View style={styles.container}>
      {/* Header with title and period selector */}
      <View style={styles.header}>
        <Text style={styles.cardTitle}>Músculos trabajados</Text>
        <TouchableOpacity 
          style={styles.periodTitleContainer}
          onPress={() => setIsPeriodDropdownVisible(true)}
        >
          <Text style={styles.title}>
            {periods.find(p => p.key === selectedPeriod)?.label || 'Último mes'}
          </Text>
          <View style={styles.titleArrow}>
            <SvgChevronRight 
              width={16} 
              height={16} 
              stroke="#ffffff" 
              strokeWidth={2}
            />
          </View>
        </TouchableOpacity>
      </View>

      {/* Main Content: Pie Chart and Indicators - Clickable */}
      <TouchableOpacity 
        style={styles.contentContainer}
        onPress={() => setIsLegendPopupVisible(true)}
        activeOpacity={0.8}
      >
        {/* Pie Chart */}
        <View style={styles.pieChartContainer}>
          {pieChartData.length > 0 ? (
            <PieChart
              data={pieChartData}
              width={screenWidth * 0.3}
              height={140}
              chartConfig={chartConfig}
              accessor="population"
              backgroundColor="transparent"
              paddingLeft="20"
              center={[10, 10]}
              absolute
              hasLegend={false}
            />
          ) : (
            <View style={styles.noDataContainer}>
              <Text style={styles.noDataText}>No hay datos</Text>
            </View>
          )}
        </View>
        
        {/* Muscle Color Indicators */}
        <View style={styles.indicatorsContainer}>
          {stats.muscleIndicators.length > 0 ? (
            <>
              {stats.muscleIndicators.map((indicator, index) => (
                <View key={indicator.muscle} style={styles.indicatorRow}>
                  <View 
                    style={[
                      styles.colorIndicator, 
                      { backgroundColor: indicator.color }
                    ]} 
                  />
                  <Text style={styles.muscleName}>
                    {indicator.muscle} ({indicator.percentage}%)
                  </Text>
                </View>
              ))}
              {/* 3 dots below the indicators */}
              <View style={styles.dotsContainer}>
                {[0, 1, 2].map((index) => (
                  <View 
                    key={index} 
                    style={styles.dot}
                  />
                ))}
              </View>
            </>
          ) : (
            <Text style={styles.noDataText}>No hay datos</Text>
          )}
        </View>
      </TouchableOpacity>

      {/* Period Selector Modal */}
      <Modal
        visible={isPeriodDropdownVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setIsPeriodDropdownVisible(false)}
      >
        <Pressable 
          style={styles.periodModalOverlay}
          onPress={() => setIsPeriodDropdownVisible(false)}
        >
          <View style={styles.periodModalContent}>
            <View style={styles.periodModalHeader}>
              <Text style={styles.periodModalTitle}>Seleccionar Período</Text>
              <TouchableOpacity 
                style={styles.periodModalCloseButton}
                onPress={() => setIsPeriodDropdownVisible(false)}
              >
                <Text style={styles.periodModalCloseButtonText}>✕</Text>
              </TouchableOpacity>
            </View>
            
            <ScrollView style={styles.periodModalScrollView} showsVerticalScrollIndicator={false}>
              {periods.map((period) => (
                <TouchableOpacity
                  key={period.key}
                  style={[
                    styles.periodModalItem,
                    selectedPeriod === period.key && styles.periodModalItemSelected
                  ]}
                  onPress={() => {
                    setSelectedPeriod(period.key);
                    setIsPeriodDropdownVisible(false);
                  }}
                >
                  <Text style={[
                    styles.periodModalItemText,
                    selectedPeriod === period.key && styles.periodModalItemTextSelected
                  ]}>
                    {period.label}
                  </Text>
                  {selectedPeriod === period.key && (
                    <Text style={styles.periodModalCheckmark}>✓</Text>
                  )}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </Pressable>
      </Modal>

      {/* Legend Modal */}
      <Modal
        visible={isLegendPopupVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setIsLegendPopupVisible(false)}
      >
        <View style={styles.modalContainer}>
          {/* Header */}
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>
              {periods.find(p => p.key === selectedPeriod)?.label || 'Último mes'}
            </Text>
            
            <TouchableOpacity 
              style={styles.modalBackButton}
              onPress={() => setIsLegendPopupVisible(false)}
            >
              <Text style={styles.modalBackText}>✕</Text>
            </TouchableOpacity>
          </View>
          
          {/* Content */}
          <ScrollView style={styles.modalContent} showsVerticalScrollIndicator={false}>
            {pieChartData.map((muscle, index) => (
              <View key={muscle.name} style={styles.modalLegendItem}>
                <View 
                  style={[
                    styles.modalColorIndicator, 
                    { backgroundColor: muscle.color }
                  ]} 
                />
                <Text style={styles.modalMuscleName}>
                  {muscle.name}
                </Text>
                <Text style={styles.modalPercentage}>
                  {muscle.population > 0 ? 
                    ((muscle.population / Object.values(stats.volume).reduce((sum, vol) => sum + vol, 0)) * 100).toFixed(1) + '%' 
                    : '0%'
                  }
                </Text>
              </View>
            ))}
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
};

const createStyles = (screenWidth, screenHeight) => StyleSheet.create({
  container: {
    backgroundColor: '#2a2a2a',
    borderRadius: Math.max(12, screenWidth * 0.04),
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    shadowColor: 'rgba(255, 255, 255, 0.4)',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 2,
    elevation: 10,
    paddingTop: Math.max(8, screenWidth * 0.02),
    paddingBottom: Math.max(15, screenWidth * 0.04),
    paddingHorizontal: Math.max(15, screenWidth * 0.04),
    marginTop: 0,
    marginBottom: Math.max(20, screenHeight * 0.025),
    overflow: 'visible',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 0,
    paddingTop: Math.max(8, screenWidth * 0.02),
  },
  cardTitle: {
    color: '#ffffff',
    fontSize: Math.min(screenWidth * 0.045, 18),
    fontWeight: '600',
    textAlign: 'left',
    flex: 1,
  },
  periodTitleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: Math.max(12, screenWidth * 0.04),
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    shadowColor: 'rgba(255, 255, 255, 0.4)',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 2,
    elevation: 2,
  },
  title: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  titleArrow: {
    marginLeft: Math.max(8, screenWidth * 0.02),
    alignItems: 'center',
    justifyContent: 'center',
  },
  contentContainer: {
    flexDirection: 'row',
    alignItems: 'stretch',
    justifyContent: 'space-between',
    paddingHorizontal: Math.max(5, screenWidth * 0.01),
    gap: Math.max(25, screenWidth * 0.06),
    overflow: 'visible',
    zIndex: 1,
  },
  pieChartContainer: {
    width: screenWidth * 0.3,
    height: 140,
    alignItems: 'flex-start',
    justifyContent: 'flex-start',
    paddingRight: Math.max(8, screenWidth * 0.02),
    paddingLeft: Math.max(4, screenWidth * 0.01),
    paddingTop: Math.max(-4, screenHeight * -0.005),
    overflow: 'visible',
    zIndex: 1000,
    elevation: 10,
    position: 'relative',
  },
  noDataContainer: {
    width: screenWidth * 0.3,
    height: 140,
    justifyContent: 'center',
    alignItems: 'center',
  },
  noDataText: {
    color: 'rgba(255, 255, 255, 0.5)',
    fontSize: Math.min(screenWidth * 0.04, 16),
    textAlign: 'center',
  },
  indicatorsContainer: {
    flex: 1,
    alignItems: 'flex-start',
    justifyContent: 'center',
    paddingLeft: Math.max(5, screenWidth * 0.01),
    paddingRight: Math.max(5, screenWidth * 0.01),
  },
  indicatorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Math.max(4, screenHeight * 0.005),
    paddingVertical: Math.max(2, screenHeight * 0.002),
  },
  colorIndicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: Math.max(6, screenWidth * 0.015),
  },
  muscleName: {
    fontSize: Math.min(screenWidth * 0.038, 15),
    color: '#FFFFFF',
    fontWeight: '500',
    flex: 1,
  },
  dotsContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: Math.max(8, screenHeight * 0.01),
    gap: Math.max(2, screenWidth * 0.005),
  },
  dot: {
    width: Math.max(2, screenWidth * 0.005),
    height: Math.max(2, screenWidth * 0.005),
    borderRadius: Math.max(1, screenWidth * 0.0025),
    backgroundColor: 'rgba(255, 255, 255, 0.8)',
  },
  // Period Selector Modal Styles
  periodModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: Math.max(20, screenWidth * 0.05),
  },
  periodModalContent: {
    backgroundColor: '#2a2a2a',
    borderRadius: Math.max(16, screenWidth * 0.04),
    width: '100%',
    maxWidth: Math.min(screenWidth * 0.9, 400),
    maxHeight: Math.max(400, screenHeight * 0.6),
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    shadowColor: 'rgba(255, 255, 255, 0.4)',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 2,
    elevation: 10,
  },
  periodModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Math.max(20, screenWidth * 0.05),
    paddingVertical: Math.max(16, screenHeight * 0.02),
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
  },
  periodModalTitle: {
    color: '#ffffff',
    fontSize: Math.min(screenWidth * 0.05, 20),
    fontWeight: '600',
    flex: 1,
  },
  periodModalCloseButton: {
    width: Math.max(30, screenWidth * 0.075),
    height: Math.max(30, screenWidth * 0.075),
    borderRadius: Math.max(15, screenWidth * 0.037),
    backgroundColor: '#44454B',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: Math.max(12, screenWidth * 0.03),
  },
  periodModalCloseButtonText: {
    color: '#ffffff',
    fontSize: Math.min(screenWidth * 0.04, 16),
    fontWeight: '600',
  },
  periodModalScrollView: {
    maxHeight: Math.max(300, screenHeight * 0.4),
  },
  periodModalItem: {
    paddingHorizontal: Math.max(20, screenWidth * 0.05),
    paddingVertical: Math.max(16, screenHeight * 0.02),
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 0.5,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
    backgroundColor: 'transparent',
  },
  periodModalItemSelected: {
    backgroundColor: 'rgba(191, 168, 77, 0.1)',
  },
  periodModalItemText: {
    color: '#ffffff',
    fontSize: Math.min(screenWidth * 0.045, 18),
    fontWeight: '500',
    flex: 1,
  },
  periodModalItemTextSelected: {
    color: 'rgba(191, 168, 77, 1)',
    fontWeight: '600',
  },
  periodModalCheckmark: {
    color: 'rgba(191, 168, 77, 1)',
    fontSize: Math.min(screenWidth * 0.045, 18),
    fontWeight: '600',
    marginLeft: 8,
  },
  // Modal styles (based on ExerciseDetailModal)
  modalContainer: {
    flex: 1,
    backgroundColor: '#1a1a1a',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Math.max(20, screenWidth * 0.05),
    paddingTop: Math.max(50, screenHeight * 0.06),
    paddingBottom: Math.max(20, screenHeight * 0.025),
    backgroundColor: '#1a1a1a',
  },
  modalBackButton: {
    width: Math.max(30, screenWidth * 0.075),
    height: Math.max(30, screenWidth * 0.075),
    borderRadius: Math.max(15, screenWidth * 0.037),
    backgroundColor: '#44454B',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: Math.max(12, screenWidth * 0.03),
  },
  modalBackText: {
    fontSize: Math.min(screenWidth * 0.04, 16),
    color: '#ffffff',
    fontWeight: '600',
  },
  modalTitle: {
    fontSize: Math.min(screenWidth * 0.055, 22),
    fontWeight: '600',
    color: '#ffffff',
    flex: 1,
    textAlign: 'left',
    paddingLeft: Math.max(25, screenWidth * 0.06),
    paddingTop: Math.max(25, screenHeight * 0.03),
  },
  modalContent: {
    flex: 1,
    paddingHorizontal: Math.max(20, screenWidth * 0.05),
  },
  modalLegendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Math.max(16, screenHeight * 0.02),
    paddingVertical: Math.max(8, screenHeight * 0.01),
  },
  modalColorIndicator: {
    width: Math.max(20, screenWidth * 0.05),
    height: Math.max(20, screenWidth * 0.05),
    borderRadius: Math.max(10, screenWidth * 0.025),
    marginRight: Math.max(16, screenWidth * 0.04),
  },
  modalMuscleName: {
    fontSize: Math.min(screenWidth * 0.045, 18),
    color: '#ffffff',
    fontWeight: '500',
    flex: 1,
  },
  modalPercentage: {
    fontSize: Math.min(screenWidth * 0.045, 18),
    color: 'rgba(255, 255, 255, 0.8)',
    fontWeight: '400',
  },
});

export default MuscleVolumeStats;