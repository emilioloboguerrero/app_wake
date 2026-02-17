/**
 * PWA Nutrition test screen — assigned plan, diary, manual log.
 * Test all components and data flows; no mock food data.
 */
import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  useWindowDimensions,
} from 'react-native';
import { useAuth } from '../contexts/AuthContext';
import * as nutritionDb from '../services/nutritionFirestoreService';

const MEAL_OPTIONS = ['breakfast', 'lunch', 'dinner', 'snack'];

export function NutritionTestScreenBase({ navigation }) {
  const { user } = useAuth();
  const { width: screenWidth } = useWindowDimensions();
  const userId = user?.uid ?? '';

  const [assignment, setAssignment] = useState(null);
  const [plan, setPlan] = useState(null);
  const [loadingAssignment, setLoadingAssignment] = useState(true);
  const [diaryDate, setDiaryDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [diaryEntries, setDiaryEntries] = useState([]);
  const [loadingDiary, setLoadingDiary] = useState(false);
  const [logMeal, setLogMeal] = useState('breakfast');
  const [logFoodId, setLogFoodId] = useState('');
  const [logServingId, setLogServingId] = useState('');
  const [logUnits, setLogUnits] = useState('1');
  const [logName, setLogName] = useState('');
  const [logCalories, setLogCalories] = useState('');
  const [logProtein, setLogProtein] = useState('');
  const [logCarbs, setLogCarbs] = useState('');
  const [logFat, setLogFat] = useState('');
  const [submittingLog, setSubmittingLog] = useState(false);

  const loadAssignment = useCallback(async () => {
    if (!userId) return;
    setLoadingAssignment(true);
    try {
      const list = await nutritionDb.getAssignmentsByUser(userId);
      const a = list[0] || null;
      setAssignment(a);
      if (a?.planId && a?.assignedBy) {
        const p = await nutritionDb.getPlanById(a.assignedBy, a.planId);
        setPlan(p);
      } else {
        setPlan(null);
      }
    } catch (e) {
      console.error(e);
      setAssignment(null);
      setPlan(null);
    } finally {
      setLoadingAssignment(false);
    }
  }, [userId]);

  useEffect(() => {
    loadAssignment();
  }, [loadAssignment]);

  const loadDiary = useCallback(async () => {
    if (!userId || !diaryDate) return;
    setLoadingDiary(true);
    try {
      const list = await nutritionDb.getDiaryEntries(userId, diaryDate);
      setDiaryEntries(list);
    } catch (e) {
      console.error(e);
      setDiaryEntries([]);
    } finally {
      setLoadingDiary(false);
    }
  }, [userId, diaryDate]);

  useEffect(() => {
    loadDiary();
  }, [loadDiary]);

  async function handleLogFood() {
    if (!userId || !diaryDate) return;
    const foodId = logFoodId.trim() || `manual-${Date.now()}`;
    const servingId = logServingId.trim() || '0';
    setSubmittingLog(true);
    try {
      await nutritionDb.addDiaryEntry(userId, {
        date: diaryDate,
        meal: logMeal,
        food_id: foodId,
        serving_id: servingId,
        number_of_units: Number(logUnits) || 1,
        name: logName.trim() || 'Manual entry',
        calories: logCalories !== '' ? Number(logCalories) : null,
        protein: logProtein !== '' ? Number(logProtein) : null,
        carbs: logCarbs !== '' ? Number(logCarbs) : null,
        fat: logFat !== '' ? Number(logFat) : null,
      });
      setLogFoodId('');
      setLogServingId('');
      setLogUnits('1');
      setLogName('');
      setLogCalories('');
      setLogProtein('');
      setLogCarbs('');
      setLogFat('');
      loadDiary();
    } catch (e) {
      console.error(e);
    } finally {
      setSubmittingLog(false);
    }
  }

  async function handleDeleteEntry(entryId) {
    if (!userId || !entryId) return;
    try {
      await nutritionDb.deleteDiaryEntry(userId, entryId);
      loadDiary();
    } catch (e) {
      console.error(e);
    }
  }

  const dailyTotalCal = diaryEntries.reduce((s, e) => s + (Number(e.calories) || 0), 0);
  const dailyTotalProtein = diaryEntries.reduce((s, e) => s + (Number(e.protein) || 0), 0);
  const dailyTotalCarbs = diaryEntries.reduce((s, e) => s + (Number(e.carbs) || 0), 0);
  const dailyTotalFat = diaryEntries.reduce((s, e) => s + (Number(e.fat) || 0), 0);

  const styles = StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: '#1a1a1a',
      paddingBottom: 100,
    },
    scroll: {
      flex: 1,
    },
    section: {
      padding: 16,
      marginBottom: 8,
      backgroundColor: 'rgba(255,255,255,0.04)',
      borderRadius: 12,
      marginHorizontal: 16,
      marginTop: 8,
    },
    title: {
      fontSize: 18,
      fontWeight: '600',
      color: '#fff',
      marginBottom: 8,
    },
    subtitle: {
      fontSize: 14,
      color: 'rgba(255,255,255,0.6)',
      marginBottom: 4,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 8,
      gap: 8,
    },
    input: {
      flex: 1,
      minWidth: 120,
      padding: 12,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.2)',
      backgroundColor: 'rgba(255,255,255,0.06)',
      color: '#fff',
      fontSize: 14,
    },
    label: {
      fontSize: 14,
      color: 'rgba(255,255,255,0.8)',
      width: 80,
    },
    button: {
      padding: 12,
      borderRadius: 8,
      backgroundColor: '#3b82f6',
      alignItems: 'center',
      marginTop: 8,
    },
    buttonDisabled: {
      opacity: 0.6,
    },
    buttonText: {
      color: '#fff',
      fontSize: 14,
      fontWeight: '600',
    },
    entry: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: 8,
      borderBottomWidth: 1,
      borderBottomColor: 'rgba(255,255,255,0.06)',
    },
    entryText: {
      fontSize: 14,
      color: '#fff',
      flex: 1,
    },
    deleteBtn: {
      padding: 6,
      marginLeft: 8,
    },
    deleteBtnText: {
      color: '#f87171',
      fontSize: 12,
    },
    totals: {
      marginTop: 12,
      paddingTop: 12,
      borderTopWidth: 1,
      borderTopColor: 'rgba(255,255,255,0.1)',
    },
    totalsText: {
      fontSize: 14,
      color: 'rgba(255,255,255,0.9)',
    },
    mealPill: {
      paddingVertical: 8,
      paddingHorizontal: 12,
      borderRadius: 8,
      backgroundColor: 'rgba(255,255,255,0.08)',
    },
    mealPillActive: {
      backgroundColor: '#3b82f6',
    },
    mealPillText: {
      fontSize: 13,
      color: 'rgba(255,255,255,0.8)',
    },
    mealPillTextActive: {
      color: '#fff',
      fontWeight: '600',
    },
    loading: {
      padding: 24,
      alignItems: 'center',
    },
    empty: {
      fontSize: 14,
      color: 'rgba(255,255,255,0.5)',
      marginTop: 8,
    },
  });

  if (loadingAssignment) {
    return (
      <View style={[styles.container, styles.loading]}>
        <ActivityIndicator size="large" color="#fff" />
        <Text style={styles.empty}>Loading nutrition…</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView style={styles.scroll} contentContainerStyle={{ paddingBottom: 24 }}>
        <View style={styles.section}>
          <Text style={styles.title}>Nutrition (test)</Text>
          <Text style={styles.subtitle}>Assigned plan, diary, manual log. No mock data.</Text>
        </View>

        {assignment ? (
          <View style={styles.section}>
            <Text style={styles.title}>Your plan</Text>
            <Text style={styles.subtitle}>{plan?.name || assignment.planId}</Text>
            {plan && (
              <Text style={styles.subtitle}>
                Daily: {plan.daily_calories ?? '—'} kcal, P: {plan.daily_protein_g ?? '—'}g, C: {plan.daily_carbs_g ?? '—'}g, F: {plan.daily_fat_g ?? '—'}g
              </Text>
            )}
          </View>
        ) : (
          <View style={styles.section}>
            <Text style={styles.subtitle}>No nutrition plan assigned. Assign from creator dashboard.</Text>
          </View>
        )}

        <View style={styles.section}>
          <Text style={styles.title}>Diary</Text>
          <View style={styles.row}>
            <Text style={styles.label}>Date</Text>
            <TextInput
              style={styles.input}
              value={diaryDate}
              onChangeText={setDiaryDate}
              placeholder="YYYY-MM-DD"
              placeholderTextColor="rgba(255,255,255,0.4)"
            />
          </View>
          {loadingDiary ? (
            <ActivityIndicator color="#fff" style={{ marginTop: 8 }} />
          ) : diaryEntries.length === 0 ? (
            <Text style={styles.empty}>No entries for this date.</Text>
          ) : (
            <>
              {diaryEntries.map((e) => (
                <View key={e.id} style={styles.entry}>
                  <Text style={styles.entryText}>{e.meal}: {e.name} — {e.number_of_units} — {e.calories ?? '?'} kcal</Text>
                  <TouchableOpacity style={styles.deleteBtn} onPress={() => handleDeleteEntry(e.id)}>
                    <Text style={styles.deleteBtnText}>Delete</Text>
                  </TouchableOpacity>
                </View>
              ))}
              <View style={styles.totals}>
                <Text style={styles.totalsText}>Total: {dailyTotalCal} kcal, P: {dailyTotalProtein}g, C: {dailyTotalCarbs}g, F: {dailyTotalFat}g</Text>
              </View>
            </>
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.title}>Log food (manual)</Text>
          <View style={styles.row}>
            <Text style={styles.label}>Meal</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', flex: 1, gap: 8 }}>
              {MEAL_OPTIONS.map((m) => (
                <TouchableOpacity
                  key={m}
                  onPress={() => setLogMeal(m)}
                  style={[styles.mealPill, logMeal === m && styles.mealPillActive]}
                >
                  <Text style={[styles.mealPillText, logMeal === m && styles.mealPillTextActive]}>{m}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
          <TextInput style={styles.input} value={logFoodId} onChangeText={setLogFoodId} placeholder="food_id (optional)" placeholderTextColor="rgba(255,255,255,0.4)" />
          <TextInput style={styles.input} value={logServingId} onChangeText={setLogServingId} placeholder="serving_id (optional)" placeholderTextColor="rgba(255,255,255,0.4)" />
          <TextInput style={styles.input} value={logUnits} onChangeText={setLogUnits} placeholder="Units" placeholderTextColor="rgba(255,255,255,0.4)" keyboardType="decimal-pad" />
          <TextInput style={styles.input} value={logName} onChangeText={setLogName} placeholder="Display name" placeholderTextColor="rgba(255,255,255,0.4)" />
          <TextInput style={styles.input} value={logCalories} onChangeText={setLogCalories} placeholder="Calories (optional)" placeholderTextColor="rgba(255,255,255,0.4)" keyboardType="number-pad" />
          <TextInput style={styles.input} value={logProtein} onChangeText={setLogProtein} placeholder="Protein g (optional)" placeholderTextColor="rgba(255,255,255,0.4)" keyboardType="number-pad" />
          <TextInput style={styles.input} value={logCarbs} onChangeText={setLogCarbs} placeholder="Carbs g (optional)" placeholderTextColor="rgba(255,255,255,0.4)" keyboardType="number-pad" />
          <TextInput style={styles.input} value={logFat} onChangeText={setLogFat} placeholder="Fat g (optional)" placeholderTextColor="rgba(255,255,255,0.4)" keyboardType="number-pad" />
          <TouchableOpacity
            style={[styles.button, submittingLog && styles.buttonDisabled]}
            onPress={handleLogFood}
            disabled={submittingLog}
          >
            <Text style={styles.buttonText}>{submittingLog ? 'Logging…' : 'Log food'}</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}

export default NutritionTestScreenBase;
