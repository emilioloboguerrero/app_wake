import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine,
} from 'recharts';

function formatDateShort(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T12:00:00');
  const months = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
  return `${d.getDate()} ${months[d.getMonth()]}`;
}

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <View style={styles.tooltip}>
      <Text style={styles.tooltipDate}>{formatDateShort(label)}</Text>
      {payload.map((p) => (
        <View key={p.dataKey} style={styles.tooltipRow}>
          <View style={[styles.dot, { backgroundColor: p.color }]} />
          <Text style={styles.tooltipLabel}>{p.name}</Text>
          <Text style={styles.tooltipVal}>{p.value}/10</Text>
        </View>
      ))}
    </View>
  );
};

export default function LabReadinessChart({ data }) {
  if (!data || data.length === 0) return null;
  return (
    <ResponsiveContainer width="100%" height={180}>
      <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
        <XAxis
          dataKey="date"
          tickFormatter={(d, i) => (i % 7 === 0 ? formatDateShort(d) : '')}
          tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 10 }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          domain={[1, 10]}
          ticks={[1, 5, 7, 10]}
          tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 10 }}
          axisLine={false}
          tickLine={false}
          width={20}
        />
        <Tooltip content={<CustomTooltip />} />
        <ReferenceLine y={7} stroke="rgba(255,255,255,0.12)" strokeDasharray="3 3" />
        <Line type="monotone" dataKey="energy" name="Energía" stroke="rgba(74,222,128,0.8)" strokeWidth={1.5} dot={false} activeDot={{ r: 4 }} connectNulls={false} />
        <Line type="monotone" dataKey="sleep" name="Sueño" stroke="rgba(147,197,253,0.8)" strokeWidth={1.5} dot={false} activeDot={{ r: 4 }} connectNulls={false} />
        <Line type="monotone" dataKey="sorenessInverted" name="Frescura" stroke="rgba(251,191,36,0.8)" strokeWidth={1.5} dot={false} activeDot={{ r: 4 }} connectNulls={false} />
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
  },
  tooltipDate: { fontSize: 10, color: 'rgba(255,255,255,0.5)', marginBottom: 4 },
  tooltipRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 3 },
  dot: { width: 6, height: 6, borderRadius: 3, marginRight: 6 },
  tooltipLabel: { fontSize: 11, color: 'rgba(255,255,255,0.7)', flex: 1 },
  tooltipVal: { fontSize: 11, fontWeight: '600', color: '#ffffff' },
});
