// Library Resolution Service for Wake Mobile App
// Handles resolving library module and session references, and version tracking
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
   * 
   * @param {string} creatorId - The creator's user ID
   * @param {string} librarySessionRef - The library session ID
   * @param {string} courseId - The program/course ID (for potential override support)
   * @param {string} programModuleId - The program module document ID
   * @param {string} programSessionId - The program session document ID
   * @returns {Promise<Object>} Session object with resolved exercises
   */
  async resolveLibrarySession(creatorId, librarySessionRef, courseId, programModuleId, programSessionId) {
    try {
      // Fetch library session document
      const librarySessionDoc = await getDoc(
        doc(firestore, 'creator_libraries', creatorId, 'sessions', librarySessionRef)
      );

      if (!librarySessionDoc.exists()) {
        throw new Error(`Library session ${librarySessionRef} not found`);
      }

      const librarySessionData = librarySessionDoc.data();

      // Check for overrides in program session document
      let overrides = null;
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
          overrides = overridesDoc.data();
        }
      } catch (error) {
        // Overrides may not exist, that's okay
      }

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

      // Merge library session data with overrides
      const resolvedSession = {
        id: programSessionId,
        librarySessionRef: librarySessionRef,
        title: (overrides?.title || librarySessionData.title || librarySessionData.name || 'Untitled Session'),
        image_url: (overrides?.image_url !== undefined ? overrides.image_url : librarySessionData.image_url),
        order: librarySessionData.order || 0,
        exercises: exercises
      };

      return resolvedSession;
    } catch (error) {
      console.error('Error resolving library session:', error);
      throw error;
    }
  }
}

export default new LibraryResolutionService();

