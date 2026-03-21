'use strict';

const { defineSuite } = require('../suite');
const { assertOk, assertErrorCode, assertHasFields, assert204 } = require('../assert');

module.exports = defineSuite('Bookings', ({ test, api, creatorApi, ctx }) => {

  // --- Creator availability ---

  test('GET /creator/availability — returns availability', async () => {
    const res = await creatorApi.get('/creator/availability');
    assertOk(res);
    assertHasFields(res.data.data, ['days'], 'availability');
  });

  test('POST /creator/availability/slots — add slots', async () => {
    const testDate = ctx.isoDate(30); // 30 days from now
    const res = await creatorApi.post('/creator/availability/slots', {
      body: {
        date: testDate,
        startTime: '09:00',
        endTime: '12:00',
        durationMinutes: 30,
        timezone: 'America/Bogota',
      },
    });
    assertOk(res);
    assertHasFields(res.data.data, ['slotsCreated'], 'create slots');
    ctx.createdIds.availabilityDate = testDate;
  });

  test('DELETE /creator/availability/slots — remove slots', async () => {
    if (!ctx.createdIds.availabilityDate) throw new Error('No slots');
    const res = await creatorApi.delete('/creator/availability/slots', {
      body: { date: ctx.createdIds.availabilityDate, startUtc: null },
    });
    assert204(res);
  });

  // --- Creator bookings ---

  test('GET /creator/bookings — returns list', async () => {
    const res = await creatorApi.get('/creator/bookings');
    assertOk(res);
    if (!Array.isArray(res.data.data)) throw new Error('Expected array');
  });

  // --- Client-side availability ---

  test('GET /creator/{creatorId}/availability — client views slots', async () => {
    const res = await api.get(`/creator/${ctx.creatorId}/availability`, {
      query: { startDate: ctx.today, endDate: ctx.isoDate(30) },
    });
    assertOk(res);
    assertHasFields(res.data.data, ['days'], 'client availability');
  });

  // --- Validation ---

  test('POST /creator/availability/slots — missing fields → 400', async () => {
    const res = await creatorApi.post('/creator/availability/slots', {
      body: { date: ctx.today },
    });
    assertErrorCode(res, 'VALIDATION_ERROR');
  });

  // --- Non-creator ---

  test('GET /creator/availability — non-creator → 403', async () => {
    const res = await api.get('/creator/availability');
    assertErrorCode(res, 'FORBIDDEN');
  });
});
