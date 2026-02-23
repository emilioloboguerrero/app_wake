/**
 * PWA Nutrition Screen — User view: assigned plan, diary, log food (search + manual).
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
  Modal,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useAuth } from '../contexts/AuthContext';
import * as nutritionDb from '../services/nutritionFirestoreService';
import * as nutritionApi from '../services/nutritionApiService';

const MEAL_OPTIONS = [
  { id: 'breakfast', label: 'Desayuno' },
  { id: 'lunch', label: 'Almuerzo' },
  { id: 'dinner', label: 'Cena' },
  { id: 'snack', label: 'Snack' },
];

const SLOT_LABELS = {
  breakfast: 'Desayuno',
  lunch: 'Almuerzo',
  dinner: 'Cena',
  snack_1: 'Snack 1',
  snack_2: 'Snack 2',
};

function getPer100g(food) {
  const servings = food?.servings?.serving;
  if (!Array.isArray(servings) || servings.length === 0) return null;
  const hundred = servings.find((s) => String(s.serving_description || '').toLowerCase().includes('100'));
  if (hundred) {
    return {
      calories: Number(hundred.calories) || 0,
      protein: Number(hundred.protein) || 0,
      carbs: Number(hundred.carbohydrate) || 0,
      fat: Number(hundred.fat) || 0,
    };
  }
  const first = servings[0];
  const grams = Number(first.metric_serving_amount) || 100;
  const scale = 100 / grams;
  return {
    calories: Math.round((Number(first.calories) || 0) * scale),
    protein: Math.round((Number(first.protein) || 0) * scale * 10) / 10,
    carbs: Math.round((Number(first.carbohydrate) || 0) * scale * 10) / 10,
    fat: Math.round((Number(first.fat) || 0) * scale * 10) / 10,
  };
}

function descriptionLooksLike100g(s) {
  return /100\s*g|100g/i.test(String(s.serving_description || ''));
}
function descriptionLooksLike1g(s) {
  return /^1\s*g$|^1g$/i.test(String(s.serving_description || '').trim());
}

/** Return servings array with 100g and 1g options always present (derived when missing). */
function getServingsWithStandardOptions(food) {
  const raw = food?.servings?.serving;
  const list = Array.isArray(raw) ? [...raw] : [];
  const per100 = getPer100g(food);
  if (!per100) return list;

  if (!list.some(descriptionLooksLike100g)) {
    list.unshift({
      serving_id: 'derived-100g',
      serving_description: '100 g',
      calories: per100.calories,
      protein: per100.protein,
      carbohydrate: per100.carbs,
      fat: per100.fat,
      metric_serving_amount: 100,
      metric_serving_unit: 'g',
    });
  }
  if (!list.some(descriptionLooksLike1g)) {
    list.unshift({
      serving_id: 'derived-1g',
      serving_description: '1 g',
      calories: Math.round(per100.calories / 100 * 10) / 10,
      protein: Math.round(per100.protein / 100 * 100) / 100,
      carbohydrate: Math.round(per100.carbs / 100 * 100) / 100,
      fat: Math.round(per100.fat / 100 * 100) / 100,
      metric_serving_amount: 1,
      metric_serving_unit: 'g',
    });
  }
  return list;
}

