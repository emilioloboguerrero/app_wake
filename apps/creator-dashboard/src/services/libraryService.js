import apiClient from '../utils/apiClient';

class LibraryService {
  async getExercises() {
    const res = await apiClient.get('/creator/library/exercises');
    return res.data || [];
  }

  // Returns exercise libraries (exercises_library collection docs) for a creator.
  async getLibrariesByCreator() {
    const res = await apiClient.get('/creator/exercises/libraries');
    return res.data || [];
  }

  // Returns a single exercise library document.
  async getLibraryById(libraryId) {
    const res = await apiClient.get(`/creator/exercises/libraries/${libraryId}`);
    return res.data;
  }

  // Extracts exercises from a library document (map of exerciseName → exerciseData).
  getExercisesFromLibrary(libraryDoc) {
    if (!libraryDoc) return [];
    const metaKeys = new Set(['id', 'title', 'creator_id', 'creator_name', 'created_at', 'updated_at', 'icon']);
    return Object.entries(libraryDoc)
      .filter(([key, val]) => !metaKeys.has(key) && val && typeof val === 'object')
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

  // Updates exercise data (muscle_activation, implements, etc.)
  async updateExercise(libraryId, exerciseName, updates) {
    const res = await apiClient.patch(
      `/creator/exercises/libraries/${libraryId}/exercises/${encodeURIComponent(exerciseName)}`,
      updates
    );
    return res.data;
  }

  // Updates library metadata (title, icon)
  async updateLibrary(libraryId, updates) {
    const res = await apiClient.patch(`/creator/exercises/libraries/${libraryId}`, updates);
    return res.data;
  }

  // Uploads exercise video via signed URL flow: get URL → upload → confirm
  async uploadExerciseVideo(libraryId, exerciseName, file, onProgress) {
    const encodedName = encodeURIComponent(exerciseName);

    // Step 1: Get signed upload URL
    const urlRes = await apiClient.post(
      `/creator/exercises/libraries/${libraryId}/exercises/${encodedName}/upload-url`,
      { contentType: file.type }
    );
    const { uploadUrl, storagePath } = urlRes.data;

    // Step 2: Upload directly to Storage
    await new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('PUT', uploadUrl);
      xhr.setRequestHeader('Content-Type', file.type);

      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable && onProgress) {
          onProgress((e.loaded / e.total) * 100);
        }
      });

      xhr.addEventListener('load', () => {
        if (xhr.status >= 200 && xhr.status < 300) resolve();
        else reject(new Error(`Upload failed with status ${xhr.status}`));
      });

      xhr.addEventListener('error', () => reject(new Error('Upload failed')));
      xhr.send(file);
    });

    // Step 3: Confirm upload
    const confirmRes = await apiClient.post(
      `/creator/exercises/libraries/${libraryId}/exercises/${encodedName}/upload-url/confirm`,
      { storagePath }
    );

    return confirmRes.data.video_url;
  }

  // Deletes exercise video
  async deleteExerciseVideo(libraryId, exerciseName) {
    await apiClient.delete(
      `/creator/exercises/libraries/${libraryId}/exercises/${encodeURIComponent(exerciseName)}/video`
    );
  }

  async uploadLibrarySessionImage(creatorId, sessionId, file, onProgress) {
    // Step 1: Get signed upload URL
    const urlRes = await apiClient.post(
      `/creator/library/sessions/${sessionId}/image/upload-url`,
      { contentType: file.type }
    );
    const { uploadUrl, storagePath } = urlRes.data;

    // Step 2: Upload directly to Storage
    await new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('PUT', uploadUrl);
      xhr.setRequestHeader('Content-Type', file.type);

      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable && onProgress) {
          onProgress((e.loaded / e.total) * 100);
        }
      });

      xhr.addEventListener('load', () => {
        if (xhr.status >= 200 && xhr.status < 300) resolve();
        else reject(new Error(`Upload failed with status ${xhr.status}`));
      });

      xhr.addEventListener('error', () => reject(new Error('Upload failed')));
      xhr.send(file);
    });

    // Step 3: Confirm upload
    const confirmRes = await apiClient.post(
      `/creator/library/sessions/${sessionId}/image/confirm`,
      { storagePath }
    );

    return confirmRes.data.image_url;
  }

  async getSessionLibrary() {
    const res = await apiClient.get('/creator/library/sessions');
    return (res.data || []).map((s) => ({ ...s, id: s.sessionId || s.id }));
  }

  async getLibrarySessionById(_creatorId, sessionId) {
    const res = await apiClient.get(`/creator/library/sessions/${sessionId}`);
    return res.data;
  }

  async createLibrarySession(_creatorId, sessionData) {
    const payload = { title: sessionData.title };
    if (sessionData.image_url) payload.image_url = sessionData.image_url;
    const res = await apiClient.post('/creator/library/sessions', payload);
    return res.data;
  }

  async updateLibrarySession(_creatorId, sessionId, updates) {
    const res = await apiClient.patch(`/creator/library/sessions/${sessionId}`, updates);
    return res.data;
  }

  async deleteLibrarySession(_creatorId, sessionId) {
    await apiClient.delete(`/creator/library/sessions/${sessionId}`);
  }

  async addExerciseToLibrarySession(_creatorId, sessionId, exerciseData) {
    const res = await apiClient.post(`/creator/library/sessions/${sessionId}/exercises`, exerciseData);
    return res.data;
  }

  async propagateLibrarySession(sessionId, mode = 'all') {
    const res = await apiClient.post(`/creator/library/sessions/${sessionId}/propagate`, { mode });
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
    const orderVal = order ?? 0;
    const res = await apiClient.post(
      `/creator/library/sessions/${sessionId}/exercises/${exerciseId}/sets`,
      {
        title: `Serie ${orderVal + 1}`,
        order: orderVal,
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
