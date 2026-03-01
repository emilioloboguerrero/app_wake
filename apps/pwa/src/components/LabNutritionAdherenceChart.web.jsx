import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
  Cell,
} from 'recharts';

function formatDateAxis(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T12:00:00');
  const months = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
  return `${d.getDate()} ${months[d.getMonth()]}`;
}

function getBarColor(pct) {
  if (pct == null) return 'rgba(255,255,255,0.08)';
  if (pct >= 90) return 'rgba(74,222,128,0.55)';
  if (pct >= 70) return 'rgba(191,168,77,0.55)';
  return 'rgba(248,113,113,0.55)';
}

const CustomTooltip = ({ active, payload }) => {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  if (!d.logged && d.logged !== 0) return null;
  return (
    <View style={styles.tooltip}>
      <Text style={styles.tooltipDate}>{formatDateAxis(d.date)}</Text>
      <Text style={styles.tooltipLogged}>{Math.round(d.logged)} kcal</Text>
      {d.target > 0 && (
        <Text style={styles.tooltipPct}>
          {d.pct != null ? `${Math.round(d.pct)}% del objetivo` : '—'}
        </Text>
      )}
    </View>
  );
};

export default function LabNutritionAdherenceChart({ data, target }) {
  if (!data || data.length === 0) return null;

  const hasTarget = target > 0;
  const maxLogged = Math.max(...data.map((d) => d.logged || 0));
  const yMax = hasTarget
    ? Math.ceil(Math.max(maxLogged, target) * 1.1)
    : Math.ceil(maxLogged * 1.1) || 100;

  return (
    <ResponsiveContainer width="100%" height={160}>
      <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} barCategoryGap="15%">
        <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
        <XAxis
          dataKey="date"
          tickFormatter={(d, i) => (i % 7 === 0 ? formatDateAxis(d) : '')}
          tick={{ fill: 'rgba(255,255,255,0.45)', fontSize: 10 }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          domain={[0, yMax]}
          tick={{ fill: 'rgba(255,255,255,0.45)', fontSize: 10 }}
          axisLine={false}
          tickLine={false}
          width={40}
          tickFormatter={(v) => v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(v)}
        />
        <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
        {hasTarget && (
          <ReferenceLine
            y={target}
            stroke="rgba(255,255,255,0.4)"
            strokeDasharray="3 3"
            label={{ value: `${Math.round(target)} kcal`, position: 'insideTopRight', fill: 'rgba(255,255,255,0.4)', fontSize: 10 }}
          />
        )}
        <Bar dataKey="logged" radius={[2, 2, 0, 0]}>
          {data.map((entry, i) => (
            <Cell key={i} fill={getBarColor(entry.pct)} />
          ))}
        </Bar>
      </BarChart>
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
  tooltipDate: {
    fontSize: 10,
    color: 'rgba(255,255,255,0.5)',
    marginBottom: 3,
  },
  tooltipLogged: {
    fontSize: 14,
    fontWeight: '700',
    color: '#ffffff',
  },
  tooltipPct: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.6)',
    marginTop: 2,
  },
});
