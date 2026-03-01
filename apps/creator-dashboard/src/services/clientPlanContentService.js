// Client Plan Content Service
// Copy-on-edit: stores a full copy of one week (one plan module) per client/program/week
// Collection: client_plan_content/{clientId}_{programId}_{weekKey}
// Structure mirrors plans/{planId}/modules/{moduleId}: sessions subcollection, each session has exercises, each exercise has sets
import { firestore } from '../config/firebase';
import {
  doc,
  getDoc,
  setDoc,
  getDocs,
  collection,
  query,
  orderBy,
  writeBatch,
  serverTimestamp,
  deleteDoc,
  addDoc,
  updateDoc
} from 'firebase/firestore';
import plansService from './plansService';

const COLLECTION = 'client_plan_content';

function docId(clientId, programId, weekKey) {
  return `${clientId}_${programId}_${weekKey}`;
}

/**
 * Get one module (week) with full sessions/exercises/sets from plans.
 * When creatorId is provided and a session has librarySessionRef, exercises/sets are resolved from the library.
 * @param {string} planId
 * @param {string} moduleId
 * @param {string|null} [creatorId] - Creator uid; when set, sessions with librarySessionRef get exercises from library
 */
async function getPlanModuleFull(planId, moduleId, creatorId = null) {
  const moduleRef = doc(firestore, 'plans', planId, 'modules', moduleId);
  const moduleSnap = await getDoc(moduleRef);
  if (!moduleSnap.exists()) return null;
  const moduleData = { id: moduleSnap.id, ...moduleSnap.data() };
  const sessions = await plansService.getSessionsByModule(planId, moduleId);
  const sessionsWithExercises = await Promise.all(
    sessions.map(async (session) => {
      if (session.useLocalContent) {
        const exercises = await plansService.getExercisesBySession(planId, moduleId, session.id);
        const exercisesWithSets = await Promise.all(
          exercises.map(async (ex) => {
            const sets = await plansService.getSetsByExercise(planId, moduleId, session.id, ex.id);
            return { ...ex, sets };
          })
        );
        return { ...session, exercises: exercisesWithSets };
      }
      const librarySessionRef = session.librarySessionRef;
      let mergedSession = session;
      if (creatorId && librarySessionRef) {
        try {
          const libraryService = (await import('./libraryService')).default;
          const libSession = await libraryService.getLibrarySessionById(creatorId, librarySessionRef);
          if (libSession) {
            mergedSession = {
              ...session,
              image_url: session.image_url ?? libSession.image_url ?? null,
              title: session.title ?? libSession.title ?? null
            };
            if (libSession?.exercises?.length) {
              const exercisesWithSets = (libSession.exercises || []).map((ex) => ({
                ...ex,
                sets: ex.sets || []
              }));
              return { ...mergedSession, exercises: exercisesWithSets };
            }
          }
        } catch (err) {
          console.warn('[clientPlanContentService] getPlanModuleFull: could not resolve library session', librarySessionRef, err);
        }
      }
      const exercises = await plansService.getExercisesBySession(planId, moduleId, session.id);
      const exercisesWithSets = await Promise.all(
        exercises.map(async (ex) => {
          const sets = await plansService.getSetsByExercise(planId, moduleId, session.id, ex.id);
          return { ...ex, sets };
        })
      );
      return { ...mergedSession, exercises: exercisesWithSets };
    })
  );
  moduleData.sessions = sessionsWithExercises;
  return moduleData;
}

class ClientPlanContentService {
  /**
   * Get client plan content (copy) for a week if it exists.
   * @returns {Promise<Object|null>} One module object { id, title, order, sessions: [{ id, ..., exercises: [{ ..., sets: [...] }] }] } or null
   */
  async getClientPlanContent(clientId, programId, weekKey) {
    try {
      const id = docId(clientId, programId, weekKey);
      const ref = doc(firestore, COLLECTION, id);
      const snap = await getDoc(ref);
      if (!snap.exists()) return null;

      const data = { id: snap.id, ...snap.data() };
      const sessionsRef = collection(firestore, COLLECTION, id, 'sessions');
      const sessionsSnap = await getDocs(query(sessionsRef, orderBy('order', 'asc')));
      const sessions = await Promise.all(
        sessionsSnap.docs.map(async (sDoc) => {
          const s = { id: sDoc.id, ...sDoc.data() };
          const exRef = collection(firestore, COLLECTION, id, 'sessions', sDoc.id, 'exercises');
          const exSnap = await getDocs(query(exRef, orderBy('order', 'asc')));
          s.exercises = await Promise.all(
            exSnap.docs.map(async (eDoc) => {
              const e = { id: eDoc.id, ...eDoc.data() };
              const setsRef = collection(
                firestore,
                COLLECTION,
                id,
                'sessions',
                sDoc.id,
                'exercises',
                eDoc.id,
                'sets'
              );
              const setsSnap = await getDocs(query(setsRef, orderBy('order', 'asc')));
              e.sets = setsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
              return e;
            })
          );
          return s;
        })
      );
      data.sessions = sessions;
      return data;
    } catch (error) {
      console.error('[clientPlanContentService] getClientPlanContent:', error);
      throw error;
    }
  }

