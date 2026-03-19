/**
 * Nutrition Firestore service — user diary, assignments, plan (read).
 * Phase 3: fully migrated to API.
 */
import apiClient, { WakeApiError } from '../utils/apiClient';
import logger from '../utils/logger';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toDateStr(value) {
  if (!value) return new Date().toISOString().split('T')[0];
  if (value instanceof Date) return value.toISOString().split('T')[0];
  return String(value).split('T')[0];
}

function shapeDiaryEntry(e) {
  return {
    id: e.entryId,
    date: e.date ?? null,
    meal: e.meal ?? null,
    food_id: e.foodId ?? null,
    serving_id: e.servingId ?? null,
    number_of_units: e.numberOfUnits ?? 1,
    name: e.name ?? null,
    food_category: e.foodCategory ?? null,
    calories: e.calories ?? null,
    protein: e.protein ?? null,
    carbs: e.carbs ?? null,
    fat: e.fat ?? null,
    serving_unit: e.servingUnit ?? null,
    grams_per_unit: e.gramsPerUnit ?? null,
    createdAt: e.createdAt ?? null,
  };
}

function shapeAssignment(d) {
  return {
    id: d.assignmentId,
    planId: d.assignmentId,   // truthy placeholder for getActiveAssignmentsForDate filter
    plan: shapePlan(d.plan),
    assignedBy: d.assignmentId, // truthy placeholder
    startDate: d.startDate ?? null,
    endDate: d.endDate ?? null,
  };
}

function shapePlan(p) {
  if (!p) return null;
  return {
    id: p.planId ?? null,
    name: p.name ?? null,
    daily_calories: p.dailyCalories ?? null,
    daily_protein_g: p.dailyProteinG ?? null,
    daily_carbs_g: p.dailyCarbsG ?? null,
    daily_fat_g: p.dailyFatG ?? null,
    categories: p.categories ?? [],
  };
}

// ─── Utility (kept pure — no async) ──────────────────────────────────────────

function parseAssignmentDate(value) {
  if (value == null) return null;
  if (value && typeof value.toDate === 'function') return value.toDate();
  if (typeof value === 'string') return new Date(value);
  if (value instanceof Date) return value;
  return null;
}

export function getActiveAssignmentsForDate(assignments, date = null) {
  const today = date ? new Date(date) : new Date();
  today.setHours(0, 0, 0, 0);
  return (assignments || []).filter((a) => {
    const start = parseAssignmentDate(a.startDate);
    const end = parseAssignmentDate(a.endDate);
    if (start && start > today) return false;
    if (end && end < today) return false;
    return !!(a.planId && a.assignedBy);
  });
}

// ─── Assignment / plan ────────────────────────────────────────────────────────

export async function getAssignmentsByUser(userId) {
  const tag = '[getAssignmentsByUser]';
  const dateStr = toDateStr(new Date());
  try {
    const result = await apiClient.get('/nutrition/assignment', { params: { date: dateStr } });
    return [shapeAssignment(result.data)];
  } catch (err) {
    if (err instanceof WakeApiError && err.code === 'NOT_FOUND') return [];
    logger.error(tag, 'userId=', userId, 'error=', err?.message ?? err);
    throw err;
  }
}

export async function hasActiveNutritionAssignment(userId, onDate = null) {
  const tag = '[hasActiveNutritionAssignment]';
  const dateStr = toDateStr(onDate);
  try {
    await apiClient.get('/nutrition/assignment', { params: { date: dateStr } });
    return true;
  } catch (err) {
    if (err instanceof WakeApiError && err.code === 'NOT_FOUND') return false;
    logger.error(tag, 'userId=', userId, 'error=', err?.message ?? err, err);
    throw err;
  }
}

export async function getEffectivePlanForUser(_userId, onDate = null) {
  const dateStr = toDateStr(onDate);
  try {
    const result = await apiClient.get('/nutrition/assignment', { params: { date: dateStr } });
    const d = result.data;
    return {
      plan: shapePlan({ ...d.plan, planId: d.assignmentId }),
      assignment: {
        id: d.assignmentId,
        planId: d.assignmentId,
        assignedBy: d.assignmentId,
        startDate: d.startDate ?? null,
        endDate: d.endDate ?? null,
      },
    };
  } catch (err) {
    if (err instanceof WakeApiError && err.code === 'NOT_FOUND') return { plan: null, assignment: null };
    throw err;
  }
}

export async function getPlanForAssignmentId(userId, _assignmentId, onDate = null) {
  // The API resolves the active plan for the given date — no per-assignmentId endpoint exists.
  return getEffectivePlanForUser(userId, onDate);
}

// ─── Diary ────────────────────────────────────────────────────────────────────

export async function getDiaryEntries(_userId, date) {
  const result = await apiClient.get('/nutrition/diary', { params: { date } });
  return (result?.data ?? []).map(shapeDiaryEntry);
}

export async function getDiaryEntriesInRange(_userId, startDateYYYYMMDD, endDateYYYYMMDD) {
  if (!startDateYYYYMMDD || !endDateYYYYMMDD) return [];
  const result = await apiClient.get('/nutrition/diary', {
    params: { startDate: startDateYYYYMMDD, endDate: endDateYYYYMMDD },
  });
  return (result?.data ?? []).map(shapeDiaryEntry);
}

