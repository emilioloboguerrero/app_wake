import apiClient from '../utils/apiClient';
import { getWeekDates, getConsecutiveWeekKeys } from '../utils/weekCalculation';

class ClientProgramService {
  async assignProgramToClient(programId, clientId) {
    const res = await apiClient.post(`/creator/clients/${clientId}/programs/${programId}`, {
      expiresAt: null,
    });
    return res.data;
  }

  async getClientProgram(programId, clientId) {
    const res = await apiClient.get(`/creator/clients/${clientId}/programs`);
    const programs = res.data || [];
    return programs.find((p) => p.courseId === programId) ?? null;
  }

  async getClientProgramsForProgram(programId) {
    const res = await apiClient.get('/creator/clients', {
      params: { programId },
    });
    const clients = res.data || [];
    return clients.map((c) => ({
      clientId: c.userId,
      ...c.enrolledProgram,
    }));
  }

  async deleteClientProgram(programId, clientId) {
    await apiClient.delete(`/creator/clients/${clientId}/programs/${programId}`);
  }

  async setClientProgramAccessEndDate(clientId, programId, expiresAt) {
    await apiClient.post(`/creator/clients/${clientId}/programs/${programId}`, {
      expiresAt: expiresAt ?? null,
    });
  }

  async assignPlanToWeek(programId, clientId, planId, weekKey, moduleIndex = 0) {
    const res = await apiClient.put(
      `/creator/clients/${clientId}/programs/${programId}/schedule/${weekKey}`,
      {
        planId,
        moduleId: null,
        moduleIndex,
      }
    );
    return res.data;
  }

  async assignPlanToConsecutiveWeeks(programId, clientId, planId, startWeekKey) {
    const plansService = (await import('./plansService')).default;
    const modules = await plansService.getModulesByPlan(planId);
    if (!modules?.length) {
      throw new Error('Este plan no tiene semanas.');
    }
    const weekKeys = getConsecutiveWeekKeys(startWeekKey, modules.length);
    await Promise.all(
      weekKeys.map((wk, i) =>
        apiClient.put(`/creator/clients/${clientId}/programs/${programId}/schedule/${wk}`, {
          planId,
          moduleId: modules[i].id ?? null,
          moduleIndex: i,
        })
      )
    );
    return { weekKeys };
  }

  async removePlanFromWeek(programId, clientId, weekKey) {
    await apiClient.delete(
      `/creator/clients/${clientId}/programs/${programId}/schedule/${weekKey}`
    );
  }

  async removePlanEntirely(programId, clientId, planId) {
    const clientProgramRes = await apiClient.get(`/creator/clients/${clientId}/programs`);
    const programs = clientProgramRes.data || [];
    const program = programs.find((p) => p.courseId === programId);
    if (!program) return [];
    const planAssignments = program.planAssignments || {};
    const weekKeysToRemove = Object.keys(planAssignments).filter(
      (wk) => planAssignments[wk]?.planId === planId
    );
    if (!weekKeysToRemove.length) return [];
    await Promise.all(
      weekKeysToRemove.map((wk) =>
        apiClient.delete(`/creator/clients/${clientId}/programs/${programId}/schedule/${wk}`)
      )
    );
    return weekKeysToRemove;
  }

  async getClientCompletedSessionIds(programId, clientId) {
    const res = await apiClient.get(`/creator/clients/${clientId}/sessions`, {
      params: { courseId: programId },
    });
    const sessions = res.data || [];
    return new Set(sessions.map((s) => s.sessionId));
  }

  async getClientSessionHistory(programId, clientId) {
    const res = await apiClient.get(`/creator/clients/${clientId}/sessions`, {
      params: { courseId: programId },
    });
    return res.data || [];
  }

  async bulkReassignPrograms(programId, clientIds) {
    await Promise.all(
      clientIds.map((clientId) =>
        apiClient.post(`/creator/clients/${clientId}/programs/${programId}`, { expiresAt: null })
      )
    );
  }
}

export default new ClientProgramService();
