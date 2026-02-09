// Client Session Content Service
// Copy-on-edit: stores a full copy of a session per client_sessions assignment (client_session_content/{clientSessionId})
// Mirrors creator_libraries/{creatorId}/sessions/{sessionId} structure: session doc + exercises subcollection + sets per exercise
import { firestore } from '../config/firebase';
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  collection,
  query,
  getDocs,
  writeBatch,
  orderBy,
  serverTimestamp,
  addDoc
} from 'firebase/firestore';

const CONTENT_COLLECTION = 'client_session_content';

class ClientSessionContentService {
  /**
   * Get client session content (copy) if it exists.
   * @param {string} clientSessionId - client_sessions doc id (e.g. clientId_dateStr_sessionId)
   * @returns {Promise<Object|null>} { id, title, image_url, exercises: [{ id, ..., sets: [...] }] } or null
   */
  async getClientSessionContent(clientSessionId) {
    try {
      const sessionRef = doc(firestore, CONTENT_COLLECTION, clientSessionId);
      const sessionSnap = await getDoc(sessionRef);
      if (!sessionSnap.exists()) return null;

      const sessionData = { id: sessionSnap.id, ...sessionSnap.data() };
      const exercisesRef = collection(firestore, CONTENT_COLLECTION, clientSessionId, 'exercises');
      const exercisesSnap = await getDocs(query(exercisesRef, orderBy('order', 'asc')));

      const exercises = await Promise.all(
        exercisesSnap.docs.map(async (exDoc) => {
          const exData = { id: exDoc.id, ...exDoc.data() };
          const setsRef = collection(
            firestore,
            CONTENT_COLLECTION,
            clientSessionId,
            'exercises',
            exDoc.id,
            'sets'
          );
          const setsSnap = await getDocs(query(setsRef, orderBy('order', 'asc')));
          exData.sets = setsSnap.docs.map((s) => ({ id: s.id, ...s.data() }));
          return exData;
        })
      );

      sessionData.exercises = exercises;
      return sessionData;
    } catch (error) {
      console.error('[clientSessionContentService] getClientSessionContent:', error);
      throw error;
    }
  }

  /**
   * Copy full session from library into client_session_content (copy-on-first-edit).
   * @param {string} creatorId - Creator uid
   * @param {string} clientSessionId - client_sessions doc id
   * @param {string} librarySessionId - Library session id (creator_libraries/.../sessions/{id})
   * @param {Object} librarySessionData - Full session from libraryService.getLibrarySessionById (session + exercises with sets)
   */
  async copyFromLibrary(creatorId, clientSessionId, librarySessionId, librarySessionData) {
    try {
      const batch = writeBatch(firestore);
      const sessionRef = doc(firestore, CONTENT_COLLECTION, clientSessionId);

      const { exercises = [], ...sessionFields } = librarySessionData;
      const sessionPayload = {
        title: sessionFields.title,
        image_url: sessionFields.image_url ?? null,
        creator_id: creatorId,
        source_session_id: librarySessionId,
        version: 1,
        created_at: serverTimestamp(),
        updated_at: serverTimestamp()
      };
      batch.set(sessionRef, sessionPayload);

      for (const ex of exercises) {
        const { sets = [], ...exFields } = ex;
        const exerciseRef = doc(
          firestore,
          CONTENT_COLLECTION,
          clientSessionId,
          'exercises',
          ex.id
        );
        const exPayload = {
          ...exFields,
          order: ex.order ?? 0,
          updated_at: serverTimestamp()
        };
        delete exPayload.sets;
        batch.set(exerciseRef, exPayload);

        const setsRef = collection(
          firestore,
          CONTENT_COLLECTION,
          clientSessionId,
          'exercises',
          ex.id,
          'sets'
        );
        for (const set of sets) {
          const setRef = doc(setsRef, set.id);
          const setPayload = {
            ...set,
            updated_at: serverTimestamp()
          };
          batch.set(setRef, setPayload);
        }
      }

      await batch.commit();
      console.log('[clientSessionContentService] copyFromLibrary done', clientSessionId);
    } catch (error) {
      console.error('[clientSessionContentService] copyFromLibrary:', error);
      throw error;
    }
  }

  /**
   * Update session-level fields.
   */
  async updateSession(clientSessionId, updates) {
    const ref = doc(firestore, CONTENT_COLLECTION, clientSessionId);
    await updateDoc(ref, {
      ...updates,
      updated_at: serverTimestamp()
    });
  }

