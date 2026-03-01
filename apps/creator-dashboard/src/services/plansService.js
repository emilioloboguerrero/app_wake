// Plans Service for Wake Web Dashboard
// Handles fetching and managing workout plans (content: modules/sessions/exercises)
// Plans are reusable content that can be assigned to clients in programs
import { firestore, storage } from '../config/firebase';
import { 
  collection, 
  query, 
  where, 
  getDocs,
  doc,
  getDoc,
  addDoc,
  deleteDoc,
  updateDoc,
  setDoc,
  writeBatch,
  serverTimestamp,
  orderBy,
  limit,
  deleteField
} from 'firebase/firestore';
import { ref, uploadBytesResumable, getDownloadURL, deleteObject } from 'firebase/storage';

class PlansService {
  /**
   * Get all plans for a creator
   * @param {string} creatorId - Creator user ID
   * @returns {Promise<Array>} Array of plan documents
   */
  async getPlansByCreator(creatorId) {
    try {
      const plansRef = collection(firestore, 'plans');
      const q = query(
        plansRef, 
        where('creator_id', '==', creatorId)
      );
      const querySnapshot = await getDocs(q);
      
      const plans = [];
      querySnapshot.forEach((doc) => {
        plans.push({
          id: doc.id,
          ...doc.data()
        });
      });
      // Sort by created_at desc in memory (avoids composite index requirement)
      plans.sort((a, b) => {
        const aTime = a.created_at?.toMillis?.() ?? a.created_at ?? 0;
        const bTime = b.created_at?.toMillis?.() ?? b.created_at ?? 0;
        return bTime - aTime;
      });
      
      return plans;
    } catch (error) {
      console.error('Error fetching plans:', error);
      throw error;
    }
  }

  /**
   * Get a single plan by ID
   * @param {string} planId - Plan ID
   * @returns {Promise<Object|null>} Plan document or null
   */
  async getPlanById(planId) {
    try {
      const planDoc = await getDoc(doc(firestore, 'plans', planId));
      if (planDoc.exists()) {
        return {
          id: planDoc.id,
          ...planDoc.data()
        };
      }
      return null;
    } catch (error) {
      console.error('Error getting plan:', error);
      throw error;
    }
  }

  /**
   * Create a new plan
   * @param {string} creatorId - Creator user ID
   * @param {string} creatorName - Creator name
   * @param {Object} planData - Plan data (title, description, discipline)
   * @returns {Promise<Object>} Created plan document
   */
  async createPlan(creatorId, creatorName, planData) {
    try {
      const plansRef = collection(firestore, 'plans');
      const timestamp = serverTimestamp();
      
      const newPlan = {
        creator_id: creatorId,
        creatorName: creatorName,
        title: planData.title || '',
        description: planData.description || '',
        discipline: planData.discipline || 'Fuerza',
        created_at: timestamp,
        updated_at: timestamp
      };
      
      const planRef = await addDoc(plansRef, newPlan);
      const createdPlan = await getDoc(planRef);
      
      return {
        id: createdPlan.id,
        ...createdPlan.data()
      };
    } catch (error) {
      console.error('Error creating plan:', error);
      throw error;
    }
  }

  /**
   * Update a plan
   * @param {string} planId - Plan ID
   * @param {Object} updates - Fields to update
   * @returns {Promise<void>}
   */
  async updatePlan(planId, updates) {
    try {
      const planRef = doc(firestore, 'plans', planId);
      await updateDoc(planRef, {
        ...updates,
        updated_at: serverTimestamp()
      });
    } catch (error) {
      console.error('Error updating plan:', error);
      throw error;
    }
  }

  /**
   * Delete a plan (and all its modules/sessions/exercises)
   * @param {string} planId - Plan ID
   * @returns {Promise<void>}
   */
  async deletePlan(planId) {
    try {
      // Get all modules first
      const modulesRef = collection(firestore, 'plans', planId, 'modules');
      const modulesSnapshot = await getDocs(modulesRef);
      
      // Delete all modules and their subcollections
      for (const moduleDoc of modulesSnapshot.docs) {
        await this.deleteModule(planId, moduleDoc.id);
      }
      
      // Finally delete the plan document
      await deleteDoc(doc(firestore, 'plans', planId));
    } catch (error) {
      console.error('Error deleting plan:', error);
      throw error;
    }
  }

