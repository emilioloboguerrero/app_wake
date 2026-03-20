import apiClient from '../utils/apiClient';
import logger from '../utils/logger';

class LibraryResolutionService {
  async resolveClientProgram(userId, programId, programTemplate) {
    try {
      let clientOverrides = null;
      try {
        const result = await apiClient.get(`/workout/client-programs/${programId}`);
        if (result?.data) clientOverrides = result.data;
      } catch (error) {
        logger.warn('⚠️ Client program not found or error loading:', error);
      }

      const creatorId = programTemplate.creator_id;
      if (!creatorId) {
        logger.warn('⚠️ No creator_id in program template, skipping library resolution');
        return this.mergeProgramOverrides(programTemplate, null, clientOverrides);
      }

      const resolvedModules = await Promise.all(
        (programTemplate.modules || []).map(async (module) => {
          if (module.libraryModuleRef) {
            const libraryModule = await this.resolveLibraryModule(
              creatorId,
              module.libraryModuleRef,
              programId,
              module.id
            );
            const programModule = this.mergeModuleOverrides(libraryModule, module, null);
            const clientModuleOverrides = clientOverrides?.modules?.[module.id];
            return this.mergeModuleOverrides(programModule, null, clientModuleOverrides);
          } else {
            const clientModuleOverrides = clientOverrides?.modules?.[module.id];
            return this.mergeModuleOverrides(module, null, clientModuleOverrides);
          }
        })
      );

      return { ...programTemplate, modules: resolvedModules };
    } catch (error) {
      logger.error('❌ Error resolving client program:', error);
      throw error;
    }
  }

  mergeModuleOverrides(libraryModule, programModule, clientModule) {
    const merged = {
      ...libraryModule,
      ...programModule,
      ...clientModule
    };

    if (libraryModule?.sessions || programModule?.sessions || clientModule?.sessions) {
      const sessionMap = new Map();

      if (libraryModule?.sessions) {
        libraryModule.sessions.forEach(session => {
          sessionMap.set(session.id || session.librarySessionRef, session);
        });
      }

      if (programModule?.sessions) {
        programModule.sessions.forEach(session => {
          const existing = sessionMap.get(session.id || session.librarySessionRef);
          if (existing) {
            sessionMap.set(session.id || session.librarySessionRef, { ...existing, ...session });
          } else {
            sessionMap.set(session.id || session.librarySessionRef, session);
          }
        });
      }

      if (clientModule?.sessions) {
        Object.entries(clientModule.sessions).forEach(([sessionId, sessionOverrides]) => {
          const existing = sessionMap.get(sessionId);
          if (existing) {
            sessionMap.set(sessionId, { ...existing, ...sessionOverrides });
          }
        });
      }

      merged.sessions = Array.from(sessionMap.values());
    }

    if (clientModule?.title) merged.title = clientModule.title;
    else if (programModule?.title) merged.title = programModule.title;
    else if (libraryModule?.title) merged.title = libraryModule.title;

    return merged;
  }

  mergeProgramOverrides(programTemplate, programOverrides, clientOverrides) {
    const merged = { ...programTemplate };
    if (clientOverrides) {
      if (clientOverrides.title) merged.title = clientOverrides.title;
      if (clientOverrides.description) merged.description = clientOverrides.description;
      if (clientOverrides.image_url) merged.image_url = clientOverrides.image_url;
    }
    return merged;
  }

  async extractLibraryVersions(creatorId, modules) {
    const versions = { modules: {}, sessions: {} };
    if (!creatorId || !modules || modules.length === 0) return versions;

    try {
      const modulePromises = [];
      const sessionPromises = [];
      const seenSessions = new Set();

      for (const module of modules) {
        if (module.libraryModuleRef) {
          const ref = module.libraryModuleRef;
          modulePromises.push(
            apiClient.get(`/library/modules/${ref}`, { params: { creatorId } })
              .then(result => { if (result?.data) versions.modules[ref] = result.data.version || 0; })
              .catch(error => logger.warn('Could not fetch library module version:', error))
          );
        }

        if (module.sessions) {
          for (const session of module.sessions) {
            if (session.librarySessionRef && !seenSessions.has(session.librarySessionRef)) {
              seenSessions.add(session.librarySessionRef);
              const ref = session.librarySessionRef;
              sessionPromises.push(
                apiClient.get(`/library/sessions/${ref}`, { params: { creatorId } })
                  .then(result => { if (result?.data) versions.sessions[ref] = result.data.version || 0; })
                  .catch(error => logger.warn('Could not fetch library session version:', error))
              );
            }
          }
        }
      }

      await Promise.all([...modulePromises, ...sessionPromises]);
    } catch (error) {
      logger.error('Error extracting library versions:', error);
    }

    return versions;
  }

