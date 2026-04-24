#!/usr/bin/env node
'use strict';

/**
 * Build 9 Bejarano courses from library sessions.
 *
 *   3 low_ticket PROGRAMS (periodized over 12 weeks):
 *     - Novatos Full Body
 *     - Intermedios Torso-Pierna
 *     - Avanzados PPL
 *
 *   6 one_on_one TEMPLATES (single-module):
 *     - Full body en casa
 *     - Full body gym (3 días)
 *     - Upper-Lower (4 días)
 *     - PPL-UL (5 días)
 *     - Push-Pull-Legs (6 días)
 *     - Glute Optimization
 *
 *   Abdomen is a standalone library session, not packaged as a course.
 *
 * Each course session is a DEEP COPY of the referenced library session
 * (exercises + sets copied), with `librarySessionRef` pointing back for provenance.
 *
 * IMPORTANT: Week 1 baseline is currently duplicated for all 12 weeks of low_ticket
 * programs. Per-week rep/RIR progression extraction from the PDFs is deferred.
 *
 * Usage:
 *   node scripts/build-bejarano-courses.js                 (dry-run)
 *   node scripts/build-bejarano-courses.js --write
 *   node scripts/build-bejarano-courses.js --only=novatos --write
 */

const admin = require('firebase-admin');

const FELIPE_UID = 'yMqKOXBcVARa6vjU7wImf3Tp85J2';
const CREATOR_NAME = 'Juan Felipe Bejarano';
const LIB_ID = 'jeoVyzhUrBeJofT62MOe';
const PROJECT_ID = 'wolf-20b8b';

admin.initializeApp({ credential: admin.credential.applicationDefault(), projectId: PROJECT_ID });
const db = admin.firestore();
const { FieldValue } = admin.firestore;

// ─────────────────────────────────────────────────────────────────────
// Course metadata templates

const DEFAULT_TUTORIALS = { dailyWorkout: [], workoutCompletion: [], workoutExecution: [] };
const DEFAULT_FREE_TRIAL = { active: false, duration_days: 0 };

const BASE_COURSE = {
  creator_id: FELIPE_UID,
  creatorName: CREATOR_NAME,
  description: '',
  discipline: 'Fuerza - hipertrofia',
  weight_suggestions: false,
  availableLibraries: [LIB_ID],
  content_plan_id: null,
  tutorials: DEFAULT_TUTORIALS,
  free_trial: DEFAULT_FREE_TRIAL,
  programSettings: {},
  version: '2026-01',
  published_version: '2026-01',
  status: 'draft',
  image_url: null,
  image_path: null,
  video_intro_url: '',
};

const LOW_TICKET_OVERRIDES = {
  deliveryType: 'low_ticket',
  price: 130000,
  access_duration: 'yearly',
  duration: '12 semanas',
};

const ONE_ON_ONE_OVERRIDES = {
  deliveryType: 'one_on_one',
  price: null,
  access_duration: 'monthly',
  duration: null,
};

// ─────────────────────────────────────────────────────────────────────
// 3 low_ticket programs (12 weeks each)

const NOVATOS_B1 = [
  'Full body — sentadilla y banca',
  'Full body — peso muerto y militar',
  'Full body — búlgara y press inclinado',
];

const INTERMEDIOS_B1 = [
  'Pierna — peso muerto y sentadilla box',
  'Torso — banca y dominadas',
  'Pierna — sentadilla y hip thrust',
  'Torso — dominadas y remos',
];
const INTERMEDIOS_B2 = [
  'Pierna — sentadilla y RDL',
  'Torso — banca y jalón',
  'Pierna — peso muerto y frontal',
  'Torso — militar y remo',
];

const AVANZADOS_B1 = [
  'Pierna — sentadilla y prensa unilateral',
  'Empuje — banca y fondos',
  'Jalón — dominada y pullover',
  'Pierna — peso muerto y glute ham raise',
  'Empuje — militar y press cerrado',
  'Jalón — jalón y seal row',
];
const AVANZADOS_B2 = [
  'Pierna — peso muerto y hiperextensión',
  'Empuje — banca y multipower',
  'Jalón — dominada neutra y remo',
  'Pierna — sentadilla y hip thrust con pausa',
  'Empuje — militar e inclinado',
  'Jalón — supina con drop set',
];

function weekModules(sessionsForWeek) {
  return Array.from({ length: 12 }, (_, i) => ({
    title: `Semana ${i + 1}`,
    description: `Semana ${i + 1}`,
    sessions: sessionsForWeek(i + 1),
  }));
}

