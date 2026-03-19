/**
 * Call booking (PWA): get available slots for a creator, create a booking.
 * Slots are fetched when the booking modal opens (real-time availability).
 */

import apiClient from '../utils/apiClient';

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
  const startDate = fromDate || `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const endDate = toDate || (() => {
    const d = new Date(today);
    d.setDate(d.getDate() + 14);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  })();

  const res = await apiClient.get(`/creator/${creatorId}/availability`, { params: { startDate, endDate } });
  const days = res.data.days ?? {};

  const slotsByDate = {};
  for (const [date, dayData] of Object.entries(days)) {
    const slots = (dayData.availableSlots ?? []).map(s => ({
      startUtc: s.startUtc,
      endUtc: s.endUtc,
      durationMinutes: s.durationMinutes,
    }));
    if (slots.length > 0) {
      slotsByDate[date] = slots;
    }
  }

  const dates = Object.keys(slotsByDate).sort();
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
  try {
    const res = await apiClient.post('/bookings', {
      creatorId,
      slotStartUtc,
      slotEndUtc,
      courseId: courseId || null,
    });
    return { success: true, bookingId: res.data.bookingId };
  } catch (e) {
    return { success: false, error: e?.message || 'Este horario ya no está disponible.' };
  }
}

/**
 * Get all upcoming (scheduled, not yet passed) call bookings for a user.
 * Used by MainScreen to show "upcoming call" cards.
 * @param {string} clientUserId
 * @returns {Promise<Array<{ id: string, creatorId: string, clientUserId: string, courseId: string | null, slotStartUtc: string, slotEndUtc: string }>>}
 */
export async function getUpcomingBookingsForUser(clientUserId) {
  if (!clientUserId) return [];
  const result = await apiClient.get('/bookings');
  return result?.data ?? [];
}

export async function getBookingForUser(creatorId, clientUserId, courseId) {
  if (!clientUserId || !courseId) return null;
  const result = await apiClient.get('/bookings', { params: { creatorId, courseId, clientUserId } });
  return result?.data ?? null;
}

/**
 * Get a single booking by ID. Used when loading UpcomingCallDetail from direct URL.
 * @param {string} bookingId
 * @returns {Promise<{ id: string, creatorId: string, clientUserId: string, courseId: string | null, slotStartUtc: string, slotEndUtc: string, callLink: string | null } | null>}
 */
export async function getBookingById(bookingId) {
  if (!bookingId) return null;
  try {
    const res = await apiClient.get(`/bookings/${bookingId}`);
    const d = res.data;
    return {
      id: d.bookingId,
      creatorId: d.creatorId,
      clientUserId: d.clientUserId ?? null,
      courseId: d.courseId ?? null,
      slotStartUtc: d.slotStartUtc,
      slotEndUtc: d.slotEndUtc,
      callLink: d.callLink ?? null,
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
    await apiClient.delete(`/bookings/${bookingId}`);
    return { success: true };
  } catch (e) {
    return { success: false, error: e?.message || 'No se pudo cancelar la reserva.' };
  }
}
