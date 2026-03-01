import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  const calories = payload.find((p) => p.dataKey === 'totalCalories');
  const sets = payload.find((p) => p.dataKey === 'effectiveSets');
  return (
    <View style={styles.tooltip}>
      <Text style={styles.tooltipWeek}>{label}</Text>
      {calories && (
        <View style={styles.tooltipRow}>
          <View style={[styles.tooltipDot, { backgroundColor: 'rgba(255,255,255,0.22)' }]} />
          <Text style={styles.tooltipLabel}>Calorías</Text>
          <Text style={styles.tooltipVal}>{Math.round(calories.value).toLocaleString()} kcal</Text>
        </View>
      )}
      {sets && (
        <View style={styles.tooltipRow}>
          <View style={[styles.tooltipDot, { backgroundColor: 'rgba(255,255,255,0.85)' }]} />
          <Text style={styles.tooltipLabel}>Series efectivas</Text>
          <Text style={styles.tooltipVal}>{Number(sets.value).toFixed(1)}</Text>
        </View>
      )}
    </View>
  );
};

export default function LabEnergyAvailabilityChart({ data }) {
  if (!data || data.length === 0) return null;

  const calValues = data.map((d) => d.totalCalories || 0);
  const setValues = data.map((d) => d.effectiveSets || 0);
  const calMax = Math.ceil(Math.max(...calValues, 1) * 1.15);
  const setMax = Math.ceil(Math.max(...setValues, 1) * 1.15);

  return (
    <View>
      <ResponsiveContainer width="100%" height={200}>
        <ComposedChart data={data} margin={{ top: 8, right: 40, bottom: 0, left: 0 }}>
          <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
          <XAxis
            dataKey="weekDisplay"
            tick={{ fill: 'rgba(255,255,255,0.45)', fontSize: 10 }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            yAxisId="left"
            orientation="left"
            domain={[0, calMax]}
            tick={{ fill: 'rgba(255,255,255,0.45)', fontSize: 10 }}
            axisLine={false}
            tickLine={false}
            width={44}
            tickFormatter={(v) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)}
          />
          <YAxis
            yAxisId="right"
            orientation="right"
            domain={[0, setMax]}
            tick={{ fill: 'rgba(255,255,255,0.45)', fontSize: 10 }}
            axisLine={false}
            tickLine={false}
            width={30}
          />
          <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
          <Bar
            yAxisId="left"
            dataKey="totalCalories"
            fill="rgba(255,255,255,0.18)"
            radius={[3, 3, 0, 0]}
            barSize={18}
          />
          <Line
            yAxisId="right"
            type="monotone"
            dataKey="effectiveSets"
            stroke="rgba(255,255,255,0.85)"
            strokeWidth={2}
            dot={{ r: 4, fill: '#ffffff', strokeWidth: 0 }}
            activeDot={{ r: 6, fill: '#ffffff', strokeWidth: 0 }}
          />
        </ComposedChart>
      </ResponsiveContainer>
      <View style={styles.legend}>
        <View style={styles.legendItem}>
          <View style={[styles.legendBox, { backgroundColor: 'rgba(255,255,255,0.22)' }]} />
          <Text style={styles.legendLabel}>Calorías (izq.)</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendLine]} />
          <Text style={styles.legendLabel}>Series efectivas (der.)</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  tooltip: {
    backgroundColor: 'rgba(20,20,20,0.98)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    minWidth: 180,
  },
  tooltipWeek: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.5)',
    marginBottom: 6,
  },
  tooltipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  tooltipDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 6,
  },
  tooltipLabel: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.7)',
    flex: 1,
  },
  tooltipVal: {
    fontSize: 12,
    fontWeight: '600',
    color: '#ffffff',
  },
  legend: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 20,
    marginTop: 10,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legendBox: {
    width: 12,
    height: 8,
    borderRadius: 2,
  },
  legendLine: {
    width: 14,
    height: 2,
    backgroundColor: 'rgba(255,255,255,0.85)',
    borderRadius: 1,
  },
  legendLabel: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.5)',
  },
});
