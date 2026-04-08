import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';

const MONTHS = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];

function formatDateShort(dateStr) {
  if (!dateStr) return '';
  const parts = dateStr.split('-');
  const m = parseInt(parts[1], 10);
  const d = parseInt(parts[2], 10);
  return `${d} ${MONTHS[m - 1]}`;
}

const CustomTooltip = ({ active, payload, unit }) => {
  if (!active || !payload?.length) return null;
  const { date, value } = payload[0].payload;
  return (
    <View style={styles.tooltip}>
      <Text style={styles.tooltipDate}>{formatDateShort(date)}</Text>
      <Text style={styles.tooltipValue}>{value != null ? `${value} ${unit}` : '—'}</Text>
    </View>
  );
};

export default function LabWeightChart({ data, goalValue, unit = 'kg' }) {
  if (!data || data.length === 0) return null;

  const values = data.map((d) => d.value).filter((v) => typeof v === 'number');
  const allValues = goalValue != null ? [...values, goalValue] : values;
  const minVal = Math.max(0, Math.floor(allValues.reduce((a, b) => a < b ? a : b, Infinity) * 0.97));
  const maxVal = Math.ceil(allValues.reduce((a, b) => a > b ? a : b, -Infinity) * 1.03);

  return (
    <ResponsiveContainer width="100%" height={180}>
      <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid stroke="rgba(255,255,255,0.05)" strokeDasharray="0" vertical={false} />
        <XAxis
          dataKey="date"
          tickFormatter={formatDateShort}
          tick={{ fill: 'rgba(255,255,255,0.45)', fontSize: 10 }}
          axisLine={false}
          tickLine={false}
          interval="preserveStartEnd"
        />
        <YAxis
          domain={[minVal, maxVal]}
          tick={{ fill: 'rgba(255,255,255,0.45)', fontSize: 10 }}
          axisLine={false}
          tickLine={false}
          width={46}
          tickFormatter={(v) => `${v}${unit}`}
        />
        <Tooltip content={<CustomTooltip unit={unit} />} />
        {goalValue != null && (
          <ReferenceLine
            y={goalValue}
            stroke="rgba(74,222,128,0.6)"
            strokeDasharray="4 4"
            label={{
              value: 'Objetivo',
              position: 'insideBottomLeft',
              fill: 'rgba(74,222,128,0.6)',
              fontSize: 10,
            }}
          />
        )}
        <Line
          type="monotone"
          dataKey="value"
          stroke="rgba(255,255,255,0.85)"
          strokeWidth={2}
          dot={{ r: 3, fill: '#ffffff', strokeWidth: 0 }}
          activeDot={{ r: 5, fill: '#ffffff', strokeWidth: 0 }}
          isAnimationActive
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

const styles = StyleSheet.create({
  tooltip: {
    backgroundColor: 'rgba(20,20,20,0.98)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    gap: 2,
  },
  tooltipDate: { fontSize: 11, color: 'rgba(255,255,255,0.6)' },
  tooltipValue: { fontSize: 14, fontWeight: '700', color: '#ffffff' },
});