export async function getDatesWithEntries(_userId, startDateYYYYMMDD, endDateYYYYMMDD) {
  const entries = await getDiaryEntriesInRange(_userId, startDateYYYYMMDD, endDateYYYYMMDD);
  const dates = new Set();
  entries.forEach((e) => { if (e.date) dates.add(e.date); });
  return Array.from(dates);
}

export async function addDiaryEntry(_userId, data) {
  const result = await apiClient.post('/nutrition/diary', {
    date: data.date,
    meal: data.meal ?? '',
    foodId: data.food_id,
    servingId: data.serving_id ?? '0',
    numberOfUnits: data.number_of_units ?? 1,
    name: data.name ?? '',
    foodCategory: data.food_category ?? null,
    calories: data.calories ?? null,
    protein: data.protein ?? null,
    carbs: data.carbs ?? null,
    fat: data.fat ?? null,
    servingUnit: data.serving_unit ?? null,
    gramsPerUnit: data.grams_per_unit ?? null,
    ...(data.servings ? { servings: data.servings } : {}),
  }, { idempotent: false });
  return result?.data?.entryId;
}

export async function updateDiaryEntry(_userId, entryId, data) {
  const update = {};
  if (data.serving_id != null) update.servingId = data.serving_id;
  if (data.number_of_units != null) update.numberOfUnits = data.number_of_units;
  if (data.calories != null) update.calories = data.calories;
  if (data.protein != null) update.protein = data.protein;
  if (data.carbs != null) update.carbs = data.carbs;
  if (data.fat != null) update.fat = data.fat;
  await apiClient.patch(`/nutrition/diary/${entryId}`, update);
}

export async function deleteDiaryEntry(_userId, entryId) {
  await apiClient.delete(`/nutrition/diary/${entryId}`);
}

// ─── Saved foods ──────────────────────────────────────────────────────────────

export async function getSavedFoods(_userId) {
  const result = await apiClient.get('/nutrition/saved-foods');
  return (result?.data ?? []).map((f) => ({
    id: f.savedFoodId,
    food_id: f.foodId,
    name: f.name,
    food_category: null,
    serving_id: '0',
    serving_description: f.servingUnit ?? null,
    calories_per_unit: f.calories,
    protein_per_unit: f.protein,
    carbs_per_unit: f.carbs,
    fat_per_unit: f.fat,
    grams_per_unit: null,
    servings: [],
    savedAt: f.savedAt,
  }));
}

export async function saveFood(_userId, data) {
  const result = await apiClient.post('/nutrition/saved-foods', {
    foodId: data.food_id,
    name: data.name,
    calories: data.calories_per_unit ?? data.calories ?? null,
    protein: data.protein_per_unit ?? data.protein ?? null,
    carbs: data.carbs_per_unit ?? data.carbs ?? null,
    fat: data.fat_per_unit ?? data.fat ?? null,
    servingUnit: data.serving_description ?? data.serving_unit ?? null,
  }, { idempotent: false });
  return result?.data?.savedFoodId;
}

export async function deleteSavedFood(_userId, savedFoodId) {
  await apiClient.delete(`/nutrition/saved-foods/${savedFoodId}`);
}

export async function updateSavedFood(_userId, savedFoodId, _data) {
  const body = {};
  if (_data.name !== undefined) body.name = _data.name;
  if (_data.calories !== undefined) body.calories = _data.calories;
  if (_data.protein !== undefined) body.protein = _data.protein;
  if (_data.carbs !== undefined) body.carbs = _data.carbs;
  if (_data.fat !== undefined) body.fat = _data.fat;
  if (_data.serving_unit !== undefined) body.servingUnit = _data.serving_unit;
  if (_data.servingUnit !== undefined) body.servingUnit = _data.servingUnit;
  await apiClient.patch(`/nutrition/saved-foods/${savedFoodId}`, body);
}

export async function getUserMeals(_userId) {
  const result = await apiClient.get('/nutrition/user-meals');
  return (result?.data ?? []).map((m) => ({ id: m.mealId, ...m }));
}

export async function createUserMeal(_userId, data) {
  const result = await apiClient.post('/nutrition/user-meals', {
    name: data.name,
    items: data.items ?? [],
  }, { idempotent: false });
  return result?.data?.mealId;
}

export async function updateUserMeal(_userId, mealId, data) {
  const body = {};
  if (data.name !== undefined) body.name = data.name;
  if (data.items !== undefined) body.items = data.items;
  await apiClient.patch(`/nutrition/user-meals/${mealId}`, body);
}

export async function deleteUserMeal(_userId, mealId) {
  await apiClient.delete(`/nutrition/user-meals/${mealId}`);
}

export default {
  getAssignmentsByUser,
  getActiveAssignmentsForDate,
  hasActiveNutritionAssignment,
  getEffectivePlanForUser,
  getPlanForAssignmentId,
  getDiaryEntries,
  getDiaryEntriesInRange,
  getDatesWithEntries,
  addDiaryEntry,
  updateDiaryEntry,
  deleteDiaryEntry,
  getUserMeals,
  createUserMeal,
  updateUserMeal,
  deleteUserMeal,
  getSavedFoods,
  saveFood,
  updateSavedFood,
  deleteSavedFood,
};
