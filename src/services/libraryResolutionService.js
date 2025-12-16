// Library Resolution Service for Wake Mobile App
// Handles resolving library module and session references, version tracking, and client program resolution
import { firestore } from '../config/firebase';
import { 
  doc, 
  getDoc,
  collection,
  query,
  getDocs,
  orderBy
} from 'firebase/firestore';

class LibraryResolutionService {
  /**
   * Resolve a complete client program with all overrides merged
   * Priority: Client > Program > Library
   * 
   * @param {string} userId - The user's ID
   * @param {string} programId - The program ID
   * @param {Object} programTemplate - The program template from courses/{programId}
   * @returns {Promise<Object>} Fully resolved program with all overrides merged
   */
  async resolveClientProgram(userId, programId, programTemplate) {
    try {
      console.log('🔄 Resolving client program:', { userId, programId });
      
      // Load client program overrides if exists
      const clientProgramId = `${userId}_${programId}`;
      let clientOverrides = null;
      try {
        const clientProgramDoc = await getDoc(
          doc(firestore, 'client_programs', clientProgramId)
        );
        if (clientProgramDoc.exists()) {
          clientOverrides = clientProgramDoc.data();
          console.log('✅ Client overrides found');
        }
      } catch (error) {
        console.warn('⚠️ Client program not found or error loading:', error);
      }

      const creatorId = programTemplate.creator_id;
      if (!creatorId) {
        console.warn('⚠️ No creator_id in program template, skipping library resolution');
        return this.mergeProgramOverrides(programTemplate, null, clientOverrides);
      }

      // Resolve modules with library references and overrides
      const resolvedModules = await Promise.all(
        (programTemplate.modules || []).map(async (module) => {
          // Check if module has library reference
          if (module.libraryModuleRef) {
            // Resolve from library first
            const libraryModule = await this.resolveLibraryModule(
              creatorId,
              module.libraryModuleRef,
              programId,
              module.id
            );
            
            // Merge program-level overrides
            const programModule = this.mergeModuleOverrides(libraryModule, module, null);
            
            // Merge client-level overrides
            const clientModuleOverrides = clientOverrides?.modules?.[module.id];
            return this.mergeModuleOverrides(programModule, null, clientModuleOverrides);
          } else {
            // Standalone module - still apply overrides
            const clientModuleOverrides = clientOverrides?.modules?.[module.id];
            return this.mergeModuleOverrides(module, null, clientModuleOverrides);
          }
        })
      );

      return {
        ...programTemplate,
        modules: resolvedModules
      };
    } catch (error) {
      console.error('❌ Error resolving client program:', error);
      throw error;
    }
  }

  /**
   * Merge overrides at module level
   * Priority: client > program > library
   */
  mergeModuleOverrides(libraryModule, programModule, clientModule) {
    const merged = {
      ...libraryModule,
      ...programModule,  // Program overrides library
      ...clientModule    // Client overrides program
    };

    // Merge sessions if they exist
    if (libraryModule?.sessions || programModule?.sessions || clientModule?.sessions) {
      const sessionMap = new Map();
      
      // Start with library sessions
      if (libraryModule?.sessions) {
        libraryModule.sessions.forEach(session => {
          sessionMap.set(session.id || session.librarySessionRef, session);
        });
      }
      
      // Apply program session overrides
      if (programModule?.sessions) {
        programModule.sessions.forEach(session => {
          const existing = sessionMap.get(session.id || session.librarySessionRef);
          if (existing) {
            sessionMap.set(session.id || session.librarySessionRef, {
              ...existing,
              ...session
            });
          } else {
            sessionMap.set(session.id || session.librarySessionRef, session);
          }
        });
      }
      
      // Apply client session overrides
      if (clientModule?.sessions) {
        Object.entries(clientModule.sessions).forEach(([sessionId, sessionOverrides]) => {
          const existing = sessionMap.get(sessionId);
          if (existing) {
            sessionMap.set(sessionId, {
              ...existing,
              ...sessionOverrides
            });
          }
        });
      }
      
      merged.sessions = Array.from(sessionMap.values());
    }

    // Merge title with priority
    if (clientModule?.title) merged.title = clientModule.title;
    else if (programModule?.title) merged.title = programModule.title;
    else if (libraryModule?.title) merged.title = libraryModule.title;

    return merged;
  }

