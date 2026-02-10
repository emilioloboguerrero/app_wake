// Firestore service for Wake
import { firestore } from '../config/firebase';
import { 
  doc, 
  setDoc, 
  getDoc, 
  updateDoc, 
  deleteDoc,
  collection, 
  query, 
  where, 
  orderBy, 
  limit, 
  getDocs, 
  addDoc, 
  serverTimestamp,
  writeBatch
} from 'firebase/firestore';
import { getMondayWeek } from '../utils/weekCalculation';
import logger from '../utils/logger';

// Helper function to remove undefined values from an object recursively
function removeUndefinedValues(obj) {
  if (obj === null || obj === undefined) {
    return obj;
  }
  
  if (Array.isArray(obj)) {
    return obj.map(item => removeUndefinedValues(item)).filter(item => item !== undefined);
  }
  
  if (typeof obj === 'object') {
    const cleaned = {};
    for (const [key, value] of Object.entries(obj)) {
      if (value !== undefined) {
        cleaned[key] = removeUndefinedValues(value);
      }
    }
    return cleaned;
  }
  
  return obj;
}

class FirestoreService {
  // Users collection operations
  async createUser(userId, userData) {
    try {
      await setDoc(doc(firestore, 'users', userId), {
        ...userData,
        role: userData.role || 'user',        // Default to 'user' if not specified
        created_at: serverTimestamp()
      });
    } catch (error) {
      throw error;
    }
  }

  async getUser(userId) {
    try {
      const userRef = doc(firestore, 'users', userId);
      const userDoc = await getDoc(userRef);
      if (!userDoc.exists()) {
        logger.debug('[FIRESTORE] getUser: no document for users/', userId);
        return null;
      }
      return userDoc.data();
    } catch (error) {
      // Handle offline/network errors gracefully
      if (error.code === 'unavailable' || error.message.includes('offline')) {
        logger.debug('📱 Device is offline, throwing offline error for caller cache handling');
        const offlineError = new Error('Firestore unavailable offline');
        offlineError.code = 'offline';
        throw offlineError;
      }
      throw error;
    }
  }

  async updateUser(userId, userData) {
    const userRef = doc(firestore, 'users', userId);
    try {
      const existing = await getDoc(userRef);
      if (existing.exists()) {
        logger.debug('[FIRESTORE] updateUser: document exists, updating users/', userId);
        await updateDoc(userRef, userData);
      } else {
        logger.log('[FIRESTORE] updateUser: no document for users/', userId, '— creating with setDoc(merge).');
        await setDoc(userRef, { ...userData, created_at: serverTimestamp() }, { merge: true });
      }
    } catch (error) {
      logger.error('[FIRESTORE] updateUser failed for users/', userId, error?.code, error?.message);
      throw error;
    }
  }

  // Progress tracking methods
  async createProgressEntry(userId, progressData) {
    try {
      const progressRef = collection(firestore, 'users', userId, 'progress');
      const docRef = await addDoc(progressRef, {
        ...progressData,
        updated_at: serverTimestamp()
      });
      return docRef.id;
    } catch (error) {
      logger.error('Error creating progress entry:', error);
      throw error;
    }
  }

  async updateProgressEntry(userId, progressId, progressData) {
    try {
      const progressRef = doc(firestore, 'users', userId, 'progress', progressId);
      await updateDoc(progressRef, {
        ...progressData,
        updated_at: serverTimestamp()
      });
    } catch (error) {
      logger.error('Error updating progress entry:', error);
      throw error;
    }
  }

  async getUserProgress(userId, courseId = null) {
    try {
      let progressQuery = collection(firestore, 'users', userId, 'progress');
      
      if (courseId) {
        progressQuery = query(progressQuery, where('course_id', '==', courseId));
      }
      
      const progressSnapshot = await getDocs(progressQuery);
      return progressSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
    } catch (error) {
      logger.error('Error getting user progress:', error);
      throw error;
    }
  }

  /**
   * Get user's progress sessions for a specific course
   */
  async getUserCourseProgress(userId, courseId, limit = 50) {
    try {
      
      const progressQuery = query(
        collection(firestore, 'progress'),
        where('user_id', '==', userId),
        where('course_id', '==', courseId),
        orderBy('completed_at', 'desc'),
        limit(limit)
      );
      
      const snapshot = await getDocs(progressQuery);
      const sessions = [];
      
      snapshot.forEach(doc => {
        sessions.push({
          id: doc.id,
          ...doc.data()
        });
      });
      
      return sessions;
    } catch (error) {
      logger.error('❌ Error getting user course progress:', error);
      return [];
    }
  }

  /**
   * Create a new progress session document
   * Document ID: {userId}_{courseId}_{sessionId}
   */
  async createProgressSession(sessionData) {
    try {
      
      // Clean the data to remove undefined values
      const cleanSessionData = removeUndefinedValues(sessionData);
      
      // Create document ID: userId_courseId_sessionId
      const docId = `${sessionData.user_id}_${sessionData.course_id}_${sessionData.session_id}`;
      
      const progressRef = doc(firestore, 'progress', docId);
      await setDoc(progressRef, {
        ...cleanSessionData,
        created_at: serverTimestamp(),
        updated_at: serverTimestamp()
      });
      
      return docId;
    } catch (error) {
      logger.error('❌ Error creating progress session:', error);
      throw error;
    }
  }


  /**
   * Get a specific progress session by ID
   */
  async getProgressSession(sessionId) {
    try {
      logger.debug('📊 Getting progress session:', sessionId);
      
      const progressRef = doc(firestore, 'progress', sessionId);
      const docSnap = await getDoc(progressRef);
      
      if (docSnap.exists()) {
        const sessionData = {
          id: docSnap.id,
          ...docSnap.data()
        };
        logger.debug('✅ Progress session found');
        return sessionData;
      } else {
        logger.debug('❌ Progress session not found');
        return null;
      }
    } catch (error) {
      logger.error('❌ Error getting progress session:', error);
      return null;
    }
  }

  _oneOnOneModulesCache = {};
  _oneOnOneModulesCacheTtlMs = 5 * 60 * 1000;