  async checkLibraryVersionsChanged(creatorId, storedVersions) {
    if (!storedVersions || (!storedVersions.modules && !storedVersions.sessions)) {
      return { needsUpdate: false, changedModules: [], changedSessions: [] };
    }

    const changedModules = [];
    const changedSessions = [];

    try {
      const promises = [];

      if (storedVersions.modules) {
        for (const [moduleId, storedVersion] of Object.entries(storedVersions.modules)) {
          promises.push(
            apiClient.get(`/library/modules/${moduleId}`, { params: { creatorId } })
              .then(result => {
                if (result?.data) {
                  const currentVersion = result.data.version || 0;
                  if (currentVersion !== storedVersion) {
                    changedModules.push({ moduleId, oldVersion: storedVersion, newVersion: currentVersion });
                  }
                }
              })
              .catch(error => logger.warn('Could not check library module version:', error))
          );
        }
      }

      if (storedVersions.sessions) {
        for (const [sessionId, storedVersion] of Object.entries(storedVersions.sessions)) {
          promises.push(
            apiClient.get(`/library/sessions/${sessionId}`, { params: { creatorId } })
              .then(result => {
                if (result?.data) {
                  const currentVersion = result.data.version || 0;
                  if (currentVersion !== storedVersion) {
                    changedSessions.push({ sessionId, oldVersion: storedVersion, newVersion: currentVersion });
                  }
                }
              })
              .catch(error => logger.warn('Could not check library session version:', error))
          );
        }
      }

      await Promise.all(promises);
    } catch (error) {
      logger.error('Error checking library versions:', error);
    }

    return {
      needsUpdate: changedModules.length > 0 || changedSessions.length > 0,
      changedModules,
      changedSessions
    };
  }

  async resolveLibraryModule(creatorId, libraryModuleRef, courseId, programModuleId) {
    try {
      const result = await apiClient.get(`/library/modules/${libraryModuleRef}`, { params: { creatorId } });
      const libraryData = result?.data;
      if (!libraryData) throw new Error(`Library module ${libraryModuleRef} not found`);
      return {
        id: programModuleId,
        libraryModuleRef,
        title: libraryData.title || libraryData.name || 'Untitled Module',
        description: libraryData.description || null,
        order: libraryData.order || 0,
        sessions: (libraryData.sessions || []).map((session, index) => ({
          ...session,
          order: index,
          librarySessionRef: session.id,
        }))
      };
    } catch (error) {
      logger.error('Error resolving library module:', error);
      throw error;
    }
  }

  async resolveLibrarySession(creatorId, librarySessionRef, courseId, programModuleId, programSessionId, programOverrides = null, clientOverrides = null) {
    try {
      const result = await apiClient.get(`/library/sessions/${librarySessionRef}`, { params: { creatorId } });
      const data = result?.data;
      if (!data) throw new Error(`Library session ${librarySessionRef} not found`);

      let exercises = data.exercises || [];
      if (clientOverrides?.exercises) {
        exercises = exercises.map(exercise => {
          const exerciseOverrides = clientOverrides.exercises[exercise.id];
          if (!exerciseOverrides) return exercise;
          const mergedExercise = { ...exercise, ...exerciseOverrides };
          if (exerciseOverrides.sets && exercise.sets) {
            mergedExercise.sets = exercise.sets.map(set => {
              const setOverrides = exerciseOverrides.sets[set.id];
              return setOverrides ? { ...set, ...setOverrides } : set;
            });
          }
          return mergedExercise;
        });
      }

      return {
        id: programSessionId,
        librarySessionRef,
        title: clientOverrides?.title || programOverrides?.title || data.title || data.name || 'Untitled Session',
        image_url: clientOverrides?.image_url !== undefined
          ? clientOverrides.image_url
          : (programOverrides?.image_url !== undefined ? programOverrides.image_url : data.image_url),
        description: clientOverrides?.description || programOverrides?.description || data.description,
        order: programOverrides?.order || data.order || 0,
        exercises
      };
    } catch (error) {
      const isNotFoundError = error?.message?.includes('not found');
      if (!isNotFoundError) logger.error('Error resolving library session:', error);
      throw error;
    }
  }
}

export default new LibraryResolutionService();
