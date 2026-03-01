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
import { collection, doc, getDoc, getDocs, query, orderBy } from 'firebase/firestore';
import { firestore, auth } from '../config/firebase';
import { useAuth } from '../contexts/AuthContext';
import { FixedWakeHeader, WakeHeaderSpacer, WakeHeaderContent } from '../components/WakeHeader';
import BottomSpacer from '../components/BottomSpacer';
import WakeLoader from '../components/WakeLoader';
import LabNutritionPie from '../components/LabNutritionPie';
import LabStrengthChart from '../components/LabStrengthChart';
import LabVolumeBarChart from '../components/LabVolumeBarChart';
import LabRpeChart from '../components/LabRpeChart';
import LabNutritionAdherenceChart from '../components/LabNutritionAdherenceChart';
import LabProteinMealBars from '../components/LabProteinMealBars';
import LabEnergyAvailabilityChart from '../components/LabEnergyAvailabilityChart';
import LabConsistencyGrid from '../components/LabConsistencyGrid';
import LabReadinessChart from '../components/LabReadinessChart';
import LabMuscleHeatmap from '../components/LabMuscleHeatmap.web.jsx';
import LabReadinessRpeScatter from '../components/LabReadinessRpeScatter.web.jsx';
import exerciseHistoryService from '../services/exerciseHistoryService';
import { getReadinessInRange } from '../services/readinessService';
import { getDiaryEntriesInRange, getEffectivePlanForUser } from '../services/nutritionFirestoreService';
import {
  getMondayWeek,
  getPreviousWeekKey,
  getWeekDates,
  formatWeekDisplay,
} from '../utils/weekCalculation';
import logger from '../utils/logger';

const CARD_MARGIN = 24;

// ─── helpers ──────────────────────────────────────────────────────────────────

