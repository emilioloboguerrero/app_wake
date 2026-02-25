import React, { useMemo, useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
  useWindowDimensions,
  Platform,
} from 'react-native';
import { doc, getDoc } from 'firebase/firestore';
import { firestore, auth } from '../config/firebase';
import { useAuth } from '../contexts/AuthContext';
import { FixedWakeHeader, WakeHeaderSpacer, WakeHeaderContent } from '../components/WakeHeader';
import BottomSpacer from '../components/BottomSpacer';
import SvgChartLine from '../components/icons/SvgChartLine';
import SvgListChecklist from '../components/icons/SvgListChecklist';
import SvgBodyPartMuscleStrokeRounded from '../components/icons/SvgBodyPartMuscleStrokeRounded';
import MuscleSilhouette from '../components/MuscleSilhouette';
import LabNutritionPie from '../components/LabNutritionPie';
import exerciseHistoryService from '../services/exerciseHistoryService';
import { getDiaryEntriesInRange } from '../services/nutritionFirestoreService';
import { getMondayWeek, getPreviousWeekKey, isDateInWeek } from '../utils/weekCalculation';
import WakeLoader from '../components/WakeLoader';

const CARD_MARGIN = 24;

function parseExerciseKey(key) {
  const parts = key.split('_');
  const libraryId = parts[0];
  const exerciseName = parts.slice(1).join('_');
  return { libraryId, exerciseName };
}

function getLatestPRs(oneRepMaxEstimates, limit = 3) {
  if (!oneRepMaxEstimates || typeof oneRepMaxEstimates !== 'object') return [];
  const entries = Object.entries(oneRepMaxEstimates)
    .filter(([, v]) => v && typeof v.current === 'number' && v.lastUpdated)
    .map(([exerciseKey, v]) => ({
      exerciseKey,
      exerciseName: parseExerciseKey(exerciseKey).exerciseName,
      current: v.current,
      lastUpdated: v.lastUpdated,
      achievedWith: v.achievedWith
    }))
    .sort((a, b) => new Date(b.lastUpdated) - new Date(a.lastUpdated));
  return entries.slice(0, limit);
}

function sumVolumeForWeek(weekData) {
  if (!weekData || typeof weekData !== 'object') return 0;
  return Object.values(weekData).reduce((s, n) => s + (Number(n) || 0), 0);
}

function formatDaysAgo(isoString) {
  if (!isoString) return '';
  const d = new Date(isoString);
  const now = new Date();
  const diffMs = now - d;
  const days = Math.floor(diffMs / (24 * 60 * 60 * 1000));
  if (days === 0) return 'Hoy';
  if (days === 1) return 'Ayer';
  if (days < 7) return `Hace ${days} días`;
  if (days < 30) return `Hace ${Math.floor(days / 7)} sem`;
  return `Hace ${Math.floor(days / 30)} mes`;
}

