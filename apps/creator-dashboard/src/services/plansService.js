import apiClient from '../utils/apiClient';

class PlansService {
  async getPlansByCreator(_creatorId) {
    const result = await apiClient.get('/creator/plans');
    return result?.data ?? [];
  }

  async getPlanById(planId) {
    const result = await apiClient.get(`/creator/plans/${planId}`);
    return result?.data ?? null;
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
    return result?.data;
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
    const module = (plan?.modules ?? []).find((m) => m.moduleId === moduleId);
    return (module?.sessions ?? []).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  }

  async createSession(planId, moduleId, title, order = null, _imageUrl = null, librarySessionRef = null) {
    const result = await apiClient.post(
      `/creator/plans/${planId}/modules/${moduleId}/sessions`,
      {
        title,
        order: order ?? 0,
        librarySessionRef: librarySessionRef ?? null,
      }
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
    const exercise = (session?.exercises ?? []).find((e) => e.exerciseId === exerciseId);
    return (exercise?.sets ?? []).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  }

  async createSet(planId, moduleId, sessionId, exerciseId, order = null) {
    const orderVal = order ?? 0;
    const result = await apiClient.post(
      `/creator/plans/${planId}/modules/${moduleId}/sessions/${sessionId}/exercises/${exerciseId}/sets`,
      {
        title: `Serie ${orderVal + 1}`,
        reps: '',
        weight: null,
        intensity: null,
        rir: null,
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

  async duplicateModule(planId, sourceModuleId) {
    const plan = await this.getPlanById(planId);
    const existingModules = plan?.modules ?? [];
    const sourceMod = existingModules.find((m) => m.moduleId === sourceModuleId);
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
        const createdSession = await this.createSession(
          planId,
          newModuleId,
          session.title || 'Sesión',
          session.order ?? null,
          null,
          session.librarySessionRef ?? null
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
