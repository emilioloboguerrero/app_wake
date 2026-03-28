import apiClient from '../utils/apiClient';

const WEEK_BASE = (programId, weekKey) =>
  `/creator/programs/${programId}/weeks/${weekKey}`;

const CONTENT_BASE = (programId, weekKey) =>
  `/creator/programs/${programId}/plan-content/${weekKey}`;

class ProgramPlanContentService {
  // ── Read ────────────────────────────────────────────────────────

  async getWeekContent(programId, weekKey) {
    try {
      const res = await apiClient.get(CONTENT_BASE(programId, weekKey));
      return res.data ?? null;
    } catch (error) {
      if (error?.status === 404) return null;
      console.error('[programPlanContentService] getWeekContent:', error);
      throw error;
    }
  }

  async getSessionContent(programId, weekKey, sessionId) {
    const content = await this.getWeekContent(programId, weekKey);
    if (!content?.sessions) return null;
    const session = content.sessions.find((s) => s.id === sessionId);
    if (!session) return null;
    return { session, exercises: session.exercises || [] };
  }

  async getExercisesBySession(programId, weekKey, sessionId) {
    const content = await this.getWeekContent(programId, weekKey);
    if (!content?.sessions) return [];
    const session = content.sessions.find((s) => s.id === sessionId);
    return session?.exercises ?? [];
  }

  async getSetsByExercise(programId, weekKey, sessionId, exerciseId) {
    const exercises = await this.getExercisesBySession(programId, weekKey, sessionId);
    const ex = exercises.find((e) => e.id === exerciseId);
    return ex?.sets ?? [];
  }

  // ── Session CRUD (server handles copy-on-write) ──────────────

  async deleteSession(programId, weekKey, sessionId) {
    const res = await apiClient.delete(
      `${WEEK_BASE(programId, weekKey)}/sessions/${sessionId}`
    );
    return res.data;
  }

  async updateSession(programId, weekKey, sessionId, updates) {
    const res = await apiClient.patch(
      `${WEEK_BASE(programId, weekKey)}/sessions/${sessionId}`,
      updates
    );
    return res.data;
  }

  async addLibrarySessionToWeek(programId, weekKey, librarySessionId, dayIndex) {
    const res = await apiClient.post(
      `${WEEK_BASE(programId, weekKey)}/sessions`,
      { librarySessionId, dayIndex }
    );
    return res.data;
  }

  // ── Exercise CRUD (via plan-content PUT) ─────────────────────

  async createExercise(programId, weekKey, sessionId, title, order = null) {
    const content = await this.getWeekContent(programId, weekKey);
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
    await apiClient.put(CONTENT_BASE(programId, weekKey), { ...content, sessions });
  }

  async updateExercise(programId, weekKey, sessionId, exerciseId, updates) {
    const content = await this.getWeekContent(programId, weekKey);
    if (!content) throw new Error('Week content not found');
    const sessions = (content.sessions ?? []).map((s) => {
      if (s.id !== sessionId) return s;
      const exercises = (s.exercises ?? []).map((e) =>
        e.id === exerciseId ? { ...e, ...updates } : e
      );
      return { ...s, exercises };
    });
    await apiClient.put(CONTENT_BASE(programId, weekKey), { ...content, sessions });
  }

  async deleteExercise(programId, weekKey, sessionId, exerciseId) {
    const content = await this.getWeekContent(programId, weekKey);
    if (!content) return;
    const sessions = (content.sessions ?? []).map((s) => {
      if (s.id !== sessionId) return s;
      return { ...s, exercises: (s.exercises ?? []).filter((e) => e.id !== exerciseId) };
    });
    await apiClient.put(CONTENT_BASE(programId, weekKey), { ...content, sessions });
  }

  // ── Set CRUD (via plan-content PUT) ──────────────────────────

  async addSetToExercise(programId, weekKey, sessionId, exerciseId, order = null) {
    const content = await this.getWeekContent(programId, weekKey);
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
    await apiClient.put(CONTENT_BASE(programId, weekKey), { ...content, sessions });
  }

  async updateSet(programId, weekKey, sessionId, exerciseId, setId, updates) {
    const content = await this.getWeekContent(programId, weekKey);
    if (!content) throw new Error('Week content not found');
    const sessions = (content.sessions ?? []).map((s) => {
      if (s.id !== sessionId) return s;
      const exercises = (s.exercises ?? []).map((e) => {
        if (e.id !== exerciseId) return e;
        return { ...e, sets: (e.sets ?? []).map((set) => (set.id === setId ? { ...set, ...updates } : set)) };
      });
      return { ...s, exercises };
    });
    await apiClient.put(CONTENT_BASE(programId, weekKey), { ...content, sessions });
  }

  async deleteSet(programId, weekKey, sessionId, exerciseId, setId) {
    const content = await this.getWeekContent(programId, weekKey);
    if (!content) return;
    const sessions = (content.sessions ?? []).map((s) => {
      if (s.id !== sessionId) return s;
      const exercises = (s.exercises ?? []).map((e) => {
        if (e.id !== exerciseId) return e;
        return { ...e, sets: (e.sets ?? []).filter((set) => set.id !== setId) };
      });
      return { ...s, exercises };
    });
    await apiClient.put(CONTENT_BASE(programId, weekKey), { ...content, sessions });
  }

  // ── Bulk operations ──────────────────────────────────────────

  async moveSessionToWeek(programId, sourceWeekKey, targetWeekKey, sessionId, targetDayIndex) {
    const sourceContent = await this.getWeekContent(programId, sourceWeekKey);
    if (!sourceContent?.sessions) throw new Error('Source week not found');
    const session = sourceContent.sessions.find((s) => s.id === sessionId);
    if (!session) throw new Error('Session not found in source week');

    const sourceLibId = session.source_library_session_id ?? session.librarySessionRef ?? null;
    if (sourceLibId) {
      await this.addLibrarySessionToWeek(programId, targetWeekKey, sourceLibId, targetDayIndex);
    }
    await this.deleteSession(programId, sourceWeekKey, sessionId);
  }

  async deleteWeekContent(programId, weekKey) {
    try {
      await apiClient.put(CONTENT_BASE(programId, weekKey), { sessions: [] });
    } catch (error) {
      if (error?.status === 404) return;
      console.error('[programPlanContentService] deleteWeekContent:', error);
      throw error;
    }
  }
}

export default new ProgramPlanContentService();
