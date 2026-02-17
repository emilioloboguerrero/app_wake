/**
 * Call bookings (creator side): list upcoming/past bookings.
 */

import { collection, query, where, orderBy, getDocs, doc, updateDoc } from 'firebase/firestore';
import { firestore } from '../config/firebase';

const COLLECTION = 'call_bookings';

/** Normalize timestamp field (string or Firestore Timestamp) to ISO string for consistency */
function toIsoString(value) {
  if (value == null) return null;
  if (typeof value === 'string') return value;
  if (typeof value.toDate === 'function') return value.toDate().toISOString();
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/**
 * @param {string} creatorId
 * @param {{ fromDate?: string, toDate?: string, status?: 'scheduled'|'cancelled' }} [opts]
 * @returns {Promise<Array<{ id: string, creatorId: string, clientUserId: string, courseId?: string, slotStartUtc: string, slotEndUtc: string, status: string, createdAt: string, clientDisplayName?: string }>>}
 */
export async function getBookingsForCreator(creatorId, opts = {}) {
  const q = query(
    collection(firestore, COLLECTION),
    where('creatorId', '==', creatorId),
    orderBy('slotStartUtc', 'asc')
  );
  const snap = await getDocs(q);
  let list = snap.docs.map((d) => {
    const data = d.data();
    return {
      id: d.id,
      ...data,
      slotStartUtc: toIsoString(data.slotStartUtc) ?? data.slotStartUtc,
      slotEndUtc: toIsoString(data.slotEndUtc) ?? data.slotEndUtc,
    };
  });

  if (opts.status) {
    const statusLower = String(opts.status).toLowerCase();
    list = list.filter((b) => (b.status || '').toLowerCase() === statusLower);
  }
  if (opts.fromDate) {
    list = list.filter((b) => b.slotStartUtc >= opts.fromDate);
  }
  if (opts.toDate) {
    list = list.filter((b) => b.slotStartUtc <= opts.toDate);
  }
  return list;
}

/**
 * Update the call link for a booking.
 * @param {string} bookingId
 * @param {string} callLink - URL for the call (e.g. Meet, Zoom)
 * @returns {Promise<void>}
 */
export async function updateBookingCallLink(bookingId, callLink) {
  const ref = doc(firestore, COLLECTION, bookingId);
  await updateDoc(ref, {
    callLink: callLink?.trim() || null,
    callLinkUpdatedAt: new Date().toISOString(),
  });
}
