import React from 'react';
import { View, Text, StyleSheet, useWindowDimensions } from 'react-native';
import { LineChart } from 'react-native-chart-kit';
import logger from '../utils/logger.js';

const VolumeChart = ({ volumeHistory }) => {
  const { width: screenWidth } = useWindowDimensions();
  logger.log('📊 VolumeChart: Rendering chart component');
  logger.log('📊 VolumeChart: volumeHistory received:', volumeHistory);
  logger.log('📊 VolumeChart: Data points count:', volumeHistory?.length || 0);
  
  // Handle empty data
  if (!volumeHistory || volumeHistory.length === 0) {
    logger.log('⚠️ VolumeChart: No data to display - showing empty state');
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyText}>Completa un entrenamiento para ver tu progreso</Text>
      </View>
    );
  }
  
  logger.log('✅ VolumeChart: Proceeding to render chart with', volumeHistory.length, 'data points');
  
  // If only 1 data point, add a starting point at 0 to show progression
  let chartData = [...volumeHistory];
  if (volumeHistory.length === 1) {
    logger.log('📊 Only 1 data point - adding baseline at 0 for visualization');
    const firstEntry = volumeHistory[0];
    const firstDate = new Date(firstEntry.date);
    const baselineDate = new Date(firstDate);
    baselineDate.setDate(firstDate.getDate() - 7); // 1 week before
    
    chartData = [
      { sessionId: 'baseline', volume: 0, date: baselineDate.toISOString() },
      ...volumeHistory
    ];
  }
  
  // Format dates for labels - always show date for each point
  const labels = chartData.map((entry) => {
    if (entry.sessionId === 'baseline') {
      return 'Inicio';
    }
    
    const date = new Date(entry.date);
    const day = date.getDate();
    const month = date.getMonth() + 1;
    return `${day}/${month}`;
  });
  
  const volumes = chartData.map(entry => entry.volume);
  
  logger.log('📊 Chart data:', { labels, volumes });
  
  const data = {
    labels: labels,
    datasets: [
      {
        data: volumes,
        color: (opacity = 1) => `rgba(191, 168, 77, ${opacity})`, // Golden color
        strokeWidth: 3 // Line thickness
      }
    ]
  };
  
  const chartConfig = {
    backgroundColor: 'transparent',
    backgroundGradientFrom: '#2a2a2a',
    backgroundGradientTo: '#2a2a2a',
    decimalPlaces: 0, // No decimals for volume
    color: (opacity = 1) => `rgba(191, 168, 77, ${opacity})`,
    labelColor: (opacity = 1) => `rgba(255, 255, 255, ${opacity})`,
    style: {
      borderRadius: 16
    },
    propsForDots: {
      r: '5',
      strokeWidth: '2',
      stroke: 'rgba(191, 168, 77, 1)'
    },
    propsForBackgroundLines: {
      strokeDasharray: '', // solid lines
      stroke: 'rgba(255, 255, 255, 0.1)'
    }
  };
  
  return (
    <View style={styles.container}>
      <LineChart
        data={data}
        width={screenWidth - 48}
        height={220}
        chartConfig={chartConfig}
        bezier // Smooth curves
        style={styles.chart}
        withInnerLines={true}
        withOuterLines={true}
        withVerticalLines={false}
        withHorizontalLines={true}
        fromZero={true}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  chart: {
    marginVertical: 8,
    borderRadius: 16,
  },
  emptyContainer: {
    padding: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#2a2a2a',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  emptyText: {
    color: 'rgba(255, 255, 255, 0.6)',
    fontSize: 14,
    textAlign: 'center',
  },
});

export default VolumeChart;

