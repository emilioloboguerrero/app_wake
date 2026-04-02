import apiClient from '../utils/apiClient';

const WEEK_BASE = (clientId, programId, weekKey) =>
  `/creator/clients/${clientId}/programs/${programId}/weeks/${weekKey}`;

const CONTENT_BASE = (clientId, weekKey) =>
  `/creator/clients/${clientId}/plan-content/${weekKey}`;

// Mutex to prevent concurrent read-modify-write on the same week content
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
  // ── Read ────────────────────────────────────────────────────────

  async getClientPlanContent(clientId, programId, weekKey) {
    try {
      const res = await apiClient.get(CONTENT_BASE(clientId, weekKey), { params: { programId } });
      const data = res.data ?? null;
      if (data) {
        const setsSummary = (data.sessions ?? []).flatMap(s => (s.exercises ?? []).flatMap(e => (e.sets ?? []).map(set => ({ session: s.id?.slice(-6), exercise: e.id?.slice(-6), set: set.id?.slice(-6), reps: set.reps, intensity: set.intensity }))));
        console.log('[planContent.GET]', weekKey, { sessions: data.sessions?.length, totalSets: setsSummary.length, setsSnapshot: setsSummary.slice(0, 10) });
      }
      return data;
    } catch (error) {
      if (error?.status === 404) return null;
      console.error('[clientPlanContentService] getClientPlanContent:', error);
      throw error;
    }
  }

  async getClientPlanSessionContent(clientId, programId, weekKey, sessionId) {
    const content = await this.getClientPlanContent(clientId, programId, weekKey);
    if (!content?.sessions) return null;
    const session = content.sessions.find((s) => s.id === sessionId);
    if (!session) return null;
    return { session, exercises: session.exercises || [] };
  }

  async getExercisesBySession(clientId, programId, weekKey, sessionId) {
    const content = await this.getClientPlanContent(clientId, programId, weekKey);
    if (!content?.sessions) return [];
    const session = content.sessions.find((s) => s.id === sessionId);
    if (!session) {
      console.error('[planContent.getExercisesBySession] Session NOT FOUND:', sessionId, 'available:', (content.sessions ?? []).map(s => ({ id: s.id, exerciseCount: s.exercises?.length })));
    } else {
      console.log('[planContent.getExercisesBySession] Session found:', sessionId.slice(-6), 'exercises:', (session.exercises ?? []).map(e => e.id));
    }
    return session?.exercises ?? [];
  }

  async getSetsByExercise(clientId, programId, weekKey, sessionId, exerciseId) {
    const exercises = await this.getExercisesBySession(clientId, programId, weekKey, sessionId);
    const ex = exercises.find((e) => e.id === exerciseId);
    const sets = ex?.sets ?? [];
    console.log('[planContent.getSetsByExercise]', { exerciseId: exerciseId.slice(-6), found: !!ex, setsCount: sets.length, sets: sets.map(s => ({ id: s.id?.slice(-6), reps: s.reps, intensity: s.intensity })) });
    return sets;
  }

  // ── Session CRUD (server handles copy-on-write) ──────────────

  async deleteSession(clientId, programId, weekKey, sessionId) {
    const res = await apiClient.delete(
      `${WEEK_BASE(clientId, programId, weekKey)}/sessions/${sessionId}`
    );
    return res.data;
  }

  async updateSession(clientId, programId, weekKey, sessionId, updates) {
    const res = await apiClient.patch(
      `${WEEK_BASE(clientId, programId, weekKey)}/sessions/${sessionId}`,
      updates
    );
    return res.data;
  }

  async addLibrarySessionToWeek(clientId, programId, weekKey, librarySessionId, dayIndex) {
    const res = await apiClient.post(
      `${WEEK_BASE(clientId, programId, weekKey)}/sessions`,
      { librarySessionId, dayIndex }
    );
    return res.data;
  }

  // ── Exercise CRUD (via plan-content PUT) ─────────────────────

  async createExercise(clientId, programId, weekKey, sessionId, title, order = null) {
    const key = `${clientId}/${weekKey}`;
    const exerciseId = `ex_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    await withMutex(key, async () => {
      const content = await this.getClientPlanContent(clientId, programId, weekKey);
      if (!content) throw new Error('Week content not found');
      const sessions = (content.sessions ?? []).map((s) => {
        if (s.id !== sessionId) return s;
        const existing = s.exercises ?? [];
        const orderVal = order != null ? order : existing.length;
        const titleVal = title || 'Ejercicio';
        return {
          ...s,
          exercises: [...existing, { id: exerciseId, title: titleVal, name: titleVal, order: orderVal }],
        };
      });
      await apiClient.put(CONTENT_BASE(clientId, weekKey), { ...content, programId, sessions });
    });
    return { id: exerciseId };
  }

  async updateExercise(clientId, programId, weekKey, sessionId, exerciseId, updates) {
    const key = `${clientId}/${weekKey}`;
    return withMutex(key, async () => {
      const content = await this.getClientPlanContent(clientId, programId, weekKey);
      if (!content) throw new Error('Week content not found');
      const sessions = (content.sessions ?? []).map((s) => {
        if (s.id !== sessionId) return s;
        const exercises = (s.exercises ?? []).map((e) =>
          e.id === exerciseId ? { ...e, ...updates } : e
        );
        return { ...s, exercises };
      });
      await apiClient.put(CONTENT_BASE(clientId, weekKey), { ...content, programId, sessions });
    });
  }

  async deleteExercise(clientId, programId, weekKey, sessionId, exerciseId) {
    const key = `${clientId}/${weekKey}`;
    return withMutex(key, async () => {
      const content = await this.getClientPlanContent(clientId, programId, weekKey);
      if (!content) return;
      const sessions = (content.sessions ?? []).map((s) => {
        if (s.id !== sessionId) return s;
        return { ...s, exercises: (s.exercises ?? []).filter((e) => e.id !== exerciseId) };
      });
      await apiClient.put(CONTENT_BASE(clientId, weekKey), { ...content, programId, sessions });
    });
  }

  // ── Set CRUD (via plan-content PUT) ──────────────────────────

  async addSetToExercise(clientId, programId, weekKey, sessionId, exerciseId, order = null) {
    const key = `${clientId}/${weekKey}`;
    return withMutex(key, async () => {
      const content = await this.getClientPlanContent(clientId, programId, weekKey);
      if (!content) throw new Error('Week content not found');
      const session = (content.sessions ?? []).find(s => s.id === sessionId);
      const exercise = session?.exercises?.find(e => e.id === exerciseId);
      if (!exercise) {
        console.warn('[planContent.addSetToExercise] Exercise not found in plan content, skipping PUT:', exerciseId);
        return;
      }
      const sessions = (content.sessions ?? []).map((s) => {
        if (s.id !== sessionId) return s;
        const exercises = (s.exercises ?? []).map((e) => {
          if (e.id !== exerciseId) return e;
          const existing = e.sets ?? [];
          const orderVal = order != null ? order : existing.length;
          const setId = `set_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
          return { ...e, sets: [...existing, { id: setId, title: `Serie ${orderVal + 1}`, order: orderVal }] };
        });
        return { ...s, exercises };
      });
      await apiClient.put(CONTENT_BASE(clientId, weekKey), { ...content, programId, sessions });
    });
  }

  async updateSet(clientId, programId, weekKey, sessionId, exerciseId, setId, updates) {
    const key = `${clientId}/${weekKey}`;
    return withMutex(key, async () => {
      console.log('[planContent.updateSet] START', { clientId: clientId.slice(-6), weekKey, sessionId: sessionId.slice(-6), exerciseId: exerciseId.slice(-6), setId: setId.slice(-6), updates });
      const content = await this.getClientPlanContent(clientId, programId, weekKey);
      if (!content) { console.error('[planContent.updateSet] ABORT: No content for', weekKey); throw new Error('Week content not found'); }
      const session = (content.sessions ?? []).find(s => s.id === sessionId);
      if (!session) { console.error('[planContent.updateSet] ABORT: Session not found:', sessionId); return; }
      const exercise = session?.exercises?.find(e => e.id === exerciseId);
      if (!exercise) { console.error('[planContent.updateSet] ABORT: Exercise not found:', exerciseId, 'available:', (session.exercises ?? []).map(e => e.id)); return; }
      const existingSet = exercise?.sets?.find(s => s.id === setId);
      if (!existingSet) { console.error('[planContent.updateSet] ABORT: Set not found:', setId); return; }
      console.log('[planContent.updateSet] BEFORE merge:', { setId: setId.slice(-6), ...Object.fromEntries(Object.keys(updates).map(k => [k, { old: existingSet[k], new: updates[k] }])) });
      const sessions = (content.sessions ?? []).map((s) => {
        if (s.id !== sessionId) return s;
        const exercises = (s.exercises ?? []).map((e) => {
          if (e.id !== exerciseId) return e;
          return { ...e, sets: (e.sets ?? []).map((set) => (set.id === setId ? { ...set, ...updates } : set)) };
        });
        return { ...s, exercises };
      });
      const updatedSet = sessions.find(s => s.id === sessionId)?.exercises?.find(e => e.id === exerciseId)?.sets?.find(s => s.id === setId);
      console.log('[planContent.updateSet] AFTER merge:', Object.fromEntries(Object.keys(updates).map(k => [k, updatedSet?.[k]])));
      await apiClient.put(CONTENT_BASE(clientId, weekKey), { ...content, programId, sessions });
      console.log('[planContent.updateSet] PUT COMPLETE for set', setId.slice(-6));
    });
  }

  async deleteSet(clientId, programId, weekKey, sessionId, exerciseId, setId) {
    const key = `${clientId}/${weekKey}`;
    return withMutex(key, async () => {
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
      await apiClient.put(CONTENT_BASE(clientId, weekKey), { ...content, programId, sessions });
    });
  }

  // ── Bulk operations ──────────────────────────────────────────

  async moveSessionToWeek(clientId, programId, sourceWeekKey, targetWeekKey, sessionId, targetDayIndex) {
    const sourceContent = await this.getClientPlanContent(clientId, programId, sourceWeekKey);
    if (!sourceContent?.sessions) throw new Error('Source week not found');
    const session = sourceContent.sessions.find((s) => s.id === sessionId);
    if (!session) throw new Error('Session not found in source week');

    // Get source session's library ref
    const sourceLibId = session.source_library_session_id ?? session.librarySessionRef ?? null;

    // Add to target week via server (deep copy from library)
    if (sourceLibId) {
      await this.addLibrarySessionToWeek(clientId, programId, targetWeekKey, sourceLibId, targetDayIndex);
    }

    // Delete from source week
    await this.deleteSession(clientId, programId, sourceWeekKey, sessionId);
  }

  async deleteClientPlanContent(clientId, programId, weekKey) {
    try {
      await apiClient.put(CONTENT_BASE(clientId, weekKey), { programId, sessions: [] });
    } catch (error) {
      if (error?.status === 404) return;
      console.error('[clientPlanContentService] deleteClientPlanContent:', error);
      throw error;
    }
  }

  // ── Apply to all instances ───────────────────────────────────

  async applyToAllInstances(clientId, programId, sourceWeekKey, sessionId, sourceLibrarySessionId) {
    const res = await apiClient.post(
      `/creator/clients/${clientId}/programs/${programId}/apply-to-all`,
      { sourceWeekKey, sessionId, sourceLibrarySessionId }
    );
    return res.data;
  }
}

export default new ClientPlanContentService();