  /**
   * Merge program-level overrides (for backward compatibility)
   */
  mergeProgramOverrides(programTemplate, programOverrides, clientOverrides) {
    const merged = { ...programTemplate };
    
    if (clientOverrides) {
      // Merge client-level overrides at root level
      if (clientOverrides.title) merged.title = clientOverrides.title;
      if (clientOverrides.description) merged.description = clientOverrides.description;
      if (clientOverrides.image_url) merged.image_url = clientOverrides.image_url;
    }
    
    return merged;
  }
  /**
   * Extract library versions from program modules
   * Scans modules and sessions for library references and extracts their version numbers
   * 
   * @param {string} creatorId - The creator's user ID
   * @param {Array} modules - Array of module objects (may contain library references)
   * @returns {Promise<{modules: {}, sessions: {}}>} Object mapping library IDs to version numbers
   */
  async extractLibraryVersions(creatorId, modules) {
    const versions = {
      modules: {}, // { libraryModuleId: versionNumber }
      sessions: {} // { librarySessionId: versionNumber }
    };

    if (!creatorId || !modules || modules.length === 0) {
      return versions;
    }

    try {
      // Scan all modules for library references
      for (const module of modules) {
        // Check if module has library reference
        if (module.libraryModuleRef) {
          try {
            const moduleDoc = await getDoc(
              doc(firestore, 'creator_libraries', creatorId, 'modules', module.libraryModuleRef)
            );
            if (moduleDoc.exists()) {
              const version = moduleDoc.data().version || 0;
              versions.modules[module.libraryModuleRef] = version;
            }
          } catch (error) {
            console.warn('Could not fetch library module version:', error);
          }

          // Also check sessions within this library module
          if (module.sessions) {
            for (const session of module.sessions) {
              if (session.librarySessionRef) {
                try {
                  const sessionDoc = await getDoc(
                    doc(firestore, 'creator_libraries', creatorId, 'sessions', session.librarySessionRef)
                  );
                  if (sessionDoc.exists()) {
                    const version = sessionDoc.data().version || 0;
                    versions.sessions[session.librarySessionRef] = version;
                  }
                } catch (error) {
                  console.warn('Could not fetch library session version:', error);
                }
              }
            }
          }
        }

        // Also check standalone sessions for library references
        if (module.sessions) {
          for (const session of module.sessions) {
            if (session.librarySessionRef && !versions.sessions[session.librarySessionRef]) {
              try {
                const sessionDoc = await getDoc(
                  doc(firestore, 'creator_libraries', creatorId, 'sessions', session.librarySessionRef)
                );
                if (sessionDoc.exists()) {
                  const version = sessionDoc.data().version || 0;
                  versions.sessions[session.librarySessionRef] = version;
                }
              } catch (error) {
                console.warn('Could not fetch library session version:', error);
              }
            }
          }
        }
      }
    } catch (error) {
      console.error('Error extracting library versions:', error);
    }

    return versions;
  }

  /**
   * Check if library versions have changed since download
   * 
   * @param {string} creatorId - The creator's user ID
   * @param {Object} storedVersions - Versions stored when course was downloaded
   * @returns {Promise<{needsUpdate: boolean, changedModules: Array, changedSessions: Array}>}
   */
  async checkLibraryVersionsChanged(creatorId, storedVersions) {
    if (!storedVersions || (!storedVersions.modules && !storedVersions.sessions)) {
      return { needsUpdate: false, changedModules: [], changedSessions: [] };
    }

    const changedModules = [];
    const changedSessions = [];

    try {
      // Check module versions
      if (storedVersions.modules) {
        for (const [moduleId, storedVersion] of Object.entries(storedVersions.modules)) {
          try {
            const moduleDoc = await getDoc(
              doc(firestore, 'creator_libraries', creatorId, 'modules', moduleId)
            );
            if (moduleDoc.exists()) {
              const currentVersion = moduleDoc.data().version || 0;
              if (currentVersion !== storedVersion) {
                changedModules.push({ 
                  moduleId, 
                  oldVersion: storedVersion, 
                  newVersion: currentVersion 
                });
              }
            }
          } catch (error) {
            console.warn('Could not check library module version:', error);
          }
        }
      }

      // Check session versions
      if (storedVersions.sessions) {
        for (const [sessionId, storedVersion] of Object.entries(storedVersions.sessions)) {
          try {
            const sessionDoc = await getDoc(
              doc(firestore, 'creator_libraries', creatorId, 'sessions', sessionId)
            );
            if (sessionDoc.exists()) {
              const currentVersion = sessionDoc.data().version || 0;
              if (currentVersion !== storedVersion) {
                changedSessions.push({ 
                  sessionId, 
                  oldVersion: storedVersion, 
                  newVersion: currentVersion 
                });
              }
            }
          } catch (error) {
            console.warn('Could not check library session version:', error);
          }
        }
      }
    } catch (error) {
      console.error('Error checking library versions:', error);
    }

    return {
      needsUpdate: changedModules.length > 0 || changedSessions.length > 0,
      changedModules,
      changedSessions
    };
  }

