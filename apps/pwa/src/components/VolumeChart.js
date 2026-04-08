import React from 'react';
import { View, Text, StyleSheet, useWindowDimensions } from 'react-native';
import { LineChart } from 'react-native-chart-kit';
const VolumeChart = ({ volumeHistory }) => {
  const { width: screenWidth } = useWindowDimensions();
  // Handle empty data
  if (!volumeHistory || volumeHistory.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyText}>Completa un entrenamiento para ver tu progreso</Text>
      </View>
    );
  }
  
  // If only 1 data point, add a starting point at 0 to show progression
  let chartData = [...volumeHistory];
  if (volumeHistory.length === 1) {
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
  
  const data = {
    labels: labels,
    datasets: [
      {
        data: volumes,
        color: (opacity = 1) => `rgba(255, 255, 255, ${opacity})`, // Golden color
        strokeWidth: 3 // Line thickness
      }
    ]
  };
  
  const chartConfig = {
    backgroundColor: 'transparent',
    backgroundGradientFrom: '#2a2a2a',
    backgroundGradientTo: '#2a2a2a',
    decimalPlaces: 0, // No decimals for volume
    color: (opacity = 1) => `rgba(255, 255, 255, ${opacity})`,
    labelColor: (opacity = 1) => `rgba(255, 255, 255, ${opacity})`,
    style: {
      borderRadius: 16
    },
    propsForDots: {
      r: '5',
      strokeWidth: '2',
      stroke: 'rgba(255, 255, 255, 1)'
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

