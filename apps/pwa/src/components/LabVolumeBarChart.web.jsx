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

const SERIES = [
  { key: 'empuje',  label: 'Empuje',  fill: 'rgba(255,255,255,0.55)' },
  { key: 'jalon',   label: 'Jalón',   fill: 'rgba(255,255,255,0.38)' },
  { key: 'piernas', label: 'Piernas', fill: 'rgba(255,255,255,0.27)' },
  { key: 'core',    label: 'Core',    fill: 'rgba(255,255,255,0.17)' },
  { key: 'hombros', label: 'Hombros', fill: 'rgba(255,255,255,0.10)' },
];

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  const bars = payload.filter((p) => p.type !== 'line' && p.dataKey !== 'wellness');
  const wellnessEntry = payload.find((p) => p.dataKey === 'wellness');
  const total = bars.reduce((s, p) => s + (Number(p.value) || 0), 0);
  return (
    <View style={styles.tooltip}>
      <Text style={styles.tooltipWeek}>{label}</Text>
      {bars.map((p) => (
        <View key={p.dataKey} style={styles.tooltipRow}>
          <View style={[styles.tooltipDot, { backgroundColor: p.fill }]} />
          <Text style={styles.tooltipLabel}>{p.name}</Text>
          <Text style={styles.tooltipVal}>{Number(p.value || 0).toFixed(1)}</Text>
        </View>
      ))}
      <View style={styles.tooltipDivider} />
      <View style={styles.tooltipRow}>
        <Text style={[styles.tooltipLabel, styles.tooltipTotal]}>Total</Text>
        <Text style={[styles.tooltipVal, styles.tooltipTotal]}>{total.toFixed(1)}</Text>
      </View>
      {wellnessEntry?.value != null && (
        <>
          <View style={styles.tooltipDivider} />
          <View style={styles.tooltipRow}>
            <View style={[styles.tooltipDot, { backgroundColor: 'rgba(251,191,36,0.8)' }]} />
            <Text style={styles.tooltipLabel}>Bienestar</Text>
            <Text style={[styles.tooltipVal, { color: 'rgba(251,191,36,0.9)' }]}>{Number(wellnessEntry.value).toFixed(1)}/10</Text>
          </View>
        </>
      )}
    </View>
  );
};

const CustomLegend = () => (
  <View style={styles.legend}>
    {SERIES.map((s) => (
      <View key={s.key} style={styles.legendItem}>
        <View style={[styles.legendDot, { backgroundColor: s.fill }]} />
        <Text style={styles.legendLabel}>{s.label}</Text>
      </View>
    ))}
    <View style={styles.legendItem}>
      <View style={[styles.legendLine]} />
      <Text style={styles.legendLabel}>Bienestar</Text>
    </View>
  </View>
);

export default function LabVolumeBarChart({ data }) {
  if (!data || data.length === 0) return null;

  return (
    <View>
      <ResponsiveContainer width="100%" height={200}>
        <ComposedChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: 0 }} barCategoryGap="28%">
          <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
          <XAxis
            dataKey="weekDisplay"
            tick={{ fill: 'rgba(255,255,255,0.45)', fontSize: 10 }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            yAxisId="left"
            tick={{ fill: 'rgba(255,255,255,0.45)', fontSize: 10 }}
            axisLine={false}
            tickLine={false}
            width={30}
          />
          <YAxis yAxisId="right" orientation="right" domain={[1, 10]} hide />
          <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
          {SERIES.map((s) => (
            <Bar key={s.key} yAxisId="left" dataKey={s.key} name={s.label} stackId="vol" fill={s.fill} radius={s.key === 'empuje' ? [3, 3, 0, 0] : [0, 0, 0, 0]} />
          ))}
          <Line yAxisId="right" type="monotone" dataKey="wellness" stroke="rgba(251,191,36,0.7)" strokeWidth={1.5} strokeDasharray="3 3" dot={false} activeDot={{ r: 3 }} connectNulls={false} />
        </ComposedChart>
      </ResponsiveContainer>
      <CustomLegend />
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
    minWidth: 150,
  },
  tooltipWeek: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.55)',
    marginBottom: 6,
  },
  tooltipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 3,
  },
  tooltipDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 6,
  },
  tooltipLabel: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.75)',
    flex: 1,
  },
  tooltipVal: {
    fontSize: 12,
    color: '#ffffff',
    fontWeight: '600',
  },
  tooltipDivider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.1)',
    marginVertical: 6,
  },
  tooltipTotal: {
    fontWeight: '700',
    color: '#ffffff',
  },
  legend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 10,
    marginTop: 12,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  legendDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
  legendLabel: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.55)',
  },
  legendLine: {
    width: 14,
    height: 2,
    backgroundColor: 'rgba(251,191,36,0.7)',
    borderRadius: 1,
    marginRight: 4,
  },
});
