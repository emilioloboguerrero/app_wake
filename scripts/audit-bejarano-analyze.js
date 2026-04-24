#!/usr/bin/env node
'use strict';

/**
 * Reads /tmp/bejarano-audit.json (produced by audit-bejarano-dump.js) and
 * cross-references it against:
 *   - bejarano_programs/*.json                 (low-ticket course specs)
 *   - excel_bejarano/parsed/_sessions.json     (Excel session specs)
 *   - excel_bejarano/HANDOFF.md §4             (PDF session inventory — via hardcoded list)
 *
 * Writes nothing. Emits human-readable audit report to stdout.
 *
 * Usage: node scripts/audit-bejarano-analyze.js > /tmp/bejarano-audit-report.txt
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const AUDIT = JSON.parse(fs.readFileSync('/tmp/bejarano-audit.json', 'utf8'));

// -------- Helpers --------

function section(title) {
  console.log('\n' + '='.repeat(78));
  console.log(title);
  console.log('='.repeat(78));
}
function sub(title) {
  console.log('\n--- ' + title + ' ---');
}

const ALLOWED_IMPLEMENTS = new Set([
  'Agarre Amplio', 'Agarre Cerrado', 'Agarre en "V"', 'Banco', 'Banco Inclinado',
  'Bandas de Resistencia', 'Barra', 'Barra T', 'Cable', 'Mancuernas', 'Máquina',
  'Máquina Smith', 'Otro', 'Paralelas', 'Peso Corporal', 'Silla de Predicador',
]);
const ALLOWED_MUSCLES = new Set([
  'abs', 'biceps', 'calves', 'forearms', 'front_delts', 'glutes', 'hamstrings',
  'hip_flexors', 'lats', 'lower_back', 'obliques', 'pecs', 'quads', 'rear_delts',
  'rhomboids', 'side_delts', 'traps', 'triceps',
]);

// Heuristic primary-muscle map by exercise name keywords.
// Purpose: flag entries where muscle_activation clearly mismatches the name.
// Each rule: regex tested against exercise name (uppercase), plus list of
// muscles EXPECTED to dominate (≥40%) and muscles that SHOULDN'T dominate.
const MUSCLE_RULES = [
  { pattern: /PRESS.*BANCA|PRESS.*PLANO/i,          expect: ['pecs'],      forbid: [] },
  { pattern: /PRESS.*INCLINAD/i,                    expect: ['pecs', 'front_delts'], forbid: [] },
  { pattern: /PRESS.*MILITAR|PRESS.*HOMBRO/i,       expect: ['front_delts'], forbid: [] },
  { pattern: /SENTADILLA(?!.*BULGAR)/i,             expect: ['quads', 'glutes'], forbid: [] },
  { pattern: /SENTADILLA.*B[UÚ]LGAR/i,              expect: ['quads', 'glutes'], forbid: [] },
  { pattern: /SENTADILLA.*FRONTAL|SAFETY/i,         expect: ['quads'],     forbid: [] },
  { pattern: /PESO MUERTO RUMANO|\bRDL\b/i,         expect: ['hamstrings', 'glutes'], forbid: [] },
  { pattern: /^PESO MUERTO(?!.*RUMANO)/i,           expect: ['hamstrings', 'glutes', 'lower_back'], forbid: [] },
  { pattern: /HIP THRUST/i,                         expect: ['glutes'],    forbid: [] },
  { pattern: /DOMINADA|PULL.?UP|CHIN.?UP/i,         expect: ['lats'],      forbid: [] },
  { pattern: /JAL[OÓ]N.*PECHO|PULL.?DOWN/i,         expect: ['lats'],      forbid: [] },
  { pattern: /REMO(?!.*MENT[OÓ]N)/i,                expect: ['lats', 'rhomboids'], forbid: [] },
  { pattern: /REMO.*MENT[OÓ]N|REMO ERGUIDO/i,       expect: ['side_delts', 'traps'], forbid: [] },
  { pattern: /CURL DE B[IÍ]CEPS|CURL.*MARTILLO|CURL.*PREDICADOR|CURL.*BAYESIAN|CURL.*SPIDERMAN|CURL.*INCLINAD|CURL.*SUPIN|CURL.*PRONAD|CURL.*CONCENTR|CURL.*BARRA|CURL.*BICEPS/i, expect: ['biceps'], forbid: [] },
  { pattern: /TR[IÍ]CEPS|ROMPE CR[AÁ]NEOS|PRESS FRANC[EÉ]S|PATADA.*TR[IÍ]CEPS|PUSH.?DOWN/i, expect: ['triceps'], forbid: [] },
  { pattern: /FONDOS/i,                             expect: ['triceps', 'pecs'], forbid: [] },
  { pattern: /FACE PULL|VUELOS INVERTID/i,          expect: ['rear_delts'], forbid: [] },
  { pattern: /ELEVACIONES LATERALES/i,              expect: ['side_delts'], forbid: [] },
  { pattern: /ELEVACI[OÓ]N.*FRONTAL|FRONT RAISE/i,  expect: ['front_delts'], forbid: [] },
  { pattern: /CURL DE PIERNA|LEG CURL/i,            expect: ['hamstrings'], forbid: [] },
  { pattern: /EXTENSI[OÓ]N DE RODILLA/i,            expect: ['quads'],     forbid: [] },
  { pattern: /PRENSA/i,                             expect: ['quads', 'glutes'], forbid: [] },
  { pattern: /ABDUCCI[OÓ]N/i,                       expect: ['glutes'],    forbid: [] },
  { pattern: /ELEVACIONES? DE TALONES|CALF RAISE/i, expect: ['calves'],    forbid: [] },
  { pattern: /CRUNCH|PLANCHA|RUEDA ABDOMINAL|ELEVACIONES? DE PIERNAS|HANGING LEG|AB WHEEL/i, expect: ['abs'], forbid: [] },
  { pattern: /BUENOS D[IÍ]AS|GOOD MORNING/i,        expect: ['hamstrings', 'lower_back', 'glutes'], forbid: [] },
  { pattern: /HIPEREXTENSI[OÓ]N/i,                  expect: ['lower_back', 'glutes', 'hamstrings'], forbid: [] },
  { pattern: /GLUTE HAM|NORDIC|N[OÓ]RDICO/i,        expect: ['hamstrings'], forbid: [] },
  { pattern: /VUELOS.*PECTORAL|PEC ?FLY|PEC ?DECK/i,expect: ['pecs'],      forbid: [] },
  { pattern: /ENCOGIMIENTO|SHRUG/i,                 expect: ['traps'],     forbid: [] },
  { pattern: /PULL OVER/i,                          expect: ['lats'],      forbid: [] },
  { pattern: /FROG PUMP/i,                          expect: ['glutes'],    forbid: [] },
  { pattern: /SISSY/i,                              expect: ['quads'],     forbid: [] },
  { pattern: /CLAM/i,                               expect: ['glutes'],    forbid: [] },
  { pattern: /PULL THROUGH/i,                       expect: ['glutes', 'hamstrings'], forbid: [] },
  { pattern: /CAMINATA.*BANDA|ZANCADA|LUNGE/i,      expect: ['glutes', 'quads'], forbid: [] },
  { pattern: /ENTERRADOR/i,                         expect: ['glutes', 'quads'], forbid: [] },
];

// Implements expectations — which exercises MUST have a specific implement.
const IMPLEMENT_RULES = [
  { pattern: /MANCUERNA/i,                          required: ['Mancuernas'] },
  { pattern: /\bEN BARRA\b|CON BARRA|BARRA HORIZONTAL|BARRA PARADO/i, required: ['Barra'] },
  { pattern: /EN CABLE|\bCABLE\b/i,                 required: ['Cable'] },
  { pattern: /EN M[AÁ]QUINA/i,                      required: ['Máquina'] },
  { pattern: /MULTIPOWER|SMITH/i,                   required: ['Máquina Smith'] },
  { pattern: /PARALELAS/i,                          required: ['Paralelas'] },
  { pattern: /PESO CORPORAL|PUSH ?UP|FLEXIONES|PLANCHA|CRUNCH(?!.*CABLE)/i, required: ['Peso Corporal'] },
  { pattern: /BANCO INCLINAD|BANCA INCLINAD|PRESS INCLINAD/i, required: ['Banco Inclinado'] },
  { pattern: /PREDICADOR/i,                         required: ['Silla de Predicador'] },
  { pattern: /AGARRE AMPLIO/i,                      required: ['Agarre Amplio'] },
  { pattern: /AGARRE CERRADO/i,                     required: ['Agarre Cerrado'] },
  { pattern: /AGARRE NEUTRO|AGARRE EN "?V"?/i,      required: ['Agarre en "V"'] },
  { pattern: /BANDA/i,                              required: ['Bandas de Resistencia'] },
];

// --------- 1. Library exercise audit ---------

section('1. EXERCISE LIBRARY AUDIT');

const lib = AUDIT.library;
console.log(`Library id:    ${lib.id}`);
console.log(`Title:         ${lib.title}`);
console.log(`Exercise count: ${lib.exerciseCount}`);

const names = Object.keys(lib.exercises);

// 1a. Schema validation — every entry has muscle_activation + implements
sub('1a. Schema presence');
const missingFields = [];
for (const name of names) {
  const ex = lib.exercises[name];
  const miss = [];
  if (!ex.muscle_activation || typeof ex.muscle_activation !== 'object') miss.push('muscle_activation');
  if (!Array.isArray(ex.implements)) miss.push('implements');
  if (miss.length) missingFields.push({ name, miss });
}
if (missingFields.length === 0) {
  console.log('OK: all 115 entries have both muscle_activation and implements.');
} else {
  console.log(`FAIL: ${missingFields.length} entries missing fields:`);
  missingFields.forEach((m) => console.log(`  - ${m.name}: missing ${m.miss.join(', ')}`));
}

// 1b. Implements enum compliance
sub('1b. Implements enum compliance');
const implEnumIssues = [];
for (const name of names) {
  const ex = lib.exercises[name];
  if (!Array.isArray(ex.implements)) continue;
  const bad = ex.implements.filter((i) => !ALLOWED_IMPLEMENTS.has(i));
  if (bad.length) implEnumIssues.push({ name, bad });
}
if (implEnumIssues.length === 0) {
  console.log('OK: all implements match the 16-value enum.');
} else {
  console.log(`FAIL: ${implEnumIssues.length} entries with non-enum implement values:`);
  implEnumIssues.forEach((m) => console.log(`  - ${m.name}: [${m.bad.join(', ')}]`));
}

// 1c. Muscle enum compliance + percentages
sub('1c. Muscle enum + percentage sanity');
const muscleIssues = [];
for (const name of names) {
  const ex = lib.exercises[name];
  if (!ex.muscle_activation || typeof ex.muscle_activation !== 'object') continue;
  const problems = [];
  const sum = Object.values(ex.muscle_activation).reduce((a, b) => a + (typeof b === 'number' ? b : 0), 0);
  for (const [m, v] of Object.entries(ex.muscle_activation)) {
    if (!ALLOWED_MUSCLES.has(m)) problems.push(`unknown muscle "${m}"`);
    if (typeof v !== 'number' || v < 0 || v > 100) problems.push(`"${m}"=${v} out of 0-100`);
  }
  if (Object.keys(ex.muscle_activation).length === 0) problems.push('empty muscle_activation');
  if (sum === 0 && Object.keys(ex.muscle_activation).length > 0) problems.push('all-zero muscle_activation');
  if (problems.length) muscleIssues.push({ name, problems });
}
if (muscleIssues.length === 0) {
  console.log('OK: all muscle_activation entries use the 18-value enum and have 0-100 values with at least one non-zero.');
} else {
  console.log(`FAIL: ${muscleIssues.length} entries with muscle issues:`);
  muscleIssues.forEach((m) => console.log(`  - ${m.name}: ${m.problems.join('; ')}`));
}

// 1d. Semantic primary-muscle check
sub('1d. Semantic muscle_activation mismatch (heuristic)');
const semanticIssues = [];
for (const name of names) {
  const ex = lib.exercises[name];
  if (!ex.muscle_activation) continue;
  const ma = ex.muscle_activation;
  // find the dominant muscle (highest %)
  const sorted = Object.entries(ma).sort((a, b) => (b[1] || 0) - (a[1] || 0));
  if (!sorted.length) continue;
  const dominant = sorted[0][0];
  const dominantPct = sorted[0][1];

  for (const rule of MUSCLE_RULES) {
    if (rule.pattern.test(name)) {
      const meetsExpected = rule.expect.some((m) => (ma[m] || 0) >= 40 || m === dominant);
      if (!meetsExpected) {
        semanticIssues.push({
          name,
          dominant: `${dominant} (${dominantPct})`,
          expectedOneOf: rule.expect,
        });
      }
      break;
    }
  }
}
if (semanticIssues.length === 0) {
  console.log('OK: dominant muscle matches expected primary muscle for all rule-matched names.');
} else {
  console.log(`FLAGGED: ${semanticIssues.length} entries where dominant muscle seems off:`);
  semanticIssues.forEach((m) => console.log(`  - ${m.name}: dominant=${m.dominant}, expected one of [${m.expectedOneOf.join(', ')}]`));
}

// 1e. Implements semantic check
sub('1e. Implements semantic check (heuristic)');
const implSemanticIssues = [];
for (const name of names) {
  const ex = lib.exercises[name];
  if (!Array.isArray(ex.implements)) continue;
  for (const rule of IMPLEMENT_RULES) {
    if (rule.pattern.test(name)) {
      const missing = rule.required.filter((r) => !ex.implements.includes(r));
      if (missing.length) implSemanticIssues.push({ name, missing, have: ex.implements });
    }
  }
}
if (implSemanticIssues.length === 0) {
  console.log('OK: implements align with exercise names.');
} else {
  console.log(`FLAGGED: ${implSemanticIssues.length} entries with missing expected implements:`);
  implSemanticIssues.forEach((m) => console.log(`  - ${m.name}: missing [${m.missing.join(', ')}], have [${m.have.join(', ')}]`));
}

// 1f. Duplicate / near-duplicate check
sub('1f. Duplicate / near-duplicate names');
function normalize(s) {
  return s
    .toUpperCase()
    .normalize('NFD').replace(/\p{Diacritic}/gu, '')
    .replace(/[()]/g, ' ')
    .replace(/\bDE\b/g, ' ')
    .replace(/\bEN\b/g, ' ')
    .replace(/\bLA\b/g, ' ')
    .replace(/\bEL\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
const normMap = {};
for (const name of names) {
  const key = normalize(name);
  (normMap[key] = normMap[key] || []).push(name);
}
const dupBuckets = Object.entries(normMap).filter(([, v]) => v.length > 1);
if (!dupBuckets.length) {
  console.log('No exact-after-normalization duplicates.');
} else {
  console.log(`FLAGGED: ${dupBuckets.length} potential duplicate clusters:`);
  dupBuckets.forEach(([k, v]) => console.log(`  - [${k}] -> ${v.map((n) => '"' + n + '"').join(', ')}`));
}
// Also near-duplicate: one name is substring of another
sub('1f. Name-contains-name (superset) check');
const containPairs = [];
for (let i = 0; i < names.length; i++) {
  for (let j = 0; j < names.length; j++) {
    if (i === j) continue;
    const a = normalize(names[i]);
    const b = normalize(names[j]);
    if (a.length >= 10 && b.startsWith(a + ' ')) {
      containPairs.push([names[i], names[j]]);
    }
  }
}
if (!containPairs.length) {
  console.log('No name-prefix containment issues.');
} else {
  console.log(`FLAGGED: ${containPairs.length} name-prefix pairs (one could shadow the other):`);
  containPairs.forEach(([a, b]) => console.log(`  - "${a}" is prefix of "${b}"`));
}

// --------- 2. Library session audit ---------

section('2. LIBRARY SESSION AUDIT');

const sessions = AUDIT.sessions;
console.log(`Session count: ${sessions.length}`);

// 2a. Expected PDF session titles (from HANDOFF §4 + current naming convention)
const EXPECTED_PDF_TITLES = [
  // Novatos (3)
  'Novatos — sentadilla y press banca',
  'Novatos — peso muerto y press militar',
  'Novatos — búlgara y press inclinado',
  // Intermedios B1 (4)
  'Intermedios B1 — pierna peso muerto',
  'Intermedios B1 — torso press banca',
  'Intermedios B1 — pierna sentadilla',
  'Intermedios B1 — torso dominadas',
  // Intermedios B2 (4)
  'Intermedios B2 — pierna sentadilla',
  'Intermedios B2 — torso press banca',
  'Intermedios B2 — pierna peso muerto',
  'Intermedios B2 — torso press militar',
  // Avanzados B1 (6)
  'Avanzados B1 — pierna sentadilla',
  'Avanzados B1 — empuje press banca',
  'Avanzados B1 — jalón dominadas',
  'Avanzados B1 — pierna peso muerto',
  'Avanzados B1 — empuje press militar',
  'Avanzados B1 — jalón polea alta',
  // Avanzados B2 (6)
  'Avanzados B2 — pierna peso muerto',
  'Avanzados B2 — empuje press banca',
  'Avanzados B2 — jalón dominadas',
  'Avanzados B2 — pierna sentadilla',
  'Avanzados B2 — empuje press militar',
  'Avanzados B2 — jalón polea alta',
];

// 2b. Title list as-is
sub('2a. Library session titles');
sessions.forEach((s) => console.log(`  [${s.sessionId}] "${s.title}"  (${s.exercises.length} exercises)`));

// 2c. Intra-session duplicate primary exercise check
sub('2b. Intra-session primary duplicates');
const intraDupes = [];
for (const s of sessions) {
  const seen = {};
  for (const e of s.exercises) {
    const key = e.primary && typeof e.primary === 'object'
      ? Object.values(e.primary)[0]
      : (e.name || '(no-primary)');
    if (seen[key]) {
      intraDupes.push({ title: s.title, sessionId: s.sessionId, key, positions: [seen[key], e.order] });
    } else {
      seen[key] = e.order;
    }
  }
}
if (!intraDupes.length) {
  console.log('OK: no session has the same primary exercise listed twice.');
} else {
  console.log(`FLAGGED: ${intraDupes.length} intra-session duplicates:`);
  intraDupes.forEach((d) => console.log(`  - [${d.sessionId}] "${d.title}": "${d.key}" at orders ${d.positions.join(' & ')}`));
}

// 2d. Session → primary always references the correct LIB_ID
sub('2c. All primary refs point to LIB_ID');
const wrongLib = [];
for (const s of sessions) {
  for (const e of s.exercises) {
    if (!e.primary || typeof e.primary !== 'object') {
      wrongLib.push({ title: s.title, exerciseId: e.exerciseId, issue: 'no primary' });
      continue;
    }
    const k = Object.keys(e.primary)[0];
    if (k !== AUDIT.libId) {
      wrongLib.push({ title: s.title, exerciseId: e.exerciseId, issue: `primary key is ${k}, not LIB_ID` });
    }
  }
}
if (!wrongLib.length) console.log('OK.');
else wrongLib.forEach((w) => console.log(`  - "${w.title}" ex ${w.exerciseId}: ${w.issue}`));

// 2e. Primary name must exist in library
sub('2d. Primary exercise names exist in library');
const missingNames = [];
for (const s of sessions) {
  for (const e of s.exercises) {
    if (!e.primary) continue;
    const pname = Object.values(e.primary)[0];
    if (!lib.exercises[pname]) {
      missingNames.push({ title: s.title, order: e.order, pname });
    }
  }
}
if (!missingNames.length) console.log('OK: every primary name resolves to a library entry.');
else missingNames.forEach((m) => console.log(`  - "${m.title}" #${m.order}: "${m.pname}" not in library`));

// --------- 3. Cross-reference with expected inventory ---------

section('3. SESSION COMPLETENESS');

// Expected totals per HANDOFF §4
// PDF: Novatos 3 + Intermedios 8 + Avanzados 12 = 23
// Excel: roughly — inspect _sessions.json
const sessionsJson = JSON.parse(fs.readFileSync(
  path.join(ROOT, 'excel_bejarano/parsed/_sessions.json'),
  'utf8'
));
const excelSessionTitles = Object.keys(sessionsJson);
console.log(`Excel _sessions.json unique session keys: ${excelSessionTitles.length}`);
excelSessionTitles.forEach((t) => console.log(`  • ${t}  (${(sessionsJson[t].exercises || []).length} ex)`));

// --------- 4. Course parity (low-ticket) ---------

section('4. LOW-TICKET COURSE PARITY (novatos / intermedios / avanzados)');

const lowTicket = AUDIT.courses.filter((c) => c.deliveryType === 'low_ticket');
const oneOnOne = AUDIT.courses.filter((c) => c.deliveryType === 'one_on_one');

console.log(`low_ticket courses: ${lowTicket.length}`);
lowTicket.forEach((c) => console.log(`  - [${c.courseId}] "${c.title}" modules=${c.modules.length}`));
console.log(`one_on_one courses: ${oneOnOne.length}`);
oneOnOne.forEach((c) => console.log(`  - [${c.courseId}] "${c.title}" modules=${c.modules.length} sessions/module=${c.modules[0]?.sessions.length ?? 0}`));

// Structural checks
sub('4a. Low-ticket structure');
lowTicket.forEach((c) => {
  const perModule = c.modules.map((m) => m.sessions.length);
  console.log(`  "${c.title}": ${c.modules.length} modules, sessions/module=${JSON.stringify(perModule)}`);
});

// Content parity — delegate to bejarano_programs JSON
// We replicate enough of validate-bejarano-program.js logic here to verify.
sub('4b. Content parity vs bejarano_programs/*.json');
const progFiles = {
  novatos: 'bejarano_programs/novatos.json',
  intermedios: 'bejarano_programs/intermedios.json',
  avanzados: 'bejarano_programs/avanzados.json',
};

function courseKey(title) {
  if (/Novatos/i.test(title)) return 'novatos';
  if (/Intermedios/i.test(title)) return 'intermedios';
  if (/Avanzados/i.test(title)) return 'avanzados';
  return null;
}

for (const c of lowTicket) {
  const key = courseKey(c.title);
  if (!key) { console.log(`  Skipping "${c.title}" — no program file`); continue; }
  const programPath = path.join(ROOT, progFiles[key]);
  if (!fs.existsSync(programPath)) { console.log(`  MISSING: ${programPath}`); continue; }
  const prog = JSON.parse(fs.readFileSync(programPath, 'utf8'));
  console.log(`\n  [${key}] program weeks=${prog.weeks ? prog.weeks.length : (prog.blocks ? 'has blocks' : '?')}  course modules=${c.modules.length}`);
  // We're not re-validating at line level here — the validate-bejarano-program.js
  // script already does this. Reference: run `node scripts/validate-bejarano-program.js all`.
}

// --------- 5. One-on-one parity (Excel) ---------

section('5. ONE-ON-ONE COURSE PARITY (Excel templates → _sessions.json)');

// Map course titles to expected Excel session sets.
// This is heuristic — we check each course's session exercises against the
// corresponding _sessions.json entries.
function extractSessionTitles(course) {
  const titles = [];
  for (const m of course.modules) for (const s of m.sessions) titles.push(s.title);
  return titles;
}

oneOnOne.forEach((c) => {
  sub(`Course "${c.title}" [${c.courseId}]`);
  const sessionTitles = extractSessionTitles(c);
  console.log(`  Session titles: ${sessionTitles.length}`);
  sessionTitles.forEach((t) => console.log(`    • ${t}`));
});

// Session exercise comparison: for each course-session find matching _sessions.json
// entry by title fuzzy match, then compare exercise names.
sub('5a. Excel course-session → _sessions.json primary-name match');
for (const c of oneOnOne) {
  for (const m of c.modules) for (const s of m.sessions) {
    // find best match in sessionsJson by normalized title
    const normT = normalize(s.title);
    let matchKey = null;
    for (const k of excelSessionTitles) {
      if (normalize(k) === normT) { matchKey = k; break; }
    }
    if (!matchKey) {
      for (const k of excelSessionTitles) {
        const nk = normalize(k);
        if (nk.includes(normT) || normT.includes(nk)) { matchKey = k; break; }
      }
    }
    const courseExNames = s.exercises.map((e) => e.primary ? Object.values(e.primary)[0] : '(no-primary)');
    if (!matchKey) {
      console.log(`  [${c.title}] session "${s.title}" — NO MATCH in _sessions.json (${courseExNames.length} exercises)`);
      continue;
    }
    const excelEx = sessionsJson[matchKey].exercises || [];
    const excelNames = excelEx.map((e) => e.name);
    const missing = excelNames.filter((n) => !courseExNames.includes(n));
    const extra = courseExNames.filter((n) => !excelNames.includes(n));
    if (!missing.length && !extra.length && excelNames.length === courseExNames.length) {
      console.log(`  [${c.title}] "${s.title}" → "${matchKey}" : EXACT MATCH (${excelNames.length} ex)`);
    } else {
      console.log(`  [${c.title}] "${s.title}" → "${matchKey}":`);
      console.log(`      excel=${excelNames.length}  course=${courseExNames.length}`);
      if (missing.length) console.log(`      missing from course: ${JSON.stringify(missing)}`);
      if (extra.length)   console.log(`      extra in course:     ${JSON.stringify(extra)}`);
    }
  }
}

// --------- 6. Plans collection ---------
section('6. PLANS COLLECTION FOR FELIPE');
console.log(`plans count: ${AUDIT.plans.length}`);
if (AUDIT.plans.length > 0) AUDIT.plans.forEach((p) => console.log(`  - ${p.planId} "${p.title}"`));

console.log('\nDone.');
