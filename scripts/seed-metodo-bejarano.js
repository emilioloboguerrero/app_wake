#!/usr/bin/env node
'use strict';

/**
 * Método Bejarano — multi-month seed.
 *
 * Authors:
 *   1. Library templates at creator_libraries/{FELIPE_UID}/sessions/* —
 *      one per session-slot per month, titled "Mes N — <Slot>".
 *   2. Course doc at courses/{auto-id} titled "Método Bejarano",
 *      deliveryType "general", block_cadence "monthly_first_monday",
 *      subscription_price 79000, status "draft".
 *   3. One module per configured month at courses/{id}/modules/*,
 *      titled "Mes N — <Theme>", published_at: null (drafts — flip to
 *      published in the dashboard before each one should go live).
 *   4. 5 module sessions per module, each referencing its library template
 *      via source_library_session_id, with exercises + sets COPIED in so
 *      per-month edits don't mutate the library.
 *
 * Currently configured: M1 (Base), M2 (Volumen), M3 (Hipertrofia avanzada).
 * Add more months by extending the MONTHS array.
 *
 * Locked product decisions: see docs/METODO_BEJARANO.md.
 *
 * Usage:
 *   NODE_PATH=functions/node_modules node scripts/seed-metodo-bejarano.js              (dry-run, default)
 *   NODE_PATH=functions/node_modules node scripts/seed-metodo-bejarano.js --validate   (only check name resolution)
 *   NODE_PATH=functions/node_modules node scripts/seed-metodo-bejarano.js --months=1,2 (subset of months)
 *   NODE_PATH=functions/node_modules node scripts/seed-metodo-bejarano.js --write      (commit)
 *
 * Idempotent: re-running skips library sessions whose title already exists,
 * the course if one already exists for Felipe by title, and modules whose
 * title already exists within that course.
 *
 * Requires gcloud application-default credentials.
 */

const admin = require('firebase-admin');

const FELIPE_UID = 'yMqKOXBcVARa6vjU7wImf3Tp85J2';
const LIB_ID = 'jeoVyzhUrBeJofT62MOe';
const PROJECT_ID = 'wolf-20b8b';
const COURSE_TITLE = 'Método Bejarano';
const SUBSCRIPTION_PRICE_COP = 79000;

admin.initializeApp({
  credential: admin.credential.applicationDefault(),
  projectId: PROJECT_ID,
});
const db = admin.firestore();
const { FieldValue } = admin.firestore;

// ─────────────────────────────────────────────────────────────────────
// Defaults

const DEFAULT_TEMPLATE = {
  measures: ['reps', 'weight', 'intensity'],
  objectives: ['reps', 'intensity', 'previous'],
  customMeasureLabels: {},
  customObjectiveLabels: {},
};

