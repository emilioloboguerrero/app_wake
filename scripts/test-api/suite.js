'use strict';

/**
 * Test suite builder. Each domain creates a suite with test cases.
 *
 * Usage:
 *   module.exports = defineSuite('Profile', ({ test, api, creatorApi, noAuthApi }) => {
 *     test('GET /users/me returns profile', async () => {
 *       const res = await api.get('/users/me');
 *       assertOk(res);
 *     });
 *   });
 */

function defineSuite(name, fn) {
  return { name, fn };
}

module.exports = { defineSuite };