  /**
   * Copy one plan module (week) into client_plan_content. Creates the copy.
   * When creatorId is provided, sessions with librarySessionRef get exercises/sets from the library.
   * @param {string} [creatorId] - Creator uid; when set, resolves library-ref sessions from library
   */
  async copyFromPlan(clientId, programId, weekKey, planId, moduleId, creatorId = null) {
    try {
      const moduleData = await getPlanModuleFull(planId, moduleId, creatorId);
      if (!moduleData) throw new Error('Plan module not found');

      const id = docId(clientId, programId, weekKey);
      const batch = writeBatch(firestore);

      const meta = {
        title: moduleData.title,
        order: moduleData.order != null ? moduleData.order : 0,
        source_plan_id: planId,
        source_module_id: moduleId,
        created_at: serverTimestamp(),
        updated_at: serverTimestamp()
      };
      batch.set(doc(firestore, COLLECTION, id), meta);

      for (const session of moduleData.sessions || []) {
        const { sets: _s, exercises, ...sessionFields } = session;
        const sessionPayload = {
          ...sessionFields,
          updated_at: serverTimestamp()
        };
        delete sessionPayload.sets;
        delete sessionPayload.exercises;
        batch.set(doc(firestore, COLLECTION, id, 'sessions', session.id), sessionPayload);

        for (const ex of session.exercises || []) {
          const { sets = [], ...exFields } = ex;
          const exPayload = { ...exFields, updated_at: serverTimestamp() };
          delete exPayload.sets;
          batch.set(
            doc(firestore, COLLECTION, id, 'sessions', session.id, 'exercises', ex.id),
            exPayload
          );
          for (const set of sets) {
            batch.set(
              doc(
                firestore,
                COLLECTION,
                id,
                'sessions',
                session.id,
                'exercises',
                ex.id,
                'sets',
                set.id
              ),
              { ...set, updated_at: serverTimestamp() }
            );
          }
        }
      }

      await batch.commit();
      console.log('[clientPlanContentService] copyFromPlan done', id);
    } catch (error) {
      console.error('[clientPlanContentService] copyFromPlan:', error);
      throw error;
    }
  }

  /**
   * Get one session's full content (session + exercises with sets) from client plan content.
   * Use for editing a session in client_plan mode.
   */
  async getClientPlanSessionContent(clientId, programId, weekKey, sessionId) {
    const content = await this.getClientPlanContent(clientId, programId, weekKey);
    if (!content?.sessions) return null;
    const session = content.sessions.find((s) => s.id === sessionId);
    if (!session) return null;
    return { session, exercises: session.exercises || [] };
  }

  /**
   * Update a session in client plan content (e.g. title, dayIndex).
   */
  async updateSession(clientId, programId, weekKey, sessionId, updates) {
    const id = docId(clientId, programId, weekKey);
    const ref = doc(firestore, COLLECTION, id, 'sessions', sessionId);
    await updateDoc(ref, { ...updates, updated_at: serverTimestamp() });
  }

  /**
   * Get exercises for a session in client plan content.
   */
  async getExercisesBySession(clientId, programId, weekKey, sessionId) {
    const id = docId(clientId, programId, weekKey);
    const exRef = collection(firestore, COLLECTION, id, 'sessions', sessionId, 'exercises');
    const snap = await getDocs(query(exRef, orderBy('order', 'asc')));
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  }

  /**
   * Update an exercise in client plan content.
   */
  async updateExercise(clientId, programId, weekKey, sessionId, exerciseId, updates) {
    const id = docId(clientId, programId, weekKey);
    const ref = doc(
      firestore,
      COLLECTION,
      id,
      'sessions',
      sessionId,
      'exercises',
      exerciseId
    );
    await updateDoc(ref, { ...updates, updated_at: serverTimestamp() });
  }

  /**
   * Get sets for an exercise in client plan content.
   */
  async getSetsByExercise(clientId, programId, weekKey, sessionId, exerciseId) {
    const id = docId(clientId, programId, weekKey);
    const setsRef = collection(
      firestore,
      COLLECTION,
      id,
      'sessions',
      sessionId,
      'exercises',
      exerciseId,
      'sets'
    );
    const snap = await getDocs(query(setsRef, orderBy('order', 'asc')));
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  }

