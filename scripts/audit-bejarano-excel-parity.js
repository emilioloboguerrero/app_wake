#!/usr/bin/env node
'use strict';

/**
 * Cross-reference each Excel-sourced course-session in prod vs the Excel source
 * of truth, using the TITLE_MAP + EXCEL_NAME_MAP from bejarano-excel-data.js.
 * Read-only.
 *
 * Prereq: /tmp/bejarano-audit.json from audit-bejarano-dump.js.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const AUDIT = JSON.parse(fs.readFileSync('/tmp/bejarano-audit.json', 'utf8'));
const { loadExcelSessions, TITLE_MAP } = require('./bejarano-excel-data.js');

const { sessions: excelExpected, warnings } = loadExcelSessions();

// Group expected Excel sessions by title (TITLE_MAP deduplicates some)
const byTitle = {};
for (const es of excelExpected) {
  // Keep the first — loadExcelSessions already dedupes by content sig.
  byTitle[es.title] = es;
}

// Map of course title → Excel titles (in order)
const COURSE_EXPECTED = {
  'Full body en casa (5 días)': [
    'Full body en casa 1', 'Full body en casa 2', 'Full body en casa 3',
    'Full body en casa 4', 'Full body en casa 5',
  ],
  'Full body gym (3 días)': [
    'Full body gym — sentadilla y chest row',
    'Full body gym — banca y RDL',
    'Full body gym — pulldown y lunge',
  ],
  'Superior-Inferior (4 días)': [
    'Pierna — back squat y RDL',
    'Tren superior — banca y chest row',
    'Pierna — peso muerto y prensa',
    'Tren superior — incline y dominada',
  ],
  'PPL + Superior (5 días)': [
    'Pierna — back squat y RDL',
    'Empuje — banca pies arriba',
    'Jalón — pulldown y chest row',
    'Pierna — peso muerto y prensa',
    'Tren superior — completo',
  ],
  'Push-Pull-Legs (6 días)': [
    'Pierna — back squat y RDL',
    'Empuje — banca pies arriba',
    'Jalón — pulldown y chest row',
    'Pierna — peso muerto y prensa',
    'Empuje — incline y diamond',
    'Jalón — unilateral',
  ],
  'Glute Optimization (5 días)': [
    'Glúteos — sentadilla y RDL',
    'Glúteos — tren superior 1',
    'Glúteos — hip thrust e hiperextensión',
    'Glúteos — tren superior 2',
    'Glúteos — pierna opcional',
  ],
};

function pad(s, n) { return (s + '').padEnd(n); }

function section(t) {
  console.log('\n' + '='.repeat(80));
  console.log(t);
  console.log('='.repeat(80));
}

// ---------- 1. Session library coverage ----------

section('1. LIBRARY COVERAGE — does every expected Excel session exist in the library?');

const libTitles = new Set(AUDIT.sessions.map((s) => s.title));
const expectedTitles = new Set(Object.values(COURSE_EXPECTED).flat());
expectedTitles.add('Abdomen'); // standalone

let missing = 0;
for (const t of expectedTitles) {
  if (!libTitles.has(t)) {
    console.log(`  MISSING: "${t}"`);
    missing++;
  }
}
console.log(`\n  expected: ${expectedTitles.size}, in library: ${[...expectedTitles].filter((t) => libTitles.has(t)).length}, missing: ${missing}`);

// Also: any extra library sessions beyond expected?
const nonPdfTitlePatterns = [
  /^Full body —/, /^Pierna —/, /^Torso —/, /^Empuje —/, /^Jalón —/,  // PDF
  /^Full body en casa/, /^Full body gym/, /^Tren superior/, /^Glúteos/, /^Abdomen/,
];
const extras = [...libTitles].filter((t) => !expectedTitles.has(t) && !nonPdfTitlePatterns.some((p) => p.test(t)));
console.log(`\n  extra (non-PDF, non-expected-Excel): ${extras.length}`);
extras.forEach((t) => console.log(`    • ${t}`));

// ---------- 2. Course-session exercise parity ----------

section('2. COURSE-SESSION EXERCISE PARITY vs Excel source');

const oneOnOne = AUDIT.courses.filter((c) => c.deliveryType === 'one_on_one');

let totalSessions = 0;
let exactMatches = 0;
let mismatches = 0;

for (const course of oneOnOne) {
  const expectedTitles = COURSE_EXPECTED[course.title];
  if (!expectedTitles) {
    console.log(`\n  [${course.title}] NO EXPECTED MAP — skipping`);
    continue;
  }
  console.log(`\n${course.title}`);

  const courseSessions = course.modules[0]?.sessions || [];
  for (let i = 0; i < expectedTitles.length; i++) {
    totalSessions++;
    const expectedTitle = expectedTitles[i];
    const cs = courseSessions[i];
    if (!cs) {
      console.log(`  [${i}] expected "${expectedTitle}" but course has no session at this order`);
      mismatches++;
      continue;
    }
    const titleMatch = cs.title === expectedTitle;
    const excel = byTitle[expectedTitle];
    if (!excel) {
      console.log(`  [${i}] "${cs.title}" — no excel source found for "${expectedTitle}"`);
      mismatches++;
      continue;
    }
    const excelNames = excel.exercises.map((e) => e.name);
    const courseNames = cs.exercises.map((e) => e.primary ? Object.values(e.primary)[0] : '(none)');

    const extra = courseNames.filter((n) => !excelNames.includes(n));
    const miss = excelNames.filter((n) => !courseNames.includes(n));

    // Also compare sets (length + intensities)
    const setIssues = [];
    for (let j = 0; j < Math.min(excel.exercises.length, cs.exercises.length); j++) {
      const xe = excel.exercises[j];
      const ce = cs.exercises[j];
      const xName = xe.name;
      const cName = ce.primary ? Object.values(ce.primary)[0] : '(none)';
      if (xName !== cName) continue; // counted in extra/miss already
      const xSets = xe.sets;
      const cSets = ce.sets || [];
      if (xSets.length !== cSets.length) {
        setIssues.push(`ex#${j} "${xName}" set-count excel=${xSets.length} course=${cSets.length}`);
        continue;
      }
      for (let k = 0; k < xSets.length; k++) {
        const xs = xSets[k], cs2 = cSets[k];
        const diffs = [];
        if (xs.title !== cs2.title) diffs.push(`title "${xs.title}"!="${cs2.title}"`);
        if (String(xs.reps) !== String(cs2.reps)) diffs.push(`reps "${xs.reps}"!="${cs2.reps}"`);
        if (xs.intensity !== cs2.intensity) diffs.push(`int ${xs.intensity}!=${cs2.intensity}`);
        if (diffs.length) setIssues.push(`ex#${j} "${xName}" set#${k}: ${diffs.join(', ')}`);
      }
    }

    if (titleMatch && !extra.length && !miss.length && !setIssues.length) {
      console.log(`  [${i}] "${cs.title}" — EXACT MATCH (${excelNames.length} ex)`);
      exactMatches++;
    } else {
      mismatches++;
      console.log(`  [${i}] "${cs.title}" — MISMATCH`);
      if (!titleMatch) console.log(`       title: course="${cs.title}" expected="${expectedTitle}"`);
      if (miss.length) console.log(`       missing in course: ${JSON.stringify(miss)}`);
      if (extra.length) console.log(`       extra in course:   ${JSON.stringify(extra)}`);
      if (setIssues.length) {
        console.log(`       set issues (${setIssues.length}):`);
        setIssues.slice(0, 10).forEach((s) => console.log(`         - ${s}`));
        if (setIssues.length > 10) console.log(`         ... (+${setIssues.length - 10} more)`);
      }
    }
  }
}

section('SUMMARY');
console.log(`total one-on-one course-sessions checked: ${totalSessions}`);
console.log(`exact matches: ${exactMatches}`);
console.log(`mismatches:    ${mismatches}`);
if (warnings.length) {
  console.log(`\nloader warnings: ${warnings.length}`);
  warnings.forEach((w) => console.log(`  - ${w}`));
}