  /**
   * Get all modules for a plan
   * @param {string} planId - Plan ID
   * @returns {Promise<Array>} Array of module documents
   */
  async getModulesByPlan(planId) {
    try {
      const modulesRef = collection(firestore, 'plans', planId, 'modules');
      const querySnapshot = await getDocs(modulesRef);
      
      const modules = [];
      for (const docSnapshot of querySnapshot.docs) {
        const moduleData = docSnapshot.data();
        modules.push({
          id: docSnapshot.id,
          ...moduleData
        });
      }
      
      // Sort by order
      modules.sort((a, b) => {
        const orderA = a.order !== undefined && a.order !== null ? a.order : Infinity;
        const orderB = b.order !== undefined && b.order !== null ? b.order : Infinity;
        return orderA - orderB;
      });
      
      return modules;
    } catch (error) {
      console.error('Error fetching modules:', error);
      throw error;
    }
  }

  /**
   * Create a new module in a plan
   * @param {string} planId - Plan ID
   * @param {string} moduleName - Module name/title
   * @param {number} order - Order index (optional)
   * @returns {Promise<Object>} Created module document
   */
  async createModule(planId, moduleName, order = null) {
    try {
      const modulesRef = collection(firestore, 'plans', planId, 'modules');
      
      // If order not provided, get the next order
      if (order === null) {
        const existingModules = await this.getModulesByPlan(planId);
        order = existingModules.length;
      }
      
      const newModule = {
        title: moduleName,
        order: order,
        created_at: serverTimestamp(),
        updated_at: serverTimestamp()
      };
      
      const moduleRef = await addDoc(modulesRef, newModule);
      const createdModule = await getDoc(moduleRef);
      
      return {
        id: createdModule.id,
        ...createdModule.data()
      };
    } catch (error) {
      console.error('Error creating module:', error);
      throw error;
    }
  }

  /**
   * Delete a module from a plan (and all its sessions/exercises)
   * @param {string} planId - Plan ID
   * @param {string} moduleId - Module ID
   * @returns {Promise<void>}
   */
  async deleteModule(planId, moduleId) {
    try {
      // Get all sessions in the module
      const sessionsRef = collection(firestore, 'plans', planId, 'modules', moduleId, 'sessions');
      const sessionsSnapshot = await getDocs(sessionsRef);
      
      // Delete all sessions and their subcollections
      for (const sessionDoc of sessionsSnapshot.docs) {
        const sessionId = sessionDoc.id;
        
        // Get all exercises in the session
        const exercisesRef = collection(
          firestore, 
          'plans', planId, 'modules', moduleId, 'sessions', sessionId, 'exercises'
        );
        const exercisesSnapshot = await getDocs(exercisesRef);
        
        // Delete all exercises and their sets
        for (const exerciseDoc of exercisesSnapshot.docs) {
          const exerciseId = exerciseDoc.id;
          
          // Delete all sets
          const setsRef = collection(
            firestore,
            'plans', planId, 'modules', moduleId, 'sessions', sessionId, 'exercises', exerciseId, 'sets'
          );
          const setsSnapshot = await getDocs(setsRef);
          for (const setDoc of setsSnapshot.docs) {
            await deleteDoc(doc(
              firestore,
              'plans', planId, 'modules', moduleId, 'sessions', sessionId, 'exercises', exerciseId, 'sets', setDoc.id
            ));
          }
          
          // Delete exercise
          await deleteDoc(doc(
            firestore,
            'plans', planId, 'modules', moduleId, 'sessions', sessionId, 'exercises', exerciseId
          ));
        }
        
        // Delete session
        await deleteDoc(doc(
          firestore,
          'plans', planId, 'modules', moduleId, 'sessions', sessionId
        ));
      }
      
      // Finally delete the module
      await deleteDoc(doc(firestore, 'plans', planId, 'modules', moduleId));
    } catch (error) {
      console.error('Error deleting module:', error);
      throw error;
    }
  }

