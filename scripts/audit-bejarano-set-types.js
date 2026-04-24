#!/usr/bin/env node
'use strict';

/**
 * READ-ONLY audit of Felipe Bejarano's planned-set data types.
 *
 * Reads /tmp/bejarano-audit.json (produced by audit-bejarano-dump.js) and
 * flags every set where `reps` / `intensity` / `title` violates the Wake
 * planned-set schema.
 *
 * Schema (planned sets in library sessions / courses / plans):
 *   - order:     number (0-indexed)
 *   - title:     string  (e.g. "Serie 1", "Cal 1")
 *   - reps:      string  — digits and optional hyphen for ranges (e.g. "8", "8-10")
 *   - intensity: string  — "N/10" where N is 1..10
 *   - id:        string (optional)
 *
 * The PWA parses `reps` via parseFloat(). Any letters, unit suffixes ("60s",
 * "kg", "m"), non-ASCII hyphens (en-dash), or alternative separators cause
 * the set to be dropped on completion.
 *
 * Writes nothing. Emits report to stdout.
 *
 * Usage: node scripts/audit-bejarano-set-types.js > /tmp/bejarano-set-types.txt
 */

const fs = require('fs');
const AUDIT = JSON.parse(fs.readFileSync('/tmp/bejarano-audit.json', 'utf8'));

// --- Validators -------------------------------------------------------------

// Accepted reps: digits only, or "digits-digits" range.
const REPS_STRICT_RE = /^[0-9]+(-[0-9]+)?$/;

// Accepted intensity: "N/10" where N in 1..10.
const INTENSITY_STRICT_RE = /^(10|[1-9])\/10$/;

function classifyReps(raw) {
  if (raw === null || raw === undefined) return 'missing';
  if (typeof raw !== 'string') return `not-string(${typeof raw})`;
  const r = raw.trim();
  if (r === '') return 'empty';
  if (REPS_STRICT_RE.test(r)) return 'ok';

  const issues = [];
  if (/[a-zA-Z]/.test(r)) {
    // narrow down what kind of letters
    if (/^\s*\d+\s*s\s*$/i.test(r)) issues.push('seconds-suffix');       // "60s"
    else if (/^\s*\d+\s*(min|m)\s*$/i.test(r)) issues.push('minutes-suffix');
    else if (/^\s*\d+\s*kg\s*$/i.test(r)) issues.push('kg-suffix');
    else if (/amrap/i.test(r)) issues.push('AMRAP');
    else if (/iso|hold/i.test(r)) issues.push('iso/hold');
    else if (/fallo|failure/i.test(r)) issues.push('failure');
    else if (/[a-z](?=\s*-?\s*\d)/i.test(r) || /\d\s*[a-z]\s*\d/i.test(r)) issues.push('letter-separator');
    else issues.push('contains-letters');
  }
  if (/[–—]/.test(r)) issues.push('non-ascii-dash');
  if (/\sa\s|\sto\s/i.test(r)) issues.push('word-separator');
  if (/[_\/]/.test(r) && !/[a-z]/i.test(r)) issues.push('non-hyphen-separator');
  if (/,/.test(r)) issues.push('comma');
  if (/-{2,}/.test(r)) issues.push('double-hyphen');
  if (/^-/.test(r)) issues.push('leading-hyphen');
  if (/-$/.test(r)) issues.push('trailing-hyphen');
  if (/\s/.test(r)) issues.push('whitespace');
  if (/\+/.test(r)) issues.push('plus-sign');
  if (!issues.length) issues.push('unclassified');

  // also check hyphen-range semantics if it has a hyphen
  const m = r.match(/^(\d+)-(\d+)$/);
  if (m) {
    const [, lo, hi] = m;
    if (Number(lo) > Number(hi)) issues.push('range-lo-gt-hi');
  }
  return issues.join(',');
}

function classifyIntensity(raw) {
  if (raw === null || raw === undefined) return 'missing';
  if (typeof raw !== 'string') return `not-string(${typeof raw})`;
  const r = raw.trim();
  if (r === '') return 'empty';
  if (INTENSITY_STRICT_RE.test(r)) return 'ok';

  const issues = [];
  if (!/\/10$/.test(r)) issues.push('no-/10-suffix');
  const m = r.match(/^(\d+)\/10$/);
  if (m) {
    const n = Number(m[1]);
    if (n > 10) issues.push('value-gt-10');
    if (n < 1) issues.push('value-lt-1');
  }
  if (/[a-z]/i.test(r)) issues.push('contains-letters');
  if (/\s/.test(r)) issues.push('whitespace');
  if (!issues.length) issues.push('unclassified');
  return issues.join(',');
}

// --- Walker -----------------------------------------------------------------

const findings = []; // { scope, coursePath, sessionTitle, exerciseName, setTitle, setIndex, field, value, issue }

function pushIssue(rec, field, value, issue) {
  findings.push({ ...rec, field, value: JSON.stringify(value), issue });
}

