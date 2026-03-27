import apiClient from '../utils/apiClient';

class PlansService {
  async getPlansByCreator(_creatorId) {
    const result = await apiClient.get('/creator/plans');
    return result?.data ?? [];
  }

  async getPlanById(planId) {
    const result = await apiClient.get(`/creator/plans/${planId}`);
    const plan = result?.data ?? null;
    if (!plan) return null;
    // Normalize IDs: API returns moduleId/sessionId, UI expects .id
    if (plan.modules) {
      plan.modules = plan.modules.map((m) => ({
        ...m,
        id: m.moduleId ?? m.id,
        sessions: (m.sessions ?? []).map((s) => ({
          ...s,
          id: s.sessionId ?? s.id,
        })),
      }));
    }
    return plan;
  }

  async createPlan(_creatorId, _creatorName, planData) {
    const result = await apiClient.post('/creator/plans', {
      title: planData.title || '',
      description: planData.description ?? null,
      discipline: planData.discipline ?? null,
    });
    return result?.data;
  }

  async updatePlan(planId, updates) {
    const result = await apiClient.patch(`/creator/plans/${planId}`, updates);
    return result?.data;
  }

  async deletePlan(planId) {
    await apiClient.delete(`/creator/plans/${planId}`);
  }

  async getModulesByPlan(planId) {
    const plan = await this.getPlanById(planId);
    return (plan?.modules ?? []).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  }

  async createModule(planId, title, order = null) {
    const result = await apiClient.post(`/creator/plans/${planId}/modules`, {
      title,
      order: order ?? 0,
    });
    const data = result?.data;
    if (data?.moduleId && !data.id) data.id = data.moduleId;
    return data;
  }

  async updateModule(planId, moduleId, updates) {
    const result = await apiClient.patch(`/creator/plans/${planId}/modules/${moduleId}`, updates);
    return result?.data;
  }

  async deleteModule(planId, moduleId) {
    await apiClient.delete(`/creator/plans/${planId}/modules/${moduleId}`);
  }

  async getSessionsByModule(planId, moduleId) {
    const plan = await this.getPlanById(planId);
    const module = (plan?.modules ?? []).find((m) => m.id === moduleId || m.moduleId === moduleId);
    return (module?.sessions ?? []).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  }

  async createSession(planId, moduleId, title, order = null, imageUrl = null, sourceLibrarySessionId = null, dayIndex = null) {
    const body = {
      title,
      order: order ?? 0,
    };
    if (sourceLibrarySessionId) body.source_library_session_id = sourceLibrarySessionId;
    if (dayIndex != null) body.dayIndex = dayIndex;
    if (imageUrl) body.image_url = imageUrl;
    const result = await apiClient.post(
      `/creator/plans/${planId}/modules/${moduleId}/sessions`,
      body
    );
    const data = result?.data;
    if (data?.sessionId && !data.id) data.id = data.sessionId;
    return data;
  }

  async addLibrarySessionToPlan(planId, moduleId, librarySessionId, dayIndex = null, order = null) {
    const body = {
      title: 'Sesion',
      order: order ?? 0,
      source_library_session_id: librarySessionId,
    };
    if (dayIndex != null) body.dayIndex = dayIndex;
    const result = await apiClient.post(
      `/creator/plans/${planId}/modules/${moduleId}/sessions`,
      body
    );
    const data = result?.data;
    if (data?.sessionId && !data.id) data.id = data.sessionId;
    return data;
  }

  async updateSession(planId, moduleId, sessionId, updates) {
    const result = await apiClient.patch(
      `/creator/plans/${planId}/modules/${moduleId}/sessions/${sessionId}`,
      updates
    );
    return result?.data;
  }

  async deleteSession(planId, moduleId, sessionId) {
    await apiClient.delete(`/creator/plans/${planId}/modules/${moduleId}/sessions/${sessionId}`);
  }

  async getSessionById(planId, moduleId, sessionId) {
    const result = await apiClient.get(
      `/creator/plans/${planId}/modules/${moduleId}/sessions/${sessionId}`
    );
    if (!result?.data) return null;
    return { id: result.data.sessionId, ...result.data };
  }

  async getExercisesBySession(planId, moduleId, sessionId) {
    const session = await this.getSessionById(planId, moduleId, sessionId);
    return (session?.exercises ?? []).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  }

  async createExercise(planId, moduleId, sessionId, name, order = null) {
    const result = await apiClient.post(
      `/creator/plans/${planId}/modules/${moduleId}/sessions/${sessionId}/exercises`,
      {
        name: name?.trim() || 'Ejercicio',
        primaryMuscles: [],
        order: order ?? 0,
      }
    );
    return result?.data;
  }

  async updateExercise(planId, moduleId, sessionId, exerciseId, updates) {
    const result = await apiClient.patch(
      `/creator/plans/${planId}/modules/${moduleId}/sessions/${sessionId}/exercises/${exerciseId}`,
      updates
    );
    return result?.data;
  }

  async deleteExercise(planId, moduleId, sessionId, exerciseId) {
    await apiClient.delete(
      `/creator/plans/${planId}/modules/${moduleId}/sessions/${sessionId}/exercises/${exerciseId}`
    );
  }

  async getSetsByExercise(planId, moduleId, sessionId, exerciseId) {
    const session = await this.getSessionById(planId, moduleId, sessionId);
    const exercise = (session?.exercises ?? []).find((e) => e.exerciseId === exerciseId || e.id === exerciseId);
    return (exercise?.sets ?? []).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  }

