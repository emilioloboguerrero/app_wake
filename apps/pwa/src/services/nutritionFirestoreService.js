/**
 * Nutrition Firestore service — user diary, assignments, plan (read).
 * Paths: nutrition_assignments, client_nutrition_plan_content, users/{userId}/nutrition/diary, creator_nutrition_library/{creatorId}/plans
 * Resolution: for a user's plan, prefer client_nutrition_plan_content (assignment copy) over library plan.
 */
import {
  collection,
  doc,
  getDocs,
  getDoc,
  addDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  serverTimestamp,
} from 'firebase/firestore';
import { firestore } from '../config/firebase';

const PLANS = 'plans';
const CLIENT_NUTRITION_PLAN_CONTENT = 'client_nutrition_plan_content';

function planRef(creatorId, planId) {
  return doc(firestore, 'creator_nutrition_library', creatorId, PLANS, planId);
}

function assignmentsRef() {
  return collection(firestore, 'nutrition_assignments');
}

function diaryRef(userId) {
  return collection(firestore, 'users', userId, 'nutrition', 'diary');
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
  const today = date ? new Date(date) : new Date();
  today.setHours(0, 0, 0, 0);
  for (const a of assignments) {
    const start = parseAssignmentDate(a.startDate);
    const end = parseAssignmentDate(a.endDate);
    if (start && start > today) continue;
    if (end && end < today) continue;
    return a;
  }
  return assignments[0] || null;
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
    return { plan: copy, assignment };
  }
  const snapshot = assignment.plan && typeof assignment.plan === 'object'
    ? { id: assignment.planId, ...assignment.plan }
    : null;
  return { plan: snapshot, assignment };
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
  getAssignmentsByUser,
  getPlanById,
  getClientNutritionPlanContent,
  getEffectivePlanForUser,
  getDiaryEntries,
  addDiaryEntry,
  deleteDiaryEntry,
};
