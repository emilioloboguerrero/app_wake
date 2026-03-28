/**
 * Nutrition Firestore service — user diary, assignments, plan (read).
 * Phase 3: fully migrated to API.
 */
import apiClient, { WakeApiError } from '../utils/apiClient';
import logger from '../utils/logger';
import { queryClient } from '../config/queryClient';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toDateStr(value) {
  if (!value) return new Date().toISOString().split('T')[0];
  if (value instanceof Date) return value.toISOString().split('T')[0];
  return String(value).split('T')[0];
}

function shapeDiaryEntry(e) {
  return { id: e.entryId ?? e.id, ...e };
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
    id: p.planId ?? p.id ?? null,
    name: p.name ?? null,
    daily_calories: p.daily_calories ?? null,
    daily_protein_g: p.daily_protein_g ?? null,
    daily_carbs_g: p.daily_carbs_g ?? null,
    daily_fat_g: p.daily_fat_g ?? null,
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
  const body = {
    date: data.date,
    meal: data.meal ?? '',
    food_id: data.food_id,
    serving_id: data.serving_id ?? '0',
    number_of_units: data.number_of_units ?? 1,
    name: data.name ?? '',
    food_category: data.food_category ?? null,
    calories: data.calories ?? null,
    protein: data.protein ?? null,
    carbs: data.carbs ?? null,
    fat: data.fat ?? null,
    serving_unit: data.serving_unit ?? null,
    grams_per_unit: data.grams_per_unit ?? null,
    ...(data.servings ? { servings: data.servings } : {}),
  };
  const tempId = `temp_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const result = await apiClient.post('/nutrition/diary', body, { idempotent: false, tempId });
  if (result?.queued) {
    const optimisticEntry = {
      id: tempId,
      ...body,
      createdAt: new Date().toISOString(),
    };
    queryClient.setQueryData(['nutrition', 'diary', body.date], (old) =>
      [...(old ?? []), optimisticEntry]
    );
    return tempId;
  }
  return result?.data?.entryId;
}

export async function updateDiaryEntry(_userId, entryId, data) {
  const update = {};
  if (data.serving_id != null) update.serving_id = data.serving_id;
  if (data.number_of_units != null) update.number_of_units = data.number_of_units;
  if (data.serving_unit != null) update.serving_unit = data.serving_unit;
  if (data.grams_per_unit != null) update.grams_per_unit = data.grams_per_unit;
  if (data.calories != null) update.calories = data.calories;
  if (data.protein != null) update.protein = data.protein;
  if (data.carbs != null) update.carbs = data.carbs;
  if (data.fat != null) update.fat = data.fat;
  return apiClient.patch(`/nutrition/diary/${entryId}`, update);
}

export async function deleteDiaryEntry(_userId, entryId) {
  return apiClient.delete(`/nutrition/diary/${entryId}`);
}

// ─── Saved foods ──────────────────────────────────────────────────────────────

export async function getSavedFoods(_userId) {
  const result = await apiClient.get('/nutrition/saved-foods');
  return (result?.data ?? []).map((f) => ({ id: f.savedFoodId ?? f.id, ...f }));
}

export async function saveFood(_userId, data) {
  const result = await apiClient.post('/nutrition/saved-foods', {
    food_id: data.food_id,
    name: data.name,
    serving_id: data.serving_id ?? '0',
    serving_description: data.serving_description ?? data.serving_unit ?? null,
    number_of_units: data.number_of_units ?? 1,
    food_category: data.food_category ?? null,
    calories_per_unit: data.calories_per_unit ?? data.calories ?? null,
    protein_per_unit: data.protein_per_unit ?? data.protein ?? null,
    carbs_per_unit: data.carbs_per_unit ?? data.carbs ?? null,
    fat_per_unit: data.fat_per_unit ?? data.fat ?? null,
    grams_per_unit: data.grams_per_unit ?? null,
    ...(data.servings ? { servings: data.servings } : {}),
  }, { idempotent: false });
  return result?.data?.savedFoodId;
}

export async function deleteSavedFood(_userId, savedFoodId) {
  await apiClient.delete(`/nutrition/saved-foods/${savedFoodId}`);
}

export async function updateSavedFood(_userId, savedFoodId, data) {
  const body = {};
  if (data.name !== undefined) body.name = data.name;
  if (data.calories_per_unit !== undefined) body.calories_per_unit = data.calories_per_unit;
  if (data.protein_per_unit !== undefined) body.protein_per_unit = data.protein_per_unit;
  if (data.carbs_per_unit !== undefined) body.carbs_per_unit = data.carbs_per_unit;
  if (data.fat_per_unit !== undefined) body.fat_per_unit = data.fat_per_unit;
  if (data.serving_description !== undefined) body.serving_description = data.serving_description;
  if (data.number_of_units !== undefined) body.number_of_units = data.number_of_units;
  if (data.grams_per_unit !== undefined) body.grams_per_unit = data.grams_per_unit;
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
