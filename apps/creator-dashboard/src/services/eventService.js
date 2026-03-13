import { firestore } from '../config/firebase';
import {
  collection, query, where, getDocs, doc, getDoc, setDoc, updateDoc, deleteDoc, orderBy, serverTimestamp, increment
} from 'firebase/firestore';

class EventService {
  async getEventsByCreator(creatorId) {
    const snap = await getDocs(query(
      collection(firestore, 'events'),
      where('creator_id', '==', creatorId),
      orderBy('created_at', 'desc')
    ));
    const events = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    await Promise.all(events.map(async ev => {
      const regSnap = await getDocs(collection(firestore, 'event_signups', ev.id, 'registrations'));
      ev.registration_count = regSnap.size;
    }));
    return events;
  }

  async getEvent(eventId) {
    const snap = await getDoc(doc(firestore, 'events', eventId));
    return snap.exists() ? { id: snap.id, ...snap.data() } : null;
  }

  async createEvent(eventId, eventData) {
    await setDoc(doc(firestore, 'events', eventId), eventData);
  }

  async updateEvent(eventId, eventData) {
    await updateDoc(doc(firestore, 'events', eventId), eventData);
  }

  async deleteEvent(eventId) {
    await deleteDoc(doc(firestore, 'events', eventId));
  }

  async getEventRegistrations(eventId) {
    const snap = await getDocs(query(
      collection(firestore, 'event_signups', eventId, 'registrations'),
      orderBy('created_at', 'desc')
    ));
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  }

  async getEventWaitlist(eventId) {
    const snap = await getDocs(query(
      collection(firestore, 'event_signups', eventId, 'waitlist'),
      orderBy('created_at', 'desc')
    ));
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  }

  async updateRegistration(eventId, regId, data) {
    await updateDoc(doc(firestore, 'event_signups', eventId, 'registrations', regId), data);
  }

  async deleteRegistration(eventId, regId) {
    await deleteDoc(doc(firestore, 'event_signups', eventId, 'registrations', regId));
  }

  async admitFromWaitlist(eventId, waitId, hasCapacity) {
    await deleteDoc(doc(firestore, 'event_signups', eventId, 'waitlist', waitId));
    if (hasCapacity) {
      await updateDoc(doc(firestore, 'events', eventId), { max_registrations: increment(1) });
    }
  }
}

export default new EventService();
