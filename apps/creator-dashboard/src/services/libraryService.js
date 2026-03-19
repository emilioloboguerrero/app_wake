import apiClient from '../utils/apiClient';

class LibraryService {
  async getSessionLibrary() {
    const res = await apiClient.get('/creator/library/sessions');
    return res.data;
  }

  async getLibrarySessionById(sessionId) {
    const res = await apiClient.get(`/creator/library/sessions/${sessionId}`);
    return res.data;
  }

  async createLibrarySession(_creatorId, sessionData) {
    const res = await apiClient.post('/creator/library/sessions', {
      title: sessionData.title,
    });
    return res.data;
  }

  async updateLibrarySession(_creatorId, sessionId, updates) {
    const res = await apiClient.patch(`/creator/library/sessions/${sessionId}`, updates);
    return res.data;
  }

  async deleteLibrarySession(_creatorId, sessionId) {
    await apiClient.delete(`/creator/library/sessions/${sessionId}`);
  }

  async propagateLibrarySession(sessionId) {
    const res = await apiClient.post(`/creator/library/sessions/${sessionId}/propagate`);
    return res.data;
  }

  async getLibrarySessionExercises(_creatorId, sessionId) {
    const res = await apiClient.get(`/creator/library/sessions/${sessionId}`);
    return res.data.exercises || [];
  }

  async createExerciseInLibrarySession(_creatorId, sessionId, exerciseName, order = null) {
    const res = await apiClient.post(`/creator/library/sessions/${sessionId}/exercises`, {
      name: typeof exerciseName === 'string' ? exerciseName.trim() : (exerciseName?.name || ''),
      primaryMuscles: exerciseName?.primaryMuscles || [],
      order: order ?? 0,
    });
    return res.data;
  }

  async createLibrarySessionExercise(_creatorId, sessionId, exerciseData, order = null) {
    const res = await apiClient.post(`/creator/library/sessions/${sessionId}/exercises`, {
      name: exerciseData.title || exerciseData.name || '',
      primaryMuscles: exerciseData.primaryMuscles || [],
      order: order ?? exerciseData.order ?? 0,
    });
    return res.data;
  }

  async updateExerciseInLibrarySession(_creatorId, sessionId, exerciseId, updates) {
    const res = await apiClient.patch(
      `/creator/library/sessions/${sessionId}/exercises/${exerciseId}`,
      updates
    );
    return res.data;
  }

  async updateLibrarySessionExercise(_creatorId, sessionId, exerciseId, updates) {
    return this.updateExerciseInLibrarySession(_creatorId, sessionId, exerciseId, updates);
  }

  async deleteLibrarySessionExercise(_creatorId, sessionId, exerciseId) {
    await apiClient.delete(`/creator/library/sessions/${sessionId}/exercises/${exerciseId}`);
  }

  async deleteExerciseFromLibrarySession(_creatorId, sessionId, exerciseId) {
    return this.deleteLibrarySessionExercise(_creatorId, sessionId, exerciseId);
  }

  async updateLibrarySessionExerciseOrder(_creatorId, sessionId, exerciseOrders) {
    await Promise.all(
      exerciseOrders.map(({ exerciseId, order }) =>
        apiClient.patch(`/creator/library/sessions/${sessionId}/exercises/${exerciseId}`, { order })
      )
    );
  }

  async getSetsByLibraryExercise(_creatorId, sessionId, exerciseId) {
    const res = await apiClient.get(`/creator/library/sessions/${sessionId}`);
    const exercise = (res.data.exercises || []).find((e) => e.exerciseId === exerciseId);
    return exercise?.sets || [];
  }

  async createSetInLibraryExercise(_creatorId, sessionId, exerciseId, order = null) {
    const res = await apiClient.post(
      `/creator/library/sessions/${sessionId}/exercises/${exerciseId}/sets`,
      {
        reps: '',
        weight: null,
        intensity: null,
        rir: null,
        order: order ?? 0,
      }
    );
    return res.data;
  }

  async updateSetInLibraryExercise(_creatorId, sessionId, exerciseId, setId, updates) {
    const res = await apiClient.patch(
      `/creator/library/sessions/${sessionId}/exercises/${exerciseId}/sets/${setId}`,
      updates
    );
    return res.data;
  }

  async deleteSetFromLibraryExercise(_creatorId, sessionId, exerciseId, setId) {
    await apiClient.delete(
      `/creator/library/sessions/${sessionId}/exercises/${exerciseId}/sets/${setId}`
    );
  }

  async getModuleLibrary() {
    const res = await apiClient.get('/creator/library/modules');
    return res.data;
  }

  async getLibraryModuleById(_creatorId, moduleId) {
    const res = await apiClient.get(`/creator/library/modules/${moduleId}`);
    return res.data;
  }

  async createLibraryModule(_creatorId, moduleData) {
    const res = await apiClient.post('/creator/library/modules', {
      title: moduleData.title,
    });
    return res.data;
  }

  async updateLibraryModule(_creatorId, moduleId, updates) {
    const res = await apiClient.patch(`/creator/library/modules/${moduleId}`, updates);
    return res.data;
  }

  async deleteLibraryModule(_creatorId, moduleId) {
    await apiClient.delete(`/creator/library/modules/${moduleId}`);
  }

  async propagateLibraryModule(moduleId) {
    const res = await apiClient.post(`/creator/library/modules/${moduleId}/propagate`);
    return res.data;
  }
}

export default new LibraryService();