  /**
   * Delete a session from a module (and all its exercises/sets)
   */
  async deleteSession(planId, moduleId, sessionId) {
    try {
      const exercisesRef = collection(
        firestore, 'plans', planId, 'modules', moduleId, 'sessions', sessionId, 'exercises'
      );
      const exercisesSnapshot = await getDocs(exercisesRef);
      for (const exerciseDoc of exercisesSnapshot.docs) {
        await this.deleteExercise(planId, moduleId, sessionId, exerciseDoc.id);
      }
      await deleteDoc(doc(firestore, 'plans', planId, 'modules', moduleId, 'sessions', sessionId));
    } catch (error) {
      console.error('Error deleting session:', error);
      throw error;
    }
  }

  /**
   * Get all sessions for a module
   * @param {string} planId - Plan ID
   * @param {string} moduleId - Module ID
   * @returns {Promise<Array>} Array of session documents
   */
  async getSessionsByModule(planId, moduleId) {
    try {
      const sessionsRef = collection(firestore, 'plans', planId, 'modules', moduleId, 'sessions');
      const querySnapshot = await getDocs(query(sessionsRef, orderBy('order', 'asc')));
      
      return querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
    } catch (error) {
      console.error('Error fetching sessions:', error);
      throw error;
    }
  }

  /**
   * Create a session in a module
   * @param {string} planId - Plan ID
   * @param {string} moduleId - Module ID
   * @param {string} sessionName - Session name
   * @param {number} order - Order index (optional)
   * @param {string} imageUrl - Optional image URL
   * @param {string} librarySessionRef - Optional reference to library session
   * @param {number} dayIndex - Optional 0-6 to pin session to a specific day of week
   * @returns {Promise<Object>} Created session document
   */
  async createSession(planId, moduleId, sessionName, order = null, imageUrl = null, librarySessionRef = null, dayIndex = null) {
    try {
      const sessionsRef = collection(firestore, 'plans', planId, 'modules', moduleId, 'sessions');
      
      // If order not provided, get the next order
      if (order === null) {
        const existingSessions = await this.getSessionsByModule(planId, moduleId);
        order = existingSessions.length;
      }
      
      const newSession = {
        title: sessionName,
        order: order,
        image_url: imageUrl || null,
        librarySessionRef: librarySessionRef || null,
        dayIndex: dayIndex !== null && dayIndex !== undefined ? dayIndex : null,
        created_at: serverTimestamp(),
        updated_at: serverTimestamp()
      };
      
      const sessionRef = await addDoc(sessionsRef, newSession);
      const createdSession = await getDoc(sessionRef);
      
      return {
        id: createdSession.id,
        ...createdSession.data()
      };
    } catch (error) {
      console.error('Error creating session:', error);
      throw error;
    }
  }

  /**
   * Get all exercises for a session
   * @param {string} planId - Plan ID
   * @param {string} moduleId - Module ID
   * @param {string} sessionId - Session ID
   * @returns {Promise<Array>} Array of exercise documents
   */
  async getExercisesBySession(planId, moduleId, sessionId) {
    try {
      const exercisesRef = collection(
        firestore, 
        'plans', planId, 'modules', moduleId, 'sessions', sessionId, 'exercises'
      );
      const querySnapshot = await getDocs(query(exercisesRef, orderBy('order', 'asc')));
      
      return querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
    } catch (error) {
      console.error('Error fetching exercises:', error);
      throw error;
    }
  }

  /**
   * Create an exercise in a session
   * @param {string} planId - Plan ID
   * @param {string} moduleId - Module ID
   * @param {string} sessionId - Session ID
   * @param {string} exerciseName - Exercise title/name
   * @param {number} order - Order index (optional)
   * @returns {Promise<Object>} Created exercise document
   */
  async createExercise(planId, moduleId, sessionId, exerciseName, order = null) {
    try {
      const exercisesRef = collection(
        firestore, 'plans', planId, 'modules', moduleId, 'sessions', sessionId, 'exercises'
      );
      
      if (order === null) {
        const existing = await this.getExercisesBySession(planId, moduleId, sessionId);
        order = existing.length;
      }
      
      const newExercise = {
        title: exerciseName?.trim() || 'Ejercicio',
        name: exerciseName?.trim() || 'Ejercicio',
        order,
        created_at: serverTimestamp(),
        updated_at: serverTimestamp()
      };
      
      const docRef = await addDoc(exercisesRef, newExercise);
      return { id: docRef.id, ...newExercise };
    } catch (error) {
      console.error('Error creating exercise:', error);
      throw error;
    }
  }

