import React, { useState } from 'react';
import { View, Text, StyleSheet, Dimensions, Animated, Pressable } from 'react-native';
import { LineChart } from 'react-native-chart-kit';
import logger from '../utils/logger.js';

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

const PRHistoryChart = ({ history }) => {
  const [selectedIndex, setSelectedIndex] = useState(null);
  const [tooltipOpacity] = useState(new Animated.Value(0));

  logger.log('📊 PRHistoryChart: Rendering chart component');
  logger.log('📊 PRHistoryChart: history received:', history);
  logger.log('📊 PRHistoryChart: Data points count:', history?.length || 0);

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
    logger.log('📊 PR data point clicked:', { index, data });
  };

  // Dismiss tooltip
  const dismissTooltip = () => {
    hideTooltip();
    setTimeout(() => setSelectedIndex(null), 200); // Wait for animation to complete
  };
  
  // Handle empty data
  if (!history || history.length === 0) {
    logger.log('⚠️ PRHistoryChart: No data to display - showing empty state');
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>Historial de los PRs</Text>
        </View>
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>
            No hay historial de PRs aún.{'\n'}
            Completa entrenamientos para ver tu progreso.
          </Text>
        </View>
      </View>
    );
  }
  
  logger.log('✅ PRHistoryChart: Proceeding to render chart with', history.length, 'data points');
  
  // If only 1 data point, add a starting point at 0 to show progression
  let chartData = [...history];
  if (history.length === 1) {
    logger.log('📊 Only 1 data point - adding baseline at 0 for visualization');
    const firstEntry = history[0];
    const firstDate = new Date(firstEntry.date.seconds * 1000); // Firestore Timestamp
    const baselineDate = new Date(firstDate);
    baselineDate.setDate(firstDate.getDate() - 7); // 1 week before
    
    chartData = [
      { estimate: 0, date: { seconds: baselineDate.getTime() / 1000 } },
      ...history
    ];
  }
  
  // Format dates for labels - match ExerciseProgressChart format
  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('es-ES', {
      day: 'numeric',
      month: 'short'
    });
  };

  const labels = chartData.map((entry, index) => {
    if (index === 0 && chartData.length > 1 && entry.estimate === 0) {
      return 'Inicio';
    }
    
    const date = new Date(entry.date.seconds * 1000); // Firestore Timestamp
    return formatDate(date);
  });
  
  const estimates = chartData.map(entry => entry.estimate);
  
  logger.log('📊 Chart data:', { labels, estimates });
  
  const data = {
    labels: labels,
    datasets: [
      {
        data: estimates,
        color: (opacity = 1) => `rgba(191, 168, 77, ${opacity})`, // Golden color
        strokeWidth: 3 // Line thickness
      }
    ]
  };
  
  const chartConfig = {
    backgroundColor: 'transparent',
    backgroundGradientFrom: '#2a2a2a',
    backgroundGradientTo: '#2a2a2a',
    decimalPlaces: 1, // 1 decimal for weight
    color: (opacity = 1) => `rgba(191, 168, 77, ${opacity})`,
    labelColor: (opacity = 1) => `rgba(255, 255, 255, ${opacity})`,
    style: {
      borderRadius: 16
    },
    propsForDots: {
      r: '4',
      strokeWidth: '2',
      stroke: 'rgba(191, 168, 77, 1)'
    },
    propsForBackgroundLines: {
      strokeDasharray: '', // Solid lines
      stroke: 'rgba(255, 255, 255, 0.1)'
    },
    withInnerLines: true,
    withOuterLines: true,
    withVerticalLines: false,
    withHorizontalLines: true,
    fromZero: false
  };

  // PRTooltip Component
  const PRTooltip = ({ prData, index }) => {
    if (!prData || index === null) return null;

    const date = new Date(prData.date.seconds * 1000);
    const formattedDate = date.toLocaleDateString('es-ES', {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    });

    return (
      <Animated.View style={[styles.tooltip, { opacity: tooltipOpacity }]}>
        <View style={styles.tooltipContent}>
          <Text style={styles.tooltipDate}>{formattedDate}</Text>
          <View style={styles.tooltipRow}>
            <Text style={styles.tooltipLabel}>1RM Estimado:</Text>
            <Text style={styles.tooltipValue}>{prData.estimate}kg</Text>
          </View>
        </View>
      </Animated.View>
    );
  };
  
  return (
    <Pressable onPress={dismissTooltip}>
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>Historial de los PRs</Text>
        </View>
        
        <View style={styles.chartContainer}>
          <LineChart
            data={data}
            width={screenWidth - 60} // Match ExerciseProgressChart width
            height={220}
            chartConfig={chartConfig}
            bezier // Smooth curves
            style={styles.chart}
            withInnerLines={true}
            withOuterLines={true}
            withVerticalLines={false}
            withHorizontalLines={true}
            withVerticalLabels={true}
            withHorizontalLabels={true}
            fromZero={false} // Don't force zero baseline
            verticalLabelRotation={-45} // Match ExerciseProgressChart rotation
            onDataPointClick={(data) => handleDataPointClick(data, data.index)}
          />
        </View>
        
        {/* PR Tooltip */}
        {selectedIndex !== null && chartData[selectedIndex] && (
          <PRTooltip 
            prData={chartData[selectedIndex]} 
            index={selectedIndex} 
          />
        )}
      </View>
    </Pressable>
  );
};

const styles = StyleSheet.create({
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
    alignItems: 'flex-start',
    marginBottom: Math.max(16, screenHeight * 0.02),
  },
  title: {
    color: '#ffffff',
    fontSize: Math.min(screenWidth * 0.05, 20),
    fontWeight: '600',
  },
  chartContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingTop: Math.max(8, screenHeight * 0.01),
  },
  chart: {
    marginVertical: 8,
    borderRadius: 16,
  },
  emptyContainer: {
    paddingVertical: Math.max(40, screenHeight * 0.05),
    alignItems: 'center',
  },
  emptyText: {
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

export default PRHistoryChart;