// Working sets only — no warmup ramps. All intensities ≥ 7/10 per project rule.
function workSets({ count, reps, repSequence, restSeconds, intensity = '7/10' }) {
  const out = [];
  for (let i = 0; i < count; i++) {
    const setData = {
      order: i,
      title: `Serie ${i + 1}`,
      reps: String(reps),
      intensity,
      restSeconds,
    };
    if (repSequence) setData.rep_sequence = repSequence;
    out.push(setData);
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────
// Spanish session notes (rendered in the workout walker).

const MES1_NOTES = [
  'Mes 1 — Base. Sigue este arco a lo largo del mes:',
  '• Semana 1: misma carga toda la sesión. Foco en técnica. Deja 3 reps en reserva.',
  '• Semana 2: sube la carga un poco. Mismas reps. Deja 2 reps en reserva.',
  '• Semana 3: sube la carga. Bajan las reps según el rep_sequence. Deja 1–2 reps en reserva.',
  '• Semana 4: baja la carga. Suben las reps según el rep_sequence. Recuperación.',
].join('\n');

const MES2_NOTES = [
  'Mes 2 — Volumen. Subes el volumen, mantienes intensidad moderada.',
  '• Semana 1: misma carga, deja 2 reps en reserva. Mismas reps que la sesión anterior.',
  '• Semana 2: sube la carga un poco. Mismas reps.',
  '• Semana 3: sube la carga. Bajan las reps según el rep_sequence. Deja 1–2 reps en reserva.',
  '• Semana 4: baja la carga. Suben las reps a tope. Foco en bombeo y conexión mente-músculo.',
].join('\n');

const MES3_NOTES = [
  'Mes 3 — Hipertrofia avanzada. Mismo volumen, ejercicios distintos. Foco en conexión mente-músculo.',
  '• Semana 1: misma carga, deja 2 reps en reserva. Excéntrica controlada (3s bajando).',
  '• Semana 2: sube la carga un poco. Mismas reps.',
  '• Semana 3: sube la carga. Bajan las reps según el rep_sequence. Deja 1–2 reps en reserva.',
  '• Semana 4: baja la carga. Suben las reps según el rep_sequence. Foco máximo en bombeo.',
].join('\n');

// ─────────────────────────────────────────────────────────────────────
// 12-month macro — authoring M1..M3 (CONSTRUIR phase). Extend with M4+.

const MONTHS = [
  {
    monthNumber: 1,
    moduleTitle: 'Mes 1 — Base',
    notes: MES1_NOTES,
    sessions: [
      {
        librarySlot: 'Empuje', moduleTitle: 'Empuje', order: 0, dayIndex: 1,
        exercises: [
          { name: 'PRESS DE BANCA PLANA',                       sets: workSets({ count: 4, reps: 10,       repSequence: [10, 10, 8, 12],  restSeconds: 120 }) },
          { name: 'PRESS MILITAR EN BARRA SENTADO',             sets: workSets({ count: 4, reps: 10,       repSequence: [10, 10, 8, 12],  restSeconds: 120 }) },
          { name: 'PRESS DE BANCA INCLINADO CON MANCUERNAS',    sets: workSets({ count: 3, reps: 12,       repSequence: [12, 12, 10, 15], restSeconds: 90 }) },
          { name: 'TRICEP PUSH DOWN',                           sets: workSets({ count: 3, reps: 12,       repSequence: [12, 12, 10, 15], restSeconds: 60 }) },
          { name: 'ELEVACIONES LATERALES DE HOMBRO MANCUERNA',  sets: workSets({ count: 3, reps: 12,       repSequence: [12, 12, 10, 15], restSeconds: 60 }) },
        ],
      },
      {
        librarySlot: 'Jalón', moduleTitle: 'Jalón', order: 1, dayIndex: 2,
        exercises: [
          { name: 'DOMINADA PRONO',                             sets: workSets({ count: 4, reps: 8,        repSequence: [8, 8, 6, 10],    restSeconds: 120 }) },
          { name: 'REMO EN BARRA HORIZONTAL',                   sets: workSets({ count: 4, reps: 10,       repSequence: [10, 10, 8, 12],  restSeconds: 120 }) },
          { name: 'JALÓN AL PECHO AGARRE AMPLIO (PULL DOWN)',   sets: workSets({ count: 3, reps: 12,       repSequence: [12, 12, 10, 15], restSeconds: 90 }) },
          { name: 'REMO EN CABLE AGARRE NEUTRO',                sets: workSets({ count: 3, reps: 12,       repSequence: [12, 12, 10, 15], restSeconds: 90 }) },
          { name: 'CURL DE BÍCEPS EN BARRA',                    sets: workSets({ count: 3, reps: 10,       repSequence: [10, 10, 8, 12],  restSeconds: 60 }) },
        ],
      },
      {
        librarySlot: 'Pierna (Quads)', moduleTitle: 'Pierna (Quads)', order: 2, dayIndex: 3,
        exercises: [
          { name: 'SENTADILLA TRASERA',                         sets: workSets({ count: 4, reps: 10,       repSequence: [10, 10, 8, 12],  restSeconds: 150 }) },
          { name: 'PRENSA DE PIERNA',                           sets: workSets({ count: 3, reps: 12,       repSequence: [12, 12, 10, 15], restSeconds: 120 }) },
          { name: 'ESTOCADA CAMINANDO (LUNGES)',                sets: workSets({ count: 3, reps: '10 c/u', repSequence: [10, 10, 8, 12],  restSeconds: 90 }) },
          { name: 'EXTENSION DE CUADRICEPS',                    sets: workSets({ count: 3, reps: 12,       repSequence: [12, 12, 10, 15], restSeconds: 60 }) },
          { name: 'ELEVACIÓN DE TALÓN CON RODILLA EXTENDIDA',   sets: workSets({ count: 3, reps: 15,       repSequence: [15, 15, 12, 20], restSeconds: 60 }) },
        ],
      },
      {
        librarySlot: 'Superior', moduleTitle: 'Superior', order: 3, dayIndex: 4,
        exercises: [
          { name: 'PRESS DE BANCA INCLINADO',                   sets: workSets({ count: 4, reps: 10,       repSequence: [10, 10, 8, 12],  restSeconds: 120 }) },
          { name: 'REMO UNILATERAL CON MANCUERNA',              sets: workSets({ count: 4, reps: '10 c/u', repSequence: [10, 10, 8, 12],  restSeconds: 90 }) },
          { name: 'PRESS MILITAR CON MANCUERNA SENTADO',        sets: workSets({ count: 3, reps: 10,       repSequence: [10, 10, 8, 12],  restSeconds: 90 }) },
          { name: 'JALÓN AL PECHO AGARRE CERRADO (PULL DOWN)',  sets: workSets({ count: 3, reps: 12,       repSequence: [12, 12, 10, 15], restSeconds: 90 }) },
          { name: 'CURL DE BÍCEPS MARTILLO',                    sets: workSets({ count: 3, reps: 12,       repSequence: [12, 12, 10, 15], restSeconds: 60 }) },
          { name: 'PRESS FRANCES CON MANCUERNAS',               sets: workSets({ count: 3, reps: 12,       repSequence: [12, 12, 10, 15], restSeconds: 60 }) },
        ],
      },
      {
        librarySlot: 'Pierna (Posterior)', moduleTitle: 'Pierna (Posterior)', order: 4, dayIndex: 5,
        exercises: [
          { name: 'PESO MUERTO RUMANO (RDL)',                   sets: workSets({ count: 4, reps: 10,       repSequence: [10, 10, 8, 12],  restSeconds: 120 }) },
          { name: 'HIP THRUST CON BARRA',                       sets: workSets({ count: 4, reps: 10,       repSequence: [10, 10, 8, 12],  restSeconds: 120 }) },
          { name: 'CURL DE PIERNA ACOSTADO',                    sets: workSets({ count: 3, reps: 12,       repSequence: [12, 12, 10, 15], restSeconds: 90 }) },
          { name: 'HIPEREXTENSIÓN 45°',                         sets: workSets({ count: 3, reps: 12,       repSequence: [12, 12, 10, 15], restSeconds: 60 }) },
          { name: 'PATADA DE GLÚTEO EN POLEA',                  sets: workSets({ count: 3, reps: '12 c/u', repSequence: [12, 12, 10, 15], restSeconds: 60 }) },
        ],
      },
    ],
  },

  // ── Mes 2 — Volumen ─────────────────────────────────────────
  {
    monthNumber: 2,
    moduleTitle: 'Mes 2 — Volumen',
    notes: MES2_NOTES,
    sessions: [
      {
        librarySlot: 'Empuje', moduleTitle: 'Empuje', order: 0, dayIndex: 1,
        exercises: [
          { name: 'PRESS DE BANCA INCLINADO',                          sets: workSets({ count: 4, reps: 12, repSequence: [12, 12, 10, 15], restSeconds: 90 }) },
          { name: 'PRESS MILITAR CON MANCUERNAS PARADO',               sets: workSets({ count: 4, reps: 12, repSequence: [12, 12, 10, 15], restSeconds: 90 }) },
          { name: 'PRESS EN MÁQUINA PLANO',                            sets: workSets({ count: 4, reps: 12, repSequence: [12, 12, 10, 15], restSeconds: 90 }) },
          { name: 'VUELOS PARA PECTORAL EN POLEA (DE ARRIBA A ABAJO)', sets: workSets({ count: 4, reps: 15, repSequence: [15, 15, 12, 20], restSeconds: 60 }) },
          { name: 'ELEVACIONES LATERALES DE HOMBRO EN CABLE',          sets: workSets({ count: 4, reps: 15, repSequence: [15, 15, 12, 20], restSeconds: 45 }) },
          { name: 'EXTENSIÓN DE TRÍCEPS SOBRE CABEZA',                 sets: workSets({ count: 4, reps: 15, repSequence: [15, 15, 12, 20], restSeconds: 45 }) },
        ],
      },
      {
        librarySlot: 'Jalón', moduleTitle: 'Jalón', order: 1, dayIndex: 2,
        exercises: [
          { name: 'JALÓN AL PECHO AGARRE AMPLIO (PULL DOWN)',          sets: workSets({ count: 4, reps: 12, repSequence: [12, 12, 10, 15], restSeconds: 90 }) },
          { name: 'SEAL ROW',                                          sets: workSets({ count: 4, reps: 12, repSequence: [12, 12, 10, 15], restSeconds: 90 }) },
          { name: 'DOMINADA SUPINA (CHIN UPS)',                        sets: workSets({ count: 4, reps: 8,  repSequence: [8, 8, 6, 10],    restSeconds: 90 }) },
          { name: 'REMO EN CABLE AGARRE ABIERTO',                      sets: workSets({ count: 4, reps: 12, repSequence: [12, 12, 10, 15], restSeconds: 60 }) },
          { name: 'CURL DE BÍCEPS INCLINADO',                          sets: workSets({ count: 3, reps: 15, repSequence: [15, 15, 12, 20], restSeconds: 45 }) },
          { name: 'CURL DE BÍCEPS MARTILLO',                           sets: workSets({ count: 3, reps: 15, repSequence: [15, 15, 12, 20], restSeconds: 45 }) },
        ],
      },
      {
        librarySlot: 'Pierna (Quads)', moduleTitle: 'Pierna (Quads)', order: 2, dayIndex: 3,
        exercises: [
          { name: 'SENTADILLA HACK',                                   sets: workSets({ count: 4, reps: 12,        repSequence: [12, 12, 10, 15], restSeconds: 120 }) },
          { name: 'SENTADILLA TRASERA',                                sets: workSets({ count: 4, reps: 10,        repSequence: [10, 10, 8, 12],  restSeconds: 120 }) },
          { name: 'PRENSA DE PIERNA UNILATERAL',                       sets: workSets({ count: 4, reps: '12 c/u',  repSequence: [12, 12, 10, 15], restSeconds: 90 }) },
          { name: 'EXTENSION DE CUADRICEPS',                           sets: workSets({ count: 4, reps: 15,        repSequence: [15, 15, 12, 20], restSeconds: 60 }) },
          { name: 'SISSY SQUAT',                                       sets: workSets({ count: 3, reps: 12,        repSequence: [12, 12, 10, 15], restSeconds: 60 }) },
          { name: 'ELEVACIONES DE TALONES CON RODILLA FLEXIONADA',     sets: workSets({ count: 3, reps: 20,        repSequence: [20, 20, 15, 25], restSeconds: 45 }) },
        ],
      },
      {
        librarySlot: 'Superior', moduleTitle: 'Superior', order: 3, dayIndex: 4,
        exercises: [
          { name: 'PRESS EN MÁQUINA INCLINADO',                        sets: workSets({ count: 4, reps: 12, repSequence: [12, 12, 10, 15], restSeconds: 90 }) },
          { name: 'REMO CON APOYO EN PECHO EN MÁQUINA',                sets: workSets({ count: 4, reps: 12, repSequence: [12, 12, 10, 15], restSeconds: 90 }) },
          { name: 'PRESS MILITAR EN MÁQUINA',                          sets: workSets({ count: 4, reps: 12, repSequence: [12, 12, 10, 15], restSeconds: 90 }) },
          { name: 'JALÓN AL PECHO POLEA ALTA SUPINA',                  sets: workSets({ count: 4, reps: 12, repSequence: [12, 12, 10, 15], restSeconds: 90 }) },
          { name: 'VUELOS INVERTIDOS EN MÁQUINA',                      sets: workSets({ count: 3, reps: 15, repSequence: [15, 15, 12, 20], restSeconds: 45 }) },
          { name: 'CURL DE BÍCEPS SPIDERMAN',                          sets: workSets({ count: 3, reps: 15, repSequence: [15, 15, 12, 20], restSeconds: 45 }) },
          { name: 'PRESS FRANCES CON MANCUERNAS',                      sets: workSets({ count: 3, reps: 15, repSequence: [15, 15, 12, 20], restSeconds: 45 }) },
        ],
      },
      {
        librarySlot: 'Pierna (Posterior)', moduleTitle: 'Pierna (Posterior)', order: 4, dayIndex: 5,
        exercises: [
          { name: 'PESO MUERTO',                                       sets: workSets({ count: 4, reps: 8,  repSequence: [8, 8, 6, 10],    restSeconds: 150 }) },
          { name: 'HIP THRUST EN MÁQUINA',                             sets: workSets({ count: 4, reps: 12, repSequence: [12, 12, 10, 15], restSeconds: 90 }) },
          { name: 'CURL DE PIERNA SENTADO',                            sets: workSets({ count: 4, reps: 12, repSequence: [12, 12, 10, 15], restSeconds: 60 }) },
          { name: 'GLUTE HAM RAISE',                                   sets: workSets({ count: 3, reps: 10, repSequence: [10, 10, 8, 12],  restSeconds: 90 }) },
          { name: 'PULL THROUGH',                                      sets: workSets({ count: 3, reps: 15, repSequence: [15, 15, 12, 20], restSeconds: 60 }) },
          { name: 'ABDUCCIÓN DE CADERA SENTADO EN MÁQUINA',            sets: workSets({ count: 3, reps: 20, repSequence: [20, 20, 15, 25], restSeconds: 45 }) },
        ],
      },
    ],
  },

  // ── Mes 3 — Hipertrofia avanzada ────────────────────────────
  {
    monthNumber: 3,
    moduleTitle: 'Mes 3 — Hipertrofia avanzada',
    notes: MES3_NOTES,
    sessions: [
      {
        librarySlot: 'Empuje', moduleTitle: 'Empuje', order: 0, dayIndex: 1,
        exercises: [
          { name: 'PRESS DE BANCA INCLINADO CON MANCUERNAS',           sets: workSets({ count: 4, reps: 10,       repSequence: [10, 10, 8, 12],  restSeconds: 120 }) },
          { name: 'PRESS MILITAR CON MANCUERNA SENTADO',               sets: workSets({ count: 4, reps: 10,       repSequence: [10, 10, 8, 12],  restSeconds: 120 }) },
          { name: 'FONDOS EN PARALELAS',                               sets: workSets({ count: 4, reps: 10,       repSequence: [10, 10, 8, 12],  restSeconds: 90 }) },
          { name: 'VUELOS PARA PECTORAL CON MANCUERNAS',               sets: workSets({ count: 3, reps: 12,       repSequence: [12, 12, 10, 15], restSeconds: 60 }) },
          { name: 'ELEVACIONES LATERALES DE HOMBRO MÁQUINA',           sets: workSets({ count: 3, reps: 12,       repSequence: [12, 12, 10, 15], restSeconds: 60 }) },
          { name: 'PATADA DE TRÍCEPS',                                 sets: workSets({ count: 3, reps: '12 c/u', repSequence: [12, 12, 10, 15], restSeconds: 45 }) },
        ],
      },
      {
        librarySlot: 'Jalón', moduleTitle: 'Jalón', order: 1, dayIndex: 2,
        exercises: [
          { name: 'DOMINADA NEUTRA',                                   sets: workSets({ count: 4, reps: 8,        repSequence: [8, 8, 6, 10],    restSeconds: 120 }) },
          { name: 'REMO UNILATERAL CON MANCUERNA',                     sets: workSets({ count: 4, reps: '10 c/u', repSequence: [10, 10, 8, 12],  restSeconds: 90 }) },
          { name: 'PULL OVER EN POLEA',                                sets: workSets({ count: 4, reps: 12,       repSequence: [12, 12, 10, 15], restSeconds: 60 }) },
          { name: 'REMO EN CABLE AGARRE CERRADO',                      sets: workSets({ count: 3, reps: 12,       repSequence: [12, 12, 10, 15], restSeconds: 60 }) },
          { name: 'CURL DE BÍCEPS PREDICADOR',                         sets: workSets({ count: 3, reps: 12,       repSequence: [12, 12, 10, 15], restSeconds: 45 }) },
          { name: 'CURL DE BÍCEPS CONCENTRADO',                        sets: workSets({ count: 3, reps: '12 c/u', repSequence: [12, 12, 10, 15], restSeconds: 45 }) },
        ],
      },
      {
        librarySlot: 'Pierna (Quads)', moduleTitle: 'Pierna (Quads)', order: 2, dayIndex: 3,
        exercises: [
          { name: 'SENTADILLA FRONTAL',                                sets: workSets({ count: 4, reps: 8,        repSequence: [8, 8, 6, 10],    restSeconds: 150 }) },
          { name: 'SENTADILLA BÚLGARA',                                sets: workSets({ count: 4, reps: '10 c/u', repSequence: [10, 10, 8, 12],  restSeconds: 120 }) },
          { name: 'EXTENSIÓN DE RODILLA EN MÁQUINA UNA PIERNA',        sets: workSets({ count: 3, reps: '12 c/u', repSequence: [12, 12, 10, 15], restSeconds: 60 }) },
          { name: 'STEP UPS',                                          sets: workSets({ count: 3, reps: '10 c/u', repSequence: [10, 10, 8, 12],  restSeconds: 90 }) },
          { name: 'SISSY SQUAT',                                       sets: workSets({ count: 3, reps: 12,       repSequence: [12, 12, 10, 15], restSeconds: 60 }) },
          { name: 'ELEVACIÓN DE TALÓN CON RODILLA EXTENDIDA',          sets: workSets({ count: 3, reps: 15,       repSequence: [15, 15, 12, 20], restSeconds: 45 }) },
        ],
      },
      {
        librarySlot: 'Superior', moduleTitle: 'Superior', order: 3, dayIndex: 4,
        exercises: [
          { name: 'PRESS DE BANCA PLANA PIES ELEVADOS',                sets: workSets({ count: 4, reps: 10,       repSequence: [10, 10, 8, 12],  restSeconds: 120 }) },
          { name: 'SEAL ROW',                                          sets: workSets({ count: 4, reps: 10,       repSequence: [10, 10, 8, 12],  restSeconds: 90 }) },
          { name: 'PRESS MILITAR CON MANCUERNAS PARADO',               sets: workSets({ count: 3, reps: 10,       repSequence: [10, 10, 8, 12],  restSeconds: 90 }) },
          { name: 'JALÓN AL PECHO POLEA ALTA SUPINA',                  sets: workSets({ count: 3, reps: 12,       repSequence: [12, 12, 10, 15], restSeconds: 90 }) },
          { name: 'CURL DE BÍCEPS BAYESIAN',                           sets: workSets({ count: 3, reps: '12 c/u', repSequence: [12, 12, 10, 15], restSeconds: 45 }) },
          { name: 'EXTENSIÓN DE TRÍCEPS SOBRE CABEZA',                 sets: workSets({ count: 3, reps: 12,       repSequence: [12, 12, 10, 15], restSeconds: 45 }) },
        ],
      },
      {
        librarySlot: 'Pierna (Posterior)', moduleTitle: 'Pierna (Posterior)', order: 4, dayIndex: 5,
        exercises: [
          { name: 'PESO MUERTO RUMANO (RDL)',                          sets: workSets({ count: 4, reps: 8,        repSequence: [8, 8, 6, 10],    restSeconds: 150 }) },
          { name: 'HIP THRUST UNILATERAL CON MANCUERNA',               sets: workSets({ count: 4, reps: '10 c/u', repSequence: [10, 10, 8, 12],  restSeconds: 120 }) },
          { name: 'CURL DE PIERNA ACOSTADO A UNA PIERNA',              sets: workSets({ count: 3, reps: '12 c/u', repSequence: [12, 12, 10, 15], restSeconds: 60 }) },
          { name: 'BUENOS DÍAS CON BARRA',                             sets: workSets({ count: 3, reps: 10,       repSequence: [10, 10, 8, 12],  restSeconds: 90 }) },
          { name: 'PATADA DE GLÚTEO EN POLEA',                         sets: workSets({ count: 3, reps: '12 c/u', repSequence: [12, 12, 10, 15], restSeconds: 45 }) },
          { name: 'ABDUCCIÓN DE CADERA EN POLEA',                      sets: workSets({ count: 3, reps: '15 c/u', repSequence: [15, 15, 12, 20], restSeconds: 45 }) },
        ],
      },
    ],
  },
];

// ─────────────────────────────────────────────────────────────────────
// Alt-suggestion map. Keys are canonical library displayNames.

const ALTERNATIVES = {
  // ── Push ──
  'PRESS DE BANCA PLANA': ['PRESS EN MÁQUINA PLANO', 'PRESS DE BANCA INCLINADO CON MANCUERNAS'],
  'PRESS DE BANCA INCLINADO': ['PRESS DE BANCA INCLINADO CON MANCUERNAS', 'PRESS EN MÁQUINA INCLINADO'],
  'PRESS DE BANCA INCLINADO CON MANCUERNAS': ['PRESS DE BANCA INCLINADO', 'PRESS EN MÁQUINA INCLINADO'],
  'PRESS EN MÁQUINA PLANO': ['PRESS DE BANCA PLANA', 'PRESS DE BANCA INCLINADO CON MANCUERNAS'],
  'PRESS EN MÁQUINA INCLINADO': ['PRESS DE BANCA INCLINADO', 'PRESS DE BANCA INCLINADO CON MANCUERNAS'],
  'PRESS DE BANCA PLANA PIES ELEVADOS': ['PRESS DE BANCA PLANA', 'PRESS EN MÁQUINA PLANO'],
  'PRESS MILITAR EN BARRA SENTADO': ['PRESS MILITAR EN BARRA PARADO', 'PRESS MILITAR EN MÁQUINA'],
  'PRESS MILITAR CON MANCUERNAS PARADO': ['PRESS MILITAR EN BARRA PARADO', 'PRESS MILITAR EN MÁQUINA'],
  'PRESS MILITAR CON MANCUERNA SENTADO': ['PRESS MILITAR EN MÁQUINA', 'PRESS MILITAR CON MANCUERNAS PARADO'],
  'PRESS MILITAR EN MÁQUINA': ['PRESS MILITAR CON MANCUERNAS PARADO', 'PRESS MILITAR EN BARRA PARADO'],
  'FONDOS EN PARALELAS': ['PRESS DE BANCA INCLINADO', 'FLEXIONES (PUSH UPS)'],
  'VUELOS PARA PECTORAL EN POLEA (DE ARRIBA A ABAJO)': ['VUELOS PARA PECTORAL EN POLEA (DE ABAJO A ARRIBA)', 'PEC DEC (APERTURAS EN MÁQUINA)'],
  'VUELOS PARA PECTORAL CON MANCUERNAS': ['VUELOS PARA PECTORAL EN POLEA (DE ABAJO A ARRIBA)', 'PEC DEC (APERTURAS EN MÁQUINA)'],
  'ELEVACIONES LATERALES DE HOMBRO MANCUERNA': ['ELEVACIONES LATERALES DE HOMBRO EN CABLE', 'ELEVACIONES LATERALES DE HOMBRO MÁQUINA'],
  'ELEVACIONES LATERALES DE HOMBRO EN CABLE': ['ELEVACIONES LATERALES DE HOMBRO MANCUERNA', 'ELEVACIONES LATERALES DE HOMBRO MÁQUINA'],
  'ELEVACIONES LATERALES DE HOMBRO MÁQUINA': ['ELEVACIONES LATERALES DE HOMBRO MANCUERNA', 'ELEVACIONES LATERALES DE HOMBRO EN CABLE'],
  'TRICEP PUSH DOWN': ['PRESS FRANCES CON MANCUERNAS', 'EXTENSIÓN DE TRÍCEPS SOBRE CABEZA'],
  'PRESS FRANCES CON MANCUERNAS': ['TRICEP PUSH DOWN', 'EXTENSIÓN DE TRÍCEPS SOBRE CABEZA'],
  'EXTENSIÓN DE TRÍCEPS SOBRE CABEZA': ['PRESS FRANCES CON MANCUERNAS', 'TRICEP PUSH DOWN'],
  'PATADA DE TRÍCEPS': ['TRICEP PUSH DOWN', 'EXTENSIÓN DE TRÍCEPS SOBRE CABEZA'],

  // ── Pull ──
  'DOMINADA PRONO': ['JALÓN AL PECHO AGARRE AMPLIO (PULL DOWN)', 'DOMINADA NEUTRA'],
  'DOMINADA NEUTRA': ['DOMINADA PRONO', 'JALÓN AL PECHO AGARRE CERRADO (PULL DOWN)'],
  'DOMINADA SUPINA (CHIN UPS)': ['JALÓN AL PECHO POLEA ALTA SUPINA', 'DOMINADA NEUTRA'],
  'JALÓN AL PECHO AGARRE AMPLIO (PULL DOWN)': ['JALÓN AL PECHO AGARRE CERRADO (PULL DOWN)', 'DOMINADA PRONO'],
  'JALÓN AL PECHO AGARRE CERRADO (PULL DOWN)': ['JALÓN AL PECHO AGARRE AMPLIO (PULL DOWN)', 'DOMINADA NEUTRA'],
  'JALÓN AL PECHO POLEA ALTA SUPINA': ['DOMINADA SUPINA (CHIN UPS)', 'JALÓN AL PECHO AGARRE CERRADO (PULL DOWN)'],
  'REMO EN BARRA HORIZONTAL': ['SEAL ROW', 'REMO UNILATERAL CON MANCUERNA'],
  'SEAL ROW': ['REMO EN BARRA HORIZONTAL', 'REMO CON APOYO EN PECHO EN MÁQUINA'],
  'REMO UNILATERAL CON MANCUERNA': ['REMO CON APOYO EN PECHO EN MÁQUINA', 'SEAL ROW'],
  'REMO CON APOYO EN PECHO EN MÁQUINA': ['SEAL ROW', 'REMO UNILATERAL CON MANCUERNA'],
  'REMO EN CABLE AGARRE NEUTRO': ['REMO EN CABLE AGARRE ABIERTO', 'REMO EN CABLE AGARRE CERRADO'],
  'REMO EN CABLE AGARRE ABIERTO': ['REMO EN CABLE AGARRE CERRADO', 'REMO EN CABLE AGARRE NEUTRO'],
  'REMO EN CABLE AGARRE CERRADO': ['REMO EN CABLE AGARRE ABIERTO', 'REMO EN CABLE AGARRE NEUTRO'],
  'PULL OVER EN POLEA': ['SEAL ROW'],
  'CURL DE BÍCEPS EN BARRA': ['CURL DE BÍCEPS PREDICADOR', 'CURL DE BÍCEPS INCLINADO'],
  'CURL DE BÍCEPS PREDICADOR': ['CURL DE BÍCEPS EN BARRA', 'CURL DE BÍCEPS INCLINADO'],
  'CURL DE BÍCEPS INCLINADO': ['CURL DE BÍCEPS SUPINO', 'CURL DE BÍCEPS PREDICADOR'],
  'CURL DE BÍCEPS MARTILLO': ['CURL DE BÍCEPS SPIDERMAN', 'CURL DE BÍCEPS CONCENTRADO'],
  'CURL DE BÍCEPS CONCENTRADO': ['CURL DE BÍCEPS PREDICADOR', 'CURL DE BÍCEPS MARTILLO'],
  'CURL DE BÍCEPS SPIDERMAN': ['CURL DE BÍCEPS MARTILLO', 'CURL DE BÍCEPS CONCENTRADO'],
  'CURL DE BÍCEPS BAYESIAN': ['CURL DE BÍCEPS PREDICADOR', 'CURL DE BÍCEPS SUPINO'],
  'VUELOS INVERTIDOS EN MÁQUINA': ['VUELOS INVERTIDOS CON MANCUERNA', 'VUELOS INVERTIDOS EN POLEA', 'FACE PULL'],

  // ── Legs (quads) ──
  'SENTADILLA TRASERA': ['SENTADILLA HACK', 'PRENSA DE PIERNA', 'SENTADILLA FRONTAL'],
  'SENTADILLA HACK': ['SENTADILLA TRASERA', 'PRENSA DE PIERNA'],
  'SENTADILLA FRONTAL': ['SENTADILLA TRASERA', 'SENTADILLA HACK'],
  'SENTADILLA BÚLGARA': ['ESTOCADA CAMINANDO (LUNGES)', 'SENTADILLA GOBLET'],
  'PRENSA DE PIERNA': ['SENTADILLA HACK', 'SENTADILLA TRASERA'],
  'PRENSA DE PIERNA UNILATERAL': ['PRENSA DE PIERNA', 'ESTOCADA CAMINANDO (LUNGES)'],
  'ESTOCADA CAMINANDO (LUNGES)': ['SENTADILLA BÚLGARA', 'STEP UPS'],
  'STEP UPS': ['SENTADILLA BÚLGARA', 'ESTOCADA CAMINANDO (LUNGES)'],
  'EXTENSION DE CUADRICEPS': ['EXTENSIÓN DE RODILLA EN MÁQUINA UNA PIERNA', 'SISSY SQUAT'],
  'EXTENSIÓN DE RODILLA EN MÁQUINA UNA PIERNA': ['EXTENSION DE CUADRICEPS', 'SISSY SQUAT'],
  'SISSY SQUAT': ['EXTENSION DE CUADRICEPS', 'SENTADILLA BÚLGARA'],
  'ELEVACIÓN DE TALÓN CON RODILLA EXTENDIDA': ['ELEVACIONES DE TALONES CON RODILLA FLEXIONADA'],
  'ELEVACIONES DE TALONES CON RODILLA FLEXIONADA': ['ELEVACIÓN DE TALÓN CON RODILLA EXTENDIDA'],

  // ── Legs (posterior) ──
  'PESO MUERTO': ['PESO MUERTO RUMANO (RDL)', 'BUENOS DÍAS CON BARRA'],
  'PESO MUERTO RUMANO (RDL)': ['BUENOS DÍAS CON BARRA', 'HIPEREXTENSIÓN 45°'],
  'BUENOS DÍAS CON BARRA': ['PESO MUERTO RUMANO (RDL)', 'HIPEREXTENSIÓN 45°'],
  'HIPEREXTENSIÓN 45°': ['PESO MUERTO RUMANO (RDL)', 'BUENOS DÍAS CON BARRA'],
  'HIP THRUST CON BARRA': ['HIP THRUST EN MÁQUINA', 'HIP THRUST UNILATERAL CON MANCUERNA'],
  'HIP THRUST EN MÁQUINA': ['HIP THRUST CON BARRA', 'HIP THRUST UNILATERAL CON MANCUERNA'],
  'HIP THRUST UNILATERAL CON MANCUERNA': ['HIP THRUST CON BARRA', 'HIP THRUST EN MÁQUINA'],
  'PULL THROUGH': ['HIP THRUST CON BARRA', 'PESO MUERTO RUMANO (RDL)'],
  'CURL DE PIERNA ACOSTADO': ['CURL DE PIERNA SENTADO', 'GLUTE HAM RAISE', 'PESO MUERTO RUMANO (RDL)'],
  'CURL DE PIERNA SENTADO': ['CURL DE PIERNA ACOSTADO', 'GLUTE HAM RAISE'],
  'CURL DE PIERNA ACOSTADO A UNA PIERNA': ['CURL DE PIERNA SENTADO', 'CURL DE PIERNA ACOSTADO'],
  'GLUTE HAM RAISE': ['CURL DE PIERNA NÓRDICO', 'CURL DE PIERNA ACOSTADO'],
  'PATADA DE GLÚTEO EN POLEA': ['HIP THRUST UNILATERAL CON MANCUERNA'],
  'ABDUCCIÓN DE CADERA SENTADO EN MÁQUINA': ['ABDUCCIÓN DE CADERA EN POLEA', 'CAMINATA CON BANDA LATERAL'],
  'ABDUCCIÓN DE CADERA EN POLEA': ['ABDUCCIÓN DE CADERA SENTADO EN MÁQUINA', 'CAMINATA CON BANDA LATERAL'],
};

// ─────────────────────────────────────────────────────────────────────
// Library resolution.

async function buildNameToIdIndex() {
  const doc = await db.collection('exercises_library').doc(LIB_ID).get();
  if (!doc.exists) throw new Error(`Library doc not found: ${LIB_ID}`);
  const exMap = doc.data().exercises || {};
  const nameToId = new Map();
  for (const [id, ex] of Object.entries(exMap)) {
    const name = (ex.displayName || ex.name || '').toUpperCase();
    if (name) nameToId.set(name, id);
  }
  return nameToId;
}

function validate(nameToId, months) {
  const missing = [];
  let exCount = 0;
  let setCount = 0;
  for (const m of months) {
    for (const s of m.sessions) {
      for (const ex of s.exercises) {
        exCount++;
        setCount += ex.sets.length;
        if (!nameToId.get(ex.name)) missing.push(`M${m.monthNumber} · ${s.moduleTitle} · "${ex.name}"`);
        const alts = ALTERNATIVES[ex.name] || [];
        for (const a of alts) {
          if (!nameToId.get(a)) missing.push(`  alt for "${ex.name}" → "${a}"`);
        }
      }
    }
  }
  console.log('\n=== VALIDATE ===');
  console.log(`months: ${months.length}  (${months.map((m) => `M${m.monthNumber}`).join(', ')})`);
  console.log(`exercises (across all months): ${exCount}`);
  console.log(`prescribed sets (across all months): ${setCount}`);
  if (missing.length) {
    console.log(`\n${missing.length} UNRESOLVED reference(s):`);
    missing.forEach((m) => console.log('  ' + m));
    return false;
  }
  console.log('✓ all primary + alt references resolve to library IDs');
  return true;
}

// ─────────────────────────────────────────────────────────────────────
// Library session writes (idempotent by title).
// Returns Map<libraryTitle, libSessionId>.

async function writeLibrarySessions(nameToId, months, { write }) {
  console.log('\n=== LIBRARY SESSIONS ===');
  const libTitleToId = new Map();
  const sessionsCol = db.collection('creator_libraries').doc(FELIPE_UID).collection('sessions');

  for (const m of months) {
    for (const s of m.sessions) {
      const libraryTitle = `Mes ${m.monthNumber} — ${s.librarySlot}`;
      const existing = await sessionsCol.where('title', '==', libraryTitle).limit(1).get();
      if (!existing.empty) {
        libTitleToId.set(libraryTitle, existing.docs[0].id);
        console.log(`  SKIP (exists): ${libraryTitle}  [${existing.docs[0].id}]`);
        continue;
      }

      const setTotal = s.exercises.reduce((n, e) => n + e.sets.length, 0);
      console.log(`\n  + ${libraryTitle}  (${s.exercises.length} ex, ${setTotal} sets)`);
      s.exercises.forEach((ex, i) => {
        const altList = (ALTERNATIVES[ex.name] || []).join(' | ');
        console.log(`    [${i}] ${ex.name}${altList ? '  alts: ' + altList : ''}`);
      });

      if (!write) {
        libTitleToId.set(libraryTitle, `<dry-run-id-M${m.monthNumber}-${s.order}>`);
        continue;
      }

      const sesRef = await sessionsCol.add({
        title: libraryTitle,
        order: 100 + (m.monthNumber * 10) + s.order,
        defaultDataTemplate: DEFAULT_TEMPLATE,
        notes: m.notes,
        created_at: FieldValue.serverTimestamp(),
        updated_at: FieldValue.serverTimestamp(),
      });

      for (let i = 0; i < s.exercises.length; i++) {
        const ex = s.exercises[i];
        const primaryId = nameToId.get(ex.name);
        const altIds = (ALTERNATIVES[ex.name] || []).map((alt) => nameToId.get(alt)).filter(Boolean);

        const exRef = await sesRef.collection('exercises').add({
          order: i,
          primary: { [LIB_ID]: primaryId },
          alternatives: altIds.length ? { [LIB_ID]: altIds } : {},
          measures: DEFAULT_TEMPLATE.measures,
          objectives: DEFAULT_TEMPLATE.objectives,
          customMeasureLabels: {},
          customObjectiveLabels: {},
          created_at: FieldValue.serverTimestamp(),
          updated_at: FieldValue.serverTimestamp(),
        });
        for (const st of ex.sets) {
          await exRef.collection('sets').add({
            ...st,
            created_at: FieldValue.serverTimestamp(),
          });
        }
      }
      libTitleToId.set(libraryTitle, sesRef.id);
      console.log(`    ✓ ${sesRef.id}`);
    }
  }
  return libTitleToId;
}

// ─────────────────────────────────────────────────────────────────────
// Course + modules write. Course is created once; modules idempotent by title.

async function writeCourseAndModules(libTitleToId, nameToId, months, { write }) {
  console.log('\n=== COURSE + MODULES ===');

  let courseId;
  const existingCourse = await db.collection('courses')
    .where('creator_id', '==', FELIPE_UID)
    .where('title', '==', COURSE_TITLE)
    .limit(1)
    .get();

  if (!existingCourse.empty) {
    courseId = existingCourse.docs[0].id;
    console.log(`  COURSE (exists): ${courseId} — ${COURSE_TITLE}`);
  } else {
    const courseData = {
      title: COURSE_TITLE,
      deliveryType: 'general',
      visibility: 'both',
      subscription_price: SUBSCRIPTION_PRICE_COP,
      access_duration: 'monthly',
      block_cadence: 'monthly_first_monday',
      creator_id: FELIPE_UID,
      creatorName: 'Felipe Bejarano',
      status: 'draft',
      image_url: null,
      image_path: null,
      video_intro_url: null,
      content_plan_id: null,
      tutorials: { dailyWorkout: [], workoutCompletion: [], workoutExecution: [] },
      free_trial: { active: false, duration_days: 0 },
      availableLibraries: [],
      weekly: false,
      weight_suggestions: true,
      version: `${new Date().getFullYear()}-01`,
      published_version: `${new Date().getFullYear()}-01`,
    };
    console.log(`\n  + COURSE: ${COURSE_TITLE}`);
    console.log(`      deliveryType=${courseData.deliveryType}  block_cadence=${courseData.block_cadence}`);
    console.log(`      subscription_price=${courseData.subscription_price} COP/mes  status=${courseData.status}`);

    if (write) {
      const courseRef = await db.collection('courses').add({
        ...courseData,
        created_at: FieldValue.serverTimestamp(),
        updated_at: FieldValue.serverTimestamp(),
        last_update: FieldValue.serverTimestamp(),
      });
      courseId = courseRef.id;
      console.log(`      ✓ courseId: ${courseId}`);
    } else {
      courseId = '<dry-run-course-id>';
      console.log(`      (dry-run, no id)`);
    }
  }

  for (const m of months) {
    const modulesCol = db.collection('courses').doc(courseId).collection('modules');
    let moduleId;

    if (write) {
      const existingModule = await modulesCol.where('title', '==', m.moduleTitle).limit(1).get();
      if (!existingModule.empty) {
        console.log(`\n  MODULE (exists): ${m.moduleTitle}  [${existingModule.docs[0].id}]`);
        continue;
      }
    }

    // Modules are 0-indexed (project_monthly_drops.md). Mes 1 → order 0,
    // Mes 2 → order 1, … so the cron's `-1` sentinel picks the first
    // published module on its first advance.
    const moduleOrder = m.monthNumber - 1;
    console.log(`\n  + MODULE: ${m.moduleTitle}  order=${moduleOrder}  published_at=null (draft)`);

    if (write) {
      const moduleRef = await modulesCol.add({
        title: m.moduleTitle,
        order: moduleOrder,
        published_at: null,
        created_at: FieldValue.serverTimestamp(),
        updated_at: FieldValue.serverTimestamp(),
      });
      moduleId = moduleRef.id;
      console.log(`      ✓ moduleId: ${moduleId}`);
    } else {
      moduleId = `<dry-run-module-M${m.monthNumber}>`;
    }

    for (const s of m.sessions) {
      const libraryTitle = `Mes ${m.monthNumber} — ${s.librarySlot}`;
      const libSessionId = libTitleToId.get(libraryTitle);
      if (!libSessionId) throw new Error(`Library session not found for: ${libraryTitle}`);

      console.log(`    [${s.order}] ${s.moduleTitle}  dayIndex=${s.dayIndex}  → librarySessionRef=${libSessionId}`);

      if (!write) continue;

      const modSesRef = await db.collection('courses').doc(courseId)
        .collection('modules').doc(moduleId)
        .collection('sessions').add({
          title: s.moduleTitle,
          order: s.order,
          dayIndex: s.dayIndex,
          isRestDay: false,
          source_library_session_id: libSessionId,
          defaultDataTemplate: DEFAULT_TEMPLATE,
          notes: m.notes,
          created_at: FieldValue.serverTimestamp(),
          updated_at: FieldValue.serverTimestamp(),
        });

      for (let i = 0; i < s.exercises.length; i++) {
        const ex = s.exercises[i];
        const primaryId = nameToId.get(ex.name);
        const altIds = (ALTERNATIVES[ex.name] || []).map((alt) => nameToId.get(alt)).filter(Boolean);

        const exRef = await modSesRef.collection('exercises').add({
          order: i,
          primary: { [LIB_ID]: primaryId },
          alternatives: altIds.length ? { [LIB_ID]: altIds } : {},
          measures: DEFAULT_TEMPLATE.measures,
          objectives: DEFAULT_TEMPLATE.objectives,
          customMeasureLabels: {},
          customObjectiveLabels: {},
          created_at: FieldValue.serverTimestamp(),
          updated_at: FieldValue.serverTimestamp(),
        });
        for (const st of ex.sets) {
          await exRef.collection('sets').add({
            ...st,
            created_at: FieldValue.serverTimestamp(),
          });
        }
      }
      console.log(`        ✓ ${modSesRef.id}`);
    }
  }
}

// ─────────────────────────────────────────────────────────────────────
// CLI

(async () => {
  const argv = process.argv.slice(2);
  const args = new Set(argv);
  const write = args.has('--write');
  const onlyValidate = args.has('--validate');

  const monthsFlag = argv.find((a) => a.startsWith('--months='));
  let monthsFilter = null;
  if (monthsFlag) {
    monthsFilter = new Set(monthsFlag.split('=')[1].split(',').map((n) => parseInt(n, 10)));
  }
  const months = monthsFilter ? MONTHS.filter((m) => monthsFilter.has(m.monthNumber)) : MONTHS;
  if (months.length === 0) {
    console.error(`No months selected (filter=${monthsFlag}). Available: ${MONTHS.map((m) => m.monthNumber).join(',')}`);
    process.exit(1);
  }

  console.log(`Project: ${PROJECT_ID}`);
  console.log(`Creator: ${FELIPE_UID}  (Felipe Bejarano)`);
  console.log(`Library: ${LIB_ID}`);
  console.log(`Months:  ${months.map((m) => `M${m.monthNumber}`).join(', ')}`);
  console.log(`Mode:    ${write ? 'WRITE' : 'DRY-RUN (use --write to commit)'}`);

  const nameToId = await buildNameToIdIndex();
  console.log(`\nLibrary inventory: ${nameToId.size} exercises indexed by displayName.`);

  const ok = validate(nameToId, months);
  if (!ok) {
    console.error('\nValidation FAILED. Aborting.');
    process.exit(1);
  }
  if (onlyValidate) {
    console.log('\nDONE (validate only).');
    process.exit(0);
  }

  const libTitleToId = await writeLibrarySessions(nameToId, months, { write });
  await writeCourseAndModules(libTitleToId, nameToId, months, { write });

  console.log(`\n${write ? '✓ DONE (committed).' : '✓ DRY-RUN complete. Re-run with --write to commit.'}`);
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