function toYYYYMMDD(d) {
  const x = new Date(d);
  const y = x.getFullYear();
  const m = String(x.getMonth() + 1).padStart(2, '0');
  const day = String(x.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function aggregateDiaryByDay(entries) {
  const byDay = {};
  entries.forEach((e) => {
    const date = e.date;
    if (!date) return;
    if (!byDay[date]) byDay[date] = { calories: 0, protein: 0, carbs: 0, fat: 0, count: 0 };
    byDay[date].calories += Number(e.calories) || 0;
    byDay[date].protein += Number(e.protein) || 0;
    byDay[date].carbs += Number(e.carbs) || 0;
    byDay[date].fat += Number(e.fat) || 0;
    byDay[date].count += 1;
  });
  return byDay;
}

function averageMacrosLast7AndPrevious7(byDay, todayYYYYMMDD) {
  if (Object.keys(byDay).length === 0) return null;
  const today = new Date(todayYYYYMMDD + 'T12:00:00');
  const last7Dates = [];
  const prev7Dates = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    last7Dates.push(toYYYYMMDD(d));
  }
  for (let i = 7; i < 14; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    prev7Dates.push(toYYYYMMDD(d));
  }
  const sum = (dates, key) => dates.reduce((s, d) => s + (byDay[d]?.[key] || 0), 0);
  const avg = (dates, key) => dates.length ? sum(dates, key) / dates.length : 0;
  const last7 = { calories: avg(last7Dates, 'calories'), protein: avg(last7Dates, 'protein'), carbs: avg(last7Dates, 'carbs'), fat: avg(last7Dates, 'fat') };
  const prev7 = { calories: avg(prev7Dates, 'calories'), protein: avg(prev7Dates, 'protein'), carbs: avg(prev7Dates, 'carbs'), fat: avg(prev7Dates, 'fat') };
  const pct = (curr, prev) => (prev > 0 ? Math.round(((curr - prev) / prev) * 100) : (curr > 0 ? 100 : 0));
  return {
    last7,
    prev7,
    pctCalories: pct(last7.calories, prev7.calories),
    pctProtein: pct(last7.protein, prev7.protein),
    pctCarbs: pct(last7.carbs, prev7.carbs),
    pctFat: pct(last7.fat, prev7.fat)
  };
}

const LabScreen = ({ navigation }) => {
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const { user: contextUser } = useAuth();
  const [fallbackUser, setFallbackUser] = useState(null);
  const user = contextUser || fallbackUser || auth.currentUser;
  const [loading, setLoading] = useState(true);
  const [userData, setUserData] = useState(null);
  const [sessions, setSessions] = useState({});
  const [sessionsLoaded, setSessionsLoaded] = useState(false);
  const [diaryEntries, setDiaryEntries] = useState([]);

  const currentWeek = useMemo(() => getMondayWeek(), []);
  const previousWeek = useMemo(() => getPreviousWeekKey(currentWeek), [currentWeek]);

  const loadData = useCallback(async () => {
    const uid = user?.uid || auth.currentUser?.uid;
    if (!uid) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const end = new Date();
      const start = new Date(end);
      start.setDate(start.getDate() - 14);
      const startStr = toYYYYMMDD(start);
      const endStr = toYYYYMMDD(end);
      const [userSnap, sessionResult, entries] = await Promise.all([
        getDoc(doc(firestore, 'users', uid)),
        exerciseHistoryService.getSessionHistoryPaginated(uid, 50),
        getDiaryEntriesInRange(uid, startStr, endStr)
      ]);
      if (userSnap.exists()) setUserData(userSnap.data());
      if (sessionResult?.sessions) setSessions(sessionResult.sessions);
      setDiaryEntries(entries || []);
      setSessionsLoaded(true);
    } catch (err) {
      setUserData(null);
      setSessions({});
      setDiaryEntries([]);
      setSessionsLoaded(true);
    } finally {
      setLoading(false);
    }
  }, [user?.uid]);

  useEffect(() => {
    if (!contextUser && Platform.OS === 'web' && auth.currentUser) {
      setFallbackUser(auth.currentUser);
    }
  }, [contextUser]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const latestPRs = useMemo(() => getLatestPRs(userData?.oneRepMaxEstimates, 3), [userData?.oneRepMaxEstimates]);

  const sessionList = useMemo(() => Object.values(sessions).sort((a, b) => {
    const da = a.completedAt ? new Date(a.completedAt) : new Date(0);
    const db = b.completedAt ? new Date(b.completedAt) : new Date(0);
    return db - da;
  }), [sessions]);

  const thisWeekCount = useMemo(() => sessionList.filter(s => {
    const completedAt = s.completedAt ? new Date(s.completedAt) : null;
    return completedAt && isDateInWeek(completedAt, currentWeek);
  }).length, [sessionList, currentWeek]);

  const lastWeekCount = useMemo(() => sessionList.filter(s => {
    const completedAt = s.completedAt ? new Date(s.completedAt) : null;
    return completedAt && isDateInWeek(completedAt, previousWeek);
  }).length, [sessionList, previousWeek]);

  const lastSession = sessionList[0] || null;

  const consistencyPct = lastWeekCount > 0
    ? Math.round(((thisWeekCount - lastWeekCount) / lastWeekCount) * 100)
    : (thisWeekCount > 0 ? 100 : 0);

  const weeklyVolume = userData?.weeklyMuscleVolume || {};
  const volumeThisWeek = useMemo(() => sumVolumeForWeek(weeklyVolume[currentWeek]), [weeklyVolume, currentWeek]);
  const volumeLastWeek = useMemo(() => sumVolumeForWeek(weeklyVolume[previousWeek]), [weeklyVolume, previousWeek]);
  const volumePctChange = volumeLastWeek > 0
    ? Math.round(((volumeThisWeek - volumeLastWeek) / volumeLastWeek) * 100)
    : (volumeThisWeek > 0 ? 100 : 0);

  const currentWeekVolumeData = useMemo(() => weeklyVolume[currentWeek] || {}, [weeklyVolume, currentWeek]);

  const nutritionStats = useMemo(() => {
    const byDay = aggregateDiaryByDay(diaryEntries);
    const todayStr = toYYYYMMDD(new Date());
    return averageMacrosLast7AndPrevious7(byDay, todayStr);
  }, [diaryEntries]);

  const macroPieData = useMemo(() => {
    if (!nutritionStats) return [];
    const { last7 } = nutritionStats;
    const p = Math.round(last7.protein) || 0;
    const c = Math.round(last7.carbs) || 0;
    const f = Math.round(last7.fat) || 0;
    const totalG = p + c + f;
    if (totalG <= 0) return [];
    return [
      { name: 'Proteína', value: p, grams: p },
      { name: 'Carbohidratos', value: c, grams: c },
      { name: 'Grasa', value: f, grams: f },
    ].filter((d) => d.value > 0);
  }, [nutritionStats]);

  const styles = useMemo(() => createStyles(screenWidth, screenHeight), [screenWidth, screenHeight]);

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, styles.centered]} edges={Platform.OS === 'web' ? ['left', 'right'] : ['bottom', 'left', 'right']}>
        <FixedWakeHeader />
        <WakeLoader />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={Platform.OS === 'web' ? ['left', 'right'] : ['bottom', 'left', 'right']}>
      <FixedWakeHeader />
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContentContainer}
        showsVerticalScrollIndicator={false}
      >
        <WakeHeaderContent>
          <WakeHeaderSpacer />
          <View style={styles.titleSection}>
            <Text style={styles.screenTitle}>Lab</Text>
          </View>

          {/* Card: Últimos récords (3 PRs with weight × reps) */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Últimos récords</Text>
            {latestPRs.length === 0 ? (
              <Text style={styles.cardEmpty}>Completa sesiones con peso y repeticiones para ver tus récords.</Text>
            ) : (
              latestPRs.map((pr) => (
                <View key={pr.exerciseKey} style={styles.prRow}>
                  <Text style={styles.prName} numberOfLines={1}>{pr.exerciseName}</Text>
                  <View style={styles.prValues}>
                    <Text style={styles.prCurrent}>{pr.current != null ? `${Math.round(pr.current)} kg` : '—'}</Text>
                    {pr.achievedWith?.weight != null && pr.achievedWith?.reps != null && (
                      <Text style={styles.prAchieved}>
                        {pr.achievedWith.weight} kg × {pr.achievedWith.reps} reps
                      </Text>
                    )}
                  </View>
                </View>
              ))
            )}
          </View>

          {/* Card: Volumen de la semana (muscles SVG + total + % change) */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Volumen de la semana</Text>
            <View style={styles.tendenciesContent}>
              <View style={styles.tendenciesMain}>
                <Text style={styles.tendenciesNumber}>{volumeThisWeek}</Text>
                <Text style={styles.tendenciesUnit}>series</Text>
              </View>
              <View style={styles.tendenciesChange}>
                {volumeLastWeek > 0 && (
                  <>
                    <Text style={[styles.tendenciesPercentage, volumePctChange >= 0 && styles.tendenciesPercentageUp, volumePctChange < 0 && styles.tendenciesPercentageDown]}>
                      {volumePctChange > 0 ? `+${volumePctChange}%` : volumePctChange === 0 ? '0%' : `${volumePctChange}%`}
                    </Text>
                    <Text style={styles.tendenciesChangeLabel}>vs. sem. anterior</Text>
                  </>
                )}
                {volumeLastWeek === 0 && volumeThisWeek > 0 && (
                  <Text style={styles.tendenciesChangeLabel}>Primera semana con volumen</Text>
                )}
              </View>
            </View>
            <MuscleSilhouette
              muscleVolumes={currentWeekVolumeData}
              numberOfWeeks={1}
              weekDisplayName="Esta semana"
              showCurrentWeekLabel
              availableWeeks={[]}
              selectedWeek={currentWeek}
              currentWeek={currentWeek}
              isReadOnly
              showWeeklyAverageNote={false}
            />
          </View>

          {/* Card: Consistencia (sesiones esta semana + % change) */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Consistencia</Text>
            <View style={styles.tendenciesContent}>
              <View style={styles.tendenciesMain}>
                <Text style={styles.tendenciesNumber}>{thisWeekCount}</Text>
                <Text style={styles.tendenciesUnit}>sesiones</Text>
              </View>
              <View style={styles.tendenciesChange}>
                {lastWeekCount > 0 ? (
                  <>
                    <Text style={[styles.tendenciesPercentage, consistencyPct >= 0 && styles.tendenciesPercentageUp, consistencyPct < 0 && styles.tendenciesPercentageDown]}>
                      {consistencyPct > 0 ? `+${consistencyPct}%` : consistencyPct === 0 ? '0%' : `${consistencyPct}%`}
                    </Text>
                    <Text style={styles.tendenciesChangeLabel}>vs. sem. anterior</Text>
                  </>
                ) : thisWeekCount === 0 && lastWeekCount === 0 ? (
                  <Text style={styles.tendenciesChangeLabel}>Completa una sesión</Text>
                ) : (
                  <Text style={styles.tendenciesChangeLabel}>vs. sem. anterior</Text>
                )}
              </View>
            </View>
          </View>

          {/* Card: Nutrición (promedio últimos 7 días + pie macros + % vs semana anterior) */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Nutrición</Text>
            {!nutritionStats ? (
              <Text style={styles.cardEmpty}>Registra comidas en los últimos 14 días para ver promedios y tendencia.</Text>
            ) : (
              <>
                <View style={styles.nutritionRow}>
                  <View style={styles.tendenciesMain}>
                    <Text style={styles.tendenciesNumber}>{Math.round(nutritionStats.last7.calories)}</Text>
                    <Text style={styles.tendenciesUnit}>kcal</Text>
                  </View>
                  {nutritionStats.prev7.calories > 0 && (
                    <View style={styles.tendenciesChange}>
                      <Text style={[styles.tendenciesPercentage, nutritionStats.pctCalories >= 0 && styles.tendenciesPercentageUp, nutritionStats.pctCalories < 0 && styles.tendenciesPercentageDown]}>
                        {nutritionStats.pctCalories > 0 ? `+${nutritionStats.pctCalories}%` : nutritionStats.pctCalories === 0 ? '0%' : `${nutritionStats.pctCalories}%`}
                      </Text>
                      <Text style={styles.tendenciesChangeLabel}>vs. sem. anterior</Text>
                    </View>
                  )}
                </View>
                {macroPieData.length > 0 && (
                  <View style={styles.nutritionPieWrap}>
                    <LabNutritionPie data={macroPieData} screenWidth={screenWidth} />
                  </View>
                )}
                <View style={styles.nutritionMacrosRow}>
                  <View style={styles.nutritionMacro}>
                    <View style={styles.tendenciesMain}>
                      <Text style={styles.nutritionMacroValue}>{Math.round(nutritionStats.last7.protein)}</Text>
                      <Text style={styles.tendenciesUnit}>g P</Text>
                    </View>
                    {nutritionStats.prev7.protein > 0 && (
                      <Text style={[styles.nutritionMacroPct, nutritionStats.pctProtein >= 0 && styles.tendenciesPercentageUp, nutritionStats.pctProtein < 0 && styles.tendenciesPercentageDown]}>
                        {nutritionStats.pctProtein > 0 ? '+' : ''}{nutritionStats.pctProtein}%
                      </Text>
                    )}
                  </View>
                  <View style={styles.nutritionMacro}>
                    <View style={styles.tendenciesMain}>
                      <Text style={styles.nutritionMacroValue}>{Math.round(nutritionStats.last7.carbs)}</Text>
                      <Text style={styles.tendenciesUnit}>g C</Text>
                    </View>
                    {nutritionStats.prev7.carbs > 0 && (
                      <Text style={[styles.nutritionMacroPct, nutritionStats.pctCarbs >= 0 && styles.tendenciesPercentageUp, nutritionStats.pctCarbs < 0 && styles.tendenciesPercentageDown]}>
                        {nutritionStats.pctCarbs > 0 ? '+' : ''}{nutritionStats.pctCarbs}%
                      </Text>
                    )}
                  </View>
                  <View style={styles.nutritionMacro}>
                    <View style={styles.tendenciesMain}>
                      <Text style={styles.nutritionMacroValue}>{Math.round(nutritionStats.last7.fat)}</Text>
                      <Text style={styles.tendenciesUnit}>g G</Text>
                    </View>
                    {nutritionStats.prev7.fat > 0 && (
                      <Text style={[styles.nutritionMacroPct, nutritionStats.pctFat >= 0 && styles.tendenciesPercentageUp, nutritionStats.pctFat < 0 && styles.tendenciesPercentageDown]}>
                        {nutritionStats.pctFat > 0 ? '+' : ''}{nutritionStats.pctFat}%
                      </Text>
                    )}
                  </View>
                </View>
              </>
            )}
          </View>

          {/* Card: Último entrenamiento */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Último entrenamiento</Text>
            {!lastSession ? (
              <Text style={styles.cardEmpty}>Completa una sesión para verla aquí.</Text>
            ) : (
              <>
                <Text style={styles.lastSessionName} numberOfLines={2}>{lastSession.sessionName || 'Sesión'}</Text>
                <Text style={styles.lastSessionMeta}>
                  {lastSession.courseName ? `${lastSession.courseName} · ` : ''}{formatDaysAgo(lastSession.completedAt)}
                </Text>
                {lastSession.duration > 0 && (
                  <Text style={styles.lastSessionDuration}>Duración: {lastSession.duration} min</Text>
                )}
              </>
            )}
          </View>

          {/* Navigation Cards container */}
          <View style={styles.navCardsContainer}>
            <TouchableOpacity
              style={styles.navCard}
              onPress={() => navigation.navigate('Sessions')}
              activeOpacity={0.7}
            >
              <SvgListChecklist width={20} height={20} stroke="#ffffff" strokeWidth={2} style={styles.navCardIcon} />
              <View style={styles.navCardContent}>
                <Text style={styles.navCardTitle}>Sesiones</Text>
                <Text style={styles.navCardSubtitle}>Ver historial de sesiones completadas</Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.navCard}
              onPress={() => navigation.navigate('ExercisePanel')}
              activeOpacity={0.7}
            >
              <SvgChartLine width={20} height={20} color="#ffffff" strokeWidth={2} style={styles.navCardIcon} />
              <View style={styles.navCardContent}>
                <Text style={styles.navCardTitle}>Ejercicios</Text>
                <Text style={styles.navCardSubtitle}>Ver progreso y estadísticas de ejercicios</Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.navCard, styles.navCardLast]}
              onPress={() => navigation.navigate('WeeklyVolumeHistory')}
              activeOpacity={0.7}
            >
              <SvgBodyPartMuscleStrokeRounded width={20} height={20} stroke="#ffffff" strokeWidth={1.5} style={styles.navCardIcon} />
              <View style={styles.navCardContent}>
                <Text style={styles.navCardTitle}>Volumen</Text>
                <Text style={styles.navCardSubtitle}>Ver historial de volumen semanal</Text>
              </View>
            </TouchableOpacity>
          </View>

          <BottomSpacer />
          <View style={styles.bottomSpacer} />
        </WakeHeaderContent>
      </ScrollView>
    </SafeAreaView>
  );
};

