import apiClient from '../utils/apiClient';

const WEEK_BASE = (clientId, programId, weekKey) =>
  `/creator/clients/${clientId}/programs/${programId}/weeks/${weekKey}`;

const CONTENT_BASE = (clientId, weekKey) =>
  `/creator/clients/${clientId}/plan-content/${weekKey}`;

class ClientPlanContentService {
  // ── Read ────────────────────────────────────────────────────────

  async getClientPlanContent(clientId, programId, weekKey) {
    try {
      const res = await apiClient.get(CONTENT_BASE(clientId, weekKey), { params: { programId } });
      return res.data ?? null;
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
    return session?.exercises ?? [];
  }

  async getSetsByExercise(clientId, programId, weekKey, sessionId, exerciseId) {
    const exercises = await this.getExercisesBySession(clientId, programId, weekKey, sessionId);
    const ex = exercises.find((e) => e.id === exerciseId);
    return ex?.sets ?? [];
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
    await apiClient.put(CONTENT_BASE(clientId, weekKey), { ...content, programId, sessions });
  }

  async updateExercise(clientId, programId, weekKey, sessionId, exerciseId, updates) {
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
  }

  async deleteExercise(clientId, programId, weekKey, sessionId, exerciseId) {
    const content = await this.getClientPlanContent(clientId, programId, weekKey);
    if (!content) return;
    const sessions = (content.sessions ?? []).map((s) => {
      if (s.id !== sessionId) return s;
      return { ...s, exercises: (s.exercises ?? []).filter((e) => e.id !== exerciseId) };
    });
    await apiClient.put(CONTENT_BASE(clientId, weekKey), { ...content, programId, sessions });
  }

  // ── Set CRUD (via plan-content PUT) ──────────────────────────

  async addSetToExercise(clientId, programId, weekKey, sessionId, exerciseId, order = null) {
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
    await apiClient.put(CONTENT_BASE(clientId, weekKey), { ...content, programId, sessions });
  }

  async updateSet(clientId, programId, weekKey, sessionId, exerciseId, setId, updates) {
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
    await apiClient.put(CONTENT_BASE(clientId, weekKey), { ...content, programId, sessions });
  }

  async deleteSet(clientId, programId, weekKey, sessionId, exerciseId, setId) {
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
