import apiClient from '../utils/apiClient';

const CLIENT_SESSION_BASE = (clientId, sessionId) =>
  `/creator/clients/${clientId}/client-sessions/${sessionId}`;

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

class ClientSessionContentService {
  // clientSessionId format: clientId_dateStr_sessionId
  // We extract clientId from the composite id
  #clientIdFromSessionId(clientSessionId) {
    if (!clientSessionId || !clientSessionId.includes('_')) {
      throw new Error('Invalid session ID format');
    }
    return clientSessionId.split('_')[0];
  }

  async getClientSessionContent(clientSessionId) {
    const clientId = this.#clientIdFromSessionId(clientSessionId);
    try {
      const res = await apiClient.get(
        `${CLIENT_SESSION_BASE(clientId, clientSessionId)}/content`
      );
      return res.data ?? null;
    } catch (error) {
      if (error?.status === 404) return null;
      console.error('[clientSessionContentService] getClientSessionContent:', error);
      throw error;
    }
  }

  async copyFromLibrary(creatorId, clientSessionId, librarySessionId, librarySessionData) {
    const clientId = this.#clientIdFromSessionId(clientSessionId);
    const { exercises = [], ...sessionFields } = librarySessionData;
    const payload = {
      title: sessionFields.title,
      image_url: sessionFields.image_url ?? null,
      creator_id: creatorId,
      source_session_id: librarySessionId,
      version: 1,
      exercises: exercises.map((ex) => ({
        id: ex.id,
        ...ex,
        sets: (ex.sets || []).map((s) => ({ id: s.id, ...s })),
      })),
    };

    await apiClient.put(
      `${CLIENT_SESSION_BASE(clientId, clientSessionId)}/content`,
      payload
    );
  }

  async updateSession(clientSessionId, updates) {
    const clientId = this.#clientIdFromSessionId(clientSessionId);
    await apiClient.put(
      `${CLIENT_SESSION_BASE(clientId, clientSessionId)}/content`,
      updates
    );
  }

  async updateExercise(clientSessionId, exerciseId, updates) {
    const clientId = this.#clientIdFromSessionId(clientSessionId);
    await apiClient.patch(
      `${CLIENT_SESSION_BASE(clientId, clientSessionId)}/content/exercises/${exerciseId}`,
      updates
    );
  }

  async createExercise(clientSessionId, exerciseData, order = 0) {
    return withMutex(`session:${clientSessionId}`, async () => {
      const clientId = this.#clientIdFromSessionId(clientSessionId);
      const content = await this.getClientSessionContent(clientSessionId);
      const exercises = content?.exercises ?? [];
      const newExercise = { ...exerciseData, order };
      const updated = [...exercises, newExercise];
      await apiClient.put(
        `${CLIENT_SESSION_BASE(clientId, clientSessionId)}/content`,
        { ...(content ?? {}), exercises: updated }
      );
      return newExercise;
    });
  }

  async deleteExercise(clientSessionId, exerciseId) {
    return withMutex(`session:${clientSessionId}`, async () => {
      const clientId = this.#clientIdFromSessionId(clientSessionId);
      const content = await this.getClientSessionContent(clientSessionId);
      if (!content) return;
      const exercises = (content.exercises ?? []).filter((e) => e.id !== exerciseId);
      await apiClient.put(
        `${CLIENT_SESSION_BASE(clientId, clientSessionId)}/content`,
        { ...content, exercises }
      );
    });
  }

  async updateExerciseOrder(clientSessionId, exerciseOrders) {
    return withMutex(`session:${clientSessionId}`, async () => {
      const clientId = this.#clientIdFromSessionId(clientSessionId);
      const content = await this.getClientSessionContent(clientSessionId);
      if (!content) return;
      const orderMap = new Map(exerciseOrders.map(({ exerciseId, order }) => [exerciseId, order]));
      const exercises = (content.exercises ?? []).map((ex) =>
        orderMap.has(ex.id) ? { ...ex, order: orderMap.get(ex.id) } : ex
      );
      await apiClient.put(
        `${CLIENT_SESSION_BASE(clientId, clientSessionId)}/content`,
        { ...content, exercises }
      );
    });
  }

  async getSetsForExercise(clientSessionId, exerciseId) {
    const content = await this.getClientSessionContent(clientSessionId);
    if (!content) return [];
    const ex = (content.exercises ?? []).find((e) => e.id === exerciseId);
    return ex?.sets ?? [];
  }

  async updateSetInExercise(clientSessionId, exerciseId, setId, updates) {
    return withMutex(`session:${clientSessionId}`, async () => {
      const clientId = this.#clientIdFromSessionId(clientSessionId);
      const content = await this.getClientSessionContent(clientSessionId);
      if (!content) return;
      const exercises = (content.exercises ?? []).map((ex) => {
        if (ex.id !== exerciseId) return ex;
        const sets = (ex.sets ?? []).map((s) => (s.id === setId ? { ...s, ...updates } : s));
        return { ...ex, sets };
      });
      await apiClient.put(
        `${CLIENT_SESSION_BASE(clientId, clientSessionId)}/content`,
        { ...content, exercises }
      );
    });
  }

  async addSetToExercise(clientSessionId, exerciseId, setData) {
    return withMutex(`session:${clientSessionId}`, async () => {
      const clientId = this.#clientIdFromSessionId(clientSessionId);
      const content = await this.getClientSessionContent(clientSessionId);
      if (!content) return;
      const exercises = (content.exercises ?? []).map((ex) => {
        if (ex.id !== exerciseId) return ex;
        const newSet = { ...setData, order: setData.order ?? (ex.sets ?? []).length };
        return { ...ex, sets: [...(ex.sets ?? []), newSet] };
      });
      await apiClient.put(
        `${CLIENT_SESSION_BASE(clientId, clientSessionId)}/content`,
        { ...content, exercises }
      );
    });
  }

  async deleteSet(clientSessionId, exerciseId, setId) {
    return withMutex(`session:${clientSessionId}`, async () => {
      const clientId = this.#clientIdFromSessionId(clientSessionId);
      const content = await this.getClientSessionContent(clientSessionId);
      if (!content) return;
      const exercises = (content.exercises ?? []).map((ex) => {
        if (ex.id !== exerciseId) return ex;
        return { ...ex, sets: (ex.sets ?? []).filter((s) => s.id !== setId) };
      });
      await apiClient.put(
        `${CLIENT_SESSION_BASE(clientId, clientSessionId)}/content`,
        { ...content, exercises }
      );
    });
  }

  async deleteClientSessionContent(clientSessionId) {
    const clientId = this.#clientIdFromSessionId(clientSessionId);
    try {
      await apiClient.put(
        `${CLIENT_SESSION_BASE(clientId, clientSessionId)}/content`,
        { exercises: [] }
      );
    } catch (error) {
      if (error?.status === 404) return;
      throw error;
    }
  }
}

export default new ClientSessionContentService();
