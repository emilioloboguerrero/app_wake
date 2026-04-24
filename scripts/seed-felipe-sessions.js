#!/usr/bin/env node
'use strict';

/**
 * Felipe Bejarano library seed.
 *
 * Writes PDF-driven sessions into `creator_libraries/{FELIPE_UID}/sessions/*`
 * plus 12 new exercises into `exercises_library/{LIB_ID}`.
 *
 * Schema verified against prod 2026-04-23 — see excel_bejarano/HANDOFF.md §0.
 *
 * Usage:
 *   node scripts/seed-felipe-sessions.js --validate
 *   node scripts/seed-felipe-sessions.js --add-missing          (dry-run)
 *   node scripts/seed-felipe-sessions.js --add-missing --write
 *   node scripts/seed-felipe-sessions.js --seed-pdf              (dry-run)
 *   node scripts/seed-felipe-sessions.js --seed-pdf --write
 *   node scripts/seed-felipe-sessions.js --all                   (dry-run)
 *   node scripts/seed-felipe-sessions.js --all --write
 *
 * Requires: NODE_PATH=functions/node_modules and gcloud ADC.
 */

const admin = require('firebase-admin');

const FELIPE_UID = 'yMqKOXBcVARa6vjU7wImf3Tp85J2';
const LIB_ID = 'jeoVyzhUrBeJofT62MOe';
const PROJECT_ID = 'wolf-20b8b';

admin.initializeApp({
  credential: admin.credential.applicationDefault(),
  projectId: PROJECT_ID,
});
const db = admin.firestore();
const { FieldValue } = admin.firestore;

// ─────────────────────────────────────────────────────────────────────
// Canonical template — matches Felipe's existing test session exactly.

const DEFAULT_TEMPLATE = {
  measures:   ['reps', 'weight', 'intensity'],
  objectives: ['reps', 'intensity', 'previous'],
  customMeasureLabels:   {},
  customObjectiveLabels: {},
};

// ─────────────────────────────────────────────────────────────────────
// 12 NEW LIBRARY EXERCISES
// Biomechanical profile: primary = 100, synergists 40-70, stabilizers 20-35.
// Implements drawn from the live enum (16 values).

const NEW_EXERCISES = {
  'SENTADILLA BOX': {
    implements: ['Barra', 'Banco'],
    muscle_activation: { quads: 100, glutes: 80, hamstrings: 40, calves: 18 },
  },
  'PRESS INCLINADO AGARRE CERRADO': {
    implements: ['Banco Inclinado', 'Barra', 'Agarre Cerrado'],
    muscle_activation: { triceps: 100, pecs: 80, front_delts: 50 },
  },
  'PRESS DE BANCA CERRADO EN MULTIPOWER': {
    implements: ['Máquina Smith', 'Agarre Cerrado'],
    muscle_activation: { triceps: 100, pecs: 55, front_delts: 30 },
  },
  'JALÓN AL PECHO POLEA ALTA SUPINA': {
    implements: ['Cable'],
    muscle_activation: { lats: 100, biceps: 55, rhomboids: 40, rear_delts: 25 },
  },
  'VUELOS PARA PECTORAL EN POLEA (DE ARRIBA A ABAJO)': {
    implements: ['Cable'],
    muscle_activation: { pecs: 100, front_delts: 25 },
  },
  'DIAMOND PUSH UP': {
    implements: ['Peso Corporal'],
    muscle_activation: { triceps: 100, pecs: 60, front_delts: 35 },
  },
  'ELEVACIONES FRONTALES': {
    implements: ['Mancuernas'],
    muscle_activation: { front_delts: 100, side_delts: 25, traps: 15 },
  },
  'PALLOF PRESS': {
    implements: ['Cable'],
    muscle_activation: { obliques: 100, abs: 70 },
  },
  'PATADA DE GLÚTEO EN POLEA': {
    implements: ['Cable'],
    muscle_activation: { glutes: 100, hamstrings: 30 },
  },
  'KETTLEBELL SWING': {
    implements: ['Otro'],
    muscle_activation: { glutes: 100, hamstrings: 70, lower_back: 40, quads: 30, abs: 25 },
  },
  'REMO INVERTIDO': {
    implements: ['Peso Corporal', 'Otro'],
    muscle_activation: { lats: 100, rhomboids: 75, rear_delts: 50, biceps: 45, traps: 30 },
  },
  'CURL DE PIERNA DESLIZANTE': {
    implements: ['Peso Corporal'],
    muscle_activation: { hamstrings: 100, glutes: 30, calves: 15 },
  },
};

// ─────────────────────────────────────────────────────────────────────
// NAME_MAP — PDF/Excel shorthand → exact library key.
// Identity (unchanged) names aren't in here; resolveName() returns upper(input) when missing.