function toYYYYMMDD(d) {
  const x = new Date(d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
}

function parseIntensity(s) {
  if (!s) return null;
  const m = String(s).match(/^(\d+(?:\.\d+)?)/);
  if (!m) return null;
  const v = parseFloat(m[1]);
  return isNaN(v) ? null : v;
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

function averageMacrosLast7AndPrev7(byDay, todayYYYYMMDD) {
  if (!byDay || Object.keys(byDay).length === 0) return null;
  const today = new Date(todayYYYYMMDD + 'T12:00:00');
  const last7 = [], prev7 = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(today); d.setDate(d.getDate() - i);
    last7.push(toYYYYMMDD(d));
  }
  for (let i = 7; i < 14; i++) {
    const d = new Date(today); d.setDate(d.getDate() - i);
    prev7.push(toYYYYMMDD(d));
  }
  const avg = (dates, key) => {
    const vals = dates.map((d) => byDay[d]?.[key] || 0);
    return vals.reduce((s, v) => s + v, 0) / dates.length;
  };
  const l = { calories: avg(last7, 'calories'), protein: avg(last7, 'protein'), carbs: avg(last7, 'carbs'), fat: avg(last7, 'fat') };
  const p = { calories: avg(prev7, 'calories'), protein: avg(prev7, 'protein'), carbs: avg(prev7, 'carbs'), fat: avg(prev7, 'fat') };
  const pct = (c, pr) => pr > 0 ? Math.round(((c - pr) / pr) * 100) : (c > 0 ? 100 : 0);
  return {
    last7: l, prev7: p,
    pctCalories: pct(l.calories, p.calories),
    pctProtein: pct(l.protein, p.protein),
    pctCarbs: pct(l.carbs, p.carbs),
    pctFat: pct(l.fat, p.fat),
  };
}

function formatDaysAgo(isoString) {
  if (!isoString) return '';
  const days = Math.floor((Date.now() - new Date(isoString)) / 86400000);
  if (days === 0) return 'Hoy';
  if (days === 1) return 'Ayer';
  if (days < 7) return `Hace ${days} días`;
  if (days < 30) return `Hace ${Math.floor(days / 7)} sem`;
  return `Hace ${Math.floor(days / 30)} mes`;
}

function getAdherenceColor(pct) {
  if (pct == null) return 'rgba(255,255,255,0.45)';
  if (pct >= 90) return '#4ade80';
  if (pct >= 70) return 'rgba(191,168,77,0.95)';
  return '#f87171';
}

// ─── LabScreen ─────────────────────────────────────────────────────────────────

const LabScreen = ({ navigation }) => {
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const { user: contextUser } = useAuth();
  const [fallbackUser, setFallbackUser] = useState(null);
  const user = contextUser || fallbackUser || auth.currentUser;

  const [loading, setLoading] = useState(true);
  const [userData, setUserData] = useState(null);
  const [sessions, setSessions] = useState({});
  const [diaryEntries, setDiaryEntries] = useState([]);
  const [plan, setPlan] = useState(null);
  const [readinessEntries, setReadinessEntries] = useState([]);
  const [oneRepMaxHistories, setOneRepMaxHistories] = useState([]);
  const [activeTab, setActiveTab] = useState('fuerza');
  const [selectedExerciseKey, setSelectedExerciseKey] = useState(null);
  const [rangeWeeks, setRangeWeeks] = useState(8);
  const currentWeek = useMemo(() => getMondayWeek(), []);
  const previousWeek = useMemo(() => getPreviousWeekKey(currentWeek), [currentWeek]);

  const loadData = useCallback(async () => {
    const uid = user?.uid || auth.currentUser?.uid;
    if (!uid) { setLoading(false); return; }
    setLoading(true);
    try {
      const end = toYYYYMMDD(new Date());
      const startD = new Date(); startD.setDate(startD.getDate() - 56);
      const start = toYYYYMMDD(startD);

      const [userSnap, sessionResult, entries, planResult, readinessData] = await Promise.all([
        getDoc(doc(firestore, 'users', uid)),
        exerciseHistoryService.getSessionHistoryPaginated(uid, 100),
        getDiaryEntriesInRange(uid, start, end),
        getEffectivePlanForUser(uid).catch(() => ({ plan: null, assignment: null })),
        getReadinessInRange(uid, start, end),
      ]);

      const uData = userSnap.exists() ? userSnap.data() : null;
      if (uData) setUserData(uData);
      if (sessionResult?.sessions) setSessions(sessionResult.sessions);
      setDiaryEntries(entries || []);
      setPlan(planResult?.plan || null);
      setReadinessEntries(readinessData || []);

      // Fetch 1RM histories for top 5 exercises
      if (uData?.oneRepMaxEstimates) {
        const topKeys = Object.entries(uData.oneRepMaxEstimates)
          .filter(([, v]) => v?.current && v?.lastUpdated)
          .sort((a, b) => new Date(b[1].lastUpdated) - new Date(a[1].lastUpdated))
          .slice(0, 5)
          .map(([k]) => k);

        const histories = await Promise.all(
          topKeys.map(async (key) => {
            try {
              const q = query(
                collection(firestore, 'users', uid, 'oneRepMaxHistory', key, 'records'),
                orderBy('date', 'asc')
              );
              const snap = await getDocs(q);
              return {
                exerciseKey: key,
                records: snap.docs.map((d) => {
                  const data = d.data();
                  let dateVal = data.date;
                  if (dateVal && typeof dateVal.toDate === 'function') dateVal = dateVal.toDate().toISOString();
                  return { date: dateVal, value: data.estimate };
                }),
              };
            } catch (err) {
              logger.error('[Lab] 1RM history fetch error', key, err?.message);
              return { exerciseKey: key, records: [] };
            }
          })
        );
        setOneRepMaxHistories(histories);
      }
    } catch (err) {
      logger.error('[Lab] loadData error', err?.message);
    } finally {
      setLoading(false);
    }
  }, [user?.uid]);

  useEffect(() => {
    if (!contextUser && Platform.OS === 'web' && auth.currentUser) setFallbackUser(auth.currentUser);
  }, [contextUser]);

  useEffect(() => { loadData(); }, [loadData]);

  // ─── computations ──────────────────────────────────────────────────────────

  const sessionList = useMemo(() =>
    Object.values(sessions).sort((a, b) => new Date(b.completedAt || 0) - new Date(a.completedAt || 0)),
    [sessions]
  );

  const topExercises = useMemo(() => {
    const est = userData?.oneRepMaxEstimates;
    if (!est) return [];
    return Object.entries(est)
      .filter(([, v]) => v?.current && v?.lastUpdated)
      .sort((a, b) => new Date(b[1].lastUpdated) - new Date(a[1].lastUpdated))
      .slice(0, 5)
      .map(([key, v]) => ({
        key,
        name: key.split('_').slice(1).join(' '),
        current: v.current,
        lastUpdated: v.lastUpdated,
        achievedWith: v.achievedWith,
      }));
  }, [userData?.oneRepMaxEstimates]);

  useEffect(() => {
    if (!selectedExerciseKey && topExercises.length > 0) {
      setSelectedExerciseKey(topExercises[0].key);
    }
  }, [topExercises, selectedExerciseKey]);

  const strengthChartData = useMemo(() => {
    if (!selectedExerciseKey) return [];
    const hist = oneRepMaxHistories.find((h) => h.exerciseKey === selectedExerciseKey);
    return hist?.records || [];
  }, [selectedExerciseKey, oneRepMaxHistories]);

  const current1RM = useMemo(() => {
    if (!selectedExerciseKey || !userData?.oneRepMaxEstimates) return null;
    const est = userData.oneRepMaxEstimates[selectedExerciseKey];
    if (!est?.current) return null;
    const fourWeeksAgo = new Date(); fourWeeksAgo.setDate(fourWeeksAgo.getDate() - 28);
    const hist = oneRepMaxHistories.find((h) => h.exerciseKey === selectedExerciseKey);
    let delta = null;
    if (hist?.records?.length >= 2) {
      const old = hist.records.filter((r) => new Date(r.date) <= fourWeeksAgo);
      if (old.length > 0) delta = est.current - old[old.length - 1].value;
    }
    return { current: est.current, delta, achievedWith: est.achievedWith };
  }, [selectedExerciseKey, userData?.oneRepMaxEstimates, oneRepMaxHistories]);

  const volumeByWeekGrouped = useMemo(() => {
    const wv = userData?.weeklyMuscleVolume || {};
    const now = new Date();
    const weeks = [];
    for (let i = rangeWeeks - 1; i >= 0; i--) {
      const d = new Date(now); d.setDate(d.getDate() - i * 7);
      weeks.push(getMondayWeek(d));
    }
    return weeks.map((wk) => {
      const v = wv[wk] || {};
      const label = formatWeekDisplay(wk).replace('Semana del ', '');
      return {
        week: wk, weekDisplay: label,
        empuje: (v.pecs || 0) + (v.triceps || 0) + (v.front_delts || 0),
        jalon: (v.lats || 0) + (v.rhomboids || 0) + (v.biceps || 0) + (v.rear_delts || 0),
        piernas: (v.quads || 0) + (v.hamstrings || 0) + (v.glutes || 0) + (v.calves || 0),
        core: (v.abs || 0) + (v.obliques || 0) + (v.lower_back || 0) + (v.hip_flexors || 0),
        hombros: (v.side_delts || 0) + (v.traps || 0),
      };
    });
  }, [userData?.weeklyMuscleVolume, rangeWeeks]);

  const rpeBySession = useMemo(() => {
    const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - rangeWeeks * 7);
    return sessionList
      .filter((s) => s.completedAt && new Date(s.completedAt) >= cutoff)
      .map((s) => {
        const vals = [];
        Object.values(s.exercises || {}).forEach((ex) => {
          (ex.sets || []).forEach((set) => {
            const v = parseIntensity(set.intensity);
            if (v != null) vals.push(v);
          });
        });
        if (!vals.length) return null;
        return { date: s.completedAt, avgRpe: vals.reduce((a, b) => a + b, 0) / vals.length, sessionName: s.sessionName || '' };
      })
      .filter(Boolean)
      .sort((a, b) => new Date(a.date) - new Date(b.date));
  }, [sessionList, rangeWeeks]);

  const planAdherenceData = useMemo(() => {
    return sessionList
      .filter((s) => s.planned?.exercises?.length > 0 && s.exercises)
      .slice(0, 10)
      .map((s) => {
        const plannedSets = (s.planned.exercises || []).reduce((t, ex) => t + (ex.sets?.length || 0), 0);
        const performedSets = Object.values(s.exercises || {}).reduce((t, ex) => t + (ex.sets?.length || 0), 0);
        const pct = plannedSets > 0 ? Math.min(150, Math.round((performedSets / plannedSets) * 100)) : null;
        return { date: s.completedAt, sessionName: s.sessionName || 'Sesión', pct, planned: plannedSets, performed: performedSets };
      })
      .filter((d) => d.pct != null);
  }, [sessionList]);

  const nutritionByDay = useMemo(() => aggregateDiaryByDay(diaryEntries), [diaryEntries]);

  const nutritionStats = useMemo(() => averageMacrosLast7AndPrev7(nutritionByDay, toYYYYMMDD(new Date())), [nutritionByDay]);

  const macroPieData = useMemo(() => {
    if (!nutritionStats) return [];
    const { last7 } = nutritionStats;
    const p = Math.round(last7.protein), c = Math.round(last7.carbs), f = Math.round(last7.fat);
    if (p + c + f <= 0) return [];
    return [
      { name: 'Proteína', value: p, grams: p },
      { name: 'Carbohidratos', value: c, grams: c },
      { name: 'Grasa', value: f, grams: f },
    ].filter((d) => d.value > 0);
  }, [nutritionStats]);

  const nutritionAdherence30 = useMemo(() => {
    const target = plan?.daily_calories || 0;
    const today = new Date();
    const result = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date(today); d.setDate(d.getDate() - i);
      const dateStr = toYYYYMMDD(d);
      const dayData = nutritionByDay[dateStr];
      const logged = dayData?.calories || 0;
      const pct = target > 0 ? (logged / target) * 100 : null;
      result.push({ date: dateStr, logged, target, pct });
    }
    return result;
  }, [nutritionByDay, plan]);

  const nutritionAdherenceBadges = useMemo(() => {
    if (!plan?.daily_calories) return null;
    const last7 = nutritionAdherence30.slice(-7).filter((d) => d.logged > 0);
    if (!last7.length) return null;
    const avgCalPct = Math.round(last7.reduce((s, d) => s + (d.pct || 0), 0) / last7.length);
    let proteinPct = null;
    if (plan.daily_protein_g) {
      const pDays = last7.map((d) => nutritionByDay[d.date]?.protein || 0).filter((v) => v > 0);
      if (pDays.length) proteinPct = Math.round(pDays.reduce((s, v) => s + (v / plan.daily_protein_g) * 100, 0) / pDays.length);
    }
    return { calPct: avgCalPct, proteinPct, days: last7.length };
  }, [nutritionAdherence30, plan, nutritionByDay]);

  const proteinByMeal = useMemo(() => {
    const cutoffStr = toYYYYMMDD(new Date(Date.now() - 14 * 86400000));
    const relevant = diaryEntries.filter((e) => e.date && e.date >= cutoffStr && e.meal);
    const mealDayProtein = {};
    const mealTimeMinutes = {};
    relevant.forEach((e) => {
      const meal = e.meal;
      if (!mealDayProtein[meal]) mealDayProtein[meal] = {};
      if (!mealDayProtein[meal][e.date]) mealDayProtein[meal][e.date] = 0;
      mealDayProtein[meal][e.date] += Number(e.protein) || 0;
      let ts = e.createdAt;
      if (ts && typeof ts.toDate === 'function') ts = ts.toDate();
      else if (typeof ts === 'string') ts = new Date(ts);
      if (ts instanceof Date && !isNaN(ts)) {
        if (!mealTimeMinutes[meal]) mealTimeMinutes[meal] = [];
        mealTimeMinutes[meal].push(ts.getHours() * 60 + ts.getMinutes());
      }
    });
    const avgProtein = {};
    const avgTimes = {};
    ['Breakfast', 'Lunch', 'Dinner', 'Snack'].forEach((meal) => {
      const days = Object.values(mealDayProtein[meal] || {});
      avgProtein[meal] = days.length > 0 ? days.reduce((a, b) => a + b, 0) / days.length : 0;
      const times = mealTimeMinutes[meal] || [];
      avgTimes[meal] = times.length > 0 ? times.reduce((a, b) => a + b, 0) / times.length : null;
    });
    return { protein: avgProtein, mealTimes: avgTimes };
  }, [diaryEntries]);

  const trainingVsRest = useMemo(() => {
    const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - 28);
    const cutoffStr = toYYYYMMDD(cutoff);
    const trainingDates = new Set(
      sessionList
        .filter((s) => s.completedAt && new Date(s.completedAt) >= cutoff)
        .map((s) => toYYYYMMDD(new Date(s.completedAt)))
    );
    const trainingDays = [], restDays = [];
    Object.entries(nutritionByDay).forEach(([date, data]) => {
      if (date < cutoffStr) return;
      if (trainingDates.has(date)) trainingDays.push(data);
      else restDays.push(data);
    });
    const avg = (arr, key) => arr.length > 0 ? arr.reduce((s, d) => s + (d[key] || 0), 0) / arr.length : 0;
    return {
      training: { days: trainingDays.length, calories: avg(trainingDays, 'calories'), protein: avg(trainingDays, 'protein'), carbs: avg(trainingDays, 'carbs'), fat: avg(trainingDays, 'fat') },
      rest: { days: restDays.length, calories: avg(restDays, 'calories'), protein: avg(restDays, 'protein'), carbs: avg(restDays, 'carbs'), fat: avg(restDays, 'fat') },
    };
  }, [sessionList, nutritionByDay]);

  const energyByWeek = useMemo(() => {
    const wv = userData?.weeklyMuscleVolume || {};
    const now = new Date();
    const weeks = [];
    for (let i = rangeWeeks - 1; i >= 0; i--) {
      const d = new Date(now); d.setDate(d.getDate() - i * 7);
      weeks.push(getMondayWeek(d));
    }
    return weeks.map((wk) => {
      const vol = wv[wk] || {};
      const effectiveSets = Object.values(vol).reduce((s, n) => s + (Number(n) || 0), 0);
      const { start, end } = getWeekDates(wk);
      let totalCalories = 0, hasNutritionData = false;
      const cur = new Date(start);
      while (cur <= end) {
        const ds = toYYYYMMDD(cur);
        const dd = nutritionByDay[ds];
        if (dd?.calories > 0) { totalCalories += dd.calories; hasNutritionData = true; }
        cur.setDate(cur.getDate() + 1);
      }
      return { week: wk, weekDisplay: formatWeekDisplay(wk).replace('Semana del ', ''), totalCalories, effectiveSets, hasNutritionData };
    });
  }, [userData?.weeklyMuscleVolume, nutritionByDay, rangeWeeks]);

  const consistencyWeeks = useMemo(() => {
    const sessionDateMap = {};
    sessionList.forEach((s) => {
      if (!s.completedAt) return;
      const d = toYYYYMMDD(new Date(s.completedAt));
      sessionDateMap[d] = (sessionDateMap[d] || 0) + 1;
    });
    const weeks = [];
    const now = new Date();
    const startDate = new Date(now); startDate.setDate(startDate.getDate() - 83);
    const dow = startDate.getDay();
    startDate.setDate(startDate.getDate() + (dow === 0 ? 1 : dow === 1 ? 0 : 8 - dow));
    let cur = new Date(startDate);
    while (weeks.length < 12) {
      const wk = getMondayWeek(cur);
      const days = [];
      for (let d = 0; d < 7; d++) {
        const dd = new Date(cur); dd.setDate(cur.getDate() + d);
        const ds = toYYYYMMDD(dd);
        days.push({ date: ds, count: sessionDateMap[ds] || 0 });
      }
      weeks.push({ weekKey: wk, days });
      cur.setDate(cur.getDate() + 7);
    }
    return weeks;
  }, [sessionList]);

  // ─── insights ──────────────────────────────────────────────────────────────

  const volumeInsight = useMemo(() => {
    if (volumeByWeekGrouped.length < 2) return null;
    const last = volumeByWeekGrouped[volumeByWeekGrouped.length - 1];
    const prev = volumeByWeekGrouped[volumeByWeekGrouped.length - 2];
    const labels = { empuje: 'Empuje', jalon: 'Jalón', piernas: 'Piernas', core: 'Core', hombros: 'Hombros' };
    const changes = Object.keys(labels).map((g) => {
      const prevVal = prev[g] || 0;
      if (prevVal === 0) return null;
      return { g, label: labels[g], pct: Math.round(((last[g] - prevVal) / prevVal) * 100) };
    }).filter(Boolean).sort((a, b) => Math.abs(b.pct) - Math.abs(a.pct));
    if (!changes.length || Math.abs(changes[0].pct) < 10) return null;
    const { label, pct } = changes[0];
    return `${label} ${pct > 0 ? '↑' : '↓'}${Math.abs(pct)}% esta semana`;
  }, [volumeByWeekGrouped]);

  const rpeInsight = useMemo(() => {
    if (rpeBySession.length < 3) return null;
    const recent = rpeBySession.slice(-3);
    const avg = recent.reduce((s, d) => s + d.avgRpe, 0) / recent.length;
    if (avg < 7) return `Tus últimas ${recent.length} sesiones tuvieron RPE promedio de ${avg.toFixed(1)} — por debajo del umbral efectivo de 7`;
    return null;
  }, [rpeBySession]);

  const proteinInsight = useMemo(() => {
    const { protein } = proteinByMeal;
    const total = Object.values(protein || {}).reduce((s, v) => s + v, 0);
    if (total <= 0) return null;
    const highest = Object.entries(protein || {}).sort((a, b) => b[1] - a[1])[0];
    if (!highest) return null;
    const pct = Math.round((highest[1] / total) * 100);
    const labels = { Breakfast: 'el desayuno', Lunch: 'el almuerzo', Dinner: 'la cena', Snack: 'los snacks' };
    if (pct > 50) return `El ${pct}% de tu proteína llega en ${labels[highest[0]] || highest[0]}. Distribuirla en más comidas puede mejorar la síntesis muscular.`;
    return null;
  }, [proteinByMeal]);

  const trainingVsRestInsight = useMemo(() => {
    const { training, rest } = trainingVsRest;
    if (training.days < 3 || rest.days < 3) return null;
    if (rest.calories > training.calories && training.calories > 0) {
      const diff = Math.round(rest.calories - training.calories);
      return `Comes ${diff} kcal más en días de descanso. En días de entrenamiento tu cuerpo necesita más energía para rendir y recuperarse.`;
    }
    return null;
  }, [trainingVsRest]);

  const energyInsight = useMemo(() => {
    if (energyByWeek.length < 2) return null;
    const last = energyByWeek[energyByWeek.length - 1];
    const prev = energyByWeek[energyByWeek.length - 2];
    if (!last.hasNutritionData || prev.effectiveSets === 0 || prev.totalCalories === 0) return null;
    const setChg = (last.effectiveSets - prev.effectiveSets) / prev.effectiveSets;
    const calChg = (last.totalCalories - prev.totalCalories) / prev.totalCalories;
    if (setChg > 0.2 && calChg < -0.1) {
      return `Esta semana entrenaste ${Math.round(setChg * 100)}% más pero consumiste ${Math.abs(Math.round(calChg * 100))}% menos calorías. Esto puede frenar la recuperación.`;
    }
    return null;
  }, [energyByWeek]);

  const readinessByDay = useMemo(() => {
    const map = {};
    readinessEntries.forEach((r) => {
      if (r.date) map[r.date] = r;
    });
    return map;
  }, [readinessEntries]);

  const readinessChartData = useMemo(() => {
    const today = new Date();
    const result = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date(today); d.setDate(d.getDate() - i);
      const dateStr = toYYYYMMDD(d);
      const entry = readinessByDay[dateStr];
      result.push({
        date: dateStr,
        energy: entry ? entry.energy : null,
        soreness: entry ? entry.soreness : null,
        sleep: entry ? entry.sleep : null,
        sorenessInverted: entry ? (11 - entry.soreness) : null,
      });
    }
    return result;
  }, [readinessByDay]);

  const readinessWeeklyAvg = useMemo(() => {
    const today = new Date();
    const thisWeekDates = [];
    const lastWeekDates = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(today); d.setDate(d.getDate() - i);
      thisWeekDates.push(toYYYYMMDD(d));
    }
    for (let i = 7; i < 14; i++) {
      const d = new Date(today); d.setDate(d.getDate() - i);
      lastWeekDates.push(toYYYYMMDD(d));
    }
    const avg = (dates, key) => {
      const vals = dates.map((d) => readinessByDay[d]?.[key]).filter((v) => v != null);
      return vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
    };
    return {
      this: {
        energy: avg(thisWeekDates, 'energy'),
        soreness: avg(thisWeekDates, 'soreness'),
        sleep: avg(thisWeekDates, 'sleep'),
        count: thisWeekDates.filter((d) => readinessByDay[d]).length,
      },
      last: {
        energy: avg(lastWeekDates, 'energy'),
        soreness: avg(lastWeekDates, 'soreness'),
        sleep: avg(lastWeekDates, 'sleep'),
      },
    };
  }, [readinessByDay]);

  const readinessOnTrainingDays = useMemo(() => {
    const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - 28);
    const trainingDays = sessionList
      .filter((s) => s.completedAt && new Date(s.completedAt) >= cutoff)
      .map((s) => toYYYYMMDD(new Date(s.completedAt)));
    const entries = trainingDays.map((d) => readinessByDay[d]).filter(Boolean);
    if (!entries.length) return null;
    return {
      count: entries.length,
      energy: entries.reduce((s, e) => s + e.energy, 0) / entries.length,
      soreness: entries.reduce((s, e) => s + e.soreness, 0) / entries.length,
      sleep: entries.reduce((s, e) => s + e.sleep, 0) / entries.length,
    };
  }, [sessionList, readinessByDay]);

  const rpeReadinessCorrelation = useMemo(() => {
    const pairs = [];
    rpeBySession.forEach((rpeEntry) => {
      const dateStr = toYYYYMMDD(new Date(rpeEntry.date));
      const readiness = readinessByDay[dateStr];
      if (readiness) {
        pairs.push({
          date: rpeEntry.date,
          sessionName: rpeEntry.sessionName,
          avgRpe: rpeEntry.avgRpe,
          energy: readiness.energy,
          soreness: readiness.soreness,
          sleep: readiness.sleep,
        });
      }
    });
    return pairs;
  }, [rpeBySession, readinessByDay]);

  const readinessRpeInsight = useMemo(() => {
    if (rpeReadinessCorrelation.length < 4) return null;
    const highEnergy = rpeReadinessCorrelation.filter((p) => p.energy >= 7);
    const lowEnergy = rpeReadinessCorrelation.filter((p) => p.energy <= 4);
    if (highEnergy.length < 2 || lowEnergy.length < 2) return null;
    const avgHigh = highEnergy.reduce((s, p) => s + p.avgRpe, 0) / highEnergy.length;
    const avgLow = lowEnergy.reduce((s, p) => s + p.avgRpe, 0) / lowEnergy.length;
    const diff = avgHigh - avgLow;
    if (diff > 0.5) {
      return `Cuando tu energía es ≥7, tu RPE promedio es ${avgHigh.toFixed(1)} vs ${avgLow.toFixed(1)} cuando es ≤4. Los días de alta energía produces esfuerzo más efectivo.`;
    }
    return null;
  }, [rpeReadinessCorrelation]);

  const recoveryWarning = useMemo(() => {
    const last3 = [];
    const today = new Date();
    for (let i = 0; i < 3; i++) {
      const d = new Date(today); d.setDate(d.getDate() - i);
      const entry = readinessByDay[toYYYYMMDD(d)];
      if (entry) last3.push(entry);
    }
    if (last3.length < 2) return null;
    const avgEnergy = last3.reduce((s, e) => s + e.energy, 0) / last3.length;
    const avgSoreness = last3.reduce((s, e) => s + e.soreness, 0) / last3.length;
    if (avgEnergy <= 4 && avgSoreness >= 7) {
      return `Energía baja (${avgEnergy.toFixed(1)}/10) y dolor muscular alto (${avgSoreness.toFixed(1)}/10) en los últimos días — considera una sesión de recuperación activa o un día de descanso.`;
    }
    if (avgEnergy <= 3) {
      return `Tu energía ha estado muy baja estos días (${avgEnergy.toFixed(1)}/10). Revisa tu calidad de sueño y nutrición.`;
    }
    return null;
  }, [readinessByDay]);

  const currentWeekVolume = useMemo(() =>
    userData?.weeklyMuscleVolume?.[currentWeek] || {},
    [userData?.weeklyMuscleVolume, currentWeek]
  );

  const historicalMuscleMax = useMemo(() => {
    const wv = userData?.weeklyMuscleVolume || {};
    const keys = ['pecs','triceps','front_delts','lats','rhomboids','biceps','rear_delts',
      'quads','hamstrings','glutes','calves','abs','obliques','lower_back','hip_flexors','side_delts','traps'];
    const max = {};
    keys.forEach((k) => { max[k] = 0; });
    Object.values(wv).forEach((wkVol) => {
      keys.forEach((k) => { max[k] = Math.max(max[k], wkVol[k] || 0); });
    });
    return max;
  }, [userData?.weeklyMuscleVolume]);

  const muscleGroupStats = useMemo(() => {
    const prevVol = userData?.weeklyMuscleVolume?.[previousWeek] || {};
    const wv = userData?.weeklyMuscleVolume || {};
    const GROUPS = [
      { key: 'empuje', label: 'Empuje', muscles: ['pecs', 'triceps', 'front_delts'] },
      { key: 'jalon', label: 'Jalón', muscles: ['lats', 'rhomboids', 'biceps', 'rear_delts'] },
      { key: 'piernas', label: 'Piernas', muscles: ['quads', 'hamstrings', 'glutes', 'calves'] },
      { key: 'core', label: 'Core', muscles: ['abs', 'obliques', 'lower_back', 'hip_flexors'] },
      { key: 'hombros', label: 'Hombros', muscles: ['side_delts', 'traps'] },
    ];
    const maxByGroup = {};
    GROUPS.forEach(({ key }) => { maxByGroup[key] = 0; });
    Object.values(wv).forEach((wkVol) => {
      GROUPS.forEach(({ key, muscles }) => {
        const s = muscles.reduce((a, m) => a + (wkVol[m] || 0), 0);
        maxByGroup[key] = Math.max(maxByGroup[key], s);
      });
    });
    return GROUPS.map(({ key, label, muscles }) => ({
      key, label,
      current: muscles.reduce((a, m) => a + (currentWeekVolume[m] || 0), 0),
      previous: muscles.reduce((a, m) => a + (prevVol[m] || 0), 0),
      maxEver: maxByGroup[key],
    }));
  }, [userData?.weeklyMuscleVolume, currentWeekVolume, previousWeek]);

  const weekTotals = useMemo(() => {
    const total = Object.values(currentWeekVolume).reduce((s, v) => s + (v || 0), 0);
    const prevVol = userData?.weeklyMuscleVolume?.[previousWeek] || {};
    const prevTotal = Object.values(prevVol).reduce((s, v) => s + (v || 0), 0);
    const pct = prevTotal > 0 ? Math.round(((total - prevTotal) / prevTotal) * 100) : null;
    return { total, prevTotal, pct };
  }, [currentWeekVolume, userData?.weeklyMuscleVolume, previousWeek]);

  const recentRpeAvg = useMemo(() => {
    const recent = rpeBySession.slice(-3);
    return recent.length ? recent.reduce((s, d) => s + d.avgRpe, 0) / recent.length : null;
  }, [rpeBySession]);

  const weeklyWellnessScore = useMemo(() => {
    return volumeByWeekGrouped.map((wk) => {
      const { start, end } = getWeekDates(wk.week);
      const scores = [];
      const cur = new Date(start);
      while (cur <= end) {
        const ds = toYYYYMMDD(cur);
        const r = readinessByDay[ds];
        if (r) scores.push((r.energy + r.sleep + (11 - r.soreness)) / 3);
        cur.setDate(cur.getDate() + 1);
      }
      return { ...wk, wellness: scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : null };
    });
  }, [volumeByWeekGrouped, readinessByDay]);

  const sleepNextDayEnergyInsight = useMemo(() => {
    const pairs = [];
    readinessEntries.forEach((entry) => {
      const next = new Date(entry.date + 'T12:00:00');
      next.setDate(next.getDate() + 1);
      const nextEntry = readinessByDay[toYYYYMMDD(next)];
      if (nextEntry) pairs.push({ sleep: entry.sleep, nextEnergy: nextEntry.energy });
    });
    if (pairs.length < 5) return null;
    const good = pairs.filter((p) => p.sleep >= 7);
    const poor = pairs.filter((p) => p.sleep <= 5);
    if (good.length < 2 || poor.length < 2) return null;
    const avgGood = good.reduce((s, p) => s + p.nextEnergy, 0) / good.length;
    const avgPoor = poor.reduce((s, p) => s + p.nextEnergy, 0) / poor.length;
    if (avgGood - avgPoor < 1) return null;
    return `Cuando duermes ≥7/10, tu energía al día siguiente es ${avgGood.toFixed(1)}/10 en promedio (vs ${avgPoor.toFixed(1)} cuando duermes ≤5).`;
  }, [readinessEntries, readinessByDay]);

  const nutritionReadinessInsight = useMemo(() => {
    if (!plan?.daily_calories) return null;
    const pairs = [];
    readinessEntries.forEach((entry) => {
      const prev = new Date(entry.date + 'T12:00:00');
      prev.setDate(prev.getDate() - 1);
      const prevNutrition = nutritionByDay[toYYYYMMDD(prev)];
      if (!prevNutrition?.calories) return;
      pairs.push({ metTarget: prevNutrition.calories / plan.daily_calories >= 0.85, energy: entry.energy });
    });
    if (pairs.length < 5) return null;
    const met = pairs.filter((p) => p.metTarget);
    const notMet = pairs.filter((p) => !p.metTarget);
    if (met.length < 2 || notMet.length < 2) return null;
    const avgMet = met.reduce((s, p) => s + p.energy, 0) / met.length;
    const avgNotMet = notMet.reduce((s, p) => s + p.energy, 0) / notMet.length;
    if (avgMet - avgNotMet < 0.8) return null;
    return `Cuando cumples tu objetivo calórico el día anterior, tu energía matutina es ${avgMet.toFixed(1)}/10 vs ${avgNotMet.toFixed(1)} cuando no lo cumples.`;
  }, [readinessEntries, nutritionByDay, plan]);

  const chronicReadinessTrend = useMemo(() => {
    const today = new Date();
    const recent = [], prior = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(today); d.setDate(d.getDate() - i);
      const e = readinessByDay[toYYYYMMDD(d)]; if (e) recent.push(e);
    }
    for (let i = 7; i < 14; i++) {
      const d = new Date(today); d.setDate(d.getDate() - i);
      const e = readinessByDay[toYYYYMMDD(d)]; if (e) prior.push(e);
    }
    if (recent.length < 3 || prior.length < 3) return null;
    const avgE = (arr) => arr.reduce((s, e) => s + e.energy, 0) / arr.length;
    const slope = avgE(recent) - avgE(prior);
    if (slope >= -1.5) return null;
    const last = volumeByWeekGrouped[volumeByWeekGrouped.length - 1];
    const prev = volumeByWeekGrouped[volumeByWeekGrouped.length - 2];
    if (prev) {
      const totalLast = last.empuje + last.jalon + last.piernas + last.core + last.hombros;
      const totalPrev = prev.empuje + prev.jalon + prev.piernas + prev.core + prev.hombros;
      const volIncrease = totalPrev > 0 ? (totalLast - totalPrev) / totalPrev : 0;
      if (volIncrease > 0.15) {
        return `Tu energía bajó ${Math.abs(slope).toFixed(1)} pts en 2 semanas mientras el volumen subió ${Math.round(volIncrease * 100)}% — posible señal de sobreentrenamiento.`;
      }
    }
    return `Tu energía ha bajado progresivamente (${avgE(prior).toFixed(1)} → ${avgE(recent).toFixed(1)}/10). Revisa tu descanso y nutrición.`;
  }, [readinessByDay, volumeByWeekGrouped]);

  // ─── styles ────────────────────────────────────────────────────────────────

  const styles = useMemo(() => createStyles(screenWidth, screenHeight), [screenWidth, screenHeight]);

  // ─── render helpers ────────────────────────────────────────────────────────

  const renderRangeToggle = () => (
    <View style={styles.rangeToggle}>
      {[4, 8].map((w) => (
        <TouchableOpacity
          key={w}
          style={[styles.rangeBtn, rangeWeeks === w && styles.rangeBtnActive]}
          onPress={() => setRangeWeeks(w)}
          activeOpacity={0.7}
        >
          <Text style={[styles.rangeBtnLabel, rangeWeeks === w && styles.rangeBtnLabelActive]}>{w} sem</Text>
        </TouchableOpacity>
      ))}
    </View>
  );

  const renderInsight = (text) => text ? <Text style={styles.insightCaption}>{text}</Text> : null;

  const renderCard = (title, content, extra = null) => (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.cardTitle}>{title}</Text>
        {extra}
      </View>
      {content}
    </View>
  );

  // ─── Fuerza Tab ────────────────────────────────────────────────────────────

  const renderFuerzaTab = () => (
    <>
      {/* Card 1: Progresión de Fuerza */}
      {renderCard(
        'Progresión de fuerza',
        <>
          {topExercises.length === 0 ? (
            <Text style={styles.emptyText}>Completa sesiones con peso y repeticiones para ver tu progresión de fuerza.</Text>
          ) : (
            <>
              {/* Exercise selector chips */}
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.exerciseChipsScroll} contentContainerStyle={styles.exerciseChipsContent}>
                {topExercises.map((ex) => (
                  <TouchableOpacity
                    key={ex.key}
                    style={[styles.exerciseChip, selectedExerciseKey === ex.key && styles.exerciseChipActive]}
                    onPress={() => setSelectedExerciseKey(ex.key)}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.exerciseChipLabel, selectedExerciseKey === ex.key && styles.exerciseChipLabelActive]} numberOfLines={1}>
                      {ex.name}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
              {/* Current 1RM */}
              {current1RM && (
                <View style={styles.strengthHeader}>
                  <View style={styles.tendenciesMain}>
                    <Text style={styles.tendenciesNumber}>{Math.round(current1RM.current)}</Text>
                    <Text style={styles.tendenciesUnit}>kg 1RM est.</Text>
                  </View>
                  {current1RM.delta != null && (
                    <Text style={[styles.deltaBadge, current1RM.delta >= 0 ? styles.deltaUp : styles.deltaDown]}>
                      {current1RM.delta >= 0 ? '+' : ''}{current1RM.delta.toFixed(1)} kg en 4 semanas
                    </Text>
                  )}
                </View>
              )}
              {/* Chart */}
              {strengthChartData.length >= 2 ? (
                <LabStrengthChart data={strengthChartData} />
              ) : (
                <Text style={styles.emptyText}>Necesitas más sesiones para ver la tendencia.</Text>
              )}
              {/* Best set context */}
              {current1RM?.achievedWith?.weight && (
                <Text style={styles.contextLine}>
                  Mejor serie: {current1RM.achievedWith.weight} kg × {current1RM.achievedWith.reps} reps
                </Text>
              )}
            </>
          )}
        </>
      )}

      {/* Card 2: Carga muscular */}
      {renderCard(
        'Carga muscular',
        <>
          {volumeByWeekGrouped.every((w) => w.empuje + w.jalon + w.piernas + w.core + w.hombros === 0) ? (
            <Text style={styles.emptyText}>Completa sesiones para ver el análisis de carga muscular.</Text>
          ) : (
            <>
              {/* ── Resumen semanal ── */}
              <View style={styles.muscleCardSummary}>
                <View>
                  <Text style={styles.muscleCardTotal}>{weekTotals.total}</Text>
                  <Text style={styles.muscleCardTotalLabel}>series esta semana</Text>
                </View>
                {weekTotals.pct != null && (
                  <View style={[styles.muscleCardBadge, weekTotals.pct >= 0 ? styles.muscleCardBadgeUp : styles.muscleCardBadgeDown]}>
                    <Text style={[styles.muscleCardBadgeText, weekTotals.pct >= 0 ? styles.deltaUp : styles.deltaDown]}>
                      {weekTotals.pct > 0 ? '+' : ''}{weekTotals.pct}% vs sem. ant.
                    </Text>
                  </View>
                )}
              </View>

              {/* ── Desglose por grupo ── */}
              <View style={styles.muscleGroupList}>
                {muscleGroupStats.map(({ key, label, current, previous, maxEver }) => {
                  const trendPct = previous > 0 ? Math.round(((current - previous) / previous) * 100) : null;
                  const barFrac = maxEver > 0 ? current / maxEver : 0;
                  const trendColor = trendPct == null
                    ? 'rgba(255,255,255,0.3)'
                    : trendPct > 10 ? '#4ade80'
                    : trendPct < -10 ? '#f87171'
                    : 'rgba(255,255,255,0.5)';
                  const barColor = current === 0
                    ? 'rgba(255,255,255,0.06)'
                    : current <= 6 ? 'rgba(255,255,255,0.35)'
                    : current <= 15 ? 'rgba(191,168,77,0.7)'
                    : 'rgba(139,0,0,0.7)';
                  const trendLabel = trendPct == null ? '' : trendPct > 10 ? `↑${trendPct}%` : trendPct < -10 ? `↓${Math.abs(trendPct)}%` : '→';
                  return (
                    <View key={key} style={styles.muscleGroupRow}>
                      <Text style={styles.muscleGroupLabel}>{label}</Text>
                      <View style={styles.muscleGroupBar}>
                        <View style={[styles.muscleGroupBarFill, { width: `${Math.min(100, Math.round(barFrac * 100))}%`, backgroundColor: barColor }]} />
                      </View>
                      <Text style={styles.muscleGroupSets}>{current > 0 ? `${current}s` : '—'}</Text>
                      <Text style={[styles.muscleGroupTrend, { color: trendColor }]}>{trendLabel}</Text>
                    </View>
                  );
                })}
              </View>

              <View style={styles.muscleCardDivider} />

              {/* ── Mapa muscular ── */}
              <LabMuscleHeatmap
                weekVolume={currentWeekVolume}
                previousWeekVolume={userData?.weeklyMuscleVolume?.[previousWeek] || {}}
              />

              <View style={styles.muscleCardDivider} />

              {/* ── Historial ── */}
              <View style={styles.muscleHistoryHeader}>
                <Text style={styles.chartSubtitle}>Historial de volumen</Text>
                {renderRangeToggle()}
              </View>
              <LabVolumeBarChart data={weeklyWellnessScore} rangeWeeks={rangeWeeks} />
              {renderInsight(volumeInsight)}

              {/* ── Contexto cruzado ── */}
              {(readinessOnTrainingDays || recentRpeAvg != null || recoveryWarning) && (
                <>
                  <View style={styles.muscleCardDivider} />
                  {readinessOnTrainingDays && (
                    <View style={styles.muscleContextRow}>
                      <Text style={styles.muscleContextLabel}>
                        Preparación en entrenos ({readinessOnTrainingDays.count}d)
                      </Text>
                      <View style={styles.muscleContextValues}>
                        <Text style={styles.muscleContextVal}>E {readinessOnTrainingDays.energy.toFixed(1)}</Text>
                        <Text style={styles.muscleContextVal}>S {readinessOnTrainingDays.sleep.toFixed(1)}</Text>
                        <Text style={styles.muscleContextVal}>D {readinessOnTrainingDays.soreness.toFixed(1)}</Text>
                      </View>
                    </View>
                  )}
                  {recentRpeAvg != null && (
                    <View style={[styles.muscleContextRow, { marginTop: 8 }]}>
                      <Text style={styles.muscleContextLabel}>RPE promedio (últimas 3 sesiones)</Text>
                      <Text style={[styles.muscleContextVal, { color: recentRpeAvg >= 7 ? '#BFA84D' : 'rgba(255,255,255,0.65)' }]}>
                        {recentRpeAvg.toFixed(1)}
                      </Text>
                    </View>
                  )}
                  {recoveryWarning && (
                    <Text style={[styles.insightCaption, { color: '#f87171', fontStyle: 'normal', marginTop: 8 }]}>
                      ⚠ {recoveryWarning}
                    </Text>
                  )}
                </>
              )}
            </>
          )}
        </>
      )}

      {/* Card 3: Intensidad promedio */}
      {renderCard(
        'Intensidad promedio (RPE)',
        <>
          {rpeBySession.length === 0 ? (
            <Text style={styles.emptyText}>Registra intensidad en tus series para ver la tendencia de esfuerzo.</Text>
          ) : (
            <>
              <LabRpeChart data={rpeBySession} />
              {readinessOnTrainingDays && (
                <View style={styles.readinessTrainingRow}>
                  <Text style={styles.readinessTrainingLabel}>
                    Preparación en días de entreno ({readinessOnTrainingDays.count}d):
                  </Text>
                  <View style={styles.readinessTrainingValues}>
                    <Text style={styles.readinessTrainingVal}>
                      E: {readinessOnTrainingDays.energy.toFixed(1)}
                    </Text>
                    <Text style={styles.readinessTrainingVal}>
                      D: {readinessOnTrainingDays.soreness.toFixed(1)}
                    </Text>
                    <Text style={styles.readinessTrainingVal}>
                      S: {readinessOnTrainingDays.sleep.toFixed(1)}
                    </Text>
                  </View>
                </View>
              )}
              {renderInsight(readinessRpeInsight)}
              {renderInsight(rpeInsight)}
              {rpeReadinessCorrelation.length >= 4 && (
                <>
                  <Text style={[styles.chartSubtitle, { marginTop: 16, marginBottom: 6 }]}>Energía vs RPE por sesión</Text>
                  <LabReadinessRpeScatter data={rpeReadinessCorrelation} />
                </>
              )}
            </>
          )}
        </>
      )}

      {/* Card 4: Adherencia al plan */}
      {planAdherenceData.length === 0 ? null : renderCard(
        'Adherencia al plan',
        <>
          {(() => {
            const avg = Math.round(planAdherenceData.reduce((s, d) => s + d.pct, 0) / planAdherenceData.length);
            return (
              <>
                <View style={styles.adherenceAvgRow}>
                  <Text style={[styles.adherenceAvgPct, { color: getAdherenceColor(avg) }]}>{avg}%</Text>
                  <Text style={styles.adherenceAvgLabel}> del volumen planificado completado (últimas {planAdherenceData.length} sesiones)</Text>
                </View>
                {planAdherenceData.map((d, i) => (
                  <View key={i} style={styles.adherenceRow}>
                    <View style={styles.adherenceInfo}>
                      <Text style={styles.adherenceSessionName} numberOfLines={1}>{d.sessionName}</Text>
                      <Text style={styles.adherenceDate}>{formatDaysAgo(d.date)}</Text>
                    </View>
                    <View style={styles.adherenceBarWrap}>
                      <View style={[styles.adherenceBarFill, { width: `${Math.min(100, d.pct)}%`, backgroundColor: getAdherenceColor(d.pct) }]} />
                    </View>
                    <Text style={[styles.adherencePct, { color: getAdherenceColor(d.pct) }]}>{d.pct}%</Text>
                  </View>
                ))}
              </>
            );
          })()}
        </>
      )}
    </>
  );

  // ─── Nutrición Tab ─────────────────────────────────────────────────────────

  const renderNutricionTab = () => (
    <>
      {/* Card 1: Adherencia calórica */}
      {renderCard(
        'Adherencia calórica (30 días)',
        <>
          {nutritionAdherenceBadges && (
            <View style={styles.badgesRow}>
              <View style={[styles.badge, { borderColor: getAdherenceColor(nutritionAdherenceBadges.calPct) }]}>
                <Text style={[styles.badgeValue, { color: getAdherenceColor(nutritionAdherenceBadges.calPct) }]}>{nutritionAdherenceBadges.calPct}%</Text>
                <Text style={styles.badgeLabel}>calorías · última semana</Text>
              </View>
              {nutritionAdherenceBadges.proteinPct != null && (
                <View style={[styles.badge, { borderColor: getAdherenceColor(nutritionAdherenceBadges.proteinPct) }]}>
                  <Text style={[styles.badgeValue, { color: getAdherenceColor(nutritionAdherenceBadges.proteinPct) }]}>{nutritionAdherenceBadges.proteinPct}%</Text>
                  <Text style={styles.badgeLabel}>proteína · última semana</Text>
                </View>
              )}
            </View>
          )}
          {nutritionAdherence30.some((d) => d.logged > 0) ? (
            <LabNutritionAdherenceChart data={nutritionAdherence30} target={plan?.daily_calories || 0} />
          ) : (
            <Text style={styles.emptyText}>Registra comidas para ver tu adherencia calórica.</Text>
          )}
          {!plan && nutritionAdherence30.some((d) => d.logged > 0) && (
            <Text style={styles.contextLine}>Asigna un plan nutricional para ver tu adherencia al objetivo.</Text>
          )}
        </>
      )}

      {/* Card 2: Distribución de macros */}
      {renderCard(
        'Distribución de macros',
        <>
          {!nutritionStats ? (
            <Text style={styles.emptyText}>Registra comidas en los últimos 14 días para ver tus macros.</Text>
          ) : (
            <View style={styles.macroCardBlock}>
              <View style={styles.macroCardKcalRow}>
                <View style={styles.tendenciesMain}>
                  <Text style={styles.tendenciesNumber}>{Math.round(nutritionStats.last7.calories)}</Text>
                  <Text style={styles.tendenciesUnit}>kcal prom. última semana</Text>
                </View>
                {nutritionStats.prev7.calories > 0 && (
                  <Text style={[styles.deltaBadge, nutritionStats.pctCalories >= 0 ? styles.deltaUp : styles.deltaDown]}>
                    {nutritionStats.pctCalories > 0 ? '+' : ''}{nutritionStats.pctCalories}% vs sem. ant.
                  </Text>
                )}
              </View>
              {plan && (
                <Text style={styles.macroCardGoalLine}>
                  Objetivo: {plan.daily_calories ? `${Math.round(plan.daily_calories)} kcal` : ''}
                  {plan.daily_protein_g ? ` · ${Math.round(plan.daily_protein_g)}g P` : ''}
                  {plan.daily_carbs_g ? ` · ${Math.round(plan.daily_carbs_g)}g C` : ''}
                  {plan.daily_fat_g ? ` · ${Math.round(plan.daily_fat_g)}g G` : ''}
                </Text>
              )}
              <View style={styles.macroCardContentRow}>
                {macroPieData.length > 0 && (
                  <View style={styles.pieWrap}>
                    <LabNutritionPie data={macroPieData} screenWidth={screenWidth} />
                  </View>
                )}
                <View style={styles.macroListCol}>
                  {[
                    { label: 'Proteína', val: Math.round(nutritionStats.last7.protein), pct: nutritionStats.pctProtein },
                    { label: 'Carbos', val: Math.round(nutritionStats.last7.carbs), pct: nutritionStats.pctCarbs },
                    { label: 'Grasa', val: Math.round(nutritionStats.last7.fat), pct: nutritionStats.pctFat },
                  ].map(({ label, val, pct }) => (
                    <View key={label} style={styles.macroListRow}>
                      <Text style={styles.macroListLabel}>{label}</Text>
                      <Text style={styles.macroListVal}>{val}g</Text>
                      {nutritionStats.prev7.protein > 0 && (
                        <Text style={[styles.macroPct, pct >= 0 ? styles.deltaUp : styles.deltaDown]}>
                          {pct > 0 ? '+' : ''}{pct}%
                        </Text>
                      )}
                    </View>
                  ))}
                </View>
              </View>
            </View>
          )}
        </>
      )}

      {/* Card 3: Proteína por comida */}
      {renderCard(
        'Proteína por comida',
        <>
          {Object.values(proteinByMeal.protein || {}).every((v) => v === 0) ? (
            <Text style={styles.emptyText}>Clasifica tus comidas (Desayuno/Almuerzo/Cena/Snack) al registrarlas para ver la distribución.</Text>
          ) : (
            <>
              <LabProteinMealBars
                data={proteinByMeal.protein}
                totalProtein={Object.values(proteinByMeal.protein || {}).reduce((s, v) => s + v, 0)}
                mealTimes={proteinByMeal.mealTimes}
              />
              {renderInsight(proteinInsight)}
            </>
          )}
        </>
      )}

      {/* Card 4: Entrenamiento vs descanso */}
      {renderCard(
        'Entrenamiento vs descanso',
        <>
          {trainingVsRest.training.days < 3 || trainingVsRest.rest.days < 3 ? (
            <Text style={styles.emptyText}>Necesitas más datos combinados de entrenamiento y nutrición para este análisis.</Text>
          ) : (
            <>
              <View style={styles.twoColumns}>
                {[
                  { label: `Entreno (${trainingVsRest.training.days}d)`, data: trainingVsRest.training },
                  { label: `Descanso (${trainingVsRest.rest.days}d)`, data: trainingVsRest.rest },
                ].map(({ label, data }) => (
                  <View key={label} style={styles.columnCard}>
                    <Text style={styles.columnCardTitle}>{label}</Text>
                    <Text style={styles.columnCardKcal}>{Math.round(data.calories)} kcal</Text>
                    <Text style={styles.columnCardMacro}>{Math.round(data.protein)}g P · {Math.round(data.carbs)}g C · {Math.round(data.fat)}g G</Text>
                  </View>
                ))}
              </View>
              {trainingVsRest.training.calories > 0 && trainingVsRest.rest.calories > 0 && (
                <View style={styles.trainingVsRestDelta}>
                  {(() => {
                    const diff = Math.round(trainingVsRest.training.calories - trainingVsRest.rest.calories);
                    const isPositive = diff >= 0;
                    return (
                      <Text style={[styles.deltaLine, isPositive ? styles.deltaUp : styles.deltaDown]}>
                        {isPositive ? '+' : ''}{diff} kcal en días de entrenamiento
                      </Text>
                    );
                  })()}
                </View>
              )}
              {renderInsight(trainingVsRestInsight)}
            </>
          )}
        </>
      )}
    </>
  );

  // ─── Hábitos Tab ───────────────────────────────────────────────────────────

  const renderHabitosTab = () => (
    <>
      {/* Patrones detectados */}
      {[sleepNextDayEnergyInsight, nutritionReadinessInsight, chronicReadinessTrend, readinessRpeInsight].some(Boolean) && renderCard(
        'Patrones detectados',
        <>
          {renderInsight(chronicReadinessTrend)}
          {renderInsight(readinessRpeInsight)}
          {renderInsight(sleepNextDayEnergyInsight)}
          {renderInsight(nutritionReadinessInsight)}
        </>
      )}

      {/* Card 1: Consistencia */}
      {renderCard(
        'Consistencia de entrenamiento',
        <>
          {sessionList.length === 0 ? (
            <Text style={styles.emptyText}>Completa sesiones para ver tu heatmap de consistencia.</Text>
          ) : (
            <>
              <LabConsistencyGrid weeks={consistencyWeeks} readinessByDay={readinessByDay} />
              <View style={styles.consistencyReadinessLegend}>
                {[
                  { color: 'rgba(74,222,128,0.8)', label: 'Entreno con alta energía' },
                  { color: 'rgba(248,113,113,0.7)', label: 'Entreno con baja energía' },
                ].map(({ color, label }) => (
                  <View key={label} style={styles.legendItem}>
                    <View style={[styles.legendDot, { backgroundColor: color }]} />
                    <Text style={styles.legendLabel}>{label}</Text>
                  </View>
                ))}
              </View>
            </>
          )}
        </>
      )}

      {/* Card 2: Energía disponible */}
      {renderCard(
        'Energía disponible',
        <>
          <Text style={styles.chartSubtitle}>Calorías semanales vs carga de entrenamiento</Text>
          {energyByWeek.every((w) => w.effectiveSets === 0 && w.totalCalories === 0) ? (
            <Text style={styles.emptyText}>Necesitas datos de entrenamiento y nutrición para este análisis.</Text>
          ) : (
            <>
              <LabEnergyAvailabilityChart data={energyByWeek} />
              {renderInsight(energyInsight)}
            </>
          )}
        </>,
        renderRangeToggle()
      )}

      {/* Card 3: Racha */}
      {renderCard(
        'Racha y hábitos',
        <>
          {!userData?.activityStreak ? (
            <Text style={styles.emptyText}>Comienza a entrenar para construir tu racha.</Text>
          ) : (
            <>
              <View style={styles.streakRow}>
                <View>
                  <View style={styles.tendenciesMain}>
                    <Text style={[styles.tendenciesNumber, { fontSize: Math.min(screenWidth * 0.12, 48) }]}>
                      {userData.activityStreak.streakNumber || 0}
                    </Text>
                    <Text style={styles.tendenciesUnit}>días</Text>
                  </View>
                  <Text style={styles.streakSub}>racha actual</Text>
                </View>
                {userData.activityStreak.longestStreak > 0 && (
                  <View style={styles.streakBest}>
                    <Text style={styles.streakBestNum}>{userData.activityStreak.longestStreak}</Text>
                    <Text style={styles.streakBestLabel}>mejor racha</Text>
                  </View>
                )}
              </View>
              {/* Last 7 days activity pills */}
              {(() => {
                const sessionDateMap = {};
                sessionList.forEach((s) => {
                  if (s.completedAt) {
                    const d = toYYYYMMDD(new Date(s.completedAt));
                    sessionDateMap[d] = true;
                  }
                });
                const diaryDateMap = {};
                diaryEntries.forEach((e) => { if (e.date) diaryDateMap[e.date] = true; });
                const days = [];
                const dayLabels = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
                for (let i = 6; i >= 0; i--) {
                  const d = new Date(); d.setDate(d.getDate() - i);
                  const ds = toYYYYMMDD(d);
                  const dow = (d.getDay() + 6) % 7;
                  days.push({ ds, label: dayLabels[dow], active: sessionDateMap[ds] || diaryDateMap[ds] });
                }
                return (
                  <View style={styles.activityPills}>
                    {days.map(({ ds, label, active }) => (
                      <View key={ds} style={styles.activityPillWrap}>
                        <View style={[styles.activityPill, active && styles.activityPillActive]} />
                        <Text style={styles.activityPillLabel}>{label}</Text>
                      </View>
                    ))}
                  </View>
                );
              })()}
            </>
          )}
        </>
      )}

      {/* Preparación diaria */}
      {readinessEntries.length > 0 && renderCard(
        'Preparación diaria',
        <>
          {readinessWeeklyAvg.this.count > 0 && (
            <View style={styles.readinessWeekRow}>
              {[
                { label: 'Energía', key: 'energy', invert: false },
                { label: 'Frescura', key: 'soreness', invert: true },
                { label: 'Sueño', key: 'sleep', invert: false },
              ].map(({ label, key, invert }) => {
                const val = readinessWeeklyAvg.this[key];
                const prevVal = readinessWeeklyAvg.last[key];
                const displayVal = invert && val != null ? (11 - val) : val;
                const displayPrev = invert && prevVal != null ? (11 - prevVal) : prevVal;
                const delta = displayVal != null && displayPrev != null
                  ? ((displayVal - displayPrev) / displayPrev * 100) : null;
                return (
                  <View key={key} style={styles.readinessStat}>
                    <Text style={styles.readinessStatVal}>
                      {displayVal != null ? displayVal.toFixed(1) : '—'}
                    </Text>
                    <Text style={styles.readinessStatLabel}>{label}</Text>
                    {delta != null && Math.abs(delta) >= 5 && (
                      <Text style={[styles.readinessStatDelta, delta >= 0 ? styles.deltaUp : styles.deltaDown]}>
                        {delta > 0 ? '+' : ''}{Math.round(delta)}%
                      </Text>
                    )}
                  </View>
                );
              })}
            </View>
          )}
          <LabReadinessChart data={readinessChartData} />
          <View style={styles.readinessLegend}>
            {[
              { color: 'rgba(74,222,128,0.8)', label: 'Energía' },
              { color: 'rgba(147,197,253,0.8)', label: 'Sueño' },
              { color: 'rgba(251,191,36,0.8)', label: 'Frescura' },
            ].map(({ color, label }) => (
              <View key={label} style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: color }]} />
                <Text style={styles.legendLabel}>{label}</Text>
              </View>
            ))}
          </View>
          {recoveryWarning && (
            <Text style={[styles.insightCaption, { color: '#f87171', fontStyle: 'normal' }]}>
              ⚠ {recoveryWarning}
            </Text>
          )}
          {renderInsight(sleepNextDayEnergyInsight)}
          {renderInsight(nutritionReadinessInsight)}
        </>
      )}
    </>
  );

  // ─── main render ───────────────────────────────────────────────────────────

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]} edges={Platform.OS === 'web' ? ['left', 'right'] : ['bottom', 'left', 'right']}>
        <FixedWakeHeader />
        <WakeLoader />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={Platform.OS === 'web' ? ['left', 'right'] : ['bottom', 'left', 'right']}>
      <FixedWakeHeader />
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <WakeHeaderContent>
          <WakeHeaderSpacer />
          <View style={styles.titleSection}>
            <Text style={styles.screenTitle}>Lab</Text>
          </View>

          {/* Tab bar */}
          <View style={styles.tabBar}>
            {[
              { key: 'fuerza', label: 'Fuerza' },
              { key: 'nutricion', label: 'Nutrición' },
              { key: 'habitos', label: 'Hábitos' },
            ].map(({ key, label }) => (
              <TouchableOpacity
                key={key}
                style={[styles.tabPill, activeTab === key && styles.tabPillActive]}
                onPress={() => setActiveTab(key)}
                activeOpacity={0.7}
              >
                <Text style={[styles.tabLabel, activeTab === key && styles.tabLabelActive]}>{label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {activeTab === 'fuerza' && renderFuerzaTab()}
          {activeTab === 'nutricion' && renderNutricionTab()}
          {activeTab === 'habitos' && renderHabitosTab()}

          <BottomSpacer />
          <View style={{ height: Math.max(80, screenHeight * 0.1) }} />
        </WakeHeaderContent>
      </ScrollView>
    </SafeAreaView>
  );
};

// ─── styles ────────────────────────────────────────────────────────────────────

const createStyles = (screenWidth, screenHeight) => StyleSheet.create({
  container: { flex: 1, backgroundColor: '#1a1a1a' },
  scrollView: { flex: 1 },
  scrollContent: { flexGrow: 1, paddingBottom: 80 },
  titleSection: {
    paddingTop: Math.max(16, screenHeight * 0.02),
    marginBottom: Math.max(16, screenHeight * 0.02),
  },
  screenTitle: {
    fontSize: Math.min(screenWidth * 0.08, 32),
    fontWeight: '600',
    color: '#ffffff',
    paddingLeft: screenWidth * 0.12,
  },
  tabBar: {
    flexDirection: 'row',
    paddingHorizontal: CARD_MARGIN,
    gap: 8,
    marginBottom: Math.max(16, screenHeight * 0.02),
  },
  tabPill: {
    flex: 1,
    paddingVertical: 9,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
  },
  tabPillActive: {
    backgroundColor: 'rgba(255, 255, 255, 0.8)',
    borderColor: 'rgba(255, 255, 255, 0.8)',
  },
  tabLabel: {
    fontSize: 13,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.5)',
  },
  tabLabelActive: {
    color: '#1a1a1a',
    fontWeight: '600',
  },
  card: {
    width: screenWidth - 2 * CARD_MARGIN,
    alignSelf: 'center',
    marginBottom: Math.max(14, screenHeight * 0.018),
    backgroundColor: '#2a2a2a',
    borderRadius: Math.max(12, screenWidth * 0.04),
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    padding: Math.max(16, screenWidth * 0.04),
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ffffff',
    flex: 1,
    marginRight: 8,
  },
  emptyText: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.5)',
    lineHeight: 20,
  },
  insightCaption: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.5)',
    fontStyle: 'italic',
    marginTop: 10,
    lineHeight: 17,
  },
  contextLine: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.4)',
    marginTop: 8,
  },
  chartSubtitle: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.4)',
    marginBottom: 10,
    marginTop: -4,
  },
  rangeToggle: {
    flexDirection: 'row',
    gap: 6,
  },
  rangeBtn: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  rangeBtnActive: {
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderColor: 'rgba(255,255,255,0.3)',
  },
  rangeBtnLabel: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.4)',
  },
  rangeBtnLabelActive: {
    color: 'rgba(255,255,255,0.9)',
  },
  tendenciesMain: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 4,
  },
  tendenciesNumber: {
    color: '#ffffff',
    fontSize: Math.min(screenWidth * 0.08, 32),
    fontWeight: '700',
  },
  tendenciesUnit: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: Math.min(screenWidth * 0.035, 14),
  },
  deltaBadge: {
    fontSize: 12,
    fontWeight: '600',
  },
  deltaUp: { color: '#4ade80' },
  deltaDown: { color: '#f87171' },
  // Strength card
  exerciseChipsScroll: { marginBottom: 12, marginHorizontal: -4 },
  exerciseChipsContent: { paddingHorizontal: 4, gap: 6, flexDirection: 'row' },
  exerciseChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    maxWidth: 160,
  },
  exerciseChipActive: {
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderColor: 'rgba(255,255,255,0.4)',
  },
  exerciseChipLabel: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.5)',
  },
  exerciseChipLabelActive: {
    color: '#ffffff',
    fontWeight: '500',
  },
  strengthHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  // Adherence card
  adherenceAvgRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginBottom: 14,
    flexWrap: 'wrap',
  },
  adherenceAvgPct: {
    fontSize: 22,
    fontWeight: '700',
  },
  adherenceAvgLabel: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.5)',
    flex: 1,
    marginLeft: 4,
  },
  adherenceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
    gap: 8,
  },
  adherenceInfo: {
    width: 110,
  },
  adherenceSessionName: {
    fontSize: 12,
    color: '#ffffff',
    fontWeight: '500',
  },
  adherenceDate: {
    fontSize: 10,
    color: 'rgba(255,255,255,0.4)',
    marginTop: 1,
  },
  adherenceBarWrap: {
    flex: 1,
    height: 5,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 3,
    overflow: 'hidden',
  },
  adherenceBarFill: {
    height: 5,
    borderRadius: 3,
  },
  adherencePct: {
    width: 36,
    textAlign: 'right',
    fontSize: 12,
    fontWeight: '600',
  },
  // Nutrition cards
  badgesRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 12,
  },
  badge: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    alignItems: 'center',
    minWidth: 80,
  },
  badgeValue: {
    fontSize: 18,
    fontWeight: '700',
  },
  badgeLabel: {
    fontSize: 10,
    color: 'rgba(255,255,255,0.5)',
    marginTop: 2,
  },
  nutritionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  macroCardBlock: {
    gap: 12,
  },
  macroCardKcalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  macroCardGoalLine: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.5)',
    marginBottom: 4,
  },
  macroCardContentRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'flex-start',
    gap: 20,
  },
  pieWrap: {
    width: 140,
    minWidth: 140,
    alignItems: 'center',
    justifyContent: 'flex-start',
    overflow: 'visible',
  },
  macroListCol: {
    flex: 1,
    justifyContent: 'flex-start',
    gap: 6,
  },
  macroListRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  macroListLabel: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.7)',
    minWidth: 70,
  },
  macroListVal: {
    fontSize: 15,
    fontWeight: '600',
    color: '#ffffff',
  },
  macroRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: 6,
  },
  macroItem: {
    alignItems: 'center',
  },
  macroVal: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ffffff',
  },
  macroLabel: {
    fontSize: 10,
    color: 'rgba(255,255,255,0.5)',
    marginTop: 2,
  },
  macroPct: {
    fontSize: 11,
    fontWeight: '600',
    marginTop: 0,
  },
  planTargetsRow: {
    flexDirection: 'row',
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.06)',
    flexWrap: 'wrap',
  },
  planTargetsLabel: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.4)',
  },
  planTargetsValues: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.6)',
    flex: 1,
  },
  // Training vs rest
  twoColumns: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 12,
  },
  columnCard: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 10,
    padding: 12,
  },
  columnCardTitle: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.5)',
    marginBottom: 6,
  },
  columnCardKcal: {
    fontSize: 18,
    fontWeight: '700',
    color: '#ffffff',
    marginBottom: 4,
  },
  columnCardMacro: {
    fontSize: 10,
    color: 'rgba(255,255,255,0.5)',
  },
  trainingVsRestDelta: {
    alignItems: 'center',
    marginBottom: 4,
  },
  deltaLine: {
    fontSize: 13,
    fontWeight: '600',
  },
  // Streak card
  streakRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginBottom: 16,
  },
  streakSub: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.5)',
    marginTop: 2,
  },
  streakBest: {
    alignItems: 'flex-end',
  },
  streakBestNum: {
    fontSize: 22,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.7)',
  },
  streakBestLabel: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.4)',
  },
  activityPills: {
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
  },
  activityPillWrap: {
    alignItems: 'center',
    gap: 4,
  },
  activityPill: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  activityPillActive: {
    backgroundColor: 'rgba(255,255,255,0.75)',
    borderColor: 'rgba(255,255,255,0.8)',
  },
  activityPillLabel: {
    fontSize: 10,
    color: 'rgba(255,255,255,0.35)',
  },
  // Readiness card
  readinessWeekRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 16,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  readinessStat: {
    alignItems: 'center',
  },
  readinessStatVal: {
    fontSize: 22,
    fontWeight: '700',
    color: '#ffffff',
  },
  readinessStatLabel: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.5)',
    marginTop: 2,
  },
  readinessStatDelta: {
    fontSize: 11,
    fontWeight: '600',
    marginTop: 2,
  },
  readinessLegend: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 16,
    marginTop: 12,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  legendDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
  legendLabel: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.5)',
  },
  readinessTrainingRow: {
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.06)',
  },
  readinessTrainingLabel: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.4)',
    marginBottom: 6,
  },
  readinessTrainingValues: {
    flexDirection: 'row',
    gap: 14,
  },
  readinessTrainingVal: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.65)',
    fontWeight: '500',
  },
  consistencyReadinessLegend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginTop: 10,
  },
  // Muscle card
  muscleCardSummary: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginBottom: 16,
  },
  muscleCardTotal: {
    fontSize: 32,
    fontWeight: '700',
    color: '#ffffff',
    lineHeight: 36,
  },
  muscleCardTotalLabel: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.45)',
    marginTop: 2,
  },
  muscleCardBadge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
  },
  muscleCardBadgeUp: {
    backgroundColor: 'rgba(74,222,128,0.12)',
    borderColor: 'rgba(74,222,128,0.28)',
  },
  muscleCardBadgeDown: {
    backgroundColor: 'rgba(248,113,113,0.08)',
    borderColor: 'rgba(248,113,113,0.25)',
  },
  muscleCardBadgeText: {
    fontSize: 12,
    fontWeight: '600',
  },
  muscleGroupList: {
    gap: 8,
    marginBottom: 4,
  },
  muscleGroupRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  muscleGroupLabel: {
    width: 58,
    fontSize: 12,
    color: 'rgba(255,255,255,0.6)',
    fontWeight: '500',
  },
  muscleGroupBar: {
    flex: 1,
    height: 5,
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderRadius: 3,
    overflow: 'hidden',
  },
  muscleGroupBarFill: {
    height: 5,
    borderRadius: 3,
  },
  muscleGroupSets: {
    width: 26,
    textAlign: 'right',
    fontSize: 12,
    color: 'rgba(255,255,255,0.7)',
    fontWeight: '500',
  },
  muscleGroupTrend: {
    width: 42,
    textAlign: 'right',
    fontSize: 11,
    fontWeight: '600',
  },
  muscleCardDivider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.06)',
    marginVertical: 14,
  },
  muscleHistoryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  muscleContextRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  muscleContextLabel: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.4)',
    flex: 1,
    marginRight: 8,
  },
  muscleContextValues: {
    flexDirection: 'row',
    gap: 10,
  },
  muscleContextVal: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.65)',
    fontWeight: '500',
  },
});

export { LabScreen as LabScreenBase };
export default LabScreen;
