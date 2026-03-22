#!/usr/bin/env node
'use strict';

const admin = require('firebase-admin');

// Parse --project flag, default to wolf-dev
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

async function seed() {
  const now = admin.firestore.FieldValue.serverTimestamp();
  const oneYearFromNow = new Date();
  oneYearFromNow.setFullYear(oneYearFromNow.getFullYear() + 1);
  const oneYearFromNowISO = oneYearFromNow.toISOString();
  const nowISO = new Date().toISOString();

  const today = isoDate(0);
  const yesterday = isoDate(-1);
  const twoDaysAgo = isoDate(-2);

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
    createdAt: now,
  });
  console.log('  users/seed-creator-001 done');

  // --- users/seed-user-001 ---
  console.log('Creating student user...');
  await db.doc('users/seed-user-001').set({
    role: 'user',
    email: 'user@test.com',
    displayName: 'Test User',
    createdAt: now,
    courses: {
      'seed-course-001': {
        status: 'active',
        deliveryType: 'low_ticket',
        title: 'Programa Test',
        access_duration: 'monthly',
        expires_at: oneYearFromNowISO,
        purchased_at: nowISO,
      },
    },
  });
  console.log('  users/seed-user-001 done');

  // --- courses/seed-course-001 ---
  console.log('Creating course...');
  await db.doc('courses/seed-course-001').set({
    creatorId: 'seed-creator-001',
    title: 'Programa Test',
    deliveryType: 'low_ticket',
    weekly: true,
    created_at: now,
  });
  console.log('  courses/seed-course-001 done');

  // --- Module ---
  console.log('Creating module...');
  const moduleRef = db.doc('courses/seed-course-001/modules/seed-module-001');
  await moduleRef.set({
    title: 'Semana 1',
    order: 0,
    createdAt: now,
  });
  console.log('  modules/seed-module-001 done');

  // --- Session ---
  console.log('Creating session...');
  const sessionRef = db.doc('courses/seed-course-001/modules/seed-module-001/sessions/seed-session-001');
  await sessionRef.set({
    title: 'Día 1 — Full Body',
    order: 0,
    createdAt: now,
  });
  console.log('  sessions/seed-session-001 done');

  // --- Exercises (3) ---
  const exercises = [
    { id: 'seed-exercise-001', title: 'Sentadilla', order: 0 },
    { id: 'seed-exercise-002', title: 'Press de banca', order: 1 },
    { id: 'seed-exercise-003', title: 'Peso muerto', order: 2 },
  ];

  for (const ex of exercises) {
    console.log(`Creating exercise ${ex.id}...`);
    const exerciseRef = db.doc(
      `courses/seed-course-001/modules/seed-module-001/sessions/seed-session-001/exercises/${ex.id}`
    );
    await exerciseRef.set({ title: ex.title, order: ex.order, createdAt: now });

    // 2 sets per exercise
    for (let s = 1; s <= 2; s++) {
      const setId = `${ex.id}-set-00${s}`;
      await exerciseRef.collection('sets').doc(setId).set({
        setNumber: s,
        reps: 10,
        weight: 0,
        restSeconds: 60,
        createdAt: now,
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
      createdAt: now,
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
      durationSeconds: 3600,
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
      createdAt: now,
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
    createdAt: now,
  });
  console.log(`  readiness/${today} done`);

  console.log('\nSeed complete. All documents written to', projectId);
}

seed()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Seed failed:', err);
    process.exit(1);
  });
