#!/usr/bin/env node
'use strict';

/**
 * Parse the dumped Excel JSON into structured session data.
 *
 * Reads  excel_bejarano/parsed/<file>.json
 * Writes excel_bejarano/parsed/_sessions.json  — all sessions across all files
 *
 * Gym files share the EJERCICIO sheet layout:
 *   col A: superset letter code (A, B, C1, C2, D, E1, E2, F, G, G1, G2)
 *   col B: exercise name (English)
 *   col C: SETS DE CALENTAMIENTO
 *   col D: SETS DE TRABAJO
 *   col E: REPS
 *   col F: DESCANSO
 *   col G: SUSTITUTO 1
 *   col H: SUSTITUTO 2
 *   col I: Carga/RIR
 *
 * Home file (Reporte_EntrenoCasa) layout:
 *   col A: letter code
 *   col B: exercise name (Spanish)
 *   col C: SETS (single number, no cal/work split)
 *   col D: REPS
 *   col E: DESCANSO
 *   col F: Carga/LRIR
 *
 * Sessions are delimited by a row whose col A starts with "DIA" or "DÍA" — the title
 * comes from that same row (e.g. "DIA 1 /// LEGS 1").
 *
 * "Abdomen" file has a single session, no DIA markers.
 */

const fs = require('fs');
const path = require('path');

const IN_DIR = path.join(__dirname, '..', 'excel_bejarano', 'parsed');
const OUT_PATH = path.join(IN_DIR, '_sessions.json');

const FILES = [
  { file: 'Reporte_EntrenoCasa.json',       layout: 'home',    prefix: 'FB Casa' },
  { file: 'Rutina_3 DIAS FULL BODY.json',   layout: 'gym',     prefix: 'FB Gym' },
  { file: 'Rutina_4 DIAS UL - UL.json',     layout: 'gym',     prefix: 'UL' },
  { file: 'Rutina_5 DIAS PPL - UL.json',    layout: 'gym',     prefix: 'PPL-UL' },
  { file: 'Rutina_GluteOptimization x5 .json', layout: 'gym',  prefix: 'Glute Opt' },
  { file: 'Rutina_PushPullLegs .json',      layout: 'gym',     prefix: '6PPL' },
  { file: 'Rutina_Abdomen.json',            layout: 'gym',     prefix: 'Abdomen', noDia: true, defaultTitle: 'Abdomen' },
];

// Gym column indexes (0-based)
const GYM_COLS = { code: 0, name: 1, cal: 2, work: 3, reps: 4, rest: 5, sub1: 6, sub2: 7, rir: 8 };
// Home column indexes
const HOME_COLS = { code: 0, name: 1, sets: 2, reps: 3, rest: 4, rir: 5 };

function s(v) {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return v.toISOString(); // edge case; flag at review
  return String(v).trim();
}

function n(v) {
  if (v === '' || v === null || v === undefined) return 0;
  const parsed = parseInt(v, 10);
  return isNaN(parsed) ? 0 : parsed;
}

function isDiaMarker(cellA) {
  const v = s(cellA).toUpperCase();
  return v.startsWith('DIA ') || v.startsWith('DÍA ') || v.startsWith('RUTINA DE ');
}

function looksLikeSupersetCode(v) {
  // A, B, C, D, …, A1, B2, etc.
  return /^[A-Z][0-9]?$/.test(s(v).toUpperCase());
}

function parseGymSheet(grid, prefix, noDia, defaultTitle) {
  const sessions = [];
  let current = null;

  for (let i = 0; i < grid.length; i++) {
    const row = grid[i];
    const colA = s(row[GYM_COLS.code]);
    const colB = s(row[GYM_COLS.name]);

    if (isDiaMarker(colA)) {
      if (current) sessions.push(current);
      current = { title: colA, exercises: [], rowIndex: i };
      continue;
    }

    if (!current && noDia) {
      current = { title: defaultTitle, exercises: [], rowIndex: i };
    }

    if (!current) continue;

    // Skip header rows (they mention "SETS", "REPS", "Reps", "RIR", "Carga")
    const isHeader = ['SETS', 'SETS DE CALENTAMIENTO', 'SETS DE TRABAJO', 'REPS', 'DESCANSO',
      'SUTITUTO 1', 'SUSTITUTO 1', 'SUSTITUTO 2', 'CARGA/RIR', 'REALIZADO'].includes(colA.toUpperCase()) ||
      colB.toUpperCase() === 'SETS' || colB.toUpperCase() === 'EJERCICIO';
    if (isHeader) continue;

    // Must have an exercise name in col B AND col A must look like a superset letter OR be empty
    if (!colB) continue;
    if (colA && !looksLikeSupersetCode(colA)) continue;

    const ex = {
      code: colA || null,
      name: colB,
      cal: n(row[GYM_COLS.cal]),
      work: n(row[GYM_COLS.work]),
      reps: s(row[GYM_COLS.reps]),
      rest: s(row[GYM_COLS.rest]),
      sub1: s(row[GYM_COLS.sub1]) || null,
      sub2: s(row[GYM_COLS.sub2]) || null,
      rir: n(row[GYM_COLS.rir]),
    };
    current.exercises.push(ex);
  }

  if (current) sessions.push(current);
  return sessions.filter((s) => s.exercises.length > 0);
}