  /**
   * Resolve a library module reference
   * Fetches the library module and its sessions, returns in the format expected by firestoreService
   * 
   * @param {string} creatorId - The creator's user ID
   * @param {string} libraryModuleRef - The library module ID
   * @param {string} courseId - The program/course ID (for potential override support)
   * @param {string} programModuleId - The program module document ID
   * @returns {Promise<Object>} Module object with resolved sessions
   */
  async resolveLibraryModule(creatorId, libraryModuleRef, courseId, programModuleId) {
    try {
      // Fetch library module document
      const libraryModuleDoc = await getDoc(
        doc(firestore, 'creator_libraries', creatorId, 'modules', libraryModuleRef)
      );

      if (!libraryModuleDoc.exists()) {
        throw new Error(`Library module ${libraryModuleRef} not found`);
      }

      const libraryModuleData = libraryModuleDoc.data();
      const sessionRefs = libraryModuleData.sessionRefs || [];

      // Fetch all sessions from the library module
      const sessions = await Promise.all(
        sessionRefs.map(async (sessionId, index) => {
          try {
            const sessionDoc = await getDoc(
              doc(firestore, 'creator_libraries', creatorId, 'sessions', sessionId)
            );

            if (!sessionDoc.exists()) {
              console.warn(`Library session ${sessionId} not found`);
              return null;
            }

            const sessionData = sessionDoc.data();

            // Check if program has a session document for this library session (for override support)
            let programSessionDoc = null;
            try {
              const programSessionRef = doc(
                firestore, 
                'courses', courseId, 
                'modules', programModuleId, 
                'sessions', sessionId
              );
              programSessionDoc = await getDoc(programSessionRef);
            } catch (error) {
              // Program session may not exist, that's okay
            }

            // Resolve session with exercises and sets
            const resolvedSession = await this.resolveLibrarySession(
              creatorId,
              sessionId,
              courseId,
              programModuleId,
              programSessionDoc?.id || sessionId
            );

            return {
              ...resolvedSession,
              order: index,
              librarySessionRef: sessionId
            };
          } catch (error) {
            console.error(`Error resolving library session ${sessionId}:`, error);
            return null;
          }
        })
      );

      // Return module in expected format
      return {
        id: programModuleId,
        libraryModuleRef: libraryModuleRef,
        title: libraryModuleData.title || libraryModuleData.name || 'Untitled Module',
        description: libraryModuleData.description || null,
        order: libraryModuleData.order || 0,
        sessions: sessions.filter(s => s !== null)
      };
    } catch (error) {
      console.error('Error resolving library module:', error);
      throw error;
    }
  }

