/**
 * Lab nutrition macros pie – same style and implementation as creator app.
 * Uses recharts (PieChart, Pie, Cell, Tooltip, ResponsiveContainer) with white gradients.
 */
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';

const GRADIENT_IDS = ['lab-nutrition-pie-grad-0', 'lab-nutrition-pie-grad-1', 'lab-nutrition-pie-grad-2'];

export default function LabNutritionPie({ data }) {
  if (!data || data.length === 0) return null;

  return (
    <View style={styles.wrap}>
      <ResponsiveContainer width="100%" height={120}>
        <PieChart className="lab-nutrition-pie-chart" style={styles.chart}>
          <defs>
            {[0, 1, 2].map((i) => (
              <linearGradient key={i} id={GRADIENT_IDS[i]} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={`rgba(255,255,255,${0.22 + i * 0.06})`} />
                <stop offset="50%" stopColor={`rgba(255,255,255,${0.12 + i * 0.04})`} />
                <stop offset="100%" stopColor={`rgba(255,255,255,${0.05 + i * 0.03})`} />
              </linearGradient>
            ))}
          </defs>
          <Pie
            key={`macro-${data.map((d) => d.value).join('-')}`}
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={28}
            outerRadius={48}
            paddingAngle={2}
            dataKey="value"
            nameKey="name"
            label={false}
            stroke="none"
          >
            {data.map((_, i) => (
              <Cell key={i} fill={`url(#${GRADIENT_IDS[i]})`} stroke="none" />
            ))}
          </Pie>
          <Tooltip
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const { name, grams } = payload[0].payload;
              return (
                <View style={styles.tooltip}>
                  <Text style={styles.tooltipName}>{name}</Text>
                  <Text style={styles.tooltipGrams}>{Number(grams ?? 0).toFixed(0)} g</Text>
                </View>
              );
            }}
          />
        </PieChart>
      </ResponsiveContainer>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: 120,
    height: 120,
    alignSelf: 'center',
  },
  chart: {
    overflow: 'visible',
  },
  tooltip: {
    backgroundColor: 'rgba(30, 30, 30, 0.98)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    gap: 2,
  },
  tooltipName: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.95)',
    fontWeight: '500',
  },
  tooltipGrams: {
    fontSize: 11,
    color: 'rgba(255, 255, 255, 0.95)',
    fontWeight: '600',
  },
});
