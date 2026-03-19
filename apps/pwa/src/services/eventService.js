import apiClient from '../utils/apiClient';
import { firestore } from '../config/firebase';
import {
  collection,
  query,
  where,
  getDocs,
  updateDoc,
  doc,
  serverTimestamp,
} from 'firebase/firestore';

class EventService {
  async getEvent(eventId) {
    const res = await apiClient.get(`/events/${eventId}`);
    const d = res.data;
    return { id: d.eventId, ...d };
  }

  async getRegistrations(eventId) {
    const res = await apiClient.get(`/creator/events/${eventId}/registrations`);
    return res.data.map(r => ({ id: r.registrationId, ...r }));
  }

  async getWaitlist(eventId) {
    const res = await apiClient.get(`/creator/events/${eventId}/waitlist`);
    return res.data.map(r => ({ id: r.registrationId, ...r }));
  }

  // TODO: no endpoint for checkInByToken
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
    await apiClient.post(`/creator/events/${eventId}/registrations/${regId}/check-in`);
  }

  async deleteRegistration(eventId, regId) {
    await apiClient.delete(`/creator/events/${eventId}/registrations/${regId}`);
  }

  async getEventsByCreator(_creatorId) {
    const res = await apiClient.get('/creator/events');
    return res.data.map(e => ({ id: e.eventId, ...e }));
  }

  async updateEventStatus(eventId, status) {
    await apiClient.patch(`/creator/events/${eventId}/status`, { status });
  }
}

export default new EventService();
