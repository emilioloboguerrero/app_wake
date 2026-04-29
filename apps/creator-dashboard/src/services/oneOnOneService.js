import apiClient from '../utils/apiClient';

class OneOnOneService {
  async lookupUserByEmailOrUsername(emailOrUsername) {
    const res = await apiClient.post('/creator/clients/lookup', {
      emailOrUsername: emailOrUsername.trim(),
    });
    // API returns { found: bool, userId?, displayName?, username?, emailMasked? }
    // (audit M-45). Earlier shape was null on miss / full record on hit; existing
    // call sites still expect a falsy return on miss and an object on hit.
    const data = res.data;
    if (!data || data.found !== true) return null;
    return data;
  }

  async getClientsByCreator() {
    const res = await apiClient.get('/creator/clients');
    return res.data;
  }

  async addClient(_creatorId, clientUserId) {
    const res = await apiClient.post('/creator/clients', {
      userId: clientUserId,
    });
    return res.data;
  }

  async addClientByEmail(email) {
    const res = await apiClient.post('/creator/clients/invite', { email });
    return res.data;
  }

  // C-10 v2: returns { client, assignment } so the caller can differentiate
  // pending (invite sent, program will apply on accept) vs active assignments.
  async addClientToProgram(_creatorId, clientUserId, programId) {
    const client = await this.addClient(_creatorId, clientUserId);
    const clientProgramService = (await import('./clientProgramService')).default;
    const assignment = await clientProgramService.assignProgramToClient(programId, clientUserId);
    return { client, assignment };
  }

  // C-10 v2: re-send a declined invite. Server caps at 2 total resends.
  // Returns { id, status: 'pending', resendCount, resendsRemaining }.
  async resendInvite(clientId) {
    const res = await apiClient.post(`/creator/clients/${clientId}/resend-invite`);
    return res.data;
  }

  // List declined invites for the rejected-invitations section.
  async getDeclinedInvites() {
    const res = await apiClient.get('/creator/clients', {
      params: { status: 'declined' },
    });
    return res.data || [];
  }

  async getClientById(clientId, { userId } = {}) {
    const params = userId ? { userId } : undefined;
    const res = await apiClient.get(`/creator/clients/${clientId}`, { params });
    return res.data;
  }

  async deleteClient(clientId) {
    await apiClient.delete(`/creator/clients/${clientId}`);
  }

  async addCourseToClient(_creatorId, clientUserId, programId) {
    const clientProgramService = (await import('./clientProgramService')).default;
    await clientProgramService.assignProgramToClient(programId, clientUserId);
  }

  async removeCourseFromClient(_creatorId, clientUserId, programId) {
    const clientProgramService = (await import('./clientProgramService')).default;
    await clientProgramService.deleteClientProgram(programId, clientUserId);
  }

  async getClientUserData(clientId) {
    const res = await apiClient.get(`/creator/clients/${clientId}`);
    const d = res.data;
    return {
      name: d.displayName || '',
      username: d.username || '',
      email: d.email || '',
      age: d.age ?? null,
      gender: d.gender || '',
      country: d.country || '',
      city: d.city || '',
      height: d.height ?? null,
      initialWeight: d.weight ?? null,
    };
  }
}

export default new OneOnOneService();
