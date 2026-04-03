import apiClient from '../utils/apiClient';
import PlanContentCache from './PlanContentCache';

const WEEK_BASE = (programId, weekKey) =>
  `/creator/programs/${programId}/weeks/${weekKey}`;

const CONTENT_BASE = (programId, weekKey) =>
  `/creator/programs/${programId}/plan-content/${weekKey}`;

class ProgramPlanContentService {
  constructor() {
    this.cache = new PlanContentCache({
      flushFn: async (key, content, _programId, deletions) => {
        const [programId, weekKey] = key.split('/');
        await apiClient.put(CONTENT_BASE(programId, weekKey), { ...content, sessions: content.sessions ?? [], deletions: deletions.length > 0 ? deletions : undefined });
      },
      onError: (key, err) => {
        console.error('[programPlanContent] flush failed after retries for', key, err);
      },
    });
  }

  // ── Cache helpers ────────────────────────────────────────────────

  async _ensureCache(programId, weekKey) {
    const key = `${programId}/${weekKey}`;
    if (this.cache.get(key)) return key;
    await this.getWeekContent(programId, weekKey);
    return key;
  }

  async flushWeek(programId, weekKey) {
    return this.cache.flush(`${programId}/${weekKey}`);
  }

  invalidateWeek(programId, weekKey) {
    this.cache.invalidate(`${programId}/${weekKey}`);
  }

  async flushAll() {
    return this.cache.flushAll();
  }

  hasPendingChanges(programId, weekKey) {
    return this.cache.isDirty(`${programId}/${weekKey}`);
  }

  // ── Read ────────────────────────────────────────────────────────