const NAME_MAP = {
  // PDF short form → library verbose form
  'SENTADILLA': 'SENTADILLA TRASERA',
  'PESO MUERTO RUMANO': 'PESO MUERTO RUMANO (RDL)',
  'TRÍCEPS PUSH DOWN': 'TRICEP PUSH DOWN',
  'TRICEPS PUSH DOWN': 'TRICEP PUSH DOWN',
  'FROG PUMPS': 'FROG PUMP',
  'ELEVACIONES DE TALONES CON RODILLA EXTENDIDA': 'ELEVACIÓN DE TALÓN CON RODILLA EXTENDIDA',
  'CURL PREDICADOR': 'CURL DE BÍCEPS PREDICADOR',
  'CURL EN BARRA': 'CURL DE BÍCEPS EN BARRA',
  'CURL BAYESIAN': 'CURL DE BÍCEPS BAYESIAN',
  'CURL SPIDERMAN': 'CURL DE BÍCEPS SPIDERMAN',
  'CURL INCLINADO': 'CURL DE BÍCEPS INCLINADO',
  'CURL MARTILLO': 'CURL DE BÍCEPS MARTILLO',
  'CURL PRONADO': 'CURL DE BÍCEPS PRONO',
  'CURL SUPINO': 'CURL DE BÍCEPS SUPINO',
  'PRESS INCLINADO': 'PRESS DE BANCA INCLINADO',
  'PRESS INCLINADO CON MANCUERNAS': 'PRESS DE BANCA INCLINADO CON MANCUERNAS',
  'BUENOS DÍAS': 'BUENOS DÍAS CON BARRA',
  'PLANCHA': 'PLANCHA (PLANK)',
  'ELEVACIONES DE PIERNAS': 'ELEVACIONES DE PIERNAS (ABS)',
  'CLAM': 'CLAM SHELL',
  'PRENSA A UNA PIERNA': 'PRENSA DE PIERNA UNILATERAL',
  'CRUNCH DOBLE': 'CRUNCH DOBLE EN V',
  'EXTENSIÓN DE RODILLA A UNA PIERNA': 'EXTENSIÓN DE RODILLA EN MÁQUINA UNA PIERNA',
  'CURL DE PIERNA A UNA PIERNA': 'CURL DE PIERNA ACOSTADO A UNA PIERNA',
  'CHIN UP': 'DOMINADA SUPINA (CHIN UPS)',
  'HIP THRUST UNILATERAL': 'HIP THRUST UNILATERAL CON MANCUERNA',
  'REMO CON APOYO EN PECHO': 'REMO CON APOYO EN PECHO EN MÁQUINA',
  'ABDUCCIÓN DE CADERA SENTADO': 'ABDUCCIÓN DE CADERA SENTADO EN MÁQUINA',
  'ELEVACIONES LATERALES EN MÁQUINA': 'ELEVACIONES LATERALES DE HOMBRO MÁQUINA',
  'ELEVACIONES LATERALES EN CABLE': 'ELEVACIONES LATERALES DE HOMBRO EN CABLE',
  'REMO ERGUIDO': 'REMO AL MENTÓN',
  'ROMPE CRÁNEOS': 'PRESS FRANCES CON MANCUERNAS',
  'PRESS FRANCÉS': 'PRESS FRANCES CON MANCUERNAS',
  'JALÓN AL PECHO POLEA ALTA': 'JALÓN AL PECHO AGARRE AMPLIO (PULL DOWN)',
  'PRESS MILITAR EN BARRA': 'PRESS MILITAR EN BARRA PARADO',
  'PRESS MILITAR CON MANCUERNAS': 'PRESS MILITAR CON MANCUERNAS PARADO',
  'HIP THRUST': 'HIP THRUST CON BARRA',
  'ELEVACIONES LATERALES DE HOMBRO': 'ELEVACIONES LATERALES DE HOMBRO MANCUERNA',
  'VUELOS INVERTIDOS': 'VUELOS INVERTIDOS CON MANCUERNA',
  'ABDUCCIÓN DE CADERA': 'ABDUCCIÓN DE CADERA SENTADO EN MÁQUINA',
  'PULL OVER': 'PULL OVER EN POLEA',
  'REMO EN CABLE': 'REMO EN CABLE AGARRE NEUTRO',
  'REMO EN BARRA': 'REMO EN BARRA HORIZONTAL',
  'FONDOS': 'FONDOS EN PARALELAS',
  'EXTENSIÓN DE RODILLA': 'EXTENSION DE CUADRICEPS',
  'DOMINADAS PRONO': 'DOMINADA PRONO',
  'SENTADILLA FRONTAL O CON SAFETY BAR': 'SENTADILLA FRONTAL',
  'EXTENSIÓN TRÍCEPS SOBRE CABEZA': 'EXTENSIÓN DE TRÍCEPS SOBRE CABEZA',

  // PDF name for NEW entry — map to itself
  'PULL DOWN SUPINO': 'JALÓN AL PECHO POLEA ALTA SUPINA',

  // Tempo/stance variants — map to base library entry (cue goes in `notes`)
  'HIP THRUST CON PAUSA': 'HIP THRUST CON BARRA',
  'CURL DE PIERNA ACOSTADO CONSTANTE': 'CURL DE PIERNA ACOSTADO',
  'ELEVACIONES LATERALES DE HOMBRO (PREFERENCIA PERSONAL)': 'ELEVACIONES LATERALES DE HOMBRO MANCUERNA',
  'ELEVACIONES LATERALES 21S': 'ELEVACIONES LATERALES DE HOMBRO MANCUERNA',
  'FONDOS CON EXCÉNTRICA ACENTUADA': 'FONDOS EN PARALELAS',
  'VUELOS EN POLEA (DE ABAJO A ARRIBA)': 'VUELOS PARA PECTORAL EN POLEA (DE ABAJO A ARRIBA)',
  'VUELOS EN POLEA PARA PECTORAL (ARRIBA ABAJO)': 'VUELOS PARA PECTORAL EN POLEA (DE ARRIBA A ABAJO)',
  'VUELOS EN POLEA PARA PECTORAL': 'VUELOS PARA PECTORAL EN POLEA (DE ABAJO A ARRIBA)',
};

function resolveName(name) {
  const upper = name.toUpperCase().trim();
  return NAME_MAP[upper] || upper;
}

// ─────────────────────────────────────────────────────────────────────
// ALTERNATIVES — keyed by resolved library name. 1-3 practical substitutes each.
// Rule: same movement in a different implement (cable→máquina→mancuerna), or same
// muscle in a different position (acostado→sentado), or same muscle via a related
// pattern (lying curl → RDL). Every target must exist in library or NEW_EXERCISES.