  async getCourseModules(courseId, userId = null, options = {}) {
    try {
      const cacheKey = userId ? `${courseId}_${userId}` : null;
      if (options.cacheInMemory && cacheKey && options.ttlMs !== undefined) {
        const entry = this._oneOnOneModulesCache[cacheKey];
        if (entry && (Date.now() - entry.timestamp) < options.ttlMs) {
          logger.debug('📱 Using in-memory cached modules for one-on-one:', courseId);
          return entry.modules;
        }
      }
      const courseData = await this.getCourse(courseId);
      const isWeeklyProgram = courseData?.weekly === true;
      const creatorId = courseData?.creator_id;

      // For one-on-one: use per-client content_plan_id override if set, else course-level
      let contentPlanId = courseData?.content_plan_id;
      if (userId) {
        try {
          const clientProgram = await this.getClientProgram(userId, courseId);
          if (clientProgram?.content_plan_id) {
            contentPlanId = clientProgram.content_plan_id;
          }
        } catch (_) { /* ignore */ }
      }

      // If course uses plan-based content, load modules from plans collection
      if (contentPlanId) {
        const planModulesQuery = query(
          collection(firestore, 'plans', contentPlanId, 'modules'),
          orderBy('order', 'asc')
        );
        const planModulesSnapshot = await getDocs(planModulesQuery);
        const planModules = await Promise.all(
          planModulesSnapshot.docs.map(async (moduleDoc) => {
            const moduleData = { id: moduleDoc.id, ...moduleDoc.data() };
            try {
              const sessionsQuery = query(
                collection(firestore, 'plans', contentPlanId, 'modules', moduleDoc.id, 'sessions'),
                orderBy('order', 'asc')
              );
              const sessionsSnapshot = await getDocs(sessionsQuery);
              const sessions = await Promise.all(
                sessionsSnapshot.docs.map(async (sessionDoc) => {
                  const sessionData = { id: sessionDoc.id, ...sessionDoc.data() };
                  try {
                    const exercisesQuery = query(
                      collection(firestore, 'plans', contentPlanId, 'modules', moduleDoc.id, 'sessions', sessionDoc.id, 'exercises'),
                      orderBy('order', 'asc')
                    );
                    const exercisesSnapshot = await getDocs(exercisesQuery);
                    const exercises = await Promise.all(
                      exercisesSnapshot.docs.map(async (exerciseDoc) => {
                        const exerciseData = { id: exerciseDoc.id, ...exerciseDoc.data() };
                        try {
                          const setsQuery = query(
                            collection(firestore, 'plans', contentPlanId, 'modules', moduleDoc.id, 'sessions', sessionDoc.id, 'exercises', exerciseDoc.id, 'sets'),
                            orderBy('order', 'asc')
                          );
                          const setsSnapshot = await getDocs(setsQuery);
                          exerciseData.sets = setsSnapshot.docs.map(s => ({ id: s.id, ...s.data() }));
                        } catch {
                          exerciseData.sets = [];
                        }
                        return exerciseData;
                      })
                    );
                    sessionData.exercises = exercises;
                  } catch {
                    sessionData.exercises = [];
                  }
                  return sessionData;
                })
              );
              moduleData.sessions = sessions;
            } catch {
              moduleData.sessions = [];
            }
            return moduleData;
          })
        );
        // Apply one-on-one week filtering: prefer client_plan_content copy, else filter by moduleIndex
        let result = planModules.sort((a, b) => {
          const oA = a.order != null ? a.order : Infinity;
          const oB = b.order != null ? b.order : Infinity;
          return oA - oB;
        });
        if (userId) {
          try {
            const clientProgram = await this.getClientProgram(userId, courseId);
            const userDoc = await this.getUser(userId);
            const isOneOnOneProgram = userDoc?.courses?.[courseId]?.deliveryType === 'one_on_one';
            const weekAssignments = clientProgram?.weekAssignments ?? clientProgram?.planAssignments;
            if (isOneOnOneProgram && weekAssignments) {
              const currentWeek = getMondayWeek();
              const weekAssignment = weekAssignments[currentWeek];
              if (weekAssignment) {
                const clientCopy = await this.getClientPlanContentCopy(userId, courseId, currentWeek);
                if (clientCopy) {
                  result = [clientCopy];
                } else if (weekAssignment.moduleIndex !== undefined) {
                  const filtered = result.filter((_, i) => i === weekAssignment.moduleIndex);
                  result = filtered.length > 0 ? filtered : result;
                }
              }
            }
          } catch (_) { /* ignore */ }
        }
        if (options.cacheInMemory && cacheKey && options.ttlMs !== undefined) {
          this._oneOnOneModulesCache[cacheKey] = { modules: result, timestamp: Date.now() };
        }
        return result;
      }
      
      // Load client program overrides if userId provided (needed for one-on-one week assignments)
      let clientProgram = null;
      let isOneOnOneProgram = false;
      let weekAssignment = null;
      
      if (userId) {
        try {
          clientProgram = await this.getClientProgram(userId, courseId);
          
          // Check if this is a one-on-one program (check user.courses)
          try {
            const userDoc = await this.getUser(userId);
            const userCourseData = userDoc?.courses?.[courseId];
            isOneOnOneProgram = userCourseData?.deliveryType === 'one_on_one';
            
            // If one-on-one, check weekAssignments for current week
            const weekAssignments = clientProgram?.weekAssignments ?? clientProgram?.planAssignments;
            if (isOneOnOneProgram && weekAssignments) {
              const currentWeek = getMondayWeek();
              weekAssignment = weekAssignments[currentWeek];
              logger.debug('📅 One-on-one program - week assignment for', currentWeek, ':', weekAssignment);
            }
          } catch (error) {
            logger.warn('⚠️ Could not check if one-on-one program:', error);
          }
        } catch (error) {
          logger.warn('⚠️ Could not load client program, continuing without overrides:', error);
        }
      }
      
      let modulesQuery;
      
      if (isWeeklyProgram) {
        // ✅ Weekly program: Filter by current calendar week
        const currentWeek = getMondayWeek(); // "2025-W03"
        
        logger.debug('📅 Filtering weekly program by week:', currentWeek);
        
        modulesQuery = query(
          collection(firestore, 'courses', courseId, 'modules'),
          where('week', '==', currentWeek), // ✅ Only current week's modules
          orderBy('order', 'asc')
        );
      } else {
        // ✅ Normal program: Download all modules (existing behavior)
        modulesQuery = query(
          collection(firestore, 'courses', courseId, 'modules'),
          orderBy('order', 'asc') // No week filter
        );
      }
      
      const modulesSnapshot = await getDocs(modulesQuery);
      
      if (isWeeklyProgram && modulesSnapshot.empty) {
        const currentWeek = getMondayWeek();
        logger.warn('⚠️ No modules found for current week:', currentWeek);
        // Could return empty array or show message to user
      }
      
      // Import library resolution service dynamically to avoid circular dependencies
      const { default: libraryResolutionService } = await import('./libraryResolutionService');
      
      // OPTIMIZED: Fetch all modules in parallel instead of sequential
      const allModules = await Promise.all(
        modulesSnapshot.docs.map(async (moduleDoc) => {
          const moduleData = { id: moduleDoc.id, ...moduleDoc.data() };
          const clientModuleOverrides = clientProgram?.modules?.[moduleDoc.id];
          
          // ✅ NEW: Check if module is library reference
          if (moduleData.libraryModuleRef && creatorId) {
            try {
              logger.debug('📚 Resolving library module:', moduleData.libraryModuleRef);
              const libraryModule = await libraryResolutionService.resolveLibraryModule(
                creatorId,
                moduleData.libraryModuleRef,
                courseId,
                moduleDoc.id
              );
              
              // Merge program-level and client-level overrides
              let resolvedModule = { ...libraryModule, ...moduleData };
              
              // Apply client overrides if exists
              if (clientModuleOverrides) {
                resolvedModule = libraryResolutionService.mergeModuleOverrides(
                  resolvedModule,
                  null,
                  clientModuleOverrides
                );
              }
              
              return resolvedModule;
            } catch (error) {
              logger.error('❌ Error resolving library module:', error);
              // Fallback to empty module if resolution fails
              return { ...moduleData, sessions: [] };
            }
          }
          
          // ✅ EXISTING: Fetch sessions (standalone or with library refs)
          try {
            const sessionsQuery = query(
              collection(firestore, 'courses', courseId, 'modules', moduleDoc.id, 'sessions'),
              orderBy('order', 'asc')
            );
            const sessionsSnapshot = await getDocs(sessionsQuery);
            
            // OPTIMIZED: Fetch all sessions in parallel
            const sessions = await Promise.all(
              sessionsSnapshot.docs.map(async (sessionDoc) => {
                const sessionData = { id: sessionDoc.id, ...sessionDoc.data() };
                
                // ✅ NEW: Check if session is library reference
                if (sessionData.librarySessionRef && creatorId) {
                  try {
                    logger.debug('📚 Resolving library session:', sessionData.librarySessionRef);
                    const programSessionOverrides = sessionData; // Program-level overrides
                    const clientSessionOverrides = clientModuleOverrides?.sessions?.[sessionDoc.id];
                    
                    return await libraryResolutionService.resolveLibrarySession(
                      creatorId,
                      sessionData.librarySessionRef,
                      courseId,
                      moduleDoc.id,
                      sessionDoc.id,
                      programSessionOverrides,
                      clientSessionOverrides
                    );
                  } catch (error) {
                    // Library session not found is a handled case - log as warning, not error
                    // This can happen when a library session was deleted but the course still references it
                    const isNotFoundError = error?.message?.includes('not found');
                    if (isNotFoundError) {
                      logger.warn('⚠️ Library session not found (handled gracefully):', {
                        librarySessionRef: sessionData.librarySessionRef,
                        sessionId: sessionDoc.id,
                        courseId,
                        message: 'Returning empty session as fallback'
                      });
                    } else {
                      // Other errors (network, permission, etc.) should still be logged as errors
                      logger.error('❌ Error resolving library session:', error);
                    }
                    // Fallback to empty session if resolution fails
                    return { ...sessionData, exercises: [] };
                  }
                }
                
                // Apply client overrides to standalone sessions
                if (clientModuleOverrides?.sessions?.[sessionDoc.id]) {
                  const clientSessionOverrides = clientModuleOverrides.sessions[sessionDoc.id];
                  sessionData = { ...sessionData, ...clientSessionOverrides };
                }
                
                // ✅ EXISTING: Standalone session - fetch exercises/sets normally
                try {
                  const exercisesQuery = query(
                    collection(firestore, 'courses', courseId, 'modules', moduleDoc.id, 'sessions', sessionDoc.id, 'exercises'),
                    orderBy('order', 'asc')
                  );
                  const exercisesSnapshot = await getDocs(exercisesQuery);
                  
                  // OPTIMIZED: Fetch all exercises in parallel
                  const exercises = await Promise.all(
                    exercisesSnapshot.docs.map(async (exerciseDoc) => {
                      const exerciseData = { id: exerciseDoc.id, ...exerciseDoc.data() };
                      
                        // Get sets for this exercise
                      try {
                        const setsQuery = query(
                          collection(firestore, 'courses', courseId, 'modules', moduleDoc.id, 'sessions', sessionDoc.id, 'exercises', exerciseDoc.id, 'sets'),
                          orderBy('order', 'asc')
                        );
                        const setsSnapshot = await getDocs(setsQuery);
                        
                        const sets = setsSnapshot.docs.map(setDoc => ({
                          id: setDoc.id,
                          ...setDoc.data()
                        }));
                        
                        exerciseData.sets = sets;
                      } catch (error) {
                        logger.warn(`No sets found for exercise ${exerciseDoc.id}:`, error.message);
                        exerciseData.sets = [];
                      }
                      
                      return exerciseData;
                    })
                  );
                  
                  sessionData.exercises = exercises;
                } catch (error) {
                  logger.warn(`No exercises found for session ${sessionDoc.id}:`, error.message);
                  sessionData.exercises = [];
                }
                
                return sessionData;
              })
            );
            
            moduleData.sessions = sessions;
          } catch (error) {
            logger.warn(`No sessions found for module ${moduleDoc.id}:`, error.message);
            moduleData.sessions = [];
          }
          
          return moduleData;
        })
      );
      
      // ✅ NEW: For one-on-one programs with week assignments, filter modules by moduleIndex
      // Sort modules by order first
      allModules.sort((a, b) => {
        const orderA = a.order !== undefined && a.order !== null ? a.order : Infinity;
        const orderB = b.order !== undefined && b.order !== null ? b.order : Infinity;
        return orderA - orderB;
      });
      
      let result;
      if (isOneOnOneProgram && weekAssignment && weekAssignment.moduleIndex !== undefined) {
        const targetModuleIndex = weekAssignment.moduleIndex;
        logger.debug('📅 Filtering one-on-one program modules to index:', targetModuleIndex);
        const filteredModules = allModules.filter((module, index) => index === targetModuleIndex);
        result = filteredModules.length === 0 ? allModules : filteredModules;
      } else {
        result = allModules;
      }
      if (options.cacheInMemory && cacheKey && options.ttlMs !== undefined) {
        this._oneOnOneModulesCache[cacheKey] = { modules: result, timestamp: Date.now() };
      }
      return result;
    } catch (error) {
      logger.error('Error in getCourseModules:', error);
      throw error;
    }
  }