  /**
   * Update an exercise
   */
  async updateExercise(planId, moduleId, sessionId, exerciseId, updates) {
    try {
      const exerciseRef = doc(
        firestore, 'plans', planId, 'modules', moduleId, 'sessions', sessionId, 'exercises', exerciseId
      );
      await updateDoc(exerciseRef, {
        ...updates,
        updated_at: serverTimestamp()
      });
    } catch (error) {
      console.error('Error updating exercise:', error);
      throw error;
    }
  }

  /**
   * Delete an exercise and its sets
   */
  async deleteExercise(planId, moduleId, sessionId, exerciseId) {
    try {
      const setsRef = collection(
        firestore, 'plans', planId, 'modules', moduleId, 'sessions', sessionId, 'exercises', exerciseId, 'sets'
      );
      const setsSnapshot = await getDocs(setsRef);
      for (const setDoc of setsSnapshot.docs) {
        await deleteDoc(doc(firestore, 'plans', planId, 'modules', moduleId, 'sessions', sessionId, 'exercises', exerciseId, 'sets', setDoc.id));
      }
      await deleteDoc(doc(firestore, 'plans', planId, 'modules', moduleId, 'sessions', sessionId, 'exercises', exerciseId));
    } catch (error) {
      console.error('Error deleting exercise:', error);
      throw error;
    }
  }

  /**
   * Get sets for an exercise
   */
  async getSetsByExercise(planId, moduleId, sessionId, exerciseId) {
    try {
      const setsRef = collection(
        firestore, 'plans', planId, 'modules', moduleId, 'sessions', sessionId, 'exercises', exerciseId, 'sets'
      );
      const querySnapshot = await getDocs(query(setsRef, orderBy('order', 'asc')));
      return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    } catch (error) {
      console.error('Error fetching sets:', error);
      throw error;
    }
  }

  /**
   * Create a set for an exercise
   */
  async createSet(planId, moduleId, sessionId, exerciseId, order = null) {
    try {
      const setsRef = collection(
        firestore, 'plans', planId, 'modules', moduleId, 'sessions', sessionId, 'exercises', exerciseId, 'sets'
      );
      if (order === null) {
        const existing = await this.getSetsByExercise(planId, moduleId, sessionId, exerciseId);
        order = existing.length;
      }
      const newSet = {
        title: `Serie ${order + 1}`,
        order,
        created_at: serverTimestamp(),
        updated_at: serverTimestamp()
      };
      const docRef = await addDoc(setsRef, newSet);
      return { id: docRef.id, ...newSet };
    } catch (error) {
      console.error('Error creating set:', error);
      throw error;
    }
  }

  /**
   * Update a set
   */
  async updateSet(planId, moduleId, sessionId, exerciseId, setId, updates) {
    try {
      const setRef = doc(
        firestore, 'plans', planId, 'modules', moduleId, 'sessions', sessionId, 'exercises', exerciseId, 'sets', setId
      );
      await updateDoc(setRef, { ...updates, updated_at: serverTimestamp() });
    } catch (error) {
      console.error('Error updating set:', error);
      throw error;
    }
  }

  /**
   * Delete a set
   */
  async deleteSet(planId, moduleId, sessionId, exerciseId, setId) {
    try {
      await deleteDoc(doc(
        firestore, 'plans', planId, 'modules', moduleId, 'sessions', sessionId, 'exercises', exerciseId, 'sets', setId
      ));
    } catch (error) {
      console.error('Error deleting set:', error);
      throw error;
    }
  }

