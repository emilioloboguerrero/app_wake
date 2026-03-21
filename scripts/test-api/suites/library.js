'use strict';

const { defineSuite } = require('../suite');
const { assertOk, assertErrorCode, assertHasFields, assert204 } = require('../assert');

module.exports = defineSuite('Creator — Library', ({ test, creatorApi, api, ctx }) => {

  // --- Sessions ---

  test('GET /creator/library/sessions — returns list', async () => {
    const res = await creatorApi.get('/creator/library/sessions');
    assertOk(res);
    if (!Array.isArray(res.data.data)) throw new Error('Expected array');
  });

  test('POST /creator/library/sessions — create session', async () => {
    const res = await creatorApi.post('/creator/library/sessions', {
      body: { title: 'Full Body A (test)' },
    });
    assertOk(res);
    assertHasFields(res.data.data, ['sessionId'], 'create session');
    ctx.createdIds.libSessionId = res.data.data.sessionId;
  });

  test('GET /creator/library/sessions/{id} — get session detail', async () => {
    if (!ctx.createdIds.libSessionId) throw new Error('No session');
    const res = await creatorApi.get(`/creator/library/sessions/${ctx.createdIds.libSessionId}`);
    assertOk(res);
    assertHasFields(res.data.data, ['sessionId', 'title'], 'session detail');
  });

  test('PATCH /creator/library/sessions/{id} — update title', async () => {
    if (!ctx.createdIds.libSessionId) throw new Error('No session');
    const res = await creatorApi.patch(`/creator/library/sessions/${ctx.createdIds.libSessionId}`, {
      body: { title: 'Full Body A Updated (test)' },
    });
    assertOk(res);
  });

  // --- Exercise in library session ---

  test('POST /creator/library/sessions/{id}/exercises — add exercise', async () => {
    if (!ctx.createdIds.libSessionId) throw new Error('No session');
    const res = await creatorApi.post(`/creator/library/sessions/${ctx.createdIds.libSessionId}/exercises`, {
      body: { name: 'Press banca (test)', primaryMuscles: ['push'], order: 0 },
    });
    assertOk(res);
    assertHasFields(res.data.data, ['exerciseId'], 'add exercise');
    ctx.createdIds.libExerciseId = res.data.data.exerciseId;
  });

  // --- Set in exercise ---

  test('POST .../sets — add set', async () => {
    if (!ctx.createdIds.libExerciseId) throw new Error('No exercise');
    const res = await creatorApi.post(
      `/creator/library/sessions/${ctx.createdIds.libSessionId}/exercises/${ctx.createdIds.libExerciseId}/sets`,
      { body: { reps: 10, weight: 40, order: 0 } },
    );
    assertOk(res);
    assertHasFields(res.data.data, ['setId'], 'add set');
  });

  // --- Non-creator access ---

  test('GET /creator/library/sessions — non-creator → 403', async () => {
    const res = await api.get('/creator/library/sessions');
    assertErrorCode(res, 'FORBIDDEN');
  });

  // --- Modules ---

  test('GET /creator/library/modules — returns list', async () => {
    const res = await creatorApi.get('/creator/library/modules');
    assertOk(res);
    if (!Array.isArray(res.data.data)) throw new Error('Expected array');
  });

  // --- Cleanup ---

  test('DELETE /creator/library/sessions/{id} — delete session', async () => {
    if (!ctx.createdIds.libSessionId) throw new Error('No session');
    const res = await creatorApi.delete(`/creator/library/sessions/${ctx.createdIds.libSessionId}`);
    assert204(res);
  });
});