  /**
   * Get session-level overrides
   */
  async getSessionOverrides(programId, moduleId, sessionId) {
    try {
      const overridesRef = doc(firestore,
        'courses', programId,
        'modules', moduleId,
        'sessions', sessionId,
        'overrides', 'data'
      );
      const docSnap = await getDoc(overridesRef);
      return docSnap.exists() ? docSnap.data() : null;
    } catch (error) {
      logger.error('Error fetching session overrides:', error);
      return null;
    }
  }

  /**
   * Get exercise-level overrides
   */
  async getExerciseOverrides(programId, moduleId, sessionId, exerciseId) {
    try {
      const overridesRef = doc(firestore,
        'courses', programId,
        'modules', moduleId,
        'sessions', sessionId,
        'exercises', exerciseId,
        'overrides', 'data'
      );
      const docSnap = await getDoc(overridesRef);
      return docSnap.exists() ? docSnap.data() : null;
    } catch (error) {
      logger.error('Error fetching exercise overrides:', error);
      return null;
    }
  }

  /**
   * Get set-level overrides
   */
  async getSetOverrides(programId, moduleId, sessionId, exerciseId, setId) {
    try {
      const overridesRef = doc(firestore,
        'courses', programId,
        'modules', moduleId,
        'sessions', sessionId,
        'exercises', exerciseId,
        'sets', setId,
        'overrides', 'data'
      );
      const docSnap = await getDoc(overridesRef);
      return docSnap.exists() ? docSnap.data() : null;
    } catch (error) {
      logger.error('Error fetching set overrides:', error);
      return null;
    }
  }

  // Client Program Methods
  /**
   * Get planned session for a client on a specific date (from client_sessions)
   * @param {string} userId - Client user ID
   * @param {string} courseId - Program/course ID
   * @param {Date} date - Date to check
   * @returns {Promise<Object|null>} Client session doc or null
   */
  async getPlannedSessionForDate(userId, courseId, date) {
    try {
      const d = date instanceof Date ? date : new Date(date);
      const start = new Date(d);
      start.setHours(0, 0, 0, 0);
      const end = new Date(d);
      end.setHours(23, 59, 59, 999);
      const q = query(
        collection(firestore, 'client_sessions'),
        where('client_id', '==', userId),
        where('program_id', '==', courseId),
        where('date_timestamp', '>=', start),
        where('date_timestamp', '<=', end),
        orderBy('date_timestamp', 'asc'),
        limit(1)
      );
      const snap = await getDocs(q);
      if (snap.empty) return null;
      return { id: snap.docs[0].id, ...snap.docs[0].data() };
    } catch (error) {
      logger.debug('getPlannedSessionForDate:', error?.message);
      return null;
    }
  }

