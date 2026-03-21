'use strict';

const { defineSuite } = require('../suite');
const { assertOk, assertErrorCode, assertHasFields, assert204 } = require('../assert');

module.exports = defineSuite('Creator — Clients', ({ test, api, creatorApi, noAuthApi, ctx }) => {

  // --- Auth checks ---

  test('GET /creator/clients — non-creator → 403', async () => {
    const res = await api.get('/creator/clients');
    assertErrorCode(res, 'FORBIDDEN');
  });

  // --- Client list ---

  test('GET /creator/clients — returns list', async () => {
    const res = await creatorApi.get('/creator/clients');
    assertOk(res);
    if (!Array.isArray(res.data.data)) throw new Error('Expected array');
  });

  // --- Add client ---

  test('POST /creator/clients — add client by userId', async () => {
    const res = await creatorApi.post('/creator/clients', {
      body: { userId: ctx.userId },
    });
    // 201 expected for new client
    if (res.status === 200 || res.status === 201) {
      assertHasFields(res.data.data, ['id'], 'add client response');
      ctx.createdIds.clientId = res.data.data.id;
    } else {
      throw new Error(`Unexpected status ${res.status}`);
    }
  });

  test('POST /creator/clients — nonexistent userId → 404', async () => {
    const res = await creatorApi.post('/creator/clients', {
      body: { userId: 'nonexistent-user-id-12345' },
    });
    assertErrorCode(res, 'NOT_FOUND');
  });

  // --- Client activity ---

  test('GET /creator/clients/{clientId}/activity — returns summary', async () => {
    if (!ctx.createdIds.clientId) throw new Error('No client');
    const res = await creatorApi.get(`/creator/clients/${ctx.createdIds.clientId}/activity`);
    assertOk(res);
    assertHasFields(res.data.data, ['courses'], 'activity');
  });

  // --- Client sessions ---

  test('GET /creator/clients/{clientId}/sessions — returns history', async () => {
    if (!ctx.createdIds.clientId) throw new Error('No client');
    const res = await creatorApi.get(`/creator/clients/${ctx.createdIds.clientId}/sessions`);
    assertOk(res);
    if (!Array.isArray(res.data.data)) throw new Error('Expected array');
  });
});
