import apiClient from '../utils/apiClient';

class EventService {
  makeDateTimestamp(dateStr) {
    if (!dateStr) return null;
    return new Date(dateStr + 'T00:00:00').toISOString();
  }

  async getEventsByCreator(_creatorId) {
    const result = await apiClient.get('/creator/events');
    return (result?.data ?? []).map((e) => ({ id: e.eventId, ...e }));
  }

  async getEvent(eventId) {
    const events = await this.getEventsByCreator();
    const found = events.find((e) => e.eventId === eventId || e.id === eventId);
    return found ?? null;
  }

  async createEvent(_clientGeneratedId, eventData) {
    const result = await apiClient.post('/creator/events', eventData);
    return result?.data;
  }

  async updateEvent(eventId, eventData) {
    const keys = Object.keys(eventData);
    if (keys.length === 1 && keys[0] === 'status') {
      const result = await apiClient.patch(`/creator/events/${eventId}/status`, {
        status: eventData.status,
      });
      return result?.data;
    }
    const result = await apiClient.patch(`/creator/events/${eventId}`, eventData);
    return result?.data;
  }

  async updateEventStatus(eventId, status) {
    const result = await apiClient.patch(`/creator/events/${eventId}/status`, { status });
    return result?.data;
  }

  async deleteEvent(eventId) {
    await apiClient.delete(`/creator/events/${eventId}`);
  }

  async getEventRegistrations(eventId, opts = {}) {
    const params = {};
    if (opts.checkedIn != null) params.checkedIn = opts.checkedIn;
    if (opts.pageToken) params.pageToken = opts.pageToken;
    const result = await apiClient.get(`/creator/events/${eventId}/registrations`, { params });
    return (result?.data ?? []).map((r) => ({ id: r.registrationId, ...r }));
  }

  async getEventWaitlist(eventId) {
    const result = await apiClient.get(`/creator/events/${eventId}/waitlist`);
    return (result?.data ?? []).map((r) => ({ id: r.waitlistId ?? r.registrationId ?? r.id, ...r }));
  }

  async checkInRegistration(eventId, regId) {
    const result = await apiClient.post(
      `/creator/events/${eventId}/registrations/${regId}/check-in`,
      {}
    );
    return result?.data;
  }

  async deleteRegistration(eventId, regId) {
    await apiClient.delete(`/creator/events/${eventId}/registrations/${regId}`);
  }

  async admitFromWaitlist(eventId, waitId) {
    const result = await apiClient.post(
      `/creator/events/${eventId}/waitlist/${waitId}/admit`,
      {}
    );
    return result?.data;
  }

  async checkInByToken(eventId, token) {
    const result = await apiClient.post(
      `/creator/events/${eventId}/checkin-by-token`,
      { token }
    );
    return result?.data;
  }
}

export default new EventService();
