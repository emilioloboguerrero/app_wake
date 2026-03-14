import { firestore } from '../config/firebase';
import {
  doc,
  getDoc,
  collection,
  query,
  where,
  orderBy,
  getDocs,
  updateDoc,
  deleteDoc,
  serverTimestamp,
} from 'firebase/firestore';

class EventService {
  async getEvent(eventId) {
    const snap = await getDoc(doc(firestore, 'events', eventId));
    if (!snap.exists()) return null;
    return { id: snap.id, ...snap.data() };
  }

  async getRegistrations(eventId) {
    const snap = await getDocs(
      query(
        collection(firestore, 'event_signups', eventId, 'registrations'),
        orderBy('created_at', 'desc')
      )
    );
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  }

  async getWaitlist(eventId) {
    const snap = await getDocs(
      query(
        collection(firestore, 'event_signups', eventId, 'waitlist'),
        orderBy('created_at', 'desc')
      )
    );
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  }

  async checkInByToken(eventId, token) {
    const snap = await getDocs(
      query(
        collection(firestore, 'event_signups', eventId, 'registrations'),
        where('check_in_token', '==', token)
      )
    );
    if (snap.empty) return { status: 'invalid' };
    const regDoc = snap.docs[0];
    const reg = { id: regDoc.id, ...regDoc.data() };
    if (reg.checked_in) return { status: 'already', reg };
    await updateDoc(doc(firestore, 'event_signups', eventId, 'registrations', regDoc.id), {
      checked_in: true,
      checked_in_at: serverTimestamp(),
    });
    return { status: 'success', reg };
  }

  async manualCheckIn(eventId, regId) {
    await updateDoc(doc(firestore, 'event_signups', eventId, 'registrations', regId), {
      checked_in: true,
      checked_in_at: serverTimestamp(),
    });
  }

  async deleteRegistration(eventId, regId) {
    await deleteDoc(doc(firestore, 'event_signups', eventId, 'registrations', regId));
  }

  async getEventsByCreator(creatorId) {
    const snap = await getDocs(
      query(
        collection(firestore, 'events'),
        where('creator_id', '==', creatorId),
        orderBy('created_at', 'desc')
      )
    );
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  }

  async updateEventStatus(eventId, status) {
    await updateDoc(doc(firestore, 'events', eventId), { status });
  }
}

export default new EventService();
