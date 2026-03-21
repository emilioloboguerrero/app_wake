'use strict';

const { defineSuite } = require('../suite');
const { assertOk, assertErrorCode, assertHasFields, assertStatus } = require('../assert');

module.exports = defineSuite('Profile', ({ test, api, creatorApi, noAuthApi, ctx }) => {

  // --- Auth validation ---

  test('GET /users/me — no auth → 401', async () => {
    const res = await noAuthApi.get('/users/me');
    assertErrorCode(res, 'UNAUTHENTICATED');
  });

  // --- User profile ---

  test('GET /users/me — returns user profile', async () => {
    const res = await api.get('/users/me');
    assertOk(res);
    assertHasFields(res.data.data, ['userId', 'email', 'role'], 'profile');
  });

  test('PATCH /users/me — update displayName', async () => {
    const res = await api.patch('/users/me', {
      body: { displayName: 'Test User Updated' },
    });
    assertOk(res);
    assertHasFields(res.data.data, ['userId', 'updatedAt'], 'patch response');
  });

  test('PATCH /users/me — restore displayName', async () => {
    const res = await api.patch('/users/me', {
      body: { displayName: 'Test User' },
    });
    assertOk(res);
  });

  test('PATCH /users/me — invalid field → 400', async () => {
    const res = await api.patch('/users/me', {
      body: { role: 'admin' },
    });
    assertErrorCode(res, 'VALIDATION_ERROR');
  });

  // --- Profile picture upload URL ---

  test('POST /users/me/profile-picture/upload-url — get signed URL', async () => {
    const res = await api.post('/users/me/profile-picture/upload-url', {
      body: { contentType: 'image/jpeg' },
    });
    // Signed URLs require service account credentials — 500 expected in emulator
    if (res.ok) {
      assertHasFields(res.data.data, ['uploadUrl', 'storagePath'], 'upload-url response');
    } else if (res.status === 500) {
      assertErrorCode(res, 'INTERNAL_ERROR');
    } else {
      assertOk(res);
    }
  });

  // --- Creator profile ---

  test('PATCH /creator/profile — update cards', async () => {
    const res = await creatorApi.patch('/creator/profile', {
      body: { cards: { Instagram: 'https://instagram.com/test' } },
    });
    assertOk(res);
  });

  test('PATCH /creator/profile — non-creator → 403', async () => {
    const res = await api.patch('/creator/profile', {
      body: { cards: {} },
    });
    assertErrorCode(res, 'FORBIDDEN');
  });

  // --- Public profile ---

  test('GET /users/{creatorId}/public-profile — returns creator profile', async () => {
    const res = await api.get(`/users/${ctx.creatorId}/public-profile`);
    assertOk(res);
    assertHasFields(res.data.data, ['userId', 'displayName'], 'public profile');
  });
});
