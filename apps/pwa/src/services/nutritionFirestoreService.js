/**
 * Nutrition Firestore service — user diary, assignments, plan (read).
 * Paths: nutrition_assignments, users/{userId}/nutrition/diary, creator_nutrition_library/{creatorId}/plans
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
  getDiaryEntries,
  addDiaryEntry,
  deleteDiaryEntry,
};
