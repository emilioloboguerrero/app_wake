#!/usr/bin/env node
'use strict';

const admin = require('firebase-admin');

// Parse --project flag, default to wake-staging
const args = process.argv.slice(2);
const projectFlag = args.indexOf('--project');
const projectId = projectFlag !== -1 ? args[projectFlag + 1] : 'wake-staging';

console.log(`Seeding project: ${projectId}`);

admin.initializeApp({
  credential: admin.credential.applicationDefault(),
  databaseURL: `https://${projectId}.firebaseio.com`,
  projectId,
});

const db = admin.firestore();
const auth = admin.auth();

async function ensureAuthUser(uid, email, displayName, password) {
  try {
    await auth.getUser(uid);
    console.log(`  Auth user ${uid} already exists, skipping`);
  } catch (e) {
    if (e.code === 'auth/user-not-found') {
      await auth.createUser({ uid, email, displayName, password });
      console.log(`  Auth user ${uid} created (${email})`);
    } else {
      throw e;
    }
  }
}

function isoDate(offsetDays) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

function futureUtc(hoursFromNow) {
  const d = new Date();
  d.setHours(d.getHours() + hoursFromNow);
  return d.toISOString();
}

async function seed() {
  const now = admin.firestore.FieldValue.serverTimestamp();
  const oneYearFromNow = new Date();
  oneYearFromNow.setFullYear(oneYearFromNow.getFullYear() + 1);
  const oneYearFromNowISO = oneYearFromNow.toISOString();
  const nowISO = new Date().toISOString();

  const today = isoDate(0);
  const yesterday = isoDate(-1);
  const twoDaysAgo = isoDate(-2);
  const tomorrow = isoDate(1);

  // --- Auth accounts ---
  console.log('Creating Auth accounts...');
  await ensureAuthUser('seed-creator-001', 'creator@test.com', 'Test Creator', 'okokok');
  await ensureAuthUser('seed-user-001', 'user@test.com', 'Test User', 'okokok');

  // --- users/seed-creator-001 ---
  console.log('Creating creator user...');
  await db.doc('users/seed-creator-001').set({
    role: 'creator',
    email: 'creator@test.com',
    displayName: 'Test Creator',
    created_at: now,
  });
  console.log('  users/seed-creator-001 done');

  // --- users/seed-user-001 ---
  console.log('Creating student user...');
  await db.doc('users/seed-user-001').set({
    role: 'user',
    email: 'user@test.com',
    displayName: 'Test User',
    created_at: now,
    courses: {
      'seed-course-001': {
        status: 'active',
        deliveryType: 'low_ticket',
        title: 'Programa Test',
        creatorName: 'Test Creator',
        access_duration: 'monthly',
        expires_at: oneYearFromNowISO,
        purchased_at: nowISO,
        discipline: 'General',
        completedTutorials: { dailyWorkout: [], nutrition: [] },
      },
      'seed-course-oto': {
        status: 'active',
        deliveryType: 'one_on_one',
        title: 'Plan Personalizado',
        creatorName: 'Test Creator',
        access_duration: 'one_on_one',
        assigned_by: 'seed-creator-001',
        assigned_at: nowISO,
        purchased_at: nowISO,
      },
    },
  });
  console.log('  users/seed-user-001 done');

  // --- courses/seed-course-001 (low_ticket) ---
  console.log('Creating low_ticket course...');
  await db.doc('courses/seed-course-001').set({
    creator_id: 'seed-creator-001',
    creatorName: 'Test Creator',
    title: 'Programa Test',
    deliveryType: 'low_ticket',
    weekly: true,
    status: 'publicado',
    visibility: 'both',
    created_at: now,
    updated_at: now,
  });
  console.log('  courses/seed-course-001 done');

  // --- courses/seed-course-oto (one_on_one) ---
  console.log('Creating one_on_one course...');
  await db.doc('courses/seed-course-oto').set({
    creator_id: 'seed-creator-001',
    creatorName: 'Test Creator',
    title: 'Plan Personalizado',
    deliveryType: 'one_on_one',
    weekly: false,
    status: 'publicado',
    visibility: 'both',
    content_plan_id: 'seed-plan-001',
    created_at: now,
    updated_at: now,
  });
  console.log('  courses/seed-course-oto done');

  // --- Module ---
  console.log('Creating module...');
  const moduleRef = db.doc('courses/seed-course-001/modules/seed-module-001');
  await moduleRef.set({
    title: 'Semana 1',
    order: 0,
    created_at: now,
  });
  console.log('  modules/seed-module-001 done');

  // --- Session ---
  console.log('Creating session...');
  const sessionRef = db.doc('courses/seed-course-001/modules/seed-module-001/sessions/seed-session-001');
  await sessionRef.set({
    title: 'Día 1 — Full Body',
    order: 0,
    created_at: now,
  });
  console.log('  sessions/seed-session-001 done');

  // --- Exercises (3) ---
  const exercises = [
    { id: 'seed-exercise-001', title: 'Sentadilla', name: 'Sentadilla', order: 0, primaryMuscles: ['Cuádriceps', 'Glúteos'] },
    { id: 'seed-exercise-002', title: 'Press de banca', name: 'Press de banca', order: 1, primaryMuscles: ['Pecho', 'Tríceps'] },
    { id: 'seed-exercise-003', title: 'Peso muerto', name: 'Peso muerto', order: 2, primaryMuscles: ['Espalda baja', 'Isquiotibiales'] },
  ];

  for (const ex of exercises) {
    console.log(`Creating exercise ${ex.id}...`);
    const exerciseRef = db.doc(
      `courses/seed-course-001/modules/seed-module-001/sessions/seed-session-001/exercises/${ex.id}`
    );
    await exerciseRef.set({
      title: ex.title,
      name: ex.name,
      order: ex.order,
      primaryMuscles: ex.primaryMuscles,
      measures: ['weight', 'reps'],
      objectives: ['reps'],
      created_at: now,
    });

    // 2 sets per exercise
    for (let s = 1; s <= 2; s++) {
      const setId = `${ex.id}-set-00${s}`;
      await exerciseRef.collection('sets').doc(setId).set({
        title: `Serie ${s}`,
        order: s - 1,
        reps: '10',
        weight: 0,
        restSeconds: 60,
        created_at: now,
      });
      console.log(`  set ${setId} done`);
    }
  }

  // --- Diary entries (3 days) ---
  const diaryDates = [twoDaysAgo, yesterday, today];
  for (const date of diaryDates) {
    console.log(`Creating diary entry for ${date}...`);
    await db.doc(`users/seed-user-001/diary/${date}`).set({
      date,
      totalCalories: 2000,
      totalProtein: 150,
      totalCarbs: 200,
      totalFat: 70,
      meals: [],
      created_at: now,
    });
    console.log(`  diary/${date} done`);
  }

  // --- Session history (2 entries) ---
  console.log('Creating session history entries...');
  for (let i = 1; i <= 2; i++) {
    const ref = db.collection('users/seed-user-001/sessionHistory').doc();
    await ref.set({
      courseId: 'seed-course-001',
      sessionId: 'seed-session-001',
      completedAt: now,
      durationMs: 3600000,
      notes: '',
    });
    console.log(`  sessionHistory entry ${i} done`);
  }

  // --- Body log (2 entries) ---
  console.log('Creating body log entries...');
  for (let i = 1; i <= 2; i++) {
    const ref = db.collection('users/seed-user-001/bodyLog').doc();
    await ref.set({
      weight: 70 + i,
      unit: 'kg',
      date: isoDate(-i),
      created_at: now,
    });
    console.log(`  bodyLog entry ${i} done`);
  }

  // --- Readiness entry (today) ---
  console.log('Creating readiness entry...');
  await db.doc(`users/seed-user-001/readiness/${today}`).set({
    date: today,
    sleepHours: 7,
    energyLevel: 8,
    stressLevel: 3,
    notes: '',
    created_at: now,
  });
  console.log(`  readiness/${today} done`);

  // ============================================
  // NEW COLLECTIONS (previously missing)
  // ============================================

  // --- one_on_one_clients ---
  console.log('Creating one_on_one_clients...');
  await db.collection('one_on_one_clients').doc('seed-oto-client-001').set({
    creatorId: 'seed-creator-001',
    clientUserId: 'seed-user-001',
    clientName: 'Test User',
    clientEmail: 'user@test.com',
    courseId: ['seed-course-oto'],
    createdAt: now,
    updatedAt: now,
  });
  console.log('  one_on_one_clients/seed-oto-client-001 done');

  // --- exercises_library ---
  console.log('Creating exercises_library...');
  await db.doc('exercises_library/seed-library-001').set({
    creator_id: 'seed-creator-001',
    creator_name: 'Test Creator',
    title: 'Mi Biblioteca',
    created_at: now,
    updated_at: now,
    'Sentadilla': {
      video_url: '',
      description: 'Ejercicio compuesto para tren inferior',
      muscle_activation: ['quads', 'glutes'],
      primary: 'Sentadilla',
    },
    'Press de banca': {
      video_url: '',
      description: 'Ejercicio compuesto para pecho',
      muscle_activation: ['chest', 'triceps'],
      primary: 'Press de banca',
    },
    'Peso muerto': {
      video_url: '',
      description: 'Ejercicio compuesto para cadena posterior',
      muscle_activation: ['back', 'hamstrings'],
      primary: 'Peso muerto',
    },
  });
  console.log('  exercises_library/seed-library-001 done');

  // --- plans (one_on_one) with subcollections ---
  console.log('Creating plan...');
  await db.doc('plans/seed-plan-001').set({
    creator_id: 'seed-creator-001',
    creatorName: 'Test Creator',
    title: 'Plan Personalizado Semana 1',
    description: 'Plan de entrenamiento personalizado',
    discipline: 'General',
    created_at: now,
    updated_at: now,
  });

  const planModuleRef = db.doc('plans/seed-plan-001/modules/seed-plan-mod-001');
  await planModuleRef.set({
    title: 'Semana 1',
    order: 0,
    created_at: now,
  });

  const planSessionRef = planModuleRef.collection('sessions').doc('seed-plan-sess-001');
  await planSessionRef.set({
    title: 'Día 1 — Tren Superior',
    order: 0,
    isRestDay: false,
    created_at: now,
  });

  const planExRef = planSessionRef.collection('exercises').doc('seed-plan-ex-001');
  await planExRef.set({
    title: 'Press de banca',
    name: 'Press de banca',
    order: 0,
    measures: ['weight', 'reps'],
    objectives: ['reps'],
    created_at: now,
  });

  await planExRef.collection('sets').doc('seed-plan-set-001').set({
    title: 'Serie 1',
    order: 0,
    reps: '8-10',
    weight: 0,
    restSeconds: 90,
    created_at: now,
  });
  console.log('  plans/seed-plan-001 with subcollections done');

  // --- creator_availability ---
  console.log('Creating creator_availability...');
  await db.doc('creator_availability/seed-creator-001').set({
    timezone: 'America/Bogota',
    updatedAt: nowISO,
    days: {
      [tomorrow]: {
        slots: [
          {
            startUtc: futureUtc(24),
            endUtc: futureUtc(25),
            durationMinutes: 60,
          },
        ],
      },
    },
  });
  console.log('  creator_availability/seed-creator-001 done');

  // --- call_bookings ---
  console.log('Creating call_bookings...');
  await db.collection('call_bookings').doc('seed-booking-001').set({
    creatorId: 'seed-creator-001',
    clientUserId: 'seed-user-001',
    clientDisplayName: 'Test User',
    courseId: 'seed-course-oto',
    slotStartUtc: futureUtc(48),
    slotEndUtc: futureUtc(49),
    status: 'scheduled',
    callLink: '',
    createdAt: nowISO,
  });
  console.log('  call_bookings/seed-booking-001 done');

  // --- creator_libraries (sessions) ---
  console.log('Creating creator_libraries...');
  await db.doc('creator_libraries/seed-creator-001/sessions/seed-lib-session-001').set({
    title: 'Sesión de Biblioteca — Full Body',
    created_at: now,
    updated_at: now,
  });
  console.log('  creator_libraries session done');

  // --- creator_nutrition_library (meals + plans) ---
  console.log('Creating creator_nutrition_library...');
  await db.doc('creator_nutrition_library/seed-creator-001/meals/seed-meal-001').set({
    name: 'Avena con proteína',
    description: 'Desayuno alto en proteína',
    calories: 450,
    protein: 35,
    carbs: 55,
    fat: 10,
    created_at: now,
    updated_at: now,
  });

  const nutritionPlanId = 'seed-nutrition-plan-001';
  await db.doc(`creator_nutrition_library/seed-creator-001/plans/${nutritionPlanId}`).set({
    name: 'Plan Nutrición Test',
    description: 'Plan de nutrición para testing',
    daily_calories: 2200,
    daily_protein_g: 160,
    daily_carbs_g: 220,
    daily_fat_g: 75,
    categories: [
      { name: 'Desayuno', targetCalories: 500 },
      { name: 'Almuerzo', targetCalories: 800 },
      { name: 'Cena', targetCalories: 700 },
      { name: 'Snack', targetCalories: 200 },
    ],
    created_at: now,
    updated_at: now,
  });
  console.log('  creator_nutrition_library meals + plans done');

  // --- nutrition_assignments ---
  console.log('Creating nutrition_assignments...');
  const assignmentId = 'seed-assignment-001';
  await db.doc(`nutrition_assignments/${assignmentId}`).set({
    userId: 'seed-user-001',
    assignedBy: 'seed-creator-001',
    planId: nutritionPlanId,
    plan: {
      name: 'Plan Nutrición Test',
      daily_calories: 2200,
      daily_protein_g: 160,
      daily_carbs_g: 220,
      daily_fat_g: 75,
    },
    status: 'active',
    startDate: today,
    createdAt: now,
    updatedAt: now,
  });
  console.log('  nutrition_assignments/seed-assignment-001 done');

  // --- client_nutrition_plan_content ---
  console.log('Creating client_nutrition_plan_content...');
  await db.doc(`client_nutrition_plan_content/${assignmentId}`).set({
    source_plan_id: nutritionPlanId,
    assignment_id: assignmentId,
    name: 'Plan Nutrición Test',
    description: 'Plan de nutrición para testing',
    daily_calories: 2200,
    daily_protein_g: 160,
    daily_carbs_g: 220,
    daily_fat_g: 75,
    categories: [
      { name: 'Desayuno', targetCalories: 500 },
      { name: 'Almuerzo', targetCalories: 800 },
      { name: 'Cena', targetCalories: 700 },
      { name: 'Snack', targetCalories: 200 },
    ],
    snapshot_at: now,
  });
  console.log('  client_nutrition_plan_content done');

  console.log('\nSeed complete. All documents written to', projectId);
}

seed()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Seed failed:', err);
    process.exit(1);
  });
