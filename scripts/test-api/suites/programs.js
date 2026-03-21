'use strict';

const { defineSuite } = require('../suite');
const { assertOk, assertErrorCode, assertHasFields, assert204, assertStatus } = require('../assert');

module.exports = defineSuite('Creator — Programs', ({ test, api, creatorApi, ctx }) => {

  // --- List ---

  test('GET /creator/programs — returns list', async () => {
    const res = await creatorApi.get('/creator/programs');
    assertOk(res);
    if (!Array.isArray(res.data.data)) throw new Error('Expected array');
  });

  // --- CRUD ---

  test('POST /creator/programs — create program', async () => {
    const res = await creatorApi.post('/creator/programs', {
      body: {
        title: 'Test Program (API test)',
        deliveryType: 'low_ticket',
        description: 'Created by test runner',
      },
    });
    assertStatus(res, 201);
    assertHasFields(res.data.data, ['id'], 'create program');
    ctx.createdIds.programId = res.data.data.id;
  });

  test('PATCH /creator/programs/{id} — update title', async () => {
    if (!ctx.createdIds.programId) throw new Error('No program');
    const res = await creatorApi.patch(`/creator/programs/${ctx.createdIds.programId}`, {
      body: { title: 'Test Program Updated' },
    });
    assertOk(res);
  });

  test('PATCH /creator/programs/{id}/status — publish', async () => {
    if (!ctx.createdIds.programId) throw new Error('No program');
    const res = await creatorApi.patch(`/creator/programs/${ctx.createdIds.programId}/status`, {
      body: { status: 'active' },
    });
    assertOk(res);
  });

  test('POST /creator/programs/{id}/duplicate — duplicate program', async () => {
    if (!ctx.createdIds.programId) throw new Error('No program');
    const res = await creatorApi.post(`/creator/programs/${ctx.createdIds.programId}/duplicate`, {
      body: { title: 'Duplicated Program (test)' },
    });
    assertOk(res);
    assertHasFields(res.data.data, ['id'], 'duplicate response');
    ctx.createdIds.duplicatedProgramId = res.data.data.id;
  });

  // --- Image upload URL ---

  test('POST /creator/programs/{id}/image/upload-url — get signed URL', async () => {
    if (!ctx.createdIds.programId) throw new Error('No program');
    const res = await creatorApi.post(`/creator/programs/${ctx.createdIds.programId}/image/upload-url`, {
      body: { contentType: 'image/jpeg' },
    });
    // Signed URLs require service account credentials — 500 expected in emulator
    if (res.ok) {
      assertHasFields(res.data.data, ['uploadUrl', 'storagePath'], 'upload URL');
    } else if (res.status === 500) {
      assertErrorCode(res, 'INTERNAL_ERROR');
    } else {
      assertOk(res);
    }
  });

  // --- Validation ---

  test('POST /creator/programs — missing title → 400', async () => {
    const res = await creatorApi.post('/creator/programs', {
      body: { deliveryType: 'low_ticket' },
    });
    assertErrorCode(res, 'VALIDATION_ERROR');
  });

  test('POST /creator/programs — non-creator → 403', async () => {
    const res = await api.post('/creator/programs', {
      body: { title: 'x', deliveryType: 'low_ticket' },
    });
    assertErrorCode(res, 'FORBIDDEN');
  });

  // --- Cleanup ---

  test('DELETE /creator/programs/{duplicatedId} — delete duplicate', async () => {
    if (!ctx.createdIds.duplicatedProgramId) return;
    const res = await creatorApi.delete(`/creator/programs/${ctx.createdIds.duplicatedProgramId}`);
    assert204(res);
  });

  test('DELETE /creator/programs/{id} — delete program', async () => {
    if (!ctx.createdIds.programId) throw new Error('No program');
    const res = await creatorApi.delete(`/creator/programs/${ctx.createdIds.programId}`);
    assert204(res);
  });
});
