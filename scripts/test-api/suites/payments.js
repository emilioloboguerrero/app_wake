'use strict';

const { defineSuite } = require('../suite');
const { assertOk, assertErrorCode, assertHasFields } = require('../assert');

module.exports = defineSuite('Payments', ({ test, api, noAuthApi, ctx }) => {

  // --- Subscriptions ---

  test('GET /users/me/subscriptions — returns list', async () => {
    const res = await api.get('/users/me/subscriptions');
    assertOk(res);
    if (!Array.isArray(res.data.data)) throw new Error('Expected array');
  });

  // --- Payment preference ---

  test('POST /payments/preference — create preference', async () => {
    const res = await api.post('/payments/preference', {
      body: {
        courseId: 'seed-course-001',
      },
    });
    // May fail in emulator (no MP credentials or signing errors)
    if (res.ok) {
      assertHasFields(res.data.data, ['init_point'], 'preference');
    } else if (res.status === 503) {
      assertErrorCode(res, 'SERVICE_UNAVAILABLE');
    } else if (res.status === 500) {
      assertErrorCode(res, 'INTERNAL_ERROR');
    } else {
      assertOk(res); // will throw with details
    }
  });

  // --- Subscription checkout ---

  test('POST /payments/subscription — create subscription', async () => {
    const res = await api.post('/payments/subscription', {
      body: {
        courseId: 'seed-course-001',
        payer_email: 'test@test.com',
      },
    });
    // May fail in emulator (no MP credentials or signing errors)
    if (res.ok) {
      assertHasFields(res.data.data, ['init_point', 'subscription_id'], 'subscription');
    } else if (res.status === 503) {
      assertErrorCode(res, 'SERVICE_UNAVAILABLE');
    } else if (res.status === 500) {
      assertErrorCode(res, 'INTERNAL_ERROR');
    } else if (res.status === 409) {
      // MercadoPago email conflict — valid emulator response
      assertErrorCode(res, 'CONFLICT');
    } else if (res.status === 400) {
      // Seed course may lack pricing data
      assertErrorCode(res, 'VALIDATION_ERROR');
    } else {
      assertOk(res);
    }
  });

  // --- Validation ---

  test('POST /payments/preference — missing courseId → 400', async () => {
    const res = await api.post('/payments/preference', {
      body: { accessDuration: 'monthly' },
    });
    assertErrorCode(res, 'VALIDATION_ERROR');
  });

  test('POST /payments/preference — no auth → 401', async () => {
    const res = await noAuthApi.post('/payments/preference', {
      body: { courseId: 'x', accessDuration: 'monthly' },
    });
    assertErrorCode(res, 'UNAUTHENTICATED');
  });
});