  /**
   * Update exercise in client session content.
   */
  async updateExercise(clientSessionId, exerciseId, updates) {
    const ref = doc(
      firestore,
      CONTENT_COLLECTION,
      clientSessionId,
      'exercises',
      exerciseId
    );
    await updateDoc(ref, {
      ...updates,
      updated_at: serverTimestamp()
    });
  }

  /**
   * Create exercise in client session content.
   */
  async createExercise(clientSessionId, exerciseData, order = 0) {
    const exercisesRef = collection(
      firestore,
      CONTENT_COLLECTION,
      clientSessionId,
      'exercises'
    );
    const newEx = {
      ...exerciseData,
      order,
      created_at: serverTimestamp(),
      updated_at: serverTimestamp()
    };
    const docRef = await addDoc(exercisesRef, newEx);
    return { id: docRef.id, ...newEx };
  }

  /**
   * Delete exercise and its sets.
   */
  async deleteExercise(clientSessionId, exerciseId) {
    const setsRef = collection(
      firestore,
      CONTENT_COLLECTION,
      clientSessionId,
      'exercises',
      exerciseId,
      'sets'
    );
    const setsSnap = await getDocs(setsRef);
    for (const d of setsSnap.docs) {
      await deleteDoc(doc(firestore, CONTENT_COLLECTION, clientSessionId, 'exercises', exerciseId, 'sets', d.id));
    }
    await deleteDoc(
      doc(firestore, CONTENT_COLLECTION, clientSessionId, 'exercises', exerciseId)
    );
  }

  /**
   * Update exercise order.
   */
  async updateExerciseOrder(clientSessionId, exerciseOrders) {
    const batch = writeBatch(firestore);
    for (const { exerciseId, order } of exerciseOrders) {
      if (!exerciseId) continue;
      const ref = doc(
        firestore,
        CONTENT_COLLECTION,
        clientSessionId,
        'exercises',
        exerciseId
      );
      batch.update(ref, { order, updated_at: serverTimestamp() });
    }
    await batch.commit();
  }

  /**
   * Get sets for an exercise (for refresh after create/update/delete set).
   */
  async getSetsForExercise(clientSessionId, exerciseId) {
    try {
      const setsRef = collection(
        firestore,
        CONTENT_COLLECTION,
        clientSessionId,
        'exercises',
        exerciseId,
        'sets'
      );
      const snap = await getDocs(query(setsRef, orderBy('order', 'asc')));
      return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    } catch (error) {
      console.error('[clientSessionContentService] getSetsForExercise:', error);
      return [];
    }
  }

  /**
   * Update set in exercise.
   */
  async updateSetInExercise(clientSessionId, exerciseId, setId, updates) {
    const ref = doc(
      firestore,
      CONTENT_COLLECTION,
      clientSessionId,
      'exercises',
      exerciseId,
      'sets',
      setId
    );
    await updateDoc(ref, {
      ...updates,
      updated_at: serverTimestamp()
    });
  }

  /**
   * Add set to exercise.
   */
  async addSetToExercise(clientSessionId, exerciseId, setData) {
    const setsRef = collection(
      firestore,
      CONTENT_COLLECTION,
      clientSessionId,
      'exercises',
      exerciseId,
      'sets'
    );
    const payload = {
      ...setData,
      order: setData.order ?? 0,
      updated_at: serverTimestamp()
    };
    const docRef = await addDoc(setsRef, payload);
    return { id: docRef.id, ...payload };
  }

  /**
   * Delete set.
   */
  async deleteSet(clientSessionId, exerciseId, setId) {
    await deleteDoc(
      doc(
        firestore,
        CONTENT_COLLECTION,
        clientSessionId,
        'exercises',
        exerciseId,
        'sets',
        setId
      )
    );
  }

  /**
   * Delete entire client session content (revert to library).
   */
  async deleteClientSessionContent(clientSessionId) {
    const content = await this.getClientSessionContent(clientSessionId);
    if (!content) return;

    const batch = writeBatch(firestore);
    for (const ex of content.exercises || []) {
      for (const set of ex.sets || []) {
        batch.delete(
          doc(
            firestore,
            CONTENT_COLLECTION,
            clientSessionId,
            'exercises',
            ex.id,
            'sets',
            set.id
          )
        );
      }
      batch.delete(
        doc(firestore, CONTENT_COLLECTION, clientSessionId, 'exercises', ex.id)
      );
    }
    batch.delete(doc(firestore, CONTENT_COLLECTION, clientSessionId));
    await batch.commit();
    console.log('[clientSessionContentService] deleteClientSessionContent done', clientSessionId);
  }
}

export default new ClientSessionContentService();
