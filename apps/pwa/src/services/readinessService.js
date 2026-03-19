import apiClient from '../utils/apiClient';
import logger from '../utils/logger';

/**
 * Get today's readiness doc. Returns null if none logged yet.
 */
export async function getTodayReadiness(userId, dateStr) {
  try {
    const res = await apiClient.get(`/progress/readiness/${dateStr}`);
    return res?.data ?? null;
  } catch (err) {
    if (err.code === 'NOT_FOUND') return null;
    logger.error('[readinessService] getTodayReadiness', err?.message);
    return null;
  }
}

/**
 * Save readiness for a given date. Overwrites if already exists.
 */
export async function saveReadiness(userId, dateStr, { energy, soreness, sleep }) {
  await apiClient.put(`/progress/readiness/${dateStr}`, {
    energy: Number(energy),
    soreness: Number(soreness),
    sleep: Number(sleep),
  });
}

/**
 * Get readiness entries in a date range (inclusive).
 * Returns array sorted ascending by date.
 */
export async function getReadinessInRange(userId, startDateStr, endDateStr) {
  try {
    const res = await apiClient.get('/progress/readiness', {
      params: { startDate: startDateStr, endDate: endDateStr },
    });
    return res?.data ?? [];
  } catch (err) {
    logger.error('[readinessService] getReadinessInRange', err?.message);
    return [];
  }
}
