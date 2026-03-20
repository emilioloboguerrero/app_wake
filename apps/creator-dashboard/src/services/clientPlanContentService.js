import apiClient from '../utils/apiClient';

const BASE = (clientId, weekKey) => `/creator/clients/${clientId}/plan-content/${weekKey}`;

// Simple mutex to prevent concurrent read-modify-write operations
const mutexes = new Map();
async function withMutex(key, fn) {
  while (mutexes.get(key)) {
    await mutexes.get(key);
  }
  let resolve;
  const promise = new Promise((r) => { resolve = r; });
  mutexes.set(key, promise);
  try {
    return await fn();
  } finally {
    mutexes.delete(key);
    resolve();
  }
}

class ClientPlanContentService {
  async getClientPlanContent(clientId, programId, weekKey) {
    try {
      const res = await apiClient.get(BASE(clientId, weekKey), { params: { programId } });
      return res.data ?? null;
    } catch (error) {
      if (error?.status === 404) return null;
      console.error('[clientPlanContentService] getClientPlanContent:', error);
      throw error;
    }
  }

  async copyFromPlan(clientId, programId, weekKey, planId, moduleId, creatorId = null) {
    const plansService = (await import('./plansService')).default;
    let sessions;
    try {
      sessions = await plansService.getSessionsByModule(planId, moduleId);
    } catch (err) {
      console.error('[clientPlanContentService] copyFromPlan: failed to fetch sessions', err);
      throw new Error('No se pudieron obtener las sesiones del plan');
    }
    const sessionsWithExercises = await Promise.all(
      sessions.map(async (session) => {
        try {
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
                  title: session.title ?? libSession.title ?? null,
                };
                if (libSession?.exercises?.length) {
                  return {
                    ...mergedSession,
                    exercises: (libSession.exercises || []).map((ex) => ({ ...ex, sets: ex.sets || [] })),
                  };
                }
              }
            } catch (err) {
              console.error('[clientPlanContentService] copyFromPlan: could not resolve library session', librarySessionRef, err);
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
        } catch (err) {
          console.error('[clientPlanContentService] copyFromPlan: failed to fetch data for session', session.id, err);
          return { ...session, exercises: [] };
        }
      })
    );

    await apiClient.put(BASE(clientId, weekKey), {
      programId,
      source_plan_id: planId,
      source_module_id: moduleId,
      sessions: sessionsWithExercises,
    });
  }

  async getClientPlanSessionContent(clientId, programId, weekKey, sessionId) {
    const content = await this.getClientPlanContent(clientId, programId, weekKey);
    if (!content?.sessions) return null;
    const session = content.sessions.find((s) => s.id === sessionId);
    if (!session) return null;
    return { session, exercises: session.exercises || [] };
  }

  async updateSession(clientId, programId, weekKey, sessionId, updates) {
    await apiClient.patch(
      `${BASE(clientId, weekKey)}/sessions/${sessionId}`,
      updates,
      { params: { programId } }
    );
  }

  async getExercisesBySession(clientId, programId, weekKey, sessionId) {
    const content = await this.getClientPlanContent(clientId, programId, weekKey);
    if (!content?.sessions) return [];
    const session = content.sessions.find((s) => s.id === sessionId);
    return session?.exercises ?? [];
  }

  async updateExercise(clientId, programId, weekKey, sessionId, exerciseId, updates) {
    return withMutex(`plan:${clientId}:${weekKey}`, async () => {
      const content = await this.getClientPlanContent(clientId, programId, weekKey);
      if (!content) throw new Error('Week content not found');
      const sessions = (content.sessions ?? []).map((s) => {
        if (s.id !== sessionId) return s;
        const exercises = (s.exercises ?? []).map((e) =>
          e.id === exerciseId ? { ...e, ...updates } : e
        );
        return { ...s, exercises };
      });
      await apiClient.put(BASE(clientId, weekKey), { ...content, programId, sessions });
    });
  }

  async getSetsByExercise(clientId, programId, weekKey, sessionId, exerciseId) {
    const exercises = await this.getExercisesBySession(clientId, programId, weekKey, sessionId);
    const ex = exercises.find((e) => e.id === exerciseId);
    return ex?.sets ?? [];
  }

  async createExercise(clientId, programId, weekKey, sessionId, title, order = null) {
    return withMutex(`plan:${clientId}:${weekKey}`, async () => {
      const content = await this.getClientPlanContent(clientId, programId, weekKey);
      if (!content) throw new Error('Week content not found');
      const sessions = (content.sessions ?? []).map((s) => {
        if (s.id !== sessionId) return s;
        const existing = s.exercises ?? [];
        const orderVal = order != null ? order : existing.length;
        const titleVal = title || 'Ejercicio';
        return {
          ...s,
          exercises: [...existing, { title: titleVal, name: titleVal, order: orderVal }],
        };
      });
      await apiClient.put(BASE(clientId, weekKey), { ...content, programId, sessions });
    });
  }

  async deleteExercise(clientId, programId, weekKey, sessionId, exerciseId) {
    return withMutex(`plan:${clientId}:${weekKey}`, async () => {
      const content = await this.getClientPlanContent(clientId, programId, weekKey);
      if (!content) return;
      const sessions = (content.sessions ?? []).map((s) => {
        if (s.id !== sessionId) return s;
        return { ...s, exercises: (s.exercises ?? []).filter((e) => e.id !== exerciseId) };
      });
      await apiClient.put(BASE(clientId, weekKey), { ...content, programId, sessions });
    });
  }

  async updateSet(clientId, programId, weekKey, sessionId, exerciseId, setId, updates) {
    return withMutex(`plan:${clientId}:${weekKey}`, async () => {
      const content = await this.getClientPlanContent(clientId, programId, weekKey);
      if (!content) throw new Error('Week content not found');
      const sessions = (content.sessions ?? []).map((s) => {
        if (s.id !== sessionId) return s;
        const exercises = (s.exercises ?? []).map((e) => {
          if (e.id !== exerciseId) return e;
          return { ...e, sets: (e.sets ?? []).map((set) => (set.id === setId ? { ...set, ...updates } : set)) };
        });
        return { ...s, exercises };
      });
      await apiClient.put(BASE(clientId, weekKey), { ...content, programId, sessions });
    });
  }

  async addSetToExercise(clientId, programId, weekKey, sessionId, exerciseId, order = null) {
    return withMutex(`plan:${clientId}:${weekKey}`, async () => {
      const content = await this.getClientPlanContent(clientId, programId, weekKey);
      if (!content) throw new Error('Week content not found');
      const sessions = (content.sessions ?? []).map((s) => {
        if (s.id !== sessionId) return s;
        const exercises = (s.exercises ?? []).map((e) => {
          if (e.id !== exerciseId) return e;
          const existing = e.sets ?? [];
          const orderVal = order != null ? order : existing.length;
          return { ...e, sets: [...existing, { title: `Serie ${orderVal + 1}`, order: orderVal }] };
        });
        return { ...s, exercises };
      });
      await apiClient.put(BASE(clientId, weekKey), { ...content, programId, sessions });
    });
  }

  async deleteSet(clientId, programId, weekKey, sessionId, exerciseId, setId) {
    return withMutex(`plan:${clientId}:${weekKey}`, async () => {
      const content = await this.getClientPlanContent(clientId, programId, weekKey);
      if (!content) return;
      const sessions = (content.sessions ?? []).map((s) => {
        if (s.id !== sessionId) return s;
        const exercises = (s.exercises ?? []).map((e) => {
          if (e.id !== exerciseId) return e;
          return { ...e, sets: (e.sets ?? []).filter((set) => set.id !== setId) };
        });
        return { ...s, exercises };
      });
      await apiClient.put(BASE(clientId, weekKey), { ...content, programId, sessions });
    });
  }

  async deleteSession(clientId, programId, weekKey, sessionId) {
    return withMutex(`plan:${clientId}:${weekKey}`, async () => {
      const content = await this.getClientPlanContent(clientId, programId, weekKey);
      if (!content?.sessions) return;
      const sessions = content.sessions.filter((s) => s.id !== sessionId);
      await apiClient.put(BASE(clientId, weekKey), { ...content, programId, sessions });
    });
  }

  async ensureClientPlanContentForWeek(clientId, programId, weekKey, options = {}) {
    const existing = await this.getClientPlanContent(clientId, programId, weekKey);
    const { planId, moduleId, creatorId } = options;
    if (existing?.sessions?.length > 0) return;
    if (planId && moduleId) {
      await this.copyFromPlan(clientId, programId, weekKey, planId, moduleId, creatorId);
      return;
    }
    if (!existing) {
      await apiClient.put(BASE(clientId, weekKey), {
        programId,
        title: 'Semana personalizada',
        order: 0,
        sessions: [],
      });
    }
  }

  async addSession(clientId, programId, weekKey, sessionPayload) {
    return withMutex(`plan:${clientId}:${weekKey}`, async () => {
    const content = await this.getClientPlanContent(clientId, programId, weekKey) ?? { sessions: [] };
    const existing = content.sessions ?? [];
    const order = sessionPayload.order != null ? sessionPayload.order : existing.length;
    const newSession = {
      title: sessionPayload.title || 'Sesión',
      order,
      dayIndex: sessionPayload.dayIndex != null ? sessionPayload.dayIndex : null,
      exercises: (sessionPayload.exercises || []).map((ex, i) => ({
        title: ex.title || 'Ejercicio',
        name: ex.title || 'Ejercicio',
        order: i,
        sets: (ex.sets || []).map((s, j) => ({
          title: s.title || `Serie ${j + 1}`,
          order: j,
          ...(s.reps != null && { reps: s.reps }),
          ...(s.intensity != null && { intensity: s.intensity }),
        })),
      })),
    };
    const sessions = [...existing, newSession];
    const res = await apiClient.put(BASE(clientId, weekKey), { ...content, programId, sessions });
    return res?.data?.id;
    });
  }

  async moveSessionToWeek(clientId, programId, sourceWeekKey, targetWeekKey, sessionId, targetDayIndex, targetPlanAssignment = null) {
    const sourceContent = await this.getClientPlanContent(clientId, programId, sourceWeekKey);
    if (!sourceContent?.sessions) throw new Error('Source week not found');
    const session = sourceContent.sessions.find((s) => s.id === sessionId);
    if (!session) throw new Error('Session not found in source week');
    await this.ensureClientPlanContentForWeek(
      clientId,
      programId,
      targetWeekKey,
      targetPlanAssignment ? { planId: targetPlanAssignment.planId, moduleId: targetPlanAssignment.moduleId } : {}
    );
    const payload = {
      title: session.title || session.session_name || 'Sesión',
      dayIndex: targetDayIndex,
      exercises: (session.exercises || []).map((ex) => ({
        title: ex.title || ex.name || 'Ejercicio',
        sets: (ex.sets || []).map((s) => ({
          title: s.title,
          reps: s.reps,
          intensity: s.intensity,
        })),
      })),
    };
    await this.addSession(clientId, programId, targetWeekKey, payload);
    await this.deleteSession(clientId, programId, sourceWeekKey, sessionId);
  }

  async deleteClientPlanContent(clientId, programId, weekKey) {
    try {
      await apiClient.put(BASE(clientId, weekKey), { programId, sessions: [] });
    } catch (error) {
      if (error?.status === 404) return;
      console.error('[clientPlanContentService] deleteClientPlanContent:', error);
      throw error;
    }
  }
}

export default new ClientPlanContentService();