export function NutritionScreenBase({ navigation }) {
  const { user } = useAuth();
  const userId = user?.uid ?? '';

  const [assignment, setAssignment] = useState(null);
  const [plan, setPlan] = useState(null);
  const [loadingAssignment, setLoadingAssignment] = useState(true);
  const [diaryDate, setDiaryDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [diaryEntries, setDiaryEntries] = useState([]);
  const [loadingDiary, setLoadingDiary] = useState(false);
  const [logMode, setLogMode] = useState('search'); // 'search' | 'manual'
  const [logMeal, setLogMeal] = useState('breakfast');
  const [isLogModalOpen, setIsLogModalOpen] = useState(false);

  // Search log
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [selectedFood, setSelectedFood] = useState(null);
  const [selectedServing, setSelectedServing] = useState(null);
  const [servingUnits, setServingUnits] = useState('1');

  // Manual log
  const [manualName, setManualName] = useState('');
  const [manualUnits, setManualUnits] = useState('1');
  const [manualCalories, setManualCalories] = useState('');
  const [manualProtein, setManualProtein] = useState('');
  const [manualCarbs, setManualCarbs] = useState('');
  const [manualFat, setManualFat] = useState('');

  const [submittingLog, setSubmittingLog] = useState(false);

  const loadAssignment = useCallback(async () => {
    if (!userId) return;
    setLoadingAssignment(true);
    try {
      const { plan: effectivePlan, assignment: a } = await nutritionDb.getEffectivePlanForUser(userId);
      setAssignment(a);
      setPlan(effectivePlan);
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

  async function handleSearch() {
    if (!searchQuery.trim()) return;
    setSearchLoading(true);
    setSearchResults([]);
    setSelectedFood(null);
    setSelectedServing(null);
    try {
      const data = await nutritionApi.nutritionFoodSearch(searchQuery.trim(), 0, 20);
      const foods = data?.foods_search?.results?.food ?? [];
      setSearchResults(Array.isArray(foods) ? foods : []);
    } catch (e) {
      setSearchResults([]);
    } finally {
      setSearchLoading(false);
    }
  }

  function selectFood(food) {
    setSelectedFood(food);
    setSelectedServing(null);
    setServingUnits('1');
  }

  async function handleLogFromSearch() {
    if (!userId || !diaryDate || !selectedFood || !selectedServing) return;
    const s = selectedServing;
    const mult = Number(servingUnits) || 1;
    setSubmittingLog(true);
    try {
      await nutritionDb.addDiaryEntry(userId, {
        date: diaryDate,
        meal: logMeal,
        food_id: selectedFood.food_id,
        serving_id: s.serving_id,
        number_of_units: mult,
        name: selectedFood.food_name || 'Food',
        food_category: selectedFood.food_category ?? null,
        calories: s.calories != null ? Math.round(Number(s.calories) * mult) : null,
        protein: s.protein != null ? Math.round(Number(s.protein) * mult) : null,
        carbs: s.carbohydrate != null ? Math.round(Number(s.carbohydrate) * mult) : null,
        fat: s.fat != null ? Math.round(Number(s.fat) * mult) : null,
      });
      closeLogModal();
      loadDiary();
    } catch (e) {
      console.error(e);
    } finally {
      setSubmittingLog(false);
    }
  }

  async function handleLogManual() {
    if (!userId || !diaryDate || !manualName.trim()) return;
    setSubmittingLog(true);
    try {
      await nutritionDb.addDiaryEntry(userId, {
        date: diaryDate,
        meal: logMeal,
        food_id: `manual-${Date.now()}`,
        serving_id: '0',
        number_of_units: Number(manualUnits) || 1,
        name: manualName.trim(),
        food_category: null,
        calories: manualCalories !== '' ? Number(manualCalories) : null,
        protein: manualProtein !== '' ? Number(manualProtein) : null,
        carbs: manualCarbs !== '' ? Number(manualCarbs) : null,
        fat: manualFat !== '' ? Number(manualFat) : null,
      });
      closeLogModal();
      loadDiary();
    } catch (e) {
      console.error(e);
    } finally {
      setSubmittingLog(false);
    }
  }

  function closeLogModal() {
    setIsLogModalOpen(false);
    setSearchQuery('');
    setSearchResults([]);
    setSelectedFood(null);
    setSelectedServing(null);
    setServingUnits('1');
    setManualName('');
    setManualUnits('1');
    setManualCalories('');
    setManualProtein('');
    setManualCarbs('');
    setManualFat('');
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

  const servings = getServingsWithStandardOptions(selectedFood);

  if (loadingAssignment) {
    return (
      <View style={styles.container}>
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color="rgba(191, 168, 77, 1)" />
          <Text style={styles.loadingText}>Cargando…</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Plan section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Tu plan</Text>
          {assignment && plan ? (
            <>
              <Text style={styles.planName}>{plan.name}</Text>
              {(plan.daily_calories != null || plan.daily_protein_g != null) && (
                <View style={styles.macrosRow}>
                  {plan.daily_calories != null && (
                    <Text style={styles.macroText}>{plan.daily_calories} kcal</Text>
                  )}
                  {plan.daily_protein_g != null && (
                    <Text style={styles.macroText}>P: {plan.daily_protein_g}g</Text>
                  )}
                  {plan.daily_carbs_g != null && (
                    <Text style={styles.macroText}>C: {plan.daily_carbs_g}g</Text>
                  )}
                  {plan.daily_fat_g != null && (
                    <Text style={styles.macroText}>G: {plan.daily_fat_g}g</Text>
                  )}
                </View>
              )}
              {(plan.categories?.length > 0 || plan.slots?.length > 0) && (
                <View style={styles.slotsWrap}>
                  {(plan.categories || plan.slots).map((item, i) => {
                    const isCategory = !!item.label;
                    const categoryLabel = isCategory ? item.label : (SLOT_LABELS[item.slot_type] || item.slot_type);
                    const optionNames = isCategory
                      ? ((item.options && item.options.length) ? item.options.map((o) => o.label || 'Opción') : (item.meal_options || []).map((o) => o.name || 'Opción'))
                      : (item.options || []).map((o) => o.label || 'Opción');
                    return (
                      <Text key={i} style={styles.slotLabel}>
                        {categoryLabel}: {optionNames.join(', ')}
                      </Text>
                    );
                  })}
                </View>
              )}
            </>
          ) : (
            <Text style={styles.emptyText}>
              No tienes un plan asignado. Pide a tu entrenador que te asigne uno.
            </Text>
          )}
        </View>

        {/* Diary section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Diario</Text>
          <View style={styles.dateRow}>
            <Text style={styles.dateLabel}>Fecha</Text>
            <TextInput
              style={styles.dateInput}
              value={diaryDate}
              onChangeText={setDiaryDate}
              placeholder="YYYY-MM-DD"
              placeholderTextColor="rgba(255,255,255,0.4)"
            />
          </View>

          {loadingDiary ? (
            <ActivityIndicator color="rgba(255,255,255,0.6)" style={{ marginVertical: 16 }} />
          ) : diaryEntries.length === 0 ? (
            <Text style={styles.emptyText}>No hay entradas para esta fecha.</Text>
          ) : (
            <>
              {MEAL_OPTIONS.map((m) => {
                const entries = diaryEntries.filter((e) => e.meal === m.id);
                if (entries.length === 0) return null;
                return (
                  <View key={m.id} style={styles.mealBlock}>
                    <Text style={styles.mealBlockTitle}>{m.label}</Text>
                    {entries.map((e) => (
                      <View key={e.id} style={styles.entryRow}>
                        <Text style={styles.entryText}>
                          {e.name} · {e.number_of_units} · {e.calories ?? '?'} kcal
                        </Text>
                        <TouchableOpacity
                          onPress={() => handleDeleteEntry(e.id)}
                          style={styles.deleteBtn}
                        >
                          <Text style={styles.deleteBtnText}>Eliminar</Text>
                        </TouchableOpacity>
                      </View>
                    ))}
                  </View>
                );
              })}
              <View style={styles.totalsBlock}>
                <Text style={styles.totalsTitle}>Total del día</Text>
                <Text style={styles.totalsText}>
                  {dailyTotalCal} kcal · P: {dailyTotalProtein}g · C: {dailyTotalCarbs}g · G: {dailyTotalFat}g
                </Text>
              </View>
            </>
          )}
        </View>

        {/* Log food button */}
        <TouchableOpacity
          style={styles.logButton}
          onPress={() => setIsLogModalOpen(true)}
        >
          <Text style={styles.logButtonText}>+ Añadir alimento</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Log modal */}
      <Modal
        visible={isLogModalOpen}
        animationType="slide"
        transparent
        onRequestClose={closeLogModal}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.modalOverlay}
        >
          <TouchableOpacity style={styles.modalBackdrop} onPress={closeLogModal} activeOpacity={1} />
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Añadir alimento</Text>
              <TouchableOpacity onPress={closeLogModal}>
                <Text style={styles.modalClose}>Cerrar</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.mealPills}>
              {MEAL_OPTIONS.map((m) => (
                <TouchableOpacity
                  key={m.id}
                  onPress={() => setLogMeal(m.id)}
                  style={[styles.mealPill, logMeal === m.id && styles.mealPillActive]}
                >
                  <Text style={[styles.mealPillText, logMeal === m.id && styles.mealPillTextActive]}>
                    {m.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.logModeTabs}>
              <TouchableOpacity
                onPress={() => setLogMode('search')}
                style={[styles.logModeTab, logMode === 'search' && styles.logModeTabActive]}
              >
                <Text style={[styles.logModeTabText, logMode === 'search' && styles.logModeTabTextActive]}>
                  Buscar
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setLogMode('manual')}
                style={[styles.logModeTab, logMode === 'manual' && styles.logModeTabActive]}
              >
                <Text style={[styles.logModeTabText, logMode === 'manual' && styles.logModeTabTextActive]}>
                  Manual
                </Text>
              </TouchableOpacity>
            </View>

            {logMode === 'search' ? (
              <>
                <View style={styles.searchRow}>
                  <TextInput
                    style={styles.searchInput}
                    value={searchQuery}
                    onChangeText={setSearchQuery}
                    placeholder="Buscar alimento (ej. pollo)"
                    placeholderTextColor="rgba(255,255,255,0.4)"
                    onSubmitEditing={handleSearch}
                  />
                  <TouchableOpacity
                    style={styles.searchBtn}
                    onPress={handleSearch}
                    disabled={searchLoading}
                  >
                    <Text style={styles.searchBtnText}>{searchLoading ? '…' : 'Buscar'}</Text>
                  </TouchableOpacity>
                </View>
                {searchResults.length > 0 && (
                  <ScrollView style={styles.searchResults} nestedScrollEnabled>
                    {searchResults.map((f) => (
                      <TouchableOpacity
                        key={f.food_id}
                        onPress={() => selectFood(f)}
                        style={[styles.searchResultItem, selectedFood?.food_id === f.food_id && styles.searchResultItemActive]}
                      >
                        <Text style={styles.searchResultName}>{f.food_name}</Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                )}
                {selectedFood && servings.length > 0 && (
                  <View style={styles.servingSection}>
                    <Text style={styles.servingLabel}>Porción</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.servingList}>
                      {servings.map((s) => (
                        <TouchableOpacity
                          key={s.serving_id}
                          onPress={() => setSelectedServing(s)}
                          style={[styles.servingChip, selectedServing?.serving_id === s.serving_id && styles.servingChipActive]}
                        >
                          <Text style={[styles.servingChipText, selectedServing?.serving_id === s.serving_id && styles.servingChipTextActive]}>
                            {s.serving_description} — {s.calories} kcal
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                    <View style={styles.unitsRow}>
                      <Text style={styles.unitsLabel}>Cantidad</Text>
                      <TextInput
                        style={styles.unitsInput}
                        value={servingUnits}
                        onChangeText={setServingUnits}
                        keyboardType="decimal-pad"
                        placeholder="1"
                        placeholderTextColor="rgba(255,255,255,0.4)"
                      />
                    </View>
                    <TouchableOpacity
                      style={[styles.submitBtn, (!selectedServing || submittingLog) && styles.submitBtnDisabled]}
                      onPress={handleLogFromSearch}
                      disabled={!selectedServing || submittingLog}
                    >
                      <Text style={styles.submitBtnText}>
                        {submittingLog ? 'Guardando…' : 'Añadir'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                )}
              </>
            ) : (
              <View style={styles.manualForm}>
                <TextInput
                  style={styles.manualInput}
                  value={manualName}
                  onChangeText={setManualName}
                  placeholder="Nombre del alimento *"
                  placeholderTextColor="rgba(255,255,255,0.4)"
                />
                <TextInput
                  style={styles.manualInput}
                  value={manualUnits}
                  onChangeText={setManualUnits}
                  placeholder="Cantidad"
                  placeholderTextColor="rgba(255,255,255,0.4)"
                  keyboardType="decimal-pad"
                />
                <TextInput
                  style={styles.manualInput}
                  value={manualCalories}
                  onChangeText={setManualCalories}
                  placeholder="Calorías (opcional)"
                  placeholderTextColor="rgba(255,255,255,0.4)"
                  keyboardType="number-pad"
                />
                <TextInput
                  style={styles.manualInput}
                  value={manualProtein}
                  onChangeText={setManualProtein}
                  placeholder="Proteína g (opcional)"
                  placeholderTextColor="rgba(255,255,255,0.4)"
                  keyboardType="number-pad"
                />
                <TextInput
                  style={styles.manualInput}
                  value={manualCarbs}
                  onChangeText={setManualCarbs}
                  placeholder="Carbos g (opcional)"
                  placeholderTextColor="rgba(255,255,255,0.4)"
                  keyboardType="number-pad"
                />
                <TextInput
                  style={styles.manualInput}
                  value={manualFat}
                  onChangeText={setManualFat}
                  placeholder="Grasas g (opcional)"
                  placeholderTextColor="rgba(255,255,255,0.4)"
                  keyboardType="number-pad"
                />
                <TouchableOpacity
                  style={[styles.submitBtn, (!manualName.trim() || submittingLog) && styles.submitBtnDisabled]}
                  onPress={handleLogManual}
                  disabled={!manualName.trim() || submittingLog}
                >
                  <Text style={styles.submitBtnText}>
                    {submittingLog ? 'Guardando…' : 'Añadir'}
                  </Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a1a',
    paddingBottom: 100,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 40,
  },
  loadingWrap: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
  },
  loadingText: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 14,
  },
  section: {
    padding: 20,
    marginBottom: 16,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 12,
  },
  planName: {
    fontSize: 16,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.95)',
    marginBottom: 8,
  },
  macrosRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 8,
  },
  macroText: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.7)',
  },
  slotsWrap: {
    marginTop: 8,
  },
  slotLabel: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.6)',
    marginBottom: 4,
  },
  emptyText: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.5)',
  },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 16,
  },
  dateLabel: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.7)',
    width: 50,
  },
  dateInput: {
    flex: 1,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    backgroundColor: 'rgba(255,255,255,0.06)',
    color: '#fff',
    fontSize: 14,
  },
  mealBlock: {
    marginBottom: 16,
  },
  mealBlockTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: 'rgba(191, 168, 77, 1)',
    marginBottom: 8,
  },
  entryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  entryText: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.9)',
    flex: 1,
  },
  deleteBtn: {
    padding: 6,
  },
  deleteBtnText: {
    color: '#f87171',
    fontSize: 13,
  },
  totalsBlock: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.1)',
  },
  totalsTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.8)',
    marginBottom: 4,
  },
  totalsText: {
    fontSize: 15,
    color: '#fff',
    fontWeight: '500',
  },
  logButton: {
    marginTop: 8,
    padding: 18,
    borderRadius: 14,
    backgroundColor: 'rgba(191, 168, 77, 0.2)',
    borderWidth: 1,
    borderColor: 'rgba(191, 168, 77, 0.4)',
    alignItems: 'center',
  },
  logButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: 'rgba(191, 168, 77, 1)',
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  modalContent: {
    backgroundColor: '#1f1f1f',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: 40,
    maxHeight: '85%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#fff',
  },
  modalClose: {
    fontSize: 15,
    color: 'rgba(191, 168, 77, 1)',
    fontWeight: '500',
  },
  mealPills: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  mealPill: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  mealPillActive: {
    backgroundColor: 'rgba(191, 168, 77, 0.3)',
  },
  mealPillText: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.7)',
  },
  mealPillTextActive: {
    color: '#fff',
    fontWeight: '600',
  },
  logModeTabs: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 20,
  },
  logModeTab: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  logModeTabActive: {
    backgroundColor: 'rgba(191, 168, 77, 0.2)',
  },
  logModeTabText: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.6)',
  },
  logModeTabTextActive: {
    color: '#fff',
    fontWeight: '600',
  },
  searchRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 16,
  },
  searchInput: {
    flex: 1,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    backgroundColor: 'rgba(255,255,255,0.06)',
    color: '#fff',
    fontSize: 15,
  },
  searchBtn: {
    paddingHorizontal: 20,
    justifyContent: 'center',
    borderRadius: 12,
    backgroundColor: 'rgba(191, 168, 77, 0.3)',
  },
  searchBtnText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#fff',
  },
  searchResults: {
    maxHeight: 180,
    marginBottom: 16,
  },
  searchResultItem: {
    padding: 14,
    borderRadius: 10,
    marginBottom: 6,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: 'transparent',
  },
  searchResultItemActive: {
    borderColor: 'rgba(191, 168, 77, 0.5)',
    backgroundColor: 'rgba(191, 168, 77, 0.1)',
  },
  searchResultName: {
    fontSize: 15,
    color: 'rgba(255,255,255,0.9)',
  },
  servingSection: {
    marginTop: 8,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.08)',
  },
  servingLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.8)',
    marginBottom: 10,
  },
  servingList: {
    marginBottom: 16,
  },
  servingChip: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.08)',
    marginRight: 10,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  servingChipActive: {
    backgroundColor: 'rgba(191, 168, 77, 0.2)',
    borderColor: 'rgba(191, 168, 77, 0.4)',
  },
  servingChipText: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.8)',
  },
  servingChipTextActive: {
    color: '#fff',
    fontWeight: '600',
  },
  unitsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 16,
  },
  unitsLabel: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.7)',
    width: 70,
  },
  unitsInput: {
    flex: 1,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    backgroundColor: 'rgba(255,255,255,0.06)',
    color: '#fff',
    fontSize: 15,
  },
  submitBtn: {
    padding: 16,
    borderRadius: 12,
    backgroundColor: 'rgba(191, 168, 77, 0.4)',
    alignItems: 'center',
  },
  submitBtnDisabled: {
    opacity: 0.5,
  },
  submitBtnText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  manualForm: {
    gap: 12,
  },
  manualInput: {
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    backgroundColor: 'rgba(255,255,255,0.06)',
    color: '#fff',
    fontSize: 15,
  },
});

export default NutritionScreenBase;
