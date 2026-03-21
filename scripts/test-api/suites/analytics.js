'use strict';

const { defineSuite } = require('../suite');
const { assertOk, assertErrorCode, assertHasFields } = require('../assert');

module.exports = defineSuite('Analytics & App Resources', ({ test, api, noAuthApi, ctx }) => {

  // --- Weekly volume ---

  test('GET /analytics/weekly-volume — returns volume data', async () => {
    const res = await api.get('/analytics/weekly-volume', {
      query: { startDate: ctx.isoDate(-28), endDate: ctx.today },
    });
    assertOk(res);
    if (!Array.isArray(res.data.data)) throw new Error('Expected array');
  });

  test('GET /analytics/weekly-volume — range > 12 weeks → 400', async () => {
    const res = await api.get('/analytics/weekly-volume', {
      query: { startDate: ctx.isoDate(-100), endDate: ctx.today },
    });
    assertErrorCode(res, 'VALIDATION_ERROR');
  });

  // --- Muscle breakdown ---

  test('GET /analytics/muscle-breakdown — returns breakdown', async () => {
    const res = await api.get('/analytics/muscle-breakdown', {
      query: { startDate: ctx.isoDate(-30), endDate: ctx.today },
    });
    assertOk(res);
    assertHasFields(res.data.data, ['muscles', 'totalSessions'], 'breakdown');
  });

  // --- App resources (auth required — middleware enforces auth on all /v1 routes) ---

  test('GET /app-resources — returns resources', async () => {
    const res = await api.get('/app-resources');
    assertOk(res);
  });

  test('GET /app-resources — no auth → 401', async () => {
    const res = await noAuthApi.get('/app-resources');
    assertErrorCode(res, 'UNAUTHENTICATED');
  });

  // --- No auth ---

  test('GET /analytics/weekly-volume — no auth → 401', async () => {
    const res = await noAuthApi.get('/analytics/weekly-volume', {
      query: { startDate: ctx.isoDate(-7), endDate: ctx.today },
    });
    assertErrorCode(res, 'UNAUTHENTICATED');
  });
});
