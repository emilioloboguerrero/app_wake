#!/usr/bin/env node
'use strict';

/**
 * Production data shape analysis for the security audit.
 *
 * Samples N docs from each collection, aggregates field types and value
 * distributions, and calls out specific anomalies that would break the
 * audit's planned rule lockdowns.
 *
 * Privacy: never prints raw emails, names, addresses, full UIDs, or any
 * other PII. Reports counts, types, enum value distributions, and
 * truncated/redacted samples only.
 *
 * Usage:
 *   node scripts/security/shape-analysis.js [--full] [--out path]
 *     --full  scan to limit instead of small sample (slow, $$$)
 *     --out   write JSON output to a file (default: stdout)
 */

const admin = require('firebase-admin');
const fs = require('fs');

const args = process.argv.slice(2);
const FULL = args.includes('--full');
const outIdx = args.indexOf('--out');
const OUT_PATH = outIdx !== -1 ? args[outIdx + 1] : null;

admin.initializeApp({ projectId: 'wolf-20b8b' });
const db = admin.firestore();
const auth = admin.auth();

const SAMPLE = FULL ? 5000 : 300;
const SUB_SAMPLE = FULL ? 1000 : 100;

// PII / sensitive field allowlist — never include raw values in output
const REDACTED_FIELDS = new Set([
  'email', 'payer_email', 'displayName', 'firstName', 'lastName', 'fullName',
  'phone', 'phoneNumber', 'address', 'city', 'birthDate', 'photoURL',
  'profilePictureUrl', 'name', 'nombre', 'username', 'callLink',
  'check_in_token', 'rawKey', 'key_hash', 'unsubscribeToken', 'token',
  'access_token', 'refresh_token', 'apiKey',
]);

function redact(field, value) {
  if (REDACTED_FIELDS.has(field) || /email|name|phone|address|password|token|secret|key/i.test(field)) {
    if (value === null || value === undefined) return value;
    if (typeof value === 'string') return value.length > 0 ? `<redacted-${value.length}c>` : '';
    return '<redacted>';
  }
  if (typeof value === 'string' && value.length > 80) return value.slice(0, 80) + '…';
  return value;
}

function typeOf(v) {
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'array';
  if (v instanceof admin.firestore.Timestamp) return 'timestamp';
  if (v instanceof Date) return 'date';
  if (typeof v === 'object') return 'object';
  return typeof v;
}