const PROGRAMS = [
  {
    key: 'novatos',
    title: 'Novatos — Full Body',
    ...LOW_TICKET_OVERRIDES,
    modulesPlan: weekModules(() => NOVATOS_B1),
  },
  {
    key: 'intermedios',
    title: 'Intermedios — Torso-Pierna',
    ...LOW_TICKET_OVERRIDES,
    modulesPlan: weekModules((week) => (week <= 6 ? INTERMEDIOS_B1 : INTERMEDIOS_B2)),
  },
  {
    key: 'avanzados',
    title: 'Avanzados — PPL',
    ...LOW_TICKET_OVERRIDES,
    modulesPlan: weekModules((week) => (week <= 6 ? AVANZADOS_B1 : AVANZADOS_B2)),
  },
];

// ─────────────────────────────────────────────────────────────────────
// 6 one_on_one templates (single module, baseline week)

const TEMPLATES = [
  {
    key: 'casa',
    title: 'Full body en casa (5 días)',
    ...ONE_ON_ONE_OVERRIDES,
    modulesPlan: [{
      title: 'Semana 1', description: 'Rutina base',
      sessions: ['Full body en casa 1', 'Full body en casa 2', 'Full body en casa 3', 'Full body en casa 4', 'Full body en casa 5'],
    }],
  },
  {
    key: 'gym3',
    title: 'Full body gym (3 días)',
    ...ONE_ON_ONE_OVERRIDES,
    modulesPlan: [{
      title: 'Semana 1', description: 'Rutina base',
      sessions: ['Full body gym — sentadilla y chest row', 'Full body gym — banca y RDL', 'Full body gym — pulldown y lunge'],
    }],
  },
  {
    key: 'ul-ul',
    title: 'Superior-Inferior (4 días)',
    ...ONE_ON_ONE_OVERRIDES,
    modulesPlan: [{
      title: 'Semana 1', description: 'Rutina base',
      sessions: ['Pierna — back squat y RDL', 'Tren superior — banca y chest row', 'Pierna — peso muerto y prensa', 'Tren superior — incline y dominada'],
    }],
  },
  {
    key: 'ppl-ul',
    title: 'PPL + Superior (5 días)',
    ...ONE_ON_ONE_OVERRIDES,
    modulesPlan: [{
      title: 'Semana 1', description: 'Rutina base',
      sessions: ['Pierna — back squat y RDL', 'Empuje — banca pies arriba', 'Jalón — pulldown y chest row', 'Pierna — peso muerto y prensa', 'Tren superior — completo'],
    }],
  },
  {
    key: '6ppl',
    title: 'Push-Pull-Legs (6 días)',
    ...ONE_ON_ONE_OVERRIDES,
    modulesPlan: [{
      title: 'Semana 1', description: 'Rutina base',
      sessions: ['Pierna — back squat y RDL', 'Empuje — banca pies arriba', 'Jalón — pulldown y chest row', 'Pierna — peso muerto y prensa', 'Empuje — incline y diamond', 'Jalón — unilateral'],
    }],
  },
  {
    key: 'glute-opt',
    title: 'Glute Optimization (5 días)',
    ...ONE_ON_ONE_OVERRIDES,
    modulesPlan: [{
      title: 'Semana 1', description: 'Rutina base',
      sessions: ['Glúteos — sentadilla y RDL', 'Glúteos — tren superior 1', 'Glúteos — hip thrust e hiperextensión', 'Glúteos — tren superior 2', 'Glúteos — pierna opcional'],
    }],
  },
];

// ─────────────────────────────────────────────────────────────────────
// Deep-copy a library session → course session

async function loadLibrarySessions() {
  const snap = await db.collection('creator_libraries').doc(FELIPE_UID).collection('sessions').get();
  const byTitle = new Map();
  for (const d of snap.docs) byTitle.set(d.data().title, { id: d.id, data: d.data() });
  return byTitle;
}

async function copyLibrarySessionIntoCourse(courseRef, moduleRef, order, libSession, write) {
  const courseSesRef = moduleRef.collection('sessions').doc();
  const libRef = db.collection('creator_libraries').doc(FELIPE_UID).collection('sessions').doc(libSession.id);

  // Build session doc
  const sessionData = {
    title: libSession.data.title,
    order,
    librarySessionRef: libSession.id,
    defaultDataTemplate: libSession.data.defaultDataTemplate || {
      measures: ['reps', 'weight', 'intensity'],
      objectives: ['reps', 'intensity', 'previous'],
      customMeasureLabels: {},
      customObjectiveLabels: {},
    },
    created_at: FieldValue.serverTimestamp(),
    updated_at: FieldValue.serverTimestamp(),
  };

  console.log(`        + session [${order}] "${libSession.data.title}" (copies library ${libSession.id})`);
  if (!write) return;

  await courseSesRef.set(sessionData);

  // Deep-copy exercises + sets
  const libExercises = await libRef.collection('exercises').orderBy('order').get();
  for (const libEx of libExercises.docs) {
    const ex = libEx.data();
    const { created_at, updated_at, ...exRest } = ex;
    const courseExRef = courseSesRef.collection('exercises').doc();
    await courseExRef.set({
      ...exRest,
      created_at: FieldValue.serverTimestamp(),
      updated_at: FieldValue.serverTimestamp(),
    });

    const libSets = await libEx.ref.collection('sets').orderBy('order').get();
    for (const libSet of libSets.docs) {
      const { created_at: sCA, updated_at: sUA, ...setRest } = libSet.data();
      await courseExRef.collection('sets').doc().set({
        ...setRest,
        created_at: FieldValue.serverTimestamp(),
      });
    }
  }
}