  /**
   * Create exercise in client plan session.
   */
  async createExercise(clientId, programId, weekKey, sessionId, title, order = null) {
    const id = docId(clientId, programId, weekKey);
    const exRef = collection(firestore, COLLECTION, id, 'sessions', sessionId, 'exercises');
    const existing = await this.getExercisesBySession(clientId, programId, weekKey, sessionId);
    const orderVal = order != null ? order : existing.length;
    const titleVal = title || 'Ejercicio';
    const payload = {
      title: titleVal,
      name: titleVal,
      order: orderVal,
      updated_at: serverTimestamp()
    };
    const docRef = await addDoc(exRef, payload);
    return { id: docRef.id, ...payload };
  }

  /**
   * Delete exercise from client plan session.
   */
  async deleteExercise(clientId, programId, weekKey, sessionId, exerciseId) {
    const id = docId(clientId, programId, weekKey);
    const exercises = await this.getExercisesBySession(clientId, programId, weekKey, sessionId);
    const ex = exercises.find((e) => e.id === exerciseId);
    if (!ex) return;
    const setsRef = collection(
      firestore,
      COLLECTION,
      id,
      'sessions',
      sessionId,
      'exercises',
      exerciseId,
      'sets'
    );
    const setsSnap = await getDocs(setsRef);
    for (const d of setsSnap.docs) await deleteDoc(d.ref);
    await deleteDoc(
      doc(firestore, COLLECTION, id, 'sessions', sessionId, 'exercises', exerciseId)
    );
  }

  /**
   * Update a set in client plan content.
   */
  async updateSet(clientId, programId, weekKey, sessionId, exerciseId, setId, updates) {
    const id = docId(clientId, programId, weekKey);
    const ref = doc(
      firestore,
      COLLECTION,
      id,
      'sessions',
      sessionId,
      'exercises',
      exerciseId,
      'sets',
      setId
    );
    await updateDoc(ref, { ...updates, updated_at: serverTimestamp() });
  }

  /**
   * Add a set to an exercise in client plan content.
   */
  async addSetToExercise(clientId, programId, weekKey, sessionId, exerciseId, order = null) {
    const id = docId(clientId, programId, weekKey);
    const setsRef = collection(
      firestore,
      COLLECTION,
      id,
      'sessions',
      sessionId,
      'exercises',
      exerciseId,
      'sets'
    );
    const existing = await this.getSetsByExercise(
      clientId,
      programId,
      weekKey,
      sessionId,
      exerciseId
    );
    const orderVal = order != null ? order : existing.length;
    const payload = {
      title: `Serie ${orderVal + 1}`,
      order: orderVal,
      updated_at: serverTimestamp()
    };
    const docRef = await addDoc(setsRef, payload);
    return { id: docRef.id, ...payload };
  }

  /**
   * Delete a set in client plan content.
   */
  async deleteSet(clientId, programId, weekKey, sessionId, exerciseId, setId) {
    const id = docId(clientId, programId, weekKey);
    const ref = doc(
      firestore,
      COLLECTION,
      id,
      'sessions',
      sessionId,
      'exercises',
      exerciseId,
      'sets',
      setId
    );
    await deleteDoc(ref);
  }

  /**
   * Delete a single session from client plan content (and its exercises/sets). Only affects this client's week.
   */
  async deleteSession(clientId, programId, weekKey, sessionId) {
    const content = await this.getClientPlanContent(clientId, programId, weekKey);
    if (!content?.sessions) return;
    const session = content.sessions.find((s) => s.id === sessionId);
    if (!session) return;
    const id = docId(clientId, programId, weekKey);
    for (const ex of session.exercises || []) {
      for (const set of ex.sets || []) {
        await deleteDoc(
          doc(
            firestore,
            COLLECTION,
            id,
            'sessions',
            sessionId,
            'exercises',
            ex.id,
            'sets',
            set.id
          )
        );
      }
      await deleteDoc(
        doc(firestore, COLLECTION, id, 'sessions', sessionId, 'exercises', ex.id)
      );
    }
    await deleteDoc(doc(firestore, COLLECTION, id, 'sessions', sessionId));
  }

  /**
   * Ensure client_plan_content doc exists for a week. If not, copy from plan (if planId/moduleId) or create minimal doc.
   */
  async ensureClientPlanContentForWeek(clientId, programId, weekKey, options = {}) {
    const existing = await this.getClientPlanContent(clientId, programId, weekKey);
    const { planId, moduleId, creatorId } = options;
    // If a copy exists and has sessions, it's complete — nothing to do.
    if (existing?.sessions?.length > 0) return;
    // If a copy exists but has zero sessions AND we have plan info, it was likely created
    // empty due to a previous bug (moduleIndex out of bounds). Re-copy from the plan so
    // original plan sessions are available alongside any manually added sessions.
    if (planId && moduleId) {
      await this.copyFromPlan(clientId, programId, weekKey, planId, moduleId, creatorId);
      return;
    }
    // No plan info — create a minimal root doc only if none exists yet.
    if (!existing) {
      const id = docId(clientId, programId, weekKey);
      await setDoc(doc(firestore, COLLECTION, id), {
        title: 'Semana personalizada',
        order: 0,
        created_at: serverTimestamp(),
        updated_at: serverTimestamp()
      });
    }
  }

