import { collection, doc, getDoc, setDoc, getDocs, query, where, orderBy, serverTimestamp } from 'firebase/firestore';
import { firestore } from '../config/firebase';
import logger from '../utils/logger';

const COLLECTION = 'readiness';

function readinessRef(userId) {
  return collection(firestore, 'users', userId, COLLECTION);
}

/**
 * Get today's readiness doc. Returns null if none logged yet.
 */
export async function getTodayReadiness(userId, dateStr) {
  try {
    const snap = await getDoc(doc(firestore, 'users', userId, COLLECTION, dateStr));
    return snap.exists() ? { id: snap.id, ...snap.data() } : null;
  } catch (err) {
    logger.error('[readinessService] getTodayReadiness', err?.message);
    return null;
  }
}

/**
 * Save readiness for a given date. Overwrites if already exists.
 */
export async function saveReadiness(userId, dateStr, { energy, soreness, sleep }) {
  const ref = doc(firestore, 'users', userId, COLLECTION, dateStr);
  await setDoc(ref, {
    userId,
    date: dateStr,
    energy: Number(energy),
    soreness: Number(soreness),
    sleep: Number(sleep),
    completedAt: serverTimestamp(),
  });
}

/**
 * Get readiness entries in a date range (inclusive).
 * Returns array sorted ascending by date.
 */
export async function getReadinessInRange(userId, startDateStr, endDateStr) {
  try {
    const q = query(
      readinessRef(userId),
      where('date', '>=', startDateStr),
      where('date', '<=', endDateStr),
      orderBy('date', 'asc')
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (err) {
    logger.error('[readinessService] getReadinessInRange', err?.message);
    return [];
  }
}
