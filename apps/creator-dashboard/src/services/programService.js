import apiClient from '../utils/apiClient';

class ProgramService {
  async getProgramsByCreator() {
    const res = await apiClient.get('/creator/programs');
    return res.data;
  }

  async getProgramById(programId) {
    const res = await apiClient.get(`/creator/programs/${programId}`);
    return res.data;
  }

  async createProgram(_creatorId, _creatorName, programData) {
    const res = await apiClient.post('/creator/programs', {
      title: programData.title || '',
      description: programData.description || null,
      imageUrl: programData.imageUrl || null,
      discipline: programData.discipline || null,
      deliveryType: programData.deliveryType || 'low_ticket',
    });
    return res.data;
  }

  async updateProgram(programId, updates) {
    const res = await apiClient.patch(`/creator/programs/${programId}`, updates);
    return res.data;
  }

  async releaseProgram(programId) {
    const res = await apiClient.patch(`/creator/programs/${programId}/status`, { status: 'published' });
    return res.data;
  }

  async deleteProgram(programId) {
    await apiClient.delete(`/creator/programs/${programId}`);
  }

  async duplicateProgram(programId, title = null) {
    const res = await apiClient.post(`/creator/programs/${programId}/duplicate`, { title });
    return res.data;
  }

  async uploadProgramImage(programId, imageFile, onProgress = null) {
    const contentType = imageFile.type || 'image/jpeg';
    const urlRes = await apiClient.post(`/creator/programs/${programId}/image/upload-url`, { contentType });
    const { uploadUrl, storagePath } = urlRes.data;

    await new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('PUT', uploadUrl);
      xhr.setRequestHeader('Content-Type', contentType);
      if (onProgress) {
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) onProgress((e.loaded / e.total) * 100);
        };
      }
      xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`Upload failed: ${xhr.status}`)));
      xhr.onerror = () => reject(new Error('Upload network error'));
      xhr.send(imageFile);
    });

    const confirmRes = await apiClient.post(`/creator/programs/${programId}/image/confirm`, { storagePath });
    return confirmRes.data.imageUrl;
  }

  async deleteProgramImage(programId) {
    await apiClient.patch(`/creator/programs/${programId}`, { image_url: null, image_path: null });
  }

  async deleteProgramIntroVideo(_programId, _videoUrl) {
    // Storage cleanup not implemented yet — Firestore field is nulled by the subsequent updateProgram() call
  }

  async deleteTutorialVideo(_programId, _screenKey, _videoURL) {
    // Storage cleanup not implemented yet — tutorials map is updated by the subsequent updateProgram() call
  }

  getWeekCount(programData) {
    if (!programData) return 0;
    if (programData.modules && Array.isArray(programData.modules)) {
      return programData.modules.length;
    }
    return 0;
  }

  async getModulesByProgram(programId) {
    const res = await apiClient.get(`/creator/programs/${programId}/modules`);
    const modules = res.data || [];
    const withSessions = await Promise.all(
      modules.map(async (mod) => {
        const sessRes = await apiClient.get(
          `/creator/programs/${programId}/modules/${mod.id}/sessions`
        );
        return { ...mod, sessions: sessRes.data || [] };
      })
    );
    return withSessions;
  }

  async createModule(programId, moduleName) {
    const existing = await this.getModulesByProgram(programId);
    const order = existing.length;
    const res = await apiClient.post(`/creator/programs/${programId}/modules`, {
      title: `Semana ${order + 1}`,
      order,
    });
    return res.data;
  }

  async deleteModule(programId, moduleId) {
    await apiClient.delete(`/creator/programs/${programId}/modules/${moduleId}`);
  }

  async updateModuleOrder(programId, moduleOrders) {
    await Promise.all(
      moduleOrders.map(({ moduleId, order }) =>
        apiClient.patch(`/creator/programs/${programId}/modules/${moduleId}`, {
          title: `Semana ${order + 1}`,
          order,
        })
      )
    );
  }

  async getSessionsByModule(programId, moduleId) {
    const res = await apiClient.get(`/creator/programs/${programId}/modules/${moduleId}/sessions`);
    return res.data;
  }

  async createSession(programId, moduleId, sessionName, order = null, imageUrl = null, librarySessionRef = null, dayIndex = null) {
    const body = {
      title: sessionName || 'Sesion',
      order: order ?? 0,
    };
    if (librarySessionRef) body.librarySessionRef = librarySessionRef;
    if (imageUrl) body.image_url = imageUrl;
    if (dayIndex != null) body.dayIndex = dayIndex;
    const res = await apiClient.post(
      `/creator/programs/${programId}/modules/${moduleId}/sessions`,
      body
    );
    return res.data;
  }

  async createSessionFromLibrary(programId, moduleId, librarySessionRef, order = null, imageUrl = null, dayIndex = null) {
    const body = {
      title: 'Sesion',
      order: order ?? 0,
      librarySessionRef,
    };
    if (imageUrl) body.image_url = imageUrl;
    if (dayIndex != null) body.dayIndex = dayIndex;
    const res = await apiClient.post(
      `/creator/programs/${programId}/modules/${moduleId}/sessions`,
      body
    );
    return res.data;
  }

  async updateSession(programId, moduleId, sessionId, updates) {
    const res = await apiClient.patch(
      `/creator/programs/${programId}/modules/${moduleId}/sessions/${sessionId}`,
      updates
    );
    return res.data;
  }

  async deleteSession(programId, moduleId, sessionId) {
    await apiClient.delete(`/creator/programs/${programId}/modules/${moduleId}/sessions/${sessionId}`);
  }

  async updateSessionOrder(programId, moduleId, sessionOrders) {
    await Promise.all(
      sessionOrders.map(({ sessionId, order }) =>
        apiClient.patch(`/creator/programs/${programId}/modules/${moduleId}/sessions/${sessionId}`, { order })
      )
    );
  }

  async moveSession(programId, fromModuleId, toModuleId, sessionId, toSlotIndex) {
    const sessions = await this.getSessionsByModule(programId, fromModuleId);
    const session = sessions.find((s) => s.id === sessionId);
    if (!session) throw new Error('Sesion no encontrada');
    const body = {
      title: session.title,
      order: toSlotIndex,
    };
    if (session.librarySessionRef) body.librarySessionRef = session.librarySessionRef;
    if (session.image_url) body.image_url = session.image_url;
    if (toSlotIndex != null) body.dayIndex = toSlotIndex;
    const created = await apiClient.post(
      `/creator/programs/${programId}/modules/${toModuleId}/sessions`,
      body
    );
    await apiClient.delete(`/creator/programs/${programId}/modules/${fromModuleId}/sessions/${sessionId}`);
    return created.data;
  }

  async getExercisesBySession(programId, moduleId, sessionId) {
    const res = await apiClient.get(
      `/creator/programs/${programId}/modules/${moduleId}/sessions/${sessionId}/exercises`
    );
    return res.data || [];
  }

  async getSessionById(programId, moduleId, sessionId) {
    const sessions = await this.getSessionsByModule(programId, moduleId);
    const session = sessions.find((s) => s.id === sessionId) || null;
    if (!session) return null;
    const exercises = await this.getExercisesBySession(programId, moduleId, sessionId);
    return { ...session, exercises };
  }

  async createExercise(programId, moduleId, sessionId, exerciseName, order = null) {
    const res = await apiClient.post(
      `/creator/programs/${programId}/modules/${moduleId}/sessions/${sessionId}/exercises`,
      {
        name: exerciseName.trim(),
        primaryMuscles: [],
        order: order ?? 0,
      }
    );
    return res.data;
  }

  async updateExercise(programId, moduleId, sessionId, exerciseId, updates) {
    const res = await apiClient.patch(
      `/creator/programs/${programId}/modules/${moduleId}/sessions/${sessionId}/exercises/${exerciseId}`,
      updates
    );
    return res.data;
  }

  async deleteExercise(programId, moduleId, sessionId, exerciseId) {
    await apiClient.delete(
      `/creator/programs/${programId}/modules/${moduleId}/sessions/${sessionId}/exercises/${exerciseId}`
    );
  }

  async updateExerciseOrder(programId, moduleId, sessionId, exerciseOrders) {
    await Promise.all(
      exerciseOrders.map(({ exerciseId, order }) =>
        apiClient.patch(
          `/creator/programs/${programId}/modules/${moduleId}/sessions/${sessionId}/exercises/${exerciseId}`,
          { order }
        )
      )
    );
  }

  async getSetsByExercise(programId, moduleId, sessionId, exerciseId) {
    const exercises = await this.getExercisesBySession(programId, moduleId, sessionId);
    const exercise = exercises.find((e) => e.exerciseId === exerciseId || e.id === exerciseId);
    return exercise?.sets || [];
  }

  async createSet(programId, moduleId, sessionId, exerciseId, order = null) {
    const res = await apiClient.post(
      `/creator/programs/${programId}/modules/${moduleId}/sessions/${sessionId}/exercises/${exerciseId}/sets`,
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

  async updateSet(programId, moduleId, sessionId, exerciseId, setId, updates) {
    const res = await apiClient.patch(
      `/creator/programs/${programId}/modules/${moduleId}/sessions/${sessionId}/exercises/${exerciseId}/sets/${setId}`,
      updates
    );
    return res.data;
  }

  async deleteSet(programId, moduleId, sessionId, exerciseId, setId) {
    await apiClient.delete(
      `/creator/programs/${programId}/modules/${moduleId}/sessions/${sessionId}/exercises/${exerciseId}/sets/${setId}`
    );
  }

  async assignProgramToClient(programId, userId) {
    const { default: clientProgramService } = await import('./clientProgramService');
    return clientProgramService.assignProgramToClient(programId, userId);
  }

  async getClientProgram(programId, userId) {
    const { default: clientProgramService } = await import('./clientProgramService');
    return clientProgramService.getClientProgram(programId, userId);
  }

  async getClientProgramsForProgram(programId) {
    const { default: clientProgramService } = await import('./clientProgramService');
    return clientProgramService.getClientProgramsForProgram(programId);
  }

  async bulkReassignPrograms(programId, clientIds) {
    const { default: clientProgramService } = await import('./clientProgramService');
    return clientProgramService.bulkReassignPrograms(programId, clientIds);
  }
}

export default new ProgramService();
