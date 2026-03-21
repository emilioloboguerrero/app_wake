'use strict';

const { defineSuite } = require('../suite');
const { assertOk, assertErrorCode, assertHasFields, assert204, assertStatus } = require('../assert');

module.exports = defineSuite('Events', ({ test, api, creatorApi, noAuthApi, ctx }) => {

  // --- Creator event management ---

  test('GET /creator/events — returns list', async () => {
    const res = await creatorApi.get('/creator/events');
    assertOk(res);
    if (!Array.isArray(res.data.data)) throw new Error('Expected array');
  });

  test('POST /creator/events — create event', async () => {
    const res = await creatorApi.post('/creator/events', {
      body: {
        title: 'Test Event (API test)',
        date: new Date(Date.now() + 7 * 86400000).toISOString(),
        location: 'Bogotá',
        maxRegistrations: 50,
        fields: [
          { fieldName: 'Teléfono', fieldType: 'text', required: true },
        ],
      },
    });
    assertOk(res);
    assertHasFields(res.data.data, ['eventId'], 'create event');
    ctx.createdIds.eventId = res.data.data.eventId;
  });

  test('PATCH /creator/events/{id} — update event', async () => {
    if (!ctx.createdIds.eventId) throw new Error('No event');
    const res = await creatorApi.patch(`/creator/events/${ctx.createdIds.eventId}`, {
      body: { title: 'Test Event Updated' },
    });
    assertOk(res);
  });

  test('PATCH /creator/events/{id}/status — activate event', async () => {
    if (!ctx.createdIds.eventId) throw new Error('No event');
    const res = await creatorApi.patch(`/creator/events/${ctx.createdIds.eventId}/status`, {
      body: { status: 'active' },
    });
    assertOk(res);
  });

  // --- Public event access (auth middleware intercepts /v1, so use authenticated client) ---

  test('GET /events/{id} — get event detail', async () => {
    if (!ctx.createdIds.eventId) throw new Error('No event');
    const res = await api.get(`/events/${ctx.createdIds.eventId}`);
    assertOk(res);
    assertHasFields(res.data.data, ['eventId', 'title', 'status'], 'event detail');
  });

  // --- Registration ---

  test('POST /events/{id}/register — register for event', async () => {
    if (!ctx.createdIds.eventId) throw new Error('No event');
    const res = await api.post(`/events/${ctx.createdIds.eventId}/register`, {
      body: {
        email: 'testregistrant@test.com',
        displayName: 'Test Registrant',
        fieldValues: {},
      },
    });
    assertStatus(res, 201);
    assertHasFields(res.data.data, ['registrationId', 'status'], 'registration');
    ctx.createdIds.registrationId = res.data.data.registrationId;
  });

  test('POST /events/{id}/register — duplicate email → 409 or 201', async () => {
    if (!ctx.createdIds.eventId) throw new Error('No event');
    const res = await api.post(`/events/${ctx.createdIds.eventId}/register`, {
      body: { email: 'testregistrant@test.com', fieldValues: {} },
    });
    // API does not deduplicate by email — a second registration may succeed
    if (res.status === 201) {
      assertHasFields(res.data.data, ['registrationId', 'status'], 'second registration');
    } else if (res.status === 409) {
      assertErrorCode(res, 'ALREADY_REGISTERED');
    } else {
      throw new Error(`Unexpected status ${res.status}`);
    }
  });

  // --- Creator views registrations ---

  test('GET /creator/events/{id}/registrations — list registrations', async () => {
    if (!ctx.createdIds.eventId) throw new Error('No event');
    const res = await creatorApi.get(`/creator/events/${ctx.createdIds.eventId}/registrations`);
    assertOk(res);
    if (!Array.isArray(res.data.data)) throw new Error('Expected array');
  });

  // --- Check-in ---

  test('POST .../registrations/{id}/check-in — check in attendee', async () => {
    if (!ctx.createdIds.registrationId) throw new Error('No registration');
    const res = await creatorApi.post(
      `/creator/events/${ctx.createdIds.eventId}/registrations/${ctx.createdIds.registrationId}/check-in`,
    );
    assertOk(res);
  });

  // --- Cleanup ---

  test('DELETE /creator/events/{id}/registrations/{id} — remove registration', async () => {
    if (!ctx.createdIds.registrationId) throw new Error('No registration');
    const res = await creatorApi.delete(
      `/creator/events/${ctx.createdIds.eventId}/registrations/${ctx.createdIds.registrationId}`,
    );
    assert204(res);
  });

  test('PATCH /creator/events/{id}/status — close event', async () => {
    if (!ctx.createdIds.eventId) throw new Error('No event');
    const res = await creatorApi.patch(`/creator/events/${ctx.createdIds.eventId}/status`, {
      body: { status: 'draft' },
    });
    assertOk(res);
  });

  test('DELETE /creator/events/{id} — delete event', async () => {
    if (!ctx.createdIds.eventId) throw new Error('No event');
    const res = await creatorApi.delete(`/creator/events/${ctx.createdIds.eventId}`);
    assert204(res);
  });
});
