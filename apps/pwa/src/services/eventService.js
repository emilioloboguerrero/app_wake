import apiClient from '../utils/apiClient';

class EventService {
  async getEvent(eventId) {
    const res = await apiClient.get(`/events/${eventId}`);
    const d = res.data;
    return { id: d.eventId, ...d };
  }

  async #fetchAllPages(basePath) {
    const all = [];
    let pageToken = null;
    do {
      const qs = pageToken ? `?pageToken=${encodeURIComponent(pageToken)}` : '';
      const res = await apiClient.get(`${basePath}${qs}`);
      all.push(...res.data.map(r => ({ id: r.registrationId, ...r })));
      pageToken = res.nextPageToken || null;
    } while (pageToken);
    return all;
  }

  async getRegistrations(eventId) {
    return this.#fetchAllPages(`/creator/events/${eventId}/registrations`);
  }

  async getWaitlist(eventId) {
    return this.#fetchAllPages(`/creator/events/${eventId}/waitlist`);
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
