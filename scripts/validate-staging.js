#!/usr/bin/env node
/**
 * validate-staging.js
 *
 * Hits every domain's key endpoints against the local emulator.
 * Base URL: http://127.0.0.1:5001/wake-staging/us-central1/api
 *
 * Requires env var:
 *   STAGING_ID_TOKEN  — Firebase ID token from the emulator Auth UI
 *
 * Usage:
 *   export STAGING_ID_TOKEN="<token>"
 *   node scripts/validate-staging.js
 */

const BASE_URL = 'http://127.0.0.1:5001/wake-staging/us-central1/api/v1';
const TOKEN = process.env.STAGING_ID_TOKEN;

if (!TOKEN) {
  console.error('ERROR: STAGING_ID_TOKEN env var is required.');
  console.error('  export STAGING_ID_TOKEN="<your-firebase-id-token>"');
  process.exit(1);
}

const today = new Date().toISOString().split('T')[0];

// ─── helpers ─────────────────────────────────────────────────────────────────

function authHeaders() {
  return {
    'Authorization': `Bearer ${TOKEN}`,
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  };
}

async function hit(method, path, body, label) {
  const url = `${BASE_URL}${path}`;
  const opts = { method, headers: authHeaders() };
  if (body !== undefined) opts.body = JSON.stringify(body);

  let res;
  try {
    res = await fetch(url, opts);
  } catch (e) {
    return { ok: false, status: 0, body: null, label, path, error: e.message };
  }

  let resBody = null;
  try {
    resBody = res.status !== 204 ? await res.json() : null;
  } catch (_) { /* non-JSON */ }

  return { ok: res.ok, status: res.status, body: resBody, label, path };
}

function pass(label) {
  console.log(`  \u2713 ${label}`);
}

function fail(result) {
  console.error(`  \u2717 ${result.label}`);
  console.error(`    path:   ${result.path}`);
  console.error(`    status: ${result.status}`);
  console.error(`    body:   ${JSON.stringify(result.body)}`);
  if (result.error) console.error(`    error:  ${result.error}`);
}

function assertOk(result) {
  if (!result.ok) throw result;
  if (result.body !== null && result.body.data === undefined) {
    throw { ...result, error: 'response.data is missing' };
  }
}

// ─── domain validators ───────────────────────────────────────────────────────

async function validateAuth() {
  console.log('\n[Auth]');
  const results = [];

  // Auth domain has no dedicated /auth/* endpoints in API_ENDPOINTS.md.
  // The "who am I" call is GET /users/me — used here to validate auth token acceptance.
  const r1 = await hit('GET', '/users/me', undefined, 'GET /users/me (auth token check)');
  results.push(r1);
  try { assertOk(r1); pass(r1.label); } catch (e) { fail(e); }

  const passed = results.every(r => r.ok);
  return passed ? 'PASS' : 'FAIL';
}

async function validateProfile() {
  console.log('\n[Profile]');
  const results = [];

  const r1 = await hit('GET', '/users/me', undefined, 'GET /users/me');
  results.push(r1);
  try { assertOk(r1); pass(r1.label); } catch (e) { fail(e); }

  const r2 = await hit('PATCH', '/users/me', { displayName: 'Validated' }, 'PATCH /users/me { displayName }');
  results.push(r2);
  try { assertOk(r2); pass(r2.label); } catch (e) { fail(e); }

  const passed = results.every(r => r.ok);
  return passed ? 'PASS' : 'FAIL';
}

async function validateNutrition() {
  console.log('\n[Nutrition]');
  const results = [];

  const r1 = await hit('GET', `/nutrition/diary?date=${today}`, undefined, `GET /nutrition/diary?date=${today}`);
  results.push(r1);
  try { assertOk(r1); pass(r1.label); } catch (e) { fail(e); }

  const r2 = await hit('GET', '/nutrition/foods/search?q=pollo', undefined, 'GET /nutrition/foods/search?q=pollo');
  results.push(r2);
  try { assertOk(r2); pass(r2.label); } catch (e) { fail(e); }

  const passed = results.every(r => r.ok);
  return passed ? 'PASS' : 'FAIL';
}

