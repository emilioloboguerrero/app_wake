import { collection, doc, getDoc, setDoc, getDocs, query, where, orderBy, serverTimestamp } from 'firebase/firestore';
import { firestore } from '../config/firebase';
import logger from '../utils/logger';

const COLLECTION = 'readiness';

function readinessRef(userId) {
  return collection(firestore, 'users', userId, COLLECTION);
}

function transformReadinessData(raw, id) {
  if (!raw) return raw;
  const data = { ...(id ? { id } : {}), ...raw };
  if (typeof raw.soreness === 'number') {
    data.soreness = 11 - raw.soreness;
  }
  return data;
}

/**
 * Get today's readiness doc. Returns null if none logged yet.
 */
export async function getTodayReadiness(userId, dateStr) {
  try {
    const snap = await getDoc(doc(firestore, 'users', userId, COLLECTION, dateStr));
    if (!snap.exists()) return null;
    const raw = snap.data();
    return transformReadinessData(raw, snap.id);
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
  const numericSoreness = Number(soreness);
  await setDoc(ref, {
    userId,
    date: dateStr,
    energy: Number(energy),
    // Store soreness internally as 1 = fresco, 10 = muy adolorido (legacy),
    // but expose it through the service as 1 = peor, 10 = mejor para los músculos.
    soreness: Number.isFinite(numericSoreness) ? (11 - numericSoreness) : null,
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
    return snap.docs.map((d) => transformReadinessData(d.data(), d.id));
  } catch (err) {
    logger.error('[readinessService] getReadinessInRange', err?.message);
    return [];
  }
}
