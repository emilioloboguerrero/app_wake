/**
 * Creator availability (time slots for calls).
 * Firestore: creator_availability/{creatorId} = { timezone, days: { [dateStr]: { slots: [{ startUtc, endUtc, durationMinutes }] } } }
 * All slot times stored as ISO strings (UTC).
 */

import { doc, getDoc, setDoc } from 'firebase/firestore';
import { firestore } from '../config/firebase';

const COLLECTION = 'creator_availability';

/**
 * Get creator timezone (e.g. "America/Bogota"). Defaults to browser timezone.
 */
export function getCreatorTimezone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch (_) {
    return 'UTC';
  }
}

/**
 * @param {string} creatorId
 * @returns {Promise<{ timezone: string, days: Record<string, { slots: Array<{ startUtc: string, endUtc: string, durationMinutes: number }> }> }>}
 */
export async function getAvailability(creatorId) {
  const ref = doc(firestore, COLLECTION, creatorId);
  const snap = await getDoc(ref);
  const data = snap.exists() ? snap.data() : null;
  return {
    timezone: data?.timezone || getCreatorTimezone(),
    days: data?.days || {},
  };
}

/**
 * Get slots for a single day.
 * @param {string} creatorId
 * @param {string} dateStr - YYYY-MM-DD (in creator timezone for that day)
 */
export async function getDaySlots(creatorId, dateStr) {
  const avail = await getAvailability(creatorId);
  const day = avail.days[dateStr];
  return (day?.slots || []).slice();
}

/**
 * Set timezone for creator (used when adding slots).
 * @param {string} creatorId
 * @param {string} timezone - IANA timezone
 */
export async function setTimezone(creatorId, timezone) {
  const ref = doc(firestore, COLLECTION, creatorId);
  const snap = await getDoc(ref);
  const existing = snap.exists() ? snap.data() : {};
  await setDoc(ref, {
    ...existing,
    timezone: timezone || getCreatorTimezone(),
    updatedAt: new Date().toISOString(),
  });
}

/**
 * Set slots for a single day. Replaces any existing slots for that day.
 * @param {string} creatorId
 * @param {string} dateStr - YYYY-MM-DD
 * @param {Array<{ startUtc: string, endUtc: string, durationMinutes: number }>} slots
 * @param {string} [timezone] - creator timezone (saved on doc if provided)
 */
export async function setDaySlots(creatorId, dateStr, slots, timezone) {
  const ref = doc(firestore, COLLECTION, creatorId);
  const snap = await getDoc(ref);
  const existing = snap.exists() ? snap.data() : {};
  const tz = timezone || existing.timezone || getCreatorTimezone();
  const days = { ...(existing.days || {}) };
  if (slots.length === 0) {
    delete days[dateStr];
  } else {
    days[dateStr] = { slots };
  }
  await setDoc(ref, {
    timezone: tz,
    days,
    updatedAt: new Date().toISOString(),
  });
}

/**
 * Add slots for a day from a time range and granularity (creator choice).
 * Uses creator's browser local time (dashboard runs in creator TZ) to build UTC.
 * @param {string} creatorId
 * @param {string} dateStr - YYYY-MM-DD
 * @param {number} startMinutes - minutes from midnight (e.g. 9*60 = 9:00)
 * @param {number} endMinutes - minutes from midnight (e.g. 12*60 = 12:00)
 * @param {number} durationMinutes - e.g. 15, 30, 60
 * @param {string} [timezone] - stored on doc for display elsewhere
 * @returns {Promise<number>} number of slots added
 */
export async function addSlotsForDay(creatorId, dateStr, startMinutes, endMinutes, durationMinutes, timezone) {
  const avail = await getAvailability(creatorId);
  const tz = timezone || avail.timezone || getCreatorTimezone();

  const [y, m, d] = dateStr.split('-').map(Number);
  const slots = [];
  for (let mins = startMinutes; mins + durationMinutes <= endMinutes; mins += durationMinutes) {
    const hour = Math.floor(mins / 60);
    const min = mins % 60;
    // Creator's browser is in their TZ; Date(y, m-1, d, h, min) = that local moment
    const startDate = new Date(y, m - 1, d, hour, min);
    const startUtc = startDate.toISOString();
    const endDate = new Date(startDate.getTime() + durationMinutes * 60 * 1000);
    const endUtc = endDate.toISOString();
    slots.push({ startUtc, endUtc, durationMinutes });
  }

  await setDaySlots(creatorId, dateStr, slots, tz);
  return slots.length;
}

export default {
  getCreatorTimezone,
  getAvailability,
  getDaySlots,
  setTimezone,
  setDaySlots,
  addSlotsForDay,
};
