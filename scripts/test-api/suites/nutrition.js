'use strict';

const { defineSuite } = require('../suite');
const { assertOk, assertErrorCode, assertHasFields, assertArrayOf, assert204, assertStatus } = require('../assert');

module.exports = defineSuite('Nutrition', ({ test, api, creatorApi, noAuthApi, ctx }) => {

  // --- Diary ---

  test('GET /nutrition/diary?date=today — returns entries', async () => {
    const res = await api.get('/nutrition/diary', { query: { date: ctx.today } });
    assertOk(res);
    if (!Array.isArray(res.data.data)) throw new Error('Expected array');
  });

  test('POST /nutrition/diary — create entry', async () => {
    const res = await api.post('/nutrition/diary', {
      body: {
        date: ctx.today,
        meal_type: 'lunch',
        foods: [
          {
            foodId: 'test-food-001',
            servingId: 'test-serving-001',
            numberOfUnits: 1,
            name: 'Pollo a la plancha (test)',
            calories: 250,
            protein: 40,
            carbs: 0,
            fat: 8,
          },
        ],
      },
    });
    assertStatus(res, 201);
    assertHasFields(res.data.data, ['id'], 'diary create response');
    ctx.createdIds.diaryEntryId = res.data.data.id;
  });

  test('PATCH /nutrition/diary/{entryId} — update entry', async () => {
    if (!ctx.createdIds.diaryEntryId) throw new Error('No diary entry to update');
    const res = await api.patch(`/nutrition/diary/${ctx.createdIds.diaryEntryId}`, {
      body: { notes: 'Updated via API test' },
    });
    assertOk(res);
  });

  test('DELETE /nutrition/diary/{entryId} — delete entry', async () => {
    if (!ctx.createdIds.diaryEntryId) throw new Error('No diary entry to delete');
    const res = await api.delete(`/nutrition/diary/${ctx.createdIds.diaryEntryId}`);
    assert204(res);
  });

  test('POST /nutrition/diary — missing required fields → 400', async () => {
    const res = await api.post('/nutrition/diary', { body: { date: ctx.today, meal_type: 'lunch' } });
    assertErrorCode(res, 'VALIDATION_ERROR');
  });

  // --- Food search ---

  test('GET /nutrition/foods/search?q=pollo — returns results or 503', async () => {
    const res = await api.get('/nutrition/foods/search', { query: { q: 'pollo' } });
    // FatSecret credentials may not be available in emulator
    if (res.ok) {
      assertHasFields(res.data.data, ['foods_search'], 'search response');
    } else if (res.status === 503) {
      assertErrorCode(res, 'SERVICE_UNAVAILABLE');
    } else {
      assertOk(res);
    }
  });

  test('GET /nutrition/foods/search — missing q → 400', async () => {
    const res = await api.get('/nutrition/foods/search');
    assertErrorCode(res, 'VALIDATION_ERROR');
  });

  // --- Saved foods ---

  test('GET /nutrition/saved-foods — returns list', async () => {
    const res = await api.get('/nutrition/saved-foods');
    assertOk(res);
  });

  test('POST /nutrition/saved-foods — save a food', async () => {
    const res = await api.post('/nutrition/saved-foods', {
      body: {
        foodId: 'test-saved-food-001',
        name: 'Arroz blanco (test)',
        calories: 200,
        protein: 4,
        carbs: 45,
        fat: 0.5,
      },
    });
    assertStatus(res, 201);
    if (res.data?.data?.id) {
      ctx.createdIds.savedFoodId = res.data.data.id;
    }
  });

  test('DELETE /nutrition/saved-foods/{id} — remove saved food', async () => {
    if (!ctx.createdIds.savedFoodId) return; // skip if creation failed with CONFLICT
    const res = await api.delete(`/nutrition/saved-foods/${ctx.createdIds.savedFoodId}`);
    assert204(res);
  });

  // --- Assignment ---

  test('GET /nutrition/assignment — returns plan or 404', async () => {
    const res = await api.get('/nutrition/assignment', { query: { date: ctx.today } });
    // Either returns plan or NOT_FOUND — both valid
    if (res.status === 200) {
      assertHasFields(res.data.data, ['assignmentId'], 'assignment');
    } else {
      assertErrorCode(res, 'NOT_FOUND');
    }
  });
});
