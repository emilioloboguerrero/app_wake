/**
 * Nutrition Firestore service — creator meal/plan library, assignments, user diary.
 * Paths: creator_nutrition_library/{creatorId}/meals|plans, nutrition_assignments, users/{userId}/nutrition/diary
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

const MEALS = 'meals';
const PLANS = 'plans';

function mealsRef(creatorId) {
  return collection(firestore, 'creator_nutrition_library', creatorId, MEALS);
}

function planRef(creatorId, planId) {
  return doc(firestore, 'creator_nutrition_library', creatorId, PLANS, planId);
}

function plansRef(creatorId) {
  return collection(firestore, 'creator_nutrition_library', creatorId, PLANS);
}

function assignmentsRef() {
  return collection(firestore, 'nutrition_assignments');
}

function diaryRef(userId) {
  return collection(firestore, 'users', userId, 'nutrition', 'diary');
}

/**
 * Meals
 */
export async function getMealsByCreator(creatorId) {
  const q = query(mealsRef(creatorId), orderBy('createdAt', 'desc'));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function getMealById(creatorId, mealId) {
  const ref = doc(firestore, 'creator_nutrition_library', creatorId, MEALS, mealId);
  const d = await getDoc(ref);
  return d.exists() ? { id: d.id, ...d.data() } : null;
}

export async function createMeal(creatorId, data) {
  const ref = await addDoc(mealsRef(creatorId), {
    name: data.name ?? '',
    creatorId,
    items: data.items ?? [],
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export async function updateMeal(creatorId, mealId, data) {
  const ref = doc(firestore, 'creator_nutrition_library', creatorId, MEALS, mealId);
  await updateDoc(ref, {
    ...data,
    updatedAt: serverTimestamp(),
  });
}

export async function deleteMeal(creatorId, mealId) {
  const ref = doc(firestore, 'creator_nutrition_library', creatorId, MEALS, mealId);
  await deleteDoc(ref);
}

/**
 * Plans
 */
export async function getPlansByCreator(creatorId) {
  const q = query(plansRef(creatorId), orderBy('createdAt', 'desc'));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function getPlanById(creatorId, planId) {
  const d = await getDoc(planRef(creatorId, planId));
  return d.exists() ? { id: d.id, ...d.data() } : null;
}

export async function createPlan(creatorId, data) {
  const ref = await addDoc(plansRef(creatorId), {
    name: data.name ?? '',
    description: data.description ?? '',
    creatorId,
    tags: data.tags ?? [],
    daily_calories: data.daily_calories ?? null,
    daily_protein_g: data.daily_protein_g ?? null,
    daily_carbs_g: data.daily_carbs_g ?? null,
    daily_fat_g: data.daily_fat_g ?? null,
    categories: data.categories ?? [],
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export async function updatePlan(creatorId, planId, data) {
  const ref = planRef(creatorId, planId);
  await updateDoc(ref, {
    ...data,
    updatedAt: serverTimestamp(),
  });
}

export async function deletePlan(creatorId, planId) {
  await deleteDoc(planRef(creatorId, planId));
}

/**
 * Assignments
 */
export async function getAssignmentsByUser(userId) {
  const q = query(
    assignmentsRef(),
    where('userId', '==', userId),
    orderBy('startDate', 'desc')
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function getAssignmentsByCreator(creatorId) {
  const q = query(
    assignmentsRef(),
    where('assignedBy', '==', creatorId),
    orderBy('createdAt', 'desc')
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function createAssignment(data) {
  const ref = await addDoc(assignmentsRef(), {
    userId: data.userId,
    planId: data.planId,
    plan: data.plan ?? null,
    assignedBy: data.assignedBy,
    source: data.source ?? 'one_on_one',
    programId: data.programId ?? null,
    startDate: data.startDate ?? null,
    endDate: data.endDate ?? null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export async function updateAssignment(assignmentId, data) {
  const ref = doc(firestore, 'nutrition_assignments', assignmentId);
  await updateDoc(ref, { ...data, updatedAt: serverTimestamp() });
}

export async function deleteAssignment(assignmentId) {
  await deleteDoc(doc(firestore, 'nutrition_assignments', assignmentId));
}

export async function getAssignmentById(assignmentId) {
  if (!assignmentId) return null;
  const ref = doc(firestore, 'nutrition_assignments', assignmentId);
  const d = await getDoc(ref);
  return d.exists() ? { id: d.id, ...d.data() } : null;
}

/**
 * User diary
 */
export async function getDiaryEntries(userId, date) {
  const q = query(
    diaryRef(userId),
    where('date', '==', date),
    orderBy('meal', 'asc')
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function getDiaryEntriesInRange(userId, startDate, endDate) {
  const q = query(
    diaryRef(userId),
    where('date', '>=', startDate),
    where('date', '<=', endDate),
    orderBy('date', 'asc'),
    orderBy('meal', 'asc')
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
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
    calories: data.calories ?? null,
    protein: data.protein ?? null,
    carbs: data.carbs ?? null,
    fat: data.fat ?? null,
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

export async function deleteDiaryEntry(userId, entryId) {
  await deleteDoc(doc(firestore, 'users', userId, 'nutrition', 'diary', entryId));
}

export default {
  getMealsByCreator,
  getMealById,
  createMeal,
  updateMeal,
  deleteMeal,
  getPlansByCreator,
  getPlanById,
  createPlan,
  updatePlan,
  deletePlan,
  getAssignmentsByUser,
  getAssignmentsByCreator,
  getAssignmentById,
  createAssignment,
  updateAssignment,
  deleteAssignment,
  getDiaryEntries,
  getDiaryEntriesInRange,
  addDiaryEntry,
  deleteDiaryEntry,
};
