#!/usr/bin/env node
'use strict';

const { resolveEnv } = require('./config');
const { getIdToken } = require('./auth');
const { createClient } = require('./http');
const { Reporter } = require('./reporter');

const SUITES = [
  'profile',
  'nutrition',
  'workout',
  'progress',
  'creator',
  'programs',
  'plans',
  'library',
  'bookings',
  'events',
  'payments',
  'analytics',
];

function today() {
  return new Date().toISOString().slice(0, 10);
}

function isoDate(offsetDays) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

async function main() {
  // Parse args
  const args = process.argv.slice(2);
  const domainFlag = args.indexOf('--domain');
  const domainFilter = domainFlag !== -1 ? args[domainFlag + 1]?.split(',') : null;

  const emailFlag = args.indexOf('--email');
  const passFlag = args.indexOf('--password');
  const creatorEmailFlag = args.indexOf('--creator-email');
  const creatorPassFlag = args.indexOf('--creator-password');

  const userEmail = (emailFlag !== -1 && args[emailFlag + 1]) || process.env.TEST_USER_EMAIL || 'user@test.com';
  const userPassword = (passFlag !== -1 && args[passFlag + 1]) || process.env.TEST_USER_PASSWORD || 'okokok';
  const creatorEmail = (creatorEmailFlag !== -1 && args[creatorEmailFlag + 1]) || process.env.TEST_CREATOR_EMAIL || 'creator@test.com';
  const creatorPassword = (creatorPassFlag !== -1 && args[creatorPassFlag + 1]) || process.env.TEST_CREATOR_PASSWORD || 'okokok';

  const env = resolveEnv();
  console.log(`\n🔧 Environment: ${env.label} (${env.name})`);
  console.log(`   Base URL: ${env.baseUrl}`);

  // Authenticate both users
  console.log('\n🔑 Authenticating...');
  let userToken, creatorToken, userId, creatorId;
  try {
    const userAuth = await getIdToken(userEmail, userPassword, env.apiKey, env.authUrl);
    userToken = userAuth.idToken;
    userId = userAuth.localId;
    console.log(`   User: ${userEmail} (${userId})`);
  } catch (e) {
    console.error(`   ✗ User auth failed: ${e.message}`);
    process.exit(1);
  }
  try {
    const creatorAuth = await getIdToken(creatorEmail, creatorPassword, env.apiKey, env.authUrl);
    creatorToken = creatorAuth.idToken;
    creatorId = creatorAuth.localId;
    console.log(`   Creator: ${creatorEmail} (${creatorId})`);
  } catch (e) {
    console.error(`   ✗ Creator auth failed: ${e.message}`);
    process.exit(1);
  }

  // Create HTTP clients
  const api = createClient(env.baseUrl, userToken);
  const creatorApi = createClient(env.baseUrl, creatorToken);
  const noAuthApi = createClient(env.baseUrl, null);

  const reporter = new Reporter();

  // Shared context for tests to store IDs across suites
  const ctx = {
    userId,
    creatorId,
    today: today(),
    isoDate,
    // Populated by tests that create resources
    createdIds: {},
  };

  // Load and run suites
  const suitesToRun = domainFilter
    ? SUITES.filter(s => domainFilter.includes(s))
    : SUITES;

  for (const suiteName of suitesToRun) {
    let suite;
    try {
      suite = require(`./suites/${suiteName}`);
    } catch (e) {
      console.log(`\n⚠ Suite "${suiteName}" not found, skipping`);
      continue;
    }

    reporter.startSuite(suite.name);

    // Collect tests
    const tests = [];
    const testFn = (label, fn) => tests.push({ label, fn });

    suite.fn({ test: testFn, api, creatorApi, noAuthApi, ctx });

    // Run tests sequentially (order matters for CRUD flows)
    for (const t of tests) {
      try {
        await t.fn();
        reporter.pass(t.label);
      } catch (e) {
        reporter.fail(t.label, e);
      }
    }
  }

  const allPassed = reporter.summary();
  process.exit(allPassed ? 0 : 1);
}

main().catch(err => {
  console.error('Runner crashed:', err);
  process.exit(1);
});