  /**
   * Add a new session to client plan content (with optional exercises/sets). Ensures week doc exists.
   * sessionPayload: { title, dayIndex, order?, exercises?: [{ title, order?, sets?: [{ title, order?, ... }] }] }
   * Returns the created session id.
   */
  async addSession(clientId, programId, weekKey, sessionPayload) {
    const id = docId(clientId, programId, weekKey);
    const sessionsRef = collection(firestore, COLLECTION, id, 'sessions');
    const existing = await getDocs(query(sessionsRef, orderBy('order', 'asc')));
    const order = sessionPayload.order != null ? sessionPayload.order : existing.size;
    const sessionDoc = {
      title: sessionPayload.title || 'Sesión',
      order,
      dayIndex: sessionPayload.dayIndex != null ? sessionPayload.dayIndex : null,
      updated_at: serverTimestamp()
    };
    const sessionRef = await addDoc(sessionsRef, sessionDoc);
    const newSessionId = sessionRef.id;
    for (let i = 0; i < (sessionPayload.exercises || []).length; i++) {
      const ex = sessionPayload.exercises[i];
      const exRef = await addDoc(
        collection(firestore, COLLECTION, id, 'sessions', newSessionId, 'exercises'),
        {
          title: ex.title || 'Ejercicio',
          name: ex.title || 'Ejercicio',
          order: i,
          updated_at: serverTimestamp()
        }
      );
      for (let j = 0; j < (ex.sets || []).length; j++) {
        const set = ex.sets[j];
        await addDoc(
          collection(
            firestore,
            COLLECTION,
            id,
            'sessions',
            newSessionId,
            'exercises',
            exRef.id,
            'sets'
          ),
          {
            title: set.title || `Serie ${j + 1}`,
            order: j,
            ...(set.reps != null && { reps: set.reps }),
            ...(set.intensity != null && { intensity: set.intensity }),
            updated_at: serverTimestamp()
          }
        );
      }
    }
    return newSessionId;
  }

  /**
   * Copy a session (with exercises/sets) from source week to target week, then delete from source.
   * Target week will have client copy created if needed (using planId/moduleId from targetPlanAssignment if provided).
   */
  async moveSessionToWeek(clientId, programId, sourceWeekKey, targetWeekKey, sessionId, targetDayIndex, targetPlanAssignment = null) {
    const sourceContent = await this.getClientPlanContent(clientId, programId, sourceWeekKey);
    if (!sourceContent?.sessions) throw new Error('Source week not found');
    const session = sourceContent.sessions.find((s) => s.id === sessionId);
    if (!session) throw new Error('Session not found in source week');
    await this.ensureClientPlanContentForWeek(clientId, programId, targetWeekKey, targetPlanAssignment ? { planId: targetPlanAssignment.planId, moduleId: targetPlanAssignment.moduleId } : {});
    const payload = {
      title: session.title || session.session_name || 'Sesión',
      dayIndex: targetDayIndex,
      exercises: (session.exercises || []).map((ex) => ({
        title: ex.title || ex.name || 'Ejercicio',
        sets: (ex.sets || []).map((s) => ({
          title: s.title,
          reps: s.reps,
          intensity: s.intensity
        }))
      }))
    };
    await this.addSession(clientId, programId, targetWeekKey, payload);
    await this.deleteSession(clientId, programId, sourceWeekKey, sessionId);
  }

  /**
   * Delete client plan content for a week (revert to plan).
   */
  async deleteClientPlanContent(clientId, programId, weekKey) {
    try {
      const content = await this.getClientPlanContent(clientId, programId, weekKey);
      if (!content) return;

      const id = docId(clientId, programId, weekKey);
      for (const session of content.sessions || []) {
        for (const ex of session.exercises || []) {
          for (const set of ex.sets || []) {
            await deleteDoc(
              doc(
                firestore,
                COLLECTION,
                id,
                'sessions',
                session.id,
                'exercises',
                ex.id,
                'sets',
                set.id
              )
            );
          }
          await deleteDoc(
            doc(firestore, COLLECTION, id, 'sessions', session.id, 'exercises', ex.id)
          );
        }
        await deleteDoc(doc(firestore, COLLECTION, id, 'sessions', session.id));
      }
      await deleteDoc(doc(firestore, COLLECTION, id));
      console.log('[clientPlanContentService] deleteClientPlanContent done', id);
    } catch (error) {
      console.error('[clientPlanContentService] deleteClientPlanContent:', error);
      throw error;
    }
  }
}

export default new ClientPlanContentService();
