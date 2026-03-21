'use strict';

const { defineSuite } = require('../suite');
const { assertOk, assertErrorCode, assertHasFields, assert204 } = require('../assert');

module.exports = defineSuite('Progress', ({ test, api, noAuthApi, ctx }) => {

  // --- Body log ---

  test('GET /progress/body-log — returns paginated entries', async () => {
    const res = await api.get('/progress/body-log');
    assertOk(res);
    if (!Array.isArray(res.data.data)) throw new Error('Expected array');
  });

  test('PUT /progress/body-log/{date} — create/update entry', async () => {
    const testDate = ctx.isoDate(-10); // 10 days ago to avoid collisions
    const res = await api.put(`/progress/body-log/${testDate}`, {
      body: { weight: 72.5, notes: 'API test entry' },
    });
    assertOk(res);
    assertHasFields(res.data.data, ['date', 'updated'], 'body log response');
    ctx.createdIds.bodyLogDate = testDate;
  });

  test('GET /progress/body-log/{date} — get specific entry', async () => {
    if (!ctx.createdIds.bodyLogDate) throw new Error('No body log entry');
    const res = await api.get(`/progress/body-log/${ctx.createdIds.bodyLogDate}`);
    assertOk(res);
    assertHasFields(res.data.data, ['weight'], 'body log entry');
  });

  test('DELETE /progress/body-log/{date} — delete entry', async () => {
    if (!ctx.createdIds.bodyLogDate) throw new Error('No body log entry');
    const res = await api.delete(`/progress/body-log/${ctx.createdIds.bodyLogDate}`);
    assert204(res);
  });

  // --- Readiness ---

  test('PUT /progress/readiness/{date} — create entry', async () => {
    const testDate = ctx.isoDate(-10);
    const res = await api.put(`/progress/readiness/${testDate}`, {
      body: { energy: 7, soreness: 8, sleep: 6 },
    });
    assertOk(res);
    ctx.createdIds.readinessDate = testDate;
  });

  test('GET /progress/readiness/{date} — get entry', async () => {
    if (!ctx.createdIds.readinessDate) throw new Error('No readiness entry');
    const res = await api.get(`/progress/readiness/${ctx.createdIds.readinessDate}`);
    assertOk(res);
    assertHasFields(res.data.data, ['energy', 'sleep'], 'readiness entry');
  });

  test('GET /progress/readiness — range query', async () => {
    const res = await api.get('/progress/readiness', {
      query: { startDate: ctx.isoDate(-30), endDate: ctx.today },
    });
    assertOk(res);
    if (!Array.isArray(res.data.data)) throw new Error('Expected array');
  });

  test('DELETE /progress/readiness/{date} — delete entry', async () => {
    if (!ctx.createdIds.readinessDate) throw new Error('No readiness entry');
    const res = await api.delete(`/progress/readiness/${ctx.createdIds.readinessDate}`);
    assert204(res);
  });

  // --- Validation ---

  test('PUT /progress/body-log/{date} — empty body succeeds (all fields optional)', async () => {
    const res = await api.put(`/progress/body-log/${ctx.today}`, { body: {} });
    assertOk(res);
    assertHasFields(res.data.data, ['date', 'updated'], 'body log empty body');
  });
});
