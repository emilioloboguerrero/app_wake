import React from 'react';
import { View, Text, StyleSheet, useWindowDimensions } from 'react-native';

const MEAL_LABELS = {
  Breakfast: 'Desayuno',
  Lunch: 'Almuerzo',
  Dinner: 'Cena',
  Snack: 'Snack',
};

const MEAL_ORDER = ['Breakfast', 'Lunch', 'Dinner', 'Snack'];

function formatTime(avgMinutes) {
  if (avgMinutes == null) return null;
  const h = Math.floor(avgMinutes / 60);
  const m = Math.round(avgMinutes % 60);
  const period = h < 12 ? 'am' : 'pm';
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `~${h12}:${String(m).padStart(2, '0')} ${period}`;
}

export default function LabProteinMealBars({ data, totalProtein, mealTimes }) {
  const { width } = useWindowDimensions();
  const maxBarWidth = width * 0.45;

  if (!data) return null;

  const values = MEAL_ORDER.map((k) => data[k] || 0);
  const maxVal = Math.max(...values, 1);
  const total = values.reduce((s, v) => s + v, 0) || 1;

  return (
    <View style={styles.container}>
      {MEAL_ORDER.map((key) => {
        const grams = data[key] || 0;
        const pct = Math.round((grams / total) * 100);
        const barW = Math.max(4, (grams / maxVal) * maxBarWidth);
        const avgTime = mealTimes?.[key] != null ? formatTime(mealTimes[key]) : null;
        return (
          <View key={key} style={styles.row}>
            <View style={styles.labelWrap}>
              <Text style={styles.mealLabel}>{MEAL_LABELS[key]}</Text>
              {avgTime ? <Text style={styles.mealTime}>{avgTime}</Text> : null}
            </View>
            <View style={styles.barTrack}>
              <View style={[styles.barFill, { width: barW }]} />
            </View>
            <View style={styles.valueWrap}>
              <Text style={styles.gramsText}>{Math.round(grams)}g</Text>
              <Text style={styles.pctText}>{pct}%</Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 12,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  labelWrap: {
    width: 70,
  },
  mealLabel: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.75)',
    fontWeight: '500',
  },
  mealTime: {
    fontSize: 10,
    color: 'rgba(255,255,255,0.35)',
    marginTop: 1,
  },
  barTrack: {
    flex: 1,
    height: 8,
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderRadius: 4,
    overflow: 'hidden',
  },
  barFill: {
    height: 8,
    backgroundColor: 'rgba(255,255,255,0.30)',
    borderRadius: 4,
  },
  valueWrap: {
    width: 52,
    alignItems: 'flex-end',
  },
  gramsText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#ffffff',
  },
  pctText: {
    fontSize: 10,
    color: 'rgba(255,255,255,0.45)',
    marginTop: 1,
  },
});