  /**
   * Resolve session content for a planned session.
   * Tries client_session_content (client-specific copy) first; then plan or library.
   * @param {Object} clientSession - client_sessions doc (must have id for copy lookup)
   * @param {string} creatorId - Creator ID (for library resolution)
   * @returns {Promise<Object|null>} Session with exercises (and sets per exercise) or null
   */
  async resolvePlannedSessionContent(clientSession, creatorId) {
    try {
      const clientSessionId = clientSession?.id;
      if (clientSessionId) {
        const copy = await this.getClientSessionContentCopy(clientSessionId);
        if (copy) return copy;
      }

      const { plan_id, session_id, module_id, library_session_ref, program_id } = clientSession;
      if (plan_id && session_id && module_id) {
        return this._resolvePlannedSessionFromPlan(plan_id, module_id, session_id, creatorId);
      }
      if (library_session_ref && session_id) {
        let effectiveCreatorId = creatorId;
        // Fallback: fetch creator_id from course if missing (defensive for orphaned/legacy data)
        if (!effectiveCreatorId && program_id) {
          try {
            const courseDoc = await getDoc(doc(firestore, 'courses', program_id));
            effectiveCreatorId = courseDoc.data()?.creator_id || courseDoc.data()?.creatorId || null;
          } catch (_) {
            /* ignore */
          }
        }
        if (effectiveCreatorId) {
          return this._resolvePlannedSessionFromLibrary(effectiveCreatorId, session_id);
        }
        logger.warn('resolvePlannedSessionContent: library_session_ref but no creator_id (course may be missing creator_id)');
      }
      return null;
    } catch (error) {
      logger.error('resolvePlannedSessionContent:', error);
      return null;
    }
  }

