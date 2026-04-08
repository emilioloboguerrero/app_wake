import apiClient from '../utils/apiClient';
import clientSessionContentService from './clientSessionContentService';

class ClientSessionService {
  async removeSessionsForDateAndProgram(clientId, programId, date) {
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);
    const sessions = await this.getClientSessions(clientId, startOfDay, endOfDay);
    const toDelete = sessions.filter((s) => s.program_id === programId);
    const results = await Promise.allSettled(
      toDelete.map((s) => apiClient.delete(`/creator/clients/${clientId}/client-sessions/${s.id}`))
    );
    const failures = results.filter((r) => r.status === 'rejected');
    if (failures.length > 0) {
      console.error(`[clientSessionService] removeSessionsForDateAndProgram: ${failures.length}/${toDelete.length} deletions failed`);
      if (failures.length === toDelete.length) throw failures[0].reason;
    }
  }

  async deleteClientSessionsForWeek(clientId, programId, weekKey, excludeCompletedIds = null) {
    const { getWeekDates } = await import('../utils/weekCalculation');
    const { start, end } = getWeekDates(weekKey);
    const startDate = new Date(start);
    startDate.setHours(0, 0, 0, 0);
    const endDate = new Date(end);
    endDate.setHours(23, 59, 59, 999);
    const sessions = await this.getClientSessions(clientId, startDate, endDate);
    let toDelete = sessions.filter((s) => s.program_id === programId);
    if (excludeCompletedIds && excludeCompletedIds.size > 0) {
      toDelete = toDelete.filter((s) => !excludeCompletedIds.has(s.id));
    }
    for (const s of toDelete) {
      try {
        await clientSessionContentService.deleteClientSessionContent(s.id);
      } catch (err) {
        console.error('[clientSessionService] deleteClientSessionsForWeek: could not delete content for', s.id, err?.message);
      }
      await apiClient.delete(`/creator/clients/${clientId}/client-sessions/${s.id}`);
    }
  }

  async assignSessionToDate(clientId, programId, planId, sessionId, date, moduleId = null, metadata = {}) {
    await this.removeSessionsForDateAndProgram(clientId, programId, date);

    const dateStr = this.formatDateForStorage(date);
    const sessionDate = new Date(date);
    sessionDate.setHours(0, 0, 0, 0);

    const clientSessionData = {
      client_id: clientId,
      program_id: programId,
      plan_id: planId ?? null,
      session_id: sessionId,
      module_id: moduleId ?? null,
      date: dateStr,
      date_timestamp: sessionDate.toISOString(),
      ...metadata,
    };

    const clientSessionId = `${clientId}_${dateStr}_${sessionId}`;
    await apiClient.put(`/creator/clients/${clientId}/client-sessions/${clientSessionId}`, clientSessionData);
    return clientSessionId;
  }

  async getClientSessionById(clientSessionId) {
    if (!clientSessionId || !clientSessionId.includes('_')) {
      throw new Error('Invalid session ID format');
    }
    const parts = clientSessionId.split('_');
    const clientId = parts[0];
    try {
      const res = await apiClient.get(`/creator/clients/${clientId}/client-sessions/${clientSessionId}`);
      return res.data ?? null;
    } catch (error) {
      if (error?.status === 404) return null;
      console.error('[clientSessionService] getClientSessionById:', error);
      throw error;
    }
  }

  async getClientSessions(clientId, startDate = null, endDate = null) {
    if (!startDate || !endDate) {
      const now = new Date();
      startDate = new Date(now.getFullYear(), now.getMonth(), 1);
      endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    }
    startDate = new Date(startDate);
    endDate = new Date(endDate);
    startDate.setHours(0, 0, 0, 0);
    endDate.setHours(23, 59, 59, 999);

    const params = {
      startDate: this.formatDateForStorage(startDate),
      endDate: this.formatDateForStorage(endDate),
    };

    const res = await apiClient.get(`/creator/clients/${clientId}/client-sessions`, { params });
    return res.data ?? [];
  }

  async getSessionForDate(clientId, date) {
    const sessions = await this.getClientSessions(clientId, date, date);
    return sessions.length > 0 ? sessions[0] : null;
  }

  async removeSessionFromDate(clientId, date, sessionId = null) {
    const dateStr = this.formatDateForStorage(date);
    if (sessionId) {
      const clientSessionId = `${clientId}_${dateStr}_${sessionId}`;
      await apiClient.delete(`/creator/clients/${clientId}/client-sessions/${clientSessionId}`);
    } else {
      const session = await this.getSessionForDate(clientId, date);
      if (session?.id) {
        await apiClient.delete(`/creator/clients/${clientId}/client-sessions/${session.id}`);
      }
    }
  }

  async updateSessionMetadata(sessionId, metadata) {
    // sessionId is the composite id clientId_date_sessionId
    const parts = sessionId.split('_');
    const clientId = parts[0];
    await apiClient.patch(`/creator/clients/${clientId}/client-sessions/${sessionId}`, metadata);
  }

  async getSessionsForProgram(clientId, programId) {
    const res = await apiClient.get(`/creator/clients/${clientId}/client-sessions`, {
      params: { programId },
    });
    return res.data ?? [];
  }

  formatDateForStorage(date) {
    const d = new Date(date);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  parseDateFromStorage(dateStr) {
    const [year, month, day] = dateStr.split('-').map(Number);
    return new Date(year, month - 1, day);
  }
}

export default new ClientSessionService();
