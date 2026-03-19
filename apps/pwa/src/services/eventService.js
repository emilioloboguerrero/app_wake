import apiClient from '../utils/apiClient';

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

  async checkInByToken(eventId, token) {
    const result = await apiClient.post(`/events/${eventId}/check-in-by-token`, { token });
    return result?.data ?? null;
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