async function validateProgress() {
  console.log('\n[Progress]');
  const results = [];

  const r1 = await hit('GET', '/progress/body-log', undefined, 'GET /progress/body-log');
  results.push(r1);
  try { assertOk(r1); pass(r1.label); } catch (e) { fail(e); }

  const r2 = await hit('GET', '/workout/prs', undefined, 'GET /workout/prs');
  results.push(r2);
  try { assertOk(r2); pass(r2.label); } catch (e) { fail(e); }

  const r3 = await hit(
    'GET',
    `/progress/readiness?startDate=${today}&endDate=${today}`,
    undefined,
    `GET /progress/readiness?startDate=${today}&endDate=${today}`
  );
  results.push(r3);
  try { assertOk(r3); pass(r3.label); } catch (e) { fail(e); }

  const passed = results.every(r => r.ok);
  return passed ? 'PASS' : 'FAIL';
}

async function validateWorkout() {
  console.log('\n[Workout]');
  const results = [];

  // GET /workout/daily requires courseId — omitting it expects a 400 (VALIDATION_ERROR).
  // We treat a well-formed error response as "endpoint is live".
  const r1 = await hit('GET', `/workout/daily?date=${today}`, undefined, `GET /workout/daily?date=${today} (no courseId → expect 400)`);
  const dailyOk = r1.status === 400 || r1.ok;
  results.push({ ...r1, ok: dailyOk });
  if (dailyOk) {
    pass(r1.label);
  } else {
    fail({ ...r1, ok: false });
  }

  const r2 = await hit('GET', '/workout/streak', undefined, 'GET /workout/streak');
  results.push(r2);
  try { assertOk(r2); pass(r2.label); } catch (e) { fail(e); }

  const r3 = await hit('GET', '/workout/sessions', undefined, 'GET /workout/sessions');
  results.push(r3);
  try { assertOk(r3); pass(r3.label); } catch (e) { fail(e); }

  const passed = results.every(r => r.ok);
  return passed ? 'PASS' : 'FAIL';
}

async function validateCreator() {
  console.log('\n[Creator]');
  const results = [];

  const r1 = await hit('GET', '/creator/programs', undefined, 'GET /creator/programs');
  results.push(r1);
  try { assertOk(r1); pass(r1.label); } catch (e) { fail(e); }

  const r2 = await hit('GET', '/creator/clients', undefined, 'GET /creator/clients');
  results.push(r2);
  try { assertOk(r2); pass(r2.label); } catch (e) { fail(e); }

  const r3 = await hit('GET', '/creator/library/sessions', undefined, 'GET /creator/library/sessions');
  results.push(r3);
  try { assertOk(r3); pass(r3.label); } catch (e) { fail(e); }

  const passed = results.every(r => r.ok);
  return passed ? 'PASS' : 'FAIL';
}

// ─── main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('Wake Staging Validator');
  console.log(`Base URL : ${BASE_URL}`);
  console.log(`Date     : ${today}`);
  console.log('─'.repeat(50));

  const results = await Promise.allSettled([
    validateAuth().then(s => ({ domain: 'Auth', status: s })),
    validateProfile().then(s => ({ domain: 'Profile', status: s })),
    validateNutrition().then(s => ({ domain: 'Nutrition', status: s })),
    validateProgress().then(s => ({ domain: 'Progress', status: s })),
    validateWorkout().then(s => ({ domain: 'Workout', status: s })),
    validateCreator().then(s => ({ domain: 'Creator', status: s })),
  ]);

  const summary = results.map(r => {
    if (r.status === 'fulfilled') return r.value;
    return { domain: '?', status: 'FAIL' };
  });

  console.log('\n' + '─'.repeat(50));
  console.log('Summary');
  console.log('─'.repeat(50));

  let anyFail = false;
  for (const { domain, status } of summary) {
    const icon = status === 'PASS' ? '\u2713' : '\u2717';
    if (status !== 'PASS') anyFail = true;
    console.log(`  ${icon} ${domain.padEnd(12)} ${status}`);
  }

  console.log('─'.repeat(50));

  if (anyFail) {
    console.log('\nResult: FAIL — fix failing domains before deploying to production.\n');
    process.exit(1);
  } else {
    console.log('\nResult: PASS — all domains healthy.\n');
    process.exit(0);
  }
}

main().catch(err => {
  console.error('Unexpected error:', err);
  process.exit(1);
});