const ALTERNATIVES = {
  // ══ Pierna — compuestos ══
  'SENTADILLA TRASERA':                                 ['SENTADILLA HACK', 'PRENSA DE PIERNA', 'SENTADILLA FRONTAL'],
  'SENTADILLA FRONTAL':                                 ['SENTADILLA TRASERA', 'SENTADILLA HACK'],
  'SENTADILLA HACK':                                    ['SENTADILLA TRASERA', 'PRENSA DE PIERNA'],
  'PRENSA DE PIERNA':                                   ['SENTADILLA HACK', 'SENTADILLA TRASERA'],
  'PRENSA DE PIERNA UNILATERAL':                        ['PRENSA DE PIERNA', 'ESTOCADA CAMINANDO (LUNGES)'],
  'SENTADILLA BÚLGARA':                                 ['ESTOCADA CAMINANDO (LUNGES)', 'SENTADILLA GOBLET'],
  'SENTADILLA GOBLET':                                  ['SENTADILLA BÚLGARA', 'PRENSA DE PIERNA'],
  'SENTADILLA BOX':                                     ['SENTADILLA TRASERA', 'SENTADILLA HACK'],
  'ESTOCADA CAMINANDO (LUNGES)':                        ['SENTADILLA BÚLGARA', 'STEP UPS'],

  // ══ Pierna — cadena posterior ══
  'PESO MUERTO':                                        ['PESO MUERTO RUMANO (RDL)', 'BUENOS DÍAS CON BARRA'],
  'PESO MUERTO RUMANO (RDL)':                           ['BUENOS DÍAS CON BARRA', 'HIPEREXTENSIÓN 45°'],
  'BUENOS DÍAS CON BARRA':                              ['PESO MUERTO RUMANO (RDL)', 'HIPEREXTENSIÓN 45°'],
  'HIPEREXTENSIÓN 45°':                                 ['PESO MUERTO RUMANO (RDL)', 'BUENOS DÍAS CON BARRA'],

  // ══ Pierna — glúteos ══
  'HIP THRUST CON BARRA':                               ['HIP THRUST EN MÁQUINA', 'HIP THRUST UNILATERAL CON MANCUERNA'],
  'HIP THRUST EN MÁQUINA':                              ['HIP THRUST CON BARRA', 'HIP THRUST UNILATERAL CON MANCUERNA'],
  'HIP THRUST UNILATERAL CON MANCUERNA':                ['HIP THRUST CON BARRA', 'HIP THRUST EN MÁQUINA'],
  'FROG PUMP':                                          ['HIP THRUST CON BARRA', 'HIP THRUST EN MÁQUINA'],
  'PULL THROUGH':                                       ['HIP THRUST CON BARRA', 'PESO MUERTO RUMANO (RDL)'],

  // ══ Pierna — cuádriceps ══
  'EXTENSION DE CUADRICEPS':                            ['EXTENSIÓN DE RODILLA EN MÁQUINA UNA PIERNA', 'SISSY SQUAT'],
  'EXTENSIÓN DE RODILLA EN MÁQUINA UNA PIERNA':         ['EXTENSION DE CUADRICEPS', 'SISSY SQUAT'],
  'SISSY SQUAT':                                        ['EXTENSION DE CUADRICEPS', 'SENTADILLA BÚLGARA'],

  // ══ Pierna — isquios ══
  'CURL DE PIERNA ACOSTADO':                            ['CURL DE PIERNA SENTADO', 'GLUTE HAM RAISE', 'PESO MUERTO RUMANO (RDL)'],
  'CURL DE PIERNA SENTADO':                             ['CURL DE PIERNA ACOSTADO', 'GLUTE HAM RAISE'],
  'CURL DE PIERNA ACOSTADO A UNA PIERNA':               ['CURL DE PIERNA SENTADO', 'CURL DE PIERNA ACOSTADO'],
  'CURL DE PIERNA NÓRDICO':                             ['CURL DE PIERNA ACOSTADO', 'GLUTE HAM RAISE'],
  'GLUTE HAM RAISE':                                    ['CURL DE PIERNA NÓRDICO', 'CURL DE PIERNA ACOSTADO'],

  // ══ Pierna — abductores / pantorrillas ══
  'ABDUCCIÓN DE CADERA SENTADO EN MÁQUINA':             ['ABDUCCIÓN DE CADERA EN POLEA', 'CAMINATA CON BANDA LATERAL'],
  'ABDUCCIÓN DE CADERA EN POLEA':                       ['ABDUCCIÓN DE CADERA SENTADO EN MÁQUINA', 'CAMINATA CON BANDA LATERAL'],
  'CAMINATA CON BANDA LATERAL':                         ['ABDUCCIÓN DE CADERA SENTADO EN MÁQUINA', 'CLAM SHELL'],
  'CLAM SHELL':                                         ['CAMINATA CON BANDA LATERAL', 'ABDUCCIÓN DE CADERA SENTADO EN MÁQUINA'],
  'ELEVACIÓN DE TALÓN CON RODILLA EXTENDIDA':           ['ELEVACIONES DE TALONES CON RODILLA FLEXIONADA'],
  'ELEVACIONES DE TALONES CON RODILLA FLEXIONADA':      ['ELEVACIÓN DE TALÓN CON RODILLA EXTENDIDA'],

  // ══ Pectoral ══
  'PRESS DE BANCA PLANA':                               ['PRESS EN MÁQUINA PLANO', 'PRESS DE BANCA INCLINADO CON MANCUERNAS'],
  'PRESS EN MÁQUINA PLANO':                             ['PRESS DE BANCA PLANA'],
  'PRESS DE BANCA INCLINADO':                           ['PRESS DE BANCA INCLINADO CON MANCUERNAS', 'PRESS EN MÁQUINA INCLINADO', 'PRESS DE BANCA INCLINADO EN SMITH'],
  'PRESS DE BANCA INCLINADO CON MANCUERNAS':            ['PRESS DE BANCA INCLINADO', 'PRESS EN MÁQUINA INCLINADO'],
  'PRESS EN MÁQUINA INCLINADO':                         ['PRESS DE BANCA INCLINADO', 'PRESS DE BANCA INCLINADO CON MANCUERNAS'],
  'PRESS DE BANCA INCLINADO EN SMITH':                  ['PRESS DE BANCA INCLINADO', 'PRESS DE BANCA INCLINADO CON MANCUERNAS'],
  'PRESS INCLINADO AGARRE CERRADO':                     ['PRESS DE BANCA CERRADO EN MULTIPOWER', 'PRESS DE BANCA INCLINADO'],
  'PRESS DE BANCA CERRADO EN MULTIPOWER':               ['PRESS INCLINADO AGARRE CERRADO', 'PRESS DE BANCA PLANA'],
  'VUELOS EN POLEA':                                    ['VUELOS PARA PECTORAL EN POLEA (DE ABAJO A ARRIBA)', 'VUELOS PARA PECTORAL CON MANCUERNAS', 'PEC DEC (APERTURAS EN MÁQUINA)'],
  'VUELOS PARA PECTORAL EN POLEA (DE ABAJO A ARRIBA)':  ['VUELOS PARA PECTORAL EN POLEA (DE ARRIBA A ABAJO)', 'VUELOS PARA PECTORAL CON MANCUERNAS', 'PEC DEC (APERTURAS EN MÁQUINA)'],
  'VUELOS PARA PECTORAL EN POLEA (DE ARRIBA A ABAJO)':  ['VUELOS PARA PECTORAL EN POLEA (DE ABAJO A ARRIBA)', 'PEC DEC (APERTURAS EN MÁQUINA)'],
  'VUELOS PARA PECTORAL CON MANCUERNAS':                ['VUELOS EN POLEA', 'PEC DEC (APERTURAS EN MÁQUINA)'],
  'PEC DEC (APERTURAS EN MÁQUINA)':                     ['VUELOS PARA PECTORAL CON MANCUERNAS', 'VUELOS EN POLEA'],
  'FONDOS EN PARALELAS':                                ['PRESS DE BANCA INCLINADO', 'FLEXIONES (PUSH UPS)'],
  'FLEXIONES (PUSH UPS)':                               ['FONDOS EN PARALELAS', 'FLEXIONES CON DÉFICIT'],
  'DIAMOND PUSH UP':                                    ['FLEXIONES (PUSH UPS)', 'TRICEP PUSH DOWN'],

  // ══ Espalda — vertical ══
  'JALÓN AL PECHO AGARRE AMPLIO (PULL DOWN)':           ['JALÓN AL PECHO AGARRE CERRADO (PULL DOWN)', 'DOMINADA PRONO'],
  'JALÓN AL PECHO AGARRE CERRADO (PULL DOWN)':          ['JALÓN AL PECHO AGARRE AMPLIO (PULL DOWN)', 'DOMINADA NEUTRA'],
  'JALÓN AL PECHO POLEA ALTA SUPINA':                   ['DOMINADA SUPINA (CHIN UPS)', 'JALÓN AL PECHO AGARRE CERRADO (PULL DOWN)'],
  'DOMINADA PRONO':                                     ['JALÓN AL PECHO AGARRE AMPLIO (PULL DOWN)', 'DOMINADA NEUTRA'],
  'DOMINADA NEUTRA':                                    ['DOMINADA PRONO', 'JALÓN AL PECHO AGARRE CERRADO (PULL DOWN)'],
  'DOMINADA SUPINA (CHIN UPS)':                         ['JALÓN AL PECHO POLEA ALTA SUPINA', 'DOMINADA NEUTRA'],
  'PULL OVER EN POLEA':                                 ['SEAL ROW'],

  // ══ Espalda — horizontal ══
  'SEAL ROW':                                           ['REMO EN BARRA HORIZONTAL', 'REMO CON APOYO EN PECHO EN MÁQUINA'],
  'REMO EN BARRA HORIZONTAL':                           ['SEAL ROW', 'REMO UNILATERAL CON MANCUERNA'],
  'REMO EN BARRA T':                                    ['REMO EN BARRA HORIZONTAL', 'REMO UNILATERAL CON MANCUERNA'],
  'REMO EN CABLE AGARRE ABIERTO':                       ['REMO EN CABLE AGARRE CERRADO', 'REMO EN CABLE AGARRE NEUTRO'],
  'REMO EN CABLE AGARRE CERRADO':                       ['REMO EN CABLE AGARRE ABIERTO', 'REMO EN CABLE AGARRE NEUTRO'],
  'REMO EN CABLE AGARRE NEUTRO':                        ['REMO EN CABLE AGARRE ABIERTO', 'REMO EN CABLE AGARRE CERRADO'],
  'REMO UNILATERAL CON MANCUERNA':                      ['REMO CON APOYO EN PECHO EN MÁQUINA', 'SEAL ROW'],
  'REMO CON APOYO EN PECHO EN MÁQUINA':                 ['SEAL ROW', 'REMO UNILATERAL CON MANCUERNA'],
  'REMO INVERTIDO':                                     ['DOMINADA PRONO', 'SEAL ROW'],

  // ══ Hombros ══
  'PRESS MILITAR EN BARRA PARADO':                      ['PRESS MILITAR CON MANCUERNAS PARADO', 'PRESS MILITAR EN MÁQUINA', 'PRESS MILITAR EN BARRA SENTADO'],
  'PRESS MILITAR CON MANCUERNAS PARADO':                ['PRESS MILITAR EN BARRA PARADO', 'PRESS MILITAR EN MÁQUINA', 'PRESS MILITAR CON MANCUERNA SENTADO'],
  'PRESS MILITAR EN MÁQUINA':                           ['PRESS MILITAR CON MANCUERNAS PARADO', 'PRESS MILITAR EN BARRA PARADO'],
  'PRESS MILITAR CON MANCUERNA SENTADO':                ['PRESS MILITAR EN MÁQUINA', 'PRESS MILITAR CON MANCUERNAS PARADO'],
  'PRESS MILITAR EN BARRA SENTADO':                     ['PRESS MILITAR EN BARRA PARADO', 'PRESS MILITAR EN MÁQUINA'],
  'ELEVACIONES LATERALES DE HOMBRO MANCUERNA':          ['ELEVACIONES LATERALES DE HOMBRO EN CABLE', 'ELEVACIONES LATERALES DE HOMBRO MÁQUINA'],
  'ELEVACIONES LATERALES DE HOMBRO EN CABLE':           ['ELEVACIONES LATERALES DE HOMBRO MANCUERNA', 'ELEVACIONES LATERALES DE HOMBRO MÁQUINA'],
  'ELEVACIONES LATERALES DE HOMBRO MÁQUINA':            ['ELEVACIONES LATERALES DE HOMBRO MANCUERNA', 'ELEVACIONES LATERALES DE HOMBRO EN CABLE'],
  'ELEVACIONES FRONTALES':                              ['ELEVACIONES LATERALES DE HOMBRO MANCUERNA'],
  'FACE PULL':                                          ['VUELOS INVERTIDOS CON MANCUERNA', 'VUELOS INVERTIDOS EN MÁQUINA', 'VUELOS INVERTIDOS EN POLEA'],
  'VUELOS INVERTIDOS CON MANCUERNA':                    ['VUELOS INVERTIDOS EN MÁQUINA', 'VUELOS INVERTIDOS EN POLEA', 'FACE PULL'],
  'VUELOS INVERTIDOS EN MÁQUINA':                       ['VUELOS INVERTIDOS CON MANCUERNA', 'VUELOS INVERTIDOS EN POLEA', 'FACE PULL'],
  'VUELOS INVERTIDOS EN POLEA':                         ['VUELOS INVERTIDOS CON MANCUERNA', 'VUELOS INVERTIDOS EN MÁQUINA'],
  'REMO AL MENTÓN':                                     ['ELEVACIONES LATERALES DE HOMBRO MANCUERNA', 'ENCOGIMIENTO DE HOMBROS'],
  'ENCOGIMIENTO DE HOMBROS':                            ['REMO AL MENTÓN'],

  // ══ Bíceps ══
  'CURL DE BÍCEPS EN BARRA':                            ['CURL DE BÍCEPS PREDICADOR', 'CURL DE BÍCEPS INCLINADO'],
  'CURL DE BÍCEPS PREDICADOR':                          ['CURL DE BÍCEPS EN BARRA', 'CURL DE BÍCEPS INCLINADO'],
  'CURL DE BÍCEPS INCLINADO':                           ['CURL DE BÍCEPS SUPINO', 'CURL DE BÍCEPS PREDICADOR'],
  'CURL DE BÍCEPS SUPINO':                              ['CURL DE BÍCEPS PREDICADOR', 'CURL DE BÍCEPS INCLINADO'],
  'CURL DE BÍCEPS MARTILLO':                            ['CURL DE BÍCEPS SPIDERMAN', 'CURL DE BÍCEPS CONCENTRADO'],
  'CURL DE BÍCEPS PRONO':                               ['CURL DE BÍCEPS EN BARRA', 'CURL DE BÍCEPS MARTILLO'],
  'CURL DE BÍCEPS BAYESIAN':                            ['CURL DE BÍCEPS PREDICADOR', 'CURL DE BÍCEPS SUPINO'],
  'CURL DE BÍCEPS SPIDERMAN':                           ['CURL DE BÍCEPS MARTILLO', 'CURL DE BÍCEPS CONCENTRADO'],
  'CURL DE BÍCEPS CONCENTRADO':                         ['CURL DE BÍCEPS PREDICADOR', 'CURL DE BÍCEPS MARTILLO'],

  // ══ Tríceps ══
  'TRICEP PUSH DOWN':                                   ['PRESS FRANCES CON MANCUERNAS', 'EXTENSIÓN DE TRÍCEPS SOBRE CABEZA'],
  'PRESS FRANCES CON MANCUERNAS':                       ['TRICEP PUSH DOWN', 'EXTENSIÓN DE TRÍCEPS SOBRE CABEZA'],
  'EXTENSIÓN DE TRÍCEPS SOBRE CABEZA':                  ['PRESS FRANCES CON MANCUERNAS', 'TRICEP PUSH DOWN'],
  'PATADA DE TRÍCEPS':                                  ['TRICEP PUSH DOWN', 'EXTENSIÓN DE TRÍCEPS SOBRE CABEZA'],

  // ══ Core ══
  'CRUNCH CONVENCIONAL':                                ['CRUNCH EN CABLE', 'CRUNCH DOBLE EN V'],
  'CRUNCH EN CABLE':                                    ['CRUNCH CONVENCIONAL', 'RUEDA ABDOMINAL'],
  'CRUNCH DOBLE EN V':                                  ['CRUNCH CONVENCIONAL', 'ELEVACIONES DE PIERNAS (ABS)'],
  'ELEVACIONES DE PIERNAS (ABS)':                       ['CRUNCH DOBLE EN V', 'DRAGON FLAGS'],
  'DRAGON FLAGS':                                       ['ELEVACIONES DE PIERNAS (ABS)', 'RUEDA ABDOMINAL'],
  'RUEDA ABDOMINAL':                                    ['PLANCHA (PLANK)', 'DRAGON FLAGS'],
  'PLANCHA (PLANK)':                                    ['PLANCHA LATERAL', 'RUEDA ABDOMINAL'],
  'PLANCHA LATERAL':                                    ['PLANCHA (PLANK)', 'RUEDA ABDOMINAL'],
  'PALLOF PRESS':                                       ['PLANCHA LATERAL', 'RUEDA ABDOMINAL'],
};

