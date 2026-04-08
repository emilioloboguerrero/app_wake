import apiClient from '../utils/apiClient';
import PlanContentCache from './PlanContentCache';

const WEEK_BASE = (clientId, programId, weekKey) =>
  `/creator/clients/${clientId}/programs/${programId}/weeks/${weekKey}`;

const CONTENT_BASE = (clientId, weekKey) =>
  `/creator/clients/${clientId}/plan-content/${weekKey}`;

class ClientPlanContentService {
  constructor() {
    this.cache = new PlanContentCache({
      flushFn: async (key, content, programId, deletions) => {
        const [clientId, weekKey] = key.split('/');
        const payload = { ...content, programId, sessions: content.sessions ?? [], deletions: deletions.length > 0 ? deletions : undefined };
        await apiClient.put(CONTENT_BASE(clientId, weekKey), payload);
      },
      onError: (key, err) => {
        console.error('[clientPlanContent] flush failed after retries for', key, err);
      },
    });
  }

  // ── Cache helpers ────────────────────────────────────────────────

  async _ensureCache(clientId, programId, weekKey) {
    const key = `${clientId}/${weekKey}`;
    if (this.cache.get(key)) return key;
    await this.getClientPlanContent(clientId, programId, weekKey);
    return key;
  }

  async flushWeek(clientId, weekKey) {
    return this.cache.flush(`${clientId}/${weekKey}`);
  }

  invalidateWeek(clientId, weekKey) {
    this.cache.invalidate(`${clientId}/${weekKey}`);
  }

  async flushAll() {
    return this.cache.flushAll();
  }

  hasPendingChanges(clientId, weekKey) {
    return this.cache.isDirty(`${clientId}/${weekKey}`);
  }

  // ── Read ────────────────────────────────────────────────────────

  async getClientPlanContent(clientId, programId, weekKey) {
    const key = `${clientId}/${weekKey}`;
    const cached = this.cache.get(key);
    if (cached) return cached;

    try {
      const res = await apiClient.get(CONTENT_BASE(clientId, weekKey), { params: { programId } });
      const data = res.data ?? null;
      if (data) {
        this.cache.seed(key, data, programId);
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
    return session?.exercises ?? [];
  }

  async getSetsByExercise(clientId, programId, weekKey, sessionId, exerciseId) {
    const exercises = await this.getExercisesBySession(clientId, programId, weekKey, sessionId);
    const ex = exercises.find((e) => e.id === exerciseId);
    return ex?.sets ?? [];
  }

  // ── Session CRUD (server handles copy-on-write) ──────────────

  async deleteSession(clientId, programId, weekKey, sessionId) {
    await this.flushWeek(clientId, weekKey);
    this.cache.invalidate(`${clientId}/${weekKey}`);
    const res = await apiClient.delete(
      `${WEEK_BASE(clientId, programId, weekKey)}/sessions/${sessionId}`
    );
    return res.data;
  }

  async updateSession(clientId, programId, weekKey, sessionId, updates) {
    await this.flushWeek(clientId, weekKey);
    this.cache.invalidate(`${clientId}/${weekKey}`);
    const res = await apiClient.patch(
      `${WEEK_BASE(clientId, programId, weekKey)}/sessions/${sessionId}`,
      updates
    );
    return res.data;
  }

  async addLibrarySessionToWeek(clientId, programId, weekKey, librarySessionId, dayIndex) {
    await this.flushWeek(clientId, weekKey);
    this.cache.invalidate(`${clientId}/${weekKey}`);
    const res = await apiClient.post(
      `${WEEK_BASE(clientId, programId, weekKey)}/sessions`,
      { librarySessionId, dayIndex }
    );
    return res.data;
  }

  // ── Exercise CRUD (via cache + debounced PUT) ─────────────────

  async createExercise(clientId, programId, weekKey, sessionId, titleOrData, order = null) {
    const key = await this._ensureCache(clientId, programId, weekKey);
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

  async updateExercise(clientId, programId, weekKey, sessionId, exerciseId, updates) {
    const key = await this._ensureCache(clientId, programId, weekKey);
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

  async deleteExercise(clientId, programId, weekKey, sessionId, exerciseId) {
    const key = await this._ensureCache(clientId, programId, weekKey);
    // Queue deletion of exercise and its sets so the server knows to remove them
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

  async addSetToExercise(clientId, programId, weekKey, sessionId, exerciseId, order = null) {
    const key = await this._ensureCache(clientId, programId, weekKey);
    const setId = `set_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    this.cache.modify(key, (content) => {
      const session = (content.sessions ?? []).find(s => s.id === sessionId);
      const exercise = session?.exercises?.find(e => e.id === exerciseId);
      if (!exercise) {
        console.error('[planContent.addSetToExercise] Exercise not found in cache, skipping:', exerciseId);
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

  async updateSet(clientId, programId, weekKey, sessionId, exerciseId, setId, updates) {
    const key = await this._ensureCache(clientId, programId, weekKey);
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

  async deleteSet(clientId, programId, weekKey, sessionId, exerciseId, setId) {
    const key = await this._ensureCache(clientId, programId, weekKey);
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

  async moveSessionToWeek(clientId, programId, sourceWeekKey, targetWeekKey, sessionId, targetDayIndex) {
    await this.flushWeek(clientId, sourceWeekKey);
    this.cache.invalidate(`${clientId}/${sourceWeekKey}`);

    const sourceContent = await this.getClientPlanContent(clientId, programId, sourceWeekKey);
    if (!sourceContent?.sessions) throw new Error('Source week not found');
    const session = sourceContent.sessions.find((s) => s.id === sessionId);
    if (!session) throw new Error('Session not found in source week');

    const sourceLibId = session.source_library_session_id ?? session.librarySessionRef ?? null;

    if (sourceLibId) {
      await this.addLibrarySessionToWeek(clientId, programId, targetWeekKey, sourceLibId, targetDayIndex);
    }

    await this.deleteSession(clientId, programId, sourceWeekKey, sessionId);
  }

  async deleteClientPlanContent(clientId, programId, weekKey) {
    this.cache.invalidate(`${clientId}/${weekKey}`);
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
    await this.flushWeek(clientId, sourceWeekKey);
    this.cache.invalidateAll();
    const res = await apiClient.post(
      `/creator/clients/${clientId}/programs/${programId}/apply-to-all`,
      { sourceWeekKey, sessionId, sourceLibrarySessionId }
    );
    return res.data;
  }
}

export default new ClientPlanContentService();