function parseHomeSheet(grid, prefix) {
  const sessions = [];
  let current = null;

  for (let i = 0; i < grid.length; i++) {
    const row = grid[i];
    const colA = s(row[HOME_COLS.code]);
    const colB = s(row[HOME_COLS.name]);

    if (isDiaMarker(colA)) {
      if (current) sessions.push(current);
      current = { title: colA, exercises: [], rowIndex: i };
      continue;
    }
    if (!current) continue;

    const isHeader = colB.toUpperCase() === 'EJERCICIO' || colA.toUpperCase() === 'SETS';
    if (isHeader) continue;

    if (!colB) continue;
    // Home has CALENTAMIENTO and Cardio rows — include them as-is
    const ex = {
      code: colA || null,
      name: colB,
      sets: n(row[HOME_COLS.sets]),
      reps: s(row[HOME_COLS.reps]),
      rest: s(row[HOME_COLS.rest]),
      rir: s(row[HOME_COLS.rir]), // may be text "Intensidad Media" or number
    };
    current.exercises.push(ex);
  }

  if (current) sessions.push(current);
  return sessions.filter((s) => s.exercises.length > 0);
}

function dedupeSessions(allSessions) {
  // Two sessions are "same" if title matches AND exercise list (by name) matches.
  const seen = new Map();
  const out = [];
  for (const s of allSessions) {
    const key = `${s.title}||${s.exercises.map((e) => e.name).join(',')}`;
    if (seen.has(key)) {
      seen.get(key).sources.push(s.source);
      continue;
    }
    seen.set(key, { ...s, sources: [s.source] });
    out.push(seen.get(key));
  }
  return out;
}

(async () => {
  const all = [];

  for (const { file, layout, prefix, noDia, defaultTitle } of FILES) {
    const p = path.join(IN_DIR, file);
    if (!fs.existsSync(p)) { console.log(`! missing: ${file}`); continue; }
    const data = JSON.parse(fs.readFileSync(p, 'utf-8'));
    const sheet = data.sheets['EJERCICIO'];
    if (!sheet) { console.log(`! no EJERCICIO sheet: ${file}`); continue; }

    const parser = layout === 'home' ? parseHomeSheet : parseGymSheet;
    const sessions = parser(sheet.grid, prefix, noDia, defaultTitle);
    sessions.forEach((s) => (s.source = file));
    all.push(...sessions);

    console.log(`\n${file} → ${sessions.length} sessions:`);
    for (const ses of sessions) {
      console.log(`  [R${String(ses.rowIndex).padStart(3)}] "${ses.title}" (${ses.exercises.length} ex)`);
      for (const ex of ses.exercises) {
        if (layout === 'home') {
          console.log(`      ${(ex.code || ' ').padEnd(3)} ${ex.name.padEnd(40)} ${ex.sets}×${ex.reps} RIR=${ex.rir}`);
        } else {
          const alts = [ex.sub1, ex.sub2].filter(Boolean).join(' / ');
          console.log(`      ${(ex.code || ' ').padEnd(3)} ${ex.name.padEnd(40)} ${ex.cal}+${ex.work}×${ex.reps} RIR=${ex.rir}${alts ? '  sub=[' + alts + ']' : ''}`);
        }
      }
    }
  }

  // Dedup by title+content signature — multi-day routines share Legs/Upper sessions
  const unique = dedupeSessions(all);

  console.log(`\n\n=== SUMMARY ===`);
  console.log(`raw sessions (across all files):  ${all.length}`);
  console.log(`unique sessions (dedup by content): ${unique.length}`);
  console.log(`\nUnique sessions:`);
  for (const s of unique) {
    console.log(`  ${s.sources.length > 1 ? '×' + s.sources.length : '  '}  "${s.title}"  (${s.exercises.length} ex)  from [${s.sources.join(', ')}]`);
  }

  fs.writeFileSync(OUT_PATH, JSON.stringify({ all, unique }, null, 2));
  console.log(`\n✓ written to ${path.relative(process.cwd(), OUT_PATH)}`);
})();