// RER (Reps En Reserva) → Felipe's /10 effort convention. Work sets clamped to ≥ 7/10.
function rerToIntensity(rer) {
  if (rer === 'AMRAP') return '10/10';
  const n = typeof rer === 'number' ? rer : parseInt(String(rer).replace(/[^0-9]/g, ''), 10);
  if (isNaN(n)) return '';
  const raw = 10 - n;
  return `${Math.max(7, Math.min(10, raw))}/10`;
}

// Warmup intensity ramps (always ≤ 6/10).
const WARMUP_RAMPS = {
  0: [],
  1: ['5/10'],
  2: ['4/10', '6/10'],
  3: ['3/10', '5/10', '6/10'],
  4: ['3/10', '4/10', '5/10', '6/10'],
};

// sets('cal+work', reps, rer) → array of set objects.
//   sets('1+3', 8, 2)  → 1 warmup + 3 work, all 8 reps, work @ 8/10, warmup @ 5/10
//   sets('3', 8, 2)    → 3 work sets only (legacy form, no warmups)
function sets(spec, reps, rer) {
  const s = String(spec);
  const [cal, work] = s.includes('+') ? s.split('+').map((x) => parseInt(x, 10)) : [0, parseInt(s, 10)];
  const workIntensity = rerToIntensity(rer);
  const warmupIntensities = WARMUP_RAMPS[cal] || Array(cal).fill('5/10');
  const out = [];
  for (let i = 0; i < cal; i++) {
    out.push({ order: out.length, title: `Cal ${i + 1}`, reps: String(reps), intensity: warmupIntensities[i] });
  }
  for (let i = 0; i < work; i++) {
    out.push({ order: out.length, title: `Serie ${i + 1}`, reps: String(reps), intensity: workIntensity });
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────
// PDF SESSIONS — 23 total.
// Reps shown are Week 1 baseline; week-over-week progression handled at plan layer.
// `name` is the PDF shorthand; resolveName() maps to library key. Add `notes` for
// superset tags ("A1"/"A2") or tempo cues. `alt` is an optional alt-exercise list.

const PDF_SESSIONS = [
  // ── NOVATOS — Full Body, 3×/week, 12 weeks (no block change) ──
  {
    title: 'Full body — sentadilla y banca',
    exercises: [
      { name: 'Sentadilla',                                      sets: sets('3+3', 6, 3) },
      { name: 'Press de banca plana',                            sets: sets('2+3', 8, 3) },
      { name: 'Jalón al pecho polea alta',                       sets: sets('1+3', 10, 2) },
      { name: 'Peso muerto rumano',                              sets: sets('1+3', 10, 3) },
      { name: 'Fondos en paralelas',                             sets: sets('1+3', 8, 3) },
      { name: 'Elevaciones de talones con rodilla extendida',    sets: sets('1+3', 10, 2) },
      { name: 'Curl de bíceps supino',                           sets: sets('1+3', 10, 2) },
      { name: 'Tríceps push down',                               sets: sets('1+2', 15, 1), notes: 'Opcional (H)' },
      { name: 'Frog pumps',                                      sets: sets('1+2', 20, 1), notes: 'Opcional (M)' },
    ],
  },
  {
    title: 'Full body — peso muerto y militar',
    exercises: [
      { name: 'Peso muerto',                                     sets: sets('3+3', 5, 3) },
      { name: 'Press militar en barra',                          sets: sets('2+3', 8, 2) },
      { name: 'Seal row',                                        sets: sets('2+3', 10, 2) },
      { name: 'Extensión de rodilla',                            sets: sets('1+3', 12, 2) },
      { name: 'Vuelos en polea para pectoral',                   sets: sets('1+3', 15, 2) },
      { name: 'Crunch en cable',                                 sets: sets('1+3', 20, 3) },
      { name: 'Rompe cráneos',                                   sets: sets('1+3', 12, 2) },
      { name: 'Curl predicador',                                 sets: sets('1+2', 15, 1), notes: 'Opcional (H)' },
      { name: 'Hip thrust unilateral',                           sets: sets('1+2', 20, 1), notes: 'Opcional (M)' },
    ],
  },
  {
    title: 'Full body — búlgara y press inclinado',
    exercises: [
      { name: 'Sentadilla búlgara',                              sets: sets('3+3', 10, 2) },
      { name: 'Press inclinado con mancuernas',                  sets: sets('2+3', 12, 3) },
      { name: 'Pull down supino',                                sets: sets('2+3', 15, 2) },
      { name: 'Hip thrust',                                      sets: sets('1+3', 10, 2) },
      { name: 'Face pull',                                       sets: sets('1+3', 20, 2) },
      { name: 'Elevaciones laterales de hombro',                 sets: sets('1+3', 15, 1) },
      { name: 'Curl de pierna acostado',                         sets: sets('1+3', 12, 1) },
      { name: 'Pull over',                                       sets: sets('1+2', 20, 1), notes: 'Opcional (H)' },
      { name: 'Sissy squat',                                     sets: sets('1+2', 15, 1), notes: 'Opcional (M)' },
    ],
  },

  // ── INTERMEDIOS — Torso-Pierna, 4×/week, 12 weeks, Bloque #1 (wk 1-6) ──
  {
    title: 'Pierna — peso muerto y sentadilla box',
    exercises: [
      { name: 'Peso muerto',                                     sets: sets('3+3', 5, 3) },
      { name: 'SENTADILLA BOX',                                  sets: sets('1+3', 10, 2) },
      { name: 'Curl de pierna acostado',                         sets: sets('1+3', 10, 1) },
      { name: 'Sissy squat',                                     sets: sets('1+3', 15, 2) },
      { name: 'Elevaciones de talones con rodilla flexionada',   sets: sets('1+3', 12, 1) },
      { name: 'Clam',                                            sets: sets('1+3', 20, 2) },
      { name: 'Rueda abdominal',                                 sets: sets('1+2', 10, 1) },
    ],
  },
  {
    title: 'Torso — banca y dominadas',
    exercises: [
      { name: 'Press de banca plana',                            sets: sets('2+2', 4, 2) },
      { name: 'Chin up',                                         sets: sets('1+3', '6-8', 2) },
      { name: 'Press militar con mancuernas',                    sets: sets('2+3', 12, 2) },
      { name: 'Seal row',                                        sets: sets('1+3', '10-12', 3) },
      { name: 'Face pull',                                       sets: sets('1+3', 20, 2) },
      { name: 'Elevaciones laterales en máquina',                sets: sets('1+3', 12, 1) },
      { name: 'Curl en barra',                                   sets: sets('1+3', 8, 1) },
    ],
  },
  {
    title: 'Pierna — sentadilla y hip thrust',
    exercises: [
      { name: 'Sentadilla',                                      sets: sets('3+3', 4, 1) },
      { name: 'Hip thrust',                                      sets: sets('1+3', 5, 2) },
      { name: 'Peso muerto rumano',                              sets: sets('1+3', 12, 2) },
      { name: 'Extensión de rodilla',                            sets: sets('1+3', 12, 2) },
      { name: 'Hiperextensión 45°',                              sets: sets('1+3', 15, 1) },
      { name: 'Elevaciones de talones con rodilla extendida',    sets: sets('1+2', 20, 1) },
      { name: 'Elevaciones de piernas',                          sets: sets('1+2', 10, 1) },
    ],
  },
  {
    title: 'Torso — dominadas y remos',
    exercises: [
      { name: 'Dominadas prono',                                 sets: sets('2+3', '4-6', 2) },
      { name: 'Press inclinado',                                 sets: sets('2+3', 8, 2) },
      { name: 'Remo en cable agarre abierto',                    sets: sets('2+3', 10, 2), notes: 'A1' },
      { name: 'Remo en cable agarre cerrado',                    sets: sets('1+3', 10, 1), notes: 'A2' },
      { name: 'Elevaciones laterales en cable',                  sets: sets('1+3', '15-20', 1) },
      { name: 'Curl de bíceps supino',                           sets: sets('1+2', 10, 1), notes: 'A1' },
      { name: 'Curl de bíceps martillo',                         sets: sets('1+2', 10, 1), notes: 'A2' },
      { name: 'Curl de bíceps prono',                            sets: sets('1+2', 10, 2), notes: 'A3' },
      { name: 'Tríceps push down',                               sets: sets('1+3', 12, 2) },
    ],
  },

  // ── INTERMEDIOS Bloque #2 (wk 7-12) ──
  {
    title: 'Pierna — sentadilla y RDL',
    exercises: [
      { name: 'Sentadilla',                                      sets: sets('3+3', 7, 2) },
      { name: 'Peso muerto rumano',                              sets: sets('1+3', 10, 3) },
      { name: 'Sentadilla búlgara',                              sets: sets('3+3', '11 c/u', 2) },
      { name: 'Buenos días',                                     sets: sets('1+3', 15, 3) },
      { name: 'Curl de pierna sentado',                          sets: sets('1+3', 12, 3) },
      { name: 'Elevaciones de talones con rodilla extendida',    sets: sets('1+3', 20, 2) },
      { name: 'Abducción de cadera',                             sets: sets('1+3', 20, 2) },
      { name: 'Plancha',                                         sets: sets('1+2', '40s', 1) },
    ],
  },
  {
    title: 'Torso — banca y jalón',
    exercises: [
      { name: 'Press de banca plana',                            sets: sets('2+3', 5, 2) },
      { name: 'Jalón al pecho polea alta',                       sets: sets('1+3', 12, 2) },
      { name: 'Press inclinado con mancuernas',                  sets: sets('2+3', 12, 3) },
      { name: 'Vuelos en polea para pectoral',                   sets: sets('1+3', 15, 1) },
      { name: 'Elevaciones laterales de hombro',                 sets: sets('1+3', 12, 1) },
      { name: 'Rompe cráneos',                                   sets: sets('1+3', 9, 2) },
      { name: 'Curl predicador',                                 sets: sets('1+2', '15-20', 1) },
      { name: 'Vuelos invertidos',                               sets: sets('1+2', 20, 1) },
    ],
  },
  {
    title: 'Pierna — peso muerto y frontal',
    exercises: [
      { name: 'Peso muerto',                                     sets: sets('3+3', 6, 3) },
      { name: 'Sentadilla frontal o con safety bar',             sets: sets('2+3', 12, 3), notes: 'o con safety bar' },
      { name: 'Hip thrust',                                      sets: sets('1+3', 10, 2) },
      { name: 'Curl de pierna acostado constante',               sets: sets('1+3', 15, 1), notes: 'Tensión constante' },
      { name: 'Extensión de rodilla',                            sets: sets('1+3', 12, 2) },
      { name: 'Pull through',                                    sets: sets('1+3', 15, 1) },
      { name: 'Crunch convencional',                             sets: sets('1+2', 20, 1) },
      { name: 'Elevaciones de piernas',                          sets: sets('1+2', 10, 1) },
    ],
  },
  {
    title: 'Torso — militar y remo',
    exercises: [
      { name: 'Press militar en barra',                          sets: sets('2+4', 4, 2) },
      { name: 'Remo en barra horizontal',                        sets: sets('2+3', 11, 3) },
      { name: 'PRESS INCLINADO AGARRE CERRADO',                  sets: sets('2+3', 15, 2) },
      { name: 'Remo unilateral con mancuerna',                   sets: sets('1+3', 8, 2) },
      { name: 'Curl de bíceps inclinado',                        sets: sets('1+3', 9, 2) },
      { name: 'Elevaciones laterales en cable',                  sets: sets('1+3', 10, 1) },
      { name: 'Pull over',                                       sets: sets('1+2', 20, 1) },
      { name: 'Face pull',                                       sets: sets('1+3', 20, 2) },
    ],
  },

  // ── AVANZADOS — PPL, 6×/week, 12 weeks, Bloque #1 (wk 1-5/6) ──
  {
    title: 'Pierna — sentadilla y prensa unilateral',
    exercises: [
      { name: 'Sentadilla',                                      sets: sets('3+3', 6, 3) },
      { name: 'Peso muerto rumano',                              sets: sets('1+3', 10, 3) },
      { name: 'Prensa a una pierna',                             sets: sets('3+3', '10 c/u', 2) },
      { name: 'Extensión de rodilla',                            sets: sets('1+3', 12, 2) },
      { name: 'Curl de pierna sentado',                          sets: sets('1+2', 12, 3) },
      { name: 'Elevaciones de talones con rodilla extendida',    sets: sets('1+3', 20, 2) },
      { name: 'Abducción de cadera',                             sets: sets('1+3', 20, 2) },
      { name: 'Plancha',                                         sets: sets('1+2', '40s', 1) },
    ],
  },
  {
    title: 'Empuje — banca y fondos',
    exercises: [
      { name: 'Press de banca plana',                            sets: sets('2+3', 4, 3) },
      { name: 'Press militar en máquina',                        sets: sets('1+3', 12, 2) },
      { name: 'Fondos',                                          sets: sets('2+3', 10, 3) },
      { name: 'Rompe cráneos',                                   sets: sets('1+3', 8, 2) },
      { name: 'Elevaciones laterales de hombro',                 sets: sets('1+3', 12, 1) },
      { name: 'Patada de tríceps',                               sets: sets('1+3', 20, 2) },
    ],
  },
  {
    title: 'Jalón — dominada y pullover',
    exercises: [
      { name: 'Dominada prono',                                  sets: sets('1+3', 6, 2) },
      { name: 'Remo en cable',                                   sets: sets('2+3', 12, 3) },
      { name: 'Pull over',                                       sets: sets('1+3', 20, 2) },
      { name: 'Curl martillo',                                   sets: sets('1+3', 12, 1) },
      { name: 'Curl inclinado',                                  sets: sets('1+3', 15, 2) },
      { name: 'Encogimiento de hombros',                         sets: sets('1+3', 20, 1) },
    ],
  },
  {
    title: 'Pierna — peso muerto y glute ham raise',
    exercises: [
      { name: 'Peso muerto',                                     sets: sets('3+3', 6, 3) },
      { name: 'Sentadilla frontal o con safety bar',             sets: sets('2+3', 12, 3), notes: 'o con safety bar' },
      { name: 'Hip thrust',                                      sets: sets('1+3', 10, 2) },
      { name: 'Glute ham raise',                                 sets: sets('1+3', 12, 2) },
      { name: 'Curl de pierna acostado',                         sets: sets('1+2', 15, 3) },
      { name: 'Elevaciones de talones con rodilla flexionada',   sets: sets('1+3', 20, 2) },
      { name: 'Abducción de cadera sentado',                     sets: sets('1+3', 20, 2) },
      { name: 'Crunch convencional',                             sets: sets('1+2', 20, 1) },
    ],
  },
  {
    title: 'Empuje — militar y press cerrado',
    exercises: [
      { name: 'Press militar en barra',                          sets: sets('2+3', 4, 2) },
      { name: 'PRESS INCLINADO AGARRE CERRADO',                  sets: sets('2+3', 12, 2) },
      { name: 'Vuelos en polea para pectoral',                   sets: sets('1+3', 15, 1) },
      { name: 'Extensión tríceps sobre cabeza',                  sets: sets('1+3', 10, 2) },
      { name: 'Elevaciones laterales 21s',                       sets: sets('1+3', '7/7/7', 1), notes: 'Método 21s (7 bajo / 7 alto / 7 full)' },
      { name: 'Patada de tríceps',                               sets: sets('1+3', 15, 2) },
      { name: 'Elevaciones de piernas',                          sets: sets('1+2', 10, 1) },
    ],
  },
  {
    title: 'Jalón — jalón y seal row',
    exercises: [
      { name: 'Jalón al pecho polea alta',                       sets: sets('1+3', 12, 2) },
      { name: 'Seal row',                                        sets: sets('2+3', 10, 3) },
      { name: 'Face pull',                                       sets: sets('1+3', 20, 2) },
      { name: 'Curl pronado',                                    sets: sets('1+3', 15, 1), notes: 'A1' },
      { name: 'Curl supino',                                     sets: sets('1+3', 12, 2), notes: 'A2' },
      { name: 'Vuelos invertidos',                               sets: sets('1+2', 20, 1) },
      { name: 'Curl bayesian',                                   sets: sets('1+2', 20, 1) },
    ],
  },

  // ── AVANZADOS Bloque #2 (wk 7/8-11) ──
  {
    title: 'Pierna — peso muerto y hiperextensión',
    exercises: [
      { name: 'Peso muerto',                                     sets: sets('3+3', 6, 3) },
      { name: 'SENTADILLA BOX',                                  sets: sets('1+3', 10, 3) },
      { name: 'Hiperextensión 45°',                              sets: sets('3+3', 15, 2) },
      { name: 'Sentadilla búlgara',                              sets: sets('1+3', 12, 2) },
      { name: 'Extensión de rodilla a una pierna',               sets: sets('1+2', 15, 3) },
      { name: 'Curl de pierna a una pierna',                     sets: sets('1+3', 15, 2) },
      { name: 'Caminata con banda lateral',                      sets: sets('1+3', 20, 2) },
      { name: 'Crunch doble',                                    sets: sets('1+2', '40s', 1) },
    ],
  },
  {
    title: 'Empuje — banca y multipower',
    exercises: [
      { name: 'Press de banca plana',                            sets: sets('2+3', 4, 3) },
      { name: 'Press militar con mancuerna sentado',             sets: sets('1+3', 8, 2) },
      { name: 'PRESS DE BANCA CERRADO EN MULTIPOWER',            sets: sets('2+3', 10, 3) },
      { name: 'Vuelos en polea (de abajo a arriba)',             sets: sets('1+3', 15, 2) },
      { name: 'Rompe cráneos',                                   sets: sets('1+3', 12, 1) },
      { name: 'Elevaciones laterales de hombro (preferencia personal)', sets: sets('1+3', '15-20', 2) },
    ],
  },
  {
    title: 'Jalón — dominada neutra y remo',
    exercises: [
      { name: 'Dominada neutra',                                 sets: sets('1+3', 6, 2) },
      { name: 'Remo en barra',                                   sets: sets('2+3', 10, 3) },
      { name: 'Remo con apoyo en pecho',                         sets: sets('1+3', 12, 2) },
      { name: 'Vuelos invertidos',                               sets: sets('1+3', 15, 1) },
      { name: 'Remo erguido',                                    sets: sets('1+3', 12, 2) },
      { name: 'Curl spiderman',                                  sets: sets('1+3', 20, 1) },
    ],
  },
  {
    title: 'Pierna — sentadilla y hip thrust con pausa',
    exercises: [
      { name: 'Sentadilla',                                      sets: sets('3+3', 6, 3) },
      { name: 'Peso muerto rumano',                              sets: sets('2+3', 12, 3) },
      { name: 'Hip thrust con pausa',                            sets: sets('1+3', 10, 2), notes: 'Pausa arriba 3s' },
      { name: 'Sentadilla goblet',                               sets: sets('1+3', 12, 2) },
      { name: 'Curl de pierna acostado',                         sets: sets('1+2', 15, 3) },
      { name: 'Elevaciones de talones con rodilla flexionada',   sets: sets('1+3', 20, 2) },
      { name: 'Pull through',                                    sets: sets('1+3', 20, 2) },
      { name: 'Crunch convencional',                             sets: sets('1+2', 20, 1) },
    ],
  },
  {
    title: 'Empuje — militar e inclinado',
    exercises: [
      { name: 'Press militar en barra',                          sets: sets('2+2', 4, 2) },
      { name: 'Press inclinado con mancuernas',                  sets: sets('2+3', 12, 2) },
      { name: 'Vuelos en polea para pectoral (arriba abajo)',    sets: sets('1+3', 15, 1) },
      { name: 'Tríceps push down',                               sets: sets('1+3', 12, 2) },
      { name: 'Elevaciones laterales de hombro',                 sets: sets('1+3', 15, 1) },
      { name: 'Fondos con excéntrica acentuada',                 sets: sets('1+3', 10, 2), notes: 'Excéntrica 3s' },
      { name: 'Elevaciones de piernas',                          sets: sets('1+2', 12, 1) },
    ],
  },
  {
    title: 'Jalón — supina con drop set',
    exercises: [
      { name: 'JALÓN AL PECHO POLEA ALTA SUPINA',                sets: sets('1+3', 12, 2) },
      { name: 'Seal row',                                        sets: sets('2+3', 10, 3) },
      { name: 'Pull over',                                       sets: sets('1+3', 20, 2) },
      { name: 'Curl pronado',                                    sets: sets('1+3', 15, 1), notes: 'A1 (drop set mecánico)' },
      { name: 'Curl martillo',                                   sets: sets('1+3', 12, 2), notes: 'A2' },
      { name: 'Curl supino',                                     sets: sets('1+2', 20, 1), notes: 'A3' },
      { name: 'Vuelos invertidos',                               sets: sets('1+2', 20, 1) },
    ],
  },
];

// ─────────────────────────────────────────────────────────────────────
// Writers

async function loadLibrary() {
  const doc = await db.collection('exercises_library').doc(LIB_ID).get();
  if (!doc.exists) throw new Error(`Library doc not found: ${LIB_ID}`);
  return doc.data();
}

async function validate() {
  const lib = await loadLibrary();
  const META = new Set(['creator_id', 'creator_name', 'title', 'created_at', 'updated_at', 'icon']);
  const libNames = new Set(Object.keys(lib).filter((k) => !META.has(k)));
  const newNames = new Set(Object.keys(NEW_EXERCISES));

  const missing = [];
  let exCount = 0;
  for (const s of PDF_SESSIONS) {
    for (const ex of s.exercises) {
      exCount++;
      const resolved = resolveName(ex.name);
      if (!libNames.has(resolved) && !newNames.has(resolved)) {
        missing.push(`${s.title}  "${ex.name}"  → "${resolved}"`);
      }
      if (ex.alt) {
        for (const a of ex.alt) {
          const r = resolveName(a);
          if (!libNames.has(r) && !newNames.has(r)) missing.push(`  (explicit alt) ${s.title}  "${a}" → "${r}"`);
        }
      }
    }
  }
  // Validate ALTERNATIVES map: every entry's target list must resolve to library or new entries.
  const altMissing = [];
  for (const [src, alts] of Object.entries(ALTERNATIVES)) {
    if (!libNames.has(src) && !newNames.has(src)) altMissing.push(`ALT key "${src}" not in library`);
    for (const a of alts) {
      if (!libNames.has(a) && !newNames.has(a)) altMissing.push(`ALT["${src}"] → "${a}" not in library`);
    }
  }

  console.log('\n=== VALIDATE ===');
  console.log(`library entries: ${libNames.size}`);
  console.log(`new entries to add: ${newNames.size}`);
  console.log(`PDF sessions: ${PDF_SESSIONS.length}`);
  console.log(`total exercise references: ${exCount}`);
  console.log(`ALTERNATIVES map entries: ${Object.keys(ALTERNATIVES).length}`);
  let ok = true;
  if (missing.length) {
    console.log(`\nMISSING session refs (${missing.length}):`);
    missing.forEach((m) => console.log('  ' + m));
    ok = false;
  }
  if (altMissing.length) {
    console.log(`\nMISSING ALTERNATIVES targets (${altMissing.length}):`);
    altMissing.forEach((m) => console.log('  ' + m));
    ok = false;
  }
  if (ok) console.log(`✓ all ${exCount} session refs and ${Object.values(ALTERNATIVES).reduce((n, a) => n + a.length + 1, 0)} ALT refs resolve`);
  return ok;
}

async function addMissingExercises({ write }) {
  const lib = await loadLibrary();
  const updates = {};
  const skipped = [];
  for (const [name, props] of Object.entries(NEW_EXERCISES)) {
    if (lib[name]) { skipped.push(name); continue; }
    updates[name] = {
      implements: props.implements,
      muscle_activation: props.muscle_activation,
      created_at: FieldValue.serverTimestamp(),
      updated_at: FieldValue.serverTimestamp(),
    };
  }
  const added = Object.keys(updates);
  console.log('\n=== ADD-MISSING EXERCISES ===');
  console.log(`to add: ${added.length}`);
  for (const n of added) {
    const p = NEW_EXERCISES[n];
    const musc = Object.entries(p.muscle_activation).map(([k, v]) => `${k}:${v}`).join(', ');
    console.log(`  + ${n}  [${p.implements.join('/')}]  {${musc}}`);
  }
  if (skipped.length) console.log(`skipped (already in library): ${skipped.length}  [${skipped.join(', ')}]`);
  if (write && added.length > 0) {
    await db.collection('exercises_library').doc(LIB_ID).update(updates);
    console.log('✓ written');
  } else {
    console.log(write ? '(nothing to add)' : '(dry-run, not written)');
  }
}

async function seedSession(s, order, { write }) {
  const sessionsCol = db.collection('creator_libraries').doc(FELIPE_UID).collection('sessions');

  const existing = await sessionsCol.where('title', '==', s.title).limit(1).get();
  if (!existing.empty) {
    console.log(`  SKIP (exists): [${order}] ${s.title}`);
    return;
  }

  console.log(`\n  SESSION [${order}] ${s.title}  (${s.exercises.length} ex)`);
  s.exercises.forEach((ex, i) => {
    const resolved = resolveName(ex.name);
    const explicitAlts = (ex.alt || []).map(resolveName);
    const mapAlts = ALTERNATIVES[resolved] || [];
    const merged = [...new Set([...explicitAlts, ...mapAlts])];
    const tags = [];
    if (ex.notes) tags.push(`notes:"${ex.notes}"`);
    if (merged.length > 0) tags.push(`alt:[${merged.join(' | ')}]`);
    console.log(`    [${i}] ${resolved}${tags.length ? '  ' + tags.join(' ') : ''}`);
    ex.sets.forEach((st) => console.log(`        • ${st.title}: ${st.reps} reps @ ${st.intensity}`));
  });

  if (!write) return;

  const sesRef = await sessionsCol.add({
    title: s.title,
    order,
    defaultDataTemplate: DEFAULT_TEMPLATE,
    created_at: FieldValue.serverTimestamp(),
    updated_at: FieldValue.serverTimestamp(),
  });

  for (let i = 0; i < s.exercises.length; i++) {
    const ex = s.exercises[i];
    const resolved = resolveName(ex.name);
    const explicitAlts = (ex.alt || []).map(resolveName);
    const mapAlts = ALTERNATIVES[resolved] || [];
    const merged = [...new Set([...explicitAlts, ...mapAlts])];
    const alternatives = merged.length > 0 ? { [LIB_ID]: merged } : {};
    const exData = {
      order: i,
      primary: { [LIB_ID]: resolved },
      alternatives,
      measures: DEFAULT_TEMPLATE.measures,
      objectives: DEFAULT_TEMPLATE.objectives,
      customMeasureLabels: {},
      customObjectiveLabels: {},
      created_at: FieldValue.serverTimestamp(),
      updated_at: FieldValue.serverTimestamp(),
    };
    if (ex.notes) exData.notes = ex.notes;
    const exRef = await sesRef.collection('exercises').add(exData);

    for (const st of ex.sets) {
      await exRef.collection('sets').add({
        ...st,
        created_at: FieldValue.serverTimestamp(),
      });
    }
  }
  console.log(`  ✓ written (${sesRef.id})`);
}

async function seedPdf({ write, limit }) {
  const total = limit ? Math.min(limit, PDF_SESSIONS.length) : PDF_SESSIONS.length;
  console.log(`\n=== SEED PDF SESSIONS (${total}${limit ? ` of ${PDF_SESSIONS.length}` : ''}) ===`);
  for (let i = 0; i < total; i++) {
    await seedSession(PDF_SESSIONS[i], i, { write });
  }
}

async function seedExcel({ write }) {
  const { loadExcelSessions, EXCEL_NAME_MAP } = require('./bejarano-excel-data.js');
  // Merge Excel-specific name map into main NAME_MAP (idempotent).
  for (const [k, v] of Object.entries(EXCEL_NAME_MAP)) {
    if (!NAME_MAP[k]) NAME_MAP[k] = v;
  }
  const { sessions, warnings } = loadExcelSessions();
  console.log(`\n=== SEED EXCEL SESSIONS (${sessions.length}) ===`);
  if (warnings.length) {
    console.log(`warnings:`);
    warnings.forEach((w) => console.log(`  ⚠ ${w}`));
  }
  // Continue order after PDF sessions (PDFs occupy order 0..PDF_SESSIONS.length-1)
  const baseOrder = PDF_SESSIONS.length;
  for (let i = 0; i < sessions.length; i++) {
    await seedSession(sessions[i], baseOrder + i, { write });
  }
}


// ─────────────────────────────────────────────────────────────────────
// CLI

(async () => {
  const argv = process.argv.slice(2);
  const args = new Set(argv);
  const write = args.has('--write');
  const doValidate = args.has('--validate') || args.has('--all') || args.has('--seed-pdf');
  const doAddMissing = args.has('--add-missing') || args.has('--all');
  const doSeedPdf = args.has('--seed-pdf') || args.has('--all');
  const doSeedExcel = args.has('--seed-excel') || args.has('--all');
  const limitArg = argv.find((a) => a.startsWith('--limit='));
  const limit = limitArg ? parseInt(limitArg.split('=')[1], 10) : 0;

  if (!doValidate && !doAddMissing && !doSeedPdf && !doSeedExcel) {
    console.log('Usage:  node scripts/seed-felipe-sessions.js [flags]');
    console.log('  --validate       verify every exercise name resolves');
    console.log(`  --add-missing    add ${Object.keys(NEW_EXERCISES).length} new exercises to library`);
    console.log(`  --seed-pdf       create ${PDF_SESSIONS.length} PDF-driven sessions (implies --validate)`);
    console.log('  --limit=N        only seed first N sessions (with --seed-pdf)');
    console.log('  --seed-excel     (not implemented — phase 2)');
    console.log('  --all            validate + add-missing + seed-pdf + seed-excel');
    console.log('  --write          commit changes (default is dry-run)');
    process.exit(0);
  }

  console.log(`Project: ${PROJECT_ID}  uid: ${FELIPE_UID}`);
  console.log(`Mode: ${write ? 'WRITE' : 'DRY RUN'}   flags: ${[...args].join(' ')}`);

  if (doValidate) {
    const ok = await validate();
    if (!ok) {
      console.log('\nFix NAME_MAP or NEW_EXERCISES before --write. Aborting.');
      process.exit(1);
    }
  }
  if (doAddMissing) await addMissingExercises({ write });
  if (doSeedPdf) await seedPdf({ write, limit });
  if (doSeedExcel) await seedExcel({ write });

  console.log(`\n${write ? 'DONE.' : 'DRY RUN complete. Re-run with --write to commit.'}`);
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
