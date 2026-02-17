/**
 * Call booking (PWA): get available slots for a creator, create a booking.
 * Slots are fetched when the booking modal opens (real-time availability).
 */

import { collection, query, where, getDocs, addDoc, updateDoc, doc } from 'firebase/firestore';
import { firestore } from '../config/firebase';
import { getDoc } from 'firebase/firestore';

const AVAILABILITY_COLLECTION = 'creator_availability';
const BOOKINGS_COLLECTION = 'call_bookings';

/**
 * Get available slots for a creator in a date range (next 2 weeks).
 * Only returns dates that have at least one free slot.
 * @param {string} creatorId
 * @param {string} [fromDate] - ISO date YYYY-MM-DD (default: today)
 * @param {string} [toDate] - ISO date YYYY-MM-DD (default: today + 14 days)
 * @returns {Promise<{ dates: string[], slotsByDate: Record<string, Array<{ startUtc: string, endUtc: string, durationMinutes: number }>> }>}
 */
export async function getAvailableSlots(creatorId, fromDate, toDate) {
  const today = new Date();
  const fromStr = fromDate || `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const from = new Date(fromStr.slice(0, 4), Number(fromStr.slice(5, 7)) - 1, fromStr.slice(8, 10), 0, 0, 0, 0);
  const to = toDate
    ? new Date(Number(toDate.slice(0, 4)), Number(toDate.slice(5, 7)) - 1, Number(toDate.slice(8, 10)), 23, 59, 59, 999)
    : (() => {
        const d = new Date(today);
        d.setDate(d.getDate() + 14);
        d.setHours(23, 59, 59, 999);
        return d;
      })();

  const availRef = doc(firestore, AVAILABILITY_COLLECTION, creatorId);
  const availSnap = await getDoc(availRef);
  const availData = availSnap.exists() ? availSnap.data() : {};
  const days = availData.days || {};

  const bookingsSnap = await getDocs(
    query(
      collection(firestore, BOOKINGS_COLLECTION),
      where('creatorId', '==', creatorId),
      where('status', '==', 'scheduled')
    )
  );
  const booked = new Set();
  bookingsSnap.docs.forEach((d) => {
    const data = d.data();
    booked.add(data.slotStartUtc);
  });

  const slotsByDate = {};
  const dateSet = new Set();
  const nowMs = Date.now();

  Object.entries(days).forEach(([dateStr, dayData]) => {
    const slotStarts = (dayData.slots || [])
      .filter((s) => {
        const startMs = new Date(s.startUtc).getTime();
        return startMs >= from.getTime() && startMs <= to.getTime() && startMs > nowMs && !booked.has(s.startUtc);
      })
      .map((s) => ({ startUtc: s.startUtc, endUtc: s.endUtc, durationMinutes: s.durationMinutes || 30 }));

    if (slotStarts.length > 0) {
      slotsByDate[dateStr] = slotStarts;
      dateSet.add(dateStr);
    }
  });

  const dates = Array.from(dateSet).sort();
  return { dates, slotsByDate };
}

/**
 * Create a booking. Fails if slot is already taken.
 * @param {string} creatorId
 * @param {string} clientUserId
 * @param {string} slotStartUtc - ISO string
 * @param {string} slotEndUtc - ISO string
 * @param {string} [courseId]
 * @returns {Promise<{ success: boolean, bookingId?: string, error?: string }>}
 */
export async function createBooking(creatorId, clientUserId, slotStartUtc, slotEndUtc, courseId) {
  const bookingsRef = collection(firestore, BOOKINGS_COLLECTION);
  const existing = await getDocs(
    query(
      collection(firestore, BOOKINGS_COLLECTION),
      where('creatorId', '==', creatorId),
      where('slotStartUtc', '==', slotStartUtc),
      where('status', '==', 'scheduled')
    )
  );
  if (!existing.empty) {
    return { success: false, error: 'Este horario ya no está disponible.' };
  }

  const docRef = await addDoc(bookingsRef, {
    creatorId,
    clientUserId,
    courseId: courseId || null,
    slotStartUtc,
    slotEndUtc,
    status: 'scheduled',
    createdAt: new Date().toISOString(),
  });
  return { success: true, bookingId: docRef.id };
}

/**
 * Get all upcoming (scheduled, not yet passed) call bookings for a user.
 * Used by MainScreen to show "upcoming call" cards.
 * @param {string} clientUserId
 * @returns {Promise<Array<{ id: string, creatorId: string, clientUserId: string, courseId: string | null, slotStartUtc: string, slotEndUtc: string }>>}
 */
export async function getUpcomingBookingsForUser(clientUserId) {
  if (!clientUserId) return [];
  const now = new Date().toISOString();
  const snap = await getDocs(
    query(
      collection(firestore, BOOKINGS_COLLECTION),
      where('clientUserId', '==', clientUserId),
      where('status', '==', 'scheduled')
    )
  );
  const list = [];
  snap.docs.forEach((d) => {
    const data = d.data();
    if (data.slotEndUtc > now) {
      list.push({
        id: d.id,
        creatorId: data.creatorId,
        clientUserId: data.clientUserId,
        courseId: data.courseId ?? null,
        slotStartUtc: data.slotStartUtc,
        slotEndUtc: data.slotEndUtc,
        callLink: data.callLink && String(data.callLink).trim() ? String(data.callLink).trim() : null,
      });
    }
  });
  // Sort by slot start ascending (soonest first)
  list.sort((a, b) => (a.slotStartUtc < b.slotStartUtc ? -1 : 1));
  return list;
}

/**
 * Get the user's current upcoming booking for a course (scheduled, not yet passed).
 * @param {string} creatorId
 * @param {string} clientUserId
 * @param {string} courseId
 * @returns {Promise<{ id: string, slotStartUtc: string, slotEndUtc: string, creatorId: string, courseId: string } | null>}
 */
export async function getBookingForUser(creatorId, clientUserId, courseId) {
  if (!clientUserId || !courseId) return null;
  const now = new Date().toISOString();
  const snap = await getDocs(
    query(
      collection(firestore, BOOKINGS_COLLECTION),
      where('clientUserId', '==', clientUserId),
      where('courseId', '==', courseId),
      where('status', '==', 'scheduled')
    )
  );
  for (const d of snap.docs) {
    const data = d.data();
    if (data.slotEndUtc > now) {
      return {
        id: d.id,
        creatorId: data.creatorId,
        clientUserId: data.clientUserId,
        courseId: data.courseId,
        slotStartUtc: data.slotStartUtc,
        slotEndUtc: data.slotEndUtc,
        callLink: data.callLink && String(data.callLink).trim() ? String(data.callLink).trim() : null,
      };
    }
  }
  return null;
}

/**
 * Get a single booking by ID. Used when loading UpcomingCallDetail from direct URL.
 * @param {string} bookingId
 * @returns {Promise<{ id: string, creatorId: string, clientUserId: string, courseId: string | null, slotStartUtc: string, slotEndUtc: string, callLink: string | null } | null>}
 */
export async function getBookingById(bookingId) {
  if (!bookingId) return null;
  try {
    const ref = doc(firestore, BOOKINGS_COLLECTION, bookingId);
    const snap = await getDoc(ref);
    if (!snap.exists()) return null;
    const data = snap.data();
    if (data.status !== 'scheduled') return null;
    const now = new Date().toISOString();
    if (data.slotEndUtc <= now) return null;
    return {
      id: snap.id,
      creatorId: data.creatorId,
      clientUserId: data.clientUserId,
      courseId: data.courseId ?? null,
      slotStartUtc: data.slotStartUtc,
      slotEndUtc: data.slotEndUtc,
      callLink: data.callLink && String(data.callLink).trim() ? String(data.callLink).trim() : null,
    };
  } catch {
    return null;
  }
}

/**
 * Cancel a booking (frees the slot for others).
 * @param {string} bookingId
 * @returns {Promise<{ success: boolean, error?: string }>}
 */
export async function cancelBooking(bookingId) {
  if (!bookingId) return { success: false, error: 'ID de reserva inválido.' };
  try {
    const ref = doc(firestore, BOOKINGS_COLLECTION, bookingId);
    await updateDoc(ref, { status: 'cancelled' });
    return { success: true };
  } catch (e) {
    return { success: false, error: e?.message || 'No se pudo cancelar la reserva.' };
  }
}
