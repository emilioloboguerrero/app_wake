import React, { useState, useMemo } from 'react';
import { View, Text, StyleSheet, useWindowDimensions, Animated, TouchableWithoutFeedback, TouchableOpacity, Modal, Pressable, ScrollView } from 'react-native';
import { LineChart } from 'react-native-chart-kit';
import SvgChevronRight from './icons/vectors_fig/Arrow/ChevronRight';
import { getSessionDateAsDate } from '../utils/sessionFilter';
import logger from '../utils/logger.js';

const ExerciseProgressChart = ({ sessions, loading, selectedPeriod = 'month', onPeriodChange }) => {
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  
  // Create styles with current dimensions - memoized to prevent recalculation
  const styles = useMemo(
    () => createStyles(screenWidth, screenHeight),
    [screenWidth, screenHeight],
  );
  
  const [selectedIndex, setSelectedIndex] = useState(null);
  const [tooltipOpacity] = useState(new Animated.Value(0));
  const [isPeriodDropdownVisible, setIsPeriodDropdownVisible] = useState(false);

  const periods = [
    { key: 'week', label: '1 Semana' },
    { key: 'month', label: '1 Mes' },
    { key: '3months', label: '3 Meses' },
    { key: '6months', label: '6 Meses' },
    { key: 'year', label: '1 Año' }
  ];

  const handlePeriodSelect = (periodKey) => {
    if (onPeriodChange) {
      onPeriodChange(periodKey);
    }
    setIsPeriodDropdownVisible(false);
  };

  const formatDate = (dateValue) => {
    const date = getSessionDateAsDate(dateValue);
    if (!date) return '?';
    return date.toLocaleDateString('es-ES', {
      day: 'numeric',
      month: 'short'
    });
  };

  // Animation functions for tooltip
  const showTooltip = () => {
    Animated.timing(tooltipOpacity, {
      toValue: 1,
      duration: 200,
      useNativeDriver: true,
    }).start();
  };

  const hideTooltip = () => {
    Animated.timing(tooltipOpacity, {
      toValue: 0,
      duration: 200,
      useNativeDriver: true,
    }).start();
  };

  // Handle data point click
  const handleDataPointClick = (data, index) => {
    setSelectedIndex(index);
    showTooltip();
    logger.log('📊 Data point clicked:', { index, data });
  };

  // Dismiss tooltip
  const dismissTooltip = () => {
    hideTooltip();
    setTimeout(() => setSelectedIndex(null), 200); // Wait for animation to complete
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Progreso del Ejercicio</Text>
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>Cargando datos...</Text>
        </View>
      </View>
    );
  }

  // Filter sessions to only show those with valid data
  const hasSetData = (set) => {
    const hasReps = set.reps && 
                    set.reps !== '' && 
                    !isNaN(parseFloat(set.reps)) && 
                    !set.reps.includes('-') && 
                    !set.reps.includes('FALLO');
    
    const hasWeight = set.weight && 
                      set.weight !== '' && 
                      !isNaN(parseFloat(set.weight)) && 
                      parseFloat(set.weight) > 0;
    
    return hasReps || hasWeight;
  };

  const validSessions = sessions.filter(session => 
    session.sets && session.sets.some(hasSetData)
  );

  logger.log('📊 ExerciseProgressChart: sessions received:', sessions?.length || 0);
  logger.log('📊 ExerciseProgressChart: validSessions:', validSessions.length);
  logger.log('📊 ExerciseProgressChart: loading:', loading);

  if (sessions?.length > 0 && validSessions.length === 0) {
    const first = sessions[0];
    const firstSet = first.sets?.[0];
    logger.warn('📊 ExerciseProgressChart: No valid sessions – debug:', {
      sessionsCount: sessions.length,
      firstSessionHasSets: !!first.sets,
      firstSessionSetsLength: first.sets?.length ?? 0,
      firstSet: firstSet ? { reps: firstSet.reps, weight: firstSet.weight, intensity: firstSet.intensity } : null,
      firstSetHasSetData: firstSet ? hasSetData(firstSet) : false
    });
  }

  if (validSessions.length === 0) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>Progreso del Ejercicio</Text>
        </View>
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>
            No hay datos suficientes para mostrar progreso.{'\n'}
            Completa más entrenamientos para ver tu evolución.
          </Text>
        </View>
      </View>
    );
  }

  // Sort sessions by date and limit to most recent 50 (handle Firestore Timestamp)
  const sortedSessions = [...validSessions].sort((a, b) => {
    const dateA = getSessionDateAsDate(a.date || a.completedAt)?.getTime() ?? 0;
    const dateB = getSessionDateAsDate(b.date || b.completedAt)?.getTime() ?? 0;
    return dateA - dateB;
  }).slice(-50); // Take the last 50 sessions (most recent)

  // Dynamic label density function - adjusts label frequency based on period
  const getLabelInterval = (period, totalDataPoints) => {
    switch (period) {
      case 'week':
        return 1; // Show every day
      case 'month':
        return Math.max(1, Math.floor(totalDataPoints / 8)); // Show every 3-4 days (max 8 labels)
      case '3months':
        return Math.max(1, Math.floor(totalDataPoints / 6)); // Show every week (max 6 labels)
      case '6months':
        return Math.max(1, Math.floor(totalDataPoints / 5)); // Show every 2-3 weeks (max 5 labels)
      case 'year':
        return Math.max(1, Math.floor(totalDataPoints / 4)); // Show every 2-3 weeks (max 4 labels)
      default:
        return Math.max(1, Math.floor(totalDataPoints / 6)); // Show every 2-3 weeks (max 6 labels)
    }
  };

  // Filter labels based on selected period
  const getFilteredLabels = (allLabels, period) => {
    if (allLabels.length <= 8) {
      return allLabels; // Show all if few data points
    }
    
    const interval = getLabelInterval(period, allLabels.length);
    const filteredLabels = [];
    
    // Always include the first and last labels
    filteredLabels.push(allLabels[0]);
    
    // Add labels at regular intervals
    for (let i = interval; i < allLabels.length - 1; i += interval) {
      filteredLabels.push(allLabels[i]);
    }
    
    // Always include the last label
    if (allLabels.length > 1) {
      filteredLabels.push(allLabels[allLabels.length - 1]);
    }
    
    return filteredLabels;
  };

  // Calculate max weight and average reps per session
  const chartData = sortedSessions.map(session => {
    const validSets = session.sets.filter(hasSetData);
    
    // Find max weight in this session
    const maxWeight = Math.max(...validSets.map(set => 
      set.weight && !isNaN(parseFloat(set.weight)) ? parseFloat(set.weight) : 0
    ));
    
    // Calculate average reps in this session
    const repsValues = validSets.map(set => 
      set.reps && !isNaN(parseFloat(set.reps)) ? parseFloat(set.reps) : 0
    ).filter(reps => reps > 0);
    
    const avgReps = repsValues.length > 0 
      ? repsValues.reduce((sum, reps) => sum + reps, 0) / repsValues.length 
      : 0;

    logger.log('📊 Session data:', { 
      date: session.date, 
      maxWeight, 
      avgReps, 
      validSets: validSets.length 
    });

    return {
      date: formatDate(session.date || session.completedAt),
      maxWeight: maxWeight,
      avgReps: avgReps
    };
  });

  // Prepare data for chart - simplified approach
  const allLabels = chartData.map(item => item.date);
  const maxWeights = chartData.map(item => item.maxWeight);
  const avgReps = chartData.map(item => item.avgReps);

  // Apply dynamic label density filtering
  const filteredLabels = getFilteredLabels(allLabels, selectedPeriod);

  logger.log('📊 Progress chart data:', { 
    allLabels: allLabels.length, 
    filteredLabels: filteredLabels.length, 
    selectedPeriod,
    maxWeights, 
    avgReps 
  });

  // SessionTooltip Component
  const SessionTooltip = ({ session, index }) => {
    if (!session || index === null) return null;

    return (
      <Animated.View style={[styles.tooltip, { opacity: tooltipOpacity }]}>
        <View style={styles.tooltipContent}>
          <Text style={styles.tooltipDate}>{session.date}</Text>
          <View style={styles.tooltipRow}>
            <Text style={styles.tooltipLabel}>Peso Máx:</Text>
            <Text style={styles.tooltipValue}>{session.maxWeight}kg</Text>
          </View>
          <View style={styles.tooltipRow}>
            <Text style={styles.tooltipLabel}>Reps Prom:</Text>
            <Text style={styles.tooltipValue}>{session.avgReps.toFixed(1)}</Text>
          </View>
        </View>
      </Animated.View>
    );
  };

  // Create separate datasets for each metric
  const weightData = {
    labels: filteredLabels,
    datasets: [{
      data: maxWeights,
      color: (opacity = 1) => `rgba(191, 168, 77, ${opacity})`,
      strokeWidth: 3
    }]
  };

  const repsData = {
    labels: filteredLabels,
    datasets: [{
      data: avgReps,
      color: (opacity = 1) => `rgba(255, 255, 255, ${opacity})`,
      strokeWidth: 3
    }]
  };

  const chartConfig = {
    backgroundColor: 'transparent',
    backgroundGradientFrom: '#2a2a2a',
    backgroundGradientTo: '#2a2a2a',
    decimalPlaces: 1,
    color: (opacity = 1) => `rgba(191, 168, 77, ${opacity})`,
    labelColor: (opacity = 1) => `rgba(255, 255, 255, ${opacity})`,
    style: {
      borderRadius: 16
    },
    propsForDots: {
      r: '4',
      strokeWidth: '2'
    },
    propsForBackgroundLines: {
      strokeDasharray: '',
      stroke: 'rgba(255, 255, 255, 0.1)'
    },
    withInnerLines: true,
    withOuterLines: true,
    withVerticalLines: false,
    withHorizontalLines: true,
    fromZero: false
  };

  return (
    <TouchableWithoutFeedback onPress={dismissTooltip}>
      <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Progreso del Ejercicio</Text>
        <TouchableOpacity 
          style={styles.periodSelectorContainer}
          onPress={() => setIsPeriodDropdownVisible(true)}
        >
          <Text style={styles.periodSelectorText}>
            {periods.find(p => p.key === selectedPeriod)?.label || '1 Mes'}
          </Text>
          <View style={styles.periodSelectorArrow}>
            <SvgChevronRight 
              width={16} 
              height={16} 
              stroke="#ffffff" 
              strokeWidth={2}
            />
          </View>
        </TouchableOpacity>
      </View>
      
      <View style={styles.chartContainer}>
        {chartData.length > 0 ? (
          <View style={styles.chartsWrapper}>
            {/* Weight Chart */}
            <View style={styles.singleChartContainer}>
              <Text style={styles.chartTitle}>Peso Máx (kg)</Text>
              <LineChart
                data={weightData}
                width={screenWidth - 60}
                height={180}
                chartConfig={chartConfig}
                bezier
                style={styles.chart}
                withInnerLines={true}
                withOuterLines={true}
                withVerticalLines={false}
                withHorizontalLines={true}
                withVerticalLabels={true}
                withHorizontalLabels={true}
                fromZero={false}
                verticalLabelRotation={-45}
                onDataPointClick={(data) => handleDataPointClick(data, data.index)}
              />
            </View>
            
            {/* Reps Chart */}
            <View style={styles.singleChartContainer}>
              <Text style={styles.chartTitle}>Reps Promedio</Text>
              <LineChart
                data={repsData}
                width={screenWidth - 60}
                height={180}
                chartConfig={chartConfig}
                bezier
                style={styles.chart}
                withInnerLines={true}
                withOuterLines={true}
                withVerticalLines={false}
                withHorizontalLines={true}
                withVerticalLabels={true}
                withHorizontalLabels={true}
                fromZero={false}
                verticalLabelRotation={-45}
                onDataPointClick={(data) => handleDataPointClick(data, data.index)}
              />
            </View>
          </View>
        ) : (
          <View style={styles.noDataContainer}>
            <Text style={styles.noDataText}>
              No hay datos suficientes para mostrar el gráfico.
            </Text>
          </View>
        )}
      </View>
      
      {/* Session Tooltip */}
      {selectedIndex !== null && chartData[selectedIndex] && (
        <SessionTooltip 
          session={chartData[selectedIndex]} 
          index={selectedIndex} 
        />
      )}

      {/* Period Selector Modal */}
      <Modal
        visible={isPeriodDropdownVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setIsPeriodDropdownVisible(false)}
      >
        <Pressable 
          style={styles.modalOverlay}
          onPress={() => setIsPeriodDropdownVisible(false)}
        >
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Seleccionar Período</Text>
              <TouchableOpacity 
                style={styles.modalCloseButton}
                onPress={() => setIsPeriodDropdownVisible(false)}
              >
                <Text style={styles.modalCloseButtonText}>✕</Text>
              </TouchableOpacity>
            </View>
            
            <ScrollView style={styles.modalScrollView} showsVerticalScrollIndicator={false}>
              {periods.map((period) => (
                <TouchableOpacity
                  key={period.key}
                  style={[
                    styles.modalItem,
                    selectedPeriod === period.key && styles.modalItemSelected
                  ]}
                  onPress={() => handlePeriodSelect(period.key)}
                >
                  <Text style={[
                    styles.modalItemText,
                    selectedPeriod === period.key && styles.modalItemTextSelected
                  ]}>
                    {period.label}
                  </Text>
                  {selectedPeriod === period.key && (
                    <Text style={styles.modalCheckmark}>✓</Text>
                  )}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </Pressable>
      </Modal>
    </View>
    </TouchableWithoutFeedback>
  );
};

const createStyles = (screenWidth, screenHeight) => StyleSheet.create({
  container: {
    backgroundColor: '#2a2a2a',
    borderRadius: Math.max(12, screenWidth * 0.04),
    padding: Math.max(24, screenWidth * 0.06),
    marginBottom: Math.max(20, screenHeight * 0.025),
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    shadowColor: 'rgba(255, 255, 255, 0.4)',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 2,
    elevation: 2,
    flex: 1, // Use flex to match parent height
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Math.max(16, screenHeight * 0.02),
  },
  title: {
    color: '#ffffff',
    fontSize: Math.min(screenWidth * 0.045, 18),
    fontWeight: '600',
    textAlign: 'left',
    flex: 1,
  },
  periodSelectorContainer: {
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
  periodSelectorText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
    marginRight: Math.max(4, screenWidth * 0.01),
  },
  periodSelectorArrow: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: Math.max(20, screenWidth * 0.05),
  },
  modalContent: {
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
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Math.max(20, screenWidth * 0.05),
    paddingVertical: Math.max(16, screenHeight * 0.02),
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
  },
  modalTitle: {
    color: '#ffffff',
    fontSize: Math.min(screenWidth * 0.05, 20),
    fontWeight: '600',
    flex: 1,
  },
  modalCloseButton: {
    width: Math.max(30, screenWidth * 0.075),
    height: Math.max(30, screenWidth * 0.075),
    borderRadius: Math.max(15, screenWidth * 0.037),
    backgroundColor: '#44454B',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: Math.max(12, screenWidth * 0.03),
  },
  modalCloseButtonText: {
    color: '#ffffff',
    fontSize: Math.min(screenWidth * 0.04, 16),
    fontWeight: '600',
  },
  modalScrollView: {
    maxHeight: Math.max(300, screenHeight * 0.4),
  },
  modalItem: {
    paddingHorizontal: Math.max(20, screenWidth * 0.05),
    paddingVertical: Math.max(16, screenHeight * 0.02),
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 0.5,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
    backgroundColor: 'transparent',
  },
  modalItemSelected: {
    backgroundColor: 'rgba(191, 168, 77, 0.1)',
  },
  modalItemText: {
    color: '#ffffff',
    fontSize: Math.min(screenWidth * 0.045, 18),
    fontWeight: '500',
    flex: 1,
  },
  modalItemTextSelected: {
    color: 'rgba(191, 168, 77, 1)',
    fontWeight: '600',
  },
  modalCheckmark: {
    color: 'rgba(191, 168, 77, 1)',
    fontSize: Math.min(screenWidth * 0.045, 18),
    fontWeight: '600',
    marginLeft: 8,
  },
  legend: {
    flexDirection: 'row',
    gap: Math.max(8, screenWidth * 0.02),
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
    flex: 1,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Math.max(4, screenWidth * 0.01),
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendText: {
    color: 'rgba(255, 255, 255, 0.8)',
    fontSize: Math.min(screenWidth * 0.035, 14),
    fontWeight: '500',
  },
  chartContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingTop: Math.max(8, screenHeight * 0.01),
  },
  chartsWrapper: {
    width: '100%',
    gap: Math.max(24, screenHeight * 0.03),
  },
  singleChartContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  chartTitle: {
    color: '#ffffff',
    fontSize: Math.min(screenWidth * 0.04, 16),
    fontWeight: '600',
    marginBottom: Math.max(8, screenHeight * 0.01),
    textAlign: 'center',
  },
  chart: {
    marginVertical: 8,
    borderRadius: 16,
  },
  loadingContainer: {
    paddingVertical: Math.max(40, screenHeight * 0.05),
    alignItems: 'center',
  },
  loadingText: {
    color: 'rgba(255, 255, 255, 0.7)',
    fontSize: Math.min(screenWidth * 0.04, 16),
    fontWeight: '500',
  },
  emptyContainer: {
    flex: 1,
    paddingTop: Math.max(20, screenHeight * 0.025),
    paddingBottom: Math.max(40, screenHeight * 0.05),
    paddingHorizontal: Math.max(20, screenWidth * 0.05),
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: Math.max(150, screenHeight * 0.18),
  },
  emptyText: {
    color: 'rgba(255, 255, 255, 0.6)',
    fontSize: Math.min(screenWidth * 0.04, 16),
    opacity: 0.6,
    textAlign: 'center',
    lineHeight: Math.max(24, screenHeight * 0.03),
    paddingHorizontal: Math.max(10, screenWidth * 0.025),
  },
  noDataContainer: {
    paddingVertical: Math.max(40, screenHeight * 0.05),
    alignItems: 'center',
  },
  noDataText: {
    color: 'rgba(255, 255, 255, 0.6)',
    fontSize: Math.min(screenWidth * 0.04, 16),
    opacity: 0.6,
    textAlign: 'center',
    lineHeight: Math.max(22, screenHeight * 0.027),
  },
  // Tooltip Styles
  tooltip: {
    position: 'absolute',
    top: Math.max(20, screenHeight * 0.025),
    left: Math.max(20, screenWidth * 0.05),
    backgroundColor: '#2a2a2a',
    borderRadius: Math.max(8, screenWidth * 0.02),
    padding: Math.max(12, screenWidth * 0.03),
    borderWidth: 1,
    borderColor: 'rgba(191, 168, 77, 0.3)',
    shadowColor: 'rgba(0, 0, 0, 0.5)',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 4,
    elevation: 5,
    zIndex: 1000,
  },
  tooltipContent: {
    alignItems: 'center',
  },
  tooltipDate: {
    color: 'rgba(191, 168, 77, 1)',
    fontSize: Math.min(screenWidth * 0.04, 16),
    fontWeight: '600',
    marginBottom: Math.max(6, screenHeight * 0.007),
  },
  tooltipRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%',
    marginBottom: Math.max(4, screenHeight * 0.005),
  },
  tooltipLabel: {
    color: 'rgba(255, 255, 255, 0.8)',
    fontSize: Math.min(screenWidth * 0.035, 14),
    fontWeight: '500',
  },
  tooltipValue: {
    color: '#ffffff',
    fontSize: Math.min(screenWidth * 0.035, 14),
    fontWeight: '600',
  },
});

export default ExerciseProgressChart;
