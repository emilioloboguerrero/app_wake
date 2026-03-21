'use strict';

const { defineSuite } = require('../suite');
const { assertOk, assertErrorCode, assertHasFields, assert204 } = require('../assert');

module.exports = defineSuite('Creator — Plans', ({ test, creatorApi, api, ctx }) => {

  // --- List ---

  test('GET /creator/plans — returns list', async () => {
    const res = await creatorApi.get('/creator/plans');
    assertOk(res);
    if (!Array.isArray(res.data.data)) throw new Error('Expected array');
  });

  // --- CRUD ---

  test('POST /creator/plans — create plan', async () => {
    const res = await creatorApi.post('/creator/plans', {
      body: { title: 'Test Plan (API test)', description: null },
    });
    assertOk(res);
    assertHasFields(res.data.data, ['planId', 'firstModuleId'], 'create plan');
    ctx.createdIds.planId = res.data.data.planId;
    ctx.createdIds.planModuleId = res.data.data.firstModuleId;
  });

  test('GET /creator/plans/{id} — get plan with modules', async () => {
    if (!ctx.createdIds.planId) throw new Error('No plan');
    const res = await creatorApi.get(`/creator/plans/${ctx.createdIds.planId}`);
    assertOk(res);
    assertHasFields(res.data.data, ['planId', 'modules'], 'plan detail');
  });

  test('PATCH /creator/plans/{id} — update title', async () => {
    if (!ctx.createdIds.planId) throw new Error('No plan');
    const res = await creatorApi.patch(`/creator/plans/${ctx.createdIds.planId}`, {
      body: { title: 'Test Plan Updated' },
    });
    assertOk(res);
  });

  // --- Module operations ---

  test('POST /creator/plans/{id}/modules — add module', async () => {
    if (!ctx.createdIds.planId) throw new Error('No plan');
    const res = await creatorApi.post(`/creator/plans/${ctx.createdIds.planId}/modules`, {
      body: { title: 'Semana 2 (test)', order: 1 },
    });
    assertOk(res);
    assertHasFields(res.data.data, ['moduleId'], 'add module');
    ctx.createdIds.planModule2Id = res.data.data.moduleId;
  });

  // --- Session in module ---

  test('POST /creator/plans/{id}/modules/{mid}/sessions — add session', async () => {
    if (!ctx.createdIds.planModuleId) throw new Error('No module');
    const res = await creatorApi.post(
      `/creator/plans/${ctx.createdIds.planId}/modules/${ctx.createdIds.planModuleId}/sessions`,
      { body: { title: 'Día 1 (test)', order: 0 } },
    );
    assertOk(res);
    assertHasFields(res.data.data, ['sessionId'], 'add session');
    ctx.createdIds.planSessionId = res.data.data.sessionId;
  });

  // --- Exercise in session ---

  test('POST .../exercises — add exercise to plan session', async () => {
    if (!ctx.createdIds.planSessionId) throw new Error('No session');
    const base = `/creator/plans/${ctx.createdIds.planId}/modules/${ctx.createdIds.planModuleId}/sessions/${ctx.createdIds.planSessionId}`;
    const res = await creatorApi.post(`${base}/exercises`, {
      body: { name: 'Sentadilla (test)', primaryMuscles: ['legs'], order: 0 },
    });
    assertOk(res);
    assertHasFields(res.data.data, ['exerciseId'], 'add exercise');
    ctx.createdIds.planExerciseId = res.data.data.exerciseId;
  });

  // --- Set in exercise ---

  test('POST .../sets — add set to exercise', async () => {
    if (!ctx.createdIds.planExerciseId) throw new Error('No exercise');
    const base = `/creator/plans/${ctx.createdIds.planId}/modules/${ctx.createdIds.planModuleId}/sessions/${ctx.createdIds.planSessionId}/exercises/${ctx.createdIds.planExerciseId}`;
    const res = await creatorApi.post(`${base}/sets`, {
      body: { reps: 10, weight: 60, order: 0 },
    });
    assertOk(res);
    assertHasFields(res.data.data, ['setId'], 'add set');
  });

  // --- Cleanup ---

  test('DELETE /creator/plans/{id} — delete plan (cascading)', async () => {
    if (!ctx.createdIds.planId) throw new Error('No plan');
    const res = await creatorApi.delete(`/creator/plans/${ctx.createdIds.planId}`);
    assert204(res);
  });
});