// ─────────────────────────────────────────────────────────────────────
// Build one course

async function buildCourse(plan, libSessionsByTitle, { write, skipExisting }) {
  console.log(`\n══ COURSE: ${plan.title} ══`);

  // Idempotency by title
  const coursesCol = db.collection('courses');
  const existing = await coursesCol.where('creator_id', '==', FELIPE_UID).where('title', '==', plan.title).limit(1).get();
  if (!existing.empty && skipExisting) {
    console.log(`  SKIP (exists): ${existing.docs[0].id}`);
    return existing.docs[0].id;
  }

  // Validate all session titles resolve
  const missing = [];
  for (const mod of plan.modulesPlan) {
    for (const title of mod.sessions) {
      if (!libSessionsByTitle.has(title)) missing.push(title);
    }
  }
  if (missing.length > 0) {
    console.log(`  ✗ MISSING library sessions:`);
    [...new Set(missing)].forEach((t) => console.log(`      "${t}"`));
    throw new Error(`Cannot build "${plan.title}" — missing library sessions`);
  }

  const courseData = {
    ...BASE_COURSE,
    title: plan.title,
    deliveryType: plan.deliveryType,
    price: plan.price,
    access_duration: plan.access_duration,
    duration: plan.duration,
    created_at: FieldValue.serverTimestamp(),
    updated_at: FieldValue.serverTimestamp(),
    last_update: FieldValue.serverTimestamp(),
  };

  const totalSessions = plan.modulesPlan.reduce((n, m) => n + m.sessions.length, 0);
  console.log(`  modules: ${plan.modulesPlan.length}  total sessions: ${totalSessions}`);

  if (!write) {
    console.log(`  (dry-run — no writes)`);
    for (const mod of plan.modulesPlan) {
      console.log(`    module "${mod.title}" — ${mod.sessions.length} sessions`);
      mod.sessions.forEach((t, i) => console.log(`      [${i}] ${t}`));
    }
    return null;
  }

  const courseRef = coursesCol.doc();
  await courseRef.set(courseData);
  console.log(`  course ${courseRef.id} written`);

  for (let m = 0; m < plan.modulesPlan.length; m++) {
    const mod = plan.modulesPlan[m];
    const modRef = courseRef.collection('modules').doc();
    await modRef.set({
      title: mod.title,
      description: mod.description,
      order: m,
      created_at: FieldValue.serverTimestamp(),
      updated_at: FieldValue.serverTimestamp(),
    });
    console.log(`    module [${m}] "${mod.title}" ${modRef.id}`);
    for (let s = 0; s < mod.sessions.length; s++) {
      const libSes = libSessionsByTitle.get(mod.sessions[s]);
      await copyLibrarySessionIntoCourse(courseRef, modRef, s, libSes, write);
    }
  }

  return courseRef.id;
}

// ─────────────────────────────────────────────────────────────────────
// Main

(async () => {
  const args = new Set(process.argv.slice(2));
  const write = args.has('--write');
  const onlyArg = [...args].find((a) => a.startsWith('--only='));
  const onlyKey = onlyArg ? onlyArg.split('=')[1] : null;

  console.log(`Project: ${PROJECT_ID}  uid: ${FELIPE_UID}`);
  console.log(`Mode: ${write ? 'WRITE' : 'DRY RUN'}`);

  const libSessions = await loadLibrarySessions();
  console.log(`Library sessions available: ${libSessions.size}`);

  const allPlans = [...PROGRAMS, ...TEMPLATES];
  const plans = onlyKey ? allPlans.filter((p) => p.key === onlyKey) : allPlans;

  const results = [];
  for (const plan of plans) {
    try {
      const id = await buildCourse(plan, libSessions, { write, skipExisting: true });
      results.push({ key: plan.key, title: plan.title, id, status: id ? (write ? 'written' : 'dry-run') : 'failed' });
    } catch (e) {
      console.error(`  ERROR building ${plan.key}: ${e.message}`);
      results.push({ key: plan.key, title: plan.title, id: null, status: 'error' });
    }
  }

  console.log(`\n═══ SUMMARY ═══`);
  results.forEach((r) => console.log(`  [${r.status.padEnd(8)}]  ${r.key.padEnd(12)}  ${r.id || '—'}  "${r.title}"`));
  console.log(`\n${write ? 'DONE.' : 'DRY RUN complete. Re-run with --write to commit.'}`);
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
