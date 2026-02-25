/**
 * Nutrition Firestore service — user diary, assignments, plan (read).
 * Paths: nutrition_assignments, client_nutrition_plan_content, users/{userId}/diary, creator_nutrition_library/{creatorId}/plans
 * Resolution: for a user's plan, prefer client_nutrition_plan_content (assignment copy) over library plan.
 *
 * Diary (meal logging): One document per logged food serving at users/{userId}/diary/{entryId}.
 * Each day is independent: query by date (YYYY-MM-DD). Plan targets (daily_calories, daily_*_g) come from
 * the assigned plan; what the user actually eats is stored only in diary entries. Past days can be edited
 * by loading getDiaryEntries(userId, date) and using addDiaryEntry, updateDiaryEntry, deleteDiaryEntry.
 */
import {
  collection,
  doc,
  getDocs,
  getDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  serverTimestamp,
} from 'firebase/firestore';
import { firestore } from '../config/firebase';
import logger from '../utils/logger';

const PLANS = 'plans';
const CLIENT_NUTRITION_PLAN_CONTENT = 'client_nutrition_plan_content';

function planRef(creatorId, planId) {
  return doc(firestore, 'creator_nutrition_library', creatorId, PLANS, planId);
}

function assignmentsRef() {
  return collection(firestore, 'nutrition_assignments');
}

function diaryRef(userId) {
  // 3 path segments = valid Firestore collection reference (must be odd count).
  // Diary entries live at users/{userId}/diary/{entryId}.
  return collection(firestore, 'users', userId, 'diary');
}

