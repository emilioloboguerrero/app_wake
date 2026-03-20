import apiClient from '../utils/apiClient';

class LibraryService {
  // Returns all unique exercises aggregated from all library sessions.
  // Each item: { id, name, primaryMuscles, video_url, muscle_activation, implements }
  async getExercises() {
    const sessions = await this.getSessionLibrary();
    const seen = new Map();
    for (const session of sessions) {
      for (const ex of session.exercises || []) {
        const key = ex.name || ex.exerciseId || ex.id;
        if (key && !seen.has(key)) {
          seen.set(key, {
            id: ex.exerciseId || ex.id || key,
            name: ex.name || '',
            primaryMuscles: ex.primaryMuscles || [],
            video_url: ex.video_url || ex.video || null,
            muscle_activation: ex.muscle_activation || null,
            implements: ex.implements || null,
          });
        }
      }
    }
    return Array.from(seen.values());
  }

  // Returns exercise libraries (exercises_library collection docs) for a creator.
  // The creator's library doc ID is their uid.
  async getLibrariesByCreator(creatorId) {
    const res = await apiClient.get(`/exercises/${creatorId}`);
    const doc = res.data;
    if (!doc) return [];
    // doc is a map of exerciseName → exerciseData; wrap as a single library entry
    return [{ id: creatorId, title: 'Mi biblioteca', ...doc }];
  }

  // Returns a single exercise library document.
  async getLibraryById(libraryId) {
    const res = await apiClient.get(`/exercises/${libraryId}`);
    return res.data;
  }

  // Extracts exercises from a library document (map of exerciseName → exerciseData).
  getExercisesFromLibrary(libraryDoc) {
    if (!libraryDoc) return [];
    return Object.entries(libraryDoc)
      .filter(([key]) => key !== 'id')
      .map(([name, data]) => ({ name, data: data || {} }));
  }

  // Returns exercise count for a library document.
  getExerciseCount(libraryDoc) {
    if (!libraryDoc) return 0;
    return Object.keys(libraryDoc).filter((k) => k !== 'id' && k !== 'title').length;
  }

  // Creates a new exercise library (a new doc in exercises_library keyed by a generated id).
  async createLibrary(title) {
    const res = await apiClient.post('/creator/exercises/libraries', { title });
    return res.data;
  }

  // Deletes an exercise library.
  async deleteLibrary(libraryId) {
    await apiClient.delete(`/creator/exercises/libraries/${libraryId}`);
  }

  // Creates an exercise inside a library.
  async createExercise(libraryId, exerciseName) {
    const res = await apiClient.post(`/creator/exercises/libraries/${libraryId}/exercises`, {
      name: exerciseName,
    });
    return res.data;
  }

  // Deletes an exercise from a library.
  async deleteExercise(libraryId, exerciseName) {
    await apiClient.delete(`/creator/exercises/libraries/${libraryId}/exercises/${encodeURIComponent(exerciseName)}`);
  }

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
