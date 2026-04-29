import apiClient from '../utils/apiClient';

class ClientProgramService {
  // Returns { status: 'active' | 'pending', pending?, assignedAt?, message? }.
  // Pending happens when the user hasn't accepted the relationship yet —
  // the program attaches to the invite and applies on accept (C-10 v2).
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

  // Fetch the most recent sessionHistory doc matching a planned session slot id.
  // Used by SessionPerformanceModal to compare planned vs performed for a slot.
  async getSessionHistoryDoc(clientId, sessionId) {
    if (!clientId || !sessionId) return null;
    try {
      const res = await apiClient.get(`/creator/clients/${clientId}/sessions`, {
        params: { sessionId },
      });
      const list = res.data || [];
      // The list endpoint returns recent sessionHistory docs. Filter by sessionId
      // and return the most recent match.
      const match = list.find((d) => d.sessionId === sessionId) || list[0] || null;
      return match;
    } catch (err) {
      // 404 / no match — modal handles null gracefully
      return null;
    }
  }

  async bulkReassignPrograms(programId, clientIds) {
    await Promise.all(
      clientIds.map((clientId) =>
        apiClient.post(`/creator/clients/${clientId}/programs/${programId}`, { expiresAt: null })
      )
    );
  }

  // ── Plan assignment (server does full deep copy) ─────────────

  async getCalendar(clientId, programId, month) {
    const res = await apiClient.get(
      `/creator/clients/${clientId}/programs/${programId}/calendar`,
      { params: { month } }
    );
    return res.data;
  }

  async assignPlan(programId, clientId, planId, startWeekKey) {
    const res = await apiClient.post(
      `/creator/clients/${clientId}/programs/${programId}/assign-plan`,
      { planId, startWeekKey }
    );
    return res.data;
  }

  async removePlan(programId, clientId, planId) {
    const res = await apiClient.delete(
      `/creator/clients/${clientId}/programs/${programId}/remove-plan/${planId}`
    );
    return res.data;
  }
}

export default new ClientProgramService();