  /**
   * Get client session content copy (client_session_content collection).
   * Returns session with exercises and sets, or null if no copy exists.
   */
  async getClientSessionContentCopy(clientSessionId) {
    try {
      const sessionRef = doc(firestore, 'client_session_content', clientSessionId);
      const sessionSnap = await getDoc(sessionRef);
      if (!sessionSnap.exists()) return null;

      const sessionData = { id: sessionSnap.id, ...sessionSnap.data() };
      const exercisesRef = collection(firestore, 'client_session_content', clientSessionId, 'exercises');
      const exercisesSnap = await getDocs(query(exercisesRef, orderBy('order', 'asc')));

      const exercises = await Promise.all(
        exercisesSnap.docs.map(async (exDoc) => {
          const exData = { id: exDoc.id, ...exDoc.data() };
          const setsRef = collection(
            firestore,
            'client_session_content',
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
      logger.debug('getClientSessionContentCopy:', error?.message);
      return null;
    }
  }

  /**
   * Get client plan content copy (client_plan_content collection) for one week.
   * Returns one module with sessions (each with exercises and sets), or null if no copy exists.
   */
  async getClientPlanContentCopy(userId, programId, weekKey) {
    try {
      const docId = `${userId}_${programId}_${weekKey}`;
      const ref = doc(firestore, 'client_plan_content', docId);
      const snap = await getDoc(ref);
      if (!snap.exists()) return null;

      const data = { id: snap.id, ...snap.data() };
      const sessionsRef = collection(firestore, 'client_plan_content', docId, 'sessions');
      const sessionsSnap = await getDocs(query(sessionsRef, orderBy('order', 'asc')));
      const sessions = await Promise.all(
        sessionsSnap.docs.map(async (sDoc) => {
          const s = { id: sDoc.id, ...sDoc.data() };
          const exRef = collection(
            firestore,
            'client_plan_content',
            docId,
            'sessions',
            sDoc.id,
            'exercises'
          );
          const exSnap = await getDocs(query(exRef, orderBy('order', 'asc')));
          s.exercises = await Promise.all(
            exSnap.docs.map(async (eDoc) => {
              const e = { id: eDoc.id, ...eDoc.data() };
              const setsRef = collection(
                firestore,
                'client_plan_content',
                docId,
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
      logger.debug('getClientPlanContentCopy:', error?.message);
      return null;
    }
  }

  async _resolvePlannedSessionFromPlan(plan_id, module_id, session_id, creatorId = null) {
    const sessionRef = doc(firestore, 'plans', plan_id, 'modules', module_id, 'sessions', session_id);
    const sessionDoc = await getDoc(sessionRef);
    if (!sessionDoc.exists()) return null;
    const sessionData = { id: sessionDoc.id, ...sessionDoc.data() };
    if (sessionData.librarySessionRef && creatorId) {
      return this._resolvePlannedSessionFromLibrary(creatorId, sessionData.librarySessionRef);
    }
    const exercisesSnap = await getDocs(
      query(
        collection(firestore, 'plans', plan_id, 'modules', module_id, 'sessions', session_id, 'exercises'),
        orderBy('order', 'asc')
      )
    );
    const exercises = await Promise.all(
      exercisesSnap.docs.map(async (exDoc) => {
        const exData = { id: exDoc.id, ...exDoc.data() };
        try {
          const setsSnap = await getDocs(
            query(
              collection(firestore, 'plans', plan_id, 'modules', module_id, 'sessions', session_id, 'exercises', exDoc.id, 'sets'),
              orderBy('order', 'asc')
            )
          );
          exData.sets = setsSnap.docs.map((s) => ({ id: s.id, ...s.data() }));
        } catch (_) {
          exData.sets = [];
        }
        return exData;
      })
    );
    sessionData.exercises = exercises;
    return sessionData;
  }

  async _resolvePlannedSessionFromLibrary(creatorId, session_id) {
    const sessionRef = doc(firestore, 'creator_libraries', creatorId, 'sessions', session_id);
    const sessionDoc = await getDoc(sessionRef);
    if (!sessionDoc.exists()) return null;
    const sessionData = { id: sessionDoc.id, ...sessionDoc.data() };
    const exercisesSnap = await getDocs(
      query(
        collection(firestore, 'creator_libraries', creatorId, 'sessions', session_id, 'exercises'),
        orderBy('order', 'asc')
      )
    );
    const exercises = await Promise.all(
      exercisesSnap.docs.map(async (exDoc) => {
        const exData = { id: exDoc.id, ...exDoc.data() };
        try {
          const setsSnap = await getDocs(
            query(
              collection(firestore, 'creator_libraries', creatorId, 'sessions', session_id, 'exercises', exDoc.id, 'sets'),
              orderBy('order', 'asc')
            )
          );
          exData.sets = setsSnap.docs.map((s) => ({ id: s.id, ...s.data() }));
        } catch (_) {
          exData.sets = [];
        }
        return exData;
      })
    );
    sessionData.exercises = exercises;
    return sessionData;
  }

  /**
   * Get client program document
   * @param {string} userId - User ID
   * @param {string} programId - Program ID
   * @returns {Promise<Object|null>} Client program data or null
   */
  async getClientProgram(userId, programId) {
    try {
      const clientProgramId = `${userId}_${programId}`;
      const clientProgramDoc = await getDoc(doc(firestore, 'client_programs', clientProgramId));
      
      if (clientProgramDoc.exists()) {
        return {
          id: clientProgramDoc.id,
          ...clientProgramDoc.data()
        };
      }
      return null;
    } catch (error) {
      logger.error('Error getting client program:', error);
      return null;
    }
  }

  /**
   * Create or update client program
   * @param {string} userId - User ID
   * @param {string} programId - Program ID
   * @param {Object} clientProgramData - Client program data
   * @returns {Promise<string>} Client program document ID
   */
  async setClientProgram(userId, programId, clientProgramData) {
    try {
      const clientProgramId = `${userId}_${programId}`;
      await setDoc(doc(firestore, 'client_programs', clientProgramId), {
        program_id: programId,
        user_id: userId,
        ...clientProgramData,
        updated_at: serverTimestamp()
      }, { merge: true });
      return clientProgramId;
    } catch (error) {
      logger.error('Error setting client program:', error);
      throw error;
    }
  }

  /**
   * Update client program overrides at a specific path
   * @param {string} userId - User ID
   * @param {string} programId - Program ID
   * @param {string} path - Dot-separated path (e.g., 'modules.moduleId.sessions.sessionId.title')
   * @param {*} value - Value to set (null to delete)
   */
  async updateClientProgramOverride(userId, programId, path, value) {
    try {
      const clientProgramId = `${userId}_${programId}`;
      const clientProgramRef = doc(firestore, 'client_programs', clientProgramId);
      
      // Build nested update object
      const pathParts = path.split('.');
      const updateData = {};
      let current = updateData;
      
      for (let i = 0; i < pathParts.length - 1; i++) {
        current[pathParts[i]] = {};
        current = current[pathParts[i]];
      }
      
      current[pathParts[pathParts.length - 1]] = value;
      
      await updateDoc(clientProgramRef, {
        ...updateData,
        updated_at: serverTimestamp()
      });
    } catch (error) {
      logger.error('Error updating client program override:', error);
      throw error;
    }
  }

  /**
   * Delete client program
   * @param {string} userId - User ID
   * @param {string} programId - Program ID
   */
  async deleteClientProgram(userId, programId) {
    try {
      const clientProgramId = `${userId}_${programId}`;
      await deleteDoc(doc(firestore, 'client_programs', clientProgramId));
    } catch (error) {
      logger.error('Error deleting client program:', error);
      throw error;
    }
  }

  // Simple course management in user document (simplified)
  async addCourseToUser(userId, courseId, expirationDate, accessDuration, courseDetails) {
    try {
      const userRef = doc(firestore, 'users', userId);
      const userDoc = await getDoc(userRef);
      
      if (userDoc.exists()) {
        const userData = userDoc.data();
        const courses = userData.courses || {};
        
        // Store course entry (simplified - minimal fields)
        courses[courseId] = {
          // Access control
          access_duration: accessDuration,
          expires_at: expirationDate,
          status: 'active',
          purchased_at: new Date().toISOString(),
          deliveryType: courseDetails?.deliveryType ?? 'low_ticket', // PWA: one_on_one vs low_ticket load path
          // Minimal cached data for display
          title: courseDetails?.title || 'Untitled Course',
          image_url: courseDetails?.image_url || null,
          discipline: courseDetails?.discipline || 'General',
          creatorName: courseDetails?.creatorName || courseDetails?.creator_name || 'Unknown Creator',
          
          // Tutorial completion tracking
          completedTutorials: {
            dailyWorkout: [],
            warmup: [],
            workoutExecution: [],
            workoutCompletion: []
          }
        };
        
        logger.debug('💾 Storing course in user document:', courses[courseId]);
        
        await updateDoc(userRef, {
          courses: courses,
          // Keep legacy field for compatibility
          purchased_courses: [...new Set([...(userData.purchased_courses || []), courseId])]
        });
        
        logger.debug('✅ Course added to user document successfully');
      }
    } catch (error) {
      logger.error('❌ Error in addCourseToUser:', error);
      throw error;
    }
  }

  /**
   * Start a free trial for a course by assigning it locally to the user
   * @param {string} userId - User ID
   * @param {string} courseId - Course ID
   * @param {Object} courseDetails - Course metadata
   * @param {number} durationInDays - Trial duration in days
   * @returns {Promise<Object>} Result of the assignment
   */
  async startTrialForCourse(userId, courseId, courseDetails, durationInDays) {
    try {
      if (!durationInDays || durationInDays <= 0) {
        return {
          success: false,
          error: 'Duración de prueba inválida',
          code: 'INVALID_TRIAL_DURATION',
        };
      }

      const userRef = doc(firestore, 'users', userId);
      const userDoc = await getDoc(userRef);

      if (!userDoc.exists()) {
        return {
          success: false,
          error: 'Usuario no encontrado',
          code: 'USER_NOT_FOUND',
        };
      }

      const now = new Date();
      const expirationDate = new Date(now.getTime() + durationInDays * 24 * 60 * 60 * 1000);

      const userData = userDoc.data();
      const courses = { ...(userData.courses || {}) };
      const trialHistory = { ...(userData.free_trial_history || {}) };

      if (trialHistory[courseId]?.consumed) {
        return {
          success: false,
          error: 'Ya usaste la prueba gratuita de este programa',
          code: 'TRIAL_ALREADY_CONSUMED',
        };
      }

      const existingCourse = courses[courseId];
      if (existingCourse?.is_trial) {
        const existingExpiration = existingCourse.trial_expires_at || existingCourse.expires_at;
        if (existingExpiration && new Date(existingExpiration) > now) {
          return {
            success: false,
            error: 'Ya tienes una prueba activa para este programa',
            code: 'TRIAL_ALREADY_ACTIVE',
          };
        }
      }

      const displayCreator =
        courseDetails?.creatorName ||
        courseDetails?.creator_name ||
        existingCourse?.creatorName ||
        existingCourse?.creator_name ||
        'Unknown Creator';

      courses[courseId] = {
        ...existingCourse,
        access_duration: `${durationInDays}_days_trial`,
        expires_at: expirationDate.toISOString(),
        trial_expires_at: expirationDate.toISOString(),
        trial_started_at: now.toISOString(),
        status: 'active',
        is_trial: true,
        trial_duration_days: durationInDays,
        trial_state: 'active',
        purchased_at: existingCourse?.purchased_at || now.toISOString(),
        deliveryType: courseDetails?.deliveryType ?? existingCourse?.deliveryType ?? 'low_ticket',
        title: courseDetails?.title || existingCourse?.title || 'Untitled Course',
        image_url: courseDetails?.image_url || existingCourse?.image_url || null,
        discipline: courseDetails?.discipline || existingCourse?.discipline || 'General',
        creatorName: displayCreator,
        completedTutorials: existingCourse?.completedTutorials || {
          dailyWorkout: [],
          warmup: [],
          workoutExecution: [],
          workoutCompletion: [],
        },
      };

      trialHistory[courseId] = {
        consumed: true,
        last_started_at: now.toISOString(),
        last_expires_at: expirationDate.toISOString(),
      };

      await updateDoc(userRef, {
        courses,
        free_trial_history: trialHistory,
      });

      return {
        success: true,
        expirationDate: expirationDate.toISOString(),
      };
    } catch (error) {
      logger.error('❌ Error starting trial for course:', error);
      return {
        success: false,
        error: error.message || 'Error al iniciar la prueba gratuita',
        code: 'TRIAL_ERROR',
      };
    }
  }

  /**
   * Get orphaned one-on-one programs (client_programs without users.courses entry)
   * @param {string} userId - User ID
   * @param {Set} courseIdsFromUser - Set of course IDs already in users.courses
   * @returns {Promise<Array>} Array of course entries in getUserPurchasedCourses format
   */
  async getOrphanedOneOnOnePrograms(userId, courseIdsFromUser = new Set()) {
    const orphaned = [];
    try {
      const clientProgramsQuery = query(
        collection(firestore, 'client_programs'),
        where('user_id', '==', userId)
      );
      const clientProgramsSnap = await getDocs(clientProgramsQuery);
      for (const docSnap of clientProgramsSnap.docs) {
        const data = docSnap.data();
        const programId = data.program_id;
        if (!programId || courseIdsFromUser.has(programId)) continue;
        const courseDoc = await getDoc(doc(firestore, 'courses', programId));
        if (!courseDoc.exists()) continue;
        const courseData = courseDoc.data();
        const farFuture = new Date();
        farFuture.setFullYear(farFuture.getFullYear() + 10);
        orphaned.push({
          id: `${userId}-${programId}`,
          courseId: programId,
          courseData: {
            access_duration: 'one_on_one',
            expires_at: farFuture.toISOString(),
            status: 'active',
            purchased_at: new Date().toISOString(),
            deliveryType: 'one_on_one',
            title: courseData.title || 'Untitled Program',
            image_url: courseData.image_url || null,
            discipline: courseData.discipline || 'General',
            creatorName: courseData.creatorName || courseData.creator_name || 'Unknown Creator',
          },
          courseDetails: {
            id: programId,
            title: courseData.title || 'Curso sin título',
            image_url: courseData.image_url || '',
            discipline: courseData.discipline || 'General',
            creatorName: courseData.creatorName || courseData.creator_name || null,
          },
          isActive: true,
          isExpired: false,
          isCompleted: false,
          status: 'active',
          paid_at: { toDate: () => new Date() },
          expires_at: farFuture.toISOString(),
        });
        // Backfill users.courses in background
        this.backfillOneOnOneCourseInUserDocument(userId, programId, courseData).catch(() => {});
      }
    } catch (err) {
      logger.warn('getOrphanedOneOnOnePrograms:', err?.message);
    }
    return orphaned;
  }

  /**
   * Backfill users.courses with one-on-one program (repair for orphaned client_programs)
   * @param {string} userId - User ID
   * @param {string} programId - Program ID
   * @param {Object} courseData - Course metadata from courses collection
   */
  async backfillOneOnOneCourseInUserDocument(userId, programId, courseData) {
    try {
      const userRef = doc(firestore, 'users', userId);
      const userDoc = await getDoc(userRef);
      if (!userDoc.exists()) return;
      const userData = userDoc.data();
      const courses = userData.courses || {};
      if (courses[programId]) return; // Already present
      const farFuture = new Date();
      farFuture.setFullYear(farFuture.getFullYear() + 10);
      courses[programId] = {
        access_duration: 'one_on_one',
        expires_at: farFuture.toISOString(),
        status: 'active',
        purchased_at: new Date().toISOString(),
        deliveryType: 'one_on_one',
        assigned_at: new Date().toISOString(),
        title: courseData.title || 'Untitled Program',
        image_url: courseData.image_url || null,
        discipline: courseData.discipline || 'General',
        creatorName: courseData.creatorName || courseData.creator_name || 'Unknown Creator',
        completedTutorials: {
          dailyWorkout: [],
          warmup: [],
          workoutExecution: [],
          workoutCompletion: [],
        },
      };
      await updateDoc(userRef, { courses });
      logger.debug('✅ Backfilled one-on-one course in users.courses:', programId);
    } catch (err) {
      logger.error('❌ Error backfilling one-on-one course:', err);
      throw err;
    }
  }

  async removeCourseFromUser(userId, courseId) {
    try {
      logger.debug('🗑️ Removing course from user:', userId, courseId);
      
      const userRef = doc(firestore, 'users', userId);
      const userDoc = await getDoc(userRef);
      
      if (!userDoc.exists()) {
        throw new Error('User document not found');
      }
      
      const userData = userDoc.data();
      const courses = userData.courses || {};
      
      // Remove the course from the courses object
      delete courses[courseId];
      
      // Update the user document
      await updateDoc(userRef, {
        courses: courses
      });
      
      logger.debug('✅ Course removed from user:', courseId);
    } catch (error) {
      logger.error('❌ Error removing course from user:', error);
      throw error;
    }
  }

  async getUserActiveCourses(userId) {
    try {
      logger.debug('🔍 Getting user courses:', userId);
      
      // Add timeout to prevent hanging (10 seconds)
      let timeoutId;
      const userDocPromise = getDoc(doc(firestore, 'users', userId));
      const timeoutPromise = new Promise((_, reject) => {
        timeoutId = setTimeout(() => {
          reject(new Error('Firestore query timeout - please check your internet connection'));
        }, 10000);
      });
      
      let userDoc;
      try {
        userDoc = await Promise.race([userDocPromise, timeoutPromise]);
        if (timeoutId) clearTimeout(timeoutId);
      } catch (error) {
        if (timeoutId) clearTimeout(timeoutId);
        logger.error('❌ Firestore query error:', error);
        throw error;
      }
      
      if (!userDoc.exists()) {
        logger.debug('⚠️ User document does not exist');
        return [];
      }

      const userData = userDoc.data();
      const userCourses = userData.courses || {};
      const now = new Date();
      const trialHistory = userData.free_trial_history || {};
      
      // Filter active courses and return with embedded course data (no additional queries!)
      logger.debug('🔍 Filtering courses from user document...');
      logger.debug('📊 Total courses in user document:', Object.keys(userCourses).length);
      
      const activeCourses = Object.entries(userCourses)
        .filter(([courseId, courseData]) => {
          const isActive = courseData.status === 'active';
          const expiresAt = courseData.expires_at ? new Date(courseData.expires_at) : null;
          const isNotExpired = !expiresAt || expiresAt > now;
          const isTrial = courseData.is_trial === true;
          
          logger.debug(`📋 Course ${courseId}:`, {
            status: courseData.status,
            expires_at: courseData.expires_at,
            isActive,
            isNotExpired,
            isTrial,
            willInclude: (isActive && isNotExpired) || isTrial
          });
          
          if (isTrial) {
            return true;
          }

          return isActive && isNotExpired;
        })
        .map(([courseId, courseData]) => {
          const isTrial = courseData.is_trial === true;
          const trialEntry = trialHistory[courseId];
          const trialExpiresAt = courseData.trial_expires_at ||
            trialEntry?.last_expires_at ||
            courseData.expires_at;
          const trialState = isTrial
            ? (trialExpiresAt && new Date(trialExpiresAt) > now ? 'active' : 'expired')
            : null;

          logger.debug(`✅ Including course ${courseId} in active list`);
          return {
            courseId,
            courseData,
            purchasedAt: courseData.purchased_at || null,
            // Use embedded course data (already in user document!)
            courseDetails: {
              id: courseId,
              title: courseData.title || 'Curso sin título',
              image_url: courseData.image_url || '',
              discipline: courseData.discipline || 'General', 
              difficulty: courseData.difficulty || 'Intermedio',
              duration: courseData.duration || 'No especificada',
              description: courseData.description || 'Descripción no disponible',
              creatorName: courseData.creatorName || courseData.creator_name || null
            },
            trialInfo: isTrial ? {
              state: trialState,
              expiresAt: trialExpiresAt || null,
            } : null,
            trialHistory: trialEntry || null,
            isTrialCourse: isTrial,
          };
        });

      // FIX: Merge orphaned one-on-one programs from client_programs (legacy/partial assignment)
      const courseIdsFromUser = new Set(Object.keys(userCourses));
      try {
        const orphaned = await this.getOrphanedOneOnOnePrograms(userId, courseIdsFromUser);
        for (const entry of orphaned) {
          activeCourses.push({
            courseId: entry.courseId,
            courseData: entry.courseData,
            purchasedAt: entry.courseData.purchased_at || null,
            courseDetails: entry.courseDetails,
            trialInfo: null,
            trialHistory: null,
            isTrialCourse: false,
          });
        }
      } catch (err) {
        logger.warn('⚠️ Error fetching client_programs for fallback:', err?.message);
      }
      
      logger.debug('✅ Active courses (including fallback):', activeCourses.length);
      return activeCourses;
    } catch (error) {
      logger.error('Error getting user active courses:', error);
      return [];
    }
  }

  // Simple method to update course status (for subscription management)
  async updateCourseStatus(userId, courseId, status, newExpirationDate = null) {
    try {
      const userRef = doc(firestore, 'users', userId);
      const userDoc = await getDoc(userRef);
      
      if (userDoc.exists()) {
        const userData = userDoc.data();
        const courses = userData.courses || {};
        
        if (courses[courseId]) {
          courses[courseId].status = status;
          
          // Update expiration date if provided (for subscription renewals)
          if (newExpirationDate) {
            courses[courseId].expires_at = newExpirationDate;
          }
          
          // Add timestamp for status change
          courses[courseId].status_updated_at = new Date().toISOString();
          
          // Clean up any undefined values before saving
          const cleanedCourses = {};
          Object.keys(courses).forEach(key => {
            const course = courses[key];
            cleanedCourses[key] = {};
            Object.keys(course).forEach(field => {
              if (course[field] !== undefined) {
                cleanedCourses[key][field] = course[field];
              }
            });
          });
          
          await updateDoc(userRef, { courses: cleanedCourses });
          
          logger.debug(`✅ Updated course ${courseId} status to ${status}`);
          return true;
        }
      }
      return false;
    } catch (error) {
      logger.error('Error updating course status:', error);
      return false;
    }
  }

  // Simple method to extend subscription
  async extendCourseSubscription(userId, courseId, newExpirationDate) {
    try {
      return await this.updateCourseStatus(userId, courseId, 'active', newExpirationDate);
    } catch (error) {
      logger.error('Error extending course subscription:', error);
      return false;
    }
  }

  // Simple method to cancel subscription
  async cancelCourseSubscription(userId, courseId) {
    try {
      return await this.updateCourseStatus(userId, courseId, 'cancelled');
    } catch (error) {
      logger.error('Error cancelling course subscription:', error);
      return false;
    }
  }

  // Courses collection operations (with role-based filtering)
  async getCourses(userId = null) {
    try {
      logger.debug('🔍 Getting courses for user:', userId);
      
      // Get user role if userId provided
      let userRole = 'user'; // Default
      if (userId) {
        const userDoc = await getDoc(doc(firestore, 'users', userId));
        userRole = userDoc.data()?.role || 'user';
        logger.debug('👤 User role:', userRole);
      }
      
      // Get all courses (no server-side filtering)
      const coursesSnapshot = await getDocs(collection(firestore, 'courses'));
      const allCourses = coursesSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      
      logger.debug('📊 Total courses in database:', allCourses.length);
      
      // Filter based on user role (client-side)
      const filteredCourses = allCourses.filter(course => {
        const courseStatus = course.status || course.estado; // Support both field names
        logger.debug(`🔍 Filtering course: ${course.title}, status: ${courseStatus}, creator_id: ${course.creator_id}`);
        
        // Admins see everything
        if (userRole === 'admin') {
          logger.debug('  → Admin: SHOW');
          return true;
        }
        
        // Creators see published + their own
        if (userRole === 'creator') {
          const isPublished = courseStatus === 'publicado' || courseStatus === 'published';
          const isOwnCourse = course.creator_id === userId;
          logger.debug(`  → Creator: isPublished=${isPublished}, isOwnCourse=${isOwnCourse}`);
          return isPublished || isOwnCourse;
        }
        
        // Regular users see only published
        const isPublished = courseStatus === 'publicado' || courseStatus === 'published';
        const shouldShow = isPublished || !courseStatus; // Backward compatibility
        logger.debug(`  → User: shouldShow=${shouldShow}, status=${courseStatus}`);
        return shouldShow;
      });
      
      // Sort by creation date (newest first)
      const sortedCourses = filteredCourses.sort((a, b) => {
        const aDate = a.created_at?.toDate?.() || new Date(0);
        const bDate = b.created_at?.toDate?.() || new Date(0);
        return bDate - aDate;
      });
      
      logger.debug('✅ Filtered courses for role', userRole, ':', sortedCourses.length);
      return sortedCourses;
      
    } catch (error) {
      logger.error('❌ Error in getCourses:', error);
      throw error;
    }
  }

  async getCourse(courseId) {
    try {
      logger.debug('🔍 FirestoreService: Getting course with ID:', courseId);
      const courseDoc = await getDoc(doc(firestore, 'courses', courseId));
      logger.debug('🔍 FirestoreService: Course document exists:', courseDoc.exists());
      
      if (courseDoc.exists()) {
        const courseData = { id: courseDoc.id, ...courseDoc.data() };
        logger.debug('✅ FirestoreService: Course data:', courseData);
        return courseData;
      } else {
        logger.debug('❌ FirestoreService: Course not found in database');
        return null;
      }
    } catch (error) {
      logger.error('❌ FirestoreService: Error getting course:', error);
      throw error;
    }
  }

  // Purchase logging operations
  async createPurchaseLog(purchaseData) {
    try {
      logger.debug('📝 Creating purchase log...', purchaseData);
      const docRef = await addDoc(collection(firestore, 'purchases'), purchaseData);
      logger.debug('✅ Purchase log created with ID:', docRef.id);
      return docRef.id;
    } catch (error) {
      logger.error('❌ Error creating purchase log:', error);
      throw error;
    }
  }

  // Progress collection operations
  async saveProgress(userId, courseId, lessonId, progressData) {
    try {
      await addDoc(collection(firestore, 'users', userId, 'progress'), {
        course_id: courseId,
        lesson_id: lessonId,
        ...progressData,
        updated_at: serverTimestamp()
      });
    } catch (error) {
      throw error;
    }
  }

  async getUserProgress(userId) {
    try {
      const progressQuery = query(
        collection(firestore, 'users', userId, 'progress'),
        orderBy('updated_at', 'desc')
      );
      const progressSnapshot = await getDocs(progressQuery);
      
      return progressSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
    } catch (error) {
      throw error;
    }
  }

  // Community collection operations
  async getCommunityPosts() {
    try {
      const postsQuery = query(
        collection(firestore, 'community'),
        orderBy('created_at', 'desc'),
        limit(20)
      );
      const postsSnapshot = await getDocs(postsQuery);
      
      return postsSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
    } catch (error) {
      throw error;
    }
  }

  async createCommunityPost(userId, postData) {
    try {
      await addDoc(collection(firestore, 'community'), {
        user_id: userId,
        ...postData,
        created_at: serverTimestamp(),
        likes_count: 0
      });
    } catch (error) {
      throw error;
    }
  }

  // Version System Methods
  /**
   * Update user course version status
   */
  async updateUserCourseVersionStatus(userId, courseId, statusData) {
    try {
      logger.debug('🔄 Updating user course version status:', userId, courseId, statusData);
      
      // Build update object conditionally to avoid undefined values
      const updateData = {
        [`courses.${courseId}.update_status`]: statusData.update_status,
        [`courses.${courseId}.last_version_check`]: serverTimestamp()
      };
      
      // Only include downloaded_version if it's provided
      if (statusData.downloaded_version !== undefined) {
        updateData[`courses.${courseId}.downloaded_version`] = statusData.downloaded_version;
      }
      
      // Only include lastUpdated if it's provided
      if (statusData.lastUpdated !== undefined) {
        updateData[`courses.${courseId}.lastUpdated`] = statusData.lastUpdated;
      }
      
      await updateDoc(doc(firestore, 'users', userId), updateData);
      logger.debug('✅ User course version status updated');
    } catch (error) {
      logger.error('❌ Error updating user course version status:', error);
      throw error;
    }
  }

  /**
   * Get user course version info
   */
  async getUserCourseVersion(userId, courseId) {
    try {
      logger.debug('🔍 Getting user course version:', userId, courseId);
      const userDoc = await getDoc(doc(firestore, 'users', userId));
      if (userDoc.exists()) {
        const userData = userDoc.data();
        const courseData = userData.courses?.[courseId] || null;
        logger.debug('✅ User course version data:', courseData);
        return courseData;
      }
      logger.debug('❌ User document not found');
      return null;
    } catch (error) {
      logger.error('❌ Error getting user course version:', error);
      throw error;
    }
  }

  /**
   * Save account deletion feedback before deletion
   */
  async saveAccountDeletionFeedback(userId, feedback) {
    try {
      logger.debug('💬 Saving account deletion feedback for user:', userId);
      
      const feedbackData = {
        userId: userId,
        feedback: feedback,
        timestamp: serverTimestamp(),
        deleted: false, // Will be updated when account is actually deleted
      };

      // Save to a separate collection that won't be deleted
      await addDoc(collection(firestore, 'account_deletion_feedback'), feedbackData);
      
      logger.debug('✅ Account deletion feedback saved');
      return true;
    } catch (error) {
      logger.error('❌ Error saving account deletion feedback:', error);
      throw error;
    }
  }

  /**
   * Delete all user data from Firestore (except purchases as per requirements)
   */
  async deleteAllUserData(userId) {
    try {
      logger.debug('🗑️ Starting deletion of all user data for:', userId);

      // Delete subcollections
      await this.deleteSubcollection(userId, 'exerciseHistory');
      await this.deleteSubcollection(userId, 'sessionHistory');

      // Delete user_progress documents (documents starting with userId_)
      await this.deleteUserProgressDocuments(userId);

      // Delete completed_sessions documents (documents starting with userId_)
      await this.deleteCompletedSessionsDocuments(userId);

      // Delete main user document
      const userRef = doc(firestore, 'users', userId);
      await deleteDoc(userRef);
      logger.debug('✅ User document deleted');

      logger.debug('✅ All user data deleted successfully');
    } catch (error) {
      logger.error('❌ Error deleting user data:', error);
      throw error;
    }
  }

  /**
   * Helper: Delete a subcollection
   */
  async deleteSubcollection(userId, subcollectionName) {
    try {
      const subcollectionRef = collection(firestore, 'users', userId, subcollectionName);
      const snapshot = await getDocs(subcollectionRef);
      
      if (snapshot.empty) {
        logger.debug(`✅ ${subcollectionName} subcollection is empty`);
        return;
      }

      // Firestore batch limit is 500 operations
      const batchSize = 500;
      const docs = snapshot.docs;
      
      for (let i = 0; i < docs.length; i += batchSize) {
        const batch = writeBatch(firestore);
        const batchDocs = docs.slice(i, i + batchSize);
        
        batchDocs.forEach((docSnapshot) => {
          batch.delete(docSnapshot.ref);
        });
        
        await batch.commit();
        logger.debug(`✅ Deleted ${batchDocs.length} documents from ${subcollectionName} (batch ${Math.floor(i / batchSize) + 1})`);
      }

      logger.debug(`✅ ${subcollectionName} subcollection deleted (${docs.length} documents)`);
    } catch (error) {
      logger.error(`❌ Error deleting ${subcollectionName} subcollection:`, error);
      throw error;
    }
  }

  /**
   * Helper: Delete user_progress documents
   */
  async deleteUserProgressDocuments(userId) {
    try {
      const userProgressRef = collection(firestore, 'user_progress');
      
      // Fetch all user_progress docs and filter client-side
      // Note: For large collections, consider adding a userId field to documents for better querying
      const snapshot = await getDocs(userProgressRef);
      const userDocs = snapshot.docs.filter(doc => 
        doc.id.startsWith(userId + '_') || doc.id === userId
      );

      if (userDocs.length === 0) {
        logger.debug('✅ No user_progress documents to delete');
        return;
      }

      // Batch delete
      const batchSize = 500;
      for (let i = 0; i < userDocs.length; i += batchSize) {
        const batch = writeBatch(firestore);
        const batchDocs = userDocs.slice(i, i + batchSize);
        
        batchDocs.forEach((docSnapshot) => {
          batch.delete(docSnapshot.ref);
        });
        
        await batch.commit();
        logger.debug(`✅ Deleted ${batchDocs.length} user_progress documents (batch ${Math.floor(i / batchSize) + 1})`);
      }

      logger.debug(`✅ user_progress documents deleted (${userDocs.length} documents)`);
    } catch (error) {
      logger.error('❌ Error deleting user_progress documents:', error);
      throw error;
    }
  }

  /**
   * Helper: Delete completed_sessions documents
   */
  async deleteCompletedSessionsDocuments(userId) {
    try {
      const completedSessionsRef = collection(firestore, 'completed_sessions');
      const snapshot = await getDocs(completedSessionsRef);
      
      // Filter documents that start with userId_ or have userId in data
      const userDocs = snapshot.docs.filter(doc => {
        const docId = doc.id;
        const docData = doc.data();
        return docId.startsWith(userId + '_') || docData.userId === userId;
      });

      if (userDocs.length === 0) {
        logger.debug('✅ No completed_sessions documents to delete');
        return;
      }

      // Batch delete
      const batchSize = 500;
      for (let i = 0; i < userDocs.length; i += batchSize) {
        const batch = writeBatch(firestore);
        const batchDocs = userDocs.slice(i, i + batchSize);
        
        batchDocs.forEach((docSnapshot) => {
          batch.delete(docSnapshot.ref);
        });
        
        await batch.commit();
        logger.debug(`✅ Deleted ${batchDocs.length} completed_sessions documents (batch ${Math.floor(i / batchSize) + 1})`);
      }

      logger.debug(`✅ completed_sessions documents deleted (${userDocs.length} documents)`);
    } catch (error) {
      logger.error('❌ Error deleting completed_sessions documents:', error);
      throw error;
    }
  }
}

export default new FirestoreService();

// Named helper to match existing imports in the app
export const createUserDocument = async (userId, userData) => {
  try {
    await setDoc(doc(firestore, 'users', userId), {
      ...userData,
      role: userData.role || 'user',        // Default to 'user' if not specified
      created_at: serverTimestamp(),
    });
  } catch (error) {
    throw error;
  }
};
