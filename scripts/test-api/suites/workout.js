'use strict';

const { defineSuite } = require('../suite');
const { assertOk, assertErrorCode, assertHasFields, assertArrayOf } = require('../assert');

module.exports = defineSuite('Workout', ({ test, api, noAuthApi, ctx }) => {

  // --- Daily session ---

  test('GET /workout/daily — missing courseId → 400', async () => {
    const res = await api.get('/workout/daily');
    assertErrorCode(res, 'VALIDATION_ERROR');
  });

  test('GET /workout/daily?courseId=seed-course-001 — returns session', async () => {
    const res = await api.get('/workout/daily', { query: { courseId: 'seed-course-001' } });
    assertOk(res);
    assertHasFields(res.data.data, ['hasSession'], 'daily response');
  });

  // --- Courses ---

  test('GET /workout/courses — returns enrolled courses', async () => {
    const res = await api.get('/workout/courses');
    assertOk(res);
    if (!Array.isArray(res.data.data)) throw new Error('Expected array');
  });

  test('GET /workout/courses/seed-course-001 — returns course detail', async () => {
    const res = await api.get('/workout/courses/seed-course-001');
    assertOk(res);
    assertHasFields(res.data.data, ['id', 'title'], 'course detail');
  });

  // --- Streak ---

  test('GET /workout/streak — returns streak data', async () => {
    const res = await api.get('/workout/streak');
    assertOk(res);
    assertHasFields(res.data.data, ['currentStreak', 'flameLevel'], 'streak');
  });

  // --- Session history ---

  test('GET /workout/sessions — returns paginated history', async () => {
    const res = await api.get('/workout/sessions');
    assertOk(res);
    if (!Array.isArray(res.data.data)) throw new Error('Expected array');
  });

  // --- PRs ---

  test('GET /workout/prs — returns PR list', async () => {
    const res = await api.get('/workout/prs');
    assertOk(res);
    if (!Array.isArray(res.data.data)) throw new Error('Expected array');
  });

  // --- Session interruption ---

  test('GET /workout/session/active — returns checkpoint or null', async () => {
    const res = await api.get('/workout/session/active');
    assertOk(res);
    assertHasFields(res.data.data, ['checkpoint'], 'active session');
  });

  test('DELETE /workout/session/active — clears checkpoint (idempotent)', async () => {
    const res = await api.delete('/workout/session/active');
    assertOk(res);
  });

  // --- No auth ---

  test('GET /workout/daily — no auth → 401', async () => {
    const res = await noAuthApi.get('/workout/daily', { query: { courseId: 'x' } });
    assertErrorCode(res, 'UNAUTHENTICATED');
  });
});
