import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';

const DAY_LABELS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
const CELL_SIZE = 11;
const CELL_GAP = 3;

function formatWeekLabel(weekKey) {
  if (!weekKey) return '';
  try {
    const [year, weekWithW] = weekKey.split('-');
    const week = weekWithW.replace('W', '');
    const jan1 = new Date(year, 0, 1);
    const jan1Day = jan1.getDay();
    const daysToFirstMonday = jan1Day === 0 ? 1 : 8 - jan1Day;
    const firstMonday = new Date(jan1);
    firstMonday.setDate(jan1.getDate() + daysToFirstMonday);
    const weekStart = new Date(firstMonday);
    weekStart.setDate(firstMonday.getDate() + (parseInt(week) - 1) * 7);
    const months = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
    return `${weekStart.getDate()} ${months[weekStart.getMonth()]}`;
  } catch {
    return '';
  }
}

function getCellColor(count, readinessEntry) {
  const hasSession = count > 0;
  if (!readinessEntry) return hasSession ? 'rgba(255,255,255,0.78)' : 'rgba(255,255,255,0.06)';
  const { energy } = readinessEntry;
  if (energy >= 7) return hasSession ? 'rgba(74,222,128,0.9)' : 'rgba(74,222,128,0.22)';
  if (energy <= 4) return hasSession ? 'rgba(248,113,113,0.78)' : 'rgba(248,113,113,0.18)';
  return hasSession ? 'rgba(255,255,255,0.78)' : 'rgba(255,255,255,0.06)';
}

export default function LabConsistencyGrid({ weeks, readinessByDay = {} }) {
  if (!weeks || weeks.length === 0) return null;

  const totalSessions = weeks.reduce((s, w) => s + w.days.reduce((d, day) => d + (day.count || 0), 0), 0);
  const weekWithMost = weeks.reduce((best, w) => {
    const wTotal = w.days.reduce((s, d) => s + (d.count || 0), 0);
    return wTotal > best.count ? { count: wTotal, key: w.weekKey } : best;
  }, { count: 0, key: null });

  const colWidth = CELL_SIZE + CELL_GAP;
  const totalWidth = weeks.length * colWidth + 20; // 20 for day labels

  return (
    <View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View style={styles.grid}>
          {/* Day labels column */}
          <View style={styles.dayLabels}>
            {DAY_LABELS.map((d, i) => (
              <View key={i} style={[styles.dayLabelWrap, { height: CELL_SIZE, marginBottom: CELL_GAP }]}>
                <Text style={styles.dayLabel}>{d}</Text>
              </View>
            ))}
          </View>
          {/* Columns */}
          <View style={styles.columns}>
            {weeks.map((week, wi) => (
              <View key={week.weekKey} style={[styles.column, { marginRight: CELL_GAP }]}>
                {week.days.map((day, di) => (
                  <View
                    key={di}
                    style={[
                      styles.cell,
                      {
                        backgroundColor: getCellColor(day.count, readinessByDay[day.date]),
                        width: CELL_SIZE,
                        height: CELL_SIZE,
                        marginBottom: CELL_GAP,
                      },
                    ]}
                  />
                ))}
                {/* Week label below — only show every 3rd week to avoid clutter */}
                <Text style={styles.weekLabel}>
                  {wi % 3 === 0 ? formatWeekLabel(week.weekKey) : ''}
                </Text>
              </View>
            ))}
          </View>
        </View>
      </ScrollView>
      <View style={styles.statsRow}>
        <Text style={styles.statText}>{totalSessions} sesiones en {weeks.length} semanas</Text>
        {weekWithMost.count > 0 && (
          <Text style={styles.statText}>Semana más activa: {weekWithMost.count} sesiones</Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
  },
  dayLabels: {
    marginRight: 6,
    paddingTop: 0,
  },
  dayLabelWrap: {
    justifyContent: 'center',
  },
  dayLabel: {
    fontSize: 9,
    color: 'rgba(255,255,255,0.35)',
    width: 10,
  },
  columns: {
    flexDirection: 'row',
  },
  column: {
    flexDirection: 'column',
  },
  cell: {
    borderRadius: 2,
  },
  weekLabel: {
    fontSize: 8,
    color: 'rgba(255,255,255,0.3)',
    marginTop: 3,
    width: CELL_SIZE + 20,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 12,
    flexWrap: 'wrap',
    gap: 4,
  },
  statText: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.45)',
  },
});
