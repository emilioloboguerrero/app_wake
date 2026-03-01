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
} from 'recharts';

function formatDateShort(isoString) {
  if (!isoString) return '';
  const d = new Date(isoString);
  const months = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
  return `${d.getDate()} ${months[d.getMonth()]}`;
}

const CustomTooltip = ({ active, payload }) => {
  if (!active || !payload?.length) return null;
  const { date, value } = payload[0].payload;
  return (
    <View style={styles.tooltip}>
      <Text style={styles.tooltipDate}>{formatDateShort(date)}</Text>
      <Text style={styles.tooltipValue}>{value != null ? `${value.toFixed(1)} kg` : '—'}</Text>
    </View>
  );
};

export default function LabStrengthChart({ data }) {
  if (!data || data.length === 0) return null;

  const values = data.map((d) => d.value).filter((v) => typeof v === 'number');
  const minVal = Math.max(0, Math.floor(Math.min(...values) * 0.9));
  const maxVal = Math.ceil(Math.max(...values) * 1.05);

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
          width={42}
          tickFormatter={(v) => `${v}kg`}
        />
        <Tooltip content={<CustomTooltip />} />
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
  tooltipDate: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.6)',
  },
  tooltipValue: {
    fontSize: 14,
    fontWeight: '700',
    color: '#ffffff',
  },
});