  async getWeekContent(programId, weekKey) {
    const key = `${programId}/${weekKey}`;
    const cached = this.cache.get(key);
    if (cached) return cached;

    try {
      const res = await apiClient.get(CONTENT_BASE(programId, weekKey));
      const data = res.data ?? null;
      if (data) {
        this.cache.seed(key, data, programId);
      }
      return data;
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
    await this.flushWeek(programId, weekKey);
    this.cache.invalidate(`${programId}/${weekKey}`);
    const res = await apiClient.delete(
      `${WEEK_BASE(programId, weekKey)}/sessions/${sessionId}`
    );
    return res.data;
  }

  async updateSession(programId, weekKey, sessionId, updates) {
    await this.flushWeek(programId, weekKey);
    this.cache.invalidate(`${programId}/${weekKey}`);
    const res = await apiClient.patch(
      `${WEEK_BASE(programId, weekKey)}/sessions/${sessionId}`,
      updates
    );
    return res.data;
  }

  async addLibrarySessionToWeek(programId, weekKey, librarySessionId, dayIndex) {
    await this.flushWeek(programId, weekKey);
    this.cache.invalidate(`${programId}/${weekKey}`);
    const res = await apiClient.post(
      `${WEEK_BASE(programId, weekKey)}/sessions`,
      { librarySessionId, dayIndex }
    );
    return res.data;
  }

  // ── Exercise CRUD (via cache + debounced PUT) ─────────────────

  async createExercise(programId, weekKey, sessionId, titleOrData, order = null) {
    const key = await this._ensureCache(programId, weekKey);
    const exerciseId = `ex_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const isObject = titleOrData && typeof titleOrData === 'object';
    this.cache.modify(key, (content) => {
      const sessions = (content.sessions ?? []).map((s) => {
        if (s.id !== sessionId) return s;
        const existing = s.exercises ?? [];
        const orderVal = order != null ? order : existing.length;
        const exercise = isObject
          ? { ...titleOrData, id: exerciseId, order: orderVal }
          : { id: exerciseId, title: titleOrData || 'Ejercicio', name: titleOrData || 'Ejercicio', order: orderVal };
        return { ...s, exercises: [...existing, exercise] };
      });
      return { ...content, sessions };
    });
    return { id: exerciseId };
  }

  async updateExercise(programId, weekKey, sessionId, exerciseId, updates) {
    const key = await this._ensureCache(programId, weekKey);
    this.cache.modify(key, (content) => {
      const sessions = (content.sessions ?? []).map((s) => {
        if (s.id !== sessionId) return s;
        const exercises = (s.exercises ?? []).map((e) =>
          e.id === exerciseId ? { ...e, ...updates } : e
        );
        return { ...s, exercises };
      });
      return { ...content, sessions };
    });
  }

  async deleteExercise(programId, weekKey, sessionId, exerciseId) {
    const key = await this._ensureCache(programId, weekKey);
    const content = this.cache.get(key);
    const session = content?.sessions?.find(s => s.id === sessionId);
    const exercise = session?.exercises?.find(e => e.id === exerciseId);
    if (exercise) {
      (exercise.sets || []).forEach(set => {
        this.cache.queueDeletion(key, `sessions/${sessionId}/exercises/${exerciseId}/sets/${set.id}`);
      });
      this.cache.queueDeletion(key, `sessions/${sessionId}/exercises/${exerciseId}`);
    }
    this.cache.modify(key, (content) => {
      const sessions = (content.sessions ?? []).map((s) => {
        if (s.id !== sessionId) return s;
        return { ...s, exercises: (s.exercises ?? []).filter((e) => e.id !== exerciseId) };
      });
      return { ...content, sessions };
    });
  }

  // ── Set CRUD (via cache + debounced PUT) ──────────────────────

  async addSetToExercise(programId, weekKey, sessionId, exerciseId, order = null) {
    const key = await this._ensureCache(programId, weekKey);
    const setId = `set_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    this.cache.modify(key, (content) => {
      const session = (content.sessions ?? []).find(s => s.id === sessionId);
      const exercise = session?.exercises?.find(e => e.id === exerciseId);
      if (!exercise) {
        console.error('[programPlanContent.addSetToExercise] Exercise not found in cache, skipping:', exerciseId);
        return content;
      }
      const sessions = (content.sessions ?? []).map((s) => {
        if (s.id !== sessionId) return s;
        const exercises = (s.exercises ?? []).map((e) => {
          if (e.id !== exerciseId) return e;
          const existing = e.sets ?? [];
          const orderVal = order != null ? order : existing.length;
          return { ...e, sets: [...existing, { id: setId, title: `Serie ${orderVal + 1}`, order: orderVal }] };
        });
        return { ...s, exercises };
      });
      return { ...content, sessions };
    });
    return { id: setId };
  }

  async updateSet(programId, weekKey, sessionId, exerciseId, setId, updates) {
    const key = await this._ensureCache(programId, weekKey);
    this.cache.modify(key, (content) => {
      const sessions = (content.sessions ?? []).map((s) => {
        if (s.id !== sessionId) return s;
        const exercises = (s.exercises ?? []).map((e) => {
          if (e.id !== exerciseId) return e;
          return { ...e, sets: (e.sets ?? []).map((set) => (set.id === setId ? { ...set, ...updates } : set)) };
        });
        return { ...s, exercises };
      });
      return { ...content, sessions };
    });
  }

  async deleteSet(programId, weekKey, sessionId, exerciseId, setId) {
    const key = await this._ensureCache(programId, weekKey);
    this.cache.queueDeletion(key, `sessions/${sessionId}/exercises/${exerciseId}/sets/${setId}`);
    this.cache.modify(key, (content) => {
      const sessions = (content.sessions ?? []).map((s) => {
        if (s.id !== sessionId) return s;
        const exercises = (s.exercises ?? []).map((e) => {
          if (e.id !== exerciseId) return e;
          return { ...e, sets: (e.sets ?? []).filter((set) => set.id !== setId) };
        });
        return { ...s, exercises };
      });
      return { ...content, sessions };
    });
  }

  // ── Bulk operations ──────────────────────────────────────────

  async moveSessionToWeek(programId, sourceWeekKey, targetWeekKey, sessionId, targetDayIndex) {
    await this.flushWeek(programId, sourceWeekKey);
    this.cache.invalidate(`${programId}/${sourceWeekKey}`);

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
    this.cache.invalidate(`${programId}/${weekKey}`);
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