  /**
   * Resolve a library session reference
   * Fetches the library session and its exercises with sets
   * Now supports client-level overrides
   * 
   * @param {string} creatorId - The creator's user ID
   * @param {string} librarySessionRef - The library session ID
   * @param {string} courseId - The program/course ID (for potential override support)
   * @param {string} programModuleId - The program module document ID
   * @param {string} programSessionId - The program session document ID
   * @param {Object} programOverrides - Program-level overrides (optional)
   * @param {Object} clientOverrides - Client-level overrides (optional)
   * @returns {Promise<Object>} Session object with resolved exercises
   */
  async resolveLibrarySession(creatorId, librarySessionRef, courseId, programModuleId, programSessionId, programOverrides = null, clientOverrides = null) {
    try {
      // Fetch library session document
      const librarySessionDoc = await getDoc(
        doc(firestore, 'creator_libraries', creatorId, 'sessions', librarySessionRef)
      );

      if (!librarySessionDoc.exists()) {
        throw new Error(`Library session ${librarySessionRef} not found`);
      }

      const librarySessionData = librarySessionDoc.data();

      // Check for program-level overrides (old system: overrides/data subcollection)
      let legacyOverrides = null;
      try {
        const overridesRef = doc(
          firestore,
          'courses', courseId,
          'modules', programModuleId,
          'sessions', programSessionId,
          'overrides', 'data'
        );
        const overridesDoc = await getDoc(overridesRef);
        if (overridesDoc.exists()) {
          legacyOverrides = overridesDoc.data();
        }
      } catch (error) {
        // Overrides may not exist, that's okay
      }

      // Merge program overrides (prefer new system over legacy)
      const effectiveProgramOverrides = programOverrides || legacyOverrides;

      // Fetch exercises from library session
      const exercisesRef = collection(
        firestore,
        'creator_libraries', creatorId,
        'sessions', librarySessionRef,
        'exercises'
      );
      const exercisesQuery = query(exercisesRef, orderBy('order', 'asc'));
      const exercisesSnapshot = await getDocs(exercisesQuery);

      // Resolve all exercises with their sets
      const exercises = await Promise.all(
        exercisesSnapshot.docs.map(async (exerciseDoc) => {
          const exerciseData = { id: exerciseDoc.id, ...exerciseDoc.data() };

          // Fetch sets from library session exercise
          try {
            const setsRef = collection(
              firestore,
              'creator_libraries', creatorId,
              'sessions', librarySessionRef,
              'exercises', exerciseDoc.id,
              'sets'
            );
            const setsQuery = query(setsRef, orderBy('order', 'asc'));
            const setsSnapshot = await getDocs(setsQuery);

            exerciseData.sets = setsSnapshot.docs.map(setDoc => ({
              id: setDoc.id,
              ...setDoc.data()
            }));
          } catch (error) {
            console.warn(`No sets found for library exercise ${exerciseDoc.id}:`, error.message);
            exerciseData.sets = [];
          }

          return exerciseData;
        })
      );

      // Merge exercises with client overrides if provided
      let resolvedExercises = exercises;
      if (clientOverrides?.exercises) {
        resolvedExercises = exercises.map(exercise => {
          const exerciseOverrides = clientOverrides.exercises[exercise.id];
          if (!exerciseOverrides) return exercise;

          // Merge exercise-level overrides
          const mergedExercise = { ...exercise, ...exerciseOverrides };

          // Merge set-level overrides
          if (exerciseOverrides.sets && exercise.sets) {
            mergedExercise.sets = exercise.sets.map(set => {
              const setOverrides = exerciseOverrides.sets[set.id];
              return setOverrides ? { ...set, ...setOverrides } : set;
            });
          }

          return mergedExercise;
        });
      }

      // Merge session-level data with priority: Client > Program > Library
      const resolvedSession = {
        id: programSessionId,
        librarySessionRef: librarySessionRef,
        title: clientOverrides?.title 
          || effectiveProgramOverrides?.title 
          || librarySessionData.title 
          || librarySessionData.name 
          || 'Untitled Session',
        image_url: clientOverrides?.image_url !== undefined 
          ? clientOverrides.image_url
          : (effectiveProgramOverrides?.image_url !== undefined 
            ? effectiveProgramOverrides.image_url 
            : librarySessionData.image_url),
        description: clientOverrides?.description 
          || effectiveProgramOverrides?.description 
          || librarySessionData.description,
        order: effectiveProgramOverrides?.order 
          || librarySessionData.order 
          || 0,
        exercises: resolvedExercises
      };

      return resolvedSession;
    } catch (error) {
      console.error('Error resolving library session:', error);
      throw error;
    }
  }
}

export default new LibraryResolutionService();


