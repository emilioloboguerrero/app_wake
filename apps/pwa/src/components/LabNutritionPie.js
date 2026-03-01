/**
 * Native fallback: react-native-chart-kit pie. Web uses LabNutritionPie.web.jsx (recharts, creator style).
 */
import React from 'react';
import { View } from 'react-native';
import { PieChart } from 'react-native-chart-kit';

const chartConfig = {
  backgroundColor: 'transparent',
  backgroundGradientFrom: 'transparent',
  backgroundGradientTo: 'transparent',
  color: () => 'rgba(255, 255, 255, 0.5)',
  labelColor: () => 'rgba(255, 255, 255, 0.5)',
  useShadowColorFromDataset: false,
};

export default function LabNutritionPie({ data, screenWidth }) {
  if (!data || data.length === 0) return null;

  const rnChartData = data.map((d, i) => ({
    name: d.name,
    population: d.value ?? d.grams ?? 0,
    color: `rgba(255,255,255,${0.22 + i * 0.06})`,
    legendFontColor: '#ffffff',
    legendFontSize: 11,
  }));

  const size = Math.min(screenWidth - 48, 160);

  return (
    <View style={{ alignItems: 'center' }}>
      <PieChart
        data={rnChartData}
        width={size}
        height={120}
        chartConfig={chartConfig}
        accessor="population"
        backgroundColor="transparent"
        paddingLeft="0"
        center={[0, 0]}
        absolute
        hasLegend={false}
      />
    </View>
  );
}