export async function getAssignmentsByUser(userId) {
  const q = query(
    assignmentsRef(),
    where('userId', '==', userId),
    orderBy('startDate', 'desc')
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function getPlanById(creatorId, planId) {
  const d = await getDoc(planRef(creatorId, planId));
  return d.exists() ? { id: d.id, ...d.data() } : null;
}

/**
 * Get client nutrition plan content (personalized copy) for an assignment if it exists.
 * Used for resolution: copy first, then library plan.
 */
export async function getClientNutritionPlanContent(assignmentId) {
  if (!assignmentId) return null;
  try {
    const ref = doc(firestore, CLIENT_NUTRITION_PLAN_CONTENT, assignmentId);
    const snap = await getDoc(ref);
    return snap.exists() ? { id: snap.id, ...snap.data() } : null;
  } catch (err) {
    console.warn('[nutritionFirestoreService] getClientNutritionPlanContent:', err?.message);
    return null;
  }
}

function parseAssignmentDate(value) {
  if (value == null) return null;
  if (value && typeof value.toDate === 'function') return value.toDate();
  if (typeof value === 'string') return new Date(value);
  if (value instanceof Date) return value;
  return null;
}

/**
 * Get the assignment that is active on a given date (startDate <= date and (no endDate or endDate >= date)).
 * If none, returns the most recent assignment by startDate (backward compatible).
 */
function getActiveAssignmentForDate(assignments, date) {
  const active = getActiveAssignmentsForDate(assignments, date);
  return active[0] || assignments[0] || null;
}

/**
 * Get all assignments active on a given date (for program picker when user has multiple plans).
 */
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

function normalizePlanMacros(plan) {
  if (!plan || typeof plan !== 'object') return plan;
  return {
    ...plan,
    daily_protein_g: plan.daily_protein_g ?? plan.daily_protein ?? null,
    daily_carbs_g: plan.daily_carbs_g ?? plan.daily_carbs ?? null,
    daily_fat_g: plan.daily_fat_g ?? plan.daily_fat ?? null,
  };
}

/**
 * Returns whether the user has an active nutrition assignment (for routing only; no plan content read).
 * Use this when you only need to know "has plan" (e.g. bottom bar) to avoid permission issues.
 */
export async function hasActiveNutritionAssignment(userId, onDate = null) {
  const tag = '[hasActiveNutritionAssignment]';
  try {
    const assignments = await getAssignmentsByUser(userId);
    logger.log(tag, 'userId=', userId, 'assignmentsCount=', assignments?.length ?? 0, 'assignments=', assignments?.map((a) => ({ id: a.id, planId: a.planId, assignedBy: a.assignedBy, startDate: a.startDate, endDate: a.endDate })));
    const assignment = getActiveAssignmentForDate(assignments, onDate);
    const hasPlan = !!(assignment?.planId && assignment?.assignedBy);
    logger.log(tag, 'activeAssignment=', assignment ? { id: assignment.id, planId: assignment.planId, assignedBy: assignment.assignedBy, startDate: assignment.startDate, endDate: assignment.endDate } : null, 'result hasPlan=', hasPlan);
    return hasPlan;
  } catch (err) {
    logger.error(tag, 'userId=', userId, 'error=', err?.message ?? err, err);
    throw err;
  }
}

/**
 * Get the effective plan for a user: assignment copy if exists, else plan snapshot on assignment.
 * Uses the assignment that is active today (startDate <= today, endDate null or >= today); else most recent.
 * @param {string} userId - User id
 * @param {Date|string} [onDate] - Date to check (default: today)
 * @returns {Promise<{ plan: Object|null, assignment: Object|null }>}
 */
export async function getEffectivePlanForUser(userId, onDate = null) {
  const assignments = await getAssignmentsByUser(userId);
  const assignment = getActiveAssignmentForDate(assignments, onDate);
  if (!assignment?.planId || !assignment?.assignedBy) {
    return { plan: null, assignment: null };
  }
  const copy = await getClientNutritionPlanContent(assignment.id);
  if (copy) {
    return { plan: normalizePlanMacros(copy), assignment };
  }
  const snapshot = assignment.plan && typeof assignment.plan === 'object'
    ? { id: assignment.planId, ...assignment.plan }
    : null;
  if (snapshot) {
    return { plan: normalizePlanMacros(snapshot), assignment };
  }
  try {
    const libraryPlan = await getPlanById(assignment.assignedBy, assignment.planId);
    return { plan: normalizePlanMacros(libraryPlan), assignment };
  } catch (err) {
    return { plan: null, assignment };
  }
}

/**
 * Get plan for a specific assignment (e.g. when user has pinned a default plan).
 * @param {string} userId - User id
 * @param {string} assignmentId - Assignment document id
 * @param {Date|string} [onDate] - Optional date (for validation; not used for resolution)
 * @returns {Promise<{ plan: Object|null, assignment: Object|null }>}
 */
export async function getPlanForAssignmentId(userId, assignmentId, onDate = null) {
  if (!assignmentId) return { plan: null, assignment: null };
  const assignments = await getAssignmentsByUser(userId);
  const assignment = assignments.find((a) => a.id === assignmentId);
  if (!assignment?.planId || !assignment?.assignedBy) {
    return { plan: null, assignment: null };
  }
  const copy = await getClientNutritionPlanContent(assignment.id);
  if (copy) {
    return { plan: normalizePlanMacros(copy), assignment };
  }
  const snapshot = assignment.plan && typeof assignment.plan === 'object'
    ? { id: assignment.planId, ...assignment.plan }
    : null;
  if (snapshot) {
    return { plan: normalizePlanMacros(snapshot), assignment };
  }
  try {
    const libraryPlan = await getPlanById(assignment.assignedBy, assignment.planId);
    return { plan: normalizePlanMacros(libraryPlan), assignment };
  } catch (err) {
    return { plan: null, assignment };
  }
}

export async function getDiaryEntries(userId, date) {
  const q = query(
    diaryRef(userId),
    where('date', '==', date),
    orderBy('meal', 'asc')
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/**
 * Get all diary entries in a date range (inclusive). One query = lightest/cheapest for aggregations
 * (e.g. average calories/macros last 7 days and % change vs previous 7 days).
 * @param {string} userId
 * @param {string} startDateYYYYMMDD
 * @param {string} endDateYYYYMMDD
 * @returns {Promise<Array<{ id: string, date: string, calories?: number, protein?: number, carbs?: number, fat?: number, ... }>>}
 */
export async function getDiaryEntriesInRange(userId, startDateYYYYMMDD, endDateYYYYMMDD) {
  if (!userId || !startDateYYYYMMDD || !endDateYYYYMMDD) return [];
  const q = query(
    diaryRef(userId),
    where('date', '>=', startDateYYYYMMDD),
    where('date', '<=', endDateYYYYMMDD)
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/**
 * Get YYYY-MM-DD dates that have at least one diary entry in the given range (inclusive).
 */
export async function getDatesWithEntries(userId, startDateYYYYMMDD, endDateYYYYMMDD) {
  const q = query(
    diaryRef(userId),
    where('date', '>=', startDateYYYYMMDD),
    where('date', '<=', endDateYYYYMMDD)
  );
  const snap = await getDocs(q);
  const dates = new Set();
  snap.docs.forEach((d) => {
    const date = d.data().date;
    if (date) dates.add(date);
  });
  return Array.from(dates);
}

export async function addDiaryEntry(userId, data) {
  const ref = await addDoc(diaryRef(userId), {
    userId,
    date: data.date,
    meal: data.meal ?? '',
    food_id: data.food_id,
    serving_id: data.serving_id,
    number_of_units: data.number_of_units ?? 1,
    name: data.name ?? '',
    food_category: data.food_category ?? null,
    calories: data.calories ?? null,
    protein: data.protein ?? null,
    carbs: data.carbs ?? null,
    fat: data.fat ?? null,
    serving_unit: data.serving_unit ?? null,
    grams_per_unit: data.grams_per_unit ?? null,
    servings: data.servings ?? null,
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

export async function updateDiaryEntry(userId, entryId, data) {
  const ref = doc(firestore, 'users', userId, 'diary', entryId);
  const update = {};
  if (data.date != null) update.date = data.date;
  if (data.meal != null) update.meal = data.meal;
  if (data.food_id != null) update.food_id = data.food_id;
  if (data.serving_id != null) update.serving_id = data.serving_id;
  if (data.number_of_units != null) update.number_of_units = data.number_of_units;
  if (data.name != null) update.name = data.name;
  if (data.food_category !== undefined) update.food_category = data.food_category ?? null;
  if (data.calories != null) update.calories = data.calories;
  if (data.protein != null) update.protein = data.protein;
  if (data.carbs != null) update.carbs = data.carbs;
  if (data.fat != null) update.fat = data.fat;
  if (data.serving_unit !== undefined) update.serving_unit = data.serving_unit ?? null;
  if (data.grams_per_unit !== undefined) update.grams_per_unit = data.grams_per_unit ?? null;
  if (data.servings !== undefined) update.servings = data.servings;
  await updateDoc(ref, update);
}

export async function deleteDiaryEntry(userId, entryId) {
  await deleteDoc(doc(firestore, 'users', userId, 'diary', entryId));
}

function userMealsRef(userId) {
  return collection(firestore, 'users', userId, 'meals');
}

export async function getUserMeals(userId) {
  if (!userId) return [];
  const q = query(userMealsRef(userId), orderBy('createdAt', 'desc'));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function createUserMeal(userId, data) {
  const ref = await addDoc(userMealsRef(userId), {
    name: data.name ?? '',
    items: data.items ?? [],
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export async function updateUserMeal(userId, mealId, data) {
  const ref = doc(firestore, 'users', userId, 'meals', mealId);
  await updateDoc(ref, {
    ...(data.name !== undefined && { name: data.name }),
    ...(data.items !== undefined && { items: data.items }),
    updatedAt: serverTimestamp(),
  });
}

export async function deleteUserMeal(userId, mealId) {
  await deleteDoc(doc(firestore, 'users', userId, 'meals', mealId));
}

function savedFoodsRef(userId) {
  return collection(firestore, 'users', userId, 'saved_foods');
}

export async function getSavedFoods(userId) {
  const q = query(savedFoodsRef(userId), orderBy('savedAt', 'desc'));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function saveFood(userId, data) {
  const ref = await addDoc(savedFoodsRef(userId), {
    userId,
    food_id: data.food_id,
    name: data.name,
    food_category: data.food_category ?? null,
    serving_id: data.serving_id,
    serving_description: data.serving_description ?? null,
    number_of_units: data.number_of_units ?? 1,
    calories_per_unit: data.calories_per_unit ?? null,
    protein_per_unit: data.protein_per_unit ?? null,
    carbs_per_unit: data.carbs_per_unit ?? null,
    fat_per_unit: data.fat_per_unit ?? null,
    grams_per_unit: data.grams_per_unit ?? null,
    servings: data.servings ?? [],
    savedAt: serverTimestamp(),
  });
  return ref.id;
}

export async function deleteSavedFood(userId, savedFoodId) {
  await deleteDoc(doc(firestore, 'users', userId, 'saved_foods', savedFoodId));
}

export default {
  getAssignmentsByUser,
  getActiveAssignmentsForDate,
  hasActiveNutritionAssignment,
  getPlanById,
  getClientNutritionPlanContent,
  getEffectivePlanForUser,
  getPlanForAssignmentId,
  getDiaryEntries,
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
  deleteSavedFood,
};
