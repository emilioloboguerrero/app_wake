#!/usr/bin.env node
'use strict';

/**
 * Deeper intra-session duplicate scan. Reads /tmp/bejarano-audit.json.
 * Checks for:
 *   (a) same primary name at different positions (already covered)
 *   (b) aliased exercises — different library names that refer to the same movement
 *   (c) same primary with different notes (still the same exercise really)
 *   (d) near-duplicate primary names by normalization
 */

const fs = require('fs');

const AUDIT = JSON.parse(fs.readFileSync('/tmp/bejarano-audit.json', 'utf8'));

// Known aliases — exercises that are the same movement under different library names.
// Sourced from HANDOFF §5 "Renames" and cross-checked against the library.
const ALIAS_GROUPS = [
  // skull crusher variants
  ['PRESS FRANCES CON MANCUERNAS', 'ROMPE CRÁNEOS', 'ROMPE CRANEOS'],
  // pull down = jalón al pecho
  ['JALÓN AL PECHO AGARRE AMPLIO (PULL DOWN)', 'JALÓN AL PECHO POLEA ALTA', 'PULL DOWN'],
  ['JALÓN AL PECHO AGARRE CERRADO (PULL DOWN)', 'JALÓN AL PECHO CERRADO'],
  // chin up = dominada supina
  ['DOMINADA SUPINA (CHIN UPS)', 'CHIN UP'],
  // pull up = dominada prono
  ['DOMINADA PRONO', 'PULL UP'],
  // Lat pull variants that actually point to the same library entry are already one name — no action.
];

// Build a lookup: name → canonical group id
const canonical = new Map();
ALIAS_GROUPS.forEach((group, i) => group.forEach((n) => canonical.set(n, i)));
function canon(name) {
  return canonical.has(name) ? `GROUP_${canonical.get(name)}` : name;
}

function normalize(s) {
  return (s || '')
    .toUpperCase()
    .normalize('NFD').replace(/\p{Diacritic}/gu, '')
    .replace(/[()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const libNames = new Set(Object.keys(AUDIT.library.exercises));
const libNamesNorm = new Map();
for (const n of libNames) libNamesNorm.set(normalize(n), n);

let anyIssue = false;

// ---- (a,b,c) for every session, group by canonical key, report collisions ----
for (const s of AUDIT.sessions) {
  const seen = new Map(); // key → [{order, primaryName, notes}]
  for (const e of s.exercises) {
    const primaryName = e.primary ? Object.values(e.primary)[0] : '(no-primary)';
    const key = canon(primaryName);
    const entry = { order: e.order, primaryName, notes: e.notes || null };
    if (!seen.has(key)) seen.set(key, [entry]);
    else seen.get(key).push(entry);
  }
  const collisions = [...seen.entries()].filter(([, arr]) => arr.length > 1);
  if (collisions.length) {
    if (!anyIssue) { console.log('Intra-session collisions (primary name OR alias group):'); anyIssue = true; }
    console.log(`\n  [${s.sessionId}] "${s.title}"  (${s.exercises.length} ex)`);
    for (const [key, arr] of collisions) {
      const byName = arr.map((a) => `#${a.order}:${a.primaryName}${a.notes ? ' (notes="' + a.notes + '")' : ''}`).join(' | ');
      console.log(`    - ${key} → ${byName}`);
    }
  }
}
if (!anyIssue) console.log('No alias-aware duplicates beyond those already flagged.');

// ---- (d) also look for normalized name collisions per session ----
console.log('\n\n=== Pairs where two exercises normalize the same (per session) ===');
let anyNorm = false;
for (const s of AUDIT.sessions) {
  const seen = new Map();
  for (const e of s.exercises) {
    const primaryName = e.primary ? Object.values(e.primary)[0] : '(no-primary)';
    const norm = normalize(primaryName);
    if (!seen.has(norm)) seen.set(norm, [{ order: e.order, primaryName }]);
    else seen.get(norm).push({ order: e.order, primaryName });
  }
  const coll = [...seen.entries()].filter(([, arr]) => arr.length > 1);
  if (coll.length) {
    anyNorm = true;
    console.log(`\n  [${s.sessionId}] "${s.title}"`);
    for (const [k, arr] of coll) {
      console.log(`    - ${k} → ${arr.map((a) => '#' + a.order + ':' + a.primaryName).join(' | ')}`);
    }
  }
}
if (!anyNorm) console.log('(none)');

// ---- (e) Print every session's exercise list for manual inspection ----
console.log('\n\n=== FULL EXERCISE LIST PER SESSION (for eyeball) ===');
for (const s of AUDIT.sessions) {
  console.log(`\n[${s.sessionId}] "${s.title}"`);
  for (const e of s.exercises) {
    const p = e.primary ? Object.values(e.primary)[0] : '(no-primary)';
    const notes = e.notes ? ` notes="${e.notes}"` : '';
    console.log(`  #${e.order}  ${p}${notes}`);
  }
}