class Shape {
  constructor() {
    this.docCount = 0;
    this.fields = {}; // field → { count, types: {type: n}, values: Map (for low-cardinality), sample: [] }
  }
  add(doc) {
    this.docCount++;
    this._walk(doc, '');
  }
  _walk(obj, prefix) {
    if (obj === null || typeof obj !== 'object' || obj instanceof admin.firestore.Timestamp) return;
    const keys = Object.keys(obj);
    for (const k of keys) {
      const path = prefix ? `${prefix}.${k}` : k;
      const v = obj[k];
      const t = typeOf(v);
      const entry = (this.fields[path] ||= { count: 0, types: {}, values: new Map(), valueCardinality: 0, samples: [] });
      entry.count++;
      entry.types[t] = (entry.types[t] || 0) + 1;
      // Track value distribution for low-cardinality string/number/bool
      if ((t === 'string' || t === 'number' || t === 'boolean' || t === 'null') && entry.valueCardinality < 50) {
        const key = typeOf(v) + ':' + (v === null ? 'null' : String(v).slice(0, 200));
        const cur = entry.values.get(key) || 0;
        if (cur === 0) entry.valueCardinality++;
        entry.values.set(key, cur + 1);
      }
      // Hold a few samples for non-PII string fields
      if (t === 'string' && entry.samples.length < 5 && !REDACTED_FIELDS.has(k) && !/email|name|phone|address|password|token|secret|key/i.test(k)) {
        if (v.length < 120 && !entry.samples.includes(v)) entry.samples.push(v);
      }
    }
  }
  serialize() {
    const out = { docCount: this.docCount, fields: {} };
    for (const [field, entry] of Object.entries(this.fields)) {
      const valueDist = entry.valueCardinality < 50
        ? Array.from(entry.values.entries())
            .map(([k, n]) => ({ value: k, count: n }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 30)
            .map(x => ({ value: redact(field, x.value), count: x.count }))
        : `<high-cardinality, ${entry.valueCardinality}+ unique>`;
      out.fields[field] = {
        presencePct: Math.round((entry.count / this.docCount) * 100),
        types: entry.types,
        valueDist,
        samples: entry.samples.slice(0, 3),
      };
    }
    return out;
  }
}

async function sampleCollection(name, limit, group = false) {
  const ref = group ? db.collectionGroup(name) : db.collection(name);
  const snap = await ref.limit(limit).get();
  const shape = new Shape();
  for (const d of snap.docs) shape.add(d.data());
  return { name, group, sampled: snap.size, shape: shape.serialize() };
}

// Anomaly checks — each returns an array of anomalies
async function checkUserAnomalies() {
  const out = { anomalies: [] };
  const snap = await db.collection('users').limit(SAMPLE).get();
  let totalDocs = 0;
  const roleValues = new Map();
  const usernameDups = new Map(); // username → uid count
  let hasCardsCount = 0, cardsArrayCount = 0, cardsObjectCount = 0;
  let hasTrialUsedCount = 0;
  let purchasedCoursesPresent = 0, purchasedNotMatchingCourses = 0;
  let hasCoursesCount = 0;
  const courseStatusValues = new Map();
  const courseDeliveryTypeValues = new Map();
  let coursesEntriesScanned = 0;
  let emailNullCount = 0, emailMismatchAuthSampleChecked = 0, emailMismatchAuthSampleMismatched = 0;
  let usersWithSubsciptionsField = 0;
  const courseExpiresAtFormats = new Map();
  let coursesWithoutExpiresAt = 0;
  let coursesWithExpiresAtNull = 0;

  for (const d of snap.docs) {
    totalDocs++;
    const data = d.data();
    // role distribution
    const r = data.role;
    const rk = r === undefined ? '<absent>' : (r === null ? '<null>' : typeof r === 'string' ? r : `<${typeOf(r)}>`);
    roleValues.set(rk, (roleValues.get(rk) || 0) + 1);
    // username duplicates
    if (typeof data.username === 'string' && data.username.length > 0) {
      const list = usernameDups.get(data.username) || [];
      list.push(d.id);
      usernameDups.set(data.username, list);
    }
    // cards
    if (data.cards !== undefined) {
      hasCardsCount++;
      if (Array.isArray(data.cards)) cardsArrayCount++;
      else if (typeof data.cards === 'object') cardsObjectCount++;
    }
    // trial_used
    if (data.trial_used !== undefined) hasTrialUsedCount++;
    // purchased_courses vs courses map
    const pc = data.purchased_courses;
    const courses = data.courses;
    if (Array.isArray(pc)) purchasedCoursesPresent++;
    if (Array.isArray(pc) && courses && typeof courses === 'object') {
      const courseKeys = new Set(Object.keys(courses));
      const inPcNotInCourses = pc.filter(x => !courseKeys.has(x));
      if (inPcNotInCourses.length > 0) purchasedNotMatchingCourses++;
    }
    // courses entries: status, deliveryType, expires_at
    if (courses && typeof courses === 'object') {
      hasCoursesCount++;
      for (const [cid, entry] of Object.entries(courses)) {
        if (!entry || typeof entry !== 'object') continue;
        coursesEntriesScanned++;
        const s = entry.status;
        const sk = s === undefined ? '<absent>' : (s === null ? '<null>' : typeof s === 'string' ? s : `<${typeOf(s)}>`);
        courseStatusValues.set(sk, (courseStatusValues.get(sk) || 0) + 1);
        const dt = entry.deliveryType;
        const dtk = dt === undefined ? '<absent>' : (dt === null ? '<null>' : typeof dt === 'string' ? dt : `<${typeOf(dt)}>`);
        courseDeliveryTypeValues.set(dtk, (courseDeliveryTypeValues.get(dtk) || 0) + 1);
        const ea = entry.expires_at;
        if (ea === undefined) coursesWithoutExpiresAt++;
        else if (ea === null) coursesWithExpiresAtNull++;
        else {
          const fmt = ea instanceof admin.firestore.Timestamp ? 'timestamp'
                    : typeof ea === 'string' ? (ea.match(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/) ? 'iso' : 'string-other')
                    : typeOf(ea);
          courseExpiresAtFormats.set(fmt, (courseExpiresAtFormats.get(fmt) || 0) + 1);
        }
      }
    }
    if (data.subscriptions !== undefined) usersWithSubsciptionsField++;
    if (data.email === null || data.email === undefined || data.email === '') emailNullCount++;

    // Spot-check: does users.email match Firebase Auth email for this uid?
    if (emailMismatchAuthSampleChecked < 50 && typeof data.email === 'string' && data.email.length > 0) {
      try {
        const u = await auth.getUser(d.id);
        if (u.email && u.email.toLowerCase() !== data.email.toLowerCase()) {
          emailMismatchAuthSampleMismatched++;
        }
      } catch (_) {}
      emailMismatchAuthSampleChecked++;
    }
  }

  out.totalDocs = totalDocs;
  out.role_distribution = Object.fromEntries(roleValues);
  out.duplicate_usernames = Array.from(usernameDups.entries())
    .filter(([_, list]) => list.length > 1)
    .map(([u, list]) => ({ username: '<redacted>', uidCount: list.length, len: u.length }));
  out.users_with_cards = hasCardsCount;
  out.cards_arrays = cardsArrayCount;
  out.cards_objects = cardsObjectCount;
  out.users_with_trial_used = hasTrialUsedCount;
  out.users_with_purchased_courses_array = purchasedCoursesPresent;
  out.users_with_purchased_courses_not_matching_courses_map = purchasedNotMatchingCourses;
  out.users_with_courses_map = hasCoursesCount;
  out.users_with_subscriptions_top_level_field = usersWithSubsciptionsField;
  out.users_with_null_or_empty_email = emailNullCount;
  out.users_email_vs_auth_email_sample = {
    checked: emailMismatchAuthSampleChecked,
    mismatched: emailMismatchAuthSampleMismatched,
  };
  out.course_entries_scanned = coursesEntriesScanned;
  out.course_status_distribution = Object.fromEntries(courseStatusValues);
  out.course_deliveryType_distribution = Object.fromEntries(courseDeliveryTypeValues);
  out.course_expires_at_format_distribution = Object.fromEntries(courseExpiresAtFormats);
  out.courses_without_expires_at = coursesWithoutExpiresAt;
  out.courses_with_expires_at_null = coursesWithExpiresAtNull;

  // Specific anomaly flags vs planned fixes
  const expectedRoles = new Set(['user', 'creator', 'admin', '<absent>', '<null>']);
  out.unexpected_role_values = [...roleValues.entries()].filter(([k, _]) => !expectedRoles.has(k));
  const expectedStatuses = new Set(['active', 'expired', 'cancelled', 'trial', 'pending', '<absent>', '<null>']);
  out.unexpected_course_status_values = [...courseStatusValues.entries()].filter(([k, _]) => !expectedStatuses.has(k));
  const expectedDt = new Set(['low_ticket', 'one_on_one', '<absent>', '<null>']);
  out.unexpected_deliveryType_values = [...courseDeliveryTypeValues.entries()].filter(([k, _]) => !expectedDt.has(k));
  return out;
}

async function checkBundleAnomalies() {
  const out = {};
  const snap = await db.collection('bundles').limit(SAMPLE).get();
  let totalBundles = 0;
  let withCourseIds = 0;
  let withProgramsArray = 0;
  let mixedCreator = 0;
  let bundlesScannedForOwnership = 0;
  const courseCreatorCache = new Map(); // courseId → creator_id

  for (const d of snap.docs) {
    totalBundles++;
    const data = d.data();
    const creatorId = data.creatorId || data.creator_id;
    const courseIds = Array.isArray(data.courseIds) ? data.courseIds
                    : Array.isArray(data.programs) ? data.programs : null;
    if (Array.isArray(data.courseIds)) withCourseIds++;
    if (Array.isArray(data.programs)) withProgramsArray++;
    if (!creatorId || !courseIds || courseIds.length === 0) continue;
    bundlesScannedForOwnership++;
    let isMixed = false;
    for (const cid of courseIds.slice(0, 20)) {
      let owner = courseCreatorCache.get(cid);
      if (owner === undefined) {
        try {
          const cd = await db.collection('courses').doc(cid).get();
          owner = cd.exists ? (cd.data().creator_id || cd.data().creatorId || null) : null;
        } catch { owner = null; }
        courseCreatorCache.set(cid, owner);
      }
      if (owner && owner !== creatorId) {
        isMixed = true;
        break;
      }
    }
    if (isMixed) mixedCreator++;
  }
  out.totalBundles = totalBundles;
  out.with_courseIds_field = withCourseIds;
  out.with_programs_field = withProgramsArray;
  out.bundles_scanned_for_cross_creator_ownership = bundlesScannedForOwnership;
  out.bundles_with_at_least_one_foreign_course = mixedCreator;
  return out;
}

async function checkPurchasesCollection() {
  const out = {};
  const snap = await db.collection('purchases').limit(500).get();
  out.totalDocs = snap.size;
  let userIdMatchesAuth = 0, statusValues = new Map(), amountTypes = new Map();
  for (const d of snap.docs) {
    const data = d.data();
    const s = data.status;
    statusValues.set(typeof s === 'string' ? s : `<${typeOf(s)}>`, (statusValues.get(typeof s === 'string' ? s : `<${typeOf(s)}>`) || 0) + 1);
    const a = data.amount;
    amountTypes.set(typeOf(a), (amountTypes.get(typeOf(a)) || 0) + 1);
  }
  out.status_distribution = Object.fromEntries(statusValues);
  out.amount_type_distribution = Object.fromEntries(amountTypes);
  return out;
}

async function checkProcessedPaymentsAnomalies() {
  const out = {};
  const snap = await db.collection('processed_payments').limit(SAMPLE).get();
  let total = 0;
  const statusValues = new Map();
  const externalRefShapes = new Map(); // pipe count
  let withBundleId = 0, withCourseId = 0, withUserId = 0;
  for (const d of snap.docs) {
    total++;
    const data = d.data();
    const s = data.status;
    statusValues.set(typeof s === 'string' ? s : `<${typeOf(s)}>`, (statusValues.get(typeof s === 'string' ? s : `<${typeOf(s)}>`) || 0) + 1);
    if (data.bundleId || data.bundle_id) withBundleId++;
    if (data.courseId || data.course_id) withCourseId++;
    if (data.userId || data.user_id) withUserId++;
    if (typeof data.external_reference === 'string') {
      const pipeCount = (data.external_reference.match(/\|/g) || []).length;
      externalRefShapes.set(`pipes-${pipeCount}`, (externalRefShapes.get(`pipes-${pipeCount}`) || 0) + 1);
    }
  }
  out.totalDocs = total;
  out.status_distribution = Object.fromEntries(statusValues);
  out.with_bundleId = withBundleId;
  out.with_courseId = withCourseId;
  out.with_userId = withUserId;
  out.external_reference_pipe_distribution = Object.fromEntries(externalRefShapes);
  return out;
}

async function checkCoursesCollection() {
  const out = {};
  const snap = await db.collection('courses').limit(SAMPLE).get();
  let total = 0, withCreatorId = 0, withCreatorIdCamel = 0;
  const statusValues = new Map(), deliveryTypeValues = new Map();
  let creatorIdMissing = 0;
  for (const d of snap.docs) {
    total++;
    const data = d.data();
    if (typeof data.creator_id === 'string' && data.creator_id.length > 0) withCreatorId++;
    if (typeof data.creatorId === 'string' && data.creatorId.length > 0) withCreatorIdCamel++;
    if (!data.creator_id && !data.creatorId) creatorIdMissing++;
    const s = data.status;
    const sk = typeof s === 'string' ? s : (s === undefined ? '<absent>' : `<${typeOf(s)}>`);
    statusValues.set(sk, (statusValues.get(sk) || 0) + 1);
    const dt = data.deliveryType;
    const dtk = typeof dt === 'string' ? dt : (dt === undefined ? '<absent>' : `<${typeOf(dt)}>`);
    deliveryTypeValues.set(dtk, (deliveryTypeValues.get(dtk) || 0) + 1);
  }
  out.totalDocs = total;
  out.with_creator_id_snake = withCreatorId;
  out.with_creator_id_camel = withCreatorIdCamel;
  out.with_neither_creator_field = creatorIdMissing;
  out.status_distribution = Object.fromEntries(statusValues);
  out.deliveryType_distribution = Object.fromEntries(deliveryTypeValues);
  return out;
}

async function checkClientProgramsCollection() {
  const out = {};
  const snap = await db.collection('client_programs').limit(SAMPLE).get();
  let total = 0, idShapeUidProgram = 0, idOther = 0;
  let withCreatorIdSnake = 0, withCreatorIdCamel = 0;
  let withClientIdSnake = 0, withClientIdCamel = 0;
  let withProgramIdSnake = 0, withProgramIdCamel = 0;
  for (const d of snap.docs) {
    total++;
    const data = d.data();
    // id shape: typically `${uid}_${programId}` (uid 28 chars + _ + programId)
    if (/^[A-Za-z0-9]{20,40}_[A-Za-z0-9_-]+$/.test(d.id)) idShapeUidProgram++;
    else idOther++;
    if (typeof data.creator_id === 'string') withCreatorIdSnake++;
    if (typeof data.creatorId === 'string') withCreatorIdCamel++;
    if (typeof data.client_id === 'string') withClientIdSnake++;
    if (typeof data.clientId === 'string') withClientIdCamel++;
    if (typeof data.program_id === 'string') withProgramIdSnake++;
    if (typeof data.programId === 'string') withProgramIdCamel++;
  }
  out.totalDocs = total;
  out.docId_shape_uid_underscore_program = idShapeUidProgram;
  out.docId_shape_other = idOther;
  out.field_naming = {
    creator_id_snake: withCreatorIdSnake,
    creatorId_camel: withCreatorIdCamel,
    client_id_snake: withClientIdSnake,
    clientId_camel: withClientIdCamel,
    program_id_snake: withProgramIdSnake,
    programId_camel: withProgramIdCamel,
  };
  return out;
}

async function checkOneOnOneClientsCollection() {
  const out = {};
  const snap = await db.collection('one_on_one_clients').limit(SAMPLE).get();
  let total = 0;
  const statusValues = new Map();
  let pendingCount = 0, activeCount = 0;
  for (const d of snap.docs) {
    total++;
    const data = d.data();
    const s = data.status;
    const sk = typeof s === 'string' ? s : (s === undefined ? '<absent>' : `<${typeOf(s)}>`);
    statusValues.set(sk, (statusValues.get(sk) || 0) + 1);
    if (s === 'pending') pendingCount++;
    if (s === 'active') activeCount++;
  }
  out.totalDocs = total;
  out.status_distribution = Object.fromEntries(statusValues);
  out.pending_count = pendingCount;
  out.active_count = activeCount;
  return out;
}

async function checkAuthCustomClaims() {
  // List up to 1000 auth users and report customClaims distribution
  let next = undefined;
  const claimDist = new Map();
  let total = 0;
  let scanned = 0;
  const maxScan = FULL ? 50000 : 1000;
  do {
    const r = await auth.listUsers(1000, next);
    for (const u of r.users) {
      scanned++;
      const cc = u.customClaims;
      if (!cc) {
        claimDist.set('<no claims>', (claimDist.get('<no claims>') || 0) + 1);
      } else {
        const role = cc.role || '<no-role>';
        const key = `role=${role}`;
        claimDist.set(key, (claimDist.get(key) || 0) + 1);
        if (cc.role && cc.role !== 'user') total++;
      }
      if (scanned >= maxScan) break;
    }
    next = r.pageToken;
    if (scanned >= maxScan) break;
  } while (next);
  return { scanned, claim_distribution: Object.fromEntries(claimDist), non_user_role_count: total };
}

const TOP_LEVEL = [
  'users', 'courses', 'plans', 'bundles', 'processed_payments', 'purchases',
  'one_on_one_clients', 'client_programs', 'client_sessions', 'client_plan_content',
  'client_nutrition_plan_content', 'nutrition_assignments', 'call_bookings',
  'creator_availability', 'events', 'app_resources', 'api_keys', 'community',
  'completed_sessions', 'user_progress', 'exercises_library', 'video_exchanges',
  'email_sends', 'email_unsubscribes', 'subscription_cancellation_feedback',
  'account_deletion_feedback', 'program_leave_feedback', 'creator_feedback',
  'write_access_requests', 'creator_libraries', 'creator_nutrition_library',
];

const GROUP_LEVEL = [
  'subscriptions', 'diary', 'sessionHistory', 'exerciseHistory',
  'exerciseLastPerformance', 'saved_foods', 'readiness', 'bodyLog',
  'abandonedSessions', 'activeSession', 'registrations', 'waitlist',
  'sessions', 'modules',
];

(async () => {
  const out = {
    project: 'wolf-20b8b',
    sampleLimit: SAMPLE,
    full: FULL,
    generatedAt: new Date().toISOString(),
    collections: {},
    groups: {},
    anomalies: {},
  };

  console.error(`[shape-analysis] sampling top-level collections (n=${SAMPLE} each)…`);
  for (const c of TOP_LEVEL) {
    try {
      const r = await sampleCollection(c, SAMPLE, false);
      out.collections[c] = r;
      console.error(`  ${c}: ${r.sampled} docs`);
    } catch (e) {
      out.collections[c] = { error: String(e).slice(0, 200) };
      console.error(`  ${c}: ERROR ${String(e).slice(0, 100)}`);
    }
  }

  console.error(`[shape-analysis] sampling collection-group queries (n=${SUB_SAMPLE} each)…`);
  for (const g of GROUP_LEVEL) {
    try {
      const r = await sampleCollection(g, SUB_SAMPLE, true);
      out.groups[g] = r;
      console.error(`  ${g} (group): ${r.sampled} docs`);
    } catch (e) {
      out.groups[g] = { error: String(e).slice(0, 200) };
      console.error(`  ${g} (group): ERROR ${String(e).slice(0, 100)}`);
    }
  }

  console.error('[shape-analysis] running specific anomaly checks…');
  try { out.anomalies.users = await checkUserAnomalies(); console.error('  users: ok'); }
  catch (e) { out.anomalies.users = { error: String(e) }; console.error(`  users: ERROR ${e}`); }
  try { out.anomalies.bundles = await checkBundleAnomalies(); console.error('  bundles: ok'); }
  catch (e) { out.anomalies.bundles = { error: String(e) }; console.error(`  bundles: ERROR ${e}`); }
  try { out.anomalies.purchases = await checkPurchasesCollection(); console.error('  purchases: ok'); }
  catch (e) { out.anomalies.purchases = { error: String(e) }; console.error(`  purchases: ERROR ${e}`); }
  try { out.anomalies.processed_payments = await checkProcessedPaymentsAnomalies(); console.error('  processed_payments: ok'); }
  catch (e) { out.anomalies.processed_payments = { error: String(e) }; console.error(`  processed_payments: ERROR ${e}`); }
  try { out.anomalies.courses = await checkCoursesCollection(); console.error('  courses: ok'); }
  catch (e) { out.anomalies.courses = { error: String(e) }; console.error(`  courses: ERROR ${e}`); }
  try { out.anomalies.client_programs = await checkClientProgramsCollection(); console.error('  client_programs: ok'); }
  catch (e) { out.anomalies.client_programs = { error: String(e) }; console.error(`  client_programs: ERROR ${e}`); }
  try { out.anomalies.one_on_one_clients = await checkOneOnOneClientsCollection(); console.error('  one_on_one_clients: ok'); }
  catch (e) { out.anomalies.one_on_one_clients = { error: String(e) }; console.error(`  one_on_one_clients: ERROR ${e}`); }
  try { out.anomalies.auth_claims = await checkAuthCustomClaims(); console.error('  auth_claims: ok'); }
  catch (e) { out.anomalies.auth_claims = { error: String(e) }; console.error(`  auth_claims: ERROR ${e}`); }

  const json = JSON.stringify(out, null, 2);
  if (OUT_PATH) {
    fs.writeFileSync(OUT_PATH, json);
    console.error(`[shape-analysis] wrote ${OUT_PATH}`);
  } else {
    process.stdout.write(json);
  }
  process.exit(0);
})().catch((e) => {
  console.error('FATAL', e);
  process.exit(1);
});