  /**
   * Update a module
   */
  async updateModule(planId, moduleId, updates) {
    try {
      const moduleRef = doc(firestore, 'plans', planId, 'modules', moduleId);
      await updateDoc(moduleRef, { ...updates, updated_at: serverTimestamp() });
    } catch (error) {
      console.error('Error updating module:', error);
      throw error;
    }
  }

  /**
   * Duplicate a module (week) with all its sessions, exercises and sets.
   * If a source session has useLocalContent: true (edited only for that week), the duplicate
   * gets the same inline content and useLocalContent: true so it shows the edited version, not the library.
   * New module is appended at the end (order = max + 1). Title is "Semana N" where N = current count + 1.
   * @param {string} planId - Plan ID
   * @param {string} sourceModuleId - Module ID to copy
   * @returns {Promise<Object>} The created module (with id)
   */
  async duplicateModule(planId, sourceModuleId) {
    const existingModules = await this.getModulesByPlan(planId);
    const sourceMod = existingModules.find((m) => m.id === sourceModuleId);
    if (!sourceMod) throw new Error('Módulo no encontrado');

    const nextOrder = existingModules.length === 0
      ? 0
      : Math.max(...existingModules.map((m) => m.order ?? 0)) + 1;
    const newTitle = `Semana ${existingModules.length + 1}`;

    const newModule = await this.createModule(planId, newTitle, nextOrder);
    const newModuleId = newModule.id;

    const EXERCISE_SKIP_KEYS = ['id', 'sets', 'created_at', 'updated_at'];
    const SET_SKIP_KEYS = ['id', 'created_at', 'updated_at'];

    const sessions = await this.getSessionsByModule(planId, sourceModuleId);
    for (const session of sessions) {
      const createdSession = await this.createSession(
        planId,
        newModuleId,
        session.title || 'Sesión',
        session.order ?? null,
        session.image_url ?? null,
        session.librarySessionRef ?? null,
        session.dayIndex ?? null
      );
      const newSessionId = createdSession.id;

      if (session.useLocalContent) {
        await this.updateSession(planId, newModuleId, newSessionId, { useLocalContent: true });
      }

      const exercises = await this.getExercisesBySession(planId, sourceModuleId, session.id);
      for (const exercise of exercises) {
        const title = exercise.title || exercise.name || 'Ejercicio';
        const createdEx = await this.createExercise(
          planId,
          newModuleId,
          newSessionId,
          title,
          exercise.order ?? null
        );

        const exerciseUpdates = {};
        for (const [key, value] of Object.entries(exercise)) {
          if (EXERCISE_SKIP_KEYS.includes(key)) continue;
          if (value === undefined) continue;
          exerciseUpdates[key] = value;
        }
        if (Object.keys(exerciseUpdates).length > 0) {
          await this.updateExercise(planId, newModuleId, newSessionId, createdEx.id, exerciseUpdates);
        }

        const sets = await this.getSetsByExercise(planId, sourceModuleId, session.id, exercise.id);
        for (let j = 0; j < sets.length; j++) {
          const set = sets[j];
          const createdSet = await this.createSet(planId, newModuleId, newSessionId, createdEx.id, set.order ?? j);

          const setUpdates = {};
          for (const [key, value] of Object.entries(set)) {
            if (SET_SKIP_KEYS.includes(key)) continue;
            if (value === undefined) continue;
            setUpdates[key] = value;
          }
          if (Object.keys(setUpdates).length > 0) {
            await this.updateSet(planId, newModuleId, newSessionId, createdEx.id, createdSet.id, setUpdates);
          }
        }
      }
    }

    return { ...newModule, id: newModuleId };
  }

