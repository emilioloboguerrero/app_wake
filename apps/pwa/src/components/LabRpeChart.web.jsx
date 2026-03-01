import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
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
  const { sessionName, avgRpe, date } = payload[0].payload;
  return (
    <View style={styles.tooltip}>
      <Text style={styles.tooltipDate}>{formatDateShort(date)}</Text>
      {sessionName ? <Text style={styles.tooltipSession} numberOfLines={1}>{sessionName}</Text> : null}
      <Text style={styles.tooltipRpe}>RPE {avgRpe != null ? avgRpe.toFixed(1) : '—'}</Text>
    </View>
  );
};

export default function LabRpeChart({ data }) {
  if (!data || data.length === 0) return null;

  return (
    <ResponsiveContainer width="100%" height={160}>
      <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
        <XAxis
          dataKey="date"
          tickFormatter={formatDateShort}
          tick={{ fill: 'rgba(255,255,255,0.45)', fontSize: 10 }}
          axisLine={false}
          tickLine={false}
          interval="preserveStartEnd"
        />
        <YAxis
          domain={[0, 10]}
          ticks={[0, 5, 7, 10]}
          tick={{ fill: 'rgba(255,255,255,0.45)', fontSize: 10 }}
          axisLine={false}
          tickLine={false}
          width={24}
        />
        <Tooltip content={<CustomTooltip />} />
        <ReferenceLine
          y={7}
          stroke="rgba(255,255,255,0.28)"
          strokeDasharray="4 4"
          label={{ value: 'Efectivo', position: 'insideTopRight', fill: 'rgba(255,255,255,0.35)', fontSize: 10 }}
        />
        <Line
          type="monotone"
          dataKey="avgRpe"
          stroke="rgba(255,255,255,0.85)"
          strokeWidth={2}
          dot={{ r: 4, fill: '#ffffff', strokeWidth: 0 }}
          activeDot={{ r: 6, fill: '#ffffff', strokeWidth: 0 }}
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
    maxWidth: 180,
  },
  tooltipDate: {
    fontSize: 10,
    color: 'rgba(255,255,255,0.5)',
    marginBottom: 2,
  },
  tooltipSession: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.75)',
    marginBottom: 4,
  },
  tooltipRpe: {
    fontSize: 14,
    fontWeight: '700',
    color: '#ffffff',
  },
});
