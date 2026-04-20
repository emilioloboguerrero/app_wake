import apiClient from '../utils/apiClient';

class EventService {
  makeDateTimestamp(dateStr) {
    if (!dateStr) return null;
    return new Date(dateStr + 'T00:00:00').toISOString();
  }

  async getEventsByCreator(_creatorId) {
    const result = await apiClient.get('/creator/events');
    const events = (result?.data ?? []).map((e) => ({ id: e.eventId, ...e }));
    return events;
  }

  async getEvent(eventId) {
    try {
      const result = await apiClient.get(`/creator/events/${eventId}`);
      if (!result?.data) return null;
      return { id: result.data.eventId, ...result.data };
    } catch (error) {
      if (error?.status === 404) return null;
      throw error;
    }
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
    const all = [];
    let pageToken = opts.pageToken ?? null;
    const params = {};
    if (opts.checkedIn != null) params.checkedIn = opts.checkedIn;
    do {
      if (pageToken) params.pageToken = pageToken;
      const result = await apiClient.get(`/creator/events/${eventId}/registrations`, { params });
      const page = result?.data ?? [];
      all.push(...page.map((r) => ({ id: r.registrationId, ...r })));
      pageToken = result?.nextPageToken ?? null;
    } while (pageToken);
    return all;
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

  async removeCheckIn(eventId, regId) {
    const result = await apiClient.delete(
      `/creator/events/${eventId}/registrations/${regId}/check-in`
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