  /**
   * Copy library session content (exercises + sets) into a plan session. Used when detaching
   * a plan session so it can be edited only for that week. Clears any existing inline content
   * first, then copies all exercise and set fields from the library session.
   * @param {string} planId
   * @param {string} moduleId
   * @param {string} sessionId - Plan session document id
   * @param {Object} librarySession - Full library session from getLibrarySessionById (has exercises with sets)
   */
  async copyLibraryContentToPlanSession(planId, moduleId, sessionId, librarySession) {
    const existingExercises = await this.getExercisesBySession(planId, moduleId, sessionId);
    for (const ex of existingExercises) {
      await this.deleteExercise(planId, moduleId, sessionId, ex.id);
    }

    const EXERCISE_SKIP_KEYS = ['id', 'sets', 'created_at', 'updated_at'];
    const SET_SKIP_KEYS = ['id', 'created_at', 'updated_at'];

    const exercises = librarySession?.exercises || [];
    for (let i = 0; i < exercises.length; i++) {
      const ex = exercises[i];
      let displayName = ex.title || ex.name || 'Ejercicio';
      if ((!ex.title && !ex.name) && ex.primary && typeof ex.primary === 'object') {
        const first = Object.values(ex.primary)[0];
        displayName = typeof first === 'string' ? first : (first && (first.name || first.title || first.id)) || displayName;
      }
      const title = displayName;
      const createdEx = await this.createExercise(planId, moduleId, sessionId, title, ex.order ?? i);

      const exerciseUpdates = {};
      for (const [key, value] of Object.entries(ex)) {
        if (EXERCISE_SKIP_KEYS.includes(key)) continue;
        if (value === undefined) continue;
        exerciseUpdates[key] = value;
      }
      if (!exerciseUpdates.name && !exerciseUpdates.title) {
        exerciseUpdates.name = displayName;
        exerciseUpdates.title = displayName;
      } else if (!exerciseUpdates.name) {
        exerciseUpdates.name = exerciseUpdates.title || displayName;
      } else if (!exerciseUpdates.title) {
        exerciseUpdates.title = exerciseUpdates.name || displayName;
      }
      if (Object.keys(exerciseUpdates).length > 0) {
        await this.updateExercise(planId, moduleId, sessionId, createdEx.id, exerciseUpdates);
      }

      const sets = ex.sets || [];
      for (let j = 0; j < sets.length; j++) {
        const set = sets[j];
        const createdSet = await this.createSet(planId, moduleId, sessionId, createdEx.id, set.order ?? j);

        const setUpdates = {};
        for (const [key, value] of Object.entries(set)) {
          if (SET_SKIP_KEYS.includes(key)) continue;
          if (value === undefined) continue;
          setUpdates[key] = value;
        }
        if (Object.keys(setUpdates).length > 0) {
          await this.updateSet(planId, moduleId, sessionId, createdEx.id, createdSet.id, setUpdates);
        }
      }
    }
  }

  /**
   * Update a session
   */
  async updateSession(planId, moduleId, sessionId, updates) {
    try {
      const sessionRef = doc(
        firestore, 'plans', planId, 'modules', moduleId, 'sessions', sessionId
      );
      await updateDoc(sessionRef, { ...updates, updated_at: serverTimestamp() });
    } catch (error) {
      console.error('Error updating session:', error);
      throw error;
    }
  }

  /**
   * Copy plan structure from an existing program
   * Useful for migrating content from programs to plans
   * @param {string} programId - Source program ID
   * @param {string} planId - Target plan ID
   * @returns {Promise<void>}
   */
  async copyFromProgram(programId, planId) {
    try {
      // This would copy all modules/sessions/exercises from program to plan
      // Implementation similar to programService structure
      // For now, return a placeholder
      console.log('Copying from program to plan not yet implemented');
    } catch (error) {
      console.error('Error copying from program:', error);
      throw error;
    }
  }

  /**
   * Get plan structure summary (module count, session count, etc.)
   * @param {string} planId - Plan ID
   * @returns {Promise<Object>} Structure summary
   */
  async getPlanStructure(planId) {
    try {
      const modules = await this.getModulesByPlan(planId);
      let totalSessions = 0;
      let totalExercises = 0;
      
      for (const module of modules) {
        const sessions = await this.getSessionsByModule(planId, module.id);
        totalSessions += sessions.length;
        
        for (const session of sessions) {
          const exercises = await this.getExercisesBySession(planId, module.id, session.id);
          totalExercises += exercises.length;
        }
      }
      
      return {
        totalModules: modules.length,
        totalSessions,
        totalExercises,
        modules
      };
    } catch (error) {
      console.error('Error getting plan structure:', error);
      throw error;
    }
  }
}

export default new PlansService();