const createStyles = (screenWidth, screenHeight) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a1a',
  },
  centered: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollView: {
    flex: 1,
  },
  scrollContentContainer: {
    flexGrow: 1,
    paddingBottom: 80,
  },
  bottomSpacer: {
    height: Math.max(80, screenHeight * 0.1),
  },
  titleSection: {
    paddingTop: Math.max(16, screenHeight * 0.02),
    marginTop: 0,
    marginBottom: Math.max(20, screenHeight * 0.03),
  },
  screenTitle: {
    fontSize: Math.min(screenWidth * 0.08, 32),
    fontWeight: '600',
    color: '#ffffff',
    textAlign: 'left',
    paddingLeft: screenWidth * 0.12,
    marginBottom: 20,
  },
  card: {
    width: screenWidth - 2 * CARD_MARGIN,
    alignSelf: 'center',
    marginHorizontal: CARD_MARGIN,
    marginBottom: Math.max(16, screenHeight * 0.02),
    backgroundColor: '#2a2a2a',
    borderRadius: Math.max(12, screenWidth * 0.04),
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    padding: Math.max(16, screenWidth * 0.04),
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#ffffff',
    marginBottom: 12,
  },
  cardEmpty: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.6)',
  },
  prRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.08)',
  },
  prName: {
    flex: 1,
    fontSize: 15,
    color: '#ffffff',
    marginRight: 12,
  },
  prValues: {
    alignItems: 'flex-end',
  },
  prCurrent: {
    fontSize: 15,
    fontWeight: '600',
    color: '#ffffff',
  },
  prAchieved: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.7)',
    marginTop: 2,
  },
  tendenciesContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  tendenciesMain: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  tendenciesNumber: {
    color: '#ffffff',
    fontSize: Math.min(screenWidth * 0.08, 32),
    fontWeight: '700',
    marginRight: Math.max(8, screenWidth * 0.02),
  },
  tendenciesUnit: {
    color: '#ffffff',
    fontSize: Math.min(screenWidth * 0.04, 16),
    opacity: 0.7,
  },
  tendenciesChange: {
    alignItems: 'flex-end',
  },
  tendenciesPercentage: {
    color: '#ffffff',
    fontSize: Math.min(screenWidth * 0.035, 14),
    fontWeight: '600',
  },
  tendenciesPercentageUp: {
    color: '#4ade80',
  },
  tendenciesPercentageDown: {
    color: '#f87171',
  },
  tendenciesChangeLabel: {
    color: '#ffffff',
    fontSize: Math.min(screenWidth * 0.03, 12),
    opacity: 0.7,
    marginTop: 2,
  },
  nutritionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  nutritionPieWrap: {
    alignItems: 'center',
    marginVertical: 12,
  },
  nutritionMacrosRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  nutritionMacro: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flex: 1,
    marginHorizontal: 4,
  },
  nutritionMacroValue: {
    fontSize: Math.min(screenWidth * 0.045, 18),
    fontWeight: '600',
    color: '#ffffff',
    marginRight: 4,
  },
  nutritionMacroPct: {
    fontSize: Math.min(screenWidth * 0.03, 12),
    fontWeight: '600',
  },
  positiveChange: {
    color: 'rgba(191, 168, 77, 0.95)',
  },
  lastSessionName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ffffff',
    marginBottom: 4,
  },
  lastSessionMeta: {
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.7)',
  },
  lastSessionDuration: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.5)',
    marginTop: 4,
  },
  navCardsContainer: {
    width: screenWidth - 2 * CARD_MARGIN,
    alignSelf: 'center',
    marginHorizontal: CARD_MARGIN,
    marginBottom: Math.max(16, screenHeight * 0.02),
    backgroundColor: '#2a2a2a',
    borderRadius: Math.max(12, screenWidth * 0.04),
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    padding: Math.max(16, screenWidth * 0.04),
  },
  navCard: {
    backgroundColor: 'transparent',
    borderRadius: Math.max(8, screenWidth * 0.02),
    borderWidth: 0,
    paddingVertical: Math.max(14, screenHeight * 0.018),
    paddingHorizontal: 0,
    marginBottom: Math.max(8, screenHeight * 0.01),
    marginHorizontal: 0,
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: Math.max(56, screenHeight * 0.07),
  },
  navCardLast: {
    marginBottom: 0,
  },
  navCardIcon: {
    marginRight: 16,
  },
  navCardContent: {
    flex: 1,
  },
  navCardTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ffffff',
    marginBottom: 3,
  },
  navCardSubtitle: {
    fontSize: 13,
    fontWeight: '400',
    color: '#999999',
  },
});

export { LabScreen as LabScreenBase };
export default LabScreen;
