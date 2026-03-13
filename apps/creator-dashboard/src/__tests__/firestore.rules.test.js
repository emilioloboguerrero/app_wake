/**
 * Firestore Security Rules tests.
 * Requires the Firestore emulator running on port 8080:
 *   firebase emulators:start --only firestore
 * Then run: npm run test:rules
 */
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
} from '@firebase/rules-unit-testing';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, it, beforeAll, afterAll, beforeEach } from 'vitest';
import { doc, getDoc, setDoc, collection, getDocs, query, where } from 'firebase/firestore';

let testEnv;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'wolf-20b8b',
    firestore: {
      rules: readFileSync(
        resolve(__dirname, '../../../../config/firebase/firestore.rules'),
        'utf8'
      ),
      host: '127.0.0.1',
      port: 8080,
    },
  });
});

afterAll(async () => {
  if (testEnv) await testEnv.cleanup();
});

beforeEach(async () => {
  await testEnv.clearFirestore();
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

const authed = (uid, claims = {}) =>
  testEnv.authenticatedContext(uid, claims);

const unauthed = () => testEnv.unauthenticatedContext();

// ─── courses read rules ───────────────────────────────────────────────────────

describe('courses — read rules', () => {
  const COURSE_ID = 'course-test-1';

  beforeEach(async () => {
    // Seed test data as admin bypass
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, 'courses', 'pub-en'), { status: 'published', creator_id: 'other-creator', title: 'Published EN' });
      await setDoc(doc(db, 'courses', 'pub-es'), { status: 'publicado', creator_id: 'other-creator', title: 'Published ES' });
      await setDoc(doc(db, 'courses', 'draft'), { status: 'draft', creator_id: 'other-creator', title: 'Draft' });
      await setDoc(doc(db, 'courses', 'own-draft'), { status: 'draft', creator_id: 'creator-uid', title: 'Own Draft' });
      await setDoc(doc(db, 'users', 'user-uid'), { role: 'user' });
      await setDoc(doc(db, 'users', 'creator-uid'), { role: 'creator' });
      await setDoc(doc(db, 'users', 'admin-uid'), { role: 'admin' });
    });
  });

  it('unauthenticated user cannot read any course', async () => {
    const db = unauthed().firestore();
    await assertFails(getDoc(doc(db, 'courses', 'pub-en')));
  });

  it('authenticated user can read a published (English) course', async () => {
    const db = authed('user-uid').firestore();
    await assertSucceeds(getDoc(doc(db, 'courses', 'pub-en')));
  });

  it('authenticated user can read a publicado (Spanish) course', async () => {
    const db = authed('user-uid').firestore();
    await assertSucceeds(getDoc(doc(db, 'courses', 'pub-es')));
  });

  it('regular user cannot read a draft course from another creator', async () => {
    const db = authed('user-uid').firestore();
    await assertFails(getDoc(doc(db, 'courses', 'draft')));
  });

  it('creator can read their own draft course', async () => {
    const db = authed('creator-uid').firestore();
    await assertSucceeds(getDoc(doc(db, 'courses', 'own-draft')));
  });

  it('creator cannot read a draft course from another creator', async () => {
    const db = authed('creator-uid').firestore();
    await assertFails(getDoc(doc(db, 'courses', 'draft')));
  });

  it('admin can read any course including drafts', async () => {
    const db = authed('admin-uid', { role: 'admin' }).firestore();
    await assertSucceeds(getDoc(doc(db, 'courses', 'draft')));
  });
});

// ─── users — own document ─────────────────────────────────────────────────────

describe('users — own document access', () => {
  beforeEach(async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, 'users', 'alice'), { role: 'user', name: 'Alice' });
      await setDoc(doc(db, 'users', 'bob'), { role: 'user', name: 'Bob' });
    });
  });

  it('user can read their own document', async () => {
    const db = authed('alice').firestore();
    await assertSucceeds(getDoc(doc(db, 'users', 'alice')));
  });

  it('user cannot read another user document', async () => {
    const db = authed('alice').firestore();
    await assertFails(getDoc(doc(db, 'users', 'bob')));
  });

  it('unauthenticated user cannot read any user document', async () => {
    const db = unauthed().firestore();
    await assertFails(getDoc(doc(db, 'users', 'alice')));
  });
});