  async createSet(planId, moduleId, sessionId, exerciseId, order = null) {
    const orderVal = order ?? 0;
    const result = await apiClient.post(
      `/creator/plans/${planId}/modules/${moduleId}/sessions/${sessionId}/exercises/${exerciseId}/sets`,
      {
        title: `Serie ${orderVal + 1}`,
        order: orderVal,
      }
    );
    return result?.data;
  }

  async updateSet(planId, moduleId, sessionId, exerciseId, setId, updates) {
    const result = await apiClient.patch(
      `/creator/plans/${planId}/modules/${moduleId}/sessions/${sessionId}/exercises/${exerciseId}/sets/${setId}`,
      updates
    );
    return result?.data;
  }

  async deleteSet(planId, moduleId, sessionId, exerciseId, setId) {
    await apiClient.delete(
      `/creator/plans/${planId}/modules/${moduleId}/sessions/${sessionId}/exercises/${exerciseId}/sets/${setId}`
    );
  }

  async copyLibraryContentToPlanSession(planId, moduleId, sessionId, libSession) {
    const exercises = libSession?.exercises ?? [];
    for (let i = 0; i < exercises.length; i++) {
      const ex = exercises[i];
      const created = await this.createExercise(
        planId, moduleId, sessionId,
        ex.name || ex.title || 'Ejercicio',
        ex.order ?? i
      );
      const newExerciseId = created.exerciseId ?? created.id;

      // Copy all exercise fields except IDs and nested sets
      const exUpdates = {};
      const skipKeys = ['exerciseId', 'id', 'sets', 'name', 'order', 'created_at', 'updated_at'];
      for (const [key, value] of Object.entries(ex)) {
        if (skipKeys.includes(key) || value === undefined) continue;
        exUpdates[key] = value;
      }
      if (Object.keys(exUpdates).length > 0) {
        await this.updateExercise(planId, moduleId, sessionId, newExerciseId, exUpdates);
      }

      const sets = ex.sets ?? [];
      for (let j = 0; j < sets.length; j++) {
        const set = sets[j];
        const createdSet = await this.createSet(
          planId, moduleId, sessionId, newExerciseId, set.order ?? j
        );
        const newSetId = createdSet.setId ?? createdSet.id;

        // Copy all set fields except IDs
        const setUpdates = {};
        const skipSetKeys = ['setId', 'id', 'order', 'title', 'created_at', 'updated_at'];
        for (const [key, value] of Object.entries(set)) {
          if (skipSetKeys.includes(key) || value === undefined) continue;
          setUpdates[key] = value;
        }
        if (set.title) setUpdates.title = set.title;
        if (Object.keys(setUpdates).length > 0) {
          await this.updateSet(planId, moduleId, sessionId, newExerciseId, newSetId, setUpdates);
        }
      }
    }
  }

  async duplicateModule(planId, sourceModuleId) {
    const plan = await this.getPlanById(planId);
    const existingModules = plan?.modules ?? [];
    const sourceMod = existingModules.find((m) => m.id === sourceModuleId || m.moduleId === sourceModuleId);
    if (!sourceMod) throw new Error('Módulo no encontrado');

    const nextOrder = existingModules.length === 0
      ? 0
      : Math.max(...existingModules.map((m) => m.order ?? 0)) + 1;
    const newTitle = `Semana ${existingModules.length + 1}`;

    const newModule = await this.createModule(planId, newTitle, nextOrder);
    const newModuleId = newModule.moduleId ?? newModule.id;

    try {
      const sessions = await this.getSessionsByModule(planId, sourceModuleId);
      for (const session of sessions) {
        const sourceLibId = session.source_library_session_id ?? session.librarySessionRef ?? null;
        const createdSession = await this.createSession(
          planId,
          newModuleId,
          session.title || 'Sesion',
          session.order ?? null,
          session.image_url ?? null,
          sourceLibId,
          session.dayIndex ?? null
        );
        const newSessionId = createdSession.sessionId ?? createdSession.id;

        const sourceSession = await this.getSessionById(planId, sourceModuleId, session.sessionId ?? session.id);
        const exercises = sourceSession?.exercises ?? [];
        for (const exercise of exercises) {
          const createdEx = await this.createExercise(
            planId, newModuleId, newSessionId,
            exercise.name || 'Ejercicio',
            exercise.order ?? null
          );
          const newExerciseId = createdEx.exerciseId ?? createdEx.id;

          const exerciseUpdates = {};
          for (const [key, value] of Object.entries(exercise)) {
            if (['exerciseId', 'id', 'sets'].includes(key) || value === undefined) continue;
            exerciseUpdates[key] = value;
          }
          if (Object.keys(exerciseUpdates).length > 0) {
            await this.updateExercise(planId, newModuleId, newSessionId, newExerciseId, exerciseUpdates);
          }

          const sets = exercise.sets ?? [];
          for (let j = 0; j < sets.length; j++) {
            const set = sets[j];
            const createdSet = await this.createSet(
              planId, newModuleId, newSessionId, newExerciseId, set.order ?? j
            );
            const newSetId = createdSet.setId ?? createdSet.id;
            const setUpdates = {};
            for (const [key, value] of Object.entries(set)) {
              if (['setId', 'id'].includes(key) || value === undefined) continue;
              setUpdates[key] = value;
            }
            if (Object.keys(setUpdates).length > 0) {
              await this.updateSet(planId, newModuleId, newSessionId, newExerciseId, newSetId, setUpdates);
            }
          }
        }
      }
    } catch (error) {
      try {
        await this.deleteModule(planId, newModuleId);
      } catch (rollbackError) {
        console.error('[plansService] duplicateModule rollback failed:', rollbackError);
      }
      throw error;
    }

    return { id: newModuleId, moduleId: newModuleId, title: newTitle };
  }
}

export default new PlansService();