function walkSets(sets, baseRec) {
  (sets || []).forEach((s, i) => {
    const rec = { ...baseRec, setIndex: i, setTitle: s.title || null, setOrder: s.order ?? null };

    // reps
    const repsCls = classifyReps(s.reps);
    if (repsCls !== 'ok') pushIssue(rec, 'reps', s.reps, repsCls);

    // intensity
    const intCls = classifyIntensity(s.intensity);
    if (intCls !== 'ok') pushIssue(rec, 'intensity', s.intensity, intCls);

    // title
    if (typeof s.title !== 'string' || s.title.trim() === '') {
      pushIssue(rec, 'title', s.title, typeof s.title !== 'string' ? `not-string(${typeof s.title})` : 'empty');
    }

    // order
    if (typeof s.order !== 'number' || !Number.isInteger(s.order) || s.order < 0) {
      pushIssue(rec, 'order', s.order, `bad-order(${typeof s.order})`);
    }

    // unknown fields — flag anything outside the known set
    const KNOWN = new Set(['order', 'title', 'reps', 'intensity', 'id']);
    for (const k of Object.keys(s)) {
      if (!KNOWN.has(k)) pushIssue(rec, k, s[k], 'unknown-field');
    }
  });
}

function walkExercise(ex, rec) {
  const exName = ex.primary && typeof ex.primary === 'object'
    ? Object.values(ex.primary)[0]
    : (ex.name || '(no-primary)');
  walkSets(ex.sets, { ...rec, exerciseName: exName, exerciseOrder: ex.order ?? null });
}

function walkSession(sess, rec) {
  (sess.exercises || []).forEach((ex) => walkExercise(ex, {
    ...rec,
    sessionTitle: sess.title || '(no-title)',
    sessionId: sess.sessionId,
  }));
}

// Library sessions
(AUDIT.sessions || []).forEach((sess) => walkSession(sess, {
  scope: 'library',
  coursePath: `creator_libraries/${AUDIT.felipeUid}`,
}));

// Courses
(AUDIT.courses || []).forEach((c) => {
  (c.modules || []).forEach((m) => {
    (m.sessions || []).forEach((sess) => walkSession(sess, {
      scope: c.deliveryType || 'course',
      coursePath: `courses/${c.courseId} — "${c.title}" › module "${m.title || m.moduleId}"`,
    }));
  });
});

// Plans
(AUDIT.plans || []).forEach((p) => {
  (p.modules || []).forEach((m) => {
    (m.sessions || []).forEach((sess) => walkSession(sess, {
      scope: 'plan',
      coursePath: `plans/${p.planId} — "${p.title || '(untitled)'}" › module "${m.title || m.moduleId}"`,
    }));
  });
});

// --- Report -----------------------------------------------------------------

function bar(title) {
  console.log('\n' + '='.repeat(78));
  console.log(title);
  console.log('='.repeat(78));
}

bar('FELIPE BEJARANO — PLANNED-SET TYPE AUDIT');

const totalSets = (() => {
  let n = 0;
  const countSets = (sess) => (sess.exercises || []).forEach((e) => { n += (e.sets || []).length; });
  (AUDIT.sessions || []).forEach(countSets);
  (AUDIT.courses || []).forEach((c) => (c.modules || []).forEach((m) => (m.sessions || []).forEach(countSets)));
  (AUDIT.plans || []).forEach((p) => (p.modules || []).forEach((m) => (m.sessions || []).forEach(countSets)));
  return n;
})();

console.log(`Total planned sets scanned: ${totalSets}`);
console.log(`Findings:                   ${findings.length}`);

// Group by (field, issue)
const byIssue = {};
for (const f of findings) {
  const k = `${f.field} | ${f.issue}`;
  (byIssue[k] = byIssue[k] || []).push(f);
}
const sortedKeys = Object.keys(byIssue).sort((a, b) => byIssue[b].length - byIssue[a].length);

bar('SUMMARY BY ISSUE');
for (const k of sortedKeys) {
  console.log(`  ${byIssue[k].length.toString().padStart(5)}   ${k}`);
}

// Unique offending values per field
bar('UNIQUE OFFENDING VALUES');
for (const field of ['reps', 'intensity', 'title', 'order']) {
  const vals = new Map(); // value -> count
  findings.filter((f) => f.field === field).forEach((f) => {
    vals.set(f.value, (vals.get(f.value) || 0) + 1);
  });
  if (vals.size === 0) continue;
  console.log(`\n[${field}] unique bad values (${vals.size}):`);
  [...vals.entries()].sort((a, b) => b[1] - a[1]).forEach(([v, c]) => {
    console.log(`    ${c.toString().padStart(4)}  ${v}`);
  });
}

// Detailed list by scope
bar('DETAILED FINDINGS (grouped by location)');
const byLoc = {};
for (const f of findings) {
  const k = `${f.scope}   ${f.coursePath}   ›  ${f.sessionTitle}  [${f.sessionId}]`;
  (byLoc[k] = byLoc[k] || []).push(f);
}
const locKeys = Object.keys(byLoc).sort();
for (const k of locKeys) {
  console.log(`\n▸ ${k}  (${byLoc[k].length} issues)`);
  for (const f of byLoc[k]) {
    console.log(`    · ${f.exerciseName}  set#${f.setIndex}(${f.setTitle || '-'})  ${f.field}=${f.value}  →  ${f.issue}`);
  }
}

console.log('\nDone.');
