import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
} from 'recharts';

function getDotColor(energy) {
  if (energy >= 7) return '#4ade80';
  if (energy >= 5) return 'rgba(251,191,36,0.9)';
  return '#f87171';
}

const CustomDot = (props) => {
  const { cx, cy, payload } = props;
  return (
    <circle
      cx={cx}
      cy={cy}
      r={5}
      fill={getDotColor(payload.energy)}
      fillOpacity={0.85}
      stroke="none"
    />
  );
};

const CustomTooltip = ({ active, payload }) => {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload;
  if (!d) return null;
  return (
    <View style={styles.tooltip}>
      {d.sessionName && <Text style={styles.tooltipName}>{d.sessionName}</Text>}
      <View style={styles.tooltipRow}>
        <Text style={styles.tooltipLabel}>Energía</Text>
        <Text style={[styles.tooltipVal, { color: getDotColor(d.energy) }]}>{d.energy}/10</Text>
      </View>
      <View style={styles.tooltipRow}>
        <Text style={styles.tooltipLabel}>RPE</Text>
        <Text style={styles.tooltipVal}>{Number(d.avgRpe).toFixed(1)}/10</Text>
      </View>
    </View>
  );
};

export default function LabReadinessRpeScatter({ data }) {
  if (!data || data.length === 0) return null;

  return (
    <ResponsiveContainer width="100%" height={160}>
      <ScatterChart margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid stroke="rgba(255,255,255,0.05)" />
        <XAxis
          dataKey="energy"
          type="number"
          domain={[1, 10]}
          name="Energía"
          tick={{ fill: 'rgba(255,255,255,0.45)', fontSize: 10 }}
          axisLine={false}
          tickLine={false}
          label={{ value: 'Energía', position: 'insideBottom', offset: -2, fill: 'rgba(255,255,255,0.3)', fontSize: 9 }}
        />
        <YAxis
          dataKey="avgRpe"
          type="number"
          domain={[0, 10]}
          name="RPE"
          tick={{ fill: 'rgba(255,255,255,0.45)', fontSize: 10 }}
          axisLine={false}
          tickLine={false}
          width={28}
          label={{ value: 'RPE', angle: -90, position: 'insideLeft', fill: 'rgba(255,255,255,0.3)', fontSize: 9 }}
        />
        <Tooltip content={<CustomTooltip />} cursor={{ strokeDasharray: '3 3', stroke: 'rgba(255,255,255,0.15)' }} />
        <ReferenceLine y={7} stroke="rgba(255,255,255,0.12)" strokeDasharray="4 4" />
        <Scatter data={data} shape={<CustomDot />} />
      </ScatterChart>
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
    paddingHorizontal: 10,
    minWidth: 120,
  },
  tooltipName: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.55)',
    marginBottom: 5,
  },
  tooltipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 3,
  },
  tooltipLabel: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.6)',
    marginRight: 10,
  },
  tooltipVal: {
    fontSize: 11,
    color: '#ffffff',
    fontWeight: '600',
  },
});
